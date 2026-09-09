export type DeptTheme = {
  tag: string;
  /** solid accent bar / badge background */
  badge: string;
  /** header accent bar */
  accent: string;
  /** soft tinted surface */
  soft: string;
  /** ring/border color */
  ring: string;
  dot: string;
};

const THEMES: Record<string, DeptTheme> = {
  "customer-support": {
    tag: "#ServiceDelivery",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/30",
    accent: "from-blue-500 to-orange-400",
    soft: "bg-blue-500/5",
    ring: "border-blue-500/40",
    dot: "bg-blue-500",
  },
  tam: {
    tag: "#ServiceDelivery",
    badge: "bg-orange-500/15 text-orange-600 dark:text-orange-300 ring-1 ring-orange-500/30",
    accent: "from-orange-400 to-blue-500",
    soft: "bg-orange-500/5",
    ring: "border-orange-500/40",
    dot: "bg-orange-500",
  },
  "professional-services": {
    tag: "#RequiresSOW",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30",
    accent: "from-amber-400 to-yellow-500",
    soft: "bg-amber-500/5",
    ring: "border-amber-500/40",
    dot: "bg-amber-500",
  },
  infrastructure: {
    tag: "#InternalOnly",
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/30",
    accent: "from-rose-500 to-red-600",
    soft: "bg-rose-500/5",
    ring: "border-rose-500/40",
    dot: "bg-rose-500",
  },
  "product-management": {
    tag: "#Product",
    badge: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-500/30",
    accent: "from-indigo-500 to-purple-500",
    soft: "bg-indigo-500/5",
    ring: "border-indigo-500/40",
    dot: "bg-indigo-500",
  },
  "sales-ae": {
    tag: "#Commercial",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30",
    accent: "from-emerald-500 to-teal-400",
    soft: "bg-emerald-500/5",
    ring: "border-emerald-500/40",
    dot: "bg-emerald-500",
  },
  "finance-billing": {
    tag: "#Commercial",
    badge: "bg-teal-500/15 text-teal-600 dark:text-teal-300 ring-1 ring-teal-500/30",
    accent: "from-teal-500 to-emerald-400",
    soft: "bg-teal-500/5",
    ring: "border-teal-500/40",
    dot: "bg-teal-500",
  },
  "security-infosec": {
    tag: "#Compliance",
    badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30",
    accent: "from-cyan-500 to-sky-400",
    soft: "bg-cyan-500/5",
    ring: "border-cyan-500/40",
    dot: "bg-cyan-500",
  },
  "legal-contracts": {
    tag: "#Contracts",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-1 ring-violet-500/30",
    accent: "from-violet-500 to-fuchsia-500",
    soft: "bg-violet-500/5",
    ring: "border-violet-500/40",
    dot: "bg-violet-500",
  },
};

const FALLBACK: DeptTheme = {
  tag: "#Internal",
  badge: "bg-secondary text-secondary-foreground ring-1 ring-border",
  accent: "from-primary to-primary",
  soft: "bg-secondary/40",
  ring: "border-border",
  dot: "bg-muted-foreground",
};

export const deptTheme = (id: string): DeptTheme => THEMES[id] ?? FALLBACK;
