import { requireActiveActor } from "@/server/auth/current";
import { getUser, listRoles } from "@/server/services/users";
import { summarizeVehicles } from "@/server/services/vehicles";
import { getSettings } from "@/server/settings";
import { notFoundOnError } from "@/server/page-helpers";
import { db } from "@/server/db";
import { Alert, Badge, Card, DefinitionList, PageHeader } from "@/components/ui";
import { ActionForm, Checkbox, InlineAction, SelectInput, SubmitButton, TextInput } from "@/components/forms";
import { AuditTable } from "@/components/audit-table";
import { anonymizeUserAction, approveUserAction, assignVehiclesAction, rejectUserAction, setUserStatusAction, updateUserAction } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";
import { USER_STATUS } from "@/lib/labels";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor("users.manage");
  const { id } = await params;
  const u = await notFoundOnError(() => getUser(actor, id));
  const [roles, vehicles, settings, logs] = await Promise.all([
    listRoles(actor),
    summarizeVehicles(actor),
    getSettings(),
    db.auditLog.findMany({ where: { entityType: "User", entityId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { firstName: true, lastName: true } } } }),
  ]);
  const assigned = new Set(u.assignments.map((a) => a.vehicleId));
  const multi = u.allowMultipleVehicles && settings.multiVehicleAssignmentEnabled;
  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  const vehicleChoice = (
    <fieldset>
      <legend className="label">Fahrzeugzuweisung {multi ? "(Mehrfachauswahl aktiviert)" : "(ein Fahrzeug)"}</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {vehicles.map((v) => (
          <label key={v.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-gray-50">
            <input type={multi ? "checkbox" : "radio"} name="vehicleIds" value={v.id} defaultChecked={assigned.has(v.id)} className="h-5 w-5 accent-drk-500" />
            <span className="text-sm">{v.name} <span className="text-gray-500">({v.licensePlate})</span></span>
          </label>
        ))}
        {!multi && (
          <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-gray-50">
            <input type="radio" name="vehicleIds" value="" defaultChecked={assigned.size === 0} className="h-5 w-5 accent-drk-500" />
            <span className="text-sm text-gray-600">kein Fahrzeug</span>
          </label>
        )}
      </div>
    </fieldset>
  );

  return (
    <>
      <PageHeader title={`${u.firstName} ${u.lastName}`} subtitle={<><Badge>{USER_STATUS[u.status]}</Badge> · {u.role.name}</>} back={{ href: "/admin/benutzer", label: "Benutzer" }} />
      <div className="space-y-5">
        <Card title="Konto">
          <DefinitionList
            items={[
              ["Benutzername", u.username],
              ["E-Mail", u.email],
              ["Funktion", u.position ?? "–"],
              ["Registriert", fmtDateTime(u.createdAt)],
              ["Nutzungsbedingungen akzeptiert", fmtDateTime(u.termsAcceptedAt)],
              ["Freigegeben", fmtDateTime(u.approvedAt)],
              ["Letzte Anmeldung", fmtDateTime(u.lastLoginAt)],
              ["Fahrzeuge", u.assignments.map((a) => a.vehicle.name).join(", ") || "keine"],
            ]}
          />
        </Card>

        {u.status === "PENDING" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Registrierung freigeben">
              <ActionForm action={approveUserAction.bind(null, id)}>
                <SelectInput label="Rolle" name="roleId" defaultValue={u.roleId} options={roleOptions} />
                {vehicleChoice}
                <Alert tone="info">Der Benutzer sieht Fahrzeugdaten erst, wenn ihm ein Fahrzeug zugewiesen ist (außer Administratoren).</Alert>
                <SubmitButton variant="success">Freigeben</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Registrierung ablehnen">
              <ActionForm action={rejectUserAction.bind(null, id)}>
                <TextInput label="Begründung (intern)" name="reason" />
                <SubmitButton variant="danger" confirm="Registrierung wirklich ablehnen?">Ablehnen</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        )}

        {u.status !== "PENDING" && !u.anonymizedAt && (
          <>
            <Card title="Benutzer bearbeiten">
              <ActionForm action={updateUserAction.bind(null, id)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput label="Vorname" name="firstName" defaultValue={u.firstName} required />
                  <TextInput label="Nachname" name="lastName" defaultValue={u.lastName} required />
                  <TextInput label="E-Mail" name="email" type="email" defaultValue={u.email} required />
                  <TextInput label="Funktion" name="position" defaultValue={u.position ?? ""} />
                  <SelectInput label="Rolle" name="roleId" defaultValue={u.roleId} options={roleOptions} hint="Rollenänderungen beenden laufende Sitzungen des Benutzers" />
                </div>
                <Checkbox name="canPerformChecks" label="Darf Fahrzeugkontrollen durchführen" hint="Für reguläre Benutzer erforderlich; KFZ-Warte und Admins dürfen immer." defaultChecked={u.canPerformChecks} />
                <Checkbox name="allowMultipleVehicles" label="Mehreren Fahrzeugen zuweisbar" hint={settings.multiVehicleAssignmentEnabled ? undefined : "Systemweit in den Einstellungen deaktiviert"} defaultChecked={u.allowMultipleVehicles} />
                <SubmitButton>Speichern</SubmitButton>
              </ActionForm>
            </Card>
            {u.status === "ACTIVE" && (
              <Card title="Fahrzeugzuweisung">
                <ActionForm action={assignVehiclesAction.bind(null, id)}>
                  {vehicleChoice}
                  <SubmitButton>Zuweisung speichern</SubmitButton>
                </ActionForm>
              </Card>
            )}
            <Card title="Kontostatus">
              <div className="flex flex-wrap gap-3">
                {u.status !== "ACTIVE" && <InlineAction action={setUserStatusAction.bind(null, id, "ACTIVE")} variant="success" size="md">Aktivieren / entsperren</InlineAction>}
                {u.status === "ACTIVE" && <InlineAction action={setUserStatusAction.bind(null, id, "LOCKED")} variant="danger" size="md" confirm="Benutzer sperren? Alle Sitzungen werden sofort beendet.">Sperren</InlineAction>}
                {u.status === "ACTIVE" && <InlineAction action={setUserStatusAction.bind(null, id, "DISABLED")} size="md" confirm="Benutzer deaktivieren?">Deaktivieren</InlineAction>}
                <InlineAction action={anonymizeUserAction.bind(null, id)} variant="danger" size="md" confirm="Personenbezogene Daten dieses Benutzers unwiderruflich anonymisieren (DSGVO)? Fachliche Dokumentation bleibt erhalten.">DSGVO: Anonymisieren</InlineAction>
              </div>
            </Card>
          </>
        )}
        {u.anonymizedAt && <Alert tone="info" title={`Dieses Konto wurde am ${fmtDateTime(u.anonymizedAt)} anonymisiert.`} />}

        <Card title="Protokoll zu diesem Benutzer" padded={false}>
          <AuditTable logs={logs} />
        </Card>
      </div>
    </>
  );
}
