import { ExperienceInput, type Experience } from "@shared/index";
import { Switch } from "@/components/ui/switch";
import { FieldShell, TextField, type AnyForm } from "../form/FormField";
import { BulletsField } from "../form/BulletsField";
import { MonthYearField } from "../form/MonthYearField";
import { fieldError, fieldId } from "../form/input-utils";
import type { CollectionConfig } from "../list/types";
import { copyName, dateRange, maxOfField } from "./format";

const BULLETS_MAX = 10;
const BULLET_LENGTH = 300;
export const POSITION_MAX = maxOfField(ExperienceInput.innerType().innerType().shape.position);

export function experienceSubtitle(e: Experience): string | null {
  const parts = [e.company, dateRange(e.startDate, e.endDate, e.current)].filter(Boolean);
  return parts.length ? parts.join(" \u00b7 ") : null;
}

function CurrentField({ form }: { form: AnyForm }) {
  const id = fieldId("current");
  const error = fieldError(form, "current");
  const errorId = error ? `${id}-error` : undefined;
  return (
    <FieldShell id={id} label="I work here now" inline error={error} errorId={errorId}>
      <Switch
        id={id}
        name="current"
        checked={Boolean(form.watch("current"))}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onCheckedChange={(on) => {
          form.setValue("current", on, { shouldDirty: true });
          // Turning it on drops the end date; turning it off leaves End empty.
          form.setValue("endDate", null, { shouldDirty: true, shouldValidate: true });
        }}
      />
    </FieldShell>
  );
}

function ExperienceFormBody({ form }: { form: AnyForm; item: Experience | null }) {
  const current = Boolean(form.watch("current"));
  return (
    <>
      <TextField form={form} name="position" label="Position" required maxLength={100} />
      <TextField form={form} name="company" label="Company" maxLength={100} />
      <TextField form={form} name="location" label="Location" maxLength={100} />
      <MonthYearField form={form} name="startDate" label="Start" />
      <CurrentField form={form} />
      <MonthYearField form={form} name="endDate" label="End" disabled={current} />
      <BulletsField form={form} name="bullets" label="Bullets" max={BULLETS_MAX} maxLength={BULLET_LENGTH} />
    </>
  );
}

export const experienceConfig: CollectionConfig<Experience, ExperienceInput> = {
  collection: "experience",
  title: "Experience",
  singular: "experience",
  schema: ExperienceInput,
  knownFields: [
    "position",
    "company",
    "location",
    "startDate",
    "endDate",
    "current",
    "bullets",
    ...Array.from({ length: BULLETS_MAX }, (_, i) => `bullets.${i}`),
    "isVisible",
    "sortOrder",
  ],
  toInput: ({ id: _id, ...rest }) => rest,
  emptyInput: (sortOrder) => ({
    position: "",
    company: null,
    location: null,
    startDate: null,
    endDate: null,
    current: false,
    bullets: [],
    isVisible: false,
    sortOrder,
  }),
  duplicateInput: (item, _all, sortOrder) => {
    const { id: _id, ...rest } = item;
    return { ...rest, bullets: [...item.bullets], position: copyName(item.position, POSITION_MAX), isVisible: false, sortOrder };
  },
  rowTitle: (e) => e.position,
  rowSubtitle: experienceSubtitle,
  FormBody: ExperienceFormBody,
};
