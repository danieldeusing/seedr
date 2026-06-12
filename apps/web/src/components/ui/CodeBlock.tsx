import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  label?: string;
}

/**
 * Code block with copy button.
 * Extracts the repeated pattern from Detail.tsx.
 */
export function CodeBlock({ code, label }: CodeBlockProps) {
  return (
    <div>
      {label && (
        <h3 className="text-sm font-medium text-subtext mb-2">{label}</h3>
      )}
      <div className="bg-surface/50 border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <code className="text-sm font-mono text-text">{code}</code>
          <CopyButton text={code} />
        </div>
      </div>
    </div>
  );
}
