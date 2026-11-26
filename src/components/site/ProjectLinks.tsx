import type { ProjectCard } from "@shared/index";
import { useSiteCopy } from "@/lib/site/settings";
import { hostLabel } from "@/lib/site/format";

export function ProjectLinks({ project }: { project: ProjectCard }) {
  const siteCopy = useSiteCopy();
  if (!project.liveUrl && !project.githubUrl) return null;
  return (
    <p className="project-links">
      {project.liveUrl && (
        <a className="link" href={project.liveUrl} target="_blank" rel="noopener noreferrer" aria-label={`${siteCopy.work.viewLive}: ${hostLabel(project.liveUrl)}`}>
          {hostLabel(project.liveUrl)}
        </a>
      )}
      {project.githubUrl && (
        <a className="link" href={project.githubUrl} target="_blank" rel="noopener noreferrer" aria-label={`${siteCopy.work.viewCode}: ${hostLabel(project.githubUrl)}`}>
          {hostLabel(project.githubUrl)}
        </a>
      )}
    </p>
  );
}
