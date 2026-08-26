import { useState } from "react";
import { LogIn, TriangleAlert } from "lucide-react";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { AGENT_LABELS, CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { CodingAgentIcon } from "@/core/CodingAgentIcon";
import { IconButton } from "@/core/ui/IconButton";
import { useAgentSettings } from "./agentSettings";
import { SignInDialog } from "./SignInDialog";

/**
 * Two severities, carried by the background rather than by the text: the
 * surfaces are the theme's own panel colour with the status hue mixed into it
 * (`--surface-alert`/`--surface-warn` in styles/index.css), so the band fits
 * whichever theme is selected and the words stay in the ordinary foreground.
 *
 * Which severity applies is a real difference — the chosen agent being signed
 * out breaks the next thing anyone does, while another agent being signed out
 * is something to know before picking it.
 */
const SEVERITY = {
  alert: { box: "border-[var(--surface-alert-edge)] bg-[var(--surface-alert)]" },
  warn: { box: "border-[var(--surface-warn-edge)] bg-[var(--surface-warn)]" },
};

/**
 * The workspace's own notice that an agent CLI is signed out. Every job given
 * to one fails the same way without this, and the failure arrives at the end of
 * a form someone has already filled in — better to say so before they start.
 *
 * One row per agent, each with the sign-in that fixes it: a single sentence
 * naming several agents cannot offer a way to fix any of them. It reports every
 * signed-out agent rather than only the chosen one, since the choice changes per
 * dialog. Agents whose CLI cannot be asked stay out of it — `unknown` is not a
 * claim.
 */
export function SignInBanner() {
  const preferred = useAgentSettings((state) => state.preferred);
  const auth = useAgentSettings((state) => state.auth);
  const [signingIn, setSigningIn] = useState<CanonicalCodingAgent | null>(null);

  const signedOut = CANONICAL_AGENTS.filter((agent) => auth[agent].state === "out");
  if (signedOut.length === 0) return null;

  // The panel wears the worst severity it holds.
  const blocked = signedOut.includes(preferred);
  const severity = blocked ? SEVERITY.alert : SEVERITY.warn;

  return (
    <div role="alert" className={`m-4 mb-0 shrink-0 border text-xs text-neutral-200 ${severity.box}`}>
      <p className="flex items-center gap-2 border-b border-neutral-500/25 px-3 py-2 font-medium">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {signedOut.length === 1 ? "A coding agent is signed out" : `${signedOut.length} coding agents are signed out`}
      </p>
      <ul>
        {signedOut.map((agent) => (
          <li key={agent} className="flex items-center gap-2 px-3 py-1.5">
            <CodingAgentIcon agent={agent} />
            <span className="min-w-0 flex-1 truncate">
              {AGENT_LABELS[agent]}
              {agent === preferred && <span className="text-neutral-400"> — the chosen agent, so drafting and jobs fail until it is signed in</span>}
            </span>
            <IconButton
              icon={LogIn}
              ariaLabel={`sign in to ${AGENT_LABELS[agent]}`}
              tip={`Sign in to ${AGENT_LABELS[agent]}`}
              accentColor="neutral"
              size="xs"
              onClick={() => setSigningIn(agent)}
            />
          </li>
        ))}
      </ul>
      {signingIn && <SignInDialog agent={signingIn} onClose={() => setSigningIn(null)} />}
    </div>
  );
}
