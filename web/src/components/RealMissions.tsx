// Real south-polar landings replayed through HORIZON: what the terrain + ephemeris model says
// about the Sun and Earth at each lander's published site, next to what actually happened.
import { HOUR, MissionMeta, Power, SUNLIT, Site, Visibility, batteryRun, fmtDay, fmtHours } from "../model";

type Props = {
  missions: MissionMeta[];
  sites: Record<string, Site>;
  vis: Record<string, Visibility>;
  power: Power;
  onWatch: (id: string) => void;
};

const W = 600;
const ROW = 12;

const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function transitions(v: Visibility, hours: number) {
  const out: { i: number; kind: "sunset" | "sunrise" }[] = [];
  for (let i = 1; i < hours; i++) {
    const a = v.sunFrac[i - 1] >= SUNLIT;
    const b = v.sunFrac[i] >= SUNLIT;
    if (a !== b) out.push({ i, kind: b ? "sunrise" : "sunset" });
  }
  return out;
}

function Strip({ site, v, hours, events }: { site: Site; v: Visibility; hours: number; events: { i: number; n: number }[] }) {
  const x = (h: number) => (h / hours) * W;
  const segs = (val: (i: number) => number) => {
    const out: { s: number; e: number; v: number }[] = [];
    for (let i = 0; i < hours; i++) {
      const k = val(i);
      const last = out[out.length - 1];
      if (last && last.v === k) last.e = i + 1;
      else out.push({ s: i, e: i + 1, v: k });
    }
    return out;
  };
  const sun = segs((i) => (v.sunFrac[i] >= SUNLIT ? 2 : v.sunFrac[i] > 0 ? 1 : 0));
  const earth = segs((i) => v.earth[i]);
  const days = hours / 24;
  const step = days > 20 ? 5 : days > 6 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${2 * ROW + 30}`} className="mstrip" role="img" aria-label={`Sun and Earth after landing at ${site.name}`}>
      {sun.map((s) => <rect key={`s${s.s}`} x={x(s.s)} y={0} width={x(s.e) - x(s.s)} height={ROW - 1} className={s.v === 2 ? "seg sun" : s.v === 1 ? "seg sun part" : "seg dark"} />)}
      {earth.map((s) => <rect key={`e${s.s}`} x={x(s.s)} y={ROW} width={x(s.e) - x(s.s)} height={ROW - 1} className={s.v ? "seg earth" : "seg dark"} />)}
      {Array.from({ length: Math.floor(days / step) + 1 }, (_, k) => k * step).map((d) => (
        <text key={d} x={Math.min(x(d * 24), W - 14)} y={2 * ROW + 12} className="tick" textAnchor={d === 0 ? "start" : "middle"}>
          {d === 0 ? "landing" : `+${d}d`}
        </text>
      ))}
      {events.map((e) => (
        <g key={e.n}>
          <line x1={x(e.i)} x2={x(e.i)} y1={-2} y2={2 * ROW + 2} className="ev-line" />
          <circle cx={x(e.i)} cy={2 * ROW + 20} r={7} className="ev-dot" />
          <text x={x(e.i)} y={2 * ROW + 23.5} className="ev-num" textAnchor="middle">{e.n}</text>
        </g>
      ))}
    </svg>
  );
}

export default function RealMissions({ missions, sites, vis, power, onWatch }: Props) {
  if (!missions.length) return null;
  return (
    <section className="panel" id="missions">
      <div className="section-head">
        <h2>Real landings, replayed</h2>
        <span className="muted">
          Three landers near the south pole, checked at their published coordinates and landing times.
        </span>
      </div>
      <div className="missions">
        {missions.map((m) => {
          const site = sites[m.id];
          const v = vis[m.id];
          if (!site || !v) return null;
          const hours = Math.min(m.view_days * 24, site.n);
          const t0 = site.t0;
          const tr = transitions(v, site.n);
          const firstSet = tr.find((t) => t.kind === "sunset");
          const nextRise = firstSet && tr.find((t) => t.kind === "sunrise" && t.i > firstSet.i);
          const evs = m.events.map((e, k) => ({ ...e, n: k + 1, i: Math.round((Date.parse(e.t) - t0) / HOUR) }));
          const night = firstSet && nextRise ? nextRise.i - firstSet.i : null;
          const bat = firstSet ? batteryRun(v, firstSet.i, Math.min(site.n - firstSet.i, 30 * 24), power) : null;
          const crater = m.crater_m;
          let elMin = 90, elMax = -90;
          const lastEv = Math.max(...evs.map((e) => e.i), 1);
          for (let i = 0; i <= Math.min(lastEv, site.n - 1); i++) { elMin = Math.min(elMin, site.sunEl[i]); elMax = Math.max(elMax, site.sunEl[i]); }
          return (
            <article key={m.id} className="mission">
              <header>
                <div>
                  <div className="mission-name">{m.name}</div>
                  <div className="muted small">{m.agency} · landed {utc(Date.parse(m.landed))} · {Math.abs(m.lat).toFixed(2)}°S, {m.lon.toFixed(2)}°E</div>
                </div>
                <button className="btn ghost small-btn" onClick={() => onWatch(m.id)}>Watch in 3D</button>
              </header>
              <p className="mission-outcome"><strong>What happened:</strong> {m.outcome}</p>
              <Strip site={site} v={v} hours={hours} events={evs.filter((e) => e.i >= 0 && e.i <= hours)} />
              <table className="mtable">
                <thead><tr><th>Real event</th><th>HORIZON's replay</th></tr></thead>
                <tbody>
                  {evs.map((e) => {
                    const near = tr.reduce<{ i: number; kind: string } | null>((b, t) => (!b || Math.abs(t.i - e.i) < Math.abs(b.i - e.i) ? t : b), null);
                    const dDays = near ? (near.i - e.i) / 24 : 0;
                    const same = near && new Date(t0 + near.i * HOUR).toISOString().slice(0, 10) === e.t.slice(0, 10);
                    return (
                      <tr key={e.n}>
                        <td><span className="ev-badge">{e.n}</span> {fmtDay(Date.parse(e.t))}{e.date_only ? "" : `, ${utc(Date.parse(e.t)).slice(11)}`}: {e.label}</td>
                        <td>
                          {crater
                            ? `The Sun was only ${elMin.toFixed(1)}–${elMax.toFixed(1)}° up. The mountains allowed ${firstSet ? fmtHours(firstSet.i) : "the whole window"} of sunlight, but at ${elMin.toFixed(1)}° a ${(crater * Math.tan(elMin * Math.PI / 180)).toFixed(1)} m wall ${crater} m away blocks it. The lander sat in a ${crater} m crater.`
                            : near && Math.abs(dDays) <= 3.5
                              ? `${near.kind === "sunset" ? "Sunset" : "Sunrise"} at ${utc(t0 + near.i * HOUR)} ${same ? "(same day)" : `(${Math.abs(dDays).toFixed(1)} days ${dDays > 0 ? "after" : "before"})`}. Sun ${site.sunEl[Math.max(0, Math.min(e.i, site.n - 1))].toFixed(1)}° up.`
                              : `No sunset or sunrise within 3 days; Sun ${site.sunEl[Math.max(0, Math.min(e.i, site.n - 1))].toFixed(1)}° up.`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!crater && night !== null && bat && (
                <p className="small mission-lesson">
                  Night here lasts <strong>{(night / 24).toFixed(1)} days</strong>. A small lander battery (
                  {power.batteryWh} Wh at {power.loadW} W) {bat.emptyH !== null ? <>runs flat <strong>{fmtHours(bat.emptyH)}</strong> after sunset</> : "survives"},
                  so a mission longer than {firstSet ? fmtHours(firstSet.i) : ""} needs to survive the night.
                </p>
              )}
              {crater && (
                <p className="small mission-lesson">
                  HORIZON's terrain is 40 m per pixel, so it can't see a {crater} m crater. It does show how low the Sun is, and so how
                  small an obstacle is enough to end a mission.
                </p>
              )}
              <div className="muted small">
                Sources: {m.sources.map((s, k) => <span key={s.url}>{k > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted small">
        Event dates are from mission operators and press reports. Sunset means less than half the Sun's disk is above the terrain,
        0.5 m above the published coordinates. Landers that tipped over or missed their target saw a different sky. Japan's SLIM
        (2024) is left out: its problem was panel orientation, which HORIZON doesn't model.
      </p>
    </section>
  );
}

