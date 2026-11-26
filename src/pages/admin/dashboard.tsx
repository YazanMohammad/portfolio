import { DashboardOverview } from "@/components/admin/DashboardOverview";
import type { FillInItem } from "@shared/index";
import { format, formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { useAdminSummary } from "@/lib/admin/queries";
import { GuardedLink } from "@/lib/admin/unsaved";

const panelClass = "border border-border bg-background p-4";
const linkClass = "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 hover:bg-muted";

function fillInDestination(item: FillInItem): string {
  return item.section === "profile" ? "/admin/profile" : `/admin/${item.section}?edit=${item.id}`;
}

function DashboardSkeleton() {
  const line = "h-5 rounded bg-muted";
  return (
    <div className="space-y-6 font-sans text-sm text-foreground" aria-busy="true">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p role="status" className="sr-only">Loading dashboard</p>
      <section aria-labelledby="dashboard-messages" className={panelClass}>
        <h2 id="dashboard-messages" className="font-semibold">Messages</h2>
        <div data-testid="dashboard-skeleton" aria-hidden="true">
          <div className={`mt-2 w-24 ${line}`} />
          <div className="mt-4 divide-y divide-border">
            {[0, 1, 2].map((row) => <div key={row} className="space-y-1 py-3">
              <div className={`w-32 ${line}`} /><div className={`w-3/4 ${line}`} /><div className={`w-24 ${line}`} />
            </div>)}
          </div>
        </div>
      </section>
      <section aria-labelledby="dashboard-content">
        <h2 id="dashboard-content" className="font-semibold">Content</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((tile) => <div key={tile} data-testid="dashboard-skeleton" aria-hidden="true" className={`space-y-2 ${panelClass}`}>
            <div className={line} /><div className="h-8 w-12 rounded bg-muted" />
          </div>)}
        </div>
      </section>
      <section aria-labelledby="dashboard-fill-in" className={panelClass}>
        <h2 id="dashboard-fill-in" className="font-semibold">To fill in</h2>
        <div data-testid="dashboard-skeleton" aria-hidden="true" className={`mt-2 w-40 ${line}`} />
      </section>
      <section aria-labelledby="dashboard-last-saved" className={panelClass}>
        <h2 id="dashboard-last-saved" className="font-semibold">Last saved</h2>
        <div data-testid="dashboard-skeleton" aria-hidden="true" className={`mt-2 w-48 max-w-full ${line}`} />
      </section>
    </div>
  );
}

export default function AdminDashboard() {
  const summary = useAdminSummary();
  if (summary.isError) return (
    <div className="space-y-6 font-sans text-sm text-foreground">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className={panelClass}>
        <p role="alert">Could not load dashboard.</p>
        <button type="button" className={`mt-4 h-9 border border-border px-4 ${linkClass}`} onClick={() => void summary.refetch()}>Try again</button>
      </div>
    </div>
  );
  if (!summary.data) return <DashboardSkeleton />;
  const data = summary.data;
  const recent = data.recentMessages.filter((m) => !m.isRead).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
  return (
    <div className="admin-dashboard space-y-6 font-sans text-sm text-foreground">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <DashboardOverview unread={data.unreadCount}/>
      <section aria-labelledby="dashboard-messages" className={panelClass}>
        <h2 id="dashboard-messages" className="font-semibold">Messages</h2>
        <p className="mt-2 text-muted-foreground">{data.unreadCount ? `${data.unreadCount} unread` : "No unread messages"}</p>
        {!recent.length && <p className="mt-4 text-muted-foreground">{data.unreadCount ? "Open the inbox to read them." : "No messages yet."}</p>}
        <ul className="mt-4 divide-y divide-border">
          {recent.map((message) => (
            <li key={message.id}>
              <GuardedLink to={`/admin/messages?open=${message.id}`} className={`block min-h-11 min-w-0 space-y-1 py-3 ${linkClass}`}>
                <span className="block break-words font-medium">{message.name}</span>{" "}
                <span className="block break-words">{message.subject || "(no subject)"}</span>{" "}
                <time dateTime={message.createdAt} className="block text-muted-foreground">
                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: enUS })}
                </time>
              </GuardedLink>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="dashboard-content">
        <h2 id="dashboard-content" className="font-semibold">Content</h2>
        <ul className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
          {(["projects", "experience", "education", "skills", "messages"] as const).map((section) => (
            <li key={section} className="min-w-0">
              <GuardedLink to={`/admin/${section}`} className={`block space-y-2 ${panelClass} ${linkClass}`}>
                <span className="block">{section[0].toUpperCase() + section.slice(1)}</span>{" "}
                <span className="block text-2xl font-semibold tabular-nums">{data.counts[section]}</span>
              </GuardedLink>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="dashboard-fill-in" className={panelClass}>
        <h2 id="dashboard-fill-in" className="font-semibold">To fill in</h2>
        {data.toFillIn.length ? (
          <ul className="mt-4 divide-y divide-border">
            {data.toFillIn.map((item) => (
              <li key={`${item.section}-${item.id}-${item.field}`}>
                <GuardedLink to={fillInDestination(item)} className={`block break-words py-3 underline underline-offset-4 ${linkClass}`}>
                  {item.label}
                </GuardedLink>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-muted-foreground">Nothing to fill in.</p>}
      </section>
      <section aria-labelledby="dashboard-last-saved" className={panelClass}>
        <h2 id="dashboard-last-saved" className="font-semibold">Last saved</h2>
        <p className="mt-2 text-muted-foreground">
          {data.lastSavedAt ? <>
            <time dateTime={data.lastSavedAt}>{format(new Date(data.lastSavedAt), "d MMM yyyy", { locale: enUS })}</time>
            {" · "}{formatDistanceToNow(new Date(data.lastSavedAt), { addSuffix: true, locale: enUS })}
          </> : "Never"}
        </p>
      </section>
    </div>
  );
}
