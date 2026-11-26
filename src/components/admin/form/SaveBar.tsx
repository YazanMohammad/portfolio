import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSaveShortcut, useUnsavedGuard } from "@/lib/admin/unsaved";

type Props = {
  formId: string;
  shell?: boolean;
  dirty: boolean;
  saving: boolean;
  disabled?: boolean;
  formError: string | null;
  onSave: () => void | Promise<unknown>;
  onDiscard: () => void;
};

export function SaveBar({ formId, shell = false, dirty, saving, disabled = false, formError, onSave, onDiscard }: Props) {
  const [target,setTarget] = useState<HTMLElement|null>(null);
  useEffect(()=>{setTarget(shell ? document.getElementById("admin-save-slot") : null);},[shell]);
  // Set synchronously so a second click or key repeat is ignored before React re-renders.
  const busy = useRef(false);
  const savingNow = useRef(saving);
  savingNow.current = saving;

  useEffect(() => {
    if (!saving) busy.current = false;
  }, [saving]);

  const save = () => {
    if (busy.current || savingNow.current || disabled || !dirty) return;
    busy.current = true;
    const result = onSave();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      const release = () => {
        if (!savingNow.current) busy.current = false;
      };
      void (result as Promise<unknown>).then(release, release);
    } else {
      // Void onSave: release on the next tick unless the caller flipped `saving`.
      setTimeout(() => {
        if (!savingNow.current) busy.current = false;
      }, 0);
    }
  };

  useUnsavedGuard(formId, dirty);
  useSaveShortcut(save, dirty && !saving && !disabled);

  const bar = (
    <div className="admin-savebar flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3">
      <Button type="button" onClick={save} disabled={!dirty || saving || disabled}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {dirty && (
        <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard changes
        </Button>
      )}
      <span role="status" className={dirty ? "admin-save-state admin-save-state--dirty" : "admin-save-state"}>
        {dirty && <span className="admin-dirty-dot" aria-hidden="true" />}
        {dirty ? "Unsaved changes" : "All changes saved"}
      </span>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
    </div>
  );
  return target ? createPortal(bar,target) : bar;
}
