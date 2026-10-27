import { FileDown, FileSpreadsheet } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { summarizeVehicles } from "@/server/services/vehicles";
import { REPORT_TYPES } from "@/server/services/reports";
import { Card, PageHeader } from "@/components/ui";
import { DEFECT_SEVERITY } from "@/lib/labels";

export const metadata = { title: "Berichte" };

const HINTS: Record<string, string> = {
  fahrzeuge: "Status, Kontrollen, Termine, Mängel und Material je Fahrzeug",
  fahrzeughistorie: "Alle protokollierten Änderungen eines Fahrzeugs (Fahrzeug wählen)",
  kontrollen: "Durchgeführte Fahrzeugkontrollen im Zeitraum",
  maengel: "Mängel mit Status, Schweregrad und Zuständigkeit",
  termine: "TÜV-, Prüf- und Wartungstermine",
  bestand: "Soll-/Ist-Bestände inkl. Verfallsdaten und Lagerorte",
  verfall: "Abgelaufenes und bald ablaufendes Material (Fahrzeuge und Lager)",
  bewegungen: "Alle Zu- und Abgänge im Zeitraum",
  nachfuellung: "Aktive Nachfüllanforderungen mit Lagerorten (Packliste)",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("reports.view");
  const sp = await searchParams;
  const vehicles = await summarizeVehicles(actor, { includeArchived: true });
  return (
    <>
      <PageHeader title="Berichte & Exporte" subtitle="Alle Berichte enthalten nur Daten, auf die Sie Zugriff haben." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(REPORT_TYPES).map(([key, title]) => (
          <Card key={key} title={title} className={sp.typ === key ? "ring-2 ring-drk-500" : undefined}>
            <p className="mb-3 text-sm text-gray-600">{HINTS[key]}</p>
            <form action={`/api/export/${key}`} method="get" className="space-y-3">
              <select name="vehicleId" className="input" aria-label="Fahrzeug" required={key === "fahrzeughistorie"} defaultValue="">
                <option value="">{key === "fahrzeughistorie" ? "Fahrzeug wählen *" : "Alle Fahrzeuge"}</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {["fahrzeughistorie", "kontrollen", "maengel", "bewegungen"].includes(key) && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-gray-600">Von<input type="date" name="from" className="input mt-1" /></label>
                  <label className="text-xs font-semibold text-gray-600">Bis<input type="date" name="to" className="input mt-1" /></label>
                </div>
              )}
              {key === "maengel" && (
                <select name="severity" className="input" aria-label="Schweregrad" defaultValue="">
                  <option value="">Alle Schweregrade</option>
                  {Object.entries(DEFECT_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              )}
              {key === "verfall" && <label className="block text-xs font-semibold text-gray-600">Vorschau (Tage)<input type="number" name="days" min={1} max={365} defaultValue={60} className="input mt-1" /></label>}
              {key === "nachfuellung" && (
                <select name="status" className="input" aria-label="Status" defaultValue="active">
                  <option value="active">Aktive Anforderungen</option>
                  <option value="history">Historie</option>
                  <option value="all">Alle</option>
                </select>
              )}
              <div className="flex gap-2">
                <button name="format" value="pdf" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-drk-500 px-3 text-sm font-semibold text-white hover:bg-drk-600">
                  <FileDown className="h-5 w-5" aria-hidden /> PDF
                </button>
                <button name="format" value="csv" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-50">
                  <FileSpreadsheet className="h-5 w-5" aria-hidden /> CSV
                </button>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
