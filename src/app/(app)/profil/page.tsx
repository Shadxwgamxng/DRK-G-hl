import { requireActiveActor } from "@/server/auth/current";
import { exportOwnData } from "@/server/services/users";
import { db } from "@/server/db";
import { Card, DefinitionList, PageHeader } from "@/components/ui";
import { ActionForm, Checkbox, SubmitButton, TextInput } from "@/components/forms";
import { changePasswordAction, updatePreferencesAction } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";
import { USER_STATUS } from "@/lib/labels";
import { AmbulanceToggle } from "@/components/route-ambulance";

export const metadata = { title: "Mein Profil" };

export default async function ProfilePage() {
  const actor = await requireActiveActor();
  const data = await exportOwnData(actor);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { emailNotifications: true } });
  return (
    <>
      <PageHeader title="Mein Profil" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Meine Daten">
          <DefinitionList
            items={[
              ["Name", `${data?.firstName} ${data?.lastName}`],
              ["Benutzername", data?.username],
              ["E-Mail", data?.email],
              ["Funktion", data?.position ?? "–"],
              ["Rolle", data?.role.name],
              ["Status", USER_STATUS[data?.status ?? ""]],
              ["Registriert", fmtDateTime(data?.createdAt)],
              ["Letzte Anmeldung", fmtDateTime(data?.lastLoginAt)],
              ["Zugewiesene Fahrzeuge", data?.assignments.map((a) => a.vehicle.name).join(", ") || "–"],
              ["Erfasste Vorgänge", `${data?._count.checks} Kontrollen, ${data?._count.reportedDefects} Mängel, ${data?._count.stockMovements} Materialbuchungen`],
            ]}
          />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Datenauskunft (DSGVO) als JSON anzeigen</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(data, null, 2)}</pre>
          </details>
          <p className="mt-3 text-xs text-gray-500">Für Berichtigung oder Löschung (Anonymisierung) Ihres Kontos wenden Sie sich bitte an die Administration.</p>
        </Card>
        <div className="space-y-5">
          <Card title="Passwort ändern">
            <ActionForm action={changePasswordAction} resetOnSuccess>
              <TextInput label="Aktuelles Passwort" name="current" type="password" autoComplete="current-password" required />
              <TextInput label="Neues Passwort" name="password" type="password" autoComplete="new-password" required />
              <TextInput label="Neues Passwort bestätigen" name="passwordConfirm" type="password" autoComplete="new-password" required />
              <SubmitButton>Passwort ändern</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Benachrichtigungen">
            <ActionForm action={updatePreferencesAction}>
              <Checkbox name="emailNotifications" label="Benachrichtigungen zusätzlich per E-Mail erhalten" hint="Nur wirksam, wenn der E-Mail-Versand vom Administrator aktiviert wurde." defaultChecked={user.emailNotifications} />
              <SubmitButton variant="secondary">Speichern</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Darstellung">
            <AmbulanceToggle />
          </Card>
        </div>
      </div>
    </>
  );
}
