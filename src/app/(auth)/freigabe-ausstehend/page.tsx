import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { getCurrentActor } from "@/server/auth/current";
import { logoutAction, refreshStatusAction } from "@/app/actions/auth";

export const metadata = { title: "Freigabe ausstehend" };
export const dynamic = "force-dynamic";

export default async function PendingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.status === "ACTIVE") redirect("/");
  const sp = await searchParams;
  return (
    <Card>
      <div className="flex flex-col items-center text-center">
        <Clock className="h-12 w-12 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-xl font-bold">Wartet auf Freigabe</h1>
        <p className="mt-2 text-sm text-gray-600">
          Hallo {actor.firstName}, Ihre Registrierung ist eingegangen. Ein Administrator muss Ihr Konto freigeben und Ihnen ein Fahrzeug zuweisen. Bis dahin sind keine Fahrzeugdaten sichtbar.
        </p>
        {sp.geprueft && <Alert tone="info" title="Ihr Konto ist noch nicht freigegeben." className="mt-4 w-full text-left" />}
        <div className="mt-6 flex w-full flex-col gap-2">
          <form action={refreshStatusAction}>
            <button className="min-h-12 w-full rounded-lg bg-drk-500 px-4 font-semibold text-white">Status erneut prüfen</button>
          </form>
          <form action={logoutAction}>
            <button className="min-h-12 w-full rounded-lg border border-gray-300 bg-white px-4 font-semibold">Abmelden</button>
          </form>
        </div>
      </div>
    </Card>
  );
}
