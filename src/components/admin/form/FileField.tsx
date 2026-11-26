import { useRef, useState } from "react";
import { CV_MAX_BYTES } from "@shared/index";
import { apiUpload, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AnyForm } from "./FormField";
import { fieldError, fieldId } from "./input-utils";
import { extOf, uploadErrorMessage } from "./upload-utils";

export function FileField({ form, name, label }: { form: AnyForm; name: string; label: string; accept: "pdf" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const key = (form.watch(name) as string | null | undefined) ?? null;
  const id = fieldId(name);
  const shown = error ?? fieldError(form, name);

  const handle = async (file: File | undefined) => {
    if (!file || pending) return;
    if (file.type !== "application/pdf" || extOf(file.name) !== "pdf") {
      setError("Use a PDF file.");
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setError("File must be 4 MB or smaller.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await apiUpload("cv", file);
      setFileName(file.name);
      form.setValue(name, res.key, { shouldDirty: true, shouldValidate: true });
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          data-testid="file-input"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={pending}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
          onChange={(e) => void handle(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
          {key ? "Replace file" : "Choose PDF"}
        </Button>
        {key && (
          <>
            <a href={fileUrl(key)} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground underline">
              {fileName ?? key}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                setFileName(null);
                form.setValue(name, null, { shouldDirty: true, shouldValidate: true });
              }}
            >
              Remove
            </Button>
          </>
        )}
        <span className="text-xs text-muted-foreground">{pending ? "Uploading…" : "PDF, up to 4 MB."}</span>
      </div>
      {shown && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {shown}
        </p>
      )}
    </div>
  );
}
