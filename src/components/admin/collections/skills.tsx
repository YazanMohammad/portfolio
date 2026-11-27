import { SkillInput, type Skill } from "@shared/index";
import { SkillIconField } from "./SkillIconField";
import { Input } from "@/components/ui/input";
import { useAdminList } from "@/lib/admin/queries";
import { FieldShell, TextField, type AnyForm } from "../form/FormField";
import { fieldError, fieldId } from "../form/input-utils";
import type { CollectionConfig } from "../list/types";
import { copyName, maxOfField } from "./format";

export const SKILL_NAME_MAX = maxOfField(SkillInput.shape.name);

export function categoriesOf(skills: Skill[] | undefined): string[] {
  const set = new Set((skills ?? []).map((s) => s.category.trim()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function CategoryField({ form }: { form: AnyForm }) {
  const { data } = useAdminList<Skill>("skills");
  const id = fieldId("category");
  const listId = `${id}-options`;
  const error = fieldError(form, "category");
  return (
    <FieldShell id={id} label="Category" required error={error} errorId={error ? `${id}-error` : undefined}>
      <Input
        id={id}
        list={listId}
        maxLength={50}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...form.register("category")}
      />
      <datalist id={listId}>
        {categoriesOf(data).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </FieldShell>
  );
}

function SkillFormBody({ form }: { form: AnyForm; item: Skill | null }) {
  return (
    <>
      <TextField form={form} name="name" label="Name" required maxLength={50} />
      <CategoryField form={form} />
      <SkillIconField form={form} />
    </>
  );
}

export const skillsConfig: CollectionConfig<Skill, SkillInput> = {
  collection: "skills",
  title: "Skills",
  singular: "skill",
  schema: SkillInput,
  knownFields: ["name", "category", "iconSlug", "iconSvg", "isVisible", "sortOrder"],
  toInput: ({ id: _id, ...rest }) => rest,
  emptyInput: (sortOrder) => ({ name: "", category: "", iconSlug: null, iconSvg: null, isVisible: false, sortOrder }),
  duplicateInput: (item, _all, sortOrder) => {
    const { id: _id, ...rest } = item;
    return { ...rest, name: copyName(item.name, SKILL_NAME_MAX), isVisible: false, sortOrder };
  },
  rowTitle: (s) => s.name,
  // ListEditor has no grouping hook and types.ts is out of scope: category is the row subtitle.
  rowSubtitle: (s) => s.category || null,
  FormBody: SkillFormBody,
};
