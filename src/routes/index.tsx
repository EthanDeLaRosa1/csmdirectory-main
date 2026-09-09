import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CsmuGuides } from "@/components/directory/csmu-guides";
import { GongItTab } from "@/components/directory/gong-it";
import { PazPortalTab } from "@/components/directory/paz-portal";
import {
  Banknote,
  Compass,
  FileSignature,
  LifeBuoy,
  Lightbulb,
  BookOpen,
  Link2,
  MessageSquarePlus,
  LayoutGrid,
  Server,
  ShieldCheck,
  TrendingUp,
  UserCog,
  GraduationCap,
  Zap,
  Star,
  MessageSquareCode,
  Sparkles,
  Settings,
  X,
  Palette,
  Sliders,
  Database,
} from "lucide-react";
import { LayoutDashboard } from "lucide-react";

import { DepartmentView } from "@/components/directory/department-view";
import { FeedbackBoard } from "@/components/directory/feedback-board";
import { LinkBank } from "@/components/directory/link-bank";
import { GlossaryFinder } from "@/components/directory/glossary-finder";

import { AdminPinDialog, AdminToggle } from "@/components/directory/admin-controls";
import { AdminProvider } from "@/lib/admin-store";
import { NotSureAssistant } from "@/components/directory/not-sure-assistant";
import { ThemeToggle } from "@/components/directory/theme-toggle";
import { ColorThemePicker } from "@/components/directory/color-theme-picker";
import { SlackIntakeModal } from "@/components/directory/slack-intake-dialog";
import { DirectoryStoreProvider, useDirectoryStore } from "@/lib/directory-store";
import { Button } from "@/components/ui/button";

function CacheIndicator() {
  const [bytes, setBytes] = useState<number>(0);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    try {
      let total = 0;
      let c = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("csm_briefcase_cache_")) {
          c++;
          const v = localStorage.getItem(k) || "";
          total += new Blob([v]).size;
        }
      }
      setBytes(total);
      setCount(c);
    } catch {
      setBytes(0);
      setCount(0);
    }
  }, []);

  const kb = (bytes / 1024).toFixed(1);
  return (
    <div className="text-sm text-muted-foreground">
      <div>Items: {count}</div>
      <div>Estimated: {kb} KB</div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DirectoryRoute,
});

const ICONS: Record<string, typeof LifeBuoy> = {
  "customer-support": LifeBuoy,
  tam: UserCog,
  "professional-services": Compass,
  infrastructure: Server,
  "product-management": Lightbulb,
  "sales-ae": TrendingUp,
  "finance-billing": Banknote,
  "security-infosec": ShieldCheck,
  "legal-contracts": FileSignature,
};

function DirectoryRoute() {
  return (
    <AdminProvider>
      <DirectoryStoreProvider>
        <DirectoryPage />
        <AdminPinDialog />
      </DirectoryStoreProvider>
    </AdminProvider>
  );
}

type ViewId = "directory" | "gongit" | "servicenow" | "links" | "csmu" | "glossary" | "feedback";

function DirectoryPage() {
  const { departments } = useDirectoryStore();

  const [view, setView] = useState<ViewId>("directory");
  const [activeId, setActiveId] = useState<string>(departments[0]!.id);
  const [pulseSection, setPulseSection] = useState<string | null>(null);
  const [starredDepts, setStarredDepts] = useState<string[]>([]);
  const [slackModalOpen, setSlackModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Note: always render the assistant/search area — removed collapse feature per UX feedback
  // Settings: defaults and preferences
  const [defaultView, setDefaultView] = useState<ViewId>(() => {
    try {
      const v = localStorage.getItem("csm_default_view");
      return (v as ViewId) || "directory";
    } catch {
      return "directory";
    }
  });
  const [primaryRegion, setPrimaryRegion] = useState<string>(() => {
    try {
      return localStorage.getItem("csm_user_region") || "AMER";
    } catch {
      return "AMER";
    }
  });
  const [layoutDensity, setLayoutDensity] = useState<string>(() => {
    try {
      return localStorage.getItem("csm_layout_density") || "comfortable";
    } catch {
      return "comfortable";
    }
  });
  const [autoExpandTriggers, setAutoExpandTriggers] = useState<boolean>(() => {
    try {
      return localStorage.getItem("csm_auto_expand_triggers") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const savedView = localStorage.getItem("csm_directory_active_view");
      if (savedView && ["directory", "gongit", "servicenow", "links", "csmu", "glossary", "feedback"].includes(savedView)) {
        setView(savedView as ViewId);
      }
      const savedDept = localStorage.getItem("csm_directory_active_dept");
      if (savedDept && departments.some((d) => d.id === savedDept)) {
        setActiveId(savedDept);
      }
      const savedStarred = localStorage.getItem("csm_starred_departments");
      if (savedStarred) setStarredDepts(JSON.parse(savedStarred));
    } catch {
      /* ignore storage errors */
    }
  }, [departments]);

  const handleTabChange = (newView: ViewId) => {
    setView(newView);
    try {
      localStorage.setItem("csm_directory_active_view", newView);
    } catch {
      /* ignore */
    }
  };

  // Sync default view preference
  useEffect(() => {
    try {
      localStorage.setItem("csm_default_view", defaultView);
    } catch {
      /* ignore */
    }
  }, [defaultView]);

  useEffect(() => {
    try {
      localStorage.setItem("csm_user_region", primaryRegion);
    } catch {
      /* ignore */
    }
  }, [primaryRegion]);

  useEffect(() => {
    try {
      localStorage.setItem("csm_layout_density", layoutDensity);
    } catch {
      /* ignore */
    }
  }, [layoutDensity]);

  // Apply density immediately to the document root so CSS compact rules take effect
  useEffect(() => {
    try {
      if (layoutDensity === "compact") document.documentElement.setAttribute("data-density", "compact");
      else document.documentElement.removeAttribute("data-density");
    } catch {
      /* ignore */
    }
  }, [layoutDensity]);

  useEffect(() => {
    try {
      localStorage.setItem("csm_auto_expand_triggers", autoExpandTriggers ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [autoExpandTriggers]);

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = starredDepts.includes(id)
      ? starredDepts.filter((d) => d !== id)
      : [...starredDepts, id];
    setStarredDepts(next);
    localStorage.setItem("csm_starred_departments", JSON.stringify(next));
  };

  const goTo = useCallback((deptId: string, section?: string) => {
    setActiveId(deptId);
    setView("directory");
    try {
      localStorage.setItem("csm_directory_active_dept", deptId);
      localStorage.setItem("csm_directory_active_view", "directory");
    } catch {
      /* ignore */
    }
    setPulseSection(section ?? null);
    requestAnimationFrame(() => {
      const el = section ? document.getElementById(section) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
    if (section) window.setTimeout(() => setPulseSection(null), 2600);
  }, []);

  const active = departments.find((d) => d.id === activeId) ?? departments[0]!;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* ⚡ SINGLE INTEGRATED STICKY HEADER ⚡ */}
          <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm transition-all">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          
          {/* 1. Left: Brand Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
              <Zap className="size-3.5 fill-current" />
            </span>
            
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap">
                Copado CS Command Center
              </span>
            </div>
          </div>

          {/* 2. Middle: Main Navigation Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {(
              [
                ["directory", "Department Directory", LayoutGrid],
                ["gongit", "Gong It", Sparkles],
                ["servicenow", "PAZ Portal", LayoutDashboard],
                ["links", "Link Bank", Link2],
                ["csmu", "CSMU Guides", GraduationCap],
                ["glossary", "Glossary & Acronym Finder", BookOpen],
                ["feedback", "CSM Feedback & Wishlist", MessageSquarePlus],
              ] as [ViewId, string, typeof LifeBuoy][]
            ).map(([id, label, TabIcon]) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                  view === id
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <TabIcon className="size-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* 3. Right: Quick Actions & Settings */}
          <div className="flex items-center gap-2 shrink-0">
            {view === "directory" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSlackModalOpen(true)}
                className="text-xs gap-1.5 h-8 px-2.5 hidden sm:inline-flex"
              >
                <MessageSquareCode className="size-3.5 text-sky-500" /> Slack Intake
              </Button>
            )}

            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:bg-accent transition-all text-xs font-medium"
              title="Open Preferences & Settings"
            >
              <Settings className="size-3.5" />
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 sm:px-6 pt-4">
        {/* Sidebar Department Navigation */}
        <nav className="sticky top-18 hidden h-[calc(100vh-80px)] w-56 shrink-0 overflow-y-auto py-2 lg:block pr-2">
          {starredDepts.length > 0 ? (
            <div className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                <Star className="size-3 fill-amber-500" /> Pinned Favorites
              </p>
              <ul className="space-y-1">
                {starredDepts.map((id) => {
                  const d = departments.find((item) => item.id === id);
                  if (!d) return null;
                  const Icon = ICONS[d.id]!;
                  return (
                    <li key={`starred-${d.id}`}>
                      <button
                        onClick={() => goTo(d.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          d.id === activeId && view === "directory"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="flex-1 truncate text-left">{d.short}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="my-3 border-b border-border/60" />
            </div>
          ) : null}

          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Departments
          </p>
          <ul className="space-y-1">
            {departments.map((d) => {
              const Icon = ICONS[d.id]!;
              const isActive = d.id === activeId && view === "directory";
              const isStarred = starredDepts.includes(d.id);
              return (
                <li key={d.id}>
                  <button
                    onClick={() => goTo(d.id)}
                    className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      isActive
                        ? "bg-secondary font-semibold text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="flex-1 truncate">{d.short}</span>
                    <button
                      onClick={(e) => toggleStar(d.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-amber-500"
                      title={isStarred ? "Unpin Favorite" : "Pin to Favorites"}
                    >
                      <Star className={`size-3 ${isStarred ? "fill-amber-500 text-amber-500 opacity-100" : ""}`} />
                    </button>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Active Tab View Workspace */}
        <main className="min-w-0 flex-1 pb-8">
          <div className={view === "gongit" ? "block" : "hidden"}>
            <GongItTab />
          </div>
          <div className={view === "servicenow" ? "block" : "hidden"}>
            <PazPortalTab />
          </div>
          <div className={view === "links" ? "block" : "hidden"}>
            <LinkBank />
          </div>
          <div className={view === "csmu" ? "block" : "hidden"}>
            <CsmuGuides />
          </div>
          <div className={view === "glossary" ? "block" : "hidden"}>
            <GlossaryFinder />
          </div>
          <div className={view === "feedback" ? "block" : "hidden"}>
            <FeedbackBoard />
          </div>
          {view === "directory" && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Overview</h3>
                <p className="text-xs text-muted-foreground">Quick search & assistant</p>
                <div className="rounded-md border border-border/50 bg-card/60 p-4">
                  <NotSureAssistant departments={departments} onGoTo={goTo} />
                </div>
              </div>

              <DepartmentView dept={active} placeholdersOnly={false} pulseSection={pulseSection} onGoTo={goTo} />
            </div>
          )}
        </main>
      </div>

      {/* Settings Drawer Overlay */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card border-l border-border h-full p-6 space-y-6 shadow-2xl flex flex-col">
            <div className="space-y-6 overflow-y-auto" style={{ maxHeight: '100%' }}>
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <Settings className="size-4 text-primary" />
                  <h3 className="font-bold text-sm text-foreground">Command Settings</h3>
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Color Accent
                  </label>
                  <ColorThemePicker />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Appearance Mode
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <span className="text-xs font-medium">Dark / Light Mode</span>
                    <ThemeToggle />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Admin Mode
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <span className="text-xs font-medium font-mono text-muted-foreground">PIN Auth</span>
                    <AdminToggle />
                  </div>
                </div>
                {/* Defaults Section */}
                <div className="pt-3 border-t border-border/50 space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <Sliders className="size-4" />
                    <span>Defaults</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Default Landing View</label>
                    <select
                      value={defaultView}
                      onChange={(e) => setDefaultView(e.target.value as ViewId)}
                      className="w-full rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm"
                    >
                      <option value="directory">Department Directory</option>
                      <option value="gongit">Gong It</option>
                      <option value="servicenow">PAZ Portal</option>
                      <option value="links">Link Bank</option>
                      <option value="csmu">CSMU Guides</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Primary Region</label>
                    <select
                      value={primaryRegion}
                      onChange={(e) => setPrimaryRegion(e.target.value)}
                      className="w-full rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm"
                    >
                      <option value="AMER">AMER</option>
                      <option value="EMEA">EMEA</option>
                      <option value="APAC">APAC</option>
                    </select>
                  </div>
                </div>

                {/* Appearance & Density */}
                <div className="pt-3 border-t border-border/50 space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <Palette className="size-4" />
                    <span>Appearance</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Layout Density</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLayoutDensity("comfortable")}
                        className={`px-3 py-1 rounded-md text-sm ${layoutDensity === "comfortable" ? "bg-primary text-primary-foreground" : "border border-border/50 bg-card/40 text-muted-foreground"}`}
                      >
                        Comfortable
                      </button>
                      <button
                        onClick={() => setLayoutDensity("compact")}
                        className={`px-3 py-1 rounded-md text-sm ${layoutDensity === "compact" ? "bg-primary text-primary-foreground" : "border border-border/50 bg-card/40 text-muted-foreground"}`}
                      >
                        Compact
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Auto-expand Triggers</label>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/40">
                      <span className="text-sm">Automatically open trigger accordions</span>
                      <input
                        type="checkbox"
                        checked={autoExpandTriggers}
                        onChange={(e) => setAutoExpandTriggers(e.target.checked)}
                        aria-label="Auto expand triggers"
                      />
                    </div>
                  </div>
                </div>

                {/* Storage & Cache */}
                <div className="pt-3 border-t border-border/50 space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <Database className="size-4" />
                    <span>Storage & Security</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Briefcase Cache Memory</label>
                    <CacheIndicator />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // clear briefcase cache keys
                        try {
                          for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith("csm_briefcase_cache_")) localStorage.removeItem(k);
                          }
                        } catch {
                          /* ignore */
                        }
                        window.location.reload();
                      }}
                    >
                      Clear Local Cache
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(false)}>Close</Button>
                  </div>
                </div>
              </div>
              </div>

            <div className="text-[11px] text-muted-foreground font-mono text-center pt-4 border-t border-border">
              Copado CS Command Center v2.4
            </div>
          </div>
        </div>
      )}

      {/* Slack Escalation Snippet Modal */}
      <SlackIntakeModal
        deptName={active.name}
        isOpen={slackModalOpen}
        onClose={() => setSlackModalOpen(false)}
      />
    </div>
  );
}