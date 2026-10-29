import { describe, expect, it } from "vitest";
import { db, makeMaterial, makeUser, makeVehicle, newRef } from "./helpers";
import { addDays, berlinToday, toDateInput } from "@/lib/format";
import { checklistForVehicle, getCheck, performCheck } from "@/server/services/checks";
import { materialsForCheck } from "@/server/services/check-materials";
import { createVehicleStock, listMaterials } from "@/server/services/materials";
import { CATALOG_ITEMS, importMaterialCatalog } from "../prisma/material-catalog";

async function setup() {
  const admin = await makeUser("ADMIN");
  const user = await makeUser("USER", { canPerformChecks: true });
  const v = await makeVehicle();
  await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
  const today = berlinToday();
  const plain = await makeMaterial({ name: "Mullbinde" });
  const dated = await makeMaterial({ name: "Venenverweilkanüle", batchTracked: true });
  const device = await db.material.update({ where: { id: (await makeMaterial({ name: "Absaugpumpe" })).id }, data: { isEquipment: true } });
  const sPlain = await createVehicleStock(admin, v.id, { materialId: plain.id, targetQuantity: 5, minQuantity: 0, compartment: "Fach 1" }, { quantity: 5 });
  const sDated = await createVehicleStock(
    admin,
    v.id,
    { materialId: dated.id, targetQuantity: 4, minQuantity: 0, compartment: "Notfallrucksack" },
    { batches: [{ expiryDate: addDays(today, -10), quantity: 2 }, { expiryDate: addDays(today, 300), quantity: 2 }] },
  );
  const sDevice = await createVehicleStock(admin, v.id, { materialId: device.id, targetQuantity: 1, minQuantity: 0, compartment: "Fach 1" }, { quantity: 1 });
  const { checklist } = await checklistForVehicle(user, v.id);
  const results = checklist!.items.map((i) => ({ itemId: i.id, result: "OK" }));
  return { admin, user, v, today, sPlain, sDated, sDevice, checklist: checklist!, results };
}

describe("Materialkatalog", () => {
  it("importiert den Standardkatalog idempotent, Morphin als BtM mit Verfallsdatum", async () => {
    const first = await importMaterialCatalog(db);
    expect(first.total).toBe(CATALOG_ITEMS.length);
    expect(first.created).toBeGreaterThan(250);
    const again = await importMaterialCatalog(db);
    expect(again.created).toBe(0);
    const morphin = await db.material.findFirstOrThrow({ where: { name: "Morphin 10 mg/1 ml" }, include: { category: true } });
    expect(morphin).toMatchObject({ isNarcotic: true, batchTracked: true });
    expect(morphin.category.isMedication).toBe(true);
    expect((await db.material.findFirstOrThrow({ where: { name: "Absaugpumpe" } })).isEquipment).toBe(true);
    expect((await db.material.findFirstOrThrow({ where: { name: "Venenverweilkanüle 18 G (grün)" } })).batchTracked).toBe(true);
  });
});

describe("Materialprüfung bei der Fahrzeugkontrolle", () => {
  it("zeigt die Beladung Fach für Fach und verlangt für jede Position ein Ergebnis", async () => {
    const { user, v, checklist, results, sPlain } = await setup();
    const { stocks } = await materialsForCheck(user, v.id);
    expect(stocks.map((s) => s.compartment)).toEqual(["Fach 1", "Fach 1", "Notfallrucksack"]);
    await expect(
      performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results, materials: [{ stockId: sPlain.id, status: "OK" }], materialsLoadedAt: new Date().toISOString() }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("bucht Abweichungen, entnimmt Abgelaufenes, erfasst neue Verfallsdaten und meldet defekte Geräte", async () => {
    const { user, v, checklist, results, sPlain, sDated, sDevice, today } = await setup();
    const batches = await db.materialBatch.findMany({ where: { vehicleStockId: sDated.id }, orderBy: { expiryDate: "asc" } });
    const [expired, valid] = batches;
    const ref = newRef();
    const payload = {
      checklistId: checklist.id,
      checkType: "ROUTINE",
      results,
      clientRef: ref,
      materialsLoadedAt: new Date().toISOString(),
      materials: [
        { stockId: sPlain.id, status: "DEVIATION", counted: "3", note: "verbraucht" },
        {
          stockId: sDated.id,
          status: "DEVIATION",
          batches: [
            { batchId: expired.id, counted: "2", expiredRemoved: true },
            { batchId: valid.id, counted: "2" },
          ],
          newBatches: [{ expiryDate: toDateInput(addDays(today, 500)), batchNumber: "", quantity: "1" }],
        },
        { stockId: sDevice.id, status: "DEFECT", note: "Akku lädt nicht" },
      ],
    };
    const { check, defectIds } = await performCheck(user, v.id, payload);
    expect(check.outcome).toBe("DEFECTS");
    expect(defectIds).toHaveLength(1);

    const plain = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sPlain.id } });
    const dated = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sDated.id }, include: { batches: true } });
    expect(plain.currentQuantity).toBe(3);
    expect(dated.currentQuantity).toBe(3); // 2 gültig + 1 neu, 2 abgelaufene entnommen
    expect(dated.batches.find((b) => b.id === expired.id)!.quantity).toBe(0);
    expect(dated.batches.some((b) => b.batchNumber === null && b.quantity === 1 && b.id !== expired.id && b.id !== valid.id)).toBe(true);

    const writeOff = await db.stockMovement.findFirstOrThrow({ where: { fromVehicleStockId: sDated.id, type: "WRITE_OFF" } });
    expect(writeOff).toMatchObject({ reason: "EXPIRED", quantity: -2 });

    // Fehlmengen stehen auf der Nachfüllliste (genau eine aktive Anforderung je Position)
    const refills = await db.refillRequest.findMany({ where: { vehicleId: v.id, status: "OPEN" } });
    expect(refills.find((r) => r.vehicleStockId === sPlain.id)?.requestedQuantity).toBe(2);
    expect(refills.find((r) => r.vehicleStockId === sDated.id)?.requestedQuantity).toBe(1);

    const detail = await getCheck(user, check.id);
    const byName = Object.fromEntries(detail.materialResults.map((m) => [m.vehicleStockId, m]));
    expect(byName[sPlain.id]).toMatchObject({ status: "DEVIATION", previousQuantity: 5, countedQuantity: 3 });
    expect(byName[sDated.id]).toMatchObject({ status: "DEVIATION", previousQuantity: 4, countedQuantity: 3, expiredRemoved: 2 });
    expect(byName[sDevice.id]).toMatchObject({ status: "DEFECT" });
    expect((await db.defect.findUniqueOrThrow({ where: { id: defectIds[0] } })).title).toContain("defekt");

    // Ergebnisse sind revisionssicher
    await expect(db.vehicleCheckMaterialResult.update({ where: { id: byName[sPlain.id].id }, data: { countedQuantity: 5 } })).rejects.toThrow();

    // Offline-Synchronisation doppelt gesendet → keine Doppelbuchung
    const dup = await performCheck(user, v.id, payload);
    expect(dup.duplicate).toBe(true);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sPlain.id } })).currentQuantity).toBe(3);
  });

  it("„Stimmt“ bucht nichts und vermerkt die Prüfung", async () => {
    const { user, v, checklist, results, sPlain, sDated, sDevice } = await setup();
    const materials = [sPlain, sDated, sDevice].map((s) => ({ stockId: s.id, status: "OK" }));
    const { check } = await performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results, materials, materialsLoadedAt: new Date().toISOString() });
    expect(check.outcome).toBe("OK");
    const moves = await db.stockMovement.count({ where: { OR: [{ fromVehicleStockId: sPlain.id }, { toVehicleStockId: sPlain.id }], note: { contains: "Fahrzeugkontrolle" } } });
    expect(moves).toBe(0);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sPlain.id } })).lastCheckedAt).not.toBeNull();
  });
});

describe("Betäubungsmittel (BtM)", () => {
  it("sind nur mit BtM-Recht sichtbar und verlangen eine Chargennummer", async () => {
    const { admin, user, v, checklist, results, sPlain, sDated, sDevice } = await setup();
    await db.setting.upsert({ where: { key: "medicationsEnabled" }, create: { key: "medicationsEnabled", value: true }, update: { value: true } });
    try {
      const cat = await db.materialCategory.findFirstOrThrow({ where: { isMedication: true } });
      const btm = await db.material.create({ data: { name: `Morphin Test ${newRef()}`, categoryId: cat.id, unit: "Ampulle", batchTracked: true, isNarcotic: true } });

      await expect(
        createVehicleStock(admin, v.id, { materialId: btm.id, targetQuantity: 2, minQuantity: 0, compartment: "BtM-Fach" }, { batches: [{ expiryDate: addDays(berlinToday(), 200), quantity: 2 }] }),
      ).rejects.toMatchObject({ code: "VALIDATION", message: expect.stringContaining("ist die Chargennummer Pflicht") });
      const sBtm = await createVehicleStock(
        admin,
        v.id,
        { materialId: btm.id, targetQuantity: 2, minQuantity: 0, compartment: "BtM-Fach" },
        { batches: [{ batchNumber: "M-123", expiryDate: addDays(berlinToday(), 200), quantity: 2 }] },
      );

      // Helfer ohne BtM-Recht: nicht sichtbar, Kontrolle ohne BtM möglich
      const forUser = await materialsForCheck(user, v.id);
      expect(forUser.stocks.some((s) => s.id === sBtm.id)).toBe(false);
      expect(forUser.hiddenNarcotics).toBe(1);
      expect((await listMaterials(user)).some((m) => m.id === btm.id)).toBe(false);
      const materials = [sPlain, sDated, sDevice].map((s) => ({ stockId: s.id, status: "OK" }));
      await performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results, materials, materialsLoadedAt: new Date().toISOString() });

      // KFZ-Wart mit BtM-Recht: sichtbar; neue Stücke ohne Chargennummer werden abgelehnt
      const wart = await makeUser("FLEET_MANAGER");
      await db.vehicleAssignment.create({ data: { userId: wart.id, vehicleId: v.id } });
      const forWart = await materialsForCheck(wart, v.id);
      expect(forWart.stocks.some((s) => s.id === sBtm.id)).toBe(true);
      const all = [...[sPlain, sDated, sDevice].map((s) => ({ stockId: s.id, status: "OK" }))];
      await expect(
        performCheck(wart, v.id, {
          checklistId: checklist.id,
          checkType: "ROUTINE",
          results,
          materialsLoadedAt: new Date().toISOString(),
          materials: [...all, { stockId: sBtm.id, status: "DEVIATION", batches: [], newBatches: [{ expiryDate: toDateInput(addDays(berlinToday(), 100)), batchNumber: "", quantity: "1" }] }],
        }),
      ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { [`mat_${sBtm.id}`]: "Chargennummer ist bei BtM Pflicht" } });
      // mit Chargennummer wird gebucht
      await performCheck(wart, v.id, {
        checklistId: checklist.id,
        checkType: "ROUTINE",
        results,
        materialsLoadedAt: new Date().toISOString(),
        materials: [...all, { stockId: sBtm.id, status: "DEVIATION", batches: [], newBatches: [{ expiryDate: toDateInput(addDays(berlinToday(), 100)), batchNumber: "M-777", quantity: "1" }] }],
      });
      expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sBtm.id } })).currentQuantity).toBe(3);
    } finally {
      await db.setting.update({ where: { key: "medicationsEnabled" }, data: { value: false } });
    }
  });
});

describe("Materialkatalog wieder entfernen", () => {
  it("zeigt zuerst nur an, löscht dann Unbenutztes und archiviert Verwendetes", async () => {
    const { removeMaterialCatalog } = await import("../prisma/materialkatalog-entfernen");
    await importMaterialCatalog(db);
    const admin = await makeUser("ADMIN");
    const v = await makeVehicle();
    const used = await db.material.findFirstOrThrow({ where: { name: "Dreiecktuch" } });
    await createVehicleStock(admin, v.id, { materialId: used.id, targetQuantity: 2, minQuantity: 0, compartment: "Fach 1" }, { quantity: 2 });

    // Probelauf ändert nichts
    const dry = await removeMaterialCatalog(db, { execute: false, categories: ["Verbandmaterial"] });
    expect(dry.archived).toBe(1);
    expect(await db.material.count({ where: { name: "Mullbinde 8 cm" } })).toBe(1);

    // nur eine Kategorie
    const r = await removeMaterialCatalog(db, { execute: true, categories: ["Verbandmaterial"] });
    expect(r.deleted).toBe(dry.deleted);
    expect(await db.material.count({ where: { name: "Mullbinde 8 cm" } })).toBe(0);
    expect((await db.material.findUniqueOrThrow({ where: { id: used.id } })).archived).toBe(true);
    expect(await db.material.count({ where: { name: "Adrenalin 1 mg/1 ml" } })).toBe(1);

    // alles; leere Katalog-Kategorien verschwinden, Basiskategorien bleiben
    await removeMaterialCatalog(db, { execute: true });
    expect(await db.material.count({ where: { name: "Adrenalin 1 mg/1 ml" } })).toBe(0);
    expect(await db.materialCategory.count({ where: { name: "Trauma und Immobilisation" } })).toBe(0);
    expect(await db.materialCategory.count({ where: { name: "Verbandmaterial" } })).toBe(1);
    expect(await db.vehicleMaterialStock.count({ where: { materialId: used.id } })).toBe(1);

    await expect(removeMaterialCatalog(db, { execute: false, categories: ["Gibtsnicht"] })).rejects.toThrow("Unbekannte Kategorie");
  });
});

describe("Ersteinrichtung der Beladung", () => {
  it("neue Position ohne Bestand erzeugt keine Nachfüllung; der Check gleicht die Nachfüllliste ab", async () => {
    const { admin, user, v, checklist, results, sPlain, sDated, sDevice } = await setup();
    const m = await makeMaterial({ name: "Kompresse" });
    const fresh = await createVehicleStock(admin, v.id, { materialId: m.id, targetQuantity: 10, minQuantity: 0, compartment: "Fach 1" });
    expect(await db.refillRequest.count({ where: { vehicleStockId: fresh.id } })).toBe(0);
    const materials = [sPlain, sDated, sDevice].map((s) => ({ stockId: s.id, status: "OK" }));
    await performCheck(user, v.id, {
      checklistId: checklist.id,
      checkType: "ROUTINE",
      results,
      materialsLoadedAt: new Date().toISOString(),
      materials: [...materials, { stockId: fresh.id, status: "DEVIATION", counted: "7" }],
    });
    const r = await db.refillRequest.findFirstOrThrow({ where: { vehicleStockId: fresh.id, status: "OPEN" } });
    expect(r.requestedQuantity).toBe(3);
  });
});

describe("„Vollständig“ bei der Kontrolle (Soll-Menge vorhanden)", () => {
  it("bucht bei neu eingerichteten Positionen die Soll-Menge und entfernt falsche Nachfüllanforderungen", async () => {
    const { admin, user, v, checklist, results, sPlain, sDated, sDevice } = await setup();
    const handschuhe = await makeMaterial({ name: "Handschuhe" });
    const kanuelen = await makeMaterial({ name: "Kanüle", batchTracked: true });
    // Ersteinrichtung: Soll angelegt, noch nichts gebucht
    const sH = await createVehicleStock(admin, v.id, { materialId: handschuhe.id, targetQuantity: 4, minQuantity: 0, compartment: "Fach 1" });
    const sK = await createVehicleStock(admin, v.id, { materialId: kanuelen.id, targetQuantity: 6, minQuantity: 0, compartment: "Fach 1" });
    const base = [sPlain, sDated, sDevice].map((s) => ({ stockId: s.id, status: "OK" }));
    const run = (materials: unknown[]) =>
      performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results, materialsLoadedAt: new Date().toISOString(), materials: [...base, ...materials] });

    // Altzustand nachstellen: falsch erzeugte Nachfüllanforderung (Soll 4, gebucht 0)
    await db.refillRequest.create({ data: { vehicleId: v.id, vehicleStockId: sH.id, materialId: handschuhe.id, requestedQuantity: 4, reason: "Fahrzeugkontrolle", reportedById: user.id } });

    // Material mit Verfallsdatum: „Vollständig“ ohne Verfallsdatum wird abgelehnt
    await expect(run([{ stockId: sH.id, status: "OK" }, { stockId: sK.id, status: "OK" }])).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { [`mat_${sK.id}`]: expect.stringContaining("Verfallsdatum") } });

    await run([
      { stockId: sH.id, status: "OK" },
      { stockId: sK.id, status: "DEVIATION", batches: [], newBatches: [{ expiryDate: toDateInput(addDays(berlinToday(), 400)), batchNumber: "", quantity: "6" }] },
    ]);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sH.id } })).currentQuantity).toBe(4);
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: sK.id } })).currentQuantity).toBe(6);
    // keine offene Nachfüllung mehr – die falsche wurde automatisch storniert
    expect(await db.refillRequest.count({ where: { vehicleStockId: { in: [sH.id, sK.id] }, status: "OPEN" } })).toBe(0);
    expect((await db.refillRequest.findFirstOrThrow({ where: { vehicleStockId: sH.id } })).status).toBe("CANCELLED");
    const res = await db.vehicleCheckMaterialResult.findFirstOrThrow({ where: { vehicleStockId: sH.id } });
    expect(res).toMatchObject({ status: "OK", previousQuantity: 0, countedQuantity: 4 });
  });
});
