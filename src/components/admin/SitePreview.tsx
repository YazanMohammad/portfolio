import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./settings.css";
import { useQuery } from '@tanstack/react-query';
import type { PublicContent } from '@shared/index';
import { mergeSettings, type SiteTheme, type SiteCopy } from '@shared/settings';
import { apiGet, fileUrl } from '@/lib/api';
import { Hero } from '@/components/site/Hero';
import { WorkSection } from '@/components/site/WorkSection';
import { Footer } from '@/components/site/Footer';
import { SiteSettingsContext, themeStyle } from '@/lib/site/settings';

export const PREVIEW_WIDTH=1200;
/** Scale that fits the 1200px-wide site into a container of the given width. */
export function previewScale(containerWidth:number){return containerWidth>0?containerWidth/PREVIEW_WIDTH:1;}

/** Renders children at 1200px and scales them with transform, reserving the scaled height. */
function ScaledStage({children}:{children:ReactNode}) {
 const viewport=useRef<HTMLDivElement>(null);const stage=useRef<HTMLDivElement>(null);
 const [scale,setScale]=useState(1);const [height,setHeight]=useState(0);
 useLayoutEffect(()=>{
  const view=viewport.current,inner=stage.current;if(!view||!inner)return;
  const measure=(width=view.getBoundingClientRect().width)=>setScale(previewScale(width));
  const measureHeight=(value=inner.offsetHeight)=>setHeight(value);
  measure();measureHeight();
  const widthObserver=new ResizeObserver(entries=>measure(entries[0]?.contentRect.width));
  const heightObserver=new ResizeObserver(entries=>measureHeight(entries[0]?.target instanceof HTMLElement?entries[0].target.offsetHeight:undefined));
  widthObserver.observe(view);heightObserver.observe(inner);
  return()=>{widthObserver.disconnect();heightObserver.disconnect();};
 },[]);
 return <div ref={viewport} className="admin-preview-viewport" style={{height:height?height*scale:undefined}}><div ref={stage} className="admin-preview-stage" data-scale={scale} style={{width:PREVIEW_WIDTH,transform:`scale(${scale})`}}>{children}</div></div>;
}

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
  <ScaledStage><SiteSettingsContext.Provider value={current}><div className="site-shell" style={themeStyle(current.theme)} data-name-reveal={current.theme.nameReveal} data-cursor-preview={current.theme.cursorPreview}>
   {current.theme.grid&&<div className="drawing-grid"/>}
   <Hero profile={content.profile} projects={projects}/>
   {full&&<><WorkSection projects={projects.slice(0,1)}/><Footer profile={content.profile}/></>}
  </div></SiteSettingsContext.Provider></ScaledStage>
 </div>;
}
