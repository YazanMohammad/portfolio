import { useEffect, useRef } from "react";
import { ProjectInput, type Project } from "@shared/index";
import { Input } from "@/components/ui/input";
import { FieldShell, SwitchField, TextField, TextareaField, type AnyForm } from "../form/FormField";
import { ImageDropZone } from "../form/ImageDropZone";
import { MarkdownEditor } from "../form/MarkdownEditor";
import { TagsInput, TAG_MAX_COUNT } from "../form/TagsInput";
import { fieldError, fieldId } from "../form/input-utils";
import type { CollectionConfig } from "../list/types";
import { copyName } from "./format";

// Limits come from the shared ProjectInput schema (zod 3 introspection), not literals.
const shape = ProjectInput.innerType().shape;
const maxOf = (checks: readonly { kind: string; value?: unknown }[]) =>
  Number(checks.find((c) => c.kind === "max")?.value);
export const SLUG_MAX = maxOf(shape.slug._def.checks);
export const TITLE_MAX = maxOf(shape.title._def.checks);

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

function fitSlug(base: string, suffix: string): string {
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
}

function uniqueSlug(base: string, all: Project[]): string {
  const used = new Set(all.map((p) => p.slug));
  let candidate = fitSlug(base, "-copy");
  for (let n = 2; used.has(candidate); n++) candidate = fitSlug(base, `-copy-${n}`);
  return candidate;
}

function SlugField({ form, autoFill }: { form: AnyForm; autoFill: boolean }) {
  const touched = useRef(false);
  const title = (form.watch("title") as string | undefined) ?? "";
  const slug = (form.watch("slug") as string | undefined) ?? "";
  const id = fieldId("slug");
  const error = fieldError(form, "slug");
  const { onChange, ...rest } = form.register("slug");

  useEffect(() => {
    if (!autoFill || touched.current) return;
    const next = slugify(title);
    if (next !== form.watch("slug")) form.setValue("slug", next, { shouldDirty: true });
  }, [autoFill, title, form]);

  return (
    <FieldShell
      id={id}
      label="Slug"
      required
      hint={`/projects/${slug}`}
      hintId={`${id}-hint`}
      error={error}
      errorId={error ? `${id}-error` : undefined}
    >
      <Input
        id={id}
        maxLength={SLUG_MAX}
        aria-invalid={error ? true : undefined}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
        {...rest}
        onChange={(e) => {
          touched.current = true;
          return onChange(e);
        }}
      />
    </FieldShell>
  );
}

function ProjectFormBody({ form, item }: { form: AnyForm; item: Project | null }) {
  return (
    <>
      <TextField form={form} name="title" label="Title" required />
      <SlugField form={form} autoFill={item === null} />
      <TextareaField form={form} name="summary" label="Summary" required rows={3} />
      <TextField form={form} name="category" label="Category" required />
      <TextField form={form} name="role" label="Role" />
      <TagsInput form={form} name="technologies" label="Technologies" max={TAG_MAX_COUNT} />
      <TextField form={form} name="liveUrl" label="Live URL" />
      <TextField form={form} name="githubUrl" label="GitHub URL" />
      <ImageDropZone form={form} keyName="imageKey" altName="imageAlt" label="Image" />
      <MarkdownEditor form={form} name="body" label="Write-up" />
      <SwitchField form={form} name="featured" label="Featured" />
    </>
  );
}

export const projectsConfig: CollectionConfig<Project, ProjectInput> = {
  collection: "projects",
  title: "Projects",
  singular: "project",
  schema: ProjectInput,
  knownFields: [
    "title",
    "slug",
    "summary",
    "category",
    "role",
    "technologies",
    "liveUrl",
    "githubUrl",
    "imageKey",
    "imageAlt",
    "body",
    "featured",
    "isVisible",
    "sortOrder",
  ],
  conflictField: "slug",
  toInput: ({ id: _id, ...rest }) => rest,
  emptyInput: (sortOrder) => ({
    slug: "",
    title: "",
    summary: "",
    body: "",
    role: null,
    category: "",
    technologies: [],
    liveUrl: null,
    githubUrl: null,
    imageKey: null,
    imageAlt: null,
    featured: false,
    isVisible: false,
    sortOrder,
  }),
  duplicateInput: (item, all, sortOrder) => {
    const { id: _id, ...rest } = item;
    return {
      ...rest,
      title: copyName(item.title, TITLE_MAX),
      slug: uniqueSlug(item.slug, all),
      imageKey: null,
      imageAlt: null,
      isVisible: false,
      sortOrder,
    };
  },
  rowTitle: (p) => p.title,
  rowSubtitle: (p) => p.category || null,
  FormBody: ProjectFormBody,
};
