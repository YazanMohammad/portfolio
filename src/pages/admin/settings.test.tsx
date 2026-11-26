import { it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { AdminLayout } from "@/components/admin/AdminLayout";
import fallback from "@/content/fallback.json";
import { siteCopy } from "@/content/copy";
import { themeDefaults } from "@shared/settings";
vi.mock("@/lib/api", async () => ({...await vi.importActual("@/lib/api"),apiGet:vi.fn(),apiSend:vi.fn()}));
import { apiGet, apiSend } from "@/lib/api";
import SiteText from "./site-text";
import { copyFields } from "./copy-fields";
import { previewScale } from "@/components/admin/SitePreview";
import Look from "./look";
const settings = {copy:{},theme:{},defaults:{copy:siteCopy,theme:themeDefaults},updatedAt:null};
beforeEach(()=>{vi.mocked(apiGet).mockImplementation(async path => path === "/api/content" ? fallback as never : path.includes("summary") ? {unreadCount:0} as never : settings as never);vi.mocked(apiSend).mockReset();});
it("Site text saves a field and shows Saved", async()=>{
 vi.mocked(apiSend).mockResolvedValue({...settings,copy:{work:{heading:"My work"}}});
 renderWithProviders(<AdminLayout><SiteText/></AdminLayout>);
 await screen.findByRole("tab",{name:/Work ·/});fireEvent.click(screen.getByRole("tab",{name:/Work ·/}));
 const field = await screen.findByLabelText("Work heading");
 expect(field).toHaveAttribute("placeholder","Selected work");
 expect(field.getAttribute("aria-describedby")).toBe("work.heading-hint");
 expect(document.getElementById("work.heading-hint")).toBeInTheDocument();
 expect(document.getElementById("work.heading-error")).toBeNull();
 fireEvent.change(field,{target:{value:"My work"}});
 expect(screen.getByRole("button",{name:"Save"}).closest(".admin-save-slot")).not.toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(apiSend).toHaveBeenCalledWith("PUT","/api/admin/settings",expect.objectContaining({copy:expect.objectContaining({work:expect.objectContaining({heading:"My work"})})})));
 expect(await screen.findByText("Saved")).toBeInTheDocument();
});
it("searches copy, counts changed fields and resets a group",async()=>{
 renderWithProviders(<AdminLayout><SiteText/></AdminLayout>);
 const search=await screen.findByRole("searchbox",{name:"Find site text"});
 fireEvent.change(search,{target:{value:"Work heading"}});
 const field=screen.getByLabelText("Work heading");fireEvent.change(field,{target:{value:"Changed"}});
 expect(screen.getByRole("tab",{name:/Work · 1 changed/})).toBeInTheDocument();
 expect(screen.getByLabelText("Work heading changed")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Reset Work"}));
 expect(field).toHaveValue("");expect(screen.getByRole("tab",{name:/Work · 0 changed/})).toBeInTheDocument();
});
it("Look preview falls back to the real project plate for an unavailable image",async()=>{
 vi.mocked(apiGet).mockImplementation(async path=>path==='/api/content'?{...fallback,projects:fallback.projects.map((p,i)=>({...p,imageKey:i===0?'missing.png':null}))} as never:path.includes('summary')?{unreadCount:0} as never:settings as never);
 const {container}=renderWithProviders(<AdminLayout><Look/></AdminLayout>);await screen.findByTestId('site-preview');
 const image=container.querySelector('.project-frame img')!;expect(image).not.toBeNull();fireEvent.error(image);
 await waitFor(()=>expect(container.querySelector('.project-frame img')).toBeNull());expect(container.querySelector('.type-plate')).not.toBeNull();
});
it("Look saves sparse changes and reset removes the tone override",async()=>{
 renderWithProviders(<AdminLayout><Look/></AdminLayout>);
 const tone=await screen.findByRole("slider",{name:"Tone"});fireEvent.change(tone,{target:{value:"200"}});
 vi.mocked(apiSend).mockResolvedValue({...settings,theme:{hue:200}});
 fireEvent.click(screen.getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(apiSend).toHaveBeenCalledWith("PUT","/api/admin/settings",{theme:{hue:200}}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Save"})).toBeDisabled());
 fireEvent.click(screen.getByRole("button",{name:"Reset tone"}));
 vi.mocked(apiSend).mockResolvedValue(settings);fireEvent.click(screen.getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(apiSend).toHaveBeenLastCalledWith("PUT","/api/admin/settings",{theme:{}}));
});
it("Look uses one tone slider, derived preview and valid contrast pairs",async()=>{
 renderWithProviders(<AdminLayout><Look/></AdminLayout>);
 const tone = await screen.findByRole("slider",{name:"Tone"});
 fireEvent.change(tone,{target:{value:"240"}});
 expect(screen.getByRole("button",{name:"Save"})).toBeEnabled();
 expect(screen.getByTestId("site-preview")).toHaveAttribute("data-hue","240");
 fireEvent.click(screen.getByRole("switch",{name:/Hero sphere/}));
 expect(screen.getByTestId("site-preview")).toHaveAttribute("data-sphere","false");
 expect(screen.queryByLabelText("text hex")).toBeNull();
 expect(screen.queryByText(/— Pass/)).toBeNull();
 vi.mocked(apiSend).mockResolvedValue({...settings,theme:{hue:240}});
 fireEvent.click(screen.getByRole("button",{name:"Save"}));
 await waitFor(()=>expect(apiSend).toHaveBeenCalledWith("PUT","/api/admin/settings",expect.objectContaining({theme:expect.objectContaining({hue:240})})));
});

it("Site text groups are a tablist with arrow keys and a labelled panel",async()=>{
 renderWithProviders(<AdminLayout><SiteText/></AdminLayout>);
 const tabs=await screen.findAllByRole("tab");expect(screen.getByRole("tablist",{name:"Text sections"})).toBeInTheDocument();
 expect(tabs[0]).toHaveAttribute("aria-selected","true");expect(tabs[0]).toHaveAttribute("tabindex","0");expect(tabs[1]).toHaveAttribute("tabindex","-1");
 expect(tabs[0].getAttribute("aria-controls")).toBe("copy-panel");
 tabs[0].focus();fireEvent.keyDown(tabs[0],{key:"ArrowDown"});
 expect(tabs[1]).toHaveFocus();expect(tabs[1]).toHaveAttribute("aria-selected","true");expect(tabs[0]).toHaveAttribute("aria-selected","false");
 expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/Work/);
 fireEvent.keyDown(tabs[1],{key:"End"});expect(tabs.at(-1)).toHaveFocus();
 fireEvent.keyDown(tabs.at(-1)!,{key:"ArrowDown"});expect(tabs[0]).toHaveFocus();
 fireEvent.keyDown(tabs[0],{key:"ArrowUp"});expect(tabs.at(-1)).toHaveFocus();
 fireEvent.keyDown(tabs.at(-1)!,{key:"Home"});expect(tabs[0]).toHaveFocus();
});
it("announces the field count in a polite live region, with and without a search",async()=>{
 renderWithProviders(<AdminLayout><SiteText/></AdminLayout>);
 const search=await screen.findByRole("searchbox",{name:"Find site text"});
 const status=screen.getByRole("status",{name:"Field count"});expect(status).toHaveAttribute("aria-live","polite");expect(status).toHaveAttribute("role","status");
 expect(status.textContent).toBe(`${Object.keys(copyFields).length} fields`);
 fireEvent.change(search,{target:{value:"Work heading"}});
 expect(screen.getByRole("status",{name:"Field count"})).toHaveTextContent(/^\d+ fields? match(es)?$/);
 fireEvent.change(search,{target:{value:"zzzz-none"}});expect(status).toHaveTextContent("0 fields match");
});
it("Look: hero shape is a radio group, toggles are described switches",async()=>{
 renderWithProviders(<AdminLayout><Look/></AdminLayout>);
 const group=await screen.findByRole("radiogroup",{name:"Hero shape"});
 expect(group).toHaveAccessibleDescription(/dotted shape/);
 const ring=screen.getByRole("radio",{name:"Ring"});fireEvent.click(ring);expect(ring).toBeChecked();expect(screen.getByRole("radio",{name:"Sphere"})).not.toBeChecked();
 const grid=screen.getByRole("switch",{name:"Page grid"});expect(grid).toHaveAttribute("aria-describedby","effect-grid-hint");
 expect(grid).toHaveAccessibleDescription(/faint grid/);
 expect(screen.getByLabelText("Highlight word")).toHaveAccessibleDescription(/word from your introduction/);
});
it("Look: tone slider has one name, a value text and a described hint",async()=>{
 renderWithProviders(<AdminLayout><Look/></AdminLayout>);
 const tone=await screen.findByRole("slider",{name:"Tone"});
 expect(tone).toHaveAttribute("aria-valuetext",`Tone ${themeDefaults.hue} of 359`);
 fireEvent.change(tone,{target:{value:"200"}});expect(tone).toHaveAttribute("aria-valuetext","Tone 200 of 359");
 expect(tone).toHaveAccessibleDescription(/One colour/);expect(tone).not.toHaveAttribute("aria-label");
 expect(screen.queryByRole("group",{name:"Tone"})).toBeNull();
});
it("preview scale comes from the container width and reserves height",async()=>{
 const callbacks:((entries:unknown[])=>void)[]=[];
 const original=globalThis.ResizeObserver;
 globalThis.ResizeObserver=class{constructor(cb:(entries:unknown[])=>void){callbacks.push(cb);}observe(){}unobserve(){}disconnect(){}} as never;
 const rect=vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({width:600,height:0} as DOMRect);
 const height=vi.spyOn(HTMLElement.prototype,"offsetHeight","get").mockReturnValue(800);
 try{
  renderWithProviders(<AdminLayout><Look/></AdminLayout>);
  const preview=await screen.findByTestId("site-preview");
  const stage=preview.querySelector<HTMLElement>(".admin-preview-stage")!,viewport=preview.querySelector<HTMLElement>(".admin-preview-viewport")!;
  expect(stage.style.width).toBe("1200px");expect(stage.style.transform).toBe("scale(0.5)");expect(viewport.style.height).toBe("400px");
  expect(preview).toHaveAttribute("aria-hidden","true");expect(preview).toHaveAttribute("inert");
  act(()=>callbacks.forEach(cb=>cb([{contentRect:{width:300},target:viewport}])));
  expect(stage.style.transform).toBe("scale(0.25)");
 }finally{globalThis.ResizeObserver=original;rect.mockRestore();height.mockRestore();}
 expect(previewScale(900)).toBe(0.75);
});

it("the 1200px preview stage is the cqw size container", async()=>{
 const {readFileSync}=await import("node:fs");
 const css=readFileSync("src/components/admin/settings.css","utf8"),admin=readFileSync("src/components/admin/admin.css","utf8");
 renderWithProviders(<AdminLayout><Look/></AdminLayout>);
 const preview=await screen.findByTestId("site-preview");
 const stage=preview.querySelector<HTMLElement>(".admin-preview-stage")!;
 expect(stage.querySelector(".site-shell")).not.toBeNull();expect(stage.style.width).toBe("1200px");
 expect(css).toMatch(/\.admin-preview-stage\{[^}]*container-type:inline-size/);
 expect(admin).not.toMatch(/\.admin-live-preview\s*\{[^}]*container-type/);
 expect(admin).not.toMatch(/\.admin-live-preview\s*>\s*\.site-shell/);
});

it("rail and hero-shape selection use the admin accent-text variant with visible borders", async()=>{
 const {readFileSync}=await import("node:fs");
 const {contrast}=await import("@shared/palette");
 const {adminAccentText}=await import("@/lib/admin/accent-text");
 const css=readFileSync("src/components/admin/settings.css","utf8"),admin=readFileSync("src/components/admin/admin.css","utf8");
 expect(css).toMatch(/\.admin-section-rail button\[aria-selected=true\]\{color:var\(--p-accent-text\)/);
 expect(css).toMatch(/\.admin-shape:has\(input:checked\)\{[^}]*color:var\(--p-accent-text\)/);
 expect(css).not.toMatch(/(?<![-\w])color:var\(--p-accent\)/);
 expect(css).not.toContain("--p-on-accent");expect(admin).not.toContain("aria-pressed");
 expect(css).toMatch(/\.admin-shape\{[^}]*border:1px solid #767676/);
 expect(contrast("#767676","#141414")).toBeGreaterThanOrEqual(3);
 for(let hue=0;hue<360;hue+=1)expect(contrast(adminAccentText(hue),"#141414"),`hue ${hue}`).toBeGreaterThanOrEqual(4.5);
});
