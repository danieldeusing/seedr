import { SafeMarkdown } from "@/core/ui/SafeMarkdown";

/** Rendered markdown for the preview's `formatted` mode. */
export function FormattedPreview({ content }: { content: string }) {
  return (
    <div className="formatted-preview p-4 text-xs leading-relaxed" data-testid="formatted-preview">
      <SafeMarkdown>{content}</SafeMarkdown>
    </div>
  );
}
