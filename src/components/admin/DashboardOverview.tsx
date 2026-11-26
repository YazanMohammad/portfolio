import { useAdminList } from '@/lib/admin/queries';
import { GuardedLink } from '@/lib/admin/unsaved';
import './lists.css';
import { SitePreview } from './SitePreview';
export function DashboardOverview({unread}:{unread:number}) {
 const projects=useAdminList<{isVisible:boolean}>('projects');
 const rows=Array.isArray(projects.data)?projects.data:[];
 const failed=projects.isError;
 const shown=rows.filter(p=>p.isVisible).length,hidden=rows.length-shown;
 return <div>{failed&&<p role="alert" className="text-destructive">Could not load projects. <button type="button" className="underline" onClick={()=>void projects.refetch()}>Try again</button></p>}<div className="admin-dashboard-stats">
 <div><p className="admin-kicker">Projects shown</p><strong aria-label={failed?'Projects shown unavailable':`${shown} projects shown`}>{projects.isPending||failed?'—':shown}</strong><p className="text-muted-foreground">On the public site</p></div>
 <div><p className="admin-kicker">Projects hidden</p><strong aria-label={failed?'Projects hidden unavailable':`${hidden} projects hidden`}>{projects.isPending||failed?'—':hidden}</strong><p className="text-muted-foreground">Not on the site</p></div>
 <div><p className="admin-kicker">Unread messages</p><strong aria-label={`${unread} unread messages`}>{unread}</strong><GuardedLink to="/admin/messages" className="underline">Open inbox</GuardedLink></div>
 </div><div className="admin-dashboard-grid"><section><p className="admin-kicker">Common edits</p><h2 className="mt-2 text-2xl">Common tasks</h2><div className="admin-quick-links">{[['profile','Edit your intro'],['projects','Edit your projects'],['site-text','Change site text'],['look','Change the look']].map(([path,label])=><GuardedLink key={path} to={`/admin/${path}`}>{label}</GuardedLink>)}</div></section><aside className="admin-preview-panel"><p className="admin-kicker">Your site / live</p><SitePreview/></aside></div></div>;
}
