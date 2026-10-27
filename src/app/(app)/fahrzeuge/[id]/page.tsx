import Link from "next/link";
import { AlertOctagon, ClipboardCheck, Package, Pencil, TriangleAlert } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { getVehicle } from "@/server/services/vehicles";
import { listDefects } from "@/server/services/defects";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Card, DefinitionList, LinkButton } from "@/components/ui";
import { DefectStatusBadge, DueBadge, SeverityBadge } from "@/components/status";
import { AttachmentGallery, Uploader } from "@/components/Uploader";
import { ActionForm, InlineAction, SelectInput, SubmitButton, TextArea } from "@/components/forms";
import { addVehicleDocumentsAction, archiveVehicleAction, setVehicleStatusAction } from "@/app/actions/vehicles";
import { daysUntil, fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { VEHICLE_STATUS } from "@/lib/labels";
import { checkIntervalLabel } from "@/lib/check-schedule";
import { CheckDue } from "@/components/status";

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const sp = await searchParams;
  const v = await notFoundOnError(() => getVehicle(actor, id));
  const openDefects = await listDefects(actor, { vehicleId: id, status: "open" }, 10);
  const criticalOpen = openDefects.filter((d) => d.severity === "CRITICAL" && d.status !== "RESOLVED");
  const readinessDoubt = openDefects.filter((d) => d.affectsReadiness && d.status !== "RESOLVED");
  const archived = Boolean(v.archivedAt);

  return (
    <div className="space-y-5">
      {sp.neu && <Alert tone="success" title="Fahrzeug angelegt." />}
      {(criticalOpen.length > 0 || readinessDoubt.length > 0) && v.status === "READY" && (
        <Alert tone="error" title="Achtung: Einsatzfähigkeit fraglich">
          Für dieses Fahrzeug sind {criticalOpen.length > 0 ? `${criticalOpen.length} kritische` : `${readinessDoubt.length}`} Mängel offen, die die sichere Einsatzfähigkeit infrage stellen. Das Fahrzeug ist dennoch als „Einsatzbereit“ markiert. Bitte durch eine berechtigte Person prüfen und den Status ggf. auf „Eingeschränkt“ oder „Nicht einsatzbereit“ setzen.
        </Alert>
      )}
      {v.status !== "READY" && v.statusReason && (
        <Alert tone={v.status === "NOT_READY" ? "error" : "warning"} title={`${VEHICLE_STATUS[v.status]} seit ${fmtDateTime(v.statusChangedAt)}`}>
          {v.statusReason}
        </Alert>
      )}

      {!archived && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {can(actor, "checks.perform") && (
            <LinkButton href={`/fahrzeuge/${id}/kontrolle`} size="lg" className="col-span-2 sm:col-span-1">
              <ClipboardCheck className="h-6 w-6" aria-hidden /> Kontrolle starten
            </LinkButton>
          )}
          {can(actor, "defects.report") && (
            <LinkButton href={`/maengel/neu?vehicleId=${id}`} size="lg" variant="secondary">
              <TriangleAlert className="h-6 w-6" aria-hidden /> Mangel melden
            </LinkButton>
          )}
          {can(actor, "materials.view") && (
            <LinkButton href={`/fahrzeuge/${id}/material`} size="lg" variant="secondary">
              <Package className="h-6 w-6" aria-hidden /> Material
            </LinkButton>
          )}
          {can(actor, "vehicles.manage") && (
            <LinkButton href={`/fahrzeuge/${id}/bearbeiten`} size="lg" variant="secondary">
              <Pencil className="h-5 w-5" aria-hidden /> Bearbeiten
            </LinkButton>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Status & Termine" className="lg:col-span-2">
          <DefinitionList
            items={[
              ["Letzte Kontrolle", v.lastCheck ? `${fmtDateTime(v.lastCheck.performedAt)} – ${v.lastCheck.performedBy.firstName} ${v.lastCheck.performedBy.lastName}` : "Noch keine Kontrolle"],
              ["Nächste Kontrolle", <CheckDue key="nc" v={v} />],
              ["Nächste HU", v.nextHu ? <DueBadge date={v.nextHu.dueDate} days={daysUntil(v.nextHu.dueDate)} /> : "nicht geplant"],
              ["Nächste Wartung / Prüfung", v.nextMaintenance ? <span>{v.nextMaintenance.title}: <DueBadge date={v.nextMaintenance.dueDate} days={daysUntil(v.nextMaintenance.dueDate)} /></span> : "nicht geplant"],
              ["Offene Mängel", `${v.openDefects}${v.criticalDefects ? ` (davon ${v.criticalDefects} kritisch)` : ""}`],
              ["Material", `${v.missingMaterials} Position(en) unter Soll · ${v.expiredBatches} abgelaufen · ${v.expiringBatches} bald ablaufend`],
            ]}
          />
        </Card>
        <Card title="Stammdaten">
          {v.imageId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${v.imageId}`} alt={`Foto ${v.name}`} className="mb-3 aspect-video w-full rounded-lg object-cover" />
          )}
          <DefinitionList
            items={[
              ["Typ", v.type.name],
              ["Hersteller / Modell", [v.manufacturer, v.model].filter(Boolean).join(" ") || "–"],
              ["Baujahr / Erstzulassung", `${v.buildYear ?? "–"} / ${fmtDate(v.firstRegistration)}`],
              ["Kilometerstand", v.mileage != null ? `${fmtNumber(v.mileage)} km` : "–"],
              ["Standort", v.location ?? "–"],
              ["Verantwortlich", v.responsibleUser ? `${v.responsibleUser.firstName} ${v.responsibleUser.lastName}` : "–"],
              ["Kontrollintervall", checkIntervalLabel(v.checkIntervalValue, v.checkIntervalUnit)],
            ]}
          />
          {v.remarks && <p className="mt-3 whitespace-pre-line rounded bg-gray-50 p-2 text-sm">{v.remarks}</p>}
        </Card>
      </div>

      {can(actor, "vehicles.set_status") && !archived && (
        <Card title="Einsatzstatus ändern / Fahrzeug freigeben">
          <p className="mb-3 text-sm text-gray-600">Der Status wird nie automatisch geändert. Die Freigabe als „Einsatzbereit“ erfolgt ausschließlich durch eine berechtigte Person und wird protokolliert.</p>
          {criticalOpen.length > 0 && (
            <Alert tone="error" className="mb-3" title={`${criticalOpen.length} kritische(r) Mangel/Mängel noch nicht behoben`}>
              Eine Freigabe als „Einsatzbereit“ ist nur mit dokumentierter Begründung möglich.
            </Alert>
          )}
          <ActionForm action={setVehicleStatusAction.bind(null, id)} resetOnSuccess>
            <div className="grid gap-4 md:grid-cols-3">
              <SelectInput label="Neuer Status" name="status" defaultValue={v.status} options={Object.entries(VEHICLE_STATUS).map(([value, label]) => ({ value, label }))} />
              <TextArea label="Begründung" name="reason" rows={2} className="md:col-span-2" hint="Pflicht bei eingeschränkt/nicht einsatzbereit/außer Dienst" />
            </div>
            <SubmitButton>Status speichern</SubmitButton>
          </ActionForm>
          {v.statusChanges.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">Statusverlauf</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {v.statusChanges.map((s) => (
                  <li key={s.id}>
                    {fmtDateTime(s.createdAt)}: {VEHICLE_STATUS[s.fromStatus]} → <b>{VEHICLE_STATUS[s.toStatus]}</b> ({s.user.firstName} {s.user.lastName}){s.reason ? ` – ${s.reason}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <Card title="Offene Mängel" actions={<Link href={`/fahrzeuge/${id}/maengel`} className="text-sm font-bold text-drkblue-700 hover:text-drkblue-600">Alle Mängel</Link>}>
        {openDefects.length === 0 ? (
          <p className="text-sm text-gray-600">Keine offenen Mängel.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {openDefects.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/maengel/${d.id}`} className="min-w-0 font-semibold hover:text-drkblue-600">
                  {d.severity === "CRITICAL" && <AlertOctagon className="mr-1 inline h-4 w-4 text-drk-600" aria-hidden />}
                  {d.title}
                  <span className="block text-xs font-normal text-gray-500">Gemeldet {fmtDateTime(d.reportedAt)} von {d.reportedBy.firstName} {d.reportedBy.lastName}</span>
                </Link>
                <span className="flex gap-1.5">
                  <SeverityBadge severity={d.severity} />
                  <DefectStatusBadge status={d.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Dokumente & Anhänge">
        <AttachmentGallery items={v.attachments} />
        {!archived && (can(actor, "vehicles.manage") || can(actor, "vehicles.set_status")) && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <ActionForm action={addVehicleDocumentsAction.bind(null, id)} resetOnSuccess>
              <Uploader label="Dokument oder Foto hinzufügen (z. B. Fahrzeugschein, Prüfbericht)" />
              <SubmitButton variant="secondary">Anhänge speichern</SubmitButton>
            </ActionForm>
          </div>
        )}
      </Card>

      <Card title="Zugewiesene Benutzer">
        {v.assignments.length === 0 ? (
          <p className="text-sm text-gray-600">Keine Benutzer zugewiesen.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {v.assignments.map((a) => (
              <li key={a.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                {can(actor, "users.manage") ? <Link href={`/admin/benutzer/${a.user.id}`}>{a.user.firstName} {a.user.lastName}</Link> : `${a.user.firstName} ${a.user.lastName}`}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can(actor, "vehicles.manage") && (
        <div className="flex justify-end">
          <InlineAction action={archiveVehicleAction.bind(null, id, !archived)} variant="danger" confirm={archived ? "Fahrzeug wieder aktivieren?" : "Fahrzeug archivieren? Es wird auf „Außer Dienst“ gesetzt und aus Übersichten ausgeblendet. Alle Daten bleiben erhalten."}>
            {archived ? "Fahrzeug reaktivieren" : "Fahrzeug archivieren"}
          </InlineAction>
        </div>
      )}
    </div>
  );
}
