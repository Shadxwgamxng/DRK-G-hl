/**
 * DEMO-MODUS: legt klar gekennzeichnete Beispieldaten an.
 * Läuft nur mit DEMO_MODE=true und nur in einer leeren bzw. bereits als Demo markierten Datenbank,
 * damit Demo- und Produktivdaten niemals vermischt werden.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadActor } from "../src/server/auth/session";
import { importFleet } from "./fleet-goehl";
import { createInspection } from "../src/server/services/inspections";
import { createMaterial, createVehicleStock, writeOffMaterial, listVehicleStock } from "../src/server/services/materials";
import { receiveStock } from "../src/server/services/warehouse";
import { createDefect } from "../src/server/services/defects";
import { checklistForVehicle, performCheck } from "../src/server/services/checks";
import { addDays, berlinToday, toDateInput } from "../src/lib/format";

const db = new PrismaClient();
const DEMO_PASSWORD = "Demo-Passwort1";

async function main() {
  if (process.env.DEMO_MODE !== "true") throw new Error("Abbruch: DEMO_MODE=true ist nicht gesetzt.");
  const demoFlag = await db.setting.findUnique({ where: { key: "demoMode" } });
  if ((await db.vehicle.count()) > 0 && demoFlag?.value !== true) throw new Error("Abbruch: Datenbank enthält bereits (Produktiv-)Fahrzeuge. Demo nur in separater Datenbank!");
  if (demoFlag?.value === true && (await db.vehicle.count()) > 0) {
    console.log("Demo-Daten sind bereits vorhanden.");
    return;
  }
  await db.setting.upsert({ where: { key: "demoMode" }, create: { key: "demoMode", value: true }, update: { value: true } });

  const roles = Object.fromEntries((await db.role.findMany()).map((r) => [r.key, r.id]));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const mk = (username: string, firstName: string, lastName: string, role: string, extra: object = {}) =>
    db.user.upsert({
      where: { username },
      update: {},
      create: { username, firstName, lastName, email: `${username}@demo.invalid`, passwordHash: hash, roleId: roles[role], status: "ACTIVE", approvedAt: new Date(), termsAcceptedAt: new Date(), ...extra },
    });
  const admin = await mk("demo.admin", "Anna", "Admin", "ADMIN");
  const wart = await mk("demo.kfzwart", "Klaus", "Wart", "FLEET_MANAGER", { position: "KFZ-Wart", allowMultipleVehicles: true });
  const helfer = await mk("demo.helfer", "Hanna", "Helfer", "USER", { canPerformChecks: true, position: "Rettungssanitäterin" });
  const lager = await mk("demo.lager", "Lars", "Lager", "WAREHOUSE", { allowMultipleVehicles: true });
  await mk("demo.neu", "Nora", "Neu", "USER").then((u) => db.user.update({ where: { id: u.id }, data: { status: "PENDING", approvedAt: null } }));

  const A = (await loadActor(admin.id))!;
  // Echter Fahrzeugbestand des OV Göhl (Stammdaten), ergänzt um fiktive Demo-Vorgänge
  await importFleet(db);
  const byNo = async (n: string) => db.vehicle.findUniqueOrThrow({ where: { internalNumber: n } });
  const rtw = await db.vehicle.update({ where: { id: (await byNo("42/83-01")).id }, data: { mileage: 84210, responsibleUserId: wart.id, location: "DRK OV Göhl, Halle" } });
  const ktw = await db.vehicle.update({ where: { id: (await byNo("42/90-01")).id }, data: { mileage: 122400, responsibleUserId: wart.id } });
  const mtw = await byNo("42/99-01");
  await db.vehicleAssignment.createMany({ data: [rtw, ktw].map((v) => ({ userId: wart.id, vehicleId: v.id })), skipDuplicates: true });
  await db.vehicleAssignment.createMany({ data: [{ userId: helfer.id, vehicleId: rtw.id }, { userId: lager.id, vehicleId: rtw.id }, { userId: lager.id, vehicleId: ktw.id }, { userId: wart.id, vehicleId: mtw.id }], skipDuplicates: true });

  const today = berlinToday();
  const it = Object.fromEntries((await db.inspectionType.findMany()).map((t) => [t.key ?? t.name, t.id]));
  await createInspection(A, rtw.id, { typeId: it.HU, title: "Hauptuntersuchung", dueDate: toDateInput(addDays(today, 12)), intervalValue: 12, intervalUnit: "MONTHS", workshop: "Prüfstelle (Demo)", reminderDays: "30,14,7" });
  await createInspection(A, rtw.id, { typeId: it.SERVICE, title: "Inspektion", dueDate: toDateInput(addDays(today, 60)), intervalValue: 12, intervalUnit: "MONTHS", reminderDays: "30,14" });
  await createInspection(A, ktw.id, { typeId: it.HU, title: "Hauptuntersuchung", dueDate: toDateInput(addDays(today, -3)), intervalValue: 12, intervalUnit: "MONTHS", reminderDays: "30,14,7" });
  await createInspection(A, rtw.id, { typeId: it["Prüfung medizinischer Geräte (STK/MTK)"], title: "Defibrillator – STK", dueDate: toDateInput(addDays(today, 25)), intervalValue: 2, intervalUnit: "YEARS", reminderDays: "30,14,7" });

  const cats = Object.fromEntries((await db.materialCategory.findMany()).map((c) => [c.name, c.id]));
  const infusion = await createMaterial(A, { name: "Infusionslösung (Vollelektrolyt) 500 ml", categoryId: cats["Infusionen und Infusionszubehör"], unit: "Flasche", batchTracked: "on" });
  const kompresse = await createMaterial(A, { name: "Kompresse steril 10×10 cm", categoryId: cats["Verbandmaterial"], unit: "Packung", batchTracked: "on" });
  const handschuhe = await createMaterial(A, { name: "Untersuchungshandschuhe Gr. M", categoryId: cats["Hygiene und Schutzmaterial"], unit: "Box" });
  const lampe = await createMaterial(A, { name: "Handlampe", categoryId: cats["Technische Ausstattung"], unit: "Stück" });

  const loc = Object.fromEntries((await db.storageLocation.findMany()).map((l) => [l.name, l.id]));
  await receiveStock(A, { materialId: infusion.id, locationId: loc["Regal 3"], quantity: 30, batchNumber: "L-2026-11", expiryDate: toDateInput(addDays(today, 400)), minQuantity: 10 });
  await receiveStock(A, { materialId: kompresse.id, locationId: loc["Regal 1"], quantity: 50, batchNumber: "K-88", expiryDate: toDateInput(addDays(today, 20)), minQuantity: 20 });
  await receiveStock(A, { materialId: handschuhe.id, locationId: loc["Regal 2"], quantity: 8, minQuantity: 10 });

  const s1 = await createVehicleStock(A, rtw.id, { materialId: infusion.id, targetQuantity: 10, minQuantity: 8, compartment: "Schrank 2, Fach B", refillLocationId: loc["Regal 3"] }, { batches: [{ batchNumber: "ALT-07", expiryDate: addDays(today, -5), quantity: 2 }, { batchNumber: "L-2026-03", expiryDate: addDays(today, 180), quantity: 6 }] });
  await createVehicleStock(A, rtw.id, { materialId: kompresse.id, targetQuantity: 20, minQuantity: 10, compartment: "Notfallrucksack, Fach 3", refillLocationId: loc["Regal 1"] }, { batches: [{ batchNumber: "K-77", expiryDate: addDays(today, 15), quantity: 20 }] });
  await createVehicleStock(A, rtw.id, { materialId: handschuhe.id, targetQuantity: 4, minQuantity: 2, compartment: "Seitenfach links", refillLocationId: loc["Regal 2"] }, { quantity: 4 });
  await createVehicleStock(A, ktw.id, { materialId: handschuhe.id, targetQuantity: 3, minQuantity: 1, compartment: "Fahrerhaus" }, { quantity: 1 });
  await createVehicleStock(A, mtw.id, { materialId: lampe.id, targetQuantity: 2, minQuantity: 1, compartment: "Heckfach" }, { quantity: 2 });

  const H = (await loadActor(helfer.id))!;
  const [line] = await listVehicleStock(H, rtw.id, { q: "Infusion" });
  void s1;
  await writeOffMaterial(H, { stockId: line.id, quantity: 2, reason: "EXPIRED", batchId: line.batches.find((b) => b.batchNumber === "ALT-07")!.id, note: "Bei Wochenkontrolle festgestellt (Demo)" });

  const { checklist } = await checklistForVehicle(H, rtw.id);
  await performCheck(H, rtw.id, {
    checklistId: checklist!.id,
    checkType: "ROUTINE",
    mileage: "84290",
    results: checklist!.items.map((i, idx) => (idx === 2 ? { itemId: i.id, result: "DEFECT", note: "Rundumkennleuchte hinten rechts flackert", defect: { title: "Rundumkennleuchte flackert", severity: "HIGH", category: "ELECTRICAL" } } : { itemId: i.id, result: "OK" })),
  });
  await createDefect((await loadActor(wart.id))!, { vehicleId: ktw.id, title: "Trage-Fahrgestell: Arretierung hakt", description: "Arretierung rastet nur mit Nachdruck ein (Demo).", category: "MEDICAL_DEVICES", severity: "CRITICAL" });

  console.log("✔ Demo-Daten angelegt. Anmeldung mit Passwort", DEMO_PASSWORD, "für: demo.admin, demo.kfzwart, demo.helfer, demo.lager");
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
