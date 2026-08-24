import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeExternalUrl, useExternalLink } from "@/core/externalUrl";

/**
 * A link the reader can follow without the app following it: the click is
 * always cancelled and the destination goes through the open-in-browser
 * dialog. A scheme the shell will not be given renders as plain text, so
 * `[click](javascript:…)` has nothing to click. (configr's MarkdownLink,
 * with Studio's confirmation in front.)
 */
function MarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">): ReactNode {
  const request = useExternalLink((s) => s.request);
  const url = href ? safeExternalUrl(href) : null;
  if (!url) return <span>{children}</span>;
  return (
    <button type="button" className="doc-link doc-link--forward" onClick={() => request(url)}>
      {children}
    </button>
  );
}

/** Nothing is fetched from a previewed document; an image renders as its name. */
function MarkdownImage({ alt, src }: ComponentPropsWithoutRef<"img">): ReactNode {
  return <span className="border border-border px-1 text-muted-foreground italic">image: {alt || String(src ?? "")}</span>;
}

/** Rendered markdown for the preview's `formatted` mode. */
export function FormattedPreview({ content }: { content: string }) {
  return (
    <div className="formatted-preview p-4 text-xs leading-relaxed" data-testid="formatted-preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: MarkdownLink,
          img: MarkdownImage,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
