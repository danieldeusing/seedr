import { useState, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";

/** Duration to show "Copied!" feedback before resetting */
const COPY_FEEDBACK_DURATION_MS = 2000;

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      // Blocked on an insecure origin or by permission. Saying nothing let the
      // visitor paste whatever was on the clipboard before.
      console.error("copy failed", error);
      setFailed(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setFailed(false), COPY_FEEDBACK_DURATION_MS);
      return;
    }
    setFailed(false);
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={failed ? "Copy failed" : "Copy"}
          onClick={handleCopy}
          className={failed ? "text-destructive" : undefined}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}
