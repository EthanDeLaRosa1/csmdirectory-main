import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CALLS_TO_PROCESS = 40;
const TRANSCRIPT_BATCH_SIZE = 50;
const MAX_GONG_SEARCH_DAYS = 1460; // 4-year range supported for CSM Briefcase

// Speed guards: bound worst-case pagination so low-match accounts don't scan
// the org's entire call history (the old cause of timeouts).
const MAX_CALL_PAGES = 20; // ~2000 calls scanned max (Gong page size ~100)
const GONG_PAGE_DELAY_MS = 350; // stay under Gong's ~3 req/s limit to avoid 429s
const GONG_MAX_429_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array(bl + 1).fill(0);
  const v1 = new Array(bl + 1).fill(0);
  for (let j = 0; j <= bl; j++) v0[j] = j;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

async function getSalesforceAccessToken() {
  const sfInstanceUrl = Deno.env.get("SF_INSTANCE_URL") || Deno.env.get("SALESFORCE_INSTANCE_URL");
  const sfClientId = Deno.env.get("SF_CLIENT_ID");
  const sfRefreshToken = Deno.env.get("SF_REFRESH_TOKEN");

  if (!sfInstanceUrl || !sfRefreshToken) {
    return { error: "Missing SF_INSTANCE_URL or SF_REFRESH_TOKEN in Supabase secrets" };
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: sfClientId || "",
      refresh_token: sfRefreshToken,
    });

    const tokenRes = await fetch(`${sfInstanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { error: `Token refresh failed (${tokenRes.status}): ${errText}` };
    }

    const tokenData = await tokenRes.json();
    return {
      accessToken: tokenData.access_token,
      instanceUrl: tokenData.instance_url || sfInstanceUrl,
    };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

function isCalendarNoise(subject: string, body: string): boolean {
  const s = (subject || "").toLowerCase();
  const b = (body || "").trim().toLowerCase();

  const isRsvpSubject =
    s.includes("accepted:") ||
    s.includes("invitation:") ||
    s.includes("declined:") ||
    s.includes("canceled:") ||
    s.includes("cancelled:") ||
    s.includes("updated invitation:");

  const isPlaceholderBody =
    !b ||
    b === "no content logged." ||
    b === "logged ebsta communication event" ||
    b === "no body text available." ||
    b === "no email body logged.";

  return isRsvpSubject || isPlaceholderBody;
}

async function fetchSalesforceCases(supabase: any, accountName: string, sfAuth?: any) {
  let sfCasesMap = new Map<string, any>();

  if (sfAuth?.accessToken && sfAuth?.instanceUrl) {
    try {
      const caseDescribeRes = await fetch(
        `${sfAuth.instanceUrl}/services/data/v58.0/sobjects/Case/describe`,
        { headers: { Authorization: `Bearer ${sfAuth.accessToken}` } }
      );

      let richDescFields: string[] = [];
      if (caseDescribeRes.ok) {
        const caseDescribeData = await caseDescribeRes.json();
        richDescFields = (caseDescribeData.fields || [])
          .map((f: any) => f.name)
          .filter((f: string) => {
            const l = f.toLowerCase();
            return l.includes("rich") || l.includes("description") || l.includes("details");
          });
      }

      const queryFields = [
        "Id",
        "CaseNumber",
        "Subject",
        "Status",
        "Description",
        "CreatedDate",
        "ContactEmail",
        "Owner.Name",
        "Account.Name",
        ...richDescFields,
      ];

      const uniqueQueryFields = [...new Set(queryFields)].slice(0, 15);

      const caseQuery = `SELECT ${uniqueQueryFields.join(
        ", "
      )} FROM Case WHERE Account.Name LIKE '%${accountName}%' ORDER BY CreatedDate DESC LIMIT 100`;

      const res = await fetch(
        `${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(caseQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${sfAuth.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.records && data.records.length > 0) {
          data.records.forEach((c: any) => {
            let bestDesc = "";
            for (const key of Object.keys(c)) {
              if (
                key !== "attributes" &&
                key !== "Id" &&
                key !== "CaseNumber" &&
                key !== "Subject" &&
                key !== "Status" &&
                key !== "CreatedDate" &&
                key !== "ContactEmail" &&
                key !== "Owner" &&
                key !== "Account" &&
                c[key] &&
                typeof c[key] === "string"
              ) {
                const cleanText = c[key].replace(/<[^>]*>?/gm, "").trim();
                if (cleanText.length > bestDesc.length) {
                  bestDesc = cleanText;
                }
              }
            }

            sfCasesMap.set(c.CaseNumber, {
              case_number: c.CaseNumber,
              account_name: c.Account?.Name || accountName,
              subject: c.Subject || "No Subject",
              status: c.Status || "N/A",
              description: bestDesc.length > 0 ? bestDesc : c.Subject || "No description provided.",
              date_opened: c.CreatedDate ? new Date(c.CreatedDate).toLocaleDateString() : "N/A",
              contact_email: c.ContactEmail || "N/A",
              case_owner: c.Owner?.Name || "Unassigned",
            });
          });
        }
      }
    } catch (e) {
      console.warn("Direct Salesforce Case query fallback:", e);
    }
  }

  try {
    const { data: cases, error: caseErr } = await supabase
      .from("support_cases")
      .select("*")
      .ilike("account_name", `%${accountName}%`)
      .order("date_opened", { ascending: false });

    if (!caseErr && cases && cases.length > 0) {
      return cases.map((c: any) => {
        const matchedSfCase = sfCasesMap.get(c.case_number);
        const rawDesc = c.description && c.description !== "null" ? c.description : "";
        const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, "").trim();

        const desc =
          cleanDesc.length > 5
            ? cleanDesc
            : matchedSfCase?.description || c.subject || "No description provided.";

        return {
          ...c,
          account_name: c.account_name || matchedSfCase?.account_name || accountName,
          description: desc,
          case_owner: c.case_owner || matchedSfCase?.case_owner || "N/A",
          contact_email:
            c.contact_email && c.contact_email !== "N/A"
              ? c.contact_email
              : matchedSfCase?.contact_email || "N/A",
          date_opened: c.date_opened ? new Date(c.date_opened).toLocaleDateString() : "N/A",
        };
      });
    }
  } catch (error) {
    console.error("Supabase case fetch failed:", error);
  }

  return Array.from(sfCasesMap.values());
}

async function fetchEbstaData(accountName: string, sfAuth: any, effectiveDaysBack: number = 180) {
  if (sfAuth?.error || !sfAuth?.accessToken) {
    return null;
  }

  const headers = {
    Authorization: `Bearer ${sfAuth.accessToken}`,
    "Content-Type": "application/json",
  };

  const cutoffDate = new Date(Date.now() - effectiveDaysBack * 24 * 60 * 60 * 1000).toISOString();

  let accountScoreData: any = null;
  let rawContacts: any[] = [];
  let rawOpps: any[] = [];
  let rawEmails: any[] = [];
  let rawTasks: any[] = [];

  try {
    const accountQuery = `SELECT Id, Ebsta_Score__c, LastModifiedDate, Account__c, Account__r.Name FROM Account_Ebsta_Score__c WHERE Account__r.Name LIKE '%${accountName}%' ORDER BY LastModifiedDate DESC LIMIT 1`;
    const accRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(accountQuery)}`, { headers });
    if (accRes.ok) {
      const accJson = await accRes.json();
      if (accJson.records && accJson.records.length > 0) {
        accountScoreData = accJson.records[0];
      }
    }

    try {
      const contactQuery = `SELECT Id, Ebsta_Score__c, Contact__r.Name, Contact__r.Title, LastModifiedDate FROM Contact_Ebsta_Score__c WHERE Contact__r.Account.Name LIKE '%${accountName}%' ORDER BY Ebsta_Score__c DESC LIMIT 20`;
      const conRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(contactQuery)}`, { headers });
      if (conRes.ok) {
        const conJson = await conRes.json();
        rawContacts = conJson.records || [];
      }
    } catch (e) {
      console.warn("Contact EBSTA fetch fallback:", e);
    }

    try {
      const oppQuery = `SELECT Id, Ebsta_Score__c, Opportunity__r.Name, Opportunity__r.StageName, LastModifiedDate FROM Opportunity_Ebsta_Score__c WHERE Opportunity__r.Account.Name LIKE '%${accountName}%' ORDER BY Ebsta_Score__c DESC LIMIT 20`;
      const oppRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(oppQuery)}`, { headers });
      if (oppRes.ok) {
        const oppJson = await oppRes.json();
        rawOpps = oppJson.records || [];
      }
    } catch (e) {
      console.warn("Opportunity EBSTA fetch fallback:", e);
    }

    try {
      const emailQuery = `SELECT Id, Subject, FromAddress, ToAddress, MessageDate, TextBody, HtmlBody FROM EmailMessage WHERE (RelatedToId IN (SELECT Id FROM Account WHERE Name LIKE '%${accountName}%') OR RelatedToId IN (SELECT Id FROM Opportunity WHERE Account.Name LIKE '%${accountName}%')) AND (NOT Subject LIKE 'Accepted:%') AND (NOT Subject LIKE 'Invitation:%') AND (NOT Subject LIKE 'Declined:%') AND MessageDate >= ${cutoffDate} ORDER BY MessageDate DESC LIMIT 40`;
      const emailRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(emailQuery)}`, { headers });
      if (emailRes.ok) {
        const emailJson = await emailRes.json();
        rawEmails = emailJson.records || [];
      }
    } catch (e) {
      console.warn("EmailMessage query fallback:", e);
    }

    let taskSelectFields = ["Id", "Subject", "Description", "CreatedDate", "Who.Name", "What.Name"];
    try {
      const taskDescribeRes = await fetch(
        `${sfAuth.instanceUrl}/services/data/v58.0/sobjects/Task/describe`,
        { headers }
      );
      if (taskDescribeRes.ok) {
        const taskDescribeData = await taskDescribeRes.json();
        const taskFields = (taskDescribeData.fields || []).map((f: any) => f.name);
        const extraBodyFields = taskFields.filter((f: string) => {
          const l = f.toLowerCase();
          return (
            l.includes("ebsta") ||
            l.includes("body") ||
            l.includes("comment") ||
            l.includes("detail") ||
            l.includes("mail") ||
            l.includes("text")
          );
        });
        taskSelectFields = [...new Set([...taskSelectFields, ...extraBodyFields])].slice(0, 15);
      }
    } catch (e) {
      console.warn("Task describe fallback:", e);
    }

    try {
      const taskQuery = `SELECT ${taskSelectFields.join(
        ", "
      )} FROM Task WHERE AccountId IN (SELECT Id FROM Account WHERE Name LIKE '%${accountName}%') AND (NOT Subject LIKE 'Accepted:%') AND (NOT Subject LIKE 'Invitation:%') AND (NOT Subject LIKE 'Declined:%') ORDER BY CreatedDate DESC LIMIT 40`;
      const taskRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(taskQuery)}`, { headers });
      if (taskRes.ok) {
        const taskJson = await taskRes.json();
        rawTasks = taskJson.records || [];
      }
    } catch (e) {
      console.warn("Task query fallback:", e);
    }

    const uniqueContactsMap = new Map();
    rawContacts.forEach((c: any) => {
      const name = c.Contact__r?.Name;
      if (name && !uniqueContactsMap.has(name)) {
        uniqueContactsMap.set(name, {
          name,
          title: c.Contact__r?.Title || "N/A",
          score: c.Ebsta_Score__c ?? 0,
          lastModified: c.LastModifiedDate,
        });
      }
    });

    const uniqueOppsMap = new Map();
    rawOpps.forEach((o: any) => {
      const name = o.Opportunity__r?.Name;
      if (name && !uniqueOppsMap.has(name)) {
        uniqueOppsMap.set(name, {
          name,
          stage: o.Opportunity__r?.StageName || "N/A",
          score: o.Ebsta_Score__c ?? 0,
          lastModified: o.LastModifiedDate,
        });
      }
    });

    const formattedEmailMessages = rawEmails
      .map((e: any) => {
        const raw = e.TextBody || e.HtmlBody || "";
        const clean = raw.replace(/<[^>]*>?/gm, "").trim();
        return {
          id: e.Id,
          subject: e.Subject || "No Subject",
          from: e.FromAddress || "N/A",
          to: e.ToAddress || "N/A",
          date: e.MessageDate,
          body: clean,
        };
      })
      .filter((e: any) => !isCalendarNoise(e.subject, e.body));

    const formattedTaskEmails = rawTasks
      .map((t: any) => {
        let bestBody = "";
        for (const key of Object.keys(t)) {
          if (
            key !== "attributes" &&
            key !== "Id" &&
            key !== "Subject" &&
            key !== "CreatedDate" &&
            key !== "Who" &&
            key !== "What" &&
            t[key] &&
            typeof t[key] === "string"
          ) {
            const val = t[key].trim();
            if (val.length > bestBody.length) {
              bestBody = val;
            }
          }
        }

        const cleanBody = bestBody.replace(/<[^>]*>?/gm, "").trim();

        return {
          id: t.Id,
          subject: t.Subject || "No Subject",
          from: t.Who?.Name || "N/A",
          to: t.What?.Name || "N/A",
          date: t.CreatedDate,
          body: cleanBody,
        };
      })
      .filter((e: any) => !isCalendarNoise(e.subject, e.body));

    const combinedEmails = [...formattedEmailMessages, ...formattedTaskEmails].slice(0, 20);

    return {
      score: accountScoreData?.Ebsta_Score__c ?? null,
      lastActivity: accountScoreData?.LastModifiedDate ?? null,
      accountId: accountScoreData?.Account__c ?? null,
      contacts: Array.from(uniqueContactsMap.values()),
      opportunities: Array.from(uniqueOppsMap.values()),
      emails: combinedEmails,
    };
  } catch (error) {
    console.warn("EBSTA fetch error:", error);
    return null;
  }
}

async function fetchGongData(
  accountName: string,
  autoDomains: Set<string>,
  effectiveDaysBack: number,
  authHeader: string
) {
  let debugGongStatus: number | null = null;
  let debugGongError = "";

  try {
    // Build keywords for fuzzy matching: split normalized name into meaningful tokens
    const normalizedLower = (accountName || "").toLowerCase();
    const keywords = normalizedLower.split(/\s+/).filter((w) => w.length > 2);

    const domainList = Array.from(autoDomains);

    let matchedCallsMap = new Map<string, { callId: string; title: string; parties: string[] }>();
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;
    let retry429 = 0;

    const fromDateTime = new Date(
      Date.now() - effectiveDaysBack * 24 * 60 * 60 * 1000
    ).toISOString();

    while (
      hasMore &&
      matchedCallsMap.size < MAX_CALLS_TO_PROCESS &&
      pageCount < MAX_CALL_PAGES
    ) {
      const params = new URLSearchParams({ fromDateTime });

      if (cursor) {
        params.set("cursor", cursor);
      }

      const callsRes = await fetch(
        `https://api.gong.io/v2/calls?${params.toString()}`,
        {
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        }
      );

      if (callsRes.status === 429) {
        // Back off and retry the SAME cursor instead of bailing — preserves progress.
        if (retry429 < GONG_MAX_429_RETRIES) {
          retry429 += 1;
          const backoff = 1000 * retry429;
          console.warn(`Gong 429 rate limit — backoff ${backoff}ms (retry ${retry429}/${GONG_MAX_429_RETRIES})`);
          await sleep(backoff);
          continue;
        }
        debugGongStatus = 429;
        debugGongError = "Gong API Rate Limit hit (HTTP 429) after retries";
        console.warn("Gong API 429 Rate Limit exhausted retries.");
        break;
      }
      retry429 = 0;

      if (!callsRes.ok) {
        debugGongStatus = callsRes.status;
        const rawErrorText = await callsRes.text();
        debugGongError = rawErrorText;
        console.warn("Gong API error:", callsRes.status, rawErrorText);
        break;
      }

      pageCount += 1;
      const callsData = await callsRes.json();
      const calls = callsData.calls || [];

      for (const c of calls) {
        if (matchedCallsMap.size >= MAX_CALLS_TO_PROCESS) {
          break;
        }

        const title = String(c.title || "").toLowerCase();
        const rawParties = c.parties || [];
        const parties = rawParties
          .map((p: any) => String(p.emailAddress || "").toLowerCase().trim())
          .filter(Boolean);

        const domainMatch = parties.some((email: string) =>
          domainList.some((domain) => email.endsWith(`@${domain}`))
        );

        // Fuzzy/partial matches: title contains normalized tokens
        const matchingKeywordCount = keywords.filter((keyword: string) =>
          title.includes(keyword) || similarity(keyword, title) >= 0.72
        ).length;
        const keywordMatch = keywords.length > 0 && matchingKeywordCount >= Math.min(1, keywords.length);

        const accountNameMatch = (accountName || "").length > 2 &&
          (title.includes((accountName || "").toLowerCase()) || similarity((accountName || "").toLowerCase(), title) >= 0.7);

        const emailKeywordMatch = parties.some((email: string) => {
          const local = email.split("@")[0] || "";
          return keywords.some((keyword: string) =>
            local.includes(keyword) || email.includes(keyword) || similarity(keyword, local) >= 0.72
          );
        });

        if (
          domainMatch ||
          accountNameMatch ||
          keywordMatch ||
          emailKeywordMatch
        ) {
          matchedCallsMap.set(String(c.id), {
            callId: String(c.id),
            title: String(c.title || ""),
            parties,
          });
        }
      }

      cursor = callsData.records?.cursor || callsData.cursor || null;
      hasMore = Boolean(cursor && calls.length > 0);

      if (calls.length === 0) {
        hasMore = false;
      }

      await sleep(GONG_PAGE_DELAY_MS);
    }

    if (pageCount >= MAX_CALL_PAGES && matchedCallsMap.size < MAX_CALLS_TO_PROCESS) {
      console.warn(
        `Gong scan capped at ${MAX_CALL_PAGES} pages (${matchedCallsMap.size} matches). Narrow daysBack for deeper coverage.`
      );
      debugGongError = debugGongError || `Scan capped at ${MAX_CALL_PAGES} pages`;
    }

    const uniqueCallEntries = Array.from(matchedCallsMap.values()).slice(
      0,
      MAX_CALLS_TO_PROCESS
    );

    if (uniqueCallEntries.length === 0) {
      return { transcripts: [], debugGongStatus, debugGongError };
    }

    const uniqueCallIds = uniqueCallEntries.map((item) => item.callId);

    const transcriptBatches: string[][] = [];
    for (let i = 0; i < uniqueCallIds.length; i += TRANSCRIPT_BATCH_SIZE) {
      transcriptBatches.push(uniqueCallIds.slice(i, i + TRANSCRIPT_BATCH_SIZE));
    }

    const transcriptResults = await Promise.all(
      transcriptBatches.map(async (batch) => {
        await sleep(150);
        const transRes = await fetch("https://api.gong.io/v2/calls/transcript", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filter: {
              callIds: batch,
            },
          }),
        });

        if (transRes.status === 429 || !transRes.ok) {
          debugGongStatus = transRes.status;
          const rawErrorText = await transRes.text();
          debugGongError = rawErrorText;
          console.warn("Gong API rate limited or failed:", transRes.status, rawErrorText);
          return [];
        }

        const transData = await transRes.json();
        return Array.isArray(transData.callTranscripts)
          ? transData.callTranscripts
          : [];
      })
    );

    const gongTranscripts: any[] = [];
    for (const batchTranscripts of transcriptResults) {
      gongTranscripts.push(...batchTranscripts);
    }

    // Attach parties and title metadata back to transcript payload
    const enrichedTranscripts = gongTranscripts.map((t: any) => {
      const metadata = matchedCallsMap.get(String(t.callId));
      return {
        ...t,
        title: metadata?.title || "",
        parties: metadata?.parties || [],
      };
    });

    return { transcripts: enrichedTranscripts, debugGongStatus, debugGongError };
  } catch (error) {
    debugGongStatus = debugGongStatus ?? 500;
    debugGongError =
      typeof error === "string"
        ? error
        : error instanceof Error
        ? error.message
        : JSON.stringify(error);
    console.warn("Gong API error:", debugGongStatus, debugGongError);
    return { transcripts: [], debugGongStatus, debugGongError };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { accountName: rawAccountName, daysBack = 180, domain: hintedDomain } = await req.json();
    // Normalize incoming account name and extract domain if provided
    const accountName = (rawAccountName || "").toString();
    const normalize = (n: string) => {
      if (!n) return "";
      let s = String(n).trim();
      if (s.includes("@")) s = s.split("@")[0];
      s = s.replace(/[.,]/g, " ");
      s = s.replace(/\b(inc|inc\.|llc|corp|corporation|co\.|ltd|pty)\b/gi, "");
      s = s.replace(/\s+/g, " ").trim();
      return s;
    };
    const normalizedAccountName = normalize(accountName);
    const extractedDomain = hintedDomain || (accountName.includes("@") ? accountName.split("@")[1] : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(accountName) ? accountName : null);
    const effectiveDaysBack = Math.min(Number(daysBack) || 180, MAX_GONG_SEARCH_DAYS);

    if (!accountName || typeof accountName !== "string") {
      return new Response(
        JSON.stringify({ error: "accountName is required" }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 400,
        }
      );
    }

    const gongAccessKey = Deno.env.get("GONG_ACCESS_KEY") || "";
    const gongSecretKey = Deno.env.get("GONG_SECRET_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sfAuth = await getSalesforceAccessToken();

    const cases = await fetchSalesforceCases(supabase, normalizedAccountName, sfAuth);
    const ebstaData = await fetchEbstaData(normalizedAccountName, sfAuth, effectiveDaysBack);

    const ignoredDomains = new Set([
      "copado.com",
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "salesforce.com",
    ]);

    const autoDomains = new Set<string>();

    (cases || []).forEach((c: any) => {
      const email = c.contact_email?.toLowerCase().trim();
      if (!email || !email.includes("@")) return;

      const parts = email.split("@");
      if (parts.length !== 2) return;

      const domain = parts[1];
      if (domain && !ignoredDomains.has(domain)) {
        autoDomains.add(domain);
        
        if (domain.includes("-external.")) {
          const coreDomain = domain.replace("-external.", ".");
          autoDomains.add(coreDomain);
        }
      }
    });

    let gongTranscripts: any[] = [];
    let gongCallCount = 0;
    let debugGongStatus: number | null = null;
    let debugGongError = "";

    if (gongAccessKey && gongSecretKey) {
      const authHeader = "Basic " + btoa(`${gongAccessKey}:${gongSecretKey}`);

      // Pass normalized name and any hinted domain to Gong fetcher
      const gongData = await fetchGongData(
        normalizedAccountName,
        extractedDomain ? new Set([extractedDomain]) : autoDomains,
        effectiveDaysBack,
        authHeader
      );

      gongTranscripts = Array.isArray(gongData?.transcripts) ? gongData.transcripts : [];
      gongCallCount = gongTranscripts.length;
      debugGongStatus = gongData?.debugGongStatus ?? null;
      debugGongError = gongData?.debugGongError ?? "";
    }

    return new Response(
      JSON.stringify({
        accountName,
        daysBack: effectiveDaysBack,
        supportCaseCount: cases?.length || 0,
        gongCallCount,
        transcriptCount: gongTranscripts.length,
        gongHttpStatus: debugGongStatus,
        gongErrorMessage: debugGongError,
        autoDomains: Array.from(autoDomains),
        cases: cases || [],
        salesforceCases: cases || [],
        transcripts: gongTranscripts,
        gongData: gongTranscripts,
        ebstaData,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error("Customer Briefcase Function Error:", err);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unknown error",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});