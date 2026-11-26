/** Keep display typography while giving ambiguous serif digits a clear sans face. */
export function ProjectTitle({ title }: { title: string }) {
  return <>{title.split(/(V?\d+)/).map((part, index) => /^V?\d+$/.test(part)
    ? <span className="num" key={index}>{part}</span>
    : part)}</>;
}
