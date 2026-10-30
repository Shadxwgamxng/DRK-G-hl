import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireActiveActor } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { getVehicle } from "@/server/services/vehicles";
import { consumptionLink, listConsumptionReports } from "@/server/services/consumption";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Card, TableWrap } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { PrintButton } from "@/components/print-button";
import { renewConsumptionLinkAction } from "@/app/actions/consumption";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata = { title: "QR-Code Verbrauchsmeldung" };

/** TESTFUNKTION: QR-Code je Fahrzeug, über den ohne Login Verbrauch gemeldet werden kann. */
export default async function VehicleQrPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor("materials.manage");
  const { id } = await params;
  if (!(await getSettings()).qrConsumptionEnabled)
    return <Alert tone="info" title="Die Testfunktion „Verbrauch per QR-Code melden“ ist nicht aktiviert (Verwaltung → Einstellungen)." />;
  const v = await notFoundOnError(() => getVehicle(actor, id));
  const token = await consumptionLink(actor, id);
  const h = await headers();
  const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${origin}/verbrauch/${token}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#002d55", light: "#ffffff" } });
  const reports = await listConsumptionReports(actor, id);

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Testfunktion">
        Wer diesen QR-Code scannt, kann <strong>ohne Anmeldung</strong> verbrauchtes Material melden. Es wird als „verbraucht“ ausgetragen und landet auf der Nachfüllliste.
        Den Code nicht öffentlich aushängen – z. B. in die Fahrzeugmappe legen. Bei Verlust einfach neu erzeugen.
      </Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Druckkarte (A6) */}
        <div id="qr-karte" className="card mx-auto w-full max-w-sm p-6 text-center print:border-2 print:border-drkblue-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/drk-goehl-logo.png" alt="DRK Ortsverein Göhl e.V. Bereitschaft" className="mx-auto h-14 w-auto" />
          <p className="mt-4 text-sm font-bold uppercase tracking-wide text-drkblue-600">Verbrauch melden</p>
          <p className="text-2xl font-bold text-drk-500">{v.name}</p>
          <p className="text-sm text-gray-600">{[v.licensePlate, v.radioCallSign].filter(Boolean).join(" · ")}</p>
          <div className="mx-auto mt-4 w-56" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-3 text-sm">Nach Einsatz, Sanitätsdienst oder Veranstaltung scannen und verbrauchtes Material eintragen.</p>
        </div>
        <Card title="Link & Verwaltung">
          <p className="break-all rounded-sm bg-gray-100 p-2 font-mono text-xs">{url}</p>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            <InlineAction action={renewConsumptionLinkAction.bind(null, id)} variant="danger" confirm="Neuen QR-Code erzeugen? Der bisherige Code funktioniert dann nicht mehr.">
              Neuen QR-Code erzeugen
            </InlineAction>
          </div>
        </Card>
      </div>
      <Card title="Letzte Meldungen" padded={reports.length === 0}>
        {reports.length === 0 ? (
          <p className="text-sm text-gray-600">Noch keine Meldungen über den QR-Code.</p>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Eingegangen</th><th>Anlass</th><th>Datum</th><th>Gemeldet von</th><th>Material</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                    <td>{r.occasion}</td>
                    <td>{fmtDate(r.occurredOn)}</td>
                    <td>{r.reporterName}</td>
                    <td className="text-sm">
                      {(r.items as { material: string; reported: number; unit: string }[]).map((l) => `${l.reported} × ${l.material}`).join(", ")}
                      {r.note && <div className="text-xs text-gray-500">{r.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
