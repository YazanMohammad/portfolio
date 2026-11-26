import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fallback from "@/content/fallback.json";
import type { PublicContent } from "@shared/index";
import { mergeSettings, derivePalette } from "@shared/settings";
import { SiteLayout } from "./SiteLayout";
import { WorkSection } from "./WorkSection";
import { Hero } from "./Hero";
import { SkillsSection } from "./SkillsSection";
it("renders overridden headings and validated theme variables",()=>{
 const content = {...fallback,settings:mergeSettings({copy:{work:{heading:"Things I made"}},theme:{hue:240}})} as PublicContent;
 const {container}=render(<SiteLayout content={content}><WorkSection projects={content.projects}/></SiteLayout>);
 expect(screen.getByRole("heading",{name:"Things I made"})).toBeInTheDocument();
 expect((container.querySelector(".site-shell") as HTMLElement).style.getPropertyValue("--accent")).toBe(derivePalette(240).accent);
});
it("hides sphere and marquee, preserves static skills, highlights first case-insensitive word",()=>{
 const content = {...fallback,profile:{...fallback.profile,intro:"Jordan and jordan"},settings:mergeSettings({theme:{sphere:false,marquee:false,sectionShapes:false,nameReveal:false,highlightWord:"jOrDaN"}})} as PublicContent;
 const {container}=render(<SiteLayout content={content}><Hero profile={content.profile}/><SkillsSection skills={content.skills}/></SiteLayout>);
 expect(container.querySelector(".hero-art")).toBeNull();expect(container.querySelector(".skills-marquee")).toBeNull();expect(container.querySelector(".section-art")).toBeNull();
 expect(screen.getByRole("list",{name:"Skills"})).toBeInTheDocument();expect(container.querySelectorAll("mark")).toHaveLength(1);expect(container.querySelector("mark")).toHaveTextContent("Jordan");
 expect(container.querySelector(".name-letter")).toBeNull();
});
it("empty highlight word has no highlighted span",()=>{
 const content = {...fallback,settings:mergeSettings({theme:{highlightWord:""}})} as PublicContent;
 const {container}=render(<SiteLayout content={content}><Hero profile={content.profile}/></SiteLayout>);
 expect(container.querySelector("mark")).toBeNull();
});
