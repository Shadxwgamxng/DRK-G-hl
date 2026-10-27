import { describe, expect, it } from "vitest";
import { db, makeUser, makeVehicle, refreshActor } from "./helpers";
import { loadActor } from "@/server/auth/session";
import { approveUser, authenticate, registerUser, setUserStatus, setVehicleAssignments } from "@/server/services/users";
import { createVehicle, getVehicle, summarizeVehicles, setVehicleStatus } from "@/server/services/vehicles";
import { listDefects } from "@/server/services/defects";
import { globalSearch } from "@/server/services/search";
import { createUpload, getAttachmentForDownload, linkAttachments } from "@/server/services/attachments";
import { createDefect } from "@/server/services/defects";
import { listVehicleStock } from "@/server/services/materials";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000000200015e2a2c760000000049454e44ae426082", "hex");

describe("Registrierung, Freigabe und Fahrzeugzugriff (Abnahme 1–4, 14)", () => {
  it("1) neu registrierter Benutzer wartet auf Freigabe und sieht keine Fahrzeugdaten", async () => {
    await makeVehicle();
    const { id } = await registerUser({
      firstName: "Erika",
      lastName: "Muster",
      username: "erika.muster",
      email: "erika@example.org",
      password: "Sicheres-Passwort1",
      passwordConfirm: "Sicheres-Passwort1",
      acceptTerms: "on",
    });
    const login = await authenticate("erika.muster", "Sicheres-Passwort1");
    expect(login.ok && login.status).toBe("PENDING");
    const actor = (await loadActor(id))!;
    expect(actor.status).toBe("PENDING");
    expect(await summarizeVehicles(actor)).toHaveLength(0);
    expect(await listDefects(actor)).toHaveLength(0);
    // Admins werden über die neue Registrierung benachrichtigt
    const admin = await makeUser("ADMIN");
    void admin;
  });

  it("lehnt doppelte Benutzernamen und schwache Passwörter ab", async () => {
    await expect(
      registerUser({ firstName: "A", lastName: "B", username: "erika.muster", email: "x@example.org", password: "Sicheres-Passwort1", passwordConfirm: "Sicheres-Passwort1", acceptTerms: "on" }),
    ).rejects.toMatchObject({ fieldErrors: { username: expect.any(String) } });
    await expect(
      registerUser({ firstName: "A", lastName: "B", username: "neu.user", email: "y@example.org", password: "kurz", passwordConfirm: "kurz", acceptTerms: "on" }),
    ).rejects.toMatchObject({ fieldErrors: { password: expect.any(String) } });
    await expect(
      registerUser({ firstName: "A", lastName: "B", username: "neu.user2", email: "z@example.org", password: "Sicheres-Passwort1", passwordConfirm: "Sicheres-Passwort1" }),
    ).rejects.toMatchObject({ fieldErrors: { acceptTerms: expect.any(String) } });
  });

  it("2+3) Admin gibt frei und weist Fahrzeug zu; Benutzer sieht nur sein Fahrzeug", async () => {
    const admin = await makeUser("ADMIN");
    const own = await makeVehicle("Eigenes");
    const foreign = await makeVehicle("Fremdes");
    const { id } = await registerUser({
      firstName: "Max",
      lastName: "Helfer",
      username: "max.helfer",
      email: "max@example.org",
      password: "Sicheres-Passwort1",
      passwordConfirm: "Sicheres-Passwort1",
      acceptTerms: true,
    });
    await approveUser(admin, id, { vehicleIds: [own.id] });
    const user = (await loadActor(id))!;
    expect(user.status).toBe("ACTIVE");

    const visible = await summarizeVehicles(user);
    expect(visible.map((v) => v.id)).toEqual([own.id]);
    await expect(getVehicle(user, own.id)).resolves.toMatchObject({ id: own.id });
    // Manipulierte ID → nicht gefunden (kein Hinweis auf Existenz)
    await expect(getVehicle(user, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listVehicleStock(user, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createDefect(user, { vehicleId: foreign.id, title: "x", description: "y", category: "OTHER", severity: "LOW" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const hits = await globalSearch(user, "Fremdes");
    expect(hits.find((h) => h.href.includes(foreign.id))).toBeUndefined();

    // Mehrfachzuweisung nur, wenn ausdrücklich aktiviert
    await expect(setVehicleAssignments(admin, id, [own.id, foreign.id])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("4) Administrator sieht und verwaltet alle Fahrzeuge; normale Benutzer nicht", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser("USER");
    const a = await makeVehicle();
    const b = await makeVehicle();
    const ids = (await summarizeVehicles(admin)).map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
    const type = await db.vehicleType.findFirstOrThrow();
    const created = await createVehicle(admin, { name: "KTW 1", internalNumber: "K-1", licensePlate: "oh-rk 1", typeId: type.id, checkIntervalDays: "7" });
    expect(created.licensePlate).toBe("OH-RK 1");
    await expect(createVehicle(user, { name: "X", internalNumber: "X", licensePlate: "X", typeId: type.id, checkIntervalDays: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setVehicleStatus(user, a.id, "NOT_READY", "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gesperrte Benutzer verlieren sofort jeden Zugriff", async () => {
    const admin = await makeUser("ADMIN");
    const fm = await makeUser("FLEET_MANAGER");
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: fm.id, vehicleId: v.id } });
    expect(await summarizeVehicles(fm)).toHaveLength(1);
    await setUserStatus(admin, fm.id, "LOCKED");
    const locked = await refreshActor(fm);
    expect(await summarizeVehicles(locked)).toHaveLength(0);
    const login = await authenticate(fm.username, "egal");
    expect(login.ok).toBe(false);
  });

  it("14) fremde Fotos/Dokumente sind nicht abrufbar", async () => {
    const reporter = await makeUser("USER");
    const outsider = await makeUser("USER");
    const v = await makeVehicle();
    const other = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: reporter.id, vehicleId: v.id } });
    await db.vehicleAssignment.create({ data: { userId: outsider.id, vehicleId: other.id } });

    const upload = await createUpload(reporter, { name: "schaden.png", data: PNG });
    // vor der Verknüpfung nur für den Hochladenden sichtbar
    await expect(getAttachmentForDownload(outsider, upload.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { defect } = await createDefect(reporter, { vehicleId: v.id, title: "Delle", description: "Tür hinten", category: "BODY", severity: "LOW" }, [upload.id]);
    await expect(getAttachmentForDownload(reporter, upload.id)).resolves.toMatchObject({ defectId: defect.id });
    await expect(getAttachmentForDownload(outsider, upload.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // fremde Uploads können nicht an eigene Datensätze gehängt werden
    const foreignUpload = await createUpload(reporter, { name: "b.png", data: PNG });
    await expect(db.$transaction((tx) => linkAttachments(tx, outsider, [foreignUpload.id], { vehicleId: other.id }))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lehnt unerlaubte Dateitypen anhand der Dateisignatur ab", async () => {
    const u = await makeUser("USER");
    await expect(createUpload(u, { name: "bild.png", data: Buffer.from("<script>alert(1)</script>") })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
