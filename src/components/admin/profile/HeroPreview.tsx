import type { ProfileInput } from "@shared/index";
import { fileUrl } from "@/lib/api";

export type HeroPreviewValue = Pick<
  ProfileInput,
  "name" | "headline" | "intro" | "available" | "availabilityText" | "photoKey" | "photoAlt" | "cvKey" | "email"
>;

export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((w) => Array.from(w)[0]!.toUpperCase()).join("");
}

const fakeButton = "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium";

/** Static mock of the public hero. Buttons are inert spans so they never take focus. */
export function HeroPreview({ value }: { value: HeroPreviewValue }) {
  const showAvailability = value.available && !!value.availabilityText?.trim();
  const mark = initials(value.name);
  return (
    <section aria-label="Hero preview" className="rounded-md border border-border bg-card p-4">
      <p className="mb-3 text-xs text-muted-foreground">Preview, not the real page</p>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">Site heading: AI engineer who builds software for teams</p>
          <p className="text-base font-medium text-foreground">
            {value.name}
            {value.headline ? ` · ${value.headline}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{value.intro}</p>
          {showAvailability && (
            <p className="flex items-center gap-2 text-sm text-foreground">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
              {value.availabilityText}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1" aria-hidden="true">
            <span className={`${fakeButton} bg-primary text-primary-foreground`}>See my work</span>
            {value.cvKey && <span className={`${fakeButton} bg-background text-foreground`}>Download CV</span>}
          </div>
        </div>
        {value.photoKey ? (
          <img
            src={fileUrl(value.photoKey)}
            alt={value.photoAlt ?? ""}
            className="h-24 w-24 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div
            data-testid="photo-initials"
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-lg font-medium text-muted-foreground"
          >
            {mark}
          </div>
        )}
      </div>
    </section>
  );
}
