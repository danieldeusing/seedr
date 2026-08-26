import { useEffect, useState } from "react";
import { FolderOpen, LogIn, RotateCw, X } from "lucide-react";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { AGENT_LABELS, CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { pickPath } from "@/api/agent";
import { CodingAgentIcon } from "@/core/CodingAgentIcon";
import { IconButton } from "@/core/ui/IconButton";
import { AGENT_AUTH, AGENT_PROGRAMS, DRAFT_CERTIFIED, useAgentSettings, type AgentProbe, type AuthState } from "./agentSettings";
import { SignInDialog } from "./SignInDialog";

/** The probe result as one line of ink: found, missing, or the failure itself. */
function ProbeState({ probe }: { probe: AgentProbe }) {
  if (probe.state === "ok") return <span className="text-success">detected · {probe.version}</span>;
  if (probe.state === "probing") return <span className="text-muted-foreground">probing…</span>;
  if (probe.state === "missing") return <span className="text-muted-foreground">not found — set a path below to use this agent</span>;
  if (probe.state === "error") return <span className="text-destructive">{probe.detail}</span>;
  return <span className="text-muted-foreground">—</span>;
}

/** Signed in, signed out, or a CLI that cannot be asked — never guessed. */
function SignInState({ auth }: { auth: AuthState }) {
  if (auth.state === "in") return <span className="text-success">signed in{auth.account ? ` · ${auth.account}` : ""}</span>;
  if (auth.state === "out") return <span className="text-destructive">signed out</span>;
  if (auth.state === "checking") return <span className="text-muted-foreground">checking…</span>;
  return (
    <span className="text-muted-foreground" data-tip="This CLI has no command to ask, so Studio finds out when a run needs it">
      sign-in unknown
    </span>
  );
}

function AgentCard({ agent, onSignIn }: { agent: CanonicalCodingAgent; onSignIn(): void }) {
  const override = useAgentSettings((s) => s.overrides[agent]);
  const probe = useAgentSettings((s) => s.probes[agent]);
  const setOverride = useAgentSettings((s) => s.setOverride);
  const auth = useAgentSettings((s) => s.auth[agent]);
  const reprobe = useAgentSettings((s) => s.probe);
  const [error, setError] = useState<string | null>(null);

  const apply = async (path: string | null) => setError(await setOverride(agent, path));

  const choose = async () => {
    const picked = await pickPath("file");
    if (picked) await apply(picked);
  };

  return (
    <li className="space-y-2 border border-neutral-960 bg-neutral-980 p-4">
      <div className="flex items-center gap-2">
        <CodingAgentIcon agent={agent} size={16} />
        <span className="text-sm font-medium text-neutral-200">{AGENT_LABELS[agent]}</span>
        {DRAFT_CERTIFIED.includes(agent) && (
          <span className="border border-violet-500/30 px-1 text-[11px] text-violet-300" data-tip="Studio has a certified adapter for this agent — it can draft and run jobs">
            adapter
          </span>
        )}
        <span className="flex-1" />
        <IconButton
          icon={LogIn}
          ariaLabel={`sign in to ${AGENT_LABELS[agent]}`}
          tip={AGENT_AUTH[agent].login ? "Sign this CLI in — it runs the sign-in and keeps the credentials" : "This CLI has no sign-in command Studio knows"}
          accentColor={auth.state === "out" ? "violet" : "neutral"}
          onClick={onSignIn}
          disabled={probe.state === "missing" || !AGENT_AUTH[agent].login}
        />
        <IconButton icon={RotateCw} ariaLabel={`probe ${AGENT_LABELS[agent]}`} tip="Run --version again" onClick={() => void reprobe(agent)} spin={probe.state === "probing"} />
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border border-violet-500/30 px-2 py-1 text-neutral-300" data-tip={override ? "Custom path — Studio runs this binary" : "Resolved on PATH"}>
          {override ?? AGENT_PROGRAMS[agent]}
        </code>
        <IconButton icon={FolderOpen} ariaLabel={`choose ${AGENT_LABELS[agent]} binary`} tip="Point Studio at a specific binary" onClick={() => void choose()} />
        <IconButton icon={X} ariaLabel={`clear ${AGENT_LABELS[agent]} path`} tip="Back to the one on PATH" onClick={() => void apply(null)} disabled={!override} />
      </div>
      <span className="flex items-center gap-2">
        <ProbeState probe={probe} />
        <span className="text-neutral-600">·</span>
        <SignInState auth={auth} />
      </span>
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Settings → coding agents: which agent CLIs this machine has, what version
 * each answers with, and where to find one Studio cannot see on PATH. A GUI
 * launch inherits a thin PATH, so "not found" is a normal state to fix here
 * rather than a reason to give up on the agent.
 */
export function CodingAgentsPage() {
  const [signingIn, setSigningIn] = useState<CanonicalCodingAgent | null>(null);
  const probeAll = useAgentSettings((s) => s.probeAll);
  const probes = useAgentSettings((s) => s.probes);
  const busy = CANONICAL_AGENTS.some((agent) => probes[agent].state === "probing");

  useEffect(() => {
    void probeAll();
  }, [probeAll]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">coding agents</h3>
          <p className="mt-1 text-neutral-500">Studio runs these for drafts and for the jobs it hands to an agent. A path is remembered on this machine only, and is checked before it is used.</p>
        </div>
        <span className="flex-1" />
        <IconButton icon={RotateCw} ariaLabel="probe all" tip="Re-run --version for every agent" onClick={() => void probeAll()} spin={busy} />
      </header>
      <ul className="space-y-3">
        {CANONICAL_AGENTS.map((agent) => (
          <AgentCard key={agent} agent={agent} onSignIn={() => setSigningIn(agent)} />
        ))}
      </ul>
      {signingIn && <SignInDialog agent={signingIn} onClose={() => setSigningIn(null)} />}
    </div>
  );
}
