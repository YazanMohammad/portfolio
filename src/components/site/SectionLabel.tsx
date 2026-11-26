export function SectionLabel({text}:{text:string}) {
 const match=/^(\[\d+\])\s*(.*)$/.exec(text);
 return match?<><span aria-hidden="true">{match[1]} </span><span>{match[2]}</span></>:<>{text}</>;
}
