import { useState } from "react";
import { useQuery } from '@tanstack/react-query';
import type { PublicContent } from '@shared/index';
import { mergeSettings, type SiteTheme, type SiteCopy } from '@shared/settings';
import { apiGet, fileUrl } from '@/lib/api';
import { Hero } from '@/components/site/Hero';
import { WorkSection } from '@/components/site/WorkSection';
import { Footer } from '@/components/site/Footer';
import { SiteSettingsContext, themeStyle } from '@/lib/site/settings';

/** Real components, not a framed page. Inert duplicates are outside the accessibility tree. */
export function SitePreview({theme,copy,full=false}:{theme?:SiteTheme;copy?:SiteCopy;full?:boolean}) {
 const query=useQuery({queryKey:['content'],queryFn:()=>apiGet<PublicContent>('/api/content'),retry:false});
 const content=query.data;
 const [failedImages,setFailedImages]=useState<string[]>([]);
 const settings=mergeSettings(content?.settings);
 const current={copy:copy??settings.copy,theme:theme??settings.theme};
 if(!content?.profile?.name)return <p className="admin-field-hint">{query.isError?'Preview could not load. Your edits are still here.':'Loading site preview…'}</p>;
 const projects=content.projects.map(project=>({...project,imageKey:project.imageKey&&failedImages.includes(fileUrl(project.imageKey))?null:project.imageKey}));
 return <div onErrorCapture={event=>{if(event.target instanceof HTMLImageElement){const src=event.target.getAttribute("src");if(src)setFailedImages(old=>old.includes(src)?old:[...old,src]);}}} className="admin-live-preview" data-testid="site-preview" data-hue={current.theme.hue} data-sphere={String(current.theme.sphere)} aria-hidden="true" inert>
  <SiteSettingsContext.Provider value={current}><div className="site-shell" style={themeStyle(current.theme)} data-name-reveal={current.theme.nameReveal} data-cursor-preview={current.theme.cursorPreview}>
   {current.theme.grid&&<div className="drawing-grid"/>}
   <Hero profile={content.profile} projects={projects}/>
   {full&&<><WorkSection projects={projects.slice(0,1)}/><Footer profile={content.profile}/></>}
  </div></SiteSettingsContext.Provider>
 </div>;
}
