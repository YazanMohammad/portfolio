import { useEffect, useRef, useState } from "react";
import type { YearMonth } from "@shared/index";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AnyForm } from "./FormField";
import { fieldError, fieldId, selectClass } from "./input-utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function MonthYearField({
  form,
  name,
  label,
  disabled,
}: {
  form: AnyForm;
  name: string;
  label: string;
  disabled?: boolean;
}) {
  const value = (form.watch(name) as YearMonth | null | undefined) ?? null;
  const [partial, setPartial] = useState({ year: "", month: "" });
  const written = useRef<string | null>(value);
  // Follow external changes (reset, "current" toggle): drop any half-chosen draft.
  useEffect(() => {
    if (value !== written.current) {
      written.current = value;
      setPartial({ year: "", month: "" });
    }
  }, [value]);
  // form.reset() (and external setValue on this field) notify watchers even when the value
  // stays null, which the value effect above cannot see. Our own writes are flagged and skipped,
  // so mid-edit typing is never cleared and there is no feedback loop.
  const selfWrite = useRef(false);
  useEffect(() => {
    const sub = form.watch((_values: unknown, info: { name?: string }) => {
      if (selfWrite.current) return;
      if (info.name === undefined || info.name === name) setPartial({ year: "", month: "" });
    });
    return () => sub.unsubscribe();
  }, [form, name]);
  const [year, month] = value ? value.split("-") : [partial.year, partial.month];
  const id = fieldId(name);
  const error = fieldError(form, name);
  const last = new Date().getFullYear() + 1;
  const years = Array.from({ length: last - 1990 + 1 }, (_, i) => String(last - i));

  // A half-chosen date stays in local state; the stored value is null until both are picked.
  const set = (y: string, m: string) => {
    const next = y && m ? (`${y}-${m}` as YearMonth) : null;
    written.current = next;
    setPartial(next ? { year: "", month: "" } : { year: y, month: m });
    selfWrite.current = true;
    try {
      form.setValue(name, next, { shouldDirty: true, shouldValidate: true });
    } finally {
      selfWrite.current = false;
    }
  };
  return (
    <div className="space-y-1">
      <Label id={`${id}-label`}>{label}</Label>
      <div role="group" aria-labelledby={`${id}-label`} className="flex items-center gap-2">
        <select
          aria-label={`${label} month`}
          className={selectClass}
          disabled={disabled}
          value={month}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => set(year, e.target.value)}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          className={selectClass}
          disabled={disabled}
          value={year}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => set(e.target.value, month)}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !(value || year || month)} aria-label={`Clear ${label}`} onClick={() => set("", "")}>
          Clear
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
