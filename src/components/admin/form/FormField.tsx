import type { ReactNode } from "react";
import { get, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Loose on purpose: any useForm result (with any resolver input/output types) is accepted. */
export type AnyForm = Pick<UseFormReturn<any, any, any>, "register" | "watch" | "setValue"> & {
  formState: { errors: any };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

type BaseProps = {
  form: AnyForm;
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
};

function useFieldIds(form: AnyForm, name: string, hint?: string) {
  const error = (get(form.formState.errors as FieldValues, name) as { message?: string } | undefined)?.message;
  const id = `field-${name.replace(/[^\w-]/g, "-")}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { id, hintId, errorId, error, describedBy };
}

export function FieldShell({
  id,
  label,
  required,
  hint,
  hintId,
  error,
  errorId,
  inline,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  const labelEl = (
    <Label htmlFor={id}>
      {label}
      {required ? " (required)" : ""}
    </Label>
  );
  return (
    <div className="space-y-1">
      {inline ? (
        <div className="flex items-center gap-2">
          {children}
          {labelEl}
        </div>
      ) : (
        <>
          {labelEl}
          {children}
        </>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  form,
  name,
  label,
  hint,
  required,
  type = "text",
  maxLength,
}: BaseProps & { type?: string; maxLength?: number }) {
  const f = useFieldIds(form, name, hint);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId}>
      <Input
        id={f.id}
        type={type}
        maxLength={maxLength}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={f.describedBy}
        {...form.register(name)}
      />
    </FieldShell>
  );
}

export function TextareaField({ form, name, label, hint, required, rows = 4 }: BaseProps & { rows?: number }) {
  const f = useFieldIds(form, name, hint);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId}>
      <Textarea
        id={f.id}
        rows={rows}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={f.describedBy}
        {...form.register(name)}
      />
    </FieldShell>
  );
}

export function SwitchField({ form, name, label, hint, required }: BaseProps) {
  const f = useFieldIds(form, name, hint);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} inline>
      <Switch
        id={f.id}
        name={name}
        checked={Boolean(form.watch(name))}
        onCheckedChange={(v) => form.setValue(name, v, { shouldDirty: true, shouldValidate: true })}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={f.describedBy}
      />
    </FieldShell>
  );
}

export function SelectField({
  form,
  name,
  label,
  hint,
  required,
  options,
}: BaseProps & { options: { value: string; label: string }[] }) {
  const f = useFieldIds(form, name, hint);
  const value = form.watch(name) as string | undefined;
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId}>
      <Select
        value={value ?? ""}
        onValueChange={(v) => form.setValue(name, v, { shouldDirty: true, shouldValidate: true })}
      >
        <SelectTrigger id={f.id} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}
