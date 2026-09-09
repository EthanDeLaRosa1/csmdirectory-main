import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${label ?? value}`}
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Copied", { description: value });
          setTimeout(() => setCopied(false), 1400);
        } catch {
          toast.error("Copy failed — select and copy manually");
        }
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}

/** Detect values worth offering a one-click copy for (emails, slack channels, links). */
export function isCopyable(value: string) {
  return /@|^#|https?:\/\/|\.com|\bslack\b/i.test(value) && !/\[CONFIRM/i.test(value);
}
