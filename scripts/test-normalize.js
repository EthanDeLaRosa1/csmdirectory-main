// Quick smoke test for normalization and domain extraction
function normalizeAccountName(name) {
  if (!name) return "";
  let n = String(name || "").trim();
  if (n.includes("@")) {
    n = n.split("@")[0];
  }
  n = n.replace(/[.,]/g, " ");
  n = n.replace(/\b(inc|inc\.|llc|corp|corporation|co\.|ltd|pty)\b/gi, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function extractDomainFromQuery(query) {
  if (!query) return null;
  const q = query.trim();
  if (q.includes("@")) {
    const parts = q.split("@");
    return parts[1]?.toLowerCase() || null;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q)) return q.toLowerCase();
  return null;
}

const tests = [
  "YPO Inc",
  "YPO, Inc.",
  "YPO.org",
  "john@ypo.org",
  "Example LLC.",
  "Acme Co.",
  "Acme Pty.",
  "Big-External.example.com",
  "Some.Company, Inc.",
  "  Acme, LLC  ",
];

for (const t of tests) {
  console.log('Input:', t);
  console.log('  Normalized:', normalizeAccountName(t));
  console.log('  Domain:', extractDomainFromQuery(t));
  console.log('');
}
