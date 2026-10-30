import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, makeMaterial, makeUser, makeVehicle } from "./helpers";
import { addDays, berlinToday, toDateInput } from "@/lib/format";
import { createVehicleStock } from "@/server/services/materials";
import { consumptionLink, publicConsumptionForm, submitPublicConsumption } from "@/server/services/consumption";

const setFlag = (value: boolean) => db.setting.upsert({ where: { key: "qrConsumptionEnabled" }, create: { key: "qrConsumptionEnabled", value }, update: { value } });

describe("Testfunktion: Verbrauch per QR-Code melden", () => {
  beforeAll(() => setFlag(true));
  afterAll(() => setFlag(false));

  async function setup() {
    const admin = await makeUser("ADMIN");
    const v = await makeVehicle("N-KTW");
    const t = berlinToday();
    const komp = await makeMaterial({ name: "Kompresse" });
    const vvk = await makeMaterial({ name: "VVK", batchTracked: true });
    const geraet = await db.material.update({ where: { id: (await makeMaterial({ name: "Absaugpumpe" })).id }, data: { isEquipment: true } });
    const sK = await createVehicleStock(admin, v.id, { materialId: komp.id, targetQuantity: 10, minQuantity: 0, compartment: "Rucksack – Fach Verband" }, { quantity: 10 });
    const sV = await createVehicleStock(admin, v.id, { materialId: vvk.id, targetQuantity: 4, minQuantity: 0, compartment: "Rucksack – Fach Zugang" }, { batches: [{ expiryDate: addDays(t, 400), quantity: 2 }, { expiryDate: addDays(t, 60), quantity: 2 }] });
    const sG = await createVehicleStock(admin, v.id, { materialId: geraet.id, targetQuantity: 1, minQuantity: 0, compartment: "Heckraum" }, { quantity: 1 });
    const token = await consumptionLink(admin, v.id);
    return { admin, v, sK, sV, sG, token, t };
  }

  it("bucht gemeldeten Verbrauch (früheste Verfallsdaten zuerst) und füllt die Nachfüllliste", async () => {
    const { v, sK, sV, sG, token, t } = await setup();
    const form = await publicConsumptionForm(token);
    expect(form.vehicle.name).toBe(v.name);
    expect(form.items.map((i) => i.stockId).sort()).toEqual([sK.id, sV.id].sort()); // Geräte nicht meldbar
    expect(JSON.stringify(form)).not.toContain("currentQuantity");

    const res = await submitPublicConsumption(
      token,
      { occasion: "Sanitätsdienst", occurredOn: toDateInput(t), reporterName: "Lena Schmidt", items: [{ stockId: sK.id, quantity: 3 }, { stockId: sV.id, quantity: 1 }] },
      "203.0.113.5",
    );
    expect(res.lines).toHaveLength(2);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sK.id } })).currentQuantity).toBe(7);
    const batches = await db.materialBatch.findMany({ where: { vehicleStockId: sV.id }, orderBy: { expiryDate: "asc" } });
    expect(batches.map((b) => b.quantity)).toEqual([1, 2]); // die früher ablaufende Charge wurde belastet
    const refills = await db.refillRequest.findMany({ where: { vehicleId: v.id, status: "OPEN" } });
    expect(refills.find((r) => r.vehicleStockId === sK.id)?.requestedQuantity).toBe(3);
    expect(refills.find((r) => r.vehicleStockId === sV.id)?.requestedQuantity).toBe(1);
    const mv = await db.stockMovement.findFirstOrThrow({ where: { fromVehicleStockId: sK.id, type: "WRITE_OFF" } });
    expect(mv).toMatchObject({ reason: "USED" });
    expect(mv.note).toContain("QR-Meldung Sanitätsdienst");
    expect(await db.consumptionReport.count({ where: { vehicleId: v.id } })).toBe(1);

    // Geräte, fremde Positionen, Bot-Feld und Datum in der Zukunft werden abgelehnt
    await expect(submitPublicConsumption(token, { occasion: "Einsatz", occurredOn: toDateInput(t), reporterName: "X", items: [{ stockId: sG.id, quantity: 1 }] }, "203.0.113.6")).rejects.toMatchObject({ code: "VALIDATION" });
    const other = await makeVehicle("MTW");
    const admin2 = await makeUser("ADMIN");
    const fremd = await createVehicleStock(admin2, other.id, { materialId: (await makeMaterial()).id, targetQuantity: 1, minQuantity: 0 }, { quantity: 1 });
    await expect(submitPublicConsumption(token, { occasion: "Einsatz", occurredOn: toDateInput(t), reporterName: "X", items: [{ stockId: fremd.id, quantity: 1 }] }, "203.0.113.7")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(submitPublicConsumption(token, { occasion: "Einsatz", occurredOn: toDateInput(t), reporterName: "Bot", website: "spam", items: [{ stockId: sK.id, quantity: 1 }] }, "203.0.113.8")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(submitPublicConsumption(token, { occasion: "Einsatz", occurredOn: toDateInput(addDays(t, 2)), reporterName: "X", items: [{ stockId: sK.id, quantity: 1 }] }, "203.0.113.9")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("begrenzt Meldungen je Absender und macht alte QR-Codes beim Erneuern ungültig", async () => {
    const { admin, v, sK, token, t } = await setup();
    const send = () => submitPublicConsumption(token, { occasion: "Übung", occurredOn: toDateInput(t), reporterName: "Test", items: [{ stockId: sK.id, quantity: 1 }] }, "198.51.100.1");
    for (let i = 0; i < 6; i++) await send();
    await expect(send()).rejects.toMatchObject({ code: "CONFLICT" });

    const neu = await consumptionLink(admin, v.id, true);
    expect(neu).not.toBe(token);
    await expect(publicConsumptionForm(token)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(publicConsumptionForm(neu)).resolves.toBeTruthy();
  });

  it("ist ohne Freischaltung nicht erreichbar", async () => {
    const { token } = await setup();
    await setFlag(false);
    await expect(publicConsumptionForm(token)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setFlag(true);
  });
});
