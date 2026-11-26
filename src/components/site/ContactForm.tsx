import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MessageInput } from "@shared/index";
import { useSiteCopy } from "@/lib/site/settings";
import { apiSend, ApiRequestError } from "@/lib/api";

const fields = ["name", "email", "subject", "message"] as const;
type Field = typeof fields[number];
const limits = {
  name: MessageInput.shape.name.maxLength!,
  email: MessageInput.shape.email.maxLength!,
  subject: MessageInput.shape.subject.unwrap().innerType().unwrap().maxLength!,
  message: MessageInput.shape.message.maxLength!,
};

export function ContactForm() {
  const siteCopy = useSiteCopy();
  const id = useId();
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    const subject = String(data.get("subject") ?? "");
    const body: MessageInput = {
      name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""),
      ...(subject ? { subject } : {}), message: String(data.get("message") ?? ""), website: "",
    };
    const validation = MessageInput.safeParse(body);
    if (!validation.success) {
      const invalid: Partial<Record<Field,string>> = {};
      for (const issue of validation.error.issues) { const field = issue.path[0] as Field; if (fields.includes(field)) invalid[field] = siteCopy.contact.errors[field]; }
      setErrors(invalid); setStatus(siteCopy.contact.invalidForm); setState("failed"); locked.current = false;
      const first = fields.find(field => invalid[field]);
      if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }
    setErrors({}); setStatus(siteCopy.contact.sending); setState("sending");
    try {
      const response = await apiSend<{ ok: true }>("POST", "/api/messages", body);
      if (response?.ok !== true) throw new Error("Unconfirmed send");
      if (!mounted.current) return;
      form.reset(); setState("sent"); setStatus(siteCopy.contact.sent);
    } catch (error) {
      if (!mounted.current) return;
      setState("failed");
      if (error instanceof ApiRequestError && error.status === 429) {
        setStatus(siteCopy.contact.rateLimited);
      } else if (error instanceof ApiRequestError && error.fields && Object.keys(error.fields).length) {
        const known: Partial<Record<Field, string>> = {};

        for (const [key] of Object.entries(error.fields)) {
          if (fields.includes(key as Field)) known[key as Field] = siteCopy.contact.errors[key as Field];

        }
        setErrors(known);
        setStatus(siteCopy.contact.invalidForm);
        const first = fields.find(field => known[field]);
        if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      } else setStatus(siteCopy.contact.networkError);
    } finally { locked.current = false; }
  }
  return (
    <form noValidate onSubmit={submit} action="/api/messages" method="post" aria-busy={state === "sending"}>
        <div className="form">
          {fields.map(field => {
            const props = {
              id: `${id}-${field}`, name: field, required: field !== "subject", maxLength: limits[field],
              "aria-describedby": `${id}-${field}-err`, "aria-invalid": errors[field] ? true as const : undefined,
            };
            return <div className={`field${field === "message" ? " field--full" : ""}`} key={field}>
              <label htmlFor={props.id}>{siteCopy.contact.labels[field]}</label>
              {field === "message" ? <textarea {...props} rows={5} /> :
                <input {...props} type={field === "email" ? "email" : "text"} autoComplete={field === "name" ? "name" : field === "email" ? "email" : "off"} />}
              <p className="field__error" id={`${id}-${field}-err`} hidden={!errors[field]}>{errors[field]}</p>
            </div>;
          })}
          <div hidden aria-hidden="true">
            <label htmlFor={`${id}-website`} hidden>{siteCopy.contact.website}</label>
            <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <div className="btn-row"><button className="btn btn--primary" type="submit" aria-disabled={state === "sending" || undefined}>{state === "sending" ? siteCopy.contact.sending : siteCopy.contact.submit}</button></div>
          <p className="form__status" role="status" aria-live="polite" data-form-status>{status}</p>
        </div>
    </form>
  );
}
