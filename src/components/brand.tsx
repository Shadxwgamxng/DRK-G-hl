import Image from "next/image";
import clsx from "clsx";

/** Rotkreuz-Zeichen (Vektor, aus dem Vereinslogo abgeleitet). */
export function RedCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 3 3" className={className} aria-hidden>
      <path fill="#e3000b" d="M1 0h1v1h1v1H2v1H1V2H0V1h1z" />
    </svg>
  );
}

/** Logo „Deutsches Rotes Kreuz – Ortsverein Göhl e.V. Bereitschaft“ (vom Ortsverein bereitgestellt). */
export function DrkLogo({ variant = "dark", className, priority }: { variant?: "dark" | "light"; className?: string; priority?: boolean }) {
  return (
    <Image
      src={variant === "light" ? "/brand/drk-goehl-logo-hell.png" : "/brand/drk-goehl-logo.png"}
      alt="Deutsches Rotes Kreuz – Ortsverein Göhl e.V. Bereitschaft"
      width={430}
      height={93}
      priority={priority}
      unoptimized
      className={clsx("h-auto w-full", className)}
    />
  );
}
