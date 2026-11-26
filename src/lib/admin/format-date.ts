const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** "22 Nov · 12:00" (local time, no seconds). */
export function formatMessageDate(iso:string):string{
  const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;
  const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}
