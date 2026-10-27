import Link from "next/link";
import { DrkLogo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-100">
      <header className="border-b border-gray-300 bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {/* Logo auf Weiß, ≥ 60 px hoch, Schutzzone ≥ Balkenbreite des Kreuzes */}
        <div className="mx-auto max-w-lg px-4 py-6">
          <DrkLogo className="h-[72px] w-auto" priority />
          <p className="mt-4 text-lg font-bold text-drk-500">KFZ-Warte</p>
          <p className="text-sm text-gray-700">Fahrzeug-, Material- und Mängelverwaltung</p>
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
