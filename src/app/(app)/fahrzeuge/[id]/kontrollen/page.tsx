import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listChecks } from "@/server/services/checks";
import { Badge, Card, EmptyState, LinkButton, TableWrap } from "@/components/ui";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CHECK_OUTCOME, CHECK_TYPE } from "@/lib/labels";

export default async function VehicleChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const checks = await listChecks(actor, { vehicleId: id }, 200);
  return (
    <Card title="Kontrollhistorie" actions={can(actor, "checks.perform") && <LinkButton href={`/fahrzeuge/${id}/kontrolle`} size="sm">Neue Kontrolle</LinkButton>} padded={checks.length === 0}>
      {checks.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-10 w-10" />} title="Noch keine Kontrollen dokumentiert" />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>Datum</th><th>Kontrollart</th><th>Prüfer</th><th>km</th><th>Ergebnis</th><th></th></tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(c.performedAt)}</td>
                  <td>{CHECK_TYPE[c.checkType]}</td>
                  <td>{c.performedBy.firstName} {c.performedBy.lastName}</td>
                  <td className="tabular-nums">{fmtNumber(c.mileage)}</td>
                  <td><Badge tone={c.outcome === "OK" ? "green" : "red"}>{CHECK_OUTCOME[c.outcome]}{c._count.results ? ` (${c._count.results})` : ""}</Badge></td>
                  <td><Link href={`/fahrzeuge/${id}/kontrollen/${c.id}`} className="font-bold text-drkblue-700 hover:text-drkblue-600">Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
