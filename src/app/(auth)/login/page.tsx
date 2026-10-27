import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton, TextInput } from "@/components/forms";
import { Alert, Card } from "@/components/ui";
import { loginAction } from "@/app/actions/auth";
import { getCurrentActor } from "@/server/auth/current";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const actor = await getCurrentActor();
  if (actor) redirect(actor.status === "PENDING" ? "/freigabe-ausstehend" : "/");
  return (
    <Card title="Anmelden">
      {sp.registriert && (
        <Alert tone="success" title="Registrierung eingegangen" className="mb-4">
          Ihr Konto wartet auf die Freigabe durch einen Administrator. Sie können sich bereits anmelden, sehen Fahrzeugdaten aber erst nach Freigabe und Fahrzeugzuweisung.
        </Alert>
      )}
      {sp.abgemeldet && <Alert tone="info" title="Sie wurden abgemeldet. Lokale Entwürfe wurden vom Gerät entfernt." className="mb-4" />}
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <TextInput label="Benutzername oder E-Mail" name="identifier" autoComplete="username" autoCapitalize="none" required />
        <TextInput label="Passwort" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton size="lg" className="w-full">
          Anmelden
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-gray-600">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="font-bold text-drkblue-700 hover:text-drkblue-600 underline">
          Jetzt registrieren
        </Link>
      </p>
    </Card>
  );
}
