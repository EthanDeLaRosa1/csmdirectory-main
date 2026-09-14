import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Download,
  FileText,
  Phone,
  Sparkles,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Globe,
  Clock,
  Layers,
  Zap,
  XCircle,
  AlertCircle,
  Heart,
  RefreshCw,
  Activity,
  Eye,
  EyeOff,
  Mail,
  ExternalLink,
  Users,
} from "lucide-react";
import fileSaver from "file-saver";
const { saveAs } = (fileSaver as any) || { saveAs: undefined };
import { supabase } from "@/lib/supabase";
import { collectBriefcase, normalizeAccountName, extractDomainFromQuery } from "@/lib/paz/api";

const SAMPLE_ACCOUNTS = ["Brenntag", "Jeppesen", "Travelers", "Copado", "The Nebraska Medical Center"];

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
      console.warn("Briefcase cache quota exceeded after clearing old entries; skipping local cache write.", retryError);
      return false;
    }
  }
};

const ChiikawaAvatar = () => (
  <svg className="w-9 h-9 drop-shadow-sm" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="4.5" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
    <circle cx="24" cy="8" r="4.5" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
    <circle cx="16" cy="18" r="12.5" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
    <circle cx="11.5" cy="16" r="1.8" fill="#333333" />
    <circle cx="20.5" cy="16" r="1.8" fill="#333333" />
    <ellipse cx="8.5" cy="19" rx="2.5" ry="1.5" fill="#F472B6" />
    <ellipse cx="23.5" cy="19" rx="2.5" ry="1.5" fill="#F472B6" />
    <path d="M14 20.5 C15 22, 17 22, 18 20.5" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const HachiwareAvatar = () => (
  <svg className="w-9 h-9 drop-shadow-sm" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 10 L4 4 L12 7 Z" fill="#60A5FA" stroke="#333333" strokeWidth="1.5" />
    <path d="M24 10 L28 4 L12 7 Z" fill="#60A5FA" stroke="#333333" strokeWidth="1.5" />
    <circle cx="16" cy="18" r="12.5" fill="#FFFFFF" stroke="#333333" strokeWidth="1.5" />
    <path d="M7.5 12 C10 8, 22 8, 24.5 12 C20 15, 12 15, 7.5 12 Z" fill="#60A5FA" />
    <circle cx="11.5" cy="17" r="1.8" fill="#333333" />
    <circle cx="20.5" cy="17" r="1.8" fill="#333333" />
    <ellipse cx="8.5" cy="20" rx="2" ry="1.2" fill="#F472B6" />
    <ellipse cx="23.5" cy="20" rx="2" ry="1.2" fill="#F472B6" />
    <path d="M14.5 20.5 C15.5 22, 16.5 22, 17.5 20.5" stroke="#333333" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const UsagiAvatar = () => (
  <svg className="w-9 h-9 drop-shadow-sm" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="1" width="4" height="12" rx="2" fill="#FEF08A" stroke="#333333" strokeWidth="1.5" />
    <rect x="19" y="1" width="4" height="12" rx="2" fill="#FEF08A" stroke="#333333" strokeWidth="1.5" />
    <circle cx="16" cy="19" r="11.5" fill="#FEF08A" stroke="#333333" strokeWidth="1.5" />
    <circle cx="11.5" cy="17" r="1.8" fill="#333333" />
    <circle cx="20.5" cy="17" r="1.8" fill="#333333" />
    <ellipse cx="8.5" cy="20" rx="2" ry="1.2" fill="#F472B6" />
    <ellipse cx="23.5" cy="20" rx="2" ry="1.2" fill="#F472B6" />
    <ellipse cx="16" cy="21" rx="2.5" ry="2" fill="#EF4444" stroke="#333333" strokeWidth="1" />
  </svg>
);

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
  const [isChiikawaTheme, setIsChiikawaTheme] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("Jeppesen");
  const [daysBack, setDaysBack] = useState<number>(180);
  const [showEbstaCard, setShowEbstaCard] = useState<boolean>(true);
  const [showCasesCard, setShowCasesCard] = useState<boolean>(true);
  const [showGongCard, setShowGongCard] = useState<boolean>(true);

  const searchIdRef = useRef<number>(0);
  const activeTimersRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    const queries = ["The Nebraska Medical Center", "Jeppesen", "Brenntag", "Travelers", "Copado"];
    let queryIndex = 0;
    let charIndex = "The Nebraska Medical Center".length;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const current = queries[queryIndex];
      if (!current) return;

      if (!deleting && charIndex <= current.length) {
        const nextText = current.slice(0, charIndex);
        setAnimatedPlaceholder(nextText);
        charIndex += 1;

        if (charIndex > current.length) {
          deleting = true;
          timeoutId = setTimeout(tick, 1500);
          return;
        }
      }

      if (deleting) {
        const nextText = current.slice(0, Math.max(0, charIndex - 1));
        setAnimatedPlaceholder(nextText);
        charIndex -= 1;

        if (charIndex <= 0) {
          deleting = false;
          queryIndex = (queryIndex + 1) % queries.length;
          charIndex = 0;
          timeoutId = setTimeout(tick, 100);
          return;
        }
      }

      const nextDelay = deleting ? 50 : 100;
      timeoutId = setTimeout(tick, nextDelay);
    };

    timeoutId = setTimeout(tick, 100);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (
          key && (
            key.startsWith("csm_briefcase_cache_") ||
            key === "csm_gong_search_error"
          )
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore storage access issues
    }

    const checkTheme = () => {
      const active = localStorage.getItem("csm_accent_theme");
      setIsChiikawaTheme(active === "chiikawa");
    };
    checkTheme();
    window.addEventListener("storage", checkTheme);
    const interval = setInterval(checkTheme, 1000);
    return () => {
      window.removeEventListener("storage", checkTheme);
      clearInterval(interval);
    };
  }, []);

  const handleCancelSearch = () => {
    searchIdRef.current += 1;
    activeTimersRef.current.forEach(clearTimeout);
    activeTimersRef.current = [];

    setLoading(false);
    setProgressStage(0);
    setProgressText("");
    setErrorMsg("Search cancelled.");
  };

  const executeSearch = async (targetAccount: string, forceFresh = false) => {
    const trimmed = targetAccount.trim();
    if (!trimmed) return;

    const cacheKey = `csm_briefcase_cache_${trimmed.toLowerCase()}`;
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore localStorage access errors
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
    setProgressText(
      isChiikawaTheme
        ? "Searching Supabase & EBSTA metrics... 🎀"
        : "Querying Supabase database for cases & EBSTA score..."
    );

    const timer1 = setTimeout(() => {
      if (searchIdRef.current === thisSearchId) {
        setProgressStage(2);
        setProgressText(
          isChiikawaTheme
            ? "Matching Gong transcripts... 🐱"
            : "Extracting email domains & querying Gong API..."
        );
      }
    }, 1200);

    const timer2 = setTimeout(() => {
      if (searchIdRef.current === thisSearchId) {
        setProgressStage(3);
        setProgressText(
          isChiikawaTheme
            ? "Packaging Walt's Briefcase! YAHA! 🐰"
            : "Synthesizing transcripts & building Briefcase..."
        );
      }
    }, 2400);

    activeTimersRef.current.push(timer1, timer2);

    try {
      const searchTerm = trimmed;
      // Prefer client wrapper that normalizes and passes domain hints
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

      const directError = Boolean(error);
      setHasError(directError);
      if (directError) {
        console.error("Invocation Error:", error);
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
        transcripts: gongCalls,
        ebstaData: ebsta,
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

  const downloadGongArtifact = () => {
    if (!result?.transcripts) return;

    const payload = {
      accountName: result.accountName || accountName,
      transcripts: result.transcripts,
      exportedAt: new Date().toISOString(),
    };

    const safeName = (result.accountName || accountName || "account")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "account";

    downloadJsonArtifact(`${safeName}-gong-transcripts.json`, payload);
  };

  const downloadSingleMarkdownArtifact = () => {
    if (!result) return;

    const ebstaScore =
      result.ebstaData?.ebstaRecord?.Ebsta_Score__c ?? result.ebstaData?.score ?? "N/A";

    let md = `# WALT'S VAULT BRIEFCASE: ${result.accountName.toUpperCase()}\n`;
    md += `*Generated on: ${new Date().toLocaleDateString()} | Curated via Walt's Gong It Workflow*\n`;
    md += `*EBSTA Engagement Health Score:* ${ebstaScore}/100\n`;
    md += `*Detected Versions:* Copado Deployer v${versions.deployer} | Copado Connect v${versions.connect}\n\n`;
    md += `---\n\n`;

    md += `## 1. WALT'S NOTEBOOK LM PROMPTS\n\n`;
    md += `**Prompt 1 (Initial Source Analysis):**\n`;
    md += `> "Referencing all uploaded sources on ${result.accountName}, summarize their budgeting, hiring, company initiatives, and DevOps team structure."\n\n`;
    md += `**Prompt 2 (Strategic Priorities & Gong Sentiment):**\n`;
    md += `> "Referencing recent transcripts, emails, and support cases, generate what are ${result.accountName}'s strategic initiatives and priorities."\n\n`;
    md += `**Prompt 3 (Copado AI Plan Input):**\n`;
    md += `> "I have uploaded an artifact from NotebookLM that gives a comprehensive overview of ${result.accountName} (EBSTA Score ${ebstaScore}/100, running Copado Deployer v${versions.deployer}) and their goals, strengths, and pain points. Build a plan to address their problems that we can present to them."\n\n`;
    md += `---\n\n`;

    if (result.ebstaData) {
      md += `## 2. EBSTA RELATIONSHIP INTELLIGENCE\n`;
      md += `- **Overall Account Engagement Score:** ${ebstaScore}/100\n\n`;

      if (result.ebstaData.contacts && result.ebstaData.contacts.length > 0) {
        md += `### Top Engaged Stakeholders\n`;
        result.ebstaData.contacts.forEach((c: any) => {
          md += `- **${c.name}** (${c.title}): Engagement Score ${c.score}/100\n`;
        });
        md += `\n`;
      }

      if (result.ebstaData.opportunities && result.ebstaData.opportunities.length > 0) {
        md += `### Opportunity Pipeline Health\n`;
        result.ebstaData.opportunities.forEach((o: any) => {
          md += `- **${o.name}** (Stage: ${o.stage}): Deal Score ${o.score}/100\n`;
        });
        md += `\n`;
      }

      if (result.ebstaData.emails && result.ebstaData.emails.length > 0) {
        md += `### EBSTA Email Repository Transcripts (${result.ebstaData.emails.length} Emails Logged)\n\n`;
        result.ebstaData.emails.forEach((e: any) => {
          md += `#### ${e.subject}\n`;
          md += `- **Date:** ${e.date ? new Date(e.date).toLocaleString() : "N/A"}\n`;
          md += `- **From:** ${e.from}\n`;
          md += `- **To:** ${e.to}\n`;
          md += `- **Body:**\n${e.body}\n\n`;
          md += `------------------------------------------------------------\n\n`;
        });
      }
      md += `------------------------------------------------------------\n\n`;
    }

    md += `## 3. SUPPORT CASES REPORT (${result.cases.length} Unique Cases)\n\n`;
    if (result.cases.length === 0) {
      md += `*No active support cases recorded for this account.*\n\n`;
    } else {
      result.cases.forEach((c: any) => {
        const desc = c.description && c.description !== "null" ? c.description.trim() : "No description provided.";
        const email = c.contact_email && c.contact_email !== "null" ? c.contact_email : "N/A";

        md += `### Case ${c.case_number}: ${c.subject}\n`;
        md += `- **Status:** ${c.status || "N/A"}\n`;
        md += `- **Owner:** ${c.case_owner || "N/A"}\n`;
        md += `- **Date Opened:** ${c.date_opened || "N/A"}\n`;
        md += `- **Contact Email:** ${email}\n`;
        md += `- **Description:**\n${desc}\n\n`;
        md += `------------------------------------------------------------\n\n`;
      });
    }

    md += `---\n\n`;

    md += `## 4. GONG CALL TRANSCRIPTS (${result.transcripts?.length || 0} Calls Matched)\n\n`;
    if (!result.transcripts || result.transcripts.length === 0) {
      md += `*No recent Gong call transcripts matched this account.*\n\n`;
    } else {
      result.transcripts.forEach((t: any) => {
        md += `### Call ID: ${t.callId}\n\n`;
        (t.transcript || []).forEach((m: any) => {
          const sentences = (m.sentences || []).map((s: any) => s.text).join(" ");
          md += `**[${m.speakerId || "Speaker"}]**: ${sentences}\n\n`;
        });
        md += `============================================================\n\n`;
      });
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `WaltsVault_${result.accountName.replace(/\s+/g, "_")}.md`);
  };

  const getStatusBadgeColor = (status: string) => {
    const lower = (status || "").toLowerCase();
    if (lower.includes("resolved") || lower.includes("closed"))
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (lower.includes("progress") || lower.includes("open"))
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    if (lower.includes("spam") || lower.includes("scope"))
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  const getEbstaScoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (score >= 50) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
  };

  const prompts = [
    `Referencing all uploaded sources on ${accountName || "Customer"}, summarize their budgeting, hiring, company initiatives, and DevOps team structure.`,
    `Referencing recent transcripts, emails, and support cases, generate what are ${accountName || "Customer"}'s strategic initiatives and priorities.`,
    `I have uploaded an artifact from NotebookLM that gives a comprehensive overview of ${accountName || "Customer"} (Running Copado Deployer v${versions.deployer}) and their goals, strengths, and pain points. Build a plan to address their problems that we can present to them.`,
  ];

  const extractedEbstaScore =
    result?.ebstaData?.ebstaRecord?.Ebsta_Score__c ?? result?.ebstaData?.score;

  const displayCases = sortCasesNewestFirst(result?.cases || cases || []);
  const displayTranscripts = sortGongTranscriptsNewestFirst(result?.transcripts || transcripts || []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 relative">
      {/* Hero Section */}
      <div className="relative text-center space-y-3 pt-4 pb-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold shadow-sm">
          {isChiikawaTheme ? <Heart className="w-3.5 h-3.5 text-primary fill-primary animate-pulse" /> : <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />}
          <span>{isChiikawaTheme ? "Chiikawa Briefcase Engine 🎀✨" : "Walt's Gong It Intelligence Engine"}</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight flex items-center justify-center gap-2">
          <span>What account are we analyzing today?</span>
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto leading-relaxed">
          Pulls live support cases, EBSTA relationship scores & email transcripts, and Gong call transcripts into a single NotebookLM Briefcase.
        </p>

        {isChiikawaTheme && (
          <div className="pt-2 flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1 animate-bounce">
              <ChiikawaAvatar />
              <span className="text-[11px] font-bold text-pink-600 dark:text-pink-300 bg-pink-100 dark:bg-pink-950/80 px-2 py-0.5 rounded-full border border-pink-300 dark:border-pink-800">
                Chiikawa "Yaha!"
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 animate-bounce [animation-delay:200ms]">
              <HachiwareAvatar />
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-300 dark:border-blue-800">
                Hachiware "Ura!"
              </span>
            </div>
            <div className="flex flex-col items-center gap-1 animate-bounce [animation-delay:400ms]">
              <UsagiAvatar />
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                Usagi "Fuwa!"
              </span>
            </div>
          </div>
        )}

        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium mr-1">
            <Zap className="w-3 h-3 text-amber-500" /> Try Sample:
          </span>
          {SAMPLE_ACCOUNTS.map((acc) => (
            <button
              key={acc}
              onClick={() => handleChipClick(acc)}
              disabled={loading}
              className="text-xs bg-muted/60 hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1 transition-all disabled:opacity-50"
            >
              {acc}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border p-2 sm:p-3 rounded-2xl shadow-sm">
        <form onSubmit={handleFormSubmit} className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-muted/30 px-2 py-1.5">
            <Search className="w-5 h-5 text-primary ml-2 shrink-0" />
            <input
              type="text"
              placeholder={animatedPlaceholder || " "}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={loading}
              className="w-full bg-transparent border-none text-foreground text-base placeholder:text-muted-foreground focus:outline-none focus:ring-0 px-2 py-2"
            />
          </div>

          <select
            value={String(daysBack)}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            disabled={loading}
            className="h-11 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-0 focus:border-primary min-w-[126px]"
            aria-label="Days back range"
            title="Date range"
          >
            <option value="90">90 Days</option>
            <option value="180">180 Days</option>
            <option value="365">1 Year</option>
            <option value="730">2 Years</option>
            <option value="1095">3 Years</option>
            <option value="1460">4 Years</option>
          </select>

          {loading ? (
            <button
              type="button"
              onClick={handleCancelSearch}
              className="bg-rose-600/10 hover:bg-rose-600/20 text-rose-500 border border-rose-500/30 font-semibold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all text-xs shrink-0"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!accountName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md disabled:opacity-40 shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{isChiikawaTheme ? "Gong It 🎀" : "Gong It"}</span>
            </button>
          )}
        </form>

        {loading && (
          <div className="mt-3 pt-3 border-t border-border px-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-medium flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                {progressText}
              </span>
              <span className="text-muted-foreground italic font-mono">Stage {progressStage}/3</span>
            </div>
            <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-700 ease-out"
                style={{ width: `${(progressStage / 3) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {errorMsg && !result && hasError && (
        <div className="mt-4 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-card border border-border p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <h3 className="text-foreground font-bold text-lg flex items-center gap-2">
                  <span>{result.accountName} Briefcase Ready</span>
                  {isChiikawaTheme && <ChiikawaAvatar />}
                </h3>

                {isCachedResult && (
                  <button
                    onClick={() => executeSearch(result.accountName, true)}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 bg-muted px-2.5 py-0.5 rounded-full border border-border transition-colors"
                    title="Click to re-query live Supabase & Gong APIs"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Cached (Refresh Live)
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                {extractedEbstaScore !== undefined && extractedEbstaScore !== null && (
                  <span className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-md font-mono font-bold ${getEbstaScoreColor(extractedEbstaScore)}`}>
                    <Activity className="w-3.5 h-3.5 text-current" /> EBSTA Score: {extractedEbstaScore}/100
                  </span>
                )}
                <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md font-mono">
                  <FileText className="w-3.5 h-3.5 text-blue-500" /> {result.cases?.length || 0} Unique Cases
                </span>
                <span className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md font-mono">
                  <Phone className="w-3.5 h-3.5 text-amber-500" /> {result.transcripts?.length || 0} Gong Calls
                </span>
                <span className="flex items-center gap-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-md font-mono">
                  Deployer v{versions.deployer}
                </span>
                {result.autoDomains?.length > 0 && (
                  <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md font-mono">
                    <Globe className="w-3.5 h-3.5 text-emerald-500" /> {result.autoDomains.join(", ")}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={downloadSingleMarkdownArtifact}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Walt's Vault: NotebookLM Artifact</span>
              </button>
            </div>
          </div>

          <div className="bg-card border border-border p-4 rounded-xl space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Walt's NotebookLM Prompts
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {prompts.map((p, idx) => (
                <div key={idx} className="bg-muted/40 border border-border p-3 rounded-lg flex flex-col justify-between space-y-2">
                  <p className="text-foreground text-xs line-clamp-2 italic">"{p}"</p>
                  <button
                    onClick={() => copyPromptToClipboard(p, idx)}
                    className="self-end text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                  >
                    {copiedPromptIndex === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPromptIndex === idx ? "Copied!" : "Copy Prompt"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* EBSTA Relationship & Stakeholder Intelligence Card */}
          {result?.ebstaData && (
            <div className="bg-card border border-border p-5 rounded-2xl space-y-4 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-border gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-foreground font-bold text-base">
                    EBSTA Relationship Intelligence
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEbstaCard((current) => !current)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-primary/60 transition-colors"
                    title={showEbstaCard ? "Hide EBSTA" : "Show EBSTA"}
                  >
                    {showEbstaCard ? "Hide EBSTA" : "Show EBSTA"}
                  </button>

                  <button
                    type="button"
                    onClick={downloadEbstaArtifact}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    title="Download EBSTA data"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>

                  {extractedEbstaScore !== undefined && extractedEbstaScore !== null && (
                    <span className={`text-xs font-mono font-bold border px-3 py-1 rounded-full ${getEbstaScoreColor(extractedEbstaScore)}`}>
                      Overall Account Score: {extractedEbstaScore}/100
                    </span>
                  )}
                </div>
              </div>

              {showEbstaCard && (
                <>
                  {/* Fixed UI Layout Bug: Added items-start to prevent flex stretching */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Top Engaged Contacts */}
                    <div className="bg-muted/30 border border-border/60 p-4 rounded-xl space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Top Engaged Stakeholders ({result.ebstaData.contacts?.length || 0})
                      </h4>
                      {(!result.ebstaData.contacts || result.ebstaData.contacts.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic">No individual contact scores logged.</p>
                      ) : (
                        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                          {result.ebstaData.contacts.map((c: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-background/60 p-2 rounded-lg border border-border/40">
                              <div>
                                <p className="font-semibold text-foreground">{c.name}</p>
                                <p className="text-[10px] text-muted-foreground">{c.title}</p>
                              </div>
                              <span className={`font-mono font-bold text-[11px] border px-2 py-0.5 rounded-full shrink-0 ml-2 ${getEbstaScoreColor(c.score)}`}>
                                {c.score}/100
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Opportunity Deal Health */}
                    <div className="bg-muted/30 border border-border/60 p-4 rounded-xl space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Opportunity Pipeline Health ({result.ebstaData.opportunities?.length || 0})
                      </h4>
                      {(!result.ebstaData.opportunities || result.ebstaData.opportunities.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic">No opportunity scores logged.</p>
                      ) : (
                        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                          {result.ebstaData.opportunities.map((o: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-background/60 p-2 rounded-lg border border-border/40">
                              <div>
                                <p className="font-semibold text-foreground line-clamp-1">{o.name}</p>
                                <p className="text-[10px] text-muted-foreground">Stage: {o.stage}</p>
                              </div>
                              <span className={`font-mono font-bold text-[11px] border px-2 py-0.5 rounded-full shrink-0 ml-2 ${getEbstaScoreColor(o.score)}`}>
                                {o.score}/100
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* EBSTA Logged Email Repository Transcripts */}
                  {result.ebstaData.emails && result.ebstaData.emails.length > 0 && (
                    <div className="pt-3 border-t border-border space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-purple-500" />
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          EBSTA Email Repository Transcripts ({result.ebstaData.emails.length})
                        </h4>
                      </div>
                      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-2">
                        {result.ebstaData.emails.map((e: any, idx: number) => (
                          <div key={idx} className="bg-muted/30 border border-border/60 p-3 rounded-xl space-y-1 hover:border-primary/30 transition-colors">
                            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                              <span>{e.subject}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {e.date ? new Date(e.date).toLocaleDateString() : "N/A"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                              <span>From: {e.from}</span>
                              <span>To: {e.to}</span>
                            </div>
                            <p className="text-foreground text-[11px] line-clamp-2 font-mono bg-background/80 p-2 rounded-lg border border-border/50">
                              {e.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <FileText className="w-4 h-4 text-blue-500" />
                <h3 className="text-foreground text-sm font-semibold">Support Cases</h3>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCasesCard((current) => !current)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-primary/60 transition-colors"
                    title={showCasesCard ? "Hide cases" : "Show cases"}
                  >
                    {showCasesCard ? "Hide Cases" : "Show Cases"}
                  </button>

                  <button
                    type="button"
                    onClick={downloadCasesArtifact}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    title="Download support cases"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>

                  <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {result.cases?.length || 0} Total
                  </span>
                </div>
              </div>

              {showCasesCard && (
                <div className="max-h-[480px] overflow-y-auto space-y-3 pr-2">
                  {!result.cases || result.cases.length === 0 ? (
                    <p className="text-muted-foreground text-xs italic">No support cases found for this account.</p>
                  ) : (
                    result.cases.map((c: any) => (
                      <div key={c.case_number} className="bg-muted/30 border border-border/60 p-3.5 rounded-xl space-y-2 hover:border-primary/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-primary font-mono text-xs font-bold">{c.case_number}</span>
                          <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-full ${getStatusBadgeColor(c.status)}`}>
                            {c.status || "N/A"}
                          </span>
                        </div>
                        <p className="text-foreground text-xs font-medium line-clamp-1">{c.subject}</p>
                        <p className="text-muted-foreground text-[11px] line-clamp-2">
                          {c.description && c.description !== "null" ? c.description : "No description provided."}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                          <span>Owner: {c.case_owner || "N/A"}</span>
                          <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {c.date_opened}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <Phone className="w-4 h-4 text-amber-500" />
                <h3 className="text-foreground text-sm font-semibold">Gong Transcripts</h3>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGongCard((current) => !current)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-primary/60 transition-colors"
                    title={showGongCard ? "Hide calls" : "Show calls"}
                  >
                    {showGongCard ? "Hide Calls" : "Show Calls"}
                  </button>

                  <button
                    type="button"
                    onClick={downloadGongArtifact}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    title="Download Gong transcripts"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>

                  <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {result.transcripts?.length || 0} Calls
                  </span>
                </div>
              </div>

              {showGongCard && (
                <div className="max-h-[480px] overflow-y-auto space-y-3 pr-2">
                  {!displayTranscripts || displayTranscripts.length === 0 ? (
                    <p className="text-muted-foreground text-xs italic">No recent Gong transcripts found for this account.</p>
                  ) : (
                    displayTranscripts.map((t: any) => (
                      <div key={t.callId || t.id || `${t.title}-${t.started}`} className="bg-muted/30 border border-border/60 p-3.5 rounded-xl space-y-2.5 hover:border-primary/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-foreground text-xs font-bold line-clamp-1 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>{t.title || t.callName || t.name || "Untitled Gong Call"}</span>
                          </h4>

                          {t.url && (
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-lg font-semibold shrink-0 flex items-center gap-1 transition-colors"
                            >
                              <span>Watch in Gong</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" /> {t.started || t.startedAt || t.date || "N/A"}
                          </span>
                          {t.durationMinutes && (
                            <span className="bg-muted px-1.5 py-0.5 rounded border border-border">
                              ⏱️ {t.durationMinutes} mins
                            </span>
                          )}
                          <span className="opacity-60 ml-auto">ID: {t.callId || t.id || "N/A"}</span>
                        </div>

                        {t.parties && t.parties.length > 0 && (
                          <div className="flex items-start gap-1 text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                            <Users className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="line-clamp-1">
                              <span className="font-semibold text-foreground">Attendees:</span>{" "}
                              {t.parties.map((p: any) => p.name || p.email || p.title || "Unknown").join(", ")}
                            </p>
                          </div>
                        )}

                        <p className="text-foreground text-[11px] line-clamp-3 font-mono bg-background/80 p-2.5 rounded-lg border border-border/50 leading-relaxed">
                          {(t.transcript || []).map((m: any) => (m.sentences || []).map((s: any) => s.text).join(" ")).join(" ") || "No transcript excerpt available."}
                        </p>
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