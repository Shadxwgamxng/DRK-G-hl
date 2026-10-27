"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold">Es ist ein Fehler aufgetreten</h1>
      <p className="mt-2 text-sm text-gray-600">Bitte versuchen Sie es erneut. Besteht das Problem weiter, informieren Sie die Administration{error.digest ? ` (Fehler-ID ${error.digest})` : ""}.</p>
      <button onClick={reset} className="mt-6 min-h-12 rounded-lg bg-drk-500 px-4 font-semibold text-white">Erneut versuchen</button>
    </main>
  );
}
