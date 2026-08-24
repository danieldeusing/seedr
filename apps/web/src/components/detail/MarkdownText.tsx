import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders registry markdown (the tl;dr). Loaded lazily by the detail page so the
 * markdown toolchain stays out of the entry chunk that Home and Browse pay for.
 */
export function MarkdownText({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>;
}
