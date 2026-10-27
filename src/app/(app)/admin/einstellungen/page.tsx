import { requireActiveActor } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { mailConfigured } from "@/server/mail";
import { listVehicleTypes } from "@/server/services/vehicles";
import { listInspectionTypes } from "@/server/services/inspections";
import { listCategories } from "@/server/services/materials";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, Checkbox, SelectInput, SubmitButton, TextInput } from "@/components/forms";
import { updateSettingsAction, upsertVehicleTypeAction } from "@/app/actions/admin";
import { upsertInspectionTypeAction } from "@/app/actions/inspections";
import { upsertCategoryAction } from "@/app/actions/materials";
import { INTERVAL_UNIT } from "@/lib/labels";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requireActiveActor("settings.manage");
  const [s, types, inspTypes, categories] = await Promise.all([getSettings(), listVehicleTypes(true), listInspectionTypes(true), listCategories({ includeMedication: true })]);
  const unitOptions = Object.entries(INTERVAL_UNIT).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader title="Systemeinstellungen" />
      <div className="space-y-5">
        <Card title="Allgemein">
          <ActionForm action={updateSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Organisationsname (Berichte)" name="organizationName" defaultValue={s.organizationName} required />
              <TextInput label="Vorwarnzeit Verfallsdatum (Tage)" name="expiryWarningDays" type="number" min={1} max={365} defaultValue={s.expiryWarningDays} required />
            </div>
            <Checkbox name="medicationsEnabled" label="Medikamentenverwaltung freischalten" hint="Nur aktivieren, wenn dies organisatorisch und rechtlich (z. B. BtM, Lagerung) geklärt ist." defaultChecked={s.medicationsEnabled} />
            <Checkbox name="multiVehicleAssignmentEnabled" label="Mehrfache Fahrzeugzuweisung erlauben" hint="Zusätzlich je Benutzer zu aktivieren." defaultChecked={s.multiVehicleAssignmentEnabled} />
            <Checkbox name="emailNotificationsEnabled" label="E-Mail-Benachrichtigungen versenden" hint={mailConfigured() ? "SMTP ist konfiguriert." : "SMTP ist nicht konfiguriert (Umgebungsvariablen SMTP_*)."} defaultChecked={s.emailNotificationsEnabled} />
            <SubmitButton>Einstellungen speichern</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Fahrzeugtypen">
          <ul className="mb-4 divide-y divide-gray-100">
            {types.map((t) => (
              <li key={t.id} className="py-2">
                <details>
                  <summary className="cursor-pointer text-sm"><b>{t.name}</b> {t.description && `– ${t.description}`} <Badge className="ml-1">{t._count.vehicles} Fahrzeuge</Badge>{t.archived && <Badge tone="dark" className="ml-1">archiviert</Badge>}</summary>
                  <ActionForm action={upsertVehicleTypeAction} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput label="Name" name="name" defaultValue={t.name} required />
                      <TextInput label="Beschreibung" name="description" defaultValue={t.description ?? ""} />
                    </div>
                    <Checkbox name="archived" label="Archiviert" defaultChecked={t.archived} />
                    <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
          <ActionForm action={upsertVehicleTypeAction} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Neuer Fahrzeugtyp" name="name" required />
              <TextInput label="Beschreibung" name="description" />
            </div>
            <SubmitButton size="sm">Hinzufügen</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Prüfungsarten">
          <Alert tone="info" className="mb-3">Standardintervalle sind nur Vorschläge. Intervalle werden je Termin festgelegt – pauschale gesetzliche Fristen gelten nicht für jedes Fahrzeug/Gerät.</Alert>
          <ul className="mb-4 divide-y divide-gray-100">
            {inspTypes.map((t) => (
              <li key={t.id} className="py-2">
                <details>
                  <summary className="cursor-pointer text-sm"><b>{t.name}</b>{t.key && <Badge className="ml-1">{t.key}</Badge>}{t.archived && <Badge tone="dark" className="ml-1">archiviert</Badge>}</summary>
                  <ActionForm action={upsertInspectionTypeAction} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="grid gap-3 sm:grid-cols-4">
                      <TextInput label="Name" name="name" defaultValue={t.name} required className="sm:col-span-2" />
                      <TextInput label="Standardintervall" name="defaultIntervalValue" type="number" min={1} defaultValue={t.defaultIntervalValue ?? ""} />
                      <SelectInput label="Einheit" name="defaultIntervalUnit" defaultValue={t.defaultIntervalUnit ?? ""} placeholder="–" options={unitOptions} />
                      <TextInput label="Erinnerungen (Tage)" name="defaultReminderDays" defaultValue={t.defaultReminderDays.join(", ")} className="sm:col-span-2" />
                      <TextInput label="Beschreibung" name="description" defaultValue={t.description ?? ""} className="sm:col-span-2" />
                    </div>
                    <Checkbox name="archived" label="Archiviert" defaultChecked={t.archived} />
                    <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
          <ActionForm action={upsertInspectionTypeAction} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-4">
              <TextInput label="Neue Prüfungsart" name="name" required className="sm:col-span-2" />
              <TextInput label="Standardintervall" name="defaultIntervalValue" type="number" min={1} />
              <SelectInput label="Einheit" name="defaultIntervalUnit" placeholder="–" options={unitOptions} />
              <TextInput label="Erinnerungen (Tage)" name="defaultReminderDays" defaultValue="30, 14, 7" />
            </div>
            <SubmitButton size="sm">Hinzufügen</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Materialkategorien">
          <ul className="mb-4 divide-y divide-gray-100">
            {categories.map((c) => (
              <li key={c.id} className="py-2">
                <details>
                  <summary className="cursor-pointer text-sm"><b>{c.name}</b>{c.isMedication && <Badge tone="red" className="ml-1">Medikamente</Badge>}</summary>
                  <ActionForm action={upsertCategoryAction} className="mt-2">
                    <input type="hidden" name="id" value={c.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextInput label="Name" name="name" defaultValue={c.name} required />
                      <TextInput label="Sortierung" name="sortOrder" type="number" defaultValue={c.sortOrder} />
                    </div>
                    <Checkbox name="isMedication" label="Medikamenten-Kategorie (nur bei Freischaltung nutzbar)" defaultChecked={c.isMedication} />
                    <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
          <ActionForm action={upsertCategoryAction} resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="Neue Kategorie" name="name" required />
              <TextInput label="Sortierung" name="sortOrder" type="number" defaultValue={500} />
            </div>
            <SubmitButton size="sm">Hinzufügen</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
