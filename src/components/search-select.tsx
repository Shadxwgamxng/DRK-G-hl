"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { Field } from "./ui";
import { useFormErrors } from "./forms";
import { matches } from "@/lib/search-match";

export type SearchOption = { value: string; label: string; detail?: string };

/**
 * Suchfeld mit Vorschlagsliste statt langer Auswahlliste. Schickt die gewählte ID unter `name` mit.
 * Bedienung: tippen, mit ↑/↓ wählen, Enter übernimmt, Esc schließt.
 */
export function SearchSelect({
  label,
  name,
  options,
  required,
  hint,
  className,
  placeholder = "Tippen zum Suchen …",
  maxResults = 60,
}: {
  label: string;
  name: string;
  options: SearchOption[];
  required?: boolean;
  hint?: string;
  className?: string;
  placeholder?: string;
  maxResults?: number;
}) {
  const errors = useFormErrors();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    const all = q ? options.filter((o) => matches(`${o.label} ${o.detail ?? ""}`, q)) : options;
    return { total: all.length, shown: all.slice(0, maxResults) };
  }, [options, query, maxResults]);

  // Formular-Reset (z. B. nach dem Speichern) leert auch die Suche
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setQuery("");
      setValue("");
      setOpen(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: SearchOption) => {
    setValue(o.value);
    setQuery(o.label);
    setOpen(false);
  };

  const error = errors[name];
  return (
    <Field label={label} name={id} error={error} hint={hint} required={required} className={className}>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.shown[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          className={clsx("input pl-10 pr-10", value && "font-semibold")}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setValue("");
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, results.shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              if (open && results.shown[active]) {
                e.preventDefault(); // nicht das Formular abschicken
                choose(results.shown[active]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Auswahl löschen"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-gray-500 hover:bg-gray-100"
            onClick={() => {
              setQuery("");
              setValue("");
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {open && (
          <ul ref={listRef} id={listId} role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-sm border border-gray-300 bg-white shadow-lg">
            {results.shown.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-500">Keine Treffer für „{query}“</li>
            ) : (
              results.shown.map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={clsx("cursor-pointer px-3 py-2", i === active ? "bg-drkblue-50" : "hover:bg-gray-50", o.value === value && "font-semibold")}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                >
                  <span className="block text-sm text-gray-800">{o.label}</span>
                  {o.detail && <span className="block text-xs text-gray-500">{o.detail}</span>}
                </li>
              ))
            )}
            {results.total > results.shown.length && (
              <li className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">{results.total - results.shown.length} weitere – bitte genauer suchen</li>
            )}
          </ul>
        )}
      </div>
    </Field>
  );
}
