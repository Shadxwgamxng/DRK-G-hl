import { Card } from "@/components/ui";

export const metadata = { title: "Datenschutzhinweise" };

export default function Page() {
  return (
    <Card title="Datenschutzhinweise (Vorlage)">
      <div className="space-y-3 text-sm leading-relaxed text-gray-700">
        <p className="rounded bg-amber-50 p-2 font-semibold text-amber-900">
          Hinweis: Diese Vorlage ist vom Betreiber (DRK Göhl) vor Inbetriebnahme mit dem/der Datenschutzbeauftragten abzustimmen und um Verantwortliche, Kontaktdaten und Rechtsgrundlagen zu ergänzen.
        </p>
        <p><b>Zweck:</b> Verwaltung von Einsatzfahrzeugen, Fahrzeugkontrollen, Prüfterminen, Material und Mängeln der KFZ-Warte.</p>
        <p><b>Verarbeitete Daten:</b> Name, Benutzername, E-Mail-Adresse, optionale Funktion, Rolle, Fahrzeugzuweisungen, Zeitpunkte von Anmeldungen sowie von Ihnen erfasste Vorgänge (Kontrollen, Mängel, Materialbuchungen) einschließlich hochgeladener Fotos.</p>
        <p><b>Nachvollziehbarkeit:</b> Änderungen werden mit Benutzer und Zeitpunkt protokolliert, um die Dokumentationspflichten der KFZ-Warte zu erfüllen.</p>
        <p><b>Speicherort:</b> Daten werden auf dem Server des Betreibers gespeichert. Auf Ihrem Gerät werden nur Offline-Entwürfe und zwischengespeicherte Seiten abgelegt; diese werden beim Abmelden entfernt.</p>
        <p><b>Löschung:</b> Bei Ausscheiden werden personenbezogene Kontodaten anonymisiert. Fachliche Dokumentation (z. B. Kontrollen) bleibt ohne Personenbezug erhalten, soweit Aufbewahrungspflichten bestehen.</p>
        <p><b>Ihre Rechte:</b> Auskunft (im Profil als Datenexport verfügbar), Berichtigung, Löschung bzw. Anonymisierung, Einschränkung und Widerspruch – wenden Sie sich an die Administration.</p>
      </div>
    </Card>
  );
}
