import React, { useEffect, useRef, useState } from "react";
import { Search, ArrowRight, HelpCircle } from "lucide-react";

interface Department {
  id: string;
  name: string;
  short: string;
  description?: string;
  tags?: string[];
}

interface NotSureAssistantProps {
  departments: Department[];
  onGoTo: (deptId: string, section?: string) => void;
}

export function NotSureAssistant({ departments, onGoTo }: NotSureAssistantProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const PROMPTS = [
    "Persistent Jira sync issue",
    "Need SOC 2 report",
    "Who handles SOW scoping?",
    "Sandbox setup help",
    "Invoice dispute",
    "Refunds for a customer",
    "Sandbox provisioning delays",
    "Request DPA / data processing agreement",
    "Performance degradation in production",
  ];

  useEffect(() => {
    // keep inputRef in sync for focus behavior
  }, []);

  const matches = query.trim()
    ? departments.filter((d) => {
        const q = query.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.short.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q)) ||
          (d.tags && d.tags.some((t) => t.toLowerCase().includes(q)))
        );
      })
    : [];

  const promptMatches = query.trim()
    ? PROMPTS.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    : PROMPTS;

  const handleSuggestion = (text: string) => {
    // populate input and attempt to route to best matching department
    setQuery(text);
    const q = text.toLowerCase();
    const deptMatches = departments.filter((d) =>
      d.name.toLowerCase().includes(q) || d.short.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q))
    );
    if (deptMatches.length > 0) {
      const first = deptMatches[0];
      if (first) onGoTo(first.id);
    }
  };

  return (
    <div className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Not sure where to go?</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Type what you're trying to do (e.g., "refunds", "sandbox access", "contract review") to find the right department.
      </p>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search topics, actions, or departments..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className="w-full bg-muted/40 border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {query.trim() && (
        <div className="pt-2 space-y-2">
          {matches.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No matching departments found for "{query}".</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {matches.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onGoTo(d.id)}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-primary/10 hover:border-primary/40 text-left transition-all group"
                >
                  <div>
                    <span className="text-xs font-semibold text-foreground block">{d.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{d.short}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}