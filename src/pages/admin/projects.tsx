import { ListEditor } from "@/components/admin/list/ListEditor";
import { projectsConfig } from "@/components/admin/collections/projects";

export default function AdminProjects() {
  return <ListEditor config={projectsConfig} />;
}
