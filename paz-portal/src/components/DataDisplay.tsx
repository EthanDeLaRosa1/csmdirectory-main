import { useState } from "react";
import type { BriefcaseResult, GongTranscript } from "../lib/api";

function transcriptText(t: GongTranscript): string {
  if (!Array.isArray(t.transcript)) return "";
  return t.transcript
    .flatMap((seg) => (seg.sentences || []).map((s) => s.text || ""))
    .filter(Boolean)
    .join(" ");
}

export function DataDisplay({ result }: { result: BriefcaseResult }) {
  const [tab, setTab] = useState<"cases" | "ebsta" | "gong">("cases");
  const ebsta = result.ebstaData;

  return (
    <div className="card">
      <div className="stat-row">
        <Stat label="Support cases" value={result.supportCaseCount} />
        <Stat label="Gong calls" value={result.gongCallCount} />
        <Stat label="Transcripts" value={result.transcriptCount} />
        <Stat label="EBSTA score" value={ebsta?.score ?? "—"} />
      </div>

      {result.autoDomains.length > 0 && (
        <div className="domains">
          {result.autoDomains.map((d) => (
            <span key={d} className="domain-tag">{d}</span>
          ))}
        </div>
      )}

      {result.gongErrorMessage && (
        <div className="warn-inline">Gong: {result.gongErrorMessage} (status {result.gongHttpStatus ?? "?"})</div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === "cases" ? "tab-on" : ""}`} onClick={() => setTab("cases")}>
          Cases ({result.cases.length})
        </button>
        <button className={`tab ${tab === "ebsta" ? "tab-on" : ""}`} onClick={() => setTab("ebsta")}>
          EBSTA
        </button>
        <button className={`tab ${tab === "gong" ? "tab-on" : ""}`} onClick={() => setTab("gong")}>
          Gong ({result.transcripts.length})
        </button>
      </div>

      {tab === "cases" && (
        <div className="list">
          {result.cases.length === 0 && <Empty>No support cases found.</Empty>}
          {result.cases.map((c, i) => (
            <div className="item" key={c.case_number || i}>
              <div className="item-head">
                <strong>{c.case_number || "—"}</strong>
                <span className={`badge badge-${(c.status || "").toLowerCase().includes("closed") ? "muted" : "live"}`}>
                  {c.status || "N/A"}
                </span>
              </div>
              <div className="item-title">{c.subject}</div>
              <div className="item-desc">{c.description}</div>
              <div className="item-meta">
                {c.case_owner} · {c.contact_email} · {c.date_opened}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "ebsta" && (
        <div className="list">
          {!ebsta && <Empty>No EBSTA data (Salesforce connection may be inactive).</Empty>}
          {ebsta && (
            <>
              <SubHead>Contacts</SubHead>
              {ebsta.contacts.length === 0 && <Empty>None.</Empty>}
              {ebsta.contacts.map((c) => (
                <div className="row-line" key={c.name}>
                  <span>{c.name} <em>{c.title}</em></span>
                  <span className="score">{c.score}</span>
                </div>
              ))}
              <SubHead>Opportunities</SubHead>
              {ebsta.opportunities.length === 0 && <Empty>None.</Empty>}
              {ebsta.opportunities.map((o) => (
                <div className="row-line" key={o.name}>
                  <span>{o.name} <em>{o.stage}</em></span>
                  <span className="score">{o.score}</span>
                </div>
              ))}
              <SubHead>Recent emails ({ebsta.emails.length})</SubHead>
              {ebsta.emails.slice(0, 8).map((e) => (
                <div className="item" key={e.id}>
                  <div className="item-title">{e.subject}</div>
                  <div className="item-meta">{e.from} → {e.to}</div>
                  <div className="item-desc">{e.body.slice(0, 240)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "gong" && (
        <div className="list">
          {result.transcripts.length === 0 && <Empty>No Gong transcripts matched.</Empty>}
          {result.transcripts.map((t, i) => {
            const text = transcriptText(t);
            return (
              <div className="item" key={t.callId || i}>
                <div className="item-title">{t.title || "Untitled call"}</div>
                <div className="item-meta">{(t.parties || []).join(", ")}</div>
                <div className="item-desc">{text.slice(0, 400) || "(no transcript text)"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="subhead">{children}</div>;
}
