import { Link, useRoute } from "wouter";
import { ContactSection } from "@/components/site/ContactSection";
import { Markdown } from "@/components/site/Markdown";
import { SiteLayout, blankLayoutContent } from "@/components/site/SiteLayout";
import { mergeSettings } from "@shared/settings";
import { fileUrl } from "@/lib/api";
import { safeHref } from "@/lib/site/safe-href";
import { useProject, useSiteContent } from "@/lib/site/use-content";
import NotFound from "./NotFound";
import { ProjectTitle } from "@/components/site/ProjectTitle";
import "@/styles/project.css";

export default function Project() {
  const [, params] = useRoute("/projects/:slug");
  const { content } = useSiteContent();
  const siteCopy = mergeSettings(content.settings).copy;
  const { data: project, isPending, isError, error } = useProject(params?.slug ?? "");
  if (error?.status === 404) return <NotFound project />;
  const snapshot = content.projects.find((card) => card.slug === params?.slug);
  const title = project?.title ?? snapshot?.title ?? siteCopy.nav.work;
  const summary = project?.summary ?? snapshot?.summary;
  const layoutContent = blankLayoutContent(content);
  const live = safeHref(project?.liveUrl);
  const code = safeHref(project?.githubUrl);
  return (
    <SiteLayout content={layoutContent} contactForm={<ContactSection profile={content.profile} />}>
      <article className="section project-detail" aria-busy={isPending}>
        <div className="wrap stack-6">
          <title>{`${title} | ${content.profile.name}`}</title>
          {summary && <meta name="description" content={summary} />}
          <Link className="text-link" href="/#work">{siteCopy.project.back}</Link>
          <h1><ProjectTitle title={title}/></h1>
          {summary && <p className="measure">{summary}</p>}
          {isError && <p role="alert">{siteCopy.project.loadError}</p>}
          {project && !isError && <>
            {(project.role || project.technologies.length > 0 || live || code) && <dl className="project-facts stack-4">
              {project.role && <div><dt>{siteCopy.project.role}</dt><dd>{project.role}</dd></div>}
              {project.technologies.length > 0 && <div><dt>{siteCopy.project.stack}</dt><dd><ul className="project-tags">{project.technologies.map((tech) => <li key={tech}>{tech}</li>)}</ul></dd></div>}
              {(live || code) && <div><dt>{siteCopy.project.links}</dt><dd className="cluster">
                {live && <a className="link" href={live} target="_blank" rel="noopener noreferrer">{siteCopy.work.viewLive}</a>}
                {code && <a className="link" href={code} target="_blank" rel="noopener noreferrer">{siteCopy.work.viewCode}</a>}
              </dd></div>}
            </dl>}
            {project.imageKey && <div className="project-picture"><img src={fileUrl(project.imageKey)} alt={project.imageAlt ?? ""} decoding="async" /></div>}
            {project.body.trim() && <div className="measure project-body"><Markdown article source={project.body} /></div>}
          </>}
        </div>
      </article>
    </SiteLayout>
  );
}
