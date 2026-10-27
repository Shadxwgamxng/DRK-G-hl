import { describe, expect, it } from "vitest";
import { db, makeUser } from "./helpers";
import { FLEET_GOEHL, importFleet } from "../prisma/fleet-goehl";
import { createVehicle, updateVehicle } from "@/server/services/vehicles";

describe("Fahrzeugbestand DRK OV Göhl", () => {
  it("importiert alle Fahrzeuge einmalig und überschreibt keine späteren Änderungen", async () => {
    const first = await importFleet(db);
    expect(first.created).toBe(FLEET_GOEHL.length);
    const rtw = await db.vehicle.findUniqueOrThrow({ where: { internalNumber: "42/83-01" } });
    expect(rtw.radioCallSign).toBe("Rotkreuz Ostholstein 42/83-01");
    expect(rtw.licensePlate).toBeNull();
    const nktw = await db.vehicle.findUniqueOrThrow({ where: { internalNumber: "42/90-01" }, include: { type: true } });
    expect(nktw).toMatchObject({ licensePlate: "OH-KS 8002", manufacturer: "Mercedes-Benz" });
    expect(nktw.type.name).toBe("N-KTW");

    await db.vehicle.update({ where: { id: nktw.id }, data: { name: "N-KTW 1 (umbenannt)" } });
    const second = await importFleet(db);
    expect(second.created).toBe(0);
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: nktw.id } })).name).toBe("N-KTW 1 (umbenannt)");
  });

  it("Kennzeichen ist optional und kann wieder geleert werden", async () => {
    const admin = await makeUser("ADMIN");
    const type = await db.vehicleType.findFirstOrThrow();
    const v = await createVehicle(admin, { name: "Feldkochherd Test", internalNumber: "FKH-TEST", licensePlate: "", typeId: type.id, checkIntervalDays: "30" });
    expect(v.licensePlate).toBeNull();
    await updateVehicle(admin, v.id, { name: "Feldkochherd Test", internalNumber: "FKH-TEST", licensePlate: "oh-fk 1", typeId: type.id, checkIntervalDays: "30", remarks: "x" });
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).licensePlate).toBe("OH-FK 1");
    await updateVehicle(admin, v.id, { name: "Feldkochherd Test", internalNumber: "FKH-TEST", licensePlate: "", typeId: type.id, checkIntervalDays: "30", remarks: "" });
    const after = await db.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.licensePlate).toBeNull();
    expect(after.remarks).toBeNull();
  });
});
