import type { ZodError } from "zod";

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = Object.create(null);
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!Object.hasOwn(fields, key)) fields[key] = issue.message;
  }
  return fields;
}
