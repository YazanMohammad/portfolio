import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { IMAGE_MAX_BYTES } from "@shared/index";
import { apiUpload, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnyForm } from "./FormField";
import { fieldError, fieldId } from "./input-utils";
import { extOf, uploadErrorMessage } from "./upload-utils";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXTS = ["jpg", "jpeg", "png", "webp"];

export function ImageDropZone({
  form,
  keyName,
  altName,
  label,
}: {
  form: AnyForm;
  keyName: string;
  altName: string;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = (form.watch(keyName) as string | null | undefined) ?? null;
  const id = fieldId(keyName);
  const altId = fieldId(altName);
  const altError = fieldError(form, altName);
  const keyError = fieldError(form, keyName);
  const shown = error ?? keyError;

  const handle = async (file: File | undefined) => {
    if (!file || pending) return;
    if (!TYPES.includes(file.type) || !EXTS.includes(extOf(file.name))) {
      setError("Use a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError("Image must be 4 MB or smaller.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await apiUpload("image", file);
      form.setValue(keyName, res.key, { shouldDirty: true, shouldValidate: true });
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void handle(e.dataTransfer.files[0]);
  };

  const openPicker = () => {
    if (!pending) inputRef.current?.click();
  };
  const onZoneKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex items-center gap-3 rounded-md border border-dashed border-border bg-background p-3"
      >
        <div
          role="button"
          tabIndex={pending ? -1 : 0}
          aria-label={`${label}: choose or drop an image`}
          aria-describedby={`${id}-hint`}
          aria-disabled={pending || undefined}
          onClick={openPicker}
          onKeyDown={onZoneKey}
          className="flex cursor-pointer items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:cursor-not-allowed"
        >
          {key && (
            <img
              data-testid="image-preview"
              src={fileUrl(key)}
              alt=""
              className="h-16 w-16 rounded border border-border object-cover"
            />
          )}
          <span id={`${id}-hint`} className="text-xs text-muted-foreground">
            {pending ? "Uploading…" : "Drop an image here, or click to choose. JPEG, PNG or WebP, up to 4 MB."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={id}
            data-testid="image-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pending}
            aria-invalid={shown ? true : undefined}
            aria-describedby={shown ? `${id}-error` : undefined}
            onChange={(e) => void handle(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
            {key ? "Replace image" : "Choose image"}
          </Button>
          {key && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                form.setValue(keyName, null, { shouldDirty: true, shouldValidate: true });
                form.setValue(altName, null, { shouldDirty: true, shouldValidate: true });
              }}
            >
              Remove image
            </Button>
          )}
        </div>
      </div>
      {shown && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {shown}
        </p>
      )}
      {key && (
        <div className="space-y-1">
          <Label htmlFor={altId}>{label} alt text (required)</Label>
          <Input
            id={altId}
            value={(form.watch(altName) as string | null | undefined) ?? ""}
            aria-invalid={altError ? true : undefined}
            aria-describedby={altError ? `${altId}-error` : undefined}
            onChange={(e) => form.setValue(altName, e.target.value, { shouldDirty: true, shouldValidate: true })}
          />
          {altError && (
            <p id={`${altId}-error`} className="text-xs text-destructive">
              {altError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
