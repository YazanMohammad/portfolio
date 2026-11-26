import type { Message } from "@shared/index";

export function replyHref(m: Pick<Message, "email" | "subject">): string {
  const subject = m.subject?.trim() || "your message";
  return `mailto:${encodeURIComponent(m.email).replace(/%40/gi, "@")}?subject=${encodeURIComponent(/^re:/i.test(subject) ? subject : `Re: ${subject}`)}`;
}
