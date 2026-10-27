import { TableWrap } from "./ui";
import { fmtDateTime } from "@/lib/format";
import { AUDIT_ACTION } from "@/lib/labels";

type Log = { id: string; createdAt: Date; action: string; entityType: string; entityId: string | null; oldValues: unknown; newValues: unknown; user: { firstName: string; lastName: string } | null; ip?: string | null };

function show(v: unknown) {
  if (v == null) return "";
  const s = JSON.stringify(v);
  return s.length > 400 ? s.slice(0, 400) + " …" : s;
}

export function AuditTable({ logs, showIp = false }: { logs: Log[]; showIp?: boolean }) {
  if (logs.length === 0) return <p className="p-4 text-sm text-gray-600">Keine Einträge.</p>;
  return (
    <TableWrap>
      <table className="table-base">
        <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Aktion</th><th>Datensatz</th><th>Alt</th><th>Neu</th>{showIp && <th>IP</th>}</tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
              <td className="whitespace-nowrap">{l.user ? `${l.user.firstName} ${l.user.lastName}` : "System"}</td>
              <td>{AUDIT_ACTION[l.action] ?? l.action}</td>
              <td className="text-xs text-gray-600">{l.entityType}<br />{l.entityId?.slice(-8)}</td>
              <td className="max-w-xs break-all font-mono text-xs text-gray-600">{show(l.oldValues)}</td>
              <td className="max-w-xs break-all font-mono text-xs">{show(l.newValues)}</td>
              {showIp && <td className="text-xs">{l.ip}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
