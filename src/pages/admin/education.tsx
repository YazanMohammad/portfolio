import { ListEditor } from "@/components/admin/list/ListEditor";
import { educationConfig } from "@/components/admin/collections/education";

export default function AdminEducation() {
  return <ListEditor config={educationConfig} />;
}
