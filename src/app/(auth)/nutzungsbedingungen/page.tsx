import { Card } from "@/components/ui";

export const metadata = { title: "Nutzungsbedingungen" };

export default function Page() {
  return (
    <Card title="Nutzungsbedingungen (Vorlage)">
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
        <li>Die Anwendung dient ausschließlich dienstlichen Zwecken der KFZ-Warte des DRK Göhl.</li>
        <li>Zugangsdaten sind persönlich und dürfen nicht weitergegeben werden. Auf gemeinsam genutzten Geräten ist nach der Nutzung abzumelden.</li>
        <li>Eingaben (Kontrollen, Mängel, Materialbuchungen) sind wahrheitsgemäß und vollständig vorzunehmen; sie werden revisionssicher dokumentiert.</li>
        <li>Die Anwendung ersetzt nicht die Beurteilung der Einsatzbereitschaft durch eine berechtigte Person. Checklisten sind Hilfsmittel und keine verbindlichen Prüfvorschriften.</li>
        <li>Fotos dürfen nur Fahrzeuge, Geräte und Material zeigen – keine Patientinnen/Patienten oder unbeteiligte Personen.</li>
      </ol>
    </Card>
  );
}
