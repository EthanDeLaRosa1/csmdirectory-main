import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { GLOSSARY_SHEET_URL } from "@/data/directory";
import {
  GLOSSARY_CATEGORIES,
  today,
  useGlossary,
  type GlossaryCategory,
} from "@/lib/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_STYLE: Record<GlossaryCategory, string> = {
  Acronym: "bg-blue-500/15 text-blue-600 dark:text-blue-300 ring-1 ring-blue-500/30",
  "Copado Product": "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-500/30",
  Competitor: "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/30",
  Process: "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30",
  "Salesforce / Ecosystem": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30",
};

const termSchema = z.object({
  term: z.string().trim().min(1, "Enter the term or acronym").max(80),
  definition: z.string().trim().min(4, "Add a short definition").max(600),
  by: z.string().trim().min(2, "Add your name").max(80),
});

export function GlossaryFinder() {
  const { terms, addTerm, removeTerm } = useGlossary();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | GlossaryCategory>("all");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return terms
      .filter(
        (t) =>
          (cat === "all" || t.category === cat) &&
          (!q || `${t.term} ${t.definition} ${t.category}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [terms, query, cat]);

  return (
    <section className="space-y-5 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BookOpen className="size-5 text-primary" /> Glossary &amp; Acronym Finder
          </h2>
          <p className="text-sm text-muted-foreground">
            Searchable dictionary of Copado acronyms, internal terminology, and competitors.
          </p>
        </div>
        <AddTermDialog open={open} onOpenChange={setOpen} onAdd={addTerm} />
      </header>

      <a
        href={GLOSSARY_SHEET_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm transition-colors hover:bg-primary/10"
      >
        <Badge className="bg-primary text-primary-foreground text-[10px]">Pinned</Badge>
        <span className="font-medium">Acronyms, Terminology &amp; Competitors — master Google Sheet</span>
        <ExternalLink className="size-3.5 text-primary" />
      </a>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a term, acronym or competitor…"
            className="pl-9"
            aria-label="Search glossary"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...GLOSSARY_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c as "all" | GlossaryCategory)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              cat === c
                ? "bg-primary text-primary-foreground"
                : c === "all"
                  ? "bg-secondary text-secondary-foreground hover:bg-accent"
                  : CATEGORY_STYLE[c as GlossaryCategory]
            }`}
          >
            {c === "all" ? "All categories" : c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} className="group border-border/70">
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold tracking-tight">{t.term}</p>
                <button
                  type="button"
                  aria-label={`Remove ${t.term}`}
                  onClick={() => {
                    removeTerm(t.id);
                    toast("Term removed");
                  }}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <Badge className={`text-[10px] ${CATEGORY_STYLE[t.category]}`}>{t.category}</Badge>
              <p className="text-sm text-muted-foreground">{t.definition}</p>
              <p className="text-[11px] text-muted-foreground/70">
                {t.by} · {t.date}
              </p>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            No terms match — add it with “Add New Term”.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AddTermDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (t: {
    term: string;
    definition: string;
    category: GlossaryCategory;
    by: string;
    date: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    term: "",
    definition: "",
    category: "Acronym" as GlossaryCategory,
    by: "",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add New Term
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a term to the glossary</DialogTitle>
          <DialogDescription>Shared with every CSM using this directory.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-term">Term / acronym</Label>
            <Input
              id="g-term"
              maxLength={80}
              value={form.term}
              onChange={(e) => setForm((s) => ({ ...s, term: e.target.value }))}
              placeholder="MSA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-cat">Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((s) => ({ ...s, category: v as GlossaryCategory }))}
            >
              <SelectTrigger id="g-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLOSSARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-def">Definition</Label>
            <Textarea
              id="g-def"
              maxLength={600}
              value={form.definition}
              onChange={(e) => setForm((s) => ({ ...s, definition: e.target.value }))}
              placeholder="What it means and when a CSM would hear it"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-by">Submitted by</Label>
              <Input
                id="g-by"
                maxLength={80}
                value={form.by}
                onChange={(e) => setForm((s) => ({ ...s, by: e.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-date">Date</Label>
              <Input id="g-date" value={today()} readOnly className="text-muted-foreground" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              const parsed = termSchema.safeParse(form);
              if (!parsed.success) {
                toast.error(parsed.error.issues[0]!.message);
                return;
              }
              onAdd({ ...parsed.data, category: form.category, date: today() });
              setForm({ term: "", definition: "", category: form.category, by: form.by });
              onOpenChange(false);
              toast.success("Term added to the glossary");
            }}
          >
            Save term
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
