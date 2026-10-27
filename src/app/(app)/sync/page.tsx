import { requireActiveActor } from "@/server/auth/current";
import { PageHeader } from "@/components/ui";
import { SyncList } from "@/components/sync";

export const metadata = { title: "Synchronisation" };

export default async function SyncPage() {
  const actor = await requireActiveActor();
  return (
    <>
      <PageHeader title="Synchronisation" subtitle="Offline erfasste Vorgänge auf diesem Gerät" />
      <SyncList userId={actor.id} />
    </>
  );
}
