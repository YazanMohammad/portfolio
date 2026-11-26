import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
const RequireAdmin = lazy(() => import("@/components/admin/RequireAdmin").then(module => ({ default: module.RequireAdmin })));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout").then(module => ({ default: module.AdminLayout })));
import { makeQueryClient } from "@/lib/admin/queries";
import { siteCopy } from "@/content/copy";
import Home from "@/pages/site/Home";
import NotFound from "@/pages/site/NotFound";
import Project from "@/pages/site/Project";
const Dashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminLogin = lazy(() => import("@/pages/admin/login"));
const Projects = lazy(() => import("@/pages/admin/projects"));
const Skills = lazy(() => import("@/pages/admin/skills"));
const Education = lazy(() => import("@/pages/admin/education"));
const Experience = lazy(() => import("@/pages/admin/experience"));
const Messages = lazy(() => import("@/pages/admin/messages"));
const SiteText = lazy(() => import("@/pages/admin/site-text"));
const Look = lazy(() => import("@/pages/admin/look"));
const Profile = lazy(() => import("@/pages/admin/profile"));

// One client for the whole app: site and admin share the cache and the admin 401 handler
// (it only acts on 401s; public endpoints never return one).
const queryClient = makeQueryClient();

function AdminRoute({ page: Page }: { page: ComponentType }): ReactNode {
  return (
    <RequireAdmin>
      <AdminLayout>
        <Page />
      </AdminLayout>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<p role="status">{siteCopy.loading}</p>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/projects/:slug" component={Project} />
        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard"><AdminRoute page={Dashboard} /></Route>
        <Route path="/admin/site-text"><AdminRoute page={SiteText} /></Route>
        <Route path="/admin/look"><AdminRoute page={Look} /></Route>
        <Route path="/admin/profile"><AdminRoute page={Profile} /></Route>
        <Route path="/admin/projects"><AdminRoute page={Projects} /></Route>
        <Route path="/admin/experience"><AdminRoute page={Experience} /></Route>
        <Route path="/admin/education"><AdminRoute page={Education} /></Route>
        <Route path="/admin/skills"><AdminRoute page={Skills} /></Route>
        <Route path="/admin/messages"><AdminRoute page={Messages} /></Route>
        <Route><NotFound /></Route>
      </Switch>
      </Suspense>
    </QueryClientProvider>
  );
}
