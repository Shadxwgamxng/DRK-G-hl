import { describe, expect, it } from "vitest";
import { db, makeMaterial, makeUser, makeVehicle, newRef } from "./helpers";
import { addDays, berlinToday } from "@/lib/format";
import { correctVehicleStock, createVehicleStock, listVehicleStock, updateVehicleStock, writeOffMaterial } from "@/server/services/materials";
import { confirmRefill, listRefills, provideRefill, startRefill } from "@/server/services/refills";
import { receiveStock, warehouseMovement } from "@/server/services/warehouse";

async function scenario(opts: { batchTracked?: boolean } = {}) {
  const admin = await makeUser("ADMIN");
  const user = await makeUser("USER");
  const lager = await makeUser("WAREHOUSE");
  const v = await makeVehicle();
  await db.vehicleAssignment.createMany({ data: [{ userId: user.id, vehicleId: v.id }, { userId: lager.id, vehicleId: v.id }] });
  const material = await makeMaterial({ batchTracked: opts.batchTracked });
  const location = await db.storageLocation.findFirstOrThrow({ where: { name: "Regal 3" }, include: { warehouse: true } });
  return { admin, user, lager, v, material, location };
}

describe("Material austragen und Nachfüllliste (Abnahme 8–12)", () => {
  it("8+9+10) abgelaufene Charge wird korrekt ausgetragen, Nachfüllbedarf mit Lagerort entsteht", async () => {
    const { admin, user, lager, v, material, location } = await scenario({ batchTracked: true });
    const today = berlinToday();
    const expired = addDays(today, -3);
    const valid = addDays(today, 200);
    // Beispiel aus der Anforderung: Soll 10, vorhanden 8 (6 gültig + 2 abgelaufen)
    const stock = await createVehicleStock(
      admin,
      v.id,
      { materialId: material.id, targetQuantity: 10, minQuantity: 8, compartment: "Schrank 2, Fach B", refillLocationId: location.id },
      { batches: [{ batchNumber: "ALT-1", expiryDate: expired, quantity: 2 }, { batchNumber: "NEU-7", expiryDate: valid, quantity: 6 }] },
    );
    // Anfangsbestand < Soll → bereits eine Anforderung über 2
    let refills = await db.refillRequest.findMany({ where: { vehicleStockId: stock.id } });
    expect(refills).toHaveLength(1);
    expect(refills[0].requestedQuantity).toBe(2);

    const [line] = await listVehicleStock(user, v.id);
    expect(line.expiredQty).toBe(2);
    const oldBatch = line.batches.find((b) => b.batchNumber === "ALT-1")!;
    const newBatch = line.batches.find((b) => b.batchNumber === "NEU-7")!;

    await writeOffMaterial(user, { stockId: stock.id, quantity: 2, reason: "EXPIRED", batchId: oldBatch.id, note: "bei Kontrolle festgestellt" });

    const after = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id }, include: { batches: true } });
    expect(after.currentQuantity).toBe(6);
    expect(after.batches.find((b) => b.id === oldBatch.id)!.quantity).toBe(0);
    expect(after.batches.find((b) => b.id === newBatch.id)!.quantity).toBe(6); // 12) andere Charge unberührt

    // genau EINE aktive Anforderung, Menge = Soll − Ist = 4 (keine Doppelmeldung)
    refills = await db.refillRequest.findMany({ where: { vehicleStockId: stock.id, status: { in: ["OPEN", "IN_PROGRESS", "PROVIDED"] } } });
    expect(refills).toHaveLength(1);
    expect(refills[0].requestedQuantity).toBe(4);

    const movement = await db.stockMovement.findFirstOrThrow({ where: { fromVehicleStockId: stock.id, type: "WRITE_OFF" } });
    expect(movement).toMatchObject({ quantity: -2, reason: "EXPIRED", batchNumber: "ALT-1", userId: user.id });

    // 10) Nachfüllliste zeigt Lagerort
    const list = await listRefills(lager, { vehicleId: v.id });
    expect(list[0].vehicleStock.refillLocation?.name).toBe("Regal 3");
    expect(list[0].vehicleStock.compartment).toBe("Schrank 2 › Fach B") // Freitext wird in Schrank › Fach übernommen;
  });

  it("verhindert, dass eine fremde oder falsche Charge belastet wird", async () => {
    const { admin, user, v, material } = await scenario({ batchTracked: true });
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 5, minQuantity: 0 }, { batches: [{ batchNumber: "A", expiryDate: addDays(berlinToday(), 30), quantity: 5 }] });
    await expect(writeOffMaterial(user, { stockId: stock.id, quantity: 1, reason: "EXPIRED" })).rejects.toMatchObject({ fieldErrors: { batchId: expect.any(String) } });
    await expect(writeOffMaterial(user, { stockId: stock.id, quantity: 1, reason: "EXPIRED", batchId: "fremd" })).rejects.toMatchObject({ code: "VALIDATION" });
    const [line] = await listVehicleStock(user, v.id);
    await expect(writeOffMaterial(user, { stockId: stock.id, quantity: 6, reason: "USED", batchId: line.batches[0].id })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("11) bestätigte Nachfüllung aus dem Lager aktualisiert Fahrzeug- und Lagerbestand", async () => {
    const { admin, user, lager, v, material, location } = await scenario({ batchTracked: true });
    const exp = addDays(berlinToday(), 400);
    await receiveStock(lager, { materialId: material.id, locationId: location.id, quantity: 20, batchNumber: "L-99", expiryDate: exp });
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 10, minQuantity: 8, refillLocationId: location.id }, { batches: [{ batchNumber: "V-1", expiryDate: exp, quantity: 10 }] });
    const [line] = await listVehicleStock(user, v.id);
    await writeOffMaterial(user, { stockId: stock.id, quantity: 3, reason: "USED", batchId: line.batches[0].id });

    const req = await db.refillRequest.findFirstOrThrow({ where: { vehicleStockId: stock.id, status: "OPEN" } });
    expect(req.requestedQuantity).toBe(3);
    await startRefill(lager, req.id);
    const ws = await db.warehouseStock.findFirstOrThrow({ where: { materialId: material.id }, include: { batches: true } });
    await provideRefill(lager, req.id, { items: [{ warehouseStockId: ws.id, batchId: ws.batches[0].id, quantity: 3 }] });
    // Bestand wird erst nach Bestätigung erhöht
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id } })).currentQuantity).toBe(7);
    expect((await db.warehouseStock.findUniqueOrThrow({ where: { id: ws.id } })).quantity).toBe(17);

    // Tatsächlich nur 2 eingeräumt → 1 zurück ins Lager, Restbedarf 1 als neue Anforderung
    const { followUp } = await confirmRefill(user.permissions.has("refills.confirm") ? user : lager, req.id, { quantity: 2 });
    const s = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id }, include: { batches: true } });
    expect(s.currentQuantity).toBe(9);
    expect(s.batches.find((b) => b.batchNumber === "L-99")?.quantity).toBe(2);
    expect((await db.warehouseStock.findUniqueOrThrow({ where: { id: ws.id } })).quantity).toBe(18);
    expect((await db.refillRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("REFILLED");
    expect(followUp?.requestedQuantity).toBe(1);

    // Historie bleibt erhalten, Bewegungen sind lückenlos
    const types = (await db.stockMovement.findMany({ where: { refillRequestId: req.id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
    expect(types).toEqual(["PROVISION", "REFILL", "RETURN"]);
    await expect(db.stockMovement.updateMany({ where: { refillRequestId: req.id }, data: { quantity: 99 } })).rejects.toThrow();
  });

  it("Nachfüllung ohne Lagerbereitstellung verlangt Chargenangaben und bucht korrekt", async () => {
    const { admin, user, v, material } = await scenario({ batchTracked: false });
    const fm = await makeUser("FLEET_MANAGER");
    await db.vehicleAssignment.create({ data: { userId: fm.id, vehicleId: v.id } });
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 4, minQuantity: 1 }, { quantity: 4 });
    await writeOffMaterial(user, { stockId: stock.id, quantity: 4, reason: "LOST" });
    const req = await db.refillRequest.findFirstOrThrow({ where: { vehicleStockId: stock.id, status: "OPEN" } });
    await expect(confirmRefill(user, req.id, { quantity: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const res = await confirmRefill(fm, req.id, { quantity: 4 });
    expect(res.followUp).toBeNull();
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id } })).currentQuantity).toBe(4);
    await expect(confirmRefill(fm, req.id, { quantity: 4 })).rejects.toMatchObject({ code: "CONFLICT" }); // keine Doppelbuchung
  });

  it("Sollbestandsänderung passt die offene Anforderung an statt eine neue anzulegen", async () => {
    const { admin, v, material } = await scenario();
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 5, minQuantity: 1 }, { quantity: 3 });
    await updateVehicleStock(admin, stock.id, { targetQuantity: 8, minQuantity: 1 });
    const reqs = await db.refillRequest.findMany({ where: { vehicleStockId: stock.id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].requestedQuantity).toBe(5);
    await correctVehicleStock(admin, { stockId: stock.id, countedQuantity: 8, note: "Inventur" });
    expect((await db.refillRequest.findUniqueOrThrow({ where: { id: reqs[0].id } })).status).toBe("CANCELLED");
  });

  it("15) gleichzeitige Austragungen führen nicht zu inkonsistenten Beständen", async () => {
    const { admin, v, material } = await scenario();
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser("USER")));
    await db.vehicleAssignment.createMany({ data: users.map((u) => ({ userId: u.id, vehicleId: v.id })) });
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 10, minQuantity: 2 }, { quantity: 5 });
    const results = await Promise.allSettled(users.map((u) => writeOffMaterial(u, { stockId: stock.id, quantity: 1, reason: "USED" })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(5);
    const s = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id } });
    expect(s.currentQuantity).toBe(0);
    const movements = await db.stockMovement.aggregate({ where: { OR: [{ fromVehicleStockId: stock.id }, { toVehicleStockId: stock.id }] }, _sum: { quantity: true } });
    expect(movements._sum.quantity).toBe(0); // +5 Anfangsbestand −5 Austragungen
    const active = await db.refillRequest.findMany({ where: { vehicleStockId: stock.id, status: { in: ["OPEN", "IN_PROGRESS", "PROVIDED"] } } });
    expect(active).toHaveLength(1);
    expect(active[0].requestedQuantity).toBe(10);
  });

  it("15b) gleichzeitige Lagerentnahmen überziehen den Lagerbestand nicht", async () => {
    const { lager, material, location } = await scenario();
    await receiveStock(lager, { materialId: material.id, locationId: location.id, quantity: 3 });
    const ws = await db.warehouseStock.findFirstOrThrow({ where: { materialId: material.id } });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => warehouseMovement(lager, { warehouseStockId: ws.id, quantity: 1, mode: "ISSUE", reason: "USED" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await db.warehouseStock.findUniqueOrThrow({ where: { id: ws.id } })).quantity).toBe(0);
  });

  it("Offline-Austragung mit clientRef wird nicht doppelt gebucht", async () => {
    const { admin, user, v, material } = await scenario();
    const stock = await createVehicleStock(admin, v.id, { materialId: material.id, targetQuantity: 5, minQuantity: 1 }, { quantity: 5 });
    const ref = newRef();
    await writeOffMaterial(user, { stockId: stock.id, quantity: 2, reason: "USED", clientRef: ref });
    const again = await writeOffMaterial(user, { stockId: stock.id, quantity: 2, reason: "USED", clientRef: ref });
    expect(again.duplicate).toBe(true);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: stock.id } })).currentQuantity).toBe(3);
  });
});
