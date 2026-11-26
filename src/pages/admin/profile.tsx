import { useEffect, useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ProfileInput, type Profile } from "@shared/index";
import { useAdminProfile, useSaveProfile } from "@/lib/admin/queries";
import { applyServerError } from "@/components/admin/form/server-errors";
import { SaveBar } from "@/components/admin/form/SaveBar";
import { SwitchField, TextField, TextareaField } from "@/components/admin/form/FormField";
import { ImageDropZone } from "@/components/admin/form/ImageDropZone";
import { FileField } from "@/components/admin/form/FileField";
import { HeroPreview } from "@/components/admin/profile/HeroPreview";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

type FormIn = z.input<typeof ProfileInput>;

const KNOWN_FIELDS = Object.keys(ProfileInput.innerType().shape);

function toForm(p: Profile): FormIn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedAt, ...rest } = p;
  return rest;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function AdminProfile() {
  const query = useAdminProfile();
  const save = useSaveProfile();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormIn, unknown, ProfileInput>({
    resolver: zodResolver(ProfileInput) as unknown as Resolver<FormIn, unknown, ProfileInput>,
    defaultValues: query.data ? toForm(query.data) : undefined,
  });
  const { reset } = form;
  const { isDirty: dirty, isSubmitting } = form.formState;

  // Load data when it arrives; never overwrite edits on a background refetch.
  useEffect(() => {
    // A post-submit edit can revert to the old default (temporarily pristine).
    // The submit handler, not its awaited refetch, owns the save-time rebase.
    if (query.data && !form.formState.isDirty && !isSubmitting) reset(toForm(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, reset]);

  const submit = form.handleSubmit(async (values) => {
    // Compare raw form values, not resolver-normalized values (e.g. trimmed text).
    // Profile fields are scalar, including upload keys set by async completions.
    const submitted = { ...form.getValues() };
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      const baseline = toForm(saved);
      const laterEdits = Object.fromEntries(
        Object.entries(form.getValues()).filter(([key, value]) => value !== submitted[key as keyof FormIn]),
      );
      reset(baseline);
      // Keep the server response as defaults so later edits remain dirty and guarded.
      reset({ ...baseline, ...laterEdits }, { keepDefaultValues: true });
      toast.success("Saved");
    } catch (err) {
      setFormError(applyServerError(err, form.setError, { knownFields: KNOWN_FIELDS }));
    }
  });

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the profile. Reload the page to try again.
      </p>
    );
  }

  const w = form.watch();
  const preview = (
    <HeroPreview
      value={{
        name: w.name ?? "",
        headline: w.headline ?? "",
        intro: w.intro ?? "",
        available: !!w.available,
        availabilityText: (w.availabilityText as string | null | undefined) ?? null,
        photoKey: (w.photoKey as string | null | undefined) ?? null,
        photoAlt: (w.photoAlt as string | null | undefined) ?? null,
        cvKey: (w.cvKey as string | null | undefined) ?? null,
        email: w.email ?? "",
      }}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Profile</h1>
      <p className="admin-page-intro">The introduction, links and files people see on your site.</p>
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>Could not refresh the profile. Your edits are still here.</p>
          <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            Retry refresh
          </Button>
        </div>
      )}
      <div className="lg:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="preview">
            <AccordionTrigger>Show preview</AccordionTrigger>
            <AccordionContent>{preview}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <form
          id="profile-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="min-w-0 space-y-4"
        >
          <Section title="Basics">
            <TextField form={form} name="name" label="Name" hint="Your name, set large at the top of the site." required maxLength={100} />
            <TextField form={form} name="headline" label="Headline" hint="Your role, shown beside your name." required maxLength={80} />
          </Section>
          <Section title="Intro and about">
            <TextareaField form={form} name="intro" label="Intro" hint="A short introduction below your name." required rows={3} />
            <TextareaField form={form} name="about" label="About" hint="Leave a blank line between paragraphs." rows={8} />
          </Section>
          <Section title="Availability">
            <SwitchField form={form} name="available" label="Available for work" hint="Shows that you are open to new work." />
            <TextField form={form} name="availabilityText" label="Availability text" hint="A short status below your introduction." maxLength={120} />
          </Section>
          <Section title="Links">
            <TextField form={form} name="email" label="Email" hint="Where visitors can contact you." type="email" required />
            <TextField form={form} name="location" label="Location" hint="Your city or country, beside your role." maxLength={100} />
            <TextField form={form} name="githubUrl" label="GitHub URL" hint="The full address of your GitHub profile." />
            <TextField form={form} name="linkedinUrl" label="LinkedIn URL" hint="The full address of your LinkedIn profile." />
          </Section>
          <Section title="Photo and CV">
            <ImageDropZone form={form} keyName="photoKey" altName="photoAlt" label="Photo" />
            <FileField form={form} name="cvKey" label="CV" accept="pdf" />
          </Section>
          <SaveBar shell
            formId="profile-form"
            dirty={dirty}
            saving={save.isPending}
            formError={formError}
            onSave={() => submit()}
            onDiscard={() => {
              setFormError(null);
              reset();
            }}
          />
        </form>
        <aside className="hidden lg:block">
          <div className="sticky top-4">{preview}</div>
        </aside>
      </div>
    </div>
  );
}
