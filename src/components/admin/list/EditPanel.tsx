import { useState } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useSaveItem } from "@/lib/admin/queries";
import { applyServerError } from "../form/server-errors";
import { SaveBar } from "../form/SaveBar";
import type { CollectionConfig, Row } from "./types";

type Props<T extends Row, I> = {
  config: CollectionConfig<T, I>;
  item: T | null;
  nextSortOrder: number;
  onSaved: () => void;
};

/** Form state lives here; the parent keys it by row so switching rows resets it. */
export function EditPanel<T extends Row, I>({ config, item, nextSortOrder, onSaved }: Props<T, I>) {
  const save = useSaveItem<T, I>(config.collection);
  const [formError, setFormError] = useState<string | null>(null);
  const initial = (item ? config.toInput(item) : config.emptyInput(nextSortOrder)) as FieldValues;

  const form = useForm<FieldValues>({
    resolver: zodResolver(config.schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: initial,
  });

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const input = config.schema.parse(values);
      await save.mutateAsync({ id: item?.id, input });
      form.reset(values);
      toast.success("Saved");
      onSaved();
    } catch (err) {
      setFormError(
        applyServerError(err, form.setError, {
          knownFields: config.knownFields,
          conflictField: config.conflictField,
        }),
      );
    }
  });

  const formId = `edit-${config.collection}-${item?.id ?? "new"}`;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <config.FormBody form={form} item={item} />
      </div>
      <SaveBar
        formId={formId}
        dirty={form.formState.isDirty}
        saving={save.isPending}
        formError={formError}
        onSave={() => submit()}
        onDiscard={() => {
          setFormError(null);
          form.reset(initial);
        }}
      />
    </form>
  );
}
