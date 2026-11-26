import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnyForm } from "./FormField";
import { fieldError, fieldId } from "./input-utils";

export function BulletsField({
  form,
  name,
  label,
  max,
  maxLength,
}: {
  form: AnyForm;
  name: string;
  label: string;
  max: number;
  maxLength: number;
}) {
  const lines = (form.watch(name) as string[] | undefined) ?? [];
  const id = fieldId(name);
  const setLines = (next: string[]) => form.setValue(name, next, { shouldDirty: true, shouldValidate: true });
  const move = (i: number, by: -1 | 1) => {
    const next = [...lines];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setLines(next);
  };
  const listError = fieldError(form, name);

  return (
    <div className="space-y-1">
      <Label id={`${id}-label`}>{label}</Label>
      <ul className="space-y-2" aria-labelledby={`${id}-label`}>
        {lines.map((line, i) => {
          const n = i + 1;
          const lineLabel = `${label} ${n}`;
          const error = fieldError(form, `${name}.${i}`);
          const lineId = `${id}-${i}`;
          return (
            <li key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  id={lineId}
                  aria-label={lineLabel}
                  value={line}
                  maxLength={maxLength}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${lineId}-error` : undefined}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? e.target.value : l)))}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lineLabel} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${lineLabel} down`} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${lineLabel}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {error && (
                <p id={`${lineId}-error`} className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {listError && <p className="text-xs text-destructive">{listError}</p>}
      <Button type="button" variant="outline" size="sm" disabled={lines.length >= max} onClick={() => setLines([...lines, ""])}>
        <Plus aria-hidden="true" />
        Add bullet
      </Button>
    </div>
  );
}
