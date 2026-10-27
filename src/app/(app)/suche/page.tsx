import Link from "next/link";
import { Search } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { globalSearch } from "@/server/services/search";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Suche" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const q = (await searchParams).q ?? "";
  const hits = await globalSearch(actor, q);
  return (
    <>
      <PageHeader title="Suche" subtitle={q ? `Ergebnisse für „${q}“` : undefined} />
      <form className="filterbar mb-4 flex gap-2 p-3" role="search">
        <input name="q" defaultValue={q} className="input" placeholder="Fahrzeug, Kennzeichen, Material, Chargennr., Mangel …" aria-label="Suchbegriff" autoFocus />
        <button className="min-h-12 rounded-lg bg-drk-500 px-4 font-semibold text-white">Suchen</button>
      </form>
      {q.trim().length < 2 ? (
        <EmptyState icon={<Search className="h-10 w-10" />} title="Mindestens 2 Zeichen eingeben" />
      ) : hits.length === 0 ? (
        <EmptyState icon={<Search className="h-10 w-10" />} title="Keine Treffer">Es werden nur Datensätze angezeigt, auf die Sie Zugriff haben.</EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-gray-100">
            {hits.map((h, i) => (
              <li key={i}>
                <Link href={h.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-gray-50">
                  <Badge>{h.type}</Badge>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-sm text-gray-600">{h.subtitle}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
