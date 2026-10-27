"use client";

import { useRef } from "react";
import type { ActionState } from "@/lib/action-state";
import { toDateInput } from "@/lib/format";
import { ActionForm, SelectInput, SubmitButton, TextArea, TextInput } from "./forms";
import { Uploader } from "./Uploader";

type T = { id: string; key: string | null; name: string; defaultIntervalValue: number | null; defaultIntervalUnit: string | null; defaultReminderDays: number[] };

export function InspectionForm({
  action,
  types,
  users,
  value,
  defaultTypeId,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  types: T[];
  users: { id: string; firstName: string; lastName: string }[];
  value?: { typeId: string; title: string; dueDate: Date; lastDate: Date | null; intervalValue: number | null; intervalUnit: string | null; assignedToId: string | null; workshop: string | null; estimatedCost: string | null; remarks: string | null; reminderDays: number[] };
  defaultTypeId?: string;
  submitLabel: string;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const autoTitle = useRef<string>("");
  const shortTitle = (t?: T) => (!t ? "" : t.key === "HU" ? "TÜV (HU/AU)" : t.key === "SP" ? "TÜV (SP)" : t.name);
  const initialType = types.find((t) => t.id === (value?.typeId ?? defaultTypeId));
  if (!value && !autoTitle.current) autoTitle.current = shortTitle(initialType);
  // Bezeichnung automatisch vorbelegen, solange sie nicht von Hand geändert wurde
  const onTypeChange = (typeId: string) => {
    const el = titleRef.current;
    if (!el || (el.value && el.value !== autoTitle.current)) return;
    autoTitle.current = shortTitle(types.find((t) => t.id === typeId));
    el.value = autoTitle.current;
  };
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectInput label="Art der Prüfung" name="typeId" required defaultValue={value?.typeId ?? defaultTypeId} onChange={(e) => onTypeChange(e.target.value)} placeholder="Bitte wählen" options={types.map((t) => ({ value: t.id, label: t.name }))} />
        <TextInput ref={titleRef} label="Bezeichnung" name="title" required defaultValue={value?.title ?? (autoTitle.current || undefined)} placeholder="z. B. TÜV, Defibrillator STK" />
        <TextInput label="Fälligkeitsdatum" name="dueDate" type="date" required defaultValue={toDateInput(value?.dueDate)} />
        <TextInput label="Letztes Prüfdatum" name="lastDate" type="date" defaultValue={toDateInput(value?.lastDate)} />
        <TextInput label="Intervall" name="intervalValue" type="number" min={1} defaultValue={value?.intervalValue ?? ""} hint="Leer lassen bei einmaligen Terminen. Fristen bitte fahrzeug-/gerätespezifisch festlegen." />
        <SelectInput label="Intervall-Einheit" name="intervalUnit" defaultValue={value?.intervalUnit ?? ""} placeholder="–" options={[{ value: "DAYS", label: "Tage" }, { value: "MONTHS", label: "Monate" }, { value: "YEARS", label: "Jahre" }]} />
        <SelectInput label="Zuständige Person" name="assignedToId" defaultValue={value?.assignedToId ?? ""} placeholder="– niemand –" options={users.map((u) => ({ value: u.id, label: `${u.lastName}, ${u.firstName}` }))} />
        <TextInput label="Werkstatt / Prüfstelle" name="workshop" defaultValue={value?.workshop ?? ""} />
        <TextInput label="Kosten (geschätzt, €)" name="estimatedCost" inputMode="decimal" defaultValue={value?.estimatedCost ?? ""} />
        <TextInput label="Erinnerungen (Tage vorher)" name="reminderDaysText" defaultValue={(value?.reminderDays ?? [30, 14, 7]).join(", ")} hint="z. B. 30, 14, 7 – überfällige Termine werden immer gemeldet" />
      </div>
      <TextArea label="Bemerkungen" name="remarks" defaultValue={value?.remarks ?? ""} />
      <Uploader label="Prüfbericht / Dokumente (optional)" />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
