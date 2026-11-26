import { Dither } from "./Dither";
import type { PublicContent } from "@shared/index";
import { useSiteCopy, useSiteTheme } from "@/lib/site/settings";
import { safeHref } from "@/lib/site/safe-href";
import { ProjectTitle } from "./ProjectTitle";
import "./site.css";
import "./poster.css";
export function Hero({ profile, projects = [] }: { profile: PublicContent["profile"]; projects?: PublicContent["projects"] }) {
  const siteCopy = useSiteCopy();
  const theme = useSiteTheme();
  const highlightIndex = theme.highlightWord ? profile.intro.toLowerCase().indexOf(theme.highlightWord.toLowerCase()) : -1;
  const cv = safeHref(profile.cvUrl);
  const names = profile.name.split(" ");
  return <section className="hero" aria-labelledby="hero-h"><div className="wrap">
    <div className="hero__mast"><h1 id="hero-h" aria-label={profile.name}>{names.map((name, line) => <span className="name-line" key={line}>{line > 0 && <span className="sr-only"> </span>}{theme.nameReveal ? Array.from(name).map((letter, i) => <span className="name-letter" key={i}>{letter}</span>) : name}</span>)}</h1>{theme.sphere && <Dither shape={theme.heroShape === "ring" ? 2 : theme.heroShape === "halfDisc" ? 3 : 0} animate className="hero-art" />}<div className="hero__meta hero-label"><p className="hero__kicker">{profile.headline}</p><span aria-hidden="true"> / </span>{profile.location && <p className="eyebrow">{profile.location}</p>}</div></div>
    {projects.length > 0 && <nav className="hero__contents" aria-label={siteCopy.hero.contentsLabel}>{projects.map((project, index) => <a key={project.id} href={`#project-${project.slug}`}><span className="num">{String(index + 1).padStart(2, "0")}</span>{" "}<span><ProjectTitle title={project.title} /></span></a>)}</nav>}
    <div className="hero__bottom"><div className="hero__intro"><p className="hero__lead">{highlightIndex >= 0 ? <>{profile.intro.slice(0, highlightIndex)}<mark className="highlight-word">{profile.intro.slice(highlightIndex, highlightIndex + theme.highlightWord.length)}</mark>{profile.intro.slice(highlightIndex + theme.highlightWord.length)}</> : profile.intro}</p>
      <div className="btn-row">{projects.length > 0 && <a className="text-link" href="#work">{siteCopy.hero.primary}<span aria-hidden="true"> ↘</span></a>}{cv && <a className="text-link" href={cv}>{siteCopy.hero.secondary}</a>}</div>
      {profile.availabilityText && <p className="hero__status">{profile.availabilityText}</p>}
    </div></div>
  </div></section>;
}
