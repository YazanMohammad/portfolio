import { ListEditor } from "@/components/admin/list/ListEditor";
import { skillsConfig } from "@/components/admin/collections/skills";

export default function AdminSkills() {
  return <ListEditor config={skillsConfig} />;
}
