import { ListEditor } from "@/components/admin/list/ListEditor";
import { experienceConfig } from "@/components/admin/collections/experience";

export default function AdminExperience() {
  return <ListEditor config={experienceConfig} />;
}
