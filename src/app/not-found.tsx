import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center p-6 text-center">
      <p className="text-5xl font-black text-drk-500">404</p>
      <h1 className="mt-2 text-xl font-bold">Nicht gefunden</h1>
      <p className="mt-2 text-sm text-gray-600">Der Datensatz existiert nicht oder Sie haben keinen Zugriff darauf.</p>
      <Link href="/" className="mt-6 min-h-12 rounded-lg bg-drk-500 px-4 py-3 font-semibold text-white">Zur Übersicht</Link>
    </main>
  );
}
