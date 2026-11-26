import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeImageSrc } from "@/lib/markdown-image";
import "@/styles/project.css";

type MarkdownNode = { type: string; depth?: number; children?: MarkdownNode[] };

/** Article sections start below the page h1, even when an author starts at ##.
 * This opt-in leaves the existing admin preview's heading treatment unchanged. */
function articleHeadings() {
  return (tree: MarkdownNode) => {
    const headings: MarkdownNode[] = [];
    function collect(node: MarkdownNode) {
      if (node.type === "heading") headings.push(node);
      node.children?.forEach(collect);
    }
    collect(tree);
    const base = Math.min(...headings.map(node => node.depth ?? 1));
    let previous = 1;
    for (const node of headings) {
      node.depth = Math.min(6, previous + 1, (node.depth ?? 1) - base + 2);
      previous = node.depth;
    }
  };
}

export function Markdown({ source, article = false }: { source: string; article?: boolean }) {
  return (
    <div className="markdown stack-5">
      <ReactMarkdown remarkPlugins={article ? [remarkGfm, articleHeadings] : [remarkGfm]} components={{
        ...(!article ? {
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
        } satisfies import("react-markdown").Components : {}),
        a: ({ href, children, title }) => <a href={href || undefined} title={title} rel="noopener noreferrer">{children}</a>,
        pre: ({ children }) => <pre className="markdown-code">{children}</pre>,
        img: ({ src, alt, title }) => isSafeImageSrc(src) ? <img src={src} alt={alt ?? ""} title={title} loading="lazy" decoding="async" /> : null,
      }}>{source}</ReactMarkdown>
    </div>
  );
}
