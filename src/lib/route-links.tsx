import { ArrowRight, ExternalLink } from "lucide-react";
import { DEPARTMENTS } from "@/data/directory";
import { deptTheme } from "@/data/dept-theme";

/** Keyword → department id. Order matters: most specific first. */
const MATCHERS: [RegExp, string][] = [
  [/professional services|\bPS\b|SOW/i, "professional-services"],
  [/\bTAM\b|technical account/i, "tam"],
  [/customer support|support case|copado success community|\bsupport\b/i, "customer-support"],
  [/infrastructure|platform engineering|govcloud/i, "infrastructure"],
  [/product management|roadmap|feature request/i, "product-management"],
  [/sales|account executive|\bAE\b/i, "sales-ae"],
  [/finance|billing|invoice/i, "finance-billing"],
  [/security|infosec|compliance doc/i, "security-infosec"],
  [/legal|contracts|\bDPA\b|\bNDA\b/i, "legal-contracts"],
];

export function resolveDeptId(text: string): string | null {
  for (const [re, id] of MATCHERS) if (re.test(text)) return id;
  return null;
}

const URL_RE = /(https?:\/\/[^\s)]+)/i;

/**
 * Renders an "out of scope → go here instead" value as an interactive pill:
 * internal department references navigate in-app, external URLs open in a new tab.
 */
export function GoToPill({
  text,
  onGoTo,
}: {
  text: string;
  onGoTo?: ((deptId: string, section?: string) => void) | undefined;
}) {
  const url = text.match(URL_RE)?.[1];
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
      >
        {text.replace(url, "").trim() || url.replace(/^https?:\/\//, "")}
        <ExternalLink className="size-3" />
      </a>
    );
  }

  const deptId = resolveDeptId(text);
  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  if (!dept || !onGoTo) {
    return <span className="text-sm text-foreground/85">{text}</span>;
  }

  const theme = deptTheme(dept.id);
  return (
    <button
      type="button"
      onClick={() => onGoTo(dept.id)}
      title={`Go to ${dept.name}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-xs font-medium transition-transform hover:scale-[1.03] ${theme.badge}`}
    >
      <ArrowRight className="size-3 shrink-0" />
      <span>{text}</span>
    </button>
  );
}
