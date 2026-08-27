import { FolderOpen } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";

interface OnboardingProps {
  error: string | null;
  onChoose(): void;
}

/** First run: point Studio at a seedr registry checkout. */
export function Onboarding({ error, onChoose }: OnboardingProps) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-xl border border-neutral-700 bg-neutral-980 p-8">
        <p className="prompt">seedr studio</p>
        <h1 className="glow-lg mt-4 text-2xl font-bold">Choose a registry</h1>
        <p className="mt-3 text-muted-foreground">
          Studio works on a local checkout of a seedr repository — one with a <code className="text-primary">registry/</code> directory, or whatever its{" "}
          <code className="text-primary">seedr.config.json</code> names instead, and the
          operations CLI at <code className="text-primary">scripts/registry-op.ts</code>. Nothing is read outside that folder.
        </p>
        {error && (
          <p className="mt-4 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <span className="mt-6 inline-flex items-center gap-2">
          <IconButton icon={FolderOpen} ariaLabel="choose folder" tip="Open a seedr checkout" accentColor="violet" size="md" onClick={onChoose} />
          <span className="text-sm text-neutral-500">choose folder</span>
        </span>
      </div>
    </main>
  );
}
