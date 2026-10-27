"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function VehicleTabs({ id, tabs }: { id: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto border-b border-gray-200 px-4 sm:mx-0 sm:px-0" aria-label="Fahrzeugbereiche">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const href = `/fahrzeuge/${id}${t.href}`;
          const active = t.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={t.href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={clsx("flex min-h-12 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold", active ? "border-drk-500 text-drk-600" : "border-transparent text-gray-600 hover:text-anthracite-900")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
