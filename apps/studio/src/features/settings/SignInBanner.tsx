import { useState } from "react";
import { LogIn, TriangleAlert } from "lucide-react";
import { AGENT_LABELS } from "@seedr/registry-ops/pure";
import { IconButton } from "@/core/ui/IconButton";
import { useAgentSettings } from "./agentSettings";
import { SignInDialog } from "./SignInDialog";

/**
 * The workspace's own notice that the agent it would run is signed out. Every
 * agent job fails the same way without this, and the failure arrives at the end
 * of a form someone has already filled in — better to say so before they start.
 */
export function SignInBanner() {
  const agent = useAgentSettings((state) => state.preferred);
  const auth = useAgentSettings((state) => state.auth[agent]);
  const [signingIn, setSigningIn] = useState(false);

  if (auth.state !== "out") return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-300" role="status">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{AGENT_LABELS[agent]} is signed out — drafting and agent jobs will fail until it is signed in.</span>
      <IconButton icon={LogIn} ariaLabel={`sign in to ${AGENT_LABELS[agent]}`} tip="Sign in now" accentColor="amber" size="xs" onClick={() => setSigningIn(true)} />
      {signingIn && <SignInDialog agent={agent} onClose={() => setSigningIn(false)} />}
    </div>
  );
}
