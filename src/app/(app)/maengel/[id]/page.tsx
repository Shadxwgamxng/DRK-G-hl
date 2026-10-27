import Link from "next/link";
import { AlertOctagon } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { allowedTransitions, getDefect } from "@/server/services/defects";
import { assignableUsers } from "@/server/services/vehicles";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Card, DefinitionList, PageHeader } from "@/components/ui";
import { DefectStatusBadge, SeverityBadge, VehicleStatusBadge } from "@/components/status";
import { AttachmentGallery, Uploader } from "@/components/Uploader";
import { ActionForm, Checkbox, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { addDefectCommentAction, changeDefectStatusAction, updateDefectAction } from "@/app/actions/defects";
import { fmtDate, fmtDateTime, fmtNumber, toDateInput } from "@/lib/format";
import { DEFECT_CATEGORY, DEFECT_SEVERITY, DEFECT_STATUS } from "@/lib/labels";

export default async function DefectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const sp = await searchParams;
  const d = await notFoundOnError(() => getDefect(actor, id));
  const manage = can(actor, "defects.manage");
  const close = can(actor, "defects.close");
  const own = d.reportedById === actor.id;
  const users = manage ? await assignableUsers() : [];
  const transitions = allowedTransitions(d.status).filter((s) => (s === "CLOSED" || d.status === "CLOSED" ? close : manage));
  const critical = d.severity === "CRITICAL" && d.status !== "CLOSED";

  return (
    <>
      <PageHeader title={d.title} subtitle={<Link href={`/fahrzeuge/${d.vehicleId}`} className="hover:text-drkblue-600">{d.vehicle.name} · {d.vehicle.licensePlate}</Link>} back={{ href: "/maengel", label: "Mängel" }} />
      <div className="space-y-5">
        {sp.neu && <Alert tone="success" title="Mangel gemeldet. Die Verantwortlichen wurden benachrichtigt." />}
        {critical && (
          <div className="rounded-xl border-2 border-drk-500 bg-drk-50 p-4" role="alert">
            <p className="flex items-center gap-2 text-lg font-bold text-drk-700"><AlertOctagon className="h-6 w-6" /> Kritischer Mangel</p>
            <p className="mt-1 text-sm text-drk-800">
              Die sichere Einsatzfähigkeit des Fahrzeugs kann infrage stehen. Aktueller Fahrzeugstatus: <VehicleStatusBadge status={d.vehicle.status} />
              {can(actor, "vehicles.set_status") && <> – <Link className="font-semibold underline" href={`/fahrzeuge/${d.vehicleId}`}>Status jetzt anpassen</Link></>}
            </p>
          </div>
        )}
        {!critical && d.affectsReadiness && d.vehicle.status === "READY" && d.status !== "CLOSED" && (
          <Alert tone="warning" title="Einsatzfähigkeit laut Meldung fraglich">Das Fahrzeug ist weiterhin als „Einsatzbereit“ markiert. Bitte durch eine berechtigte Person prüfen.</Alert>
        )}
        {sp.warnung && <Alert tone="warning" title="Bitte Fahrzeugstatus prüfen: Der Mangel stellt die Einsatzfähigkeit infrage." />}

        <Card title="Mangel" actions={<><SeverityBadge severity={d.severity} /><DefectStatusBadge status={d.status} /></>}>
          <p className="whitespace-pre-line text-sm">{d.description}</p>
          <div className="mt-4">
            <DefinitionList
              items={[
                ["Kategorie", DEFECT_CATEGORY[d.category]],
                ["Gemeldet", `${fmtDateTime(d.reportedAt)} von ${d.reportedBy.firstName} ${d.reportedBy.lastName}${d.offlineCreatedAt ? " (offline erfasst)" : ""}`],
                ["Kilometerstand", d.mileage != null ? `${fmtNumber(d.mileage)} km` : "–"],
                ["Zuständig", d.assignedTo ? `${d.assignedTo.firstName} ${d.assignedTo.lastName}` : "noch nicht zugewiesen"],
                ["Frist zur Behebung", fmtDate(d.dueDate)],
                ["Aus Kontrolle", d.vehicleCheck ? <Link key="c" className="underline" href={`/fahrzeuge/${d.vehicleId}/kontrollen/${d.vehicleCheck.id}`}>{fmtDateTime(d.vehicleCheck.performedAt)}{d.checkItemLabel ? ` – ${d.checkItemLabel}` : ""}</Link> : "–"],
                ["Maßnahmen", d.measures ?? "–"],
                ["Behoben", d.resolvedAt ? `${fmtDateTime(d.resolvedAt)} durch ${d.resolvedBy?.firstName} ${d.resolvedBy?.lastName}` : "–"],
                ["Abschlusskontrolle", d.closedAt ? `${fmtDateTime(d.closedAt)} durch ${d.closedBy?.firstName} ${d.closedBy?.lastName}` : "–"],
              ]}
            />
          </div>
        </Card>

        <Card title="Fotos & Anhänge">
          <AttachmentGallery items={d.attachments} />
        </Card>

        {transitions.length > 0 && (
          <Card title="Bearbeitungsstatus ändern">
            <ActionForm action={changeDefectStatusAction.bind(null, id)} resetOnSuccess>
              <SelectInput label="Neuer Status" name="status" required placeholder="Bitte wählen" options={transitions.map((s) => ({ value: s, label: DEFECT_STATUS[s] }))} />
              {d.status !== "RESOLVED" && d.status !== "CLOSED" && (
                <div className="grid gap-4 rounded-lg border border-gray-200 p-3 md:grid-cols-2">
                  <p className="text-sm text-gray-600 md:col-span-2">Nur bei „Behoben“: durchgeführte Maßnahmen und verantwortliche Person dokumentieren.</p>
                  <TextArea label="Durchgeführte Maßnahmen" name="measures" className="md:col-span-2" />
                  <SelectInput label="Verantwortliche Person" name="resolvedById" defaultValue={actor.id} options={users.map((u) => ({ value: u.id, label: `${u.lastName}, ${u.firstName}` }))} />
                  <TextInput label="Erledigungsdatum" name="resolvedAt" type="date" defaultValue={toDateInput(new Date())} />
                </div>
              )}
              {d.status === "RESOLVED" && <Alert tone="info">Abschlusskontrolle: Prüfen Sie die dokumentierten Maßnahmen. „Kontrolliert und abgeschlossen“ setzt den Fahrzeugstatus NICHT automatisch auf einsatzbereit.</Alert>}
              <TextArea label="Kommentar" name="comment" rows={2} hint="Pflicht bei Wiederaufnahme" />
              <SubmitButton>Status speichern</SubmitButton>
            </ActionForm>
          </Card>
        )}

        {manage && d.status !== "CLOSED" && (
          <Card title="Mangel bearbeiten / zuweisen">
            <ActionForm action={updateDefectAction.bind(null, id)}>
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Titel" name="title" defaultValue={d.title} required className="md:col-span-2" />
                <TextArea label="Beschreibung" name="description" defaultValue={d.description} required className="md:col-span-2" />
                <SelectInput label="Kategorie" name="category" defaultValue={d.category} options={Object.entries(DEFECT_CATEGORY).map(([value, label]) => ({ value, label }))} />
                <SelectInput label="Schweregrad" name="severity" defaultValue={d.severity} options={Object.entries(DEFECT_SEVERITY).map(([value, label]) => ({ value, label }))} />
                <SelectInput label="Zuständige Person" name="assignedToId" defaultValue={d.assignedTo?.id ?? ""} placeholder="– niemand –" options={users.map((u) => ({ value: u.id, label: `${u.lastName}, ${u.firstName}` }))} />
                <TextInput label="Frist zur Behebung" name="dueDate" type="date" defaultValue={toDateInput(d.dueDate)} />
              </div>
              <Checkbox name="affectsReadiness" label="Sichere Einsatzfähigkeit fraglich" defaultChecked={d.affectsReadiness} />
              <SubmitButton variant="secondary">Speichern</SubmitButton>
            </ActionForm>
          </Card>
        )}

        <Card title="Verlauf & Kommentare">
          {d.comments.length === 0 ? <p className="text-sm text-gray-600">Noch keine Einträge.</p> : (
            <ol className="space-y-3">
              {d.comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">{fmtDateTime(c.createdAt)} · {c.user.firstName} {c.user.lastName}</p>
                  <p className="mt-1 whitespace-pre-line text-sm">{c.text}</p>
                </li>
              ))}
            </ol>
          )}
          {(manage || (own && can(actor, "defects.report"))) && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <ActionForm action={addDefectCommentAction.bind(null, id)} resetOnSuccess>
                <TextArea label="Kommentar hinzufügen" name="text" rows={2} />
                <Uploader label="Fotos ergänzen" />
                <SubmitButton variant="secondary">Hinzufügen</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
