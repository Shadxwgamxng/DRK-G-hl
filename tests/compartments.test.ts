import { describe, expect, it } from "vitest";
import { db, makeMaterial, makeUser, makeVehicle } from "./helpers";
import { createVehicleStock, deactivateVehicleStock, listVehicleStock, updateVehicleStock } from "@/server/services/materials";
import { copyLoadout, createCompartment, deleteCompartment, listCompartments, migrateLegacyCompartments, splitCompartmentText, updateCompartment } from "@/server/services/compartments";
import { materialsForCheck } from "@/server/services/check-materials";

async function setup() {
  const admin = await makeUser("ADMIN");
  const v = await makeVehicle("KTW");
  const schrank = await createCompartment(admin, v.id, { name: "Ausziehschrank", kind: "DRAWER" });
  const fach1 = await createCompartment(admin, v.id, { name: "Fach 1", parentId: schrank.id });
  const fach2 = await createCompartment(admin, v.id, { name: "Fach 2", parentId: schrank.id });
  const rucksack = await createCompartment(admin, v.id, { name: "Notfallrucksack", kind: "BACKPACK" });
  return { admin, v, schrank, fach1, fach2, rucksack };
}

describe("Schränke und Fächer im Fahrzeug", () => {
  it("legt Schrank → Fach an, ein Material darf in mehreren Fächern liegen, im selben Fach nur einmal", async () => {
    const { admin, v, schrank, fach1, fach2, rucksack } = await setup();
    const tree = await listCompartments(admin, v.id);
    expect(tree.map((c) => c.name)).toEqual(["Ausziehschrank", "Notfallrucksack"]);
    expect(tree[0].children.map((f) => f.name)).toEqual(["Fach 1", "Fach 2"]);
    expect(tree[1].kind).toBe("BACKPACK");

    const handschuhe = await makeMaterial({ name: "Handschuhe" });
    const a = await createVehicleStock(admin, v.id, { materialId: handschuhe.id, targetQuantity: 2, minQuantity: 0, compartmentId: fach1.id }, { quantity: 2 });
    await createVehicleStock(admin, v.id, { materialId: handschuhe.id, targetQuantity: 1, minQuantity: 0, compartmentId: rucksack.id }, { quantity: 1 });
    await expect(createVehicleStock(admin, v.id, { materialId: handschuhe.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach1.id })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: a.id } })).compartment).toBe("Ausziehschrank › Fach 1");

    // umbenennen aktualisiert die Anzeige, Fach verschieben
    await updateCompartment(admin, schrank.id, { name: "Auszug links", kind: "DRAWER" });
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: a.id } })).compartment).toBe("Auszug links › Fach 1");
    await updateCompartment(admin, fach1.id, { name: "Fach 1", parentId: rucksack.id });
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: a.id } })).compartment).toBe("Notfallrucksack › Fach 1");

    // Position in anderes Fach verschieben
    await updateVehicleStock(admin, a.id, { targetQuantity: 2, minQuantity: 0, compartmentId: fach2.id });
    expect((await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: a.id } })).compartmentId).toBe(fach2.id);
  });

  it("erlaubt nur zwei Ebenen, keine fremden Lagerorte und löscht nur leere Lagerorte", async () => {
    const { admin, v, schrank, fach1 } = await setup();
    await expect(createCompartment(admin, v.id, { name: "Unterfach", parentId: fach1.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createCompartment(admin, v.id, { name: "fach 1", parentId: schrank.id })).rejects.toMatchObject({ code: "VALIDATION" });
    // Datenbank-Schutz auch ohne Anwendungslogik
    await expect(db.vehicleCompartment.create({ data: { vehicleId: v.id, parentId: fach1.id, name: "Ebene 3" } })).rejects.toThrow();

    const other = await makeVehicle("MTW");
    const m = await makeMaterial();
    await expect(createVehicleStock(admin, other.id, { materialId: m.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach1.id })).rejects.toMatchObject({ code: "VALIDATION" });

    const s = await createVehicleStock(admin, v.id, { materialId: m.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach1.id });
    await expect(deleteCompartment(admin, schrank.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteCompartment(admin, fach1.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await deactivateVehicleStock(admin, s.id);
    await deleteCompartment(admin, fach1.id);
    expect(await db.vehicleCompartment.count({ where: { id: fach1.id } })).toBe(0);
  });

  it("Kontrolle folgt der Reihenfolge im Fahrzeug: Schrank für Schrank, Fach für Fach", async () => {
    const { admin, v, fach1, fach2, rucksack } = await setup();
    const [a, b, c, d] = await Promise.all([makeMaterial({ name: "A" }), makeMaterial({ name: "B" }), makeMaterial({ name: "C" }), makeMaterial({ name: "D" })]);
    await createVehicleStock(admin, v.id, { materialId: a.id, targetQuantity: 1, minQuantity: 0 });
    await createVehicleStock(admin, v.id, { materialId: b.id, targetQuantity: 1, minQuantity: 0, compartmentId: rucksack.id });
    await createVehicleStock(admin, v.id, { materialId: c.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach2.id });
    await createVehicleStock(admin, v.id, { materialId: d.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach1.id });
    const { stocks } = await materialsForCheck(admin, v.id);
    expect(stocks.map((s) => s.compartment)).toEqual(["Ausziehschrank › Fach 1", "Ausziehschrank › Fach 2", "Notfallrucksack", null]);
  });

  it("übernimmt Freitext-Fächer und kopiert die Beladung auf ein zweites Fahrzeug (ohne Bestand)", async () => {
    expect(splitCompartmentText("Notfallrucksack – Fach Zugang")).toEqual(["Notfallrucksack", "Fach Zugang"]);
    expect(splitCompartmentText("Schrank 2, Fach B")).toEqual(["Schrank 2", "Fach B"]);
    expect(splitCompartmentText("Medikamentenschrank – BtM-Fach")).toEqual(["Medikamentenschrank", "BtM-Fach"]);
    expect(splitCompartmentText("Heckfach")).toEqual(["Heckfach", null]);

    const admin = await makeUser("ADMIN");
    const v1 = await makeVehicle("N-KTW 1");
    const m = await makeMaterial({ name: "Mullbinde" });
    // Altdaten: nur Freitext, kein Lagerort
    const old = await db.vehicleMaterialStock.create({ data: { vehicleId: v1.id, materialId: m.id, targetQuantity: 6, compartment: "Notfallrucksack – Fach Verband", currentQuantity: 6 } });
    await migrateLegacyCompartments();
    const migrated = await db.vehicleMaterialStock.findUniqueOrThrow({ where: { id: old.id }, include: { compartmentRef: { include: { parent: true } } } });
    expect(migrated.compartment).toBe("Notfallrucksack › Fach Verband");
    expect(migrated.compartmentRef?.parent?.kind).toBe("BACKPACK");

    const v2 = await makeVehicle("N-KTW 2");
    const r = await copyLoadout(admin, v1.id, v2.id);
    expect(r).toMatchObject({ compartments: 2, positions: 1 });
    const copied = await listVehicleStock(admin, v2.id);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ targetQuantity: 6, currentQuantity: 0, compartment: "Notfallrucksack › Fach Verband" });
    expect(await db.refillRequest.count({ where: { vehicleId: v2.id } })).toBe(0);
    // erneut kopieren legt nichts doppelt an
    expect(await copyLoadout(admin, v1.id, v2.id)).toMatchObject({ compartments: 0, positions: 0 });
  });
});

describe("Beschreibung von Schränken und Fächern", () => {
  it("speichert, behält und kopiert den Ortshinweis und zeigt ihn beim Check", async () => {
    const admin = await makeUser("ADMIN");
    const v = await makeVehicle("RTW");
    const schrank = await createCompartment(admin, v.id, { name: "Seitenschrank", kind: "CABINET", description: "Patientenraum links, unter der Arbeitsfläche" });
    const fach = await createCompartment(admin, v.id, { name: "Fach 2", parentId: schrank.id, description: "hinter den Infusionen" });
    expect(fach.description).toBe("hinter den Infusionen");
    // ohne Beschreibung im Aufruf bleibt sie erhalten, leer mitgeschickt wird sie entfernt
    await updateCompartment(admin, fach.id, { name: "Fach 2", parentId: schrank.id });
    expect((await db.vehicleCompartment.findUniqueOrThrow({ where: { id: fach.id } })).description).toBe("hinter den Infusionen");
    await updateCompartment(admin, fach.id, { name: "Fach 2", parentId: schrank.id, description: "rechts hinten" });
    expect((await db.vehicleCompartment.findUniqueOrThrow({ where: { id: fach.id } })).description).toBe("rechts hinten");

    const m = await makeMaterial();
    await createVehicleStock(admin, v.id, { materialId: m.id, targetQuantity: 1, minQuantity: 0, compartmentId: fach.id });
    const { stocks } = await materialsForCheck(admin, v.id);
    expect(stocks[0].compartmentRef?.description).toBe("rechts hinten");
    expect(stocks[0].compartmentRef?.parent?.description).toBe("Patientenraum links, unter der Arbeitsfläche");

    const v2 = await makeVehicle("RTW 2");
    await copyLoadout(admin, v.id, v2.id);
    const copied = await db.vehicleCompartment.findFirstOrThrow({ where: { vehicleId: v2.id, name: "Fach 2" } });
    expect(copied.description).toBe("rechts hinten");

    await updateCompartment(admin, fach.id, { name: "Fach 2", parentId: schrank.id, description: "" });
    expect((await db.vehicleCompartment.findUniqueOrThrow({ where: { id: fach.id } })).description).toBeNull();
  });
});
