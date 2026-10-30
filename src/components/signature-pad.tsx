"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eraser, PenLine, RotateCw, X } from "lucide-react";
import { Button } from "./ui";

/**
 * Unterschriftenfeld im Querformat (Vollbild).
 * - Android: Vollbild + Bildschirmausrichtung „quer“ wird angefordert.
 * - iPhone/hochkant: Das Feld wird um 90° gedreht dargestellt – Handy einfach quer halten.
 */
export function SignaturePad({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: (pngDataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0, rotate: false });

  const measure = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    setView({ w, h, rotate: Boolean(touch && h > w) });
  }, []);

  // Vollbild + Querformat anfordern (wo vom Browser unterstützt), beim Schließen zurücksetzen
  useEffect(() => {
    measure();
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    (async () => {
      if (!touch) return;
      try {
        await document.documentElement.requestFullscreen?.();
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
      } catch {
        /* nicht unterstützt (z. B. iOS) – gedrehte Darstellung übernimmt */
      }
      measure();
    })();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* egal */
      }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [measure]);

  // Zeichenfläche an die Größe anpassen (löscht bei Größenänderung die Unterschrift)
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !view.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(c.offsetWidth * dpr);
    c.height = Math.round(c.offsetHeight * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#002d55";
    setHasInk(false);
  }, [view]);

  /** Bildschirmkoordinaten → Koordinaten auf der (ggf. gedrehten) Zeichenfläche */
  const point = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    if (!view.rotate) {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    // Container ist um 90° im Uhrzeigersinn gedreht und bei x = Bildschirmbreite verankert
    const xc = e.clientY;
    const yc = view.w - e.clientX;
    // Versatz der Zeichenfläche innerhalb des gedrehten Containers (ungedrehte Layout-Koordinaten)
    let ox = 0;
    let oy = 0;
    for (let el: HTMLElement | null = c; el && el !== boxRef.current; el = el.offsetParent as HTMLElement | null) {
      ox += el.offsetLeft;
      oy += el.offsetTop;
    }
    return { x: xc - ox, y: yc - oy };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#002d55";
    ctx.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const confirm = () => {
    const c = canvasRef.current!;
    // verkleinert auf weißem Grund exportieren (klein genug für die Übertragung)
    const out = document.createElement("canvas");
    const scale = Math.min(1, 700 / c.width);
    out.width = Math.round(c.width * scale);
    out.height = Math.round(c.height * scale);
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0, out.width, out.height);
    onConfirm(out.toDataURL("image/png"));
  };

  const box: React.CSSProperties = view.rotate
    ? { position: "fixed", top: 0, left: view.w, width: view.h, height: view.w, transform: "rotate(90deg)", transformOrigin: "top left" }
    : { position: "fixed", inset: 0 };

  return (
    <div className="fixed inset-0 z-[70] bg-drkblue-900/60" role="dialog" aria-modal="true" aria-label="Unterschrift">
      <div ref={boxRef} style={box} className={view.rotate ? "flex flex-col bg-white" : "anim-pop flex flex-col bg-white"}>
        <div className="flex items-center justify-between gap-3 border-b border-gray-300 px-4 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold text-drk-500"><PenLine className="h-5 w-5" aria-hidden /> Bitte unterschreiben</p>
            <p className="truncate text-xs text-gray-600">Mit der Unterschrift bestätigen Sie die Richtigkeit der Angaben.</p>
          </div>
          {view.rotate && <span className="hidden items-center gap-1 text-xs text-gray-500 sm:flex"><RotateCw className="h-4 w-4" /> Handy quer halten</span>}
          <button type="button" onClick={onCancel} className="rounded-sm p-2 text-gray-600 hover:bg-gray-100" aria-label="Abbrechen"><X className="h-6 w-6" /></button>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          />
          {/* Unterschriftslinie */}
          <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b-2 border-gray-400" />
          <span className="pointer-events-none absolute bottom-11 left-8 text-2xl text-gray-400">✕</span>
          <span className="pointer-events-none absolute bottom-3 left-8 text-sm text-gray-600">{name || "Unterschrift"}</span>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-300 px-4 py-2">
          <Button type="button" variant="secondary" size="sm" onClick={clear} disabled={!hasInk}><Eraser className="h-4 w-4" /> Löschen</Button>
          <Button type="button" size="md" onClick={confirm} disabled={!hasInk}>Unterschreiben &amp; melden</Button>
        </div>
      </div>
    </div>
  );
}
