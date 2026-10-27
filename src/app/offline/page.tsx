export const metadata = { title: "Offline" };

/* Bewusst <a> statt <Link>: harte Navigation, damit der Service Worker greift. */
/* eslint-disable @next/next/no-html-link-for-pages */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/drk-goehl-logo.png" alt="Deutsches Rotes Kreuz – Ortsverein Göhl e.V. Bereitschaft" className="mb-6 w-72" />
      <h1 className="text-xl font-bold">Keine Verbindung</h1>
      <p className="mt-2 text-sm text-gray-600">
        Diese Seite wurde auf dem Gerät nicht zwischengespeichert. Bereits geöffnete Fahrzeugseiten, Kontroll-Checklisten und die Mängelmeldung sind offline verfügbar. Offline erfasste Vorgänge werden automatisch synchronisiert.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <a href="/sync" className="min-h-12 rounded-lg bg-drk-500 px-4 py-3 font-semibold text-white">Synchronisationsstatus</a>
        <a href="/" className="min-h-12 rounded-lg border border-gray-300 bg-white px-4 py-3 font-semibold">Erneut versuchen</a>
      </div>
    </main>
  );
}
