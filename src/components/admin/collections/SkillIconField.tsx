import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { sanitizeSvg, SVG_MAX_BYTES, svgDataUri } from '@shared/svg';
import type { AnyForm } from '../form/FormField';
type Icon = {title:string;iconSvg:string;preview:string};
export function SkillIconField({form}:{form:AnyForm}) {
 const [search,setSearch]=useState(''),[results,setResults]=useState<Icon[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const value=form.watch('iconSvg') as string|null|undefined;
 // Uploaded raw SVG is never rendered: only a cleaned preview can be displayed.
 let preview:string|undefined;
 try { if(value) preview=svgDataUri(sanitizeSvg(value)); } catch { /* Save schema reports invalid uploads. */ }
 const choose=(iconSvg:string|null)=>{
  form.setValue('iconSvg',iconSvg,{shouldDirty:true,shouldValidate:true});
  form.setValue('iconSlug',null,{shouldDirty:true});
 };
 async function find() {
  setBusy(true);setError('');setResults([]);
  try { setResults(await apiGet<Icon[]>(`/api/admin/svgl?search=${encodeURIComponent(search)}`)); }
  catch(e){setError(e instanceof Error?e.message:'Icon search failed.');}
  finally{setBusy(false);}
 }
 return <fieldset className="skill-icon-field grid gap-3"><legend>Skill icon</legend>
  {preview && <img src={preview} alt="Current skill icon" width={32} height={32}/>}
  <label htmlFor="skill-icon-search">Find on svgl</label>
  <div className="flex gap-2"><Input id="skill-icon-search" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(search.trim()&&!busy) void find();}}}/><Button type="button" disabled={busy||!search.trim()} onClick={()=>void find()}>{busy?'Searching…':'Search icons'}</Button></div>
  <div className="flex flex-wrap gap-2" aria-live="polite">{error && <p role="alert">{error}</p>}{results.map((icon,i)=><Button key={`${icon.title}-${i}`} type="button" variant="outline" aria-label={`Choose ${icon.title}`} onClick={()=>choose(icon.iconSvg)}><img src={icon.preview} alt="" width={24} height={24}/>{icon.title}</Button>)}</div>
  <Button type="button" variant="outline" onClick={()=>choose(null)}>Remove icon</Button>
  <label htmlFor="skill-icon-upload">Upload SVG</label><Input id="skill-icon-upload" type="file" accept="image/svg+xml,.svg" onChange={async e=>{
   const file=e.target.files?.[0];if(!file)return;
   setError('');
   if(file.size>SVG_MAX_BYTES){setError('SVG must be at most 16 KB.');return;}
   try {
    const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read SVG.'));reader.readAsText(file);});
    // The server sanitises this again on every create/update before persistence.
    choose(sanitizeSvg(text));
   }catch(e){setError(e instanceof Error?e.message:'Invalid SVG.');}
   e.target.value='';
  }}/><p className="text-sm text-muted-foreground">SVG only, up to 16 KB. Icons are cleaned on the server when saved.</p>
 </fieldset>;
}
