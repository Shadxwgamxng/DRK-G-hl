import Link from "next/link";
import { ActionForm, Checkbox, SubmitButton, TextInput } from "@/components/forms";
import { Card } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";

export const metadata = { title: "Registrieren" };

export default function RegisterPage() {
  return (
    <Card title="Registrieren">
      <p className="mb-4 text-sm text-gray-600">Nach der Registrierung prüft ein Administrator Ihre Anfrage und weist Ihnen ein Fahrzeug zu. Erst danach sind Fahrzeugdaten sichtbar.</p>
      <ActionForm action={registerAction}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Vorname" name="firstName" autoComplete="given-name" required />
          <TextInput label="Nachname" name="lastName" autoComplete="family-name" required />
        </div>
        <TextInput label="Benutzername" name="username" autoComplete="username" autoCapitalize="none" required hint="3–40 Zeichen: Buchstaben, Ziffern, Punkt, - und _" />
        <TextInput label="E-Mail-Adresse" name="email" type="email" autoComplete="email" required />
        <TextInput label="Funktion / Dienststellung" name="position" hint="optional, z. B. Rettungssanitäter, KFZ-Wart" />
        <TextInput label="Passwort" name="password" type="password" autoComplete="new-password" required hint="Mindestens 10 Zeichen, Buchstaben und Ziffern/Sonderzeichen" />
        <TextInput label="Passwort bestätigen" name="passwordConfirm" type="password" autoComplete="new-password" required />
        <Checkbox
          name="acceptTerms"
          label={
            <>
              Ich akzeptiere die{" "}
              <Link href="/nutzungsbedingungen" target="_blank" className="font-semibold underline">
                Nutzungsbedingungen
              </Link>{" "}
              und habe die{" "}
              <Link href="/datenschutz" target="_blank" className="font-semibold underline">
                Datenschutzhinweise
              </Link>{" "}
              gelesen. *
            </>
          }
        />
        <SubmitButton size="lg" className="w-full">
          Registrierung absenden
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-gray-600">
        Bereits registriert?{" "}
        <Link href="/login" className="font-semibold text-drk-600 underline">
          Anmelden
        </Link>
      </p>
    </Card>
  );
}
