"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ActionState } from "@/lib/action-state";
import { Alert, buttonClass, Field } from "./ui";

const FormCtx = createContext<ActionState>({});
export const useFormErrors = () => useContext(FormCtx).fieldErrors ?? {};

/**
 * Formular mit Server Action: zeigt Lade-, Fehler- und Erfolgszustände.
 * Server Actions sind von Next.js gegen CSRF geschützt (Origin-Prüfung, POST-only).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  successMessage = true,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void;
  successMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (state.ok && state.ts && state.ts !== seen) {
      setSeen(state.ts);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, seen, resetOnSuccess, onSuccess]);
  return (
    <FormCtx.Provider value={state}>
      <form ref={ref} action={formAction} className={clsx("space-y-4", className)} noValidate>
        {state.message && !state.ok && <Alert tone="error" title={state.message} />}
        {state.message && state.ok && successMessage && <Alert tone="success" title={state.message} />}
        {state.warning && <Alert tone="warning" title={state.warning} />}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, confirm, name, value }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "success"; size?: "md" | "lg" | "sm"; className?: string; confirm?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type InputProps = { label: string; name: string; required?: boolean; hint?: ReactNode; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & { ref?: React.Ref<HTMLInputElement> };

export function TextInput({ label, name, required, hint, className, ...rest }: InputProps) {
  const errors = useFormErrors();
  const id = useId();
  return (
    <Field label={label} name={id} error={errors[name]} hint={hint} required={required} className={className}>
      <input id={id} name={name} required={required} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${id}-error` : undefined} className="input" {...rest} />
    </Field>
  );
}

export function TextArea({ label, name, required, hint, className, rows = 3, ...rest }: { label: string; name: string; required?: boolean; hint?: ReactNode; className?: string; rows?: number } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const errors = useFormErrors();
  const id = useId();
  return (
    <Field label={label} name={id} error={errors[name]} hint={hint} required={required} className={className}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={Boolean(errors[name])} className="input" {...rest} />
    </Field>
  );
}

export function SelectInput({
  label,
  name,
  options,
  required,
  hint,
  className,
  placeholder,
  ...rest
}: { label: string; name: string; options: { value: string; label: string }[]; required?: boolean; hint?: ReactNode; className?: string; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const errors = useFormErrors();
  const id = useId();
  return (
    <Field label={label} name={id} error={errors[name]} hint={hint} required={required} className={className}>
      <select id={id} name={name} required={required} aria-invalid={Boolean(errors[name])} className="input" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, defaultChecked, hint, value }: { label: ReactNode; name: string; defaultChecked?: boolean; hint?: ReactNode; value?: string }) {
  const errors = useFormErrors();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg py-2">
        <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 accent-drk-500" />
        <span className="text-sm">
          {label}
          {hint && <span className="block text-xs text-gray-500">{hint}</span>}
        </span>
      </label>
      {errors[name] && <p className="text-sm font-medium text-drk-700">{errors[name]}</p>}
    </div>
  );
}

/** Kleines Inline-Formular für Einzelaktionen (z. B. Statuswechsel) mit optionaler Sicherheitsabfrage. */
export function InlineAction({ action, children, hidden, confirm, variant = "secondary", size = "sm" }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: ReactNode; hidden?: Record<string, string>; confirm?: string; variant?: "primary" | "secondary" | "danger" | "success"; size?: "sm" | "md" | "lg" }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} confirm={confirm}>
        {children}
      </SubmitButton>
      {state.message && <span className={clsx("text-xs", state.ok ? "text-green-700" : "text-drk-700")}>{state.message}</span>}
    </form>
  );
}
