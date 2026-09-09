import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CircleDot,
  Clock,
  Lock,
  Mail,
  Pencil,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { Department } from "@/data/directory";
import { CASE_STATUSES, SLA_MATRIX, hasPlaceholder } from "@/data/directory";
import { deptTheme } from "@/data/dept-theme";
import { useDirectoryStore } from "@/lib/directory-store";
import { useAdmin } from "@/lib/admin-store";
import { CopyButton, isCopyable } from "@/components/directory/copy-button";
import { EditDepartmentDialog } from "@/components/directory/edit-department-dialog";
import { TriggerAccordion } from "@/components/directory/trigger-accordion";
import { QuickLinks } from "@/components/directory/quick-links";
import { GoToPill } from "@/lib/route-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function PlaceholderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-foreground ring-1 ring-warning/50">
      <AlertTriangle className="size-3" />
      {children}
    </span>
  );
}

export function MaybePlaceholder({ text }: { text: string }) {
  const { isAdmin } = useAdmin();
  if (hasPlaceholder(text)) return isAdmin ? <PlaceholderPill>{text}</PlaceholderPill> : <span>{text}</span>;
  return <span>{text}</span>;
}

function SectionTitle({
  children,
  hint,
  action,
}: {
  children: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-3">
      <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {children}
      </h2>
      {hint ? <span className="text-xs text-muted-foreground/70">{hint}</span> : null}
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}

function EscalationStepper({ dept }: { dept: Department }) {
  const theme = deptTheme(dept.id);
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {dept.escalation.map((step, i) => (
        <li key={step.level} className="relative">
          <span
            className={`absolute -left-[31px] flex size-5 items-center justify-center rounded-full ${theme.dot} text-[10px] font-bold text-white ring-4 ring-background`}
          >
            {i + 1}
          </span>
          <Card className="border-border/70 bg-surface">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                  {step.level}
                </Badge>
                <CardTitle className="text-base">
                  <MaybePlaceholder text={step.who} />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  When to escalate
                </p>
                <p className="mt-1 text-foreground/90">{step.when}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  CDR duty
                </p>
                <p className="mt-1 text-foreground/90">{step.cdr}</p>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

export function DepartmentView({
  dept,
  placeholdersOnly,
  pulseSection,
  onGoTo,
}: {
  dept: Department;
  placeholdersOnly: boolean;
  pulseSection?: string | null;
  onGoTo?: (deptId: string, section?: string) => void;
}) {
  const { verificationOf, unverifiedItems } = useDirectoryStore();
  const { requireAdmin, isAdmin } = useAdmin();
  const [editOpen, setEditOpen] = useState(false);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const unverified = unverifiedItems(dept);
  const verification = verificationOf(dept);
  const theme = deptTheme(dept.id);

  const hasSla = (() => {
    const explicit = (dept as any).sla;
    if (explicit && String(explicit).trim() && String(explicit).trim().toLowerCase() !== "n/a") return true;
    if (
      dept.contacts.some(
        (c) =>
          /sla|turnaround|turnaround sla|response target|priority/i.test(c.label + " " + (c.value ?? "")) &&
          c.value &&
          String(c.value).trim() &&
          String(c.value).trim().toLowerCase() !== "n/a"
      )
    )
      return true;
    return false;
  })();

  const openEdit = (label?: string) =>
    requireAdmin(() => {
      setFocusLabel(label ?? null);
      setEditOpen(true);
    });

  const pulse = (id: string) =>
    pulseSection === id ? "rounded-xl ring-2 ring-primary/60 animate-pulse-glow" : "";

  const header = (
    <Header
      dept={dept}
      unverifiedCount={unverified.length}
      verifiedOn={verification}
      onEdit={() => openEdit()}
    />
  );

  if (placeholdersOnly) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="border-warning/40 bg-warning-soft/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" />
              Unverified placeholders ({unverified.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unverified.length ? (
              unverified.map((p) =>
                isAdmin ? (
                  <button key={p} onClick={() => openEdit(p.split(":")[0])}>
                    <PlaceholderPill>{p}</PlaceholderPill>
                  </button>
                ) : (
                  <span key={p}>{p}</span>
                )
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                No unverified placeholders in this department.
              </p>
            )}
          </CardContent>
        </Card>
        <EditDepartmentDialog
          dept={dept}
          open={editOpen}
          onOpenChange={setEditOpen}
          focusLabel={focusLabel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {header}
      {/* WHAT IS CALL-OUT */}
      {dept.whatIs ? (
        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">What is {dept.short}?</p>
              <p className="mt-1 text-sm text-foreground/90">{dept.whatIs}</p>
            </div>
            <div className="text-xs text-muted-foreground">{dept.updated}</div>
          </div>
        </div>
      ) : null}
      {dept.criticalRule ? (
        <div
          className={`rounded-xl border p-5 ${
            dept.internalOnly
              ? "border-destructive/50 bg-danger-soft/50"
              : "border-warning/50 bg-warning-soft/40"
          }`}
        >
          <div className="flex gap-3">
            <ShieldAlert
              className={`mt-0.5 size-5 shrink-0 ${dept.internalOnly ? "text-destructive" : "text-warning"}`}
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Critical rule before anything else
              </p>
              <p className="mt-1 font-semibold text-foreground">{dept.criticalRule.title}</p>
              <p className="mt-1.5 text-sm text-foreground/80">{dept.criticalRule.body}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* WHEN TO USE THIS TEAM */}
      <section id="sec-triggers" className={`scroll-mt-28 ${pulse("sec-triggers")}`}>
        <SectionTitle hint="Expand a scenario for edge cases and examples">
          When to use this team
        </SectionTitle>
        <Card className="border-success/40">
          <CardContent className="pt-5">
            {dept.triggersIntro ? (
              <p className="mb-2 text-sm text-muted-foreground">{dept.triggersIntro}</p>
            ) : null}
            <TriggerAccordion dept={dept} />
          </CardContent>
        </Card>
      </section>

      {dept.outOfScope && dept.outOfScope.length > 0 ? (
        <section id="sec-scope" className={`scroll-mt-28 ${pulse("sec-scope")}`}>
          <SectionTitle hint="Route these elsewhere">Out of scope</SectionTitle>
          <Card className="border-destructive/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle className="size-4" /> Go here instead
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer need</TableHead>
                    <TableHead>Go here instead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dept.outOfScope.map((row) => (
                    <TableRow key={row.need}>
                      <TableCell className="align-top text-sm">
                        <span className="flex items-start gap-2.5">
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive ring-1 ring-destructive/25">
                            <XCircle className="size-3" />
                            Not us
                          </span>
                          <span>{row.need}</span>
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-sm font-medium">
                        <GoToPill text={row.goTo} onGoTo={onGoTo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="sec-intake" className={`scroll-mt-28 ${pulse("sec-intake")}`}>
          <SectionTitle>Intake</SectionTitle>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{dept.intake.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dept.intake.bullets ? (
                <ul className="space-y-2 text-sm">
                  {dept.intake.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className={`mt-2 size-1.5 shrink-0 rounded-full ${theme.dot}`} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {dept.intake.steps ? (
                <ol className="space-y-2 text-sm">
                  {dept.intake.steps.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-secondary text-[11px] font-semibold text-secondary-foreground">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div id="sec-contacts" className={`scroll-mt-28 ${pulse("sec-contacts")}`}>
          <SectionTitle
            action={
              <Button size="sm" variant="outline" onClick={() => openEdit()}>
                {isAdmin ? <Pencil className="size-3.5" /> : <Lock className="size-3.5" />} Edit
              </Button>
            }
          >
            Contact
          </SectionTitle>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4 text-muted-foreground" />
                Contact details
                {dept.internalOnly ? (
                  <Badge variant="destructive" className="ml-1 text-[10px]">
                    Internal only
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border text-sm">
                {dept.contacts.map((c) => (
                  <div
                    key={c.label}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className="flex items-center gap-2 text-right font-medium">
                      <MaybePlaceholder text={c.value} />
                      {isCopyable(c.value) ? (
                        <CopyButton value={c.value} label={c.label} />
                      ) : null}
                      <button
                        onClick={() => openEdit(c.label)}
                        aria-label={`Edit ${c.label}`}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Quick links & key resources */}
      <section id="sec-links" className={`mt-4 scroll-mt-28 ${pulse("sec-links")}`}>
        <QuickLinks dept={dept} />
      </section>

      {dept.id === "customer-support" && hasSla ? (
        <>
          <section id="sec-sla" className={`scroll-mt-28 ${pulse("sec-sla")}`}>
            <SectionTitle hint="Response targets by contract tier">Priority & SLA matrix</SectionTitle>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead className="min-w-[240px]">Description</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Success+</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SLA_MATRIX.map((row) => (
                    <TableRow key={row.priority} className="hover:bg-accent/50">
                      <TableCell className="font-semibold">
                        <Badge
                          variant={row.priority.startsWith("P1") || row.priority.startsWith("P2") ? "destructive" : "secondary"}
                        >
                          {row.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.description}</TableCell>
                      <TableCell className="font-mono text-sm">{row.success}</TableCell>
                      <TableCell className="font-mono text-sm">{row.successPlus}</TableCell>
                      <TableCell className="font-mono text-sm">{row.signature}</TableCell>
                      <TableCell className="text-sm">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.coverage.startsWith("24/7")
                              ? "bg-success-soft text-success"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          <CircleDot className="size-3" />
                          {row.coverage}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>

          <section>
            <SectionTitle>Case status definitions</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CASE_STATUSES.map((s) => (
                <div key={s.status} className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-semibold">{s.status}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.meaning}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section id="sec-escalation" className={`scroll-mt-28 ${pulse("sec-escalation")}`}>
        <SectionTitle hint="Level 1 → Level 2 → Level 3">Escalation path</SectionTitle>
        <EscalationStepper dept={dept} />
      </section>

      {isAdmin ? (
        <section>
          <SectionTitle
            action={
              <Button size="sm" variant="outline" onClick={() => openEdit()}>
                {isAdmin ? <Pencil className="size-3.5" /> : <Lock className="size-3.5" />} Update
                placeholders
              </Button>
            }
          >
            Verification tracker
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {unverified.length ? (
              unverified.map((p) =>
                isAdmin ? (
                  <button key={p} onClick={() => openEdit(p.split(":")[0])}>
                    <PlaceholderPill>{p}</PlaceholderPill>
                  </button>
                ) : (
                  <span key={p} className="text-sm text-muted-foreground">
                    {p}
                  </span>
                )
              )
            ) : (
              <p className="text-sm text-muted-foreground">All entries verified.</p>
            )}
          </div>
        </section>
      ) : null}

      <Separator />
      <p className="pb-10 text-xs text-muted-foreground">
        Last updated {dept.updated} · Entry owner <MaybePlaceholder text={dept.owner} />
      </p>

      <EditDepartmentDialog
        dept={dept}
        open={editOpen}
        onOpenChange={setEditOpen}
        focusLabel={focusLabel}
      />
    </div>
  );
}

function Header({
  dept,
  unverifiedCount,
  verifiedOn,
  onEdit,
}: {
  dept: Department;
  unverifiedCount: number;
  verifiedOn: { date: string; by: string } | null;
  onEdit: () => void;
}) {
  const theme = deptTheme(dept.id);
  const { isAdmin } = useAdmin();
  return (
    <div>
      <div className={`mb-4 h-1.5 w-full rounded-full bg-gradient-to-r ${theme.accent}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px]">
          {String(dept.num).padStart(2, "0")}
        </Badge>
        <Badge className={`${theme.badge} text-[10px]`}>{theme.tag}</Badge>
        {dept.internalOnly ? (
          <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
            Internal only
          </Badge>
        ) : null}
        {verifiedOn ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-medium text-success ring-1 ring-success/30">
            <BadgeCheck className="size-3" /> Verified {verifiedOn.date} · {verifiedOn.by}
          </span>
        ) : isAdmin && unverifiedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-medium text-warning-foreground ring-1 ring-warning/40">
            <Clock className="size-3" /> {unverifiedCount} pending verification
          </span>
        ) : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit details
        </Button>
      </div>
        <h1 className="mt-3 text-xl font-bold tracking-tight">{dept.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {dept.updated} · Entry owner <MaybePlaceholder text={dept.owner} />
      </p>
    </div>
  );
}