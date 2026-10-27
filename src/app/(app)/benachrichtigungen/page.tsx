import Link from "next/link";
import { Bell } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { listNotifications } from "@/server/services/admin";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { InlineAction } from "@/components/forms";
import { markReadAction } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Benachrichtigungen" };

export default async function NotificationsPage() {
  const actor = await requireActiveActor();
  const items = await listNotifications(actor, false, 200);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Benachrichtigungen" subtitle={`${unread} ungelesen`} actions={unread > 0 && <InlineAction action={markReadAction.bind(null, undefined)} size="md">Alle als gelesen markieren</InlineAction>} />
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-12 w-12" />} title="Keine Benachrichtigungen" />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-gray-100">
            {items.map((n) => {
              const critical = n.type.includes("critical") || n.type.includes("overdue");
              return (
                <li key={n.id} className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${n.readAt ? "" : critical ? "bg-drk-50" : "bg-blue-50/50"}`}>
                  <div className="min-w-0">
                    <p className={`text-sm ${n.readAt ? "" : "font-bold"} ${critical ? "text-drk-700" : ""}`}>{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                    {n.body && <p className="text-sm text-gray-600">{n.body}</p>}
                    <p className="text-xs text-gray-500">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <InlineAction action={markReadAction.bind(null, [n.id])}>Gelesen</InlineAction>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
