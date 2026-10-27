import { AppShell } from "@/components/AppShell";
import { requireActiveActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActiveActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
