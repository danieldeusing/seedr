import { useEffect, useRef, useState } from "react";
import { Ban, CornerDownLeft } from "lucide-react";
import type { CanonicalCodingAgent } from "@seedr/shared";
import { AGENT_LABELS } from "@seedr/registry-ops/pure";
import { Modal } from "@/core/Modal";
import { IconButton } from "@/core/ui/IconButton";
import { AGENT_PROGRAMS, useAgentSettings } from "./agentSettings";
import { useSignIn } from "./signIn";

const input =
  "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Sign an agent's CLI in without leaving Studio. The CLI drives the whole thing
 * — it opens the browser, it owns the credentials — and this shows what it says
 * and passes back whatever it asks for. Studio never stores or reads any of it.
 */
export function SignInDialog({ agent, onClose }: { agent: CanonicalCodingAgent; onClose(): void }) {
  const phase = useSignIn((state) => state.phase);
  const log = useSignIn((state) => state.log);
  const error = useSignIn((state) => state.error);
  const signedIn = useSignIn((state) => state.signedIn);
  const { start, answer, cancel, reset } = useSignIn.getState();
  const probe = useAgentSettings((state) => state.probe);
  const [reply, setReply] = useState("");
  const tail = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void start(agent);
    return () => {
      void cancel();
      reset();
    };
  }, [agent, start, cancel, reset]);

  useEffect(() => {
    // A sign-in says what to do next at the end of the output, so follow it.
    if (tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [log]);

  const send = async () => {
    if (!reply.trim()) return;
    await answer(reply.trim());
    setReply("");
  };

  const close = () => {
    if (signedIn) void probe(agent);
    onClose();
  };

  return (
    <Modal title={`sign in — ${AGENT_LABELS[agent]}`} onClose={close} size="xl">
      <section className="flex h-full min-h-0 flex-col p-6 text-xs">
        <p className="prompt">{AGENT_PROGRAM_HINT(agent)}</p>
        <p className="mt-3 text-muted-foreground">
          The CLI runs the sign-in and owns the result — it opens your browser, and anything it asks for goes straight back to it. Studio neither stores nor reads what you type here.
        </p>

        <pre ref={tail} className="mt-4 min-h-0 flex-1 overflow-auto border border-border bg-muted p-3 whitespace-pre-wrap" aria-label="sign-in output" aria-live="polite">
          {log.length > 0 ? log.join("\n") : "starting…"}
        </pre>

        {signedIn && <p className="mt-3 text-success">Signed in. Close this and the agent is ready.</p>}
        {error && (
          <p className="mt-3 text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-neutral-700 pt-3">
          <input
            className={input}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={phase === "running" ? "whatever it asks for — a code, or y" : "the sign-in is not running"}
            aria-label="answer the sign-in"
            disabled={phase !== "running"}
            autoComplete="off"
          />
          <IconButton icon={CornerDownLeft} ariaLabel="send the answer" tip="Send this line to the CLI" accentColor="violet" onClick={() => void send()} disabled={phase !== "running" || !reply.trim()} />
          {phase === "running" && <IconButton icon={Ban} ariaLabel="stop the sign-in" tip="Stop it" onClick={() => void cancel()} />}
        </div>
      </section>
    </Modal>
  );
}

/** The command being run, shown so it is obvious what this dialog is doing. */
const AGENT_PROGRAM_HINT = (agent: CanonicalCodingAgent): string => `${AGENT_PROGRAMS[agent]} auth login`;
