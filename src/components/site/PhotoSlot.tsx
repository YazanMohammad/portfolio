import type { PublicContent } from "@shared/index";
import "./site.css";

type Profile = PublicContent["profile"];

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;
  return letters.map((w) => w.charAt(0).toUpperCase()).join("");
}

/** The profile photo at its final ratio; a monogram tile until the client uploads one. No caption. */
export function PhotoSlot({ profile, size }: { profile: Profile; size: "hero" | "about" }) {
  const cls = `frame frame--portrait photo-slot photo-slot--${size}`;
  if (profile.photoUrl) {
    return (
      <div className={`${cls} frame--photo`}>
        <img className="frame__img" src={profile.photoUrl} alt={profile.photoAlt ?? ""} loading="lazy" />
      </div>
    );
  }
  // client file: profile photo, uploaded in admin (this tile stands in until then)
  return (
    <div className={`${cls} frame--photo`} role="img" aria-label={profile.name}>
      <span className="photo-slot__mono" aria-hidden="true">{initials(profile.name)}</span>
    </div>
  );
}
