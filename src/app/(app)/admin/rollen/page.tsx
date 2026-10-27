import { requireActiveActor } from "@/server/auth/current";
import { listRoles } from "@/server/services/users";
import { PERMISSIONS } from "@/server/permissions";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton, TextInput } from "@/components/forms";
import { createRoleAction, setRolePermissionsAction } from "@/app/actions/admin";

export const metadata = { title: "Rollen & Rechte" };

export default async function RolesPage() {
  const actor = await requireActiveActor("roles.manage");
  const roles = await listRoles(actor);
  return (
    <>
      <PageHeader title="Rollen & Berechtigungen" subtitle="Rechte werden bei jeder Anfrage serverseitig geprüft." />
      <Alert tone="info" className="mb-4">Fahrzeugbezogene Rechte gelten – außer bei „Alle Fahrzeuge sehen“ – nur für die dem Benutzer zugewiesenen Fahrzeuge.</Alert>
      <div className="space-y-5">
        {roles.map((r) => {
          const has = new Set(r.permissions.map((p) => p.permission.key));
          return (
            <Card key={r.id} title={<>{r.name} <Badge className="ml-2">{r._count.users} Benutzer</Badge></>}>
              {r.description && <p className="mb-3 text-sm text-gray-600">{r.description}</p>}
              {r.key === "ADMIN" ? (
                <p className="text-sm">Administratoren besitzen immer alle Rechte.</p>
              ) : (
                <ActionForm action={setRolePermissionsAction.bind(null, r.id)}>
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(PERMISSIONS).map(([key, label]) => (
                      <label key={key} className="flex min-h-11 items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <input type="checkbox" name="permissions" value={key} defaultChecked={has.has(key)} className="mt-0.5 h-5 w-5 accent-drk-500" />
                        <span className="text-sm">{label}<span className="block font-mono text-[11px] text-gray-500">{key}</span></span>
                      </label>
                    ))}
                  </div>
                  <SubmitButton variant="secondary">Rechte speichern</SubmitButton>
                </ActionForm>
              )}
            </Card>
          );
        })}
        <Card title="Neue Rolle anlegen">
          <ActionForm action={createRoleAction} resetOnSuccess>
            <div className="grid gap-4 md:grid-cols-3">
              <TextInput label="Schlüssel" name="key" required placeholder="z. B. GERAETEWART" />
              <TextInput label="Bezeichnung" name="name" required />
              <TextInput label="Beschreibung" name="description" />
            </div>
            <SubmitButton>Rolle anlegen</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
