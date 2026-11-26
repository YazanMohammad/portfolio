import { sanitizeOverrides } from "@shared/settings-sanitize";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SettingsInput, toggleKeys, themeDefaults, derivePalette, longCopyKeys, type AdminSettings, type SiteTheme } from "@shared/settings";
import { siteCopy } from "@/content/copy";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api";
import { SaveBar } from "@/components/admin/form/SaveBar";
import { SitePreview } from "@/components/admin/SitePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { copyFields, effectFields } from "./copy-fields";

export function flatten(value: unknown, prefix = ""): Record<string,string> {
 if(!value || typeof value!=="object" || Array.isArray(value))return {};
 return Object.assign({}, ...Object.entries(value).map(([key,item]) => typeof item === "string" ? {[prefix+key]:item} : flatten(item,prefix+key+".")));
}
function nest(value: Record<string,string>) {
 const root: Record<string,unknown> = {};
 for (const [path,text] of Object.entries(value)) {if(!text.trim()||text.trim()===defaults[path])continue;const keys=path.split(".");let target=root;keys.slice(0,-1).forEach(key=>{target[key] ??= {};target=target[key] as Record<string,unknown>;});target[keys.at(-1)!]=text.trim();}
 return root;
}
const groups: [string,string[]][] = [
 ["Hero",["hero."]], ["Work",["work."]], ["Experience",["timeline.","dates."]], ["Skills",["skills."]], ["About",["about."]], ["Contact",["contact."]], ["Project page",["project."]], ["404",["notFound."]], ["Footer",["footer."]], ["Navigation",["loading","skipLink","menuLabel","menuOpen","menuClose","mainNavLabel","nav."]], ["Search and sharing",["meta."]],
];
const defaults = flatten(siteCopy);
type Draft=Record<string,string|boolean|number>;
export function SettingsEditor({mode}:{mode:"copy"|"theme"}) {
 const client = useQueryClient();
 const query = useQuery({queryKey:["admin","settings"],queryFn:()=>apiGet<AdminSettings>("/api/admin/settings"),retry:false});
 const [draft,setDraft] = useState<Draft>({});
 const [baseline,setBaseline] = useState<Draft>({});
 const [errors,setErrors] = useState<Record<string,string>>({});
 const [formError,setFormError] = useState<string|null>(null);
 const [saving,setSaving] = useState(false);
 const [section,setSection]=useState("Hero");
 const [search,setSearch]=useState("");
 const dirty = JSON.stringify(draft)!==JSON.stringify(baseline);
 const latest = useRef(draft);latest.current=draft;
 const toDraft = (settings:AdminSettings):Draft => {
  const clean=sanitizeOverrides(settings);
  const values=flatten(clean.copy);
  return mode === "copy" ? Object.fromEntries(Object.keys(defaults).map(key=>[key,values[key] ?? ""])) : {...themeDefaults,...clean.theme};
 };
 useEffect(()=>{if(query.data && !dirty && !saving){const value=toDraft(query.data);setDraft(value);setBaseline(value);}},[query.data]);
 const change=(key:string,value:string|boolean|number)=>{setDraft(old=>({...old,[key]:value}));setErrors(old=>({...old,[`${mode}.${key}`]:""}));};
 const theme = {...themeDefaults,...draft} as SiteTheme;
 const validTone = Number.isInteger(theme.hue) && theme.hue >= 0 && theme.hue <= 359;
 const palette = derivePalette(validTone ? theme.hue : themeDefaults.hue);
 const invalid = mode === "theme" && !validTone;
 async function save() {
  if(saving || invalid || !dirty)return;
  const submitted={...latest.current};
  const body=mode==="copy" ? {copy:nest(submitted as Record<string,string>)} : {theme:Object.fromEntries(Object.entries(submitted).filter(([key,value])=>value!==themeDefaults[key as keyof SiteTheme]))};
  const validation=SettingsInput.safeParse(body);
  if(!validation.success){setErrors(Object.fromEntries(validation.error.issues.map(issue=>[issue.path.join("."),issue.message])));return;}
  setSaving(true);setErrors({});setFormError(null);
  try {
   const saved=await apiSend<AdminSettings>("PUT","/api/admin/settings",validation.data);
   const base=toDraft(saved);
   const later=Object.fromEntries(Object.entries(latest.current).filter(([key,value])=>value!==submitted[key]));
   setBaseline(base);setDraft({...base,...later});client.setQueryData(["admin","settings"],saved);
   void client.invalidateQueries({queryKey:["admin","summary"]});void client.invalidateQueries({queryKey:["content"]});toast.success("Saved");
  }catch(error){if(error instanceof ApiRequestError){setErrors(error.fields ?? {});setFormError(error.message);}else setFormError("Could not save. Try again.");}
  finally{setSaving(false);}
 }
 if(query.isPending)return <p>Loading…</p>;
 if(!query.data)return <p role="alert">Could not load settings. Reload the page to try again.</p>;
 const errorFor=(key:string)=>errors[`${mode}.${key}`];
 const changed=(key:string)=>Boolean(String(draft[key]??"").trim() && draft[key]!==defaults[key]);
 const keysFor=(prefixes:string[])=>Object.keys(defaults).filter(key=>prefixes.some(prefix=>key===prefix||key.startsWith(prefix)));
 const matches=(key:string)=>[key,...copyFields[key],defaults[key],String(draft[key]??"")].join(" ").toLowerCase().includes(search.trim().toLowerCase());
 const field=(key:string)=>{
  const [label,hint]=copyFields[key];const max=longCopyKeys.has(key.split(".").at(-1)!)?1000:300;
  const Component=max===1000 ? Textarea : Input;const value=String(draft[key]??"");const error=errorFor(key);
  return <div className="admin-copy-field" key={key}><div className="admin-field-heading"><label htmlFor={key}>{label}</label>{changed(key)&&<span className="admin-dirty-dot" role="img" aria-label={`${label} changed`}/>}</div><p id={`${key}-hint`} className="admin-field-hint">{hint}</p><div className="admin-copy-input"><Component id={key} value={value} placeholder={defaults[key]} maxLength={max} aria-invalid={!!error} aria-describedby={`${key}-hint${error?` ${key}-error`:""}`} disabled={saving} onChange={event=>change(key,event.target.value)}/><Button type="button" variant="outline" aria-label={`Reset ${label}`} disabled={saving||!value} onClick={()=>change(key,"")}>Reset</Button></div>{value.length>=max*.8&&<p className="admin-character-count">{value.length} / {max}</p>}{error&&<p id={`${key}-error`} className="text-destructive">{error}</p>}</div>;
 };
 return <div><p className="admin-kicker">Site / {mode==="copy"?"Words":"Appearance"}</p><h1>{mode==="copy"?"Site text":"Look"}</h1><p className="admin-page-intro">{mode==="copy"?"Edit the words around your work. Empty fields use the default text.":"Set the tone, keep the focus on your work. Changes appear in the preview before you save."}</p>
 {query.isError && <p role="alert">Could not refresh. Your edits are still here.</p>}
 <form onSubmit={event=>{event.preventDefault();void save();}}>
 {mode==="copy" ? <><label htmlFor="copy-search" className="sr-only">Find site text</label><Input id="copy-search" type="search" placeholder="Find a label, button or message…" value={search} onChange={event=>setSearch(event.target.value)} className="mb-7 max-w-xl"/><div className="admin-text-layout"><div className="admin-section-rail" aria-label="Text sections">{groups.map(([name,prefixes])=>{const keys=keysFor(prefixes);const count=keys.filter(changed).length;return <button key={name} type="button" aria-pressed={!search&&section===name} aria-label={`${name} · ${count} changed`} onClick={()=>{setSection(name);setSearch("");}}>{name}<span>{count}</span></button>;})}</div><div>{search&&<p className="admin-field-hint" role="status">{Object.keys(defaults).filter(matches).length} matching fields</p>}{groups.filter(([name])=>search||name===section).map(([name,prefixes])=>{const keys=keysFor(prefixes).filter(key=>!search||matches(key));if(!keys.length)return null;return <section key={name} aria-label={`${name} text`}><div className="admin-group-head"><h2>{name}</h2><Button type="button" variant="outline" disabled={saving} onClick={()=>setDraft(old=>({...old,...Object.fromEntries(keysFor(prefixes).map(key=>[key,""]))}))}>Reset {name}</Button></div>{keys.map(field)}</section>;})}</div></div></> : <div className="admin-look-layout"><div className="admin-look-controls">
 <fieldset><legend>Tone</legend><label htmlFor="tone">Tone</label><p className="admin-field-hint">One colour, carried through the site. Text stays readable at every setting.</p><input id="tone" className="admin-tone-track" type="range" min={0} max={359} step={1} value={Number(draft.hue??themeDefaults.hue)} aria-valuetext={`${theme.hue} degrees`} disabled={saving} onChange={event=>change("hue",Number(event.target.value))}/><div className="admin-tone-value"><span className="admin-tone-swatch" style={{background:palette.accent}} aria-hidden="true"/><output htmlFor="tone">{theme.hue}°</output></div>{errorFor("hue")&&<p className="text-destructive">{errorFor("hue")}</p>}<Button type="button" variant="outline" disabled={saving} onClick={()=>change("hue",themeDefaults.hue)}>Reset tone</Button></fieldset>
 <fieldset><legend>Motion and detail</legend>{toggleKeys.map(key=><label key={key} className="admin-effect"><input type="checkbox" checked={Boolean(draft[key]??themeDefaults[key])} disabled={saving} onChange={event=>change(key,event.target.checked)}/><span>{effectFields[key][0]}<small>{effectFields[key][1]}</small></span></label>)}</fieldset>
 <fieldset><legend>Hero detail</legend><span>Hero shape</span><div className="admin-shapes">{([['sphere','Sphere'],['ring','Ring'],['halfDisc','Half disc']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={theme.heroShape===key} disabled={saving} onClick={()=>change('heroShape',key)}><svg viewBox="0 0 40 40" aria-hidden="true">{key==='halfDisc'?<path d="M5 20a15 15 0 0 1 30 0Z" fill="currentColor"/>:<circle cx="20" cy="20" r="14" fill={key==='sphere'?'currentColor':'none'} stroke="currentColor" strokeWidth="4"/>}</svg>{label}</button>)}</div><label htmlFor="highlightWord">Highlight word</label><p className="admin-field-hint">A word from your introduction to mark in the accent colour. Leave empty for none.</p><Input id="highlightWord" value={String(draft.highlightWord??themeDefaults.highlightWord)} maxLength={40} disabled={saving} onChange={event=>change("highlightWord",event.target.value)}/>{errorFor("highlightWord")&&<p className="text-destructive">{errorFor("highlightWord")}</p>}</fieldset>
 <Button type="button" variant="outline" disabled={saving} onClick={()=>setDraft({...themeDefaults})}>Reset look</Button></div><aside className="admin-preview-panel"><p className="admin-kicker">Live preview / unsaved</p><SitePreview theme={theme} full/></aside></div>}
 <SaveBar shell formId={`settings-${mode}`} dirty={dirty} saving={saving} disabled={invalid} formError={formError} onSave={save} onDiscard={()=>{setDraft(baseline);setErrors({});setFormError(null);}}/>
 </form></div>;
}

