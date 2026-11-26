import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AnyForm } from "./FormField";
import { fieldError, fieldId } from "./input-utils";
import { MarkdownPreview } from "./MarkdownPreview";

export function MarkdownEditor({ form, name, label }: { form: AnyForm; name: string; label: string }) {
  const id = fieldId(name);
  const error = fieldError(form, name);
  const value = (form.watch(name) as string | undefined) ?? "";
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Textarea
            id={id}
            rows={14}
            className="min-h-[21rem] font-mono"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            {...form.register(name)}
          />
        </TabsContent>
        <TabsContent value="preview" className="min-h-[21rem] rounded-md border border-border p-3">
          {value.trim() ? <MarkdownPreview source={value} /> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}
        </TabsContent>
      </Tabs>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
