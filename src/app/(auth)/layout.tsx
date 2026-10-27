import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-100">
      <header className="bg-anthracite-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-drk-500 text-sm font-black text-white" aria-hidden>
            KW
          </span>
          <div className="leading-tight">
            <p className="font-bold text-white">KFZ-Warte</p>
            <p className="text-xs text-gray-400">DRK Göhl · Fahrzeug-, Material- und Mängelverwaltung</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">{children}</main>
      <footer className="pb-6 text-center text-xs text-gray-500">
        <Link href="/datenschutz" className="underline">
          Datenschutzhinweise
        </Link>{" "}
        ·{" "}
        <Link href="/nutzungsbedingungen" className="underline">
          Nutzungsbedingungen
        </Link>
      </footer>
    </div>
  );
}
