import { Criteria, Site, Visibility, batteryRun, fmtHours, score, windowStats } from "../model";

type Props = { rows: { site: Site; vis: Visibility }[]; i0: number; crit: Criteria; focus: string; onFocus: (id: string) => void };

export default function CompareCards({ rows, i0, crit, focus, onFocus }: Props) {
  const hours = crit.durationDays * 24;
  return (
    <div className="cards">
      {rows.map(({ site, vis }) => {
        if (i0 < 0 || i0 + hours > site.n) {
          return <div key={site.id} className="card">{site.name}: no data for this date</div>;
        }
        const s = windowStats(vis, i0, hours);
        const bat = batteryRun(vis, i0, hours, crit.power);
        const ok = score(s, crit) >= 1 && bat.emptyH === null;
        return (
          <button key={site.id} className={`card ${site.id === focus ? "focus" : ""}`} onClick={() => onFocus(site.id)}>
            <div className="card-head">
              <span>{site.name}</span>
              <span className={ok ? "badge pass" : "badge fail"}>{ok ? "Good" : "Not good"}</span>
            </div>
            <dl>
              <dt>Sunlight</dt><dd>{s.sunPct.toFixed(0)}%</dd>
              <dt>Earth contact</dt><dd>{s.earthPct.toFixed(0)}%</dd>
              <dt>Both at once</dt><dd>{s.bothPct.toFixed(0)}%</dd>
              <dt>Sun after landing</dt><dd>{fmtHours(s.firstDarkH)}</dd>
              <dt>Longest darkness</dt><dd>{fmtHours(s.longestDarkH)}</dd>
              <dt>Longest without Earth</dt><dd>{fmtHours(s.longestNoEarthH)}</dd>
              <dt>Battery</dt><dd>{bat.emptyH === null ? "lasts" : "runs out"}</dd>
            </dl>
            <div className="muted small">
              {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°E · {site.height_m === null ? "no terrain data" : `${Math.round(site.height_m)} m`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
