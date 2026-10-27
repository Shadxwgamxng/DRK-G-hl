import Link from "next/link";
import { DrkLogo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-100">
      <header className="border-b-4 border-drk-500 bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-lg px-4 py-5">
          <DrkLogo className="max-w-[340px]" priority />
          <p className="mt-3 text-sm font-semibold text-anthracite-800">KFZ-Warte · Fahrzeug-, Material- und Mängelverwaltung</p>
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
