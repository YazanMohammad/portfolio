import { useAdminList } from '@/lib/admin/queries';
import { GuardedLink } from '@/lib/admin/unsaved';
import { SitePreview } from './SitePreview';
export function DashboardOverview({unread}:{unread:number}) {
 const projects=useAdminList<{isVisible:boolean}>('projects');
 const rows=Array.isArray(projects.data)?projects.data:[];
 const shown=rows.filter(p=>p.isVisible).length,hidden=rows.length-shown;
 return <div><p className="admin-page-intro">Your work, in one place. A few small edits keep it current.</p><div className="admin-dashboard-stats">
 <div><p className="admin-kicker">Projects shown</p><strong aria-label={`${shown} projects shown`}>{projects.isPending?'—':shown}</strong><p className="text-muted-foreground">On the public site</p></div>
 <div><p className="admin-kicker">Projects hidden</p><strong aria-label={`${hidden} projects hidden`}>{projects.isPending?'—':hidden}</strong><p className="text-muted-foreground">Kept here for later</p></div>
 <div><p className="admin-kicker">Unread messages</p><strong aria-label={`${unread} unread messages`}>{unread}</strong><GuardedLink to="/admin/messages" className="underline">Open inbox ↗</GuardedLink></div>
 </div><div className="admin-dashboard-grid"><section><p className="admin-kicker">Common edits</p><h2 className="mt-2 text-2xl">Keep it up to date</h2><div className="admin-quick-links">{[['profile','Update your intro'],['projects','Edit your projects'],['site-text','Change site text'],['look','Adjust the tone']].map(([path,label])=><GuardedLink key={path} to={`/admin/${path}`}>{label}<span aria-hidden="true">↗</span></GuardedLink>)}</div></section><aside className="admin-preview-panel"><p className="admin-kicker">Your site / live</p><SitePreview/></aside></div></div>;
}
