// Dependency-free SVG charts (no external libs).

export function BarChart({
  data,
  height = 180,
  color = "#6ea8fe",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return <div className="empty">No data.</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barchart" style={{ maxHeight: height, overflowY: "auto" }}>
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <div className="bar-label" title={d.label}>{d.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <div className="bar-value">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

const PALETTE = ["#6ea8fe", "#a371f7", "#3fd07a", "#d29922", "#f85149", "#5bc8d6", "#e06fb0", "#8b98a5", "#b0c94e", "#f0883e"];

export function PieChart({ data, size = 220 }: { data: { label: string; value: number }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4, ir = r * 0.55;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const start = (acc / total) * 2 * Math.PI; acc += d.value; const end = (acc / total) * 2 * Math.PI;
    const large = end - start > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => [cx + rad * Math.sin(ang), cy - rad * Math.cos(ang)];
    const [x1, y1] = p(start, r), [x2, y2] = p(end, r), [xi2, yi2] = p(end, ir), [xi1, yi1] = p(start, ir);
    return {
      d: `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${ir},${ir} 0 ${large} 0 ${xi1},${yi1} Z`,
      color: PALETTE[i % PALETTE.length], label: d.label, value: d.value, pct: (d.value / total) * 100,
    };
  });
  if (data.length === 0) return <div className="empty">No data.</div>;
  return (
    <div className="pie-wrap">
      <svg width={size} height={size}>{arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />)}</svg>
      <div className="pie-legend">
        {arcs.map((a, i) => (
          <div className="pie-leg" key={i}><span style={{ background: a.color }} />{a.label} <em>{a.value.toLocaleString()} ({a.pct.toFixed(0)}%)</em></div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ data, height = 200, color = "#6ea8fe" }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  if (data.length === 0) return <div className="empty">No data.</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = Math.max(320, data.length * 46);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (w - 50) + 30;
    const y = height - 26 - (d.value / max) * (height - 46);
    return { x, y, d };
  });
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={w} height={height}>
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} />
            <text x={p.x} y={p.y - 8} fontSize={9} textAnchor="middle" fill="#e6edf3">{p.d.value.toLocaleString()}</text>
            <text x={p.x} y={height - 6} fontSize={9} textAnchor="middle" fill="#8b98a5">{p.d.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ColumnChart({
  data,
  height = 160,
  color = "#a371f7",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return <div className="empty">No time data.</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="colchart" style={{ height }}>
      {data.map((d, i) => (
        <div className="col-item" key={i} title={`${d.label}: ${d.value}`}>
          <div className="col-bar-wrap">
            <div className="col-bar" style={{ height: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <div className="col-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
