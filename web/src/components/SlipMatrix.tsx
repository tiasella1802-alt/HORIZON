import { Criteria, DAY, Site, Visibility, evaluate, fmtDate, fmtHours } from "../model";

const SLIPS = Array.from({ length: 61 }, (_, k) => k - 30);

type Props = {
  sites: Site[];
  vis: Record<string, Visibility>;
  baseDate: number;
  slip: number;
  focus: string;
  crit: Criteria;
  onPick: (siteId: string, slip: number) => void;
};

// Colorblind-safe on a dark panel: good days are green; failing days run from dark grey (far off) to
// muted amber (close), so lightness alone separates them.
function color(s: number) {
  if (s >= 1) return "var(--pass)";
  const t = Math.max(0, Math.min(1, s)) ** 2;
  const r = Math.round(50 + (176 - 50) * t);
  const g = Math.round(48 + (132 - 48) * t);
  const b = Math.round(44 + (52 - 44) * t);
  return `rgb(${r},${g},${b})`;
}

export default function SlipMatrix({ sites, vis, baseDate, slip, focus, crit, onPick }: Props) {
  return (
    <figure className="panel">
      <figcaption className="muted">
        Rows are sites, columns are landing days, a month either side. <strong className="pass-text">Green is good</strong>;
        amber is close, grey is far off. Click a square to try it.
      </figcaption>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {SLIPS.map((d) => (
                <th key={d} className={d === slip ? "cur" : ""}>
                  {d % 5 === 0 ? (d > 0 ? `+${d}` : d) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const v = vis[site.id];
              return (
                <tr key={site.id} className={site.id === focus ? "focus" : ""}>
                  <th>{site.name}</th>
                  {SLIPS.map((d) => {
                    const t = baseDate + d * DAY;
                    const q = evaluate(site, v, t, crit);
                    if (!q) return <td key={d} className="na" />;
                    return (
                      <td key={d} style={{ background: color(q.score) }} className={d === slip ? "cur" : ""}
                        title={`${site.name}, land ${fmtDate(t)}\nSunlit ${q.sunPct.toFixed(0)}% · Earth ${q.earthPct.toFixed(0)}%\n` +
                          `Uninterrupted sun after landing: ${fmtHours(q.firstDarkH)}\n` +
                          (q.battery.emptyH === null ? `Battery low point: ${q.battery.minPct.toFixed(0)}%` : `Battery runs flat after ${fmtHours(q.battery.emptyH)}`)}
                        onClick={() => onPick(site.id, d)} />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pano-foot">
        <span>Days late (+) or early (−) compared with {fmtDate(baseDate)} · outlined = your current plan</span>
        <span><i className="sw" style={{ background: "var(--pass)" }} /> good</span>
        <span><i className="sw" style={{ background: color(0.9) }} /> almost</span>
        <span><i className="sw" style={{ background: color(0) }} /> bad</span>
      </div>
    </figure>
  );
}
