import { useState } from "react";
import { askTangoAI, type BriefcaseResult, type ResearchResult } from "../lib/api";

const SUGGESTIONS = [
  "Summarize the account health and top risks.",
  "What are the open support themes?",
  "Draft talking points for the next QBR.",
  "Which contacts are most engaged and why?",
];

export function ResearchPanel({ context }: { context: BriefcaseResult | null }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!context) return;
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const res = await askTangoAI(trimmed, context);
      setAnswer(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card research">
      <h2 className="card-title">
        <span className="ai-dot" /> Tango AI Research
      </h2>

      {!context && <div className="empty">Collect an account first, then ask Tango AI about it.</div>}

      {context && (
        <>
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="suggest" onClick={() => { setQuestion(s); ask(s); }} disabled={loading}>
                {s}
              </button>
            ))}
          </div>

          <form
            className="ask-row"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Ask about ${context.accountName}…`}
              disabled={loading}
            />
            <button className="btn-primary" disabled={loading || question.trim().length < 3}>
              {loading ? "…" : "Ask"}
            </button>
          </form>

          {error && <div className="error-banner">⚠ {error}</div>}

          {answer && (
            <div className="answer">
              <p className="answer-text">{answer.answer}</p>
              {answer.highlights?.length > 0 && (
                <ul className="highlights">
                  {answer.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
