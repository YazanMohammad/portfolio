import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { ProjectInput } from "@shared/index";
import { FieldShell, type AnyForm } from "./FormField";
import { fieldError, fieldId } from "./input-utils";

// Limits come from the shared ProjectInput.technologies schema (zod 3 introspection), not literals.
const techSchema = ProjectInput.innerType().shape.technologies;
const maxOf = (checks: readonly { kind: string; value?: unknown }[]) =>
  Number(checks.find((c) => c.kind === "max")?.value);
export const TAG_MAX_COUNT = Number(techSchema._def.maxLength?.value);
export const TAG_MAX_LENGTH = maxOf(techSchema.element._def.checks);

export function TagsInput({ form, name, label, max }: { form: AnyForm; name: string; label: string; max: number }) {
  const [draft, setDraft] = useState("");
  const tags = (form.watch(name) as string[] | undefined) ?? [];
  const id = fieldId(name);
  const error = fieldError(form, name);
  const full = tags.length >= max;
  const setTags = (next: string[]) => form.setValue(name, next, { shouldDirty: true, shouldValidate: true });

  const commit = () => {
    const tag = draft.trim().slice(0, TAG_MAX_LENGTH);
    if (!tag) return setDraft("");
    if (full) return setDraft("");
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <FieldShell
      id={id}
      label={label}
      hint={full ? `Maximum of ${max} tags reached.` : "Press Enter or comma to add a tag."}
      hintId={`${id}-hint`}
      error={error}
      errorId={error ? `${id}-error` : undefined}
    >
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded bg-muted px-2 text-xs text-foreground">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setTags(tags.filter((x) => x !== t))}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          maxLength={TAG_MAX_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
          onChange={(e) => setDraft(e.target.value.replace(",", ""))}
          onKeyDown={onKeyDown}
          className="h-6 min-w-24 flex-1 bg-transparent text-sm text-foreground outline-none"
        />
      </div>
    </FieldShell>
  );
}
