"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";
import { listDrafts } from "@/lib/offline-store";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  return null;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Zeigt Offline-Status und Anzahl nicht synchronisierter Vorgänge in der Kopfzeile. */
export function SyncIndicator({ userId }: { userId: string }) {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => listDrafts(userId).then((d) => setPending(d.length)).catch(() => undefined);
    load();
    window.addEventListener("drk-drafts-changed", load);
    return () => window.removeEventListener("drk-drafts-changed", load);
  }, [userId]);
  if (online && pending === 0) return null;
  return (
    <Link
      href="/sync"
      className={`focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${online ? "bg-amber-100 text-amber-900" : "bg-anthracite-800 text-white"}`}
      title="Synchronisationsstatus"
    >
      {online ? <RefreshCw className="h-4 w-4" aria-hidden /> : <CloudOff className="h-4 w-4" aria-hidden />}
      <span>{online ? `${pending} nicht synchronisiert` : `Offline${pending ? ` · ${pending} ausstehend` : ""}`}</span>
    </Link>
  );
}

/** Installationshinweis (Android: Browser-Prompt; iOS: Anleitung über „Teilen → Zum Home-Bildschirm“). */
export function InstallHint() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => void }) | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("drk-install-dismissed") === "1";
    } catch {
      /* ignore */
    }
    if (standalone || dismissed) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setHidden(false);
    const h = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt: () => void });
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden || (!prompt && !ios)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("drk-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <span>
        {ios ? (
          <>
            <b>Als App installieren:</b> In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.
          </>
        ) : (
          <>
            <b>KFZ-Warte als App installieren</b> – schneller Zugriff, auch bei schlechter Verbindung.
          </>
        )}
      </span>
      <span className="flex gap-2">
        {prompt && (
          <button className="min-h-10 rounded-lg bg-drk-500 px-3 font-semibold text-white" onClick={() => prompt.prompt()}>
            Installieren
          </button>
        )}
        <button className="min-h-10 rounded-lg px-3 font-semibold text-gray-600 hover:bg-gray-100" onClick={dismiss}>
          Ausblenden
        </button>
      </span>
    </div>
  );
}
