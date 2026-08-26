import { useState } from "react";
import { LogIn } from "lucide-react";
import { AGENT_LABELS } from "@seedr/registry-ops/pure";
import { isSignedOut } from "@/api/agentJob";
import { IconButton } from "@/core/ui/IconButton";
import { useAgentSettings } from "./agentSettings";
import { SignInDialog } from "./SignInDialog";

/**
 * A failure, and — when it is the agent saying it is signed out — the way to fix
 * it right here. Sending someone to another dialog to do the one thing that
 * would unblock them is how a message becomes an obstacle.
 */
export function SignedOutNotice({ error }: { error: string }) {
  const agent = useAgentSettings((state) => state.preferred);
  const [signingIn, setSigningIn] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <p className="whitespace-pre-wrap text-destructive" role="alert">
        {error}
      </p>
      {isSignedOut(error) && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <IconButton icon={LogIn} ariaLabel={`sign in to ${AGENT_LABELS[agent]}`} tip="Sign this CLI in without leaving the dialog" accentColor="violet" onClick={() => setSigningIn(true)} />
          {AGENT_LABELS[agent]} is not signed in on this machine.
        </span>
      )}
      {signingIn && <SignInDialog agent={agent} onClose={() => setSigningIn(false)} />}
    </div>
  );
}
