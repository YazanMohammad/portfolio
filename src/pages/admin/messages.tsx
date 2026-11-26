import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { Message } from "@shared/index";
import { MessageView } from "@/components/admin/messages/MessageView";
import { useAdminMessages, type MessageStatus } from "@/lib/admin/queries";
import { MessageList } from "@/components/admin/messages/MessageList";
import "@/components/admin/lists.css";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Messages() {
  const [status, setStatus] = useState<MessageStatus>("unread");
  const query = useAdminMessages(status);
  const all = useAdminMessages("all");
  const archived = useAdminMessages("archived");
  const search = useSearch();
  const [location, navigate] = useLocation();
  const raw = new URLSearchParams(search).get("open");
  const id = raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  const [snapshot, setSnapshot] = useState<Message | null>(null);
  const selected = snapshot?.id === id ? snapshot : [...(query.data ?? []), ...(all.data ?? []), ...(archived.data ?? [])].find(m => m.id === id);
  useEffect(() => { setSnapshot(selected ?? null); }, [id, selected]);
  const select = (message: Message) => {
    setSnapshot(message);
    const params = new URLSearchParams(search);
    params.set("open", String(message.id));
    navigate(`${location}?${params}`);
  };
  const close = () => {
    setSnapshot(null);
    const params = new URLSearchParams(search);
    params.delete("open");
    navigate(`${location}${params.size ? `?${params}` : ""}`);
  };
  return <section className="space-y-4 text-sm">
    <h1 className="text-xl font-semibold">Inbox</h1>
    <p className="admin-page-intro">Messages from your site.</p>
    <Tabs value={status} onValueChange={value => setStatus(value as MessageStatus)}>
      <TabsList aria-label="Message folders" className="admin-inbox-tabs h-auto">
        <TabsTrigger value="unread">Unread</TabsTrigger><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
    </Tabs>
    <div className="grid items-start gap-4 md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
    <div className="min-w-0 rounded-md border border-border">
    {query.isPending ? <p role="status">Loading messages…</p> : query.isError ? <div role="alert">Could not load messages. <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div> : query.data.length ?
      <MessageList messages={query.data} selectedId={id} onSelect={select} /> : <p className="p-4">{status === "unread" ? "No unread messages." : status === "archived" ? "No archived messages." : "No messages."}</p>}
    </div>
    {selected ? <MessageView key={selected.id} initial={selected} onSaved={setSnapshot} onClose={close} /> : id !== null ?
      all.isPending || archived.isPending ? <p role="status">Loading selected message…</p> : all.isError || archived.isError ?
      <div role="alert"><p>Could not load selected message.</p><Button variant="outline" onClick={() => { void all.refetch(); void archived.refetch(); }}>Retry selected message</Button></div> : <p>Message not found.</p> : <p className="p-4 text-muted-foreground">Select a message to read it.</p>}
    </div>
  </section>;
}
