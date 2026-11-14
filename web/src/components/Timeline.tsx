import { DAY, SUNLIT, Site, Visibility, fmtDate } from "../model";

const W = 1000;
const LABEL = 170;
const ROW = 13;
const GAP = 10;

type Row = { site: Site; vis: Visibility };
type Props = { rows: Row[]; i0: number; hours: number; cursor: number; landing: number; onCursor: (i: number) => void };

function runs(n: number, value: (i: number) => number) {
  const out: { start: number; len: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = value(i);
    const last = out[out.length - 1];
    if (last && last.v === v) last.len++;
    else out.push({ start: i, len: 1, v });
  }
  return out;
}

export default function Timeline({ rows, i0, hours, cursor, landing, onCursor }: Props) {
  const plotW = W - LABEL - 8;
  const x = (h: number) => LABEL + (h / hours) * plotW;
  const blockH = 2 * ROW + GAP;
  const H = rows.length * blockH + 22;
  const days = Math.round(hours / 24);
  const dayStep = days > 20 ? 5 : days > 10 ? 2 : 1;

  function onClick(ev: React.MouseEvent<SVGSVGElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    if (px >= LABEL) onCursor(i0 + Math.floor(((px - LABEL) / plotW) * hours));
  }

  return (
    <figure className="panel">
      <figcaption>
        <strong>Mission timeline</strong>
        <span className="muted"> · click to move the time cursor</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline" onClick={onClick}>
        {rows.map(({ site, vis }, r) => {
          const top = r * blockH;
          const sun = runs(hours, (h) => (vis.sunFrac[i0 + h] >= SUNLIT ? 2 : vis.sunFrac[i0 + h] > 0 ? 1 : 0));
          const earth = runs(hours, (h) => vis.earth[i0 + h]);
          return (
            <g key={site.id}>
              <text x={0} y={top + ROW - 2} className="tl-label">{site.name}</text>
              <text x={LABEL - 6} y={top + ROW - 2} className="tick" textAnchor="end">Sun</text>
              <text x={LABEL - 6} y={top + 2 * ROW - 2} className="tick" textAnchor="end">Earth</text>
              {sun.map((s) => (
                <rect key={`s${s.start}`} x={x(s.start)} y={top} width={x(s.start + s.len) - x(s.start)} height={ROW - 1}
                  className={s.v === 2 ? "seg sun" : s.v === 1 ? "seg sun part" : "seg dark"} />
              ))}
              {earth.map((s) => (
                <rect key={`e${s.start}`} x={x(s.start)} y={top + ROW} width={x(s.start + s.len) - x(s.start)} height={ROW - 1}
                  className={s.v ? "seg earth" : "seg dark"} />
              ))}
            </g>
          );
        })}
        {Array.from({ length: Math.floor(days / dayStep) + 1 }, (_, k) => k * dayStep).map((d) => (
          <g key={d}>
            <line x1={x(d * 24)} x2={x(d * 24)} y1={0} y2={H - 18} className="grid" />
            <text x={x(d * 24)} y={H - 4} className="tick" textAnchor="middle">
              {d === 0 ? fmtDate(landing) : `+${d}d`}
            </text>
          </g>
        ))}
        <line x1={x(cursor - i0)} x2={x(cursor - i0)} y1={0} y2={H - 18} className="cursor" />
      </svg>
      <div className="pano-foot">
        <span><i className="sw sun" /> sunlit (≥50% of disk)</span>
        <span><i className="sw sunpart" /> Sun partly behind terrain</span>
        <span><i className="sw earth" /> Earth in view</span>
        <span><i className="sw dark" /> blocked</span>
        <span className="muted">Landing {fmtDate(landing)} 00:00 UTC; window {Math.round(hours / 24)} days ({fmtDate(landing + hours / 24 * DAY)})</span>
      </div>
    </figure>
  );
}
