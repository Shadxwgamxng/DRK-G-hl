import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { getInspection, listInspectionTypes } from "@/server/services/inspections";
import { assignableUsers } from "@/server/services/vehicles";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Badge, Card, DefinitionList, PageHeader, TableWrap } from "@/components/ui";
import { DueBadge } from "@/components/status";
import { AttachmentGallery, Uploader } from "@/components/Uploader";
import { ActionForm, Checkbox, InlineAction, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { InspectionForm } from "@/components/inspection-form";
import { completeInspectionAction, deactivateInspectionAction, updateInspectionAction } from "@/app/actions/inspections";
import { fmtDate, fmtEuro, fmtNumber, toDateInput, berlinToday } from "@/lib/format";
import { INTERVAL_UNIT } from "@/lib/labels";

export default async function InspectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor("inspections.view");
  const { id } = await params;
  const i = await notFoundOnError(() => getInspection(actor, id));
  const manage = can(actor, "inspections.manage");
  const [types, users] = manage ? await Promise.all([listInspectionTypes(), assignableUsers()]) : [[], []];
  return (
    <>
      <PageHeader title={i.title} subtitle={`${i.vehicle.name} · ${i.type.name}`} back={{ href: `/fahrzeuge/${i.vehicleId}/termine`, label: i.vehicle.name }} />
      <div className="space-y-5">
        {!i.active && <Alert tone="info" title="Dieser Termin ist nicht mehr aktiv." />}
        {i.active && i.state === "overdue" && <Alert tone="error" title={`Überfällig seit ${-i.days} Tag(en)`}>Bitte Durchführung zeitnah veranlassen bzw. dokumentieren.</Alert>}
        <Card title="Termin" actions={i.active ? <DueBadge date={i.dueDate} days={i.days} warnDays={Math.max(0, ...i.reminderDays)} /> : <Badge>inaktiv</Badge>}>
          <DefinitionList
            items={[
              ["Fällig am", fmtDate(i.dueDate)],
              ["Letzte Prüfung", fmtDate(i.lastDate)],
              ["Intervall", i.intervalValue ? `${i.intervalValue} ${INTERVAL_UNIT[i.intervalUnit!]}` : "einmalig / manuell"],
              ["Zuständig", i.assignedTo ? `${i.assignedTo.firstName} ${i.assignedTo.lastName}` : "–"],
              ["Werkstatt / Prüfstelle", i.workshop ?? "–"],
              ["Kosten (geschätzt)", fmtEuro(i.estimatedCost)],
              ["Erinnerungen", i.reminderDays.length ? `${[...i.reminderDays].sort((a, b) => b - a).join(", ")} Tage vorher` : "keine (nur bei Überfälligkeit)"],
            ]}
          />
          {i.remarks && <p className="mt-3 whitespace-pre-line rounded bg-gray-50 p-2 text-sm">{i.remarks}</p>}
          <div className="mt-4"><AttachmentGallery items={i.attachments} /></div>
        </Card>

        {i.active && can(actor, "inspections.complete") && (
          <Card title="Durchführung dokumentieren">
            <ActionForm action={completeInspectionAction.bind(null, id)} resetOnSuccess>
              <div className="grid gap-4 md:grid-cols-3">
                <TextInput label="Durchgeführt am" name="performedAt" type="date" required defaultValue={toDateInput(berlinToday())} />
                <TextInput label="Durchgeführt von / Prüfer" name="performedBy" />
                <TextInput label="Werkstatt / Prüfstelle" name="workshop" defaultValue={i.workshop ?? ""} />
                <TextInput label="Kosten (€)" name="cost" inputMode="decimal" />
                <TextInput label="Kilometerstand" name="mileage" type="number" inputMode="numeric" />
                <TextInput label="Nächster Termin (optional)" name="nextDueDate" type="date" hint={i.intervalValue ? "Leer = automatisch nach Intervall" : "Ohne Intervall und ohne Datum wird der Termin geschlossen"} />
              </div>
              <Checkbox name="passed" label="Prüfung bestanden / ohne Beanstandung" defaultChecked />
              <TextArea label="Bemerkungen / Ergebnis" name="remarks" />
              <Uploader label="Prüfbericht / Foto" />
              <SubmitButton>Durchführung speichern</SubmitButton>
            </ActionForm>
          </Card>
        )}

        <Card title="Historie der Durchführungen" padded={i.records.length === 0}>
          {i.records.length === 0 ? <p className="text-sm text-gray-600">Noch keine Durchführung dokumentiert.</p> : (
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Datum</th><th>Ergebnis</th><th>Durch</th><th>Werkstatt</th><th>Kosten</th><th>km</th><th>Bemerkung</th><th>Dokumente</th></tr></thead>
                <tbody>
                  {i.records.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.performedAt)}</td>
                      <td><Badge tone={r.passed ? "green" : "red"}>{r.passed ? "bestanden" : "Beanstandung"}</Badge></td>
                      <td>{r.performedBy ?? "–"}<div className="text-xs text-gray-500">erfasst von {r.createdBy.firstName} {r.createdBy.lastName}</div></td>
                      <td>{r.workshop ?? "–"}</td>
                      <td>{fmtEuro(r.cost)}</td>
                      <td>{fmtNumber(r.mileage)}</td>
                      <td className="max-w-xs">{r.remarks}</td>
                      <td>{r.attachments.map((a) => <a key={a.id} href={`/api/files/${a.id}`} target="_blank" className="mr-2 text-drk-600 underline">{a.originalName}</a>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {manage && i.active && (
          <Card title="Termin bearbeiten">
            <InspectionForm
              action={updateInspectionAction.bind(null, id)}
              types={types}
              users={users}
              submitLabel="Änderungen speichern"
              value={{ ...i, estimatedCost: i.estimatedCost?.toString() ?? null, assignedToId: i.assignedTo?.id ?? null }}
            />
            <div className="mt-4 border-t pt-4">
              <InlineAction action={deactivateInspectionAction.bind(null, id)} variant="danger" confirm="Termin deaktivieren? Er erscheint dann nicht mehr in Übersichten und Erinnerungen.">Termin deaktivieren</InlineAction>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
