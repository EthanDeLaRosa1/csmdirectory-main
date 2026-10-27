import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Building2,
  Calendar,
  X,
  Download,
  FileText,
  Phone,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  Clock,
  Layers,
  XCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  Mail,
  ExternalLink,
  Users,
  Box,
  Cpu,
  ShieldCheck,
  GitBranch,
  Workflow,
  Database,
  ChevronDown,
  ChevronUp,
} from "lucide-react";


import fileSaver from "file-saver";
const { saveAs } = (fileSaver as any) || { saveAs: undefined };
import { supabase } from "@/lib/supabase";
import { collectBriefcase, normalizeAccountName, extractDomainFromQuery } from "@/lib/paz/api";

const SAMPLE_ACCOUNTS = [
  "Brenntag North America",
  "Amtrak",
  "Travelers",
  "Wizards of the Coast, Inc",
  "The Nebraska Medical Center",
];

const getChronoTimestamp = (value: unknown): number => {
  if (!value) return 0;
  const parsed = new Date(String(value));
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const sortCasesNewestFirst = (cases: any[] = []) =>
  [...cases].sort((a: any, b: any) => {
    const aTime = getChronoTimestamp(a?.CreatedDate || a?.date_opened || a?.created_at || a?.createdDate);
    const bTime = getChronoTimestamp(b?.CreatedDate || b?.date_opened || b?.created_at || b?.createdDate);
    return bTime - aTime;
  });

const sortGongTranscriptsNewestFirst = (transcripts: any[] = []) =>
  [...transcripts].sort((a: any, b: any) => {
    const aTime = getChronoTimestamp(a?.startedAt || a?.startedTimestamp || a?.started || a?.date);
    const bTime = getChronoTimestamp(b?.startedAt || b?.startedTimestamp || b?.started || b?.date);
    return bTime - aTime;
  });

const safeCacheSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    const quotaExceeded =
      error?.name === "QuotaExceededError" ||
      error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(String(error?.message || ""));

    if (!quotaExceeded) {
      console.warn("Briefcase cache unavailable; skipping local cache write.", error);
      return false;
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const existingKey = localStorage.key(i);
      if (existingKey && existingKey.startsWith("csm_briefcase_cache_")) {
        localStorage.removeItem(existingKey);
      }
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (retryError: any) {
      console.warn("Briefcase cache quota exceeded after clearing old entries; skipping write.", retryError);
      return false;
    }
  }
};

export const GongItTab = () => {
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [isCachedResult, setIsCachedResult] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [daysBack, setDaysBack] = useState<number>(180);

  const [showFootprintCard, setShowFootprintCard] = useState<boolean>(true);
  const [showEbstaCard, setShowEbstaCard] = useState<boolean>(true);
  const [showContactsCard, setShowContactsCard] = useState<boolean>(true);
  const [showCasesCard, setShowCasesCard] = useState<boolean>(true);
  const [showGongCard, setShowGongCard] = useState<boolean>(true);
  const [showPrompts, setShowPrompts] = useState<boolean>(true);

  const searchIdRef = useRef<number>(0);
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("csm_briefcase_cache_") || key === "csm_gong_search_error")) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCancelSearch = () => {
    searchIdRef.current += 1;
    activeTimersRef.current.forEach(clearTimeout);
    activeTimersRef.current = [];

    setLoading(false);
    setProgressStage(0);
    setProgressText("");
    setErrorMsg("Query cancelled.");
  };

  const executeSearch = async (targetAccount: string, forceFresh = false) => {
    const trimmed = targetAccount.trim();
    if (!trimmed) return;

    const cacheKey = `csm_briefcase_cache_${trimmed.toLowerCase()}`;
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }

    setIsCachedResult(false);
    searchIdRef.current += 1;
    const thisSearchId = searchIdRef.current;

    activeTimersRef.current.forEach(clearTimeout);
    activeTimersRef.current = [];

    setErrorMsg(null);
    setHasError(false);
    setLoading(true);
    setResult(null);
    setProgressStage(1);
    setProgressText("Resolving Salesforce Account & EBSTA metrics...");

    const timer1 = setTimeout(() => {
      if (searchIdRef.current === thisSearchId) {
        setProgressStage(2);
        setProgressText("Querying Gong call transcripts by Account ID...");
      }
    }, 1200);

    const timer2 = setTimeout(() => {
      if (searchIdRef.current === thisSearchId) {
        setProgressStage(3);
        setProgressText("Aggregating Product Footprint & Briefcase payload...");
      }
    }, 2400);

    activeTimersRef.current.push(timer1, timer2);

    try {
      const searchTerm = trimmed;
      let data: any = null;
      try {
        data = await collectBriefcase(searchTerm, daysBack);
      } catch (invokeErr) {
        console.warn("collectBriefcase failed, falling back to direct invoke:", invokeErr);
        const domain = extractDomainFromQuery(searchTerm);
        const normalized = normalizeAccountName(searchTerm);
        const res = await supabase.functions.invoke("gong-it", {
          body: { accountName: normalized || searchTerm, daysBack, domain },
        });
        data = (res as any).data || res;
      }

      if (searchIdRef.current !== thisSearchId) return;

      const directError = Boolean(data?.error);
      setHasError(directError);
      if (directError) {
        console.error("Invocation Error:", data?.error);
        setErrorMsg("Notice: Unable to pull live Salesforce cases. Check function logs.");
        setResult(null);
        return;
      }

      const sfCases = sortCasesNewestFirst(data?.salesforceCases || data?.cases || []);
      const gongCalls = sortGongTranscriptsNewestFirst(data?.transcripts || data?.gongData || []);
      const ebsta = data?.ebstaData || null;

      setCases(sfCases);
      setTranscripts(gongCalls);

      const uniqueCasesMap = new Map();
      sfCases.forEach((c: any) => {
        if (c.case_number && !uniqueCasesMap.has(c.case_number)) {
          uniqueCasesMap.set(c.case_number, c);
        }
      });

      if (ebsta?.contacts) {
        const uniqueContactsMap = new Map();
        ebsta.contacts.forEach((c: any) => {
          const key = c.name?.toLowerCase().trim();
          if (key && !uniqueContactsMap.has(key)) {
            uniqueContactsMap.set(key, c);
          }
        });
        ebsta.contacts = Array.from(uniqueContactsMap.values());
      }

      const finalPayload = {
        ...data,
        accountName: data.accountName || trimmed,
        cases: sortCasesNewestFirst(Array.from(uniqueCasesMap.values())),
        salesforceCases: sfCases,
        contacts: data.contacts || [],
        transcripts: gongCalls,
        ebstaData: ebsta,
        productFootprint: data?.productFootprint || null,
      };

      setResult(finalPayload);
      setErrorMsg(null);
      setHasError(false);
      safeCacheSet(cacheKey, JSON.stringify(finalPayload));
    } catch (err: any) {
      if (searchIdRef.current !== thisSearchId) return;
      console.error("Invocation Error:", err);
      setErrorMsg("Notice: Unable to pull live Salesforce cases. Check function logs.");
      setHasError(true);
      setResult(null);
    } finally {
      if (searchIdRef.current === thisSearchId) {
        setLoading(false);
        setProgressStage(0);
        setProgressText("");
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(accountName);
  };

  const handleChipClick = (account: string) => {
    setAccountName(account);
    executeSearch(account);
  };

  const copyPromptToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptIndex(index);
    setTimeout(() => setCopiedPromptIndex(null), 2000);
  };

  const detectVersions = () => {
    if (!result || !result.transcripts) return { deployer: "25.12", connect: "4.8" };
    const text = JSON.stringify(result.transcripts);
    const deployerMatch = text.match(/(?:deployer|version|v)\s*(\d{2}\.\d+)/i);
    const connectMatch = text.match(/(?:connect)\s*(\d+\.\d+)/i);
    return {
      deployer: deployerMatch ? deployerMatch[1] : "25.12",
      connect: connectMatch ? connectMatch[1] : "4.8",
    };
  };

  const versions = detectVersions();

  const downloadJsonArtifact = (filename: string, payload: any) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    saveAs(blob, filename);
  };

  const downloadEbstaArtifact = () => {
    if (!result?.ebstaData) return;
    const payload = {
      accountName: result.accountName || accountName,
      ebsta: result.ebstaData,
      exportedAt: new Date().toISOString(),
    };
    const safeName = (result.accountName || accountName || "account")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "account";
    downloadJsonArtifact(`${safeName}-ebsta.json`, payload);
  };

  const downloadCasesArtifact = () => {
    if (!result?.cases) return;
    const payload = {
      accountName: result.accountName || accountName,
      cases: result.cases,
      exportedAt: new Date().toISOString(),
    };
    const safeName = (result.accountName || accountName || "account")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "account";
    downloadJsonArtifact(`${safeName}-support-cases.json`, payload);
  };

  const buildGongMarkdownLocally = (name: string, callTranscripts: any[]) => {
    let md = `# Gong Call Transcripts: ${name}\n\n*${callTranscripts.length} call(s) matched · exported ${new Date().toLocaleDateString()}*\n\n`;
    sortGongTranscriptsNewestFirst(callTranscripts).forEach((t: any) => {
      md += `## ${t.title || "Untitled Gong Call"}\n\n`;
      md += `- **Date:** ${t.started ? new Date(t.started).toLocaleString() : "N/A"}\n- **Call ID:** ${t.callId}\n`;
      if (t.url) md += `- **Gong Link:** ${t.url}\n`;
      if (t.parties?.length) {
        md += `- **Attendees:** ${t.parties.map((p: any) => p.name || p.emailAddress || p.email).filter(Boolean).join(", ")}\n`;
      }
      md += `\n### Transcript\n\n`;
      (t.transcript || []).forEach((m: any) => {
        const text = (m.sentences || []).map((s: any) => s.text).join(" ").trim();
        if (text) md += `**${m.speakerName || m.speakerId || "Speaker"}:** ${text}\n\n`;
      });
      md += `---\n\n`;
    });
    return md;
  };

  const downloadGongArtifact = () => {
    if (!result?.transcripts) return;
    const name = result.accountName || accountName || "account";
    const md: string = result.gongMarkdown || buildGongMarkdownLocally(name, result.transcripts);
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "account";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${safeName}-gong-transcripts.md`);
  };

  const downloadSingleMarkdownArtifact = () => {
    if (!result) return;
    const ebstaScore = result.ebstaData?.ebstaRecord?.Ebsta_Score__c ?? result.ebstaData?.score ?? "N/A";

    let md = `# WALT'S VAULT BRIEFCASE: ${result.accountName.toUpperCase()}\n`;
    md += `*Generated on: ${new Date().toLocaleDateString()} | CSM Enterprise Briefcase Engine*\n`;
    md += `*EBSTA Engagement Score:* ${ebstaScore}/100\n`;
    md += `*Detected Versions:* Copado Deployer v${versions.deployer} | Copado Connect v${versions.connect}\n\n---\n\n`;

    md += `## 1. WALT'S NOTEBOOK LM PROMPTS\n\n`;
    md += `**Prompt 1 (Initial Source Analysis):**\n> "Referencing all uploaded sources on ${result.accountName}, summarize their budgeting, hiring, company initiatives, and DevOps team structure."\n\n`;
    md += `**Prompt 2 (Strategic Priorities & Gong Sentiment):**\n> "Referencing recent transcripts, emails, and support cases, generate what are ${result.accountName}'s strategic initiatives and priorities."\n\n`;
    md += `**Prompt 3 (Copado AI Plan Input):**\n> "I have uploaded an artifact from NotebookLM that gives a comprehensive overview of ${result.accountName} (EBSTA Score ${ebstaScore}/100, running Copado Deployer v${versions.deployer}) and their goals, strengths, and pain points. Build a plan to address their problems that we can present to them."\n\n---\n\n`;

    if (result.productFootprint) {
      const fp = result.productFootprint;
      md += `## 2. PRODUCT FOOTPRINT & LICENSES\n\n`;
      md += `### CICD Information\n- **Edition:** ${fp.cicd?.edition || "Copado 1"}\n- **Admin Seats:** ${fp.cicd?.adminSeats ?? "N/A"}\n- **User Seats:** ${fp.cicd?.userSeats ?? "N/A"}\n- **Success Plan:** ${fp.cicd?.successPlan || "Copado Success"}\n\n`;
      md += `### Add-on Products\n- **Data Deployer:** ${fp.addons?.dataDeployer || "Active"}\n- **Compliance Hub:** ${fp.addons?.complianceHub || "Active"}\n- **Value Stream Maps (VSM):** ${fp.addons?.vsm || "Active"}\n- **Copado Version Control (CVC):** ${fp.addons?.cvc || "Active"}\n\n`;
      md += `### Copado Robotic Testing (CRT)\n- **CRT User Seats:** ${fp.crt?.userSeats ?? "N/A"}\n- **CRT Edition:** ${fp.crt?.edition || "Copado 1 Bundle"}\n\n`;
      md += `### AI Platform\n- **Status:** ${fp.aiPlatform?.status || "Active"}\n\n------------------------------------------------------------\n\n`;
    }

    if (result.ebstaData) {
      md += `## 3. EBSTA RELATIONSHIP INTELLIGENCE\n- **Overall Account Score:** ${ebstaScore}/100\n\n`;
      if (result.ebstaData.contacts?.length) {
        md += `### Top Engaged Stakeholders\n`;
        result.ebstaData.contacts.forEach((c: any) => {
          md += `- **${c.name}** (${c.title}): Score ${c.score}/100\n`;
        });
        md += `\n`;
      }
      if (result.ebstaData.opportunities?.length) {
        md += `### Opportunity Pipeline Health\n`;
        result.ebstaData.opportunities.forEach((o: any) => {
          md += `- **${o.name}** (Stage: ${o.stage}): Deal Score ${o.score}/100\n`;
        });
        md += `\n`;
      }
      if (result.ebstaData.emails?.length) {
        md += `### EBSTA Email Repository (${result.ebstaData.emails.length} Emails)\n\n`;
        result.ebstaData.emails.forEach((e: any) => {
          md += `#### ${e.subject}\n- **Date:** ${e.date ? new Date(e.date).toLocaleString() : "N/A"}\n- **From:** ${e.from}\n- **To:** ${e.to}\n- **Body:**\n${e.body}\n\n------------------------------------------------------------\n\n`;
        });
      }
    }

    md += `## 4. KEY CONTACTS DIRECTORY (${result.contacts?.length || 0} Contacts)\n\n`;
    if (!result.contacts?.length) {
      md += `*No key contacts recorded for this account.*\n\n`;
    } else {
      md += `| Contact Name | Title | Email | Copado Role | Key Contact | CSM Key Contact | Last Activity |\n| :--- | :--- | :--- | :--- | :---: | :---: | :---: |\n`;
      result.contacts.forEach((c: any) => {
        const emailLink = c.email !== "N/A" ? `[${c.email}](mailto:${c.email})` : "N/A";
        md += `| ${c.name} | ${c.title} | ${emailLink} | ${c.copadoRole} | ${c.isKeyContact ? "Yes" : "No"} | ${c.isCsmKeyContact ? "Yes" : "No"} | ${c.lastActivity} |\n`;
      });
      md += `\n------------------------------------------------------------\n\n`;
    }

    md += `## 5. SUPPORT CASES REPORT (${result.cases.length} Unique Cases)\n\n`;
    if (result.cases.length === 0) {
      md += `*No active support cases recorded for this account.*\n\n`;
    } else {
      result.cases.forEach((c: any) => {
        const desc = c.description && c.description !== "null" ? c.description.trim() : "No description provided.";
        const email = c.contact_email && c.contact_email !== "null" ? c.contact_email : "N/A";
        md += `### Case ${c.case_number}: ${c.subject}\n- **Status:** ${c.status || "N/A"}\n- **Owner:** ${c.case_owner || "N/A"}\n- **Date Opened:** ${c.date_opened || "N/A"}\n- **Contact Email:** ${email}\n- **Description:**\n${desc}\n\n------------------------------------------------------------\n\n`;
      });
    }

    md += `---\n\n## 6. GONG CALL TRANSCRIPTS (${result.transcripts?.length || 0} Calls Matched)\n\n`;
    if (!result.transcripts?.length) {
      md += `*No recent Gong call transcripts matched this account.*\n\n`;
    } else {
      result.transcripts.forEach((t: any) => {
        md += `### ${t.title || "Untitled Gong Call"} (${t.started ? new Date(t.started).toLocaleDateString() : "N/A"})\n\n`;
        md += `*Call ID: ${t.callId}${t.url ? ` · ${t.url}` : ""}*\n\n`;
        (t.transcript || []).forEach((m: any) => {
          const sentences = (m.sentences || []).map((s: any) => s.text).join(" ");
          md += `**[${m.speakerName || m.speakerId || "Speaker"}]**: ${sentences}\n\n`;
        });
        md += `============================================================\n\n`;
      });
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `Briefcase_${result.accountName.replace(/\s+/g, "_")}.md`);
  };

  const getStatusBadgeColor = (status: string) => {
    const lower = (status || "").toLowerCase();
    if (lower.includes("resolved") || lower.includes("closed"))
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";
    if (lower.includes("progress") || lower.includes("open"))
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800";
    return "bg-muted text-muted-foreground border-border";
  };

  const getEbstaScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800";
    if (score >= 50) return "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800";
    return "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800";
  };

  const prompts = [
    `Referencing all uploaded sources on ${accountName || "Customer"}, summarize their budgeting, hiring, company initiatives, and DevOps team structure.`,
    `Referencing recent transcripts, emails, and support cases, generate what are ${accountName || "Customer"}'s strategic initiatives and priorities.`,
    `I have uploaded an artifact from NotebookLM that gives a comprehensive overview of ${accountName || "Customer"} (Running Copado Deployer v${versions.deployer}) and their goals, strengths, and pain points. Build a plan to address their problems that we can present to them.`,
  ];

  const extractedEbstaScore =
    result?.ebstaData?.score ?? result?.ebstaData?.ebstaRecord?.Ebsta_Score__c;

  const displayCases = sortCasesNewestFirst(result?.cases || cases || []);
  const displayTranscripts = sortGongTranscriptsNewestFirst(result?.transcripts || transcripts || []);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-5 space-y-4">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground tracking-tight">Account Intelligence Console</h1>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-sm bg-muted text-muted-foreground border border-border">
              Enterprise v2
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time synchronization across Salesforce Cases, Product Footprint, EBSTA Intelligence, and Gong.
          </p>
        </div>

        {/* Quick account switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium mr-1">Presets:</span>
          {SAMPLE_ACCOUNTS.map((acc) => (
            <button
              key={acc}
              onClick={() => handleChipClick(acc)}
              disabled={loading}
              className="text-[11px] bg-muted/80 hover:bg-accent text-foreground border border-border rounded-sm px-2 py-1 transition-colors disabled:opacity-50 font-medium"
            >
              {acc}
            </button>
          ))}
        </div>
      </div>

            {/* 2. Enterprise Command Center Search Bar */}
      <div className="bg-card/90 border border-border rounded-md shadow-sm transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <form onSubmit={handleFormSubmit} className="p-1.5 flex flex-col md:flex-row items-stretch md:items-center gap-1.5">
          {/* Unified Input Container */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-background/60 rounded-sm border border-border/50 focus-within:border-primary/50 focus-within:bg-background transition-colors">
            <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 select-none">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">
                Account
              </span>
              <span className="text-border hidden sm:inline">|</span>
            </div>

            <input
              type="text"
              placeholder="Search account name, domain, or customer..."
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={loading}
              className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/60 placeholder:font-normal focus:outline-none"
            />

            {accountName && !loading && (
              <button
                type="button"
                onClick={() => setAccountName("")}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="hidden lg:flex items-center gap-1 shrink-0 select-none pl-1 border-l border-border/60">
              <kbd className="text-[10px] font-mono text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded-xs border border-border">
                ↵ Enter
              </kbd>
            </div>
          </div>

          {/* Integrated Date Range Pill */}
          <div className="flex items-center gap-1.5 bg-background/60 border border-border/50 rounded-sm px-2.5 py-2 shrink-0 focus-within:border-primary/50 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={String(daysBack)}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              disabled={loading}
              className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer pr-1"
              title="Date range filter"
            >
              <option value="90">Past 90 Days</option>
              <option value="180">Past 180 Days (Default)</option>
              <option value="365">Past 1 Year</option>
              <option value="730">Past 2 Years</option>
              <option value="1095">Past 3 Years</option>
              <option value="1460">Past 4 Years</option>
            </select>
          </div>

          {/* Action Button */}
          {loading ? (
            <button
              type="button"
              onClick={handleCancelSearch}
              className="h-10 px-4 rounded-sm border border-destructive/40 bg-destructive/10 text-destructive text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-destructive/20 transition-colors shrink-0"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!accountName.trim()}
              className="h-10 px-5 rounded-sm bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:pointer-events-none shrink-0"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Run Intelligence</span>
            </button>
          )}
        </form>

        {/* Integrated Loading Bar */}
        {loading && (
          <div className="px-3.5 py-2 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="font-medium text-foreground">{progressText}</span>
            </div>
            <span className="font-mono text-[11px]">Phase {progressStage}/3</span>
          </div>
        )}
      </div>


      {errorMsg && !result && hasError && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-sm p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3. Output Dashboard */}
      {result && (
        <div className="space-y-4">
          {/* Top KPI Metric Strip */}
          <div className="bg-card border border-border rounded-sm p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-base font-bold text-foreground">{result.accountName}</h2>
                  {isCachedResult && (
                    <button
                      onClick={() => executeSearch(result.accountName, true)}
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 bg-muted px-2 py-0.5 rounded-sm border border-border"
                      title="Force fresh query"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> Cached
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Sync completed: {new Date().toLocaleTimeString()} · Date Range: {daysBack} days
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadSingleMarkdownArtifact}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-4 py-2 rounded-sm flex items-center gap-2 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export NotebookLM Artifact (.md)</span>
                </button>
              </div>
            </div>

            {/* Datadog-style KPI Stat Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-3">
              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">EBSTA Score</span>
                <span className={`text-lg font-bold font-mono mt-0.5 inline-block ${extractedEbstaScore != null ? getEbstaScoreColor(extractedEbstaScore).split(" ")[0] : "text-muted-foreground"}`}>
                  {extractedEbstaScore != null ? `${extractedEbstaScore}/100` : "N/A"}
                </span>
              </div>

              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">CICD Edition</span>
                <span className="text-sm font-bold font-mono text-foreground mt-1 truncate block">
                  {result.productFootprint?.cicd?.edition || "Copado 1"}
                </span>
              </div>

              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Key Contacts</span>
                <span className="text-lg font-bold font-mono text-foreground mt-0.5 block">
                  {result.contacts?.length || 0}
                </span>
              </div>

              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Support Cases</span>
                <span className="text-lg font-bold font-mono text-foreground mt-0.5 block">
                  {result.cases?.length || 0}
                </span>
              </div>

              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Gong Calls</span>
                <span className="text-lg font-bold font-mono text-foreground mt-0.5 block">
                  {result.transcripts?.length || 0}
                </span>
              </div>

              <div className="bg-muted/40 border border-border p-2.5 rounded-sm">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Deployer Ver</span>
                <span className="text-sm font-bold font-mono text-foreground mt-1 block">
                  v{versions.deployer}
                </span>
              </div>
            </div>
          </div>

          {/* Analysis Prompts Utility Drawer */}
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <button
              onClick={() => setShowPrompts((p) => !p)}
              className="w-full px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span>Executive NotebookLM Prompts</span>
              </div>
              {showPrompts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showPrompts && (
              <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                {prompts.map((p, idx) => (
                  <div key={idx} className="bg-muted/20 border border-border p-2.5 rounded-sm flex flex-col justify-between gap-2">
                    <p className="text-xs text-foreground font-mono leading-relaxed line-clamp-3">"{p}"</p>
                    <button
                      onClick={() => copyPromptToClipboard(p, idx)}
                      className="self-start text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {copiedPromptIndex === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPromptIndex === idx ? "Copied" : "Copy Prompt"}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Footprint Matrix */}
          {result?.productFootprint && (
            <div className="bg-card border border-border rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Product Footprint & Licensing</h3>
                </div>
                <button
                  onClick={() => setShowFootprintCard((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                >
                  {showFootprintCard ? "Collapse" : "Expand"}
                </button>
              </div>

              {showFootprintCard && (
                <div className="p-4 space-y-4">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-muted/20 border border-border p-2.5 rounded-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Admin Seats</span>
                      <p className="text-base font-bold font-mono text-foreground mt-0.5">
                        {result.productFootprint.cicd?.adminSeats ?? 0}
                      </p>
                    </div>
                    <div className="bg-muted/20 border border-border p-2.5 rounded-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">User Seats</span>
                      <p className="text-base font-bold font-mono text-foreground mt-0.5">
                        {result.productFootprint.cicd?.userSeats ?? 0}
                      </p>
                    </div>
                    <div className="bg-muted/20 border border-border p-2.5 rounded-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">CRT User Seats</span>
                      <p className="text-base font-bold font-mono text-foreground mt-0.5">
                        {result.productFootprint.crt?.userSeats ?? 0}
                      </p>
                    </div>
                    <div className="bg-muted/20 border border-border p-2.5 rounded-sm">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Success Plan</span>
                      <p className="text-xs font-semibold text-foreground mt-1 truncate">
                        {result.productFootprint.cicd?.successPlan || "Copado Success"}
                      </p>
                    </div>
                  </div>

                  {/* Add-on Product Spec Matrix */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block mb-2">
                      Add-on Modules Status
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {[
                        { name: "Data Deployer", icon: Database, status: result.productFootprint.addons?.dataDeployer },
                        { name: "Compliance Hub", icon: ShieldCheck, status: result.productFootprint.addons?.complianceHub },
                        { name: "Value Stream Maps (VSM)", icon: Workflow, status: result.productFootprint.addons?.vsm },
                        { name: "Copado Version Control", icon: GitBranch, status: result.productFootprint.addons?.cvc },
                      ].map((addon, idx) => {
                        const Icon = addon.icon;
                        const isActive = addon.status === "Active";
                        return (
                          <div key={idx} className="bg-background border border-border p-2.5 rounded-sm flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-foreground">{addon.name}</span>
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs border ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                                : "bg-muted text-muted-foreground border-border"
                            }`}>
                              {addon.status || "Inactive"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Key Contacts Table */}
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Key Contacts Directory ({result.contacts?.length || 0})
                </h3>
              </div>
              <button
                onClick={() => setShowContactsCard((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
              >
                {showContactsCard ? "Collapse" : "Expand"}
              </button>
            </div>

            {showContactsCard && (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Name / Title</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Copado Role</th>
                      <th className="px-3 py-2">Flag</th>
                      <th className="px-3 py-2">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {(!result.contacts || result.contacts.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground italic font-sans">
                          No key contacts recorded for this account.
                        </td>
                      </tr>
                    ) : (
                      result.contacts.map((c: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 font-sans">
                            <span className="font-semibold text-foreground block">{c.name}</span>
                            <span className="text-[10px] text-muted-foreground block truncate max-w-xs">{c.title}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {c.email !== "N/A" ? (
                              <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                                {c.email}
                              </a>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.copadoRole || "—"}</td>
                          <td className="px-3 py-2">
                            {c.isCsmKeyContact ? (
                              <span className="text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 rounded-xs">
                                CSM Key
                              </span>
                            ) : c.isKeyContact ? (
                              <span className="text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-1.5 py-0.5 rounded-xs">
                                Key
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{c.lastActivity || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* EBSTA Relationship Intelligence */}
          {result?.ebstaData && (
            <div className="bg-card border border-border rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    EBSTA Relationship Intelligence
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadEbstaArtifact}
                    className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> JSON
                  </button>
                  <button
                    onClick={() => setShowEbstaCard((v) => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium ml-2"
                  >
                    {showEbstaCard ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {showEbstaCard && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block mb-2">
                      Top Engaged Stakeholders ({result.ebstaData.contacts?.length || 0})
                    </span>
                    <div className="border border-border rounded-sm max-h-56 overflow-y-auto divide-y divide-border">
                      {(!result.ebstaData.contacts?.length) ? (
                        <p className="p-3 text-xs text-muted-foreground italic">No contact engagement scores logged.</p>
                      ) : (
                        result.ebstaData.contacts.map((c: any, i: number) => (
                          <div key={i} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/20">
                            <div>
                              <p className="font-semibold text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.title}</p>
                            </div>
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-xs border ${getEbstaScoreColor(c.score)}`}>
                              {c.score}/100
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block mb-2">
                      Opportunity Pipeline Health ({result.ebstaData.opportunities?.length || 0})
                    </span>
                    <div className="border border-border rounded-sm max-h-56 overflow-y-auto divide-y divide-border">
                      {(!result.ebstaData.opportunities?.length) ? (
                        <p className="p-3 text-xs text-muted-foreground italic">No opportunity scores logged.</p>
                      ) : (
                        result.ebstaData.opportunities.map((o: any, i: number) => (
                          <div key={i} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/20">
                            <div className="truncate mr-2">
                              <p className="font-semibold text-foreground truncate">{o.name}</p>
                              <p className="text-[10px] text-muted-foreground">Stage: {o.stage}</p>
                            </div>
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-xs border shrink-0 ${getEbstaScoreColor(o.score)}`}>
                              {o.score}/100
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Split Log Panels: Support Cases vs Gong Transcripts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Support Cases */}
            <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Support Cases ({result.cases?.length || 0})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadCasesArtifact}
                    className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> JSON
                  </button>
                  <button
                    onClick={() => setShowCasesCard((v) => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium ml-2"
                  >
                    {showCasesCard ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {showCasesCard && (
                <div className="p-3 max-h-96 overflow-y-auto space-y-2">
                  {!result.cases?.length ? (
                    <p className="text-xs text-muted-foreground italic p-2">No support cases found for this account.</p>
                  ) : (
                    result.cases.map((c: any) => (
                      <div key={c.case_number} className="bg-muted/20 border border-border p-2.5 rounded-sm space-y-1 hover:border-primary/40 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-primary">{c.case_number}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs border ${getStatusBadgeColor(c.status)}`}>
                            {c.status || "N/A"}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-foreground">{c.subject}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {c.description && c.description !== "null" ? c.description : "No description provided."}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border font-mono">
                          <span>Owner: {c.case_owner || "N/A"}</span>
                          <span>Opened: {c.date_opened}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Right: Gong Transcripts */}
            <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Gong Transcripts ({result.transcripts?.length || 0})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadGongArtifact}
                    className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> MD
                  </button>
                  <button
                    onClick={() => setShowGongCard((v) => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium ml-2"
                  >
                    {showGongCard ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {showGongCard && (
                <div className="p-3 max-h-96 overflow-y-auto space-y-2">
                  {!displayTranscripts?.length ? (
                    <p className="text-xs text-muted-foreground italic p-2">No Gong transcripts found for this account.</p>
                  ) : (
                    displayTranscripts.map((t: any) => (
                      <div key={t.callId || t.id || `${t.title}-${t.started}`} className="bg-muted/20 border border-border p-2.5 rounded-sm space-y-1.5 hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-foreground line-clamp-1">
                            {t.title || t.callName || "Untitled Gong Call"}
                          </h4>
                          {t.url && (
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0"
                            >
                              <span>Open Call</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" /> {t.started || t.startedAt || "N/A"}
                          </span>
                          <span className="opacity-70">ID: {t.callId || t.id}</span>
                        </div>

                        <div className="bg-background/80 p-2 rounded-xs border border-border text-[11px] font-mono text-foreground line-clamp-3 leading-relaxed">
                          {(t.transcript || []).map((m: any) => (m.sentences || []).map((s: any) => s.text).join(" ")).join(" ") || "No excerpt recorded."}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
