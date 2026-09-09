import { useEffect, useState } from "react";
import { Link2, ExternalLink, Plus, Search, Trash2, Pencil, Check, X, Clock, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin-store";

interface LinkItem {
  id: string;
  title: string;
  category: string;
  url: string;
  description: string;
  updated_at?: string;
  updated_by?: string;
}

const CATEGORIES = [
  "Customer Support",
  "Technical Account Managers",
  "Professional Services",
  "Infrastructure & Cloud Ops",
  "Product Management",
  "Sales & AE Co-Selling",
  "Finance & Billing",
  "Security & InfoSec",
  "Legal & Contracts",
  "Enablement & Training",
  "CSM Resources",
];

function formatDate(dateStr?: string) {
  if (!dateStr) return "Aug 2026";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function LinkBank() {
  const { isAdmin } = useAdmin();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Creation form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Customer Support");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [editorName, setEditorName] = useState("");

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEditorName, setEditEditorName] = useState("");

  useEffect(() => {
    fetchLinks();
  }, []);

  async function fetchLinks() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("link_bank")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching links from Supabase:", error.message);
      } else if (data) {
        const mappedData: LinkItem[] = data.map((item: any) => ({
          id: item.id,
          title: item.title || item.name || "Untitled Link",
          category: item.category || item.department || "Customer Support",
          url: item.url || "#",
          description: item.description || "",
          updated_at: item.updated_at,
          updated_by: item.updated_by || "CS Ops",
        }));
        setLinks(mappedData);
      }
    } catch (err) {
      console.error("Fetch exception:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setSaving(true);
    const authorStr = editorName.trim() || "CSM Team Member";
    const nowIso = new Date().toISOString();

    const payload = {
      title: title.trim(),
      category,
      url: url.trim(),
      description: description.trim(),
      updated_at: nowIso,
      updated_by: authorStr,
    };

    const { data, error } = await supabase.from("link_bank").insert([payload]).select();

    if (error) {
      alert("Failed to save link to database: " + error.message);
    } else if (data && data[0]) {
      const inserted: LinkItem = {
        id: data[0].id,
        title: data[0].title || payload.title,
        category: data[0].category || payload.category,
        url: data[0].url || payload.url,
        description: data[0].description || payload.description,
        updated_at: data[0].updated_at || nowIso,
        updated_by: data[0].updated_by || authorStr,
      };
      setLinks((prev) => [inserted, ...prev]);
      setTitle("");
      setUrl("");
      setDescription("");
      setEditorName("");
      setShowAdd(false);
    }
    setSaving(false);
  }

  function startEditing(item: LinkItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditUrl(item.url);
    setEditDescription(item.description);
    setEditEditorName(item.updated_by || "");
  }

  async function handleSaveEdit(id: string) {
    const authorStr = editEditorName.trim() || "CSM Team Member";
    const nowIso = new Date().toISOString();

    const updatedPayload = {
      title: editTitle.trim(),
      category: editCategory,
      url: editUrl.trim(),
      description: editDescription.trim(),
      updated_at: nowIso,
      updated_by: authorStr,
    };

    const { error } = await supabase.from("link_bank").update(updatedPayload).eq("id", id);

    if (error) {
      alert("Failed to update link in database: " + error.message);
      return;
    }

    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updatedPayload } : l))
    );
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to permanently delete this resource link?")) return;

    const { error } = await supabase.from("link_bank").delete().eq("id", id);

    if (error) {
      alert("Failed to delete link from database: " + error.message);
      return;
    }

    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  const categories = ["All", ...Array.from(new Set(links.map((l) => l.category)))];

  const filtered = links.filter((l) => {
    const matchesCategory = selectedCategory === "All" || l.category === selectedCategory;
    const matchesQuery =
      l.title.toLowerCase().includes(query.toLowerCase()) ||
      l.description.toLowerCase().includes(query.toLowerCase()) ||
      l.category.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Link2 className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Link Bank</h2>
              <p className="text-xs text-muted-foreground">
                Single repository for official intake forms, portals, and internal resources across all teams.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowAdd(!showAdd)} size="sm" className="text-xs gap-1.5 shrink-0">
            <Plus className="size-4" /> Add New Link
          </Button>
        </div>

        {/* Add Link Form */}
        {showAdd ? (
          <form onSubmit={handleAddLink} className="mt-4 pt-4 border-t border-border grid gap-3 sm:grid-cols-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource Title *"
              className="text-xs h-9"
              required
            />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL (https://...)"
              className="text-xs h-9"
              required
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Input
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="Your Name / Team"
              className="text-xs h-9"
            />
            <div className="sm:col-span-2">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short Description of resource"
                className="text-xs h-9"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs gap-1.5" disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {saving ? "Saving..." : "Save Link"}
              </Button>
            </div>
          </form>
        ) : null}

        {/* Search & Category Filter Pills */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search link bank by keyword or team..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.slice(0, 5).map((cat) => (
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

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading resource links from database...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No resource links found. Click "+ Add New Link" to add one!
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const isEditing = editingId === item.id;

            if (isEditing) {
              return (
                <div key={item.id} className="rounded-xl border border-primary bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">Editing Link Resource</span>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className="text-xs h-8" />
                  <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" className="text-xs h-8" />
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs">
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description" className="text-xs h-8" />
                  <Input value={editEditorName} onChange={(e) => setEditEditorName(e.target.value)} placeholder="Updated By (Your Name)" className="text-xs h-8" />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" className="text-xs h-7 gap-1" onClick={() => handleSaveEdit(item.id)}>
                      <Check className="size-3" /> Save Changes
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between transition-all hover:border-primary/40"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {item.category}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => startEditing(item)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Edit Link Details">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Delete Link">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-1.5 font-semibold text-sm hover:text-primary transition-colors mb-1"
                  >
                    <span>{item.title}</span>
                    <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  </a>

                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-3 mt-3 border-t border-border/40">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {formatDate(item.updated_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="size-3" /> {item.updated_by || "CS Ops"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}