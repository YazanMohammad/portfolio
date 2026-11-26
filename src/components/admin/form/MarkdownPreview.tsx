import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeImageSrc } from "@/lib/markdown-image";

export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="prose prose-sm max-w-none text-foreground prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" />,
          img: ({ node: _node, src, alt }) =>
            isSafeImageSrc(src) ? <img src={src} alt={alt ?? ""} loading="lazy" /> : null,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
