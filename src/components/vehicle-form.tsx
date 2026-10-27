"use client";

import type { ActionState } from "@/lib/action-state";
import { ActionForm, SelectInput, SubmitButton, TextArea, TextInput } from "./forms";
import { Uploader } from "./Uploader";
import { toDateInput } from "@/lib/format";

type V = {
  name?: string;
  radioCallSign?: string | null;
  internalNumber?: string;
  licensePlate?: string;
  typeId?: string;
  manufacturer?: string | null;
  model?: string | null;
  buildYear?: number | null;
  firstRegistration?: Date | null;
  mileage?: number | null;
  location?: string | null;
  responsibleUserId?: string | null;
  remarks?: string | null;
  checkIntervalDays?: number;
};

export function VehicleForm({
  action,
  vehicle = {},
  types,
  users,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  vehicle?: V;
  types: { id: string; name: string }[];
  users: { id: string; firstName: string; lastName: string }[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Fahrzeugname" name="name" defaultValue={vehicle.name} required placeholder="z. B. RTW 1" />
        <TextInput label="Funkrufname" name="radioCallSign" defaultValue={vehicle.radioCallSign ?? ""} placeholder="z. B. Rotkreuz Göhl 83-1" />
        <TextInput label="Interne Fahrzeugnummer" name="internalNumber" defaultValue={vehicle.internalNumber} required />
        <TextInput label="Kennzeichen" name="licensePlate" defaultValue={vehicle.licensePlate} required autoCapitalize="characters" />
        <SelectInput label="Fahrzeugtyp" name="typeId" defaultValue={vehicle.typeId} required placeholder="Bitte wählen" options={types.map((t) => ({ value: t.id, label: t.name }))} hint="Weitere Typen unter Einstellungen anlegen" />
        <TextInput label="Kontrollintervall (Tage)" name="checkIntervalDays" type="number" inputMode="numeric" min={1} max={365} defaultValue={vehicle.checkIntervalDays ?? 7} required hint="Nach wie vielen Tagen die nächste Fahrzeugkontrolle fällig ist" />
        <TextInput label="Hersteller" name="manufacturer" defaultValue={vehicle.manufacturer ?? ""} />
        <TextInput label="Modell" name="model" defaultValue={vehicle.model ?? ""} />
        <TextInput label="Baujahr" name="buildYear" type="number" inputMode="numeric" defaultValue={vehicle.buildYear ?? ""} />
        <TextInput label="Erstzulassung" name="firstRegistration" type="date" defaultValue={toDateInput(vehicle.firstRegistration)} />
        <TextInput label="Kilometerstand" name="mileage" type="number" inputMode="numeric" defaultValue={vehicle.mileage ?? ""} />
        <TextInput label="Standort / Stellplatz" name="location" defaultValue={vehicle.location ?? ""} />
        <SelectInput label="Verantwortliche Person" name="responsibleUserId" defaultValue={vehicle.responsibleUserId ?? ""} placeholder="– keine –" options={users.map((u) => ({ value: u.id, label: `${u.lastName}, ${u.firstName}` }))} hint="Wird dem Fahrzeug automatisch zugewiesen" />
      </div>
      <TextArea label="Allgemeine Bemerkungen" name="remarks" defaultValue={vehicle.remarks ?? ""} rows={3} />
      <Uploader name="imageId" label="Fahrzeugbild (optional)" allowPdf={false} single />
      <SubmitButton size="lg">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
