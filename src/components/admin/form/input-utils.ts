import { get, type FieldValues } from "react-hook-form";
import type { AnyForm } from "./FormField";

export function fieldError(form: AnyForm, name: string): string | undefined {
  return (get(form.formState.errors as FieldValues, name) as { message?: string } | undefined)?.message;
}

export function fieldId(name: string): string {
  return `field-${name.replace(/[^\w-]/g, "-")}`;
}

export const selectClass =
  "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
