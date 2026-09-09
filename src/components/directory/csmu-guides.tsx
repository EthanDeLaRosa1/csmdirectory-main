import { useEffect, useState } from "react";
import { GraduationCap, ExternalLink, Search, Copy, Check, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin-store";

interface CsmuGuide {
  id: string;
  title: string;
  category: string;
  description: string;
  url: string;
  last_updated?: string;
}

const DEFAULT_GUIDES: CsmuGuide[] = [
  {
    id: "1",
    title: "Proactive CSM Strategy with ChurnZero",
    category: "CSM Process",
    description: "Session on leveraging ChurnZero to shift from reactive firefighting to a proactive Customer Success Management strategy.",
    url: "https://drive.google.com/file/d/1_EpsgZH-KbG3zp3CPAekkBvr_nJ0-O8L/view",
    last_updated: "Aug 2026",
  },
  {
    id: "2",
    title: "Copado Robotic Testing (CRT) Deep Dive",
    category: "Product Enablement",
    description: "Video session featuring a Senior Sales Engineer exploring key themes, features, and demonstration points in CRT.",
    url: "https://drive.google.com/file/d/1a3FqZgMkGkqnOphu9W3fLUuL550hF_q7/view?t=12.375",
    last_updated: "Aug 2026",
  },
  {
    id: "3",
    title: "Managing Customer Accounts, Cases & Resources",
    category: "CSM Process",
    description: "Walkthrough of managing customer accounts, case routing, and internal resources within the Copado environment.",
    url: "https://drive.google.com/file/d/1e4eUshBaYHApsiau7fbp7RLgzj8fBhC0/view?t=0.555",
    last_updated: "Aug 2026",
  },
  {
    id: "4",
    title: "Git Branching, Merge Conflicts & Salesforce Environments",
    category: "Product Enablement",
    description: "Overview of Git branching, merge conflicts, and navigating complex Salesforce environment management with Copado tools.",
    url: "https://drive.google.com/file/d/1jpFEeDuoW0sWHQ3o4u3lmRTo7MiF4Le5/view",
    last_updated: "Aug 2026",
  },
  {
    id: "5",
    title: "Copado Troubleshooting & CSM Triage Best Practices",
    category: "Best Practices",
    description: "Best practices for effective issue triage, building client self-sufficiency, and identifying recurring customer training needs.",
    url: "https://drive.google.com/file/d/1LeDxZnU61DUO2B_eynfO0jB_HIY0-xs7/view",
    last_updated: "Aug 2026",
  },
  {
    id: "6",
    title: "Conducting Effective EBRs & QBRs at Copado",
    category: "Best Practices",
    description: "Comprehensive guide outlining the purpose, value, deck structure, and step-by-step execution for EBRs and QBRs.",
    url: "https://drive.google.com/file/d/1ujRCoiMnFs8LLKyJiraVbE0estn4UUWZ/view",
    last_updated: "Aug 2026",
  },
];

export function CsmuGuides() {
  const { isAdmin } = useAdmin();
  const [guides, setGuides] = useState<CsmuGuide[]>(DEFAULT_GUIDES);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("CSM Process");
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const categories = ["All", "CSM Process", "Product Enablement", "Best Practices"];

  useEffect(() => {
    fetchGuides();
  }, []);

  async function fetchGuides() {
    try {
      const { data, error } = await supabase.from("csmu_guides").select("*");
      if (!error && data && data.length > 0) {
        setGuides([...DEFAULT_GUIDES, ...(data as CsmuGuide[])]);
      }
    } catch {
      /* fallback */
    }
  }

  async function handleAddGuide(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;

    const newGuide = {
      title: newTitle.trim(),
      category: newCategory,
      description: newDesc.trim(),
      url: newUrl.trim(),
      last_updated: "Aug 2026",
    };

    const { data, error } = await supabase.from("csmu_guides").insert([newGuide]).select();
    if (!error && data && data[0]) {
      setGuides((prev) => [data[0] as CsmuGuide, ...prev]);
      setNewTitle("");
      setNewUrl("");
      setNewDesc("");
      setShowAddForm(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this CSMU recording?")) return;
    setGuides((prev) => prev.filter((g) => g.id !== id));
    await supabase.from("csmu_guides").delete().eq("id", id);
  }

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredGuides = guides.filter((guide) => {
    const matchesCategory = selectedCategory === "All" || guide.category === selectedCategory;
    const matchesSearch =
      guide.title.toLowerCase().includes(query.toLowerCase()) ||
      guide.description.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">CSM University (CSMU) Video Library</h2>
              <p className="text-xs text-muted-foreground">
                Official video training sessions, product enablement walkthroughs, and CSM playbooks.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="text-xs gap-1.5 shrink-0">
            <Plus className="size-4" /> Add Video Session
          </Button>
        </div>

        {showAddForm ? (
          <form onSubmit={handleAddGuide} className="mt-4 pt-4 border-t border-border grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1">Session Title *</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Salesforce DevOps Best Practices"
                className="text-xs h-9"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
              >
                <option value="CSM Process">CSM Process</option>
                <option value="Product Enablement">Product Enablement</option>
                <option value="Best Practices">Best Practices</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Google Drive / Video Link *</label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className="text-xs h-9"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1">Summary / Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief summary of topics covered in this recording..."
                className="text-xs min-h-[60px]"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs">
                Save Recording
              </Button>
            </div>
          </form>
        ) : null}

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search CSMU training recordings..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filteredGuides.map((guide) => (
          <div
            key={guide.id}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Badge variant="secondary" className="text-[10px]">{guide.category}</Badge>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{guide.last_updated}</span>
                  {isAdmin ? (
                    <button
                      onClick={() => handleDelete(guide.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Admin: Remove Video"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Hyperlinked Title */}
              <a
                href={guide.url}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-1.5 font-semibold text-sm hover:text-primary transition-colors mb-1"
              >
                <span>{guide.title}</span>
                <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </a>

              <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{guide.description}</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-4">
              <span className="text-[10px] text-muted-foreground">Click title to watch recording</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => handleCopy(guide.url, guide.id)}
              >
                {copiedId === guide.id ? (
                  <>
                    <Check className="size-3 text-emerald-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy Link
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}