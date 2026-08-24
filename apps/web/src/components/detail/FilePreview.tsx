import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, FileArchive } from "lucide-react";
import { tokenize, type TokenType } from "@/lib/highlight";
import { formatBytes, type PreviewResult } from "@/lib/preview";
import { cn } from "@/lib/utils";

export type PreviewMode = "syntax" | "plain";

const TOKEN_CLASSES: Record<TokenType, string> = {
  comment: "text-muted-foreground italic",
  string: "text-(--badge-green)",
  number: "text-(--badge-amber)",
  keyword: "text-primary",
  heading: "font-bold text-foreground",
  punct: "text-muted-foreground",
};

export function TextPreview({ text, language, mode }: { text: string; language: string; mode: PreviewMode }) {
  const lines = useMemo(() => tokenize(text, mode === "syntax" ? language : "plaintext"), [text, language, mode]);
  const gutterWidth = `${String(lines.length).length + 1}ch`;
  return (
    <pre className="p-3 font-mono text-sm leading-relaxed text-foreground" aria-label="File contents">
      <code className="block">
        {lines.map((tokens, index) => (
          <span key={index} className="flex">
            <span
              aria-hidden
              className="shrink-0 select-none pr-3 text-right text-muted-foreground/70"
              style={{ width: gutterWidth }}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
              {tokens.map((token, tokenIndex) =>
                token.type ? (
                  <span key={tokenIndex} className={TOKEN_CLASSES[token.type]}>
                    {token.text}
                  </span>
                ) : (
                  token.text
                )
              )}
              {"\n"}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Renders image bytes through an <img> so SVG markup never becomes part of the page. */
export function ImagePreview({ bytes, mime, name }: { bytes: Uint8Array; mime: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, mime]);
  if (!url) return null;
  return (
    <div className="flex items-center justify-center p-3">
      <img src={url} alt={name} className="max-h-full max-w-full" />
    </div>
  );
}

function MetadataPanel({
  name,
  size,
  type,
  note,
  url,
}: {
  name: string;
  size?: number;
  type: string | null;
  note: string;
  url: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <p className="flex items-center gap-2 text-foreground">
        <FileArchive className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="break-all">{name}</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <dt>size</dt>
        <dd className="text-foreground">{size === undefined ? "unknown" : formatBytes(size)}</dd>
        <dt>type</dt>
        <dd className="text-foreground">{type ?? "unknown"}</dd>
      </dl>
      <p className="text-muted-foreground">{note}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
          Open on GitHub
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </div>
  );
}

export interface FilePreviewProps {
  result: PreviewResult;
  name: string;
  mode: PreviewMode;
  /** Page for this file on its host, for binaries the app never decodes. */
  openUrl: string | null;
}

export function FilePreview({ result, name, mode, openUrl }: FilePreviewProps) {
  switch (result.kind) {
    case "text":
      return <TextPreview text={result.text} language={result.language} mode={mode} />;
    case "image":
      return <ImagePreview bytes={result.bytes} mime={result.mime} name={name} />;
    case "binary":
      return <MetadataPanel name={name} size={result.size} type={result.mime} note={`Not previewed: ${result.reason}.`} url={openUrl} />;
    case "too-large":
      return (
        <MetadataPanel
          name={name}
          size={result.size}
          type={result.category}
          note={`Too large to preview here — the limit for ${result.category} files is ${formatBytes(result.limit)}.`}
          url={openUrl}
        />
      );
    case "error":
      return (
        <p role="alert" className={cn("flex items-center gap-2 p-3 text-sm text-destructive")}>
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {result.message}
        </p>
      );
  }
}
