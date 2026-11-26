/** Pure, deterministic palette derivation. No client-provided colour reaches CSS. */
export type Palette = {bg:string;surface:string;line:string;text:string;muted:string;accent:string;onAccent:string};
function hsl(hue:number,saturation:number,lightness:number):string {
 const chroma=(1-Math.abs(2*lightness-1))*saturation;
 const h=hue/60,x=chroma*(1-Math.abs(h%2-1)),m=lightness-chroma/2;
 const channels=h<1?[chroma,x,0]:h<2?[x,chroma,0]:h<3?[0,chroma,x]:h<4?[0,x,chroma]:h<5?[x,0,chroma]:[chroma,0,x];
 return "#"+channels.map(channel=>Math.round((channel+m)*255).toString(16).padStart(2,"0")).join("");
}
function luminance(colour:string):number {
 const c=[1,3,5].map(index=>parseInt(colour.slice(index,index+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return c[0]!*.2126+c[1]!*.7152+c[2]!*.0722;
}
export function contrast(a:string,b:string):number {
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function derivePalette(hue:number):Palette {
 if(!Number.isInteger(hue)||hue<0||hue>359)throw new RangeError("Tone must be an integer from 0 to 359.");
 const bg="#0c0c0c";
 let lightness=.614,accent=hsl(hue,1,lightness);
 // Especially blue/violet need extra lightness. Compare the rounded output, not unquantized HSL.
 while(contrast(accent,bg)<4.5 && lightness<.95){lightness+=.005;accent=hsl(hue,1,lightness);}
 const onAccent=contrast("#000000",accent)>=contrast("#0c0c0c",accent)?"#000000":"#0c0c0c";
 return {bg,surface:hsl(hue,.045,.079),line:hsl(hue,.04,.15),text:hsl(hue,.035,.918),muted:hsl(hue,.035,.561),accent,onAccent};
}
export function contrastPairs(palette:Palette) {
 return ([["text","bg"],["muted","bg"],["text","surface"],["onAccent","accent"],["accent","bg"]] as const)
  .map(([foreground,background])=>({foreground,background,ratio:contrast(palette[foreground],palette[background])}));
}
