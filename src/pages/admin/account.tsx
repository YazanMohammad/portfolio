import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { AdminPassword, AdminUsername, type AccountInput } from "@shared/index";
import { ApiRequestError } from "@/lib/api";
import { useAdminAccount, useSaveAccount } from "@/lib/admin/queries";
import { applyServerError } from "@/components/admin/form/server-errors";
import { PageHeader } from "@/components/admin/PageHeader";
import { SaveBar } from "@/components/admin/form/SaveBar";
import { TextField } from "@/components/admin/form/FormField";

const AccountForm = z.object({
  username: AdminUsername,
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string(),
  confirmPassword: z.string(),
}).superRefine((value, ctx) => {
  if (value.newPassword === "") return;
  const strong = AdminPassword.safeParse(value.newPassword);
  if (!strong.success) ctx.addIssue({ code: "custom", path: ["newPassword"], message: strong.error.issues[0].message });
  else if (value.confirmPassword !== value.newPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "The passwords do not match." });
});
type FormIn = z.input<typeof AccountForm>;
type FormOut = z.output<typeof AccountForm>;
const KNOWN_FIELDS = ["username", "currentPassword", "newPassword"];
const blank = (username: string): FormIn => ({ username, currentPassword: "", newPassword: "", confirmPassword: "" });

function slowDown(seconds?: number): string {
  const minutes = Math.max(1, Math.ceil((seconds && seconds > 0 ? seconds : 15 * 60) / 60));
  return `Too many wrong attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export default function AdminAccount() {
  const query = useAdminAccount();
  const save = useSaveAccount();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(AccountForm) as unknown as Resolver<FormIn, unknown, FormOut>,
    defaultValues: blank(query.data?.username ?? ""),
  });
  const { reset } = form;
  const { isDirty: dirty, isSubmitting } = form.formState;

  useEffect(() => {
    if (query.data && !form.formState.isDirty && !isSubmitting) reset(blank(query.data.username ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, reset]);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    const input: AccountInput = { username: values.username, currentPassword: values.currentPassword };
    if (values.newPassword !== "") input.newPassword = values.newPassword;
    try {
      const saved = await save.mutateAsync(input);
      reset(blank(saved.username));
      toast.success("Saved");
    } catch (err) {
      // Never keep a typed password around after a failed attempt.
      form.setValue("currentPassword", "");
      if (err instanceof ApiRequestError && err.status === 429) setFormError(slowDown(err.retryAfter));
      else setFormError(applyServerError(err, form.setError, { knownFields: KNOWN_FIELDS }));
    }
  });

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) {
    return <p role="alert" className="text-sm text-destructive">Could not load the account. Reload the page to try again.</p>;
  }

  return (
    <div className="space-y-4">
      <PageHeader kicker="Site" title="Account" intro="Your admin username and password. Saving logs out every other browser." />
      <form
        id="account-form"
        noValidate
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="max-w-xl space-y-4"
      >
        <fieldset className="space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Login</legend>
          <TextField form={form} name="username" label="Username" hint="3 to 64 characters. Case does not matter when you log in." required maxLength={64} autoComplete="username" />
          <TextField form={form} name="newPassword" label="New password" hint="At least 12 characters. Leave empty to keep the current one." type="password" autoComplete="new-password" />
          <TextField form={form} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
        </fieldset>
        <fieldset className="space-y-3 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Confirm it is you</legend>
          <TextField form={form} name="currentPassword" label="Current password" hint="Needed for any change." type="password" required autoComplete="current-password" />
        </fieldset>
        <SaveBar shell
          formId="account-form"
          dirty={dirty}
          saving={save.isPending}
          formError={formError}
          onSave={() => submit()}
          onDiscard={() => { setFormError(null); reset(); }}
        />
      </form>
    </div>
  );
}
