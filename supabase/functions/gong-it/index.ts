import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CALLS_TO_PROCESS = 50;
const TRANSCRIPT_BATCH_SIZE = 50;
const MAX_GONG_SEARCH_DAYS = 1460;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "in", "to", "on", "at", "by", "with",
  "inc", "inc.", "llc", "corp", "corporation", "co", "co.", "ltd", "pty", "group",
  "center", "centre", "health", "healthcare", "medical", "hospital", "hospitals",
  "system", "systems", "university", "department", "services", "solutions",
  "international", "national", "association", "company"
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

function extractDistinctiveKeywords(accountName: string): string[] {
  if (!accountName) return [];
  const cleanTokens = accountName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const distinctive = cleanTokens.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return distinctive.length > 0 ? distinctive : cleanTokens.filter((w) => w.length > 2);
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

async function fetchSalesforceCases(supabase: any, accountName: string, sfAuth?: any, logs: string[] = []) {
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

      logs.push(`[SF Cases] Query: ${caseQuery}`);

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
        logs.push(`[SF Cases] Returned ${data.records?.length || 0} cases.`);
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
      logs.push(`[SF Cases] Error: ${String(e)}`);
    }
  }

  try {
    const { data: cases, error: caseErr } = await supabase
      .from("support_cases")
      .select("*")
      .ilike("account_name", `%${accountName}%`)
      .order("date_opened", { ascending: false });

    if (!caseErr && cases && cases.length > 0) {
      logs.push(`[Supabase Cases] Found ${cases.length} cached cases.`);
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
    logs.push(`[Supabase Cases] Error: ${String(error)}`);
  }

  return Array.from(sfCasesMap.values());
}

async function fetchEbstaData(accountName: string, sfAuth: any, effectiveDaysBack: number = 180, logs: string[] = []) {
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
      logs.push(`[EBSTA Contacts] Warning: ${String(e)}`);
    }

    try {
      const oppQuery = `SELECT Id, Ebsta_Score__c, Opportunity__r.Name, Opportunity__r.StageName, LastModifiedDate FROM Opportunity_Ebsta_Score__c WHERE Opportunity__r.Account.Name LIKE '%${accountName}%' ORDER BY Ebsta_Score__c DESC LIMIT 20`;
      const oppRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(oppQuery)}`, { headers });
      if (oppRes.ok) {
        const oppJson = await oppRes.json();
        rawOpps = oppJson.records || [];
      }
    } catch (e) {
      logs.push(`[EBSTA Opps] Warning: ${String(e)}`);
    }

    try {
      const emailQuery = `SELECT Id, Subject, FromAddress, ToAddress, MessageDate, TextBody, HtmlBody FROM EmailMessage WHERE (RelatedToId IN (SELECT Id FROM Account WHERE Name LIKE '%${accountName}%') OR RelatedToId IN (SELECT Id FROM Opportunity WHERE Account.Name LIKE '%${accountName}%')) AND (NOT Subject LIKE 'Accepted:%') AND (NOT Subject LIKE 'Invitation:%') AND (NOT Subject LIKE 'Declined:%') AND MessageDate >= ${cutoffDate} ORDER BY MessageDate DESC LIMIT 40`;
      const emailRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(emailQuery)}`, { headers });
      if (emailRes.ok) {
        const emailJson = await emailRes.json();
        rawEmails = emailJson.records || [];
      }
    } catch (e) {
      logs.push(`[EBSTA Emails] Warning: ${String(e)}`);
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

    return {
      score: accountScoreData?.Ebsta_Score__c ?? null,
      lastActivity: accountScoreData?.LastModifiedDate ?? null,
      accountId: accountScoreData?.Account__c ?? null,
      contacts: Array.from(uniqueContactsMap.values()),
      opportunities: Array.from(uniqueOppsMap.values()),
      emails: formattedEmailMessages.slice(0, 20),
    };
  } catch (error) {
    logs.push(`[EBSTA] Error: ${String(error)}`);
    return null;
  }
}

const GONG_URL_ID_RE = /gong\.io\/call\?id=(\d{6,})/gi;

function extractGongIds(text: string, into: Set<string>) {
  if (!text) return;
  for (const m of text.matchAll(GONG_URL_ID_RE)) into.add(m[1]);
  if (/^\d{15,20}$/.test(text.trim())) into.add(text.trim());
}

async function fetchGongCallIdsFromSalesforce(
  accountName: string,
  sfAuth: any,
  effectiveDaysBack: number = 180,
  logs: string[] = []
): Promise<{ callId: string; title?: string; started?: string; url?: string }[]> {
  if (!sfAuth?.accessToken || !sfAuth?.instanceUrl) {
    logs.push("[Gong SF Lookup] Skipped — missing Salesforce OAuth token.");
    return [];
  }

  const headers = { Authorization: `Bearer ${sfAuth.accessToken}` };
  const callMap = new Map<string, { callId: string; title?: string; started?: string; url?: string }>();

  const distinctiveTokens = extractDistinctiveKeywords(accountName);
  const primaryBrandToken = distinctiveTokens.length > 0 ? distinctiveTokens[0] : accountName;
  const cutoffMs = Date.now() - effectiveDaysBack * 24 * 60 * 60 * 1000;

  // Step 1: Find Account IDs (including Parent accounts)
  let accountIds: string[] = [];
  try {
    const accQuery = `SELECT Id, Name, ParentId FROM Account WHERE Name LIKE '%${primaryBrandToken}%' OR Name LIKE '%${accountName}%' LIMIT 30`;
    logs.push(`[Gong SF Lookup] Querying Accounts: ${accQuery}`);
    const accRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(accQuery)}`, { headers });

    if (accRes.ok) {
      const accData = await accRes.json();
      const records = accData.records || [];
      records.forEach((r: any) => {
        if (r.Id) accountIds.push(String(r.Id));
        if (r.ParentId) accountIds.push(String(r.ParentId));
      });
      accountIds = [...new Set(accountIds)];
      logs.push(`[Gong SF Lookup] Found ${accountIds.length} Account ID(s).`);
    }
  } catch (e) {
    logs.push(`[Gong SF Lookup] Account query error: ${String(e)}`);
  }

  const accountIdClause = accountIds.length > 0 ? accountIds.map((id) => `'${id}'`).join(",") : null;

  // Step 2: Find Opportunity IDs
  let opportunityIds: string[] = [];
  try {
    let oppQuery = "";
    if (accountIdClause) {
      oppQuery = `SELECT Id, Name FROM Opportunity WHERE AccountId IN (${accountIdClause}) OR Account.Name LIKE '%${primaryBrandToken}%' OR Name LIKE '%${primaryBrandToken}%' LIMIT 100`;
    } else {
      oppQuery = `SELECT Id, Name FROM Opportunity WHERE Account.Name LIKE '%${primaryBrandToken}%' OR Name LIKE '%${primaryBrandToken}%' LIMIT 100`;
    }

    logs.push(`[Gong SF Lookup] Querying Opportunities: ${oppQuery}`);
    const oppRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(oppQuery)}`, { headers });

    if (oppRes.ok) {
      const oppData = await oppRes.json();
      opportunityIds = (oppData.records || []).map((r: any) => String(r.Id));
      logs.push(`[Gong SF Lookup] Found ${opportunityIds.length} Opportunity ID(s).`);
    }
  } catch (e) {
    logs.push(`[Gong SF Lookup] Opportunity query error: ${String(e)}`);
  }

  const opportunityIdClause = opportunityIds.length > 0 ? opportunityIds.map((id) => `'${id}'`).join(",") : null;

  // Step 3: Query Gong Custom Objects using schema field inspection
  const gongObjects = [
    "Gong__Gong_Call__c",
    "Gong__Gong_Conversation__c",
    "Gong__Call__c",
    "Gong_Call__c",
    "Gong_Conversation__c",
  ];

  for (const objName of gongObjects) {
    try {
      const descRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/sobjects/${objName}/describe`, { headers });
      if (!descRes.ok) continue;

      logs.push(`[Gong SF Lookup] Inspecting schema for ${objName}...`);
      const descData = await descRes.json();
      const allFields = descData.fields || [];

      // Filter ONLY reference fields pointing to Account or Opportunity
      const accRefFields = allFields
        .filter((f: any) => f.type === "reference" && (f.referenceTo || []).includes("Account"))
        .map((f: any) => f.name);

      const oppRefFields = allFields
        .filter((f: any) => f.type === "reference" && (f.referenceTo || []).includes("Opportunity"))
        .map((f: any) => f.name);

      const titleField = allFields.find((f: any) => /title|name|subject/i.test(f.name))?.name || "Name";
      const dateField = allFields.find((f: any) => f.label === "Started" || /start|date/i.test(f.name))?.name || "CreatedDate";
      const possibleIdFields = allFields
        .filter((f: any) => ["string", "url", "textarea"].includes(f.type) || /url|link|id|code/i.test(f.name))
        .map((f: any) => f.name);

      const conditions: string[] = [];

      if (accountIdClause && accRefFields.length > 0) {
        accRefFields.forEach((af: string) => conditions.push(`${af} IN (${accountIdClause})`));
      }

      if (opportunityIdClause && oppRefFields.length > 0) {
        oppRefFields.forEach((of: string) => conditions.push(`${of} IN (${opportunityIdClause})`));
      }

      conditions.push(`Name LIKE '%${primaryBrandToken}%'`);

      const selectFields = [...new Set(["Id", titleField, dateField, ...possibleIdFields])].slice(0, 25);
      const soql = `SELECT ${selectFields.join(", ")} FROM ${objName} WHERE ${conditions.join(" OR ")} ORDER BY ${dateField} DESC LIMIT 100`;
      logs.push(`[Gong SF Lookup] Running SOQL: ${soql}`);

      const queryRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(soql)}`, { headers });

      if (queryRes.ok) {
        const queryData = await queryRes.json();
        const records = queryData.records || [];
        logs.push(`[Gong SF Lookup] ${objName} returned ${records.length} records.`);

        records.forEach((r: any) => {
          const callDateVal = r[dateField] || r.CreatedDate;
          const callMs = callDateVal ? new Date(callDateVal).getTime() : 0;

          if (effectiveDaysBack === 1460 || callMs === 0 || callMs >= cutoffMs) {
            const extracted = new Set<string>();

            Object.entries(r).forEach(([k, val]) => {
              if (k !== "attributes" && typeof val === "string") {
                extractGongIds(val, extracted);
              }
            });

            const urlVal = possibleIdFields.map((f) => r[f]).find((v) => typeof v === "string" && v.includes("gong.io")) || null;

            extracted.forEach((cid) => {
              callMap.set(cid, {
                callId: cid,
                title: r[titleField] || "Gong Call",
                started: callDateVal || null,
                url: urlVal,
              });
            });
          }
        });
      } else {
        logs.push(`[Gong SF Lookup] ${objName} query failed (${queryRes.status}): ${await queryRes.text()}`);
      }
    } catch (e) {
      logs.push(`[Gong SF Lookup] Error on ${objName}: ${String(e)}`);
    }
  }

  // Step 4: Query Gong Junction Objects
  const junctionObjects = ["Gong__Related_Account__c", "Gong__Related_Opportunity__c"];
  for (const jObj of junctionObjects) {
    try {
      const jDesc = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/sobjects/${jObj}/describe`, { headers });
      if (jDesc.ok) {
        const jConditions: string[] = [];
        if (accountIdClause && jObj.includes("Account")) jConditions.push(`Gong__Account__c IN (${accountIdClause})`);
        if (opportunityIdClause && jObj.includes("Opportunity")) jConditions.push(`Gong__Opportunity__c IN (${opportunityIdClause})`);
        jConditions.push(`Name LIKE '%${primaryBrandToken}%'`);

        const jSoql = `SELECT Id, Gong__Gong_Call__c, Gong__Gong_Call__r.Name, Gong__Gong_Call__r.Gong__Call_URL__c, Gong__Gong_Call__r.Gong__Call_ID__c, Gong__Gong_Call__r.Gong__Call_Start__c, CreatedDate FROM ${jObj} WHERE ${jConditions.join(" OR ")} ORDER BY CreatedDate DESC LIMIT 100`;
        logs.push(`[Gong SF Lookup] Querying ${jObj}: ${jSoql}`);

        const jRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(jSoql)}`, { headers });
        if (jRes.ok) {
          const jData = await jRes.json();
          const records = jData.records || [];
          logs.push(`[Gong SF Lookup] ${jObj} returned ${records.length} records.`);

          records.forEach((r: any) => {
            const callObj = r.Gong__Gong_Call__r;
            if (callObj) {
              const callDateVal = callObj.Gong__Call_Start__c || r.CreatedDate;
              const callMs = callDateVal ? new Date(callDateVal).getTime() : 0;

              if (effectiveDaysBack === 1460 || callMs === 0 || callMs >= cutoffMs) {
                let cid = callObj.Gong__Call_ID__c || callObj.Gong__Call_Id__c || callObj.Id;
                const u = callObj.Gong__Call_URL__c;

                if (!cid && u) {
                  const extracted = new Set<string>();
                  extractGongIds(String(u), extracted);
                  if (extracted.size > 0) cid = Array.from(extracted)[0];
                }

                if (cid) {
                  callMap.set(String(cid), {
                    callId: String(cid),
                    title: callObj.Name || "Gong Call",
                    started: callDateVal,
                    url: u || null,
                  });
                }
              }
            }
          });
        }
      }
    } catch (e) {
      logs.push(`[Gong SF Lookup] ${jObj} error: ${String(e)}`);
    }
  }

  // Step 5: Fallback Query on Task and Event Objects
  for (const stdObj of ["Task", "Event"]) {
    try {
      const taskConditions: string[] = [];
      if (accountIdClause) taskConditions.push(`AccountId IN (${accountIdClause})`);
      if (opportunityIdClause) taskConditions.push(`WhatId IN (${opportunityIdClause})`);
      taskConditions.push(`Account.Name LIKE '%${primaryBrandToken}%'`);

      const taskQuery = `SELECT Id, Subject, Description, CreatedDate FROM ${stdObj} WHERE (${taskConditions.join(" OR ")}) AND (Description LIKE '%gong.io%' OR Subject LIKE '%Gong%') ORDER BY CreatedDate DESC LIMIT 100`;
      logs.push(`[Gong SF Lookup] Running ${stdObj} SOQL: ${taskQuery}`);

      const taskRes = await fetch(`${sfAuth.instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(taskQuery)}`, { headers });

      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const records = taskData.records || [];
        logs.push(`[Gong SF Lookup] ${stdObj} returned ${records.length} records.`);

        records.forEach((r: any) => {
          const callMs = r.CreatedDate ? new Date(r.CreatedDate).getTime() : 0;
          if (effectiveDaysBack === 1460 || callMs === 0 || callMs >= cutoffMs) {
            const extracted = new Set<string>();
            extractGongIds(r.Description || "", extracted);
            extractGongIds(r.Subject || "", extracted);

            extracted.forEach((cid) => {
              if (!callMap.has(cid)) {
                callMap.set(cid, {
                  callId: cid,
                  title: r.Subject || "Gong Call",
                  started: r.CreatedDate,
                });
              }
            });
          }
        });
      }
    } catch (e) {
      logs.push(`[Gong SF Lookup] ${stdObj} error: ${String(e)}`);
    }
  }

  const results = Array.from(callMap.values());
  logs.push(`[Gong SF Lookup] Total unique Gong Call IDs identified in Salesforce for the last ${effectiveDaysBack} days: ${results.length}`);
  return results;
}

async function fetchGongTranscriptsByCallIds(callEntries: any[], authHeader: string, logs: string[] = []) {
  if (!callEntries || callEntries.length === 0) {
    logs.push("[Gong API] Skipped transcript fetch — 0 Call IDs provided.");
    return [];
  }

  const callIdMap = new Map<string, any>();
  callEntries.forEach((c) => callIdMap.set(String(c.callId), c));

  const uniqueCallIds = Array.from(callIdMap.keys()).slice(0, MAX_CALLS_TO_PROCESS);
  logs.push(`[Gong API] Fetching full transcripts for ${uniqueCallIds.length} Call ID(s)...`);

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
        body: JSON.stringify({ filter: { callIds: batch } }),
      });

      if (!transRes.ok) {
        logs.push(`[Gong API] Transcript fetch failed (${transRes.status}): ${await transRes.text()}`);
        return [];
      }

      const transData = await transRes.json();
      return Array.isArray(transData.callTranscripts) ? transData.callTranscripts : [];
    })
  );

  const gongTranscripts: any[] = [];
  for (const batch of transcriptResults) {
    gongTranscripts.push(...batch);
  }

  logs.push(`[Gong API] Received ${gongTranscripts.length} transcript payload(s).`);

  return gongTranscripts.map((t: any) => {
    const meta = callIdMap.get(String(t.callId));
    return {
      ...t,
      title: meta?.title || "Untitled Gong Call",
      started: meta?.started || null,
      url: meta?.url || null,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const debugLogs: string[] = [];

  try {
    const { accountName: rawAccountName, daysBack = 180 } = await req.json();
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
    const effectiveDaysBack = Math.min(Number(daysBack) || 180, MAX_GONG_SEARCH_DAYS);

    debugLogs.push(`[Init] Search target: "${accountName}" (Normalized: "${normalizedAccountName}", DaysBack: ${effectiveDaysBack})`);

    if (!accountName || typeof accountName !== "string") {
      return new Response(
        JSON.stringify({ error: "accountName is required", debugLogs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
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

    if (sfAuth?.error) {
      debugLogs.push(`[SF Auth] Error: ${sfAuth.error}`);
    } else {
      debugLogs.push(`[SF Auth] Authenticated with ${sfAuth.instanceUrl}`);
    }

    const cases = await fetchSalesforceCases(supabase, normalizedAccountName, sfAuth, debugLogs);
    const ebstaData = await fetchEbstaData(normalizedAccountName, sfAuth, effectiveDaysBack, debugLogs);

    // 1. Extract Gong Call IDs strictly within the selected daysBack timeframe
    const sfGongCallEntries = await fetchGongCallIdsFromSalesforce(normalizedAccountName, sfAuth, effectiveDaysBack, debugLogs);

    let gongTranscripts: any[] = [];
    let debugGongStatus: number | null = null;
    let debugGongError = "";

    // 2. Fetch full speaker transcripts from Gong API
    if (gongAccessKey && gongSecretKey) {
      if (sfGongCallEntries.length > 0) {
        const authHeader = "Basic " + btoa(`${gongAccessKey}:${gongSecretKey}`);
        gongTranscripts = await fetchGongTranscriptsByCallIds(sfGongCallEntries, authHeader, debugLogs);
      } else {
        debugLogs.push("[Gong API] Skipped transcript fetch — 0 Call IDs found in Salesforce for this timeframe.");
      }
    } else {
      debugLogs.push("[Gong API] Missing Gong credentials in environment secrets.");
    }

    debugLogs.forEach((l) => console.log(l));

    return new Response(
      JSON.stringify({
        accountName,
        daysBack: effectiveDaysBack,
        supportCaseCount: cases?.length || 0,
        gongCallCount: gongTranscripts.length,
        transcriptCount: gongTranscripts.length,
        gongHttpStatus: debugGongStatus,
        gongErrorMessage: debugGongError,
        debugLogs,
        cases: cases || [],
        salesforceCases: cases || [],
        transcripts: gongTranscripts,
        gongData: gongTranscripts,
        ebstaData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("Briefcase Edge Function Error:", err);
    debugLogs.push(`[Fatal Error] ${err?.message || String(err)}`);

    return new Response(
      JSON.stringify({
        error: err?.message || "Unknown error",
        debugLogs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});