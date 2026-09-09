import { useState } from "react";

const RANGES = [
  { label: "180 days", value: 180 },
  { label: "1 year", value: 365 },
  { label: "2 years", value: 730 },
  { label: "4 years", value: 1460 },
];

export function CollectForm({
  onCollect,
  loading,
}: {
  onCollect: (accountName: string, daysBack: number) => void;
  loading: boolean;
}) {
  const [account, setAccount] = useState("");
  const [daysBack, setDaysBack] = useState(365);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = account.trim();
    if (name.length < 2) return;
    onCollect(name, daysBack);
  }

  return (
    <form className="card collect-form" onSubmit={submit}>
      <h2 className="card-title">Collect account data</h2>
      <label className="field">
        <span>Account name</span>
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="e.g. Acme Corp"
          disabled={loading}
          autoFocus
        />
      </label>
      <label className="field">
        <span>Lookback window</span>
        <div className="range-row">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`chip ${daysBack === r.value ? "chip-on" : ""}`}
              onClick={() => setDaysBack(r.value)}
              disabled={loading}
            >
              {r.label}
            </button>
          ))}
        </div>
      </label>
      <button className="btn-primary" type="submit" disabled={loading || account.trim().length < 2}>
        {loading ? "Collecting…" : "Collect"}
      </button>
    </form>
  );
}
