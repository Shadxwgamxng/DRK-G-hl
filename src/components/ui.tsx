import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
const variants: Record<Variant, string> = {
  // DRK-Rot für Hauptaktionen, Dunkelrot als Hover; Dunkelblau für Sekundär-Buttons (Styleguide Webseite)
  primary: "bg-drk-500 text-white hover:bg-drk-600 active:bg-drk-600 disabled:bg-drk-200",
  secondary: "bg-white text-drkblue-900 border-2 border-drkblue-900 hover:bg-drkblue-50 disabled:border-gray-300 disabled:text-gray-400",
  danger: "bg-white text-drk-500 border-2 border-drk-500 hover:bg-drk-50 hover:text-drkblue-600",
  ghost: "text-drkblue-900 hover:bg-drkblue-50",
  success: "bg-drkblue-900 text-white hover:bg-drkblue-600",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "lg" | "sm" = "md", className?: string) {
  return clsx(
    "focus-ring inline-flex items-center justify-center gap-2 rounded-sm font-bold transition-colors disabled:cursor-not-allowed",
    size === "lg" && "min-h-14 px-5 text-base",
    size === "md" && "min-h-12 px-4 text-sm",
    size === "sm" && "min-h-9 px-3 text-sm",
    variants[variant],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, title, actions, children, padded = true }: { className?: string; title?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-300 px-4 py-3">
          {title && <h2 className="text-lg font-bold text-drk-500">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex min-h-9 items-center text-sm font-bold text-drkblue-900 hover:text-drkblue-600">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-drk-500 sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-gray-600">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const tones = {
  green: "bg-green-100 text-green-800 ring-green-600/20",
  yellow: "bg-amber-100 text-amber-900 ring-amber-600/30",
  orange: "bg-orange-100 text-orange-900 ring-orange-600/30",
  red: "bg-drk-100 text-drk-800 ring-drk-600/30",
  gray: "bg-gray-100 text-gray-700 ring-gray-500/20",
  blue: "bg-drkblue-50 text-drkblue-900 ring-drkblue-300",
  dark: "bg-drkblue-900 text-white ring-drkblue-900",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-bold ring-1 ring-inset", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "error"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = {
    info: { c: "border-drkblue-300 bg-drkblue-50 text-drkblue-900", I: Info }, // Hellblau-Infofläche, Schrift Dunkelblau
    success: { c: "border-green-200 bg-green-50 text-green-900", I: CheckCircle2 },
    warning: { c: "border-amber-300 bg-amber-50 text-amber-900", I: AlertTriangle },
    error: { c: "border-drk-200 bg-drk-50 text-drk-800", I: XCircle },
  }[tone];
  return (
    <div role={tone === "error" || tone === "warning" ? "alert" : "status"} className={clsx("flex gap-3 rounded-lg border p-3 text-sm", map.c, className)}>
      <map.I className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center border border-gray-300 bg-white px-6 py-10 text-center">
      {icon && <div className="mb-3 text-drk-400">{icon}</div>}
      <p className="text-lg font-bold text-drk-500">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-gray-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatTile({ label, value, tone = "gray", href, icon, hint }: { label: string; value: number | string; tone?: Tone; href?: string; icon?: ReactNode; hint?: string }) {
  const accent = { green: "text-green-700", yellow: "text-amber-700", orange: "text-orange-700", red: "text-drk-500", gray: "text-drkblue-900", blue: "text-drkblue-600", dark: "text-drkblue-900" }[tone];
  const body = (
    <div className="card flex h-full items-start justify-between gap-2 p-4 transition-colors hover:border-drkblue-900">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-600">{label}</p>
        <p className={clsx("mt-1 text-3xl font-bold tabular-nums", accent)}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {icon && <div className={clsx("bg-drkblue-50 p-2", accent)}>{icon}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Field({ label, name, error, hint, required, children, className }: { label: string; name?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
        {required && <span className="text-drk-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && (
        <p id={name ? `${name}-error` : undefined} className="mt-1 text-sm font-medium text-drk-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wide text-gray-600">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-gray-700">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto sm:mx-0">{children}</div>;
}
