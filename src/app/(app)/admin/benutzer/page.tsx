import Link from "next/link";
import { requireActiveActor } from "@/server/auth/current";
import { listUsers } from "@/server/services/users";
import { Alert, Badge, Card, PageHeader, TableWrap, type Tone } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { USER_STATUS } from "@/lib/labels";

export const metadata = { title: "Benutzer" };

const tone: Record<string, Tone> = { PENDING: "yellow", ACTIVE: "green", REJECTED: "gray", DISABLED: "gray", LOCKED: "red" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("users.manage");
  const sp = await searchParams;
  const users = await listUsers(actor, { status: sp.status && sp.status in USER_STATUS ? sp.status : undefined, q: sp.q });
  const pending = users.filter((u) => u.status === "PENDING").length;
  return (
    <>
      <PageHeader title="Benutzerverwaltung" subtitle={`${users.length} Benutzer`} />
      {pending > 0 && !sp.status && <Alert tone="warning" className="mb-4" title={`${pending} Registrierung(en) warten auf Freigabe`} />}
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-3">
        <input name="q" defaultValue={sp.q} placeholder="Name, Benutzername, E-Mail" className="input" aria-label="Suche" />
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status">
          <option value="">Alle Status</option>
          {Object.entries(USER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>
      <Card padded={false}>
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>Name</th><th>Status</th><th>Rolle</th><th>Fahrzeuge</th><th>Registriert</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.status === "PENDING" ? "bg-amber-50" : undefined}>
                  <td><Link href={`/admin/benutzer/${u.id}`} className="font-semibold hover:text-drkblue-600">{u.lastName}, {u.firstName}</Link><div className="text-xs text-gray-500">{u.username} · {u.email}{u.position ? ` · ${u.position}` : ""}</div></td>
                  <td><Badge tone={tone[u.status]}>{USER_STATUS[u.status]}</Badge></td>
                  <td>{u.role.name}</td>
                  <td>{u.assignments.map((a) => a.vehicle.name).join(", ") || <span className="text-gray-500">keine</span>}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
