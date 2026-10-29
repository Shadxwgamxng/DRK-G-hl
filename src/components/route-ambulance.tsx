"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "drk-rtw-animation";
const isDisabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "aus";
  } catch {
    return false;
  }
};

/**
 * Kleine Animation beim Seitenwechsel: Ein RTW fährt mit Blaulicht durchs Bild.
 * Rein dekorativ (keine Bedienung blockiert), entfällt bei „Bewegung reduzieren“ im Betriebssystem.
 */
export function RouteAmbulance() {
  const pathname = usePathname();
  const first = useRef(true);
  const startedAt = useRef(0);
  const [run, setRun] = useState(0);

  const start = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || isDisabled()) return;
    if (Date.now() - startedAt.current < 1200) return; // läuft bereits
    startedAt.current = Date.now();
    setRun((n) => n + 1);
  };

  // Schon beim Klick auf einen internen Link losfahren – die neue Seite erscheint, während der RTW das Bild verdeckt
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname === location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Seitenwechsel ohne Link (z. B. nach dem Speichern eines Formulars)
  useEffect(() => {
    if (first.current) {
      first.current = false; // nicht beim ersten Laden
      return;
    }
    start();
  }, [pathname]);

  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setRun(0), 1500);
    return () => clearTimeout(t);
  }, [run]);

  if (!run) return null;
  return (
    <div key={run} className="rtw-drive" aria-hidden>
      <div className="rtw-bounce">
        <span className="rtw-speed" />
        <svg viewBox="0 0 230 104" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          {/* Schatten */}
          <ellipse cx="112" cy="97" rx="100" ry="5" fill="rgba(0,0,0,.18)" />
          {/* Kofferaufbau */}
          <rect x="8" y="14" width="146" height="66" rx="6" fill="#fff" stroke="#554f4a" strokeWidth="2.5" />
          {/* Fahrerhaus */}
          <path d="M154 30 h34 q8 0 12 8 l16 22 q3 5 3 10 v10 h-65 z" fill="#fff" stroke="#554f4a" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M162 36 h24 q4 0 6 4 l11 17 h-41 z" fill="#bfe3f5" stroke="#554f4a" strokeWidth="2" strokeLinejoin="round" />
          {/* rote Seitenstreifen */}
          <rect x="8" y="60" width="211" height="9" fill="#e60005" />
          <rect x="8" y="53" width="146" height="3" fill="#e60005" />
          {/* Rotes Kreuz */}
          <g fill="#e60005">
            <rect x="66" y="22" width="12" height="32" />
            <rect x="56" y="32" width="32" height="12" />
          </g>
          {/* Heckfenster und Tür */}
          <rect x="18" y="22" width="22" height="16" rx="2" fill="#bfe3f5" stroke="#554f4a" strokeWidth="1.5" />
          <line x1="104" y1="18" x2="104" y2="78" stroke="#b4b4b4" strokeWidth="1.5" />
          {/* Blaulichter */}
          <rect className="rtw-blue rtw-blue-a" x="14" y="6" width="16" height="8" rx="2" />
          <rect className="rtw-blue rtw-blue-b" x="136" y="6" width="16" height="8" rx="2" />
          <rect className="rtw-blue rtw-blue-b" x="168" y="24" width="14" height="6" rx="2" />
          {/* Scheinwerfer */}
          <rect x="213" y="64" width="7" height="6" rx="1.5" fill="#ffd34d" />
          <path className="rtw-beam" d="M220 63 l30 -8 v24 z" fill="rgba(255,211,77,.35)" />
          {/* Räder */}
          {[48, 184].map((x) => (
            <g key={x} className="rtw-wheel" style={{ transformOrigin: `${x}px 82px` }}>
              <circle cx={x} cy="82" r="14" fill="#2d2a27" />
              <circle cx={x} cy="82" r="6.5" fill="#b4b4b4" />
              <rect x={x - 1.5} y="70" width="3" height="24" fill="#2d2a27" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** Schalter im Profil (gilt für dieses Gerät). */
export function AmbulanceToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(!isDisabled()), []);
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        className="h-6 w-6 accent-drk-500"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          try {
            if (e.target.checked) localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, "aus");
          } catch {
            /* Speicher nicht verfügbar – Einstellung gilt nur bis zum Neuladen */
          }
        }}
      />
      <span>
        <span className="font-semibold">RTW-Animation beim Seitenwechsel</span>
        <span className="block text-xs text-gray-500">Gilt für dieses Gerät. Bei „Bewegung reduzieren“ im Betriebssystem immer aus.</span>
      </span>
    </label>
  );
}
