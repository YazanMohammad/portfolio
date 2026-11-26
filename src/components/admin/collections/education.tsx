import { EducationInput, type Education } from "@shared/index";
import { Textarea } from "@/components/ui/textarea";
import { FieldShell, TextField, type AnyForm } from "../form/FormField";
import { fieldError, fieldId } from "../form/input-utils";
import { MonthYearField } from "../form/MonthYearField";
import type { CollectionConfig } from "../list/types";
import { copyName, dateRange, maxOfField } from "./format";

const shape = EducationInput.innerType().shape;
export const DEGREE_MAX = maxOfField(shape.degree);
export const DESCRIPTION_MAX = maxOfField(shape.description);

// TextareaField (form/) does not forward maxLength, so wire the same a11y attributes here.
function DescriptionField({ form }: { form: AnyForm }) {
  const id = fieldId("description");
  const error = fieldError(form, "description");
  const errorId = error ? `${id}-error` : undefined;
  return (
    <FieldShell id={id} label="Description" error={error} errorId={errorId}>
      <Textarea
        id={id}
        rows={4}
        maxLength={DESCRIPTION_MAX}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...form.register("description")}
      />
    </FieldShell>
  );
}

function EducationFormBody({ form }: { form: AnyForm; item: Education | null }) {
  return (
    <>
      <TextField form={form} name="degree" label="Degree" required maxLength={100} />
      <TextField form={form} name="school" label="School" required maxLength={100} />
      <TextField form={form} name="location" label="Location" />
      <MonthYearField form={form} name="startDate" label="Start" />
      <MonthYearField form={form} name="endDate" label="End" />
      <DescriptionField form={form} />
    </>
  );
}

export const educationConfig: CollectionConfig<Education, EducationInput> = {
  collection: "education",
  title: "Education",
  singular: "education",
  schema: EducationInput,
  knownFields: ["degree", "school", "location", "startDate", "endDate", "description", "isVisible", "sortOrder"],
  toInput: ({ id: _id, ...rest }) => rest,
  emptyInput: (sortOrder) => ({
    degree: "",
    school: "",
    location: null,
    startDate: null,
    endDate: null,
    description: null,
    isVisible: false,
    sortOrder,
  }),
  duplicateInput: (item, _all, sortOrder) => {
    const { id: _id, ...rest } = item;
    return { ...rest, degree: copyName(item.degree, DEGREE_MAX), isVisible: false, sortOrder };
  },
  rowTitle: (e) => e.degree,
  rowSubtitle: (e) => {
    const parts = [e.school, dateRange(e.startDate, e.endDate)].filter(Boolean);
    return parts.length ? parts.join(" \u00b7 ") : null;
  },
  FormBody: EducationFormBody,
};
