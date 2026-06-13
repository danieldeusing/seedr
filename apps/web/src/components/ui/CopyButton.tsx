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
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (insecure context / permission denied) — no feedback
      return;
    }
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Copy" onClick={handleCopy}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}
