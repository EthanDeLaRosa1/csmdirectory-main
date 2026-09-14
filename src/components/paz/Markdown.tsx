import { type ReactNode } from "react";

// Minimal, dependency-free markdown renderer for Tango AI reports.
// Supports: ## / ### headings, **bold**, - bullets, and | pipe tables.

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table: a header row followed by a separator row of dashes.
    if (line.trim().startsWith("|") && lines[i + 1]?.includes("--")) {
      const cells = (row: string) => row.split("|").slice(1, -1).map((c) => c.trim());
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      blocks.push(
        <div className="md-table-wrap my-4 overflow-x-auto rounded-lg border border-border bg-card/40" key={key++}>
          <table className="md-table min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className="border-b border-r border-border bg-muted/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground last:border-r-0">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="align-top">
                  {header.map((_, ci) => (
                    <td key={ci} className="border-b border-r border-border px-3 py-2 text-sm text-foreground last:border-r-0">
                      {inline((r[ci] ?? "").trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(<h4 className="md-h4" key={key++}>{inline(line.slice(4))}</h4>);
      i += 1; continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(<h3 className="md-h3" key={key++}>{inline(line.slice(3))}</h3>);
      i += 1; continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2)); i += 1;
      }
      blocks.push(<ul className="md-ul" key={key++}>{items.map((it, ii) => <li key={ii}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (line.trim() === "") { i += 1; continue; }

    blocks.push(<p className="md-p" key={key++}>{inline(line)}</p>);
    i += 1;
  }

  return <div className="md">{blocks}</div>;
}
