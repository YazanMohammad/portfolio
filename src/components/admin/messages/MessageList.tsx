import type { Message } from "@shared/index";

export function MessageList({ messages, selectedId, onSelect }: {
  messages: Message[]; selectedId: number | null; onSelect: (message: Message) => void;
}) {
  const sorted = [...messages].sort((a, b) => Number(a.isRead) - Number(b.isRead) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <ul aria-label="Messages" className="divide-y divide-border">
    {sorted.map(m => <li key={m.id}><button type="button" aria-pressed={m.id === selectedId}
      onClick={() => onSelect(m)} className="w-full space-y-1 p-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <span className={m.isRead ? "block" : "block font-semibold"}>{m.name}{!m.isRead && <span className="ml-2 text-xs">Unread</span>}</span>
      <span className="block">{m.subject || "(no subject)"}</span>
      <time dateTime={m.createdAt} className="block text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("en-GB")}</time>
    </button></li>)}
  </ul>;
}
