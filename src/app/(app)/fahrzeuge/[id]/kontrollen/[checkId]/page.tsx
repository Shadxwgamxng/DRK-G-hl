import Link from "next/link";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { getCheck, type CheckAmendment } from "@/server/services/checks";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Badge, Card, DefinitionList, TableWrap } from "@/components/ui";
import { AttachmentGallery } from "@/components/Uploader";
import { ActionForm, SubmitButton, TextArea } from "@/components/forms";
import { DefectStatusBadge } from "@/components/status";
import { amendCheckAction } from "@/app/actions/vehicles";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CHECK_MATERIAL_STATUS, CHECK_OUTCOME, CHECK_RESULT, CHECK_TYPE } from "@/lib/labels";

export default async function CheckDetail({ params, searchParams }: { params: Promise<{ id: string; checkId: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const { id, checkId } = await params;
  const sp = await searchParams;
  const c = await notFoundOnError(() => getCheck(actor, checkId));
  const amendments = (c.amendments as CheckAmendment[]) ?? [];
  const path = `/fahrzeuge/${id}/kontrollen/${checkId}`;
  return (
    <div className="space-y-5">
      {sp.neu && <Alert tone="success" title="Kontrolle abgeschlossen und revisionssicher gespeichert." />}
      <Card title="Kontrolle" actions={<Badge tone={c.outcome === "OK" ? "green" : "red"}>{CHECK_OUTCOME[c.outcome]}</Badge>}>
        <DefinitionList
          items={[
            ["Datum / Uhrzeit", fmtDateTime(c.performedAt)],
            ["Prüfer", `${c.performedBy.firstName} ${c.performedBy.lastName}`],
            ["Kontrollart", CHECK_TYPE[c.checkType]],
            ["Kilometerstand", c.mileage != null ? `${fmtNumber(c.mileage)} km` : "–"],
            ["Checkliste", c.checklistName],
            ["Gespeichert", `${fmtDateTime(c.completedAt)}${c.offlineCreatedAt ? " (offline erfasst, nachträglich synchronisiert)" : ""}`],
          ]}
        />
        {c.remarks && <p className="mt-3 whitespace-pre-line rounded bg-gray-50 p-3 text-sm">{c.remarks}</p>}
      </Card>
      <Card title="Prüfpunkte" padded={false}>
        <ul className="divide-y divide-gray-100">
          {c.results.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              {r.result === "OK" ? <Check className="mt-0.5 h-5 w-5 text-green-700" aria-hidden /> : r.result === "DEFECT" ? <TriangleAlert className="mt-0.5 h-5 w-5 text-drk-600" aria-hidden /> : <Minus className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.label}</p>
                {r.note?.trim() && <p className="text-sm text-gray-600">{r.note}</p>}
              </div>
              <span className="text-sm font-semibold">{CHECK_RESULT[r.result]}</span>
            </li>
          ))}
        </ul>
      </Card>
      {c.materialResults.length > 0 && (
        <Card
          title="Materialprüfung"
          padded={false}
          actions={<span className="text-sm text-gray-600">{c.materialResults.filter((m) => m.status !== "OK").length} Abweichung(en) von {c.materialResults.length}</span>}
        >
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr><th>Fach</th><th>Material</th><th className="text-right">Soll</th><th className="text-right">Gebucht vorher</th><th className="text-right">Festgestellt</th><th>Ergebnis</th><th>Bemerkung</th></tr>
              </thead>
              <tbody>
                {c.materialResults.map((m) => (
                  <tr key={m.id}>
                    <td>{m.compartment ?? "–"}</td>
                    <td className="font-medium">{m.materialName}{m.isNarcotic && <Badge tone="red" className="ml-2">BtM</Badge>}</td>
                    <td className="text-right">{m.targetQuantity} {m.unit}</td>
                    <td className="text-right">{m.previousQuantity}</td>
                    <td className="text-right font-semibold">{m.countedQuantity}{m.expiredRemoved > 0 && <span className="block text-xs font-normal text-drk-700">{m.expiredRemoved} abgelaufen entnommen</span>}</td>
                    <td><Badge tone={m.status === "OK" ? "green" : m.status === "DEVIATION" ? "yellow" : "red"}>{CHECK_MATERIAL_STATUS[m.status]}</Badge></td>
                    <td className="text-sm">{m.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      {c.defects.length > 0 && (
        <Card title="Aus dieser Kontrolle gemeldete Mängel">
          <ul className="space-y-2">
            {c.defects.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/maengel/${d.id}`} className="font-bold text-drkblue-700 hover:text-drkblue-600 underline">{d.title}</Link>
                <DefectStatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Fotos & Anhänge"><AttachmentGallery items={c.attachments} /></Card>
      <Card title="Nachträge">
        {amendments.length === 0 ? <p className="text-sm text-gray-600">Keine Nachträge.</p> : (
          <ul className="space-y-2">
            {amendments.map((a, i) => (
              <li key={i} className="rounded border border-gray-200 p-3 text-sm">
                <p className="text-xs text-gray-500">{fmtDateTime(a.at)} – {a.userName}</p>
                <p className="whitespace-pre-line">{a.text}</p>
              </li>
            ))}
          </ul>
        )}
        {can(actor, "checks.amend") && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <ActionForm action={amendCheckAction.bind(null, checkId, path)} resetOnSuccess>
              <TextArea label="Nachtrag erfassen" name="text" required hint="Die ursprünglichen Kontrolldaten bleiben unverändert; der Nachtrag wird mit Benutzer und Zeitpunkt protokolliert." />
              <SubmitButton variant="secondary">Nachtrag speichern</SubmitButton>
            </ActionForm>
          </div>
        )}
      </Card>
    </div>
  );
}
