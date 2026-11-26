import { useEffect, useRef, useState } from "react";
import type { Message, MessagePatch } from "@shared/index";
import { useDeleteMessage, usePatchMessage } from "@/lib/admin/queries";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import "../lists.css";
import { replyHref } from "./mailto";

export function MessageView({ initial, onSaved, onClose }: {
  initial: Message; onSaved: (message: Message) => void; onClose: () => void;
}) {
  const [message, setMessage] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const patch = usePatchMessage();
  const deletion = useDeleteMessage();
  const attempted = useRef(false);
  // The list button that opened this message; focus goes back to it when the sheet closes.
  const opener = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const returnTo = useRef<HTMLElement | null>(null);
  const busy = patch.isPending || deletion.isPending;
  const saved = (value: Message) => { setMessage(value); onSaved(value); };
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // One attempt per open transition, including rejection and StrictMode effect replay.
  // Explicit Mark unread does not reset it. Closing/reopening creates a new transition.
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!initial.isRead) patch.mutate({ id: initial.id, patch: { isRead: true } }, { onSuccess: saved });
  });
  const update = (value: MessagePatch) => {
    if (!busy) patch.mutate({ id: message.id, patch: value }, { onSuccess: saved });
  };
  const content = <article className="admin-message space-y-5 p-5" aria-busy={busy}>
    {!mobile && <h2 className="text-lg font-semibold">{message.subject || "(no subject)"}</h2>}
    <div className="space-y-1">
      <p className="font-medium">{message.name}</p>
    <a className="break-all underline" href={`mailto:${encodeURIComponent(message.email).replace(/%40/gi, "@")}`}>{message.email}</a>
      <p className="text-xs text-muted-foreground">Received <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("en-GB")}</time></p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" className="h-9"><a href={replyHref(message)}>Reply by email</a></Button>
      <Button variant="outline" className="h-9" disabled={busy} onClick={() => update({ isRead: !message.isRead })}>{message.isRead ? "Mark unread" : "Mark read"}</Button>
      <Button variant="outline" className="h-9" disabled={busy} onClick={() => update({ archived: !message.archivedAt })}>{message.archivedAt ? "Unarchive" : "Archive"}</Button>
      <Button variant="outline" className="h-9 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={(e) => { returnTo.current = e.currentTarget; deletion.reset(); setConfirm(true); }}>Delete</Button>
      {!mobile && <Button variant="ghost" className="h-9" onClick={onClose}>Close message</Button>}
    </div>
    {patch.isPending && <p role="status">Updating message…</p>}
    {patch.isError && <p role="alert">Could not update message. {patch.error.message} Try the action again.</p>}
    <p className="whitespace-pre-wrap break-words">{message.message}</p>
    <AlertDialog open={confirm} onOpenChange={value => { if (!deletion.isPending) setConfirm(value); }}>
      <AlertDialogContent onCloseAutoFocus={event => { if (returnTo.current?.isConnected) { event.preventDefault(); returnTo.current.focus(); } }}>
        <AlertDialogTitle>Delete message?</AlertDialogTitle>
        <AlertDialogDescription>This permanently deletes this message.</AlertDialogDescription>
        {deletion.isError && <p role="alert">Could not delete message. {deletion.error.message}</p>}
        {deletion.isPending && <p role="status">Deleting message…</p>}
        <AlertDialogCancel disabled={deletion.isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={event => {
          event.preventDefault();
          if (!busy) deletion.mutate({ id: message.id }, { onSuccess: onClose });
        }}>Delete message</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  </article>;
  return mobile ? <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }} className="admin-message-sheet w-full overflow-y-auto p-4 sm:max-w-lg">
      <SheetTitle className="pr-12 text-lg">{message.subject || "(no subject)"}</SheetTitle><SheetDescription>Read and manage this message.</SheetDescription>
      {content}
    </SheetContent>
  </Sheet> : <div className="min-w-0 rounded-md border border-border">{content}</div>;
}
