// One-page mission brief, shown only when printing (Print brief button in the verdict).
import { Criteria, Site, Visibility, batteryRun, fmtDay, fmtHours, goodSitesAt, hourIndex, nearestGoodShift, windowStats, DAY } from "../model";

type Props = { site: Site; sites: Site[]; vis: Record<string, Visibility>; landing: number; crit: Criteria; mast: string; frame: string };

export default function Brief({ site, sites, vis, landing, crit, mast, frame }: Props) {
  const v = vis[site.id];
  const hours = crit.durationDays * 24;
  const i0 = hourIndex(site, landing);
  if (i0 < 0 || i0 + hours > site.n) return null;
  const s = windowStats(v, i0, hours);
  const bat = batteryRun(v, i0, hours, crit.power);
  const ok = s.sunPct >= crit.minSunPct && s.earthPct >= crit.minEarthPct && bat.emptyH === null;
  const shift = ok ? null : nearestGoodShift(site, v, landing, crit);
  const others = goodSitesAt(sites.filter((x) => x.id !== site.id), vis, landing, crit).slice(0, 3);
  const rows: [string, string, string][] = [
    ["Sunlight (≥ half the Sun's disk visible)", `${s.sunPct.toFixed(1)}% of mission`, `need ${crit.minSunPct}%`],
    ["Earth in view (direct radio link)", `${s.earthPct.toFixed(1)}% of mission`, `need ${crit.minEarthPct}%`],
    ["Sunlight and Earth at once", `${s.bothPct.toFixed(1)}%`, ""],
    ["Battery low point", bat.emptyH === null ? `${bat.minPct.toFixed(0)}%` : `runs flat after ${fmtHours(bat.emptyH)}`, "must stay above 0%"],
    ["Sun stays up after landing", s.firstDarkH >= hours ? "whole mission" : fmtHours(s.firstDarkH), ""],
    ["Longest darkness", s.longestDarkH ? fmtHours(s.longestDarkH) : "none", ""],
    ["Longest radio blackout", s.longestNoEarthH ? fmtHours(s.longestNoEarthH) : "none", ""],
  ];
  return (
    <section className="brief" aria-hidden="true">
      <div className="brief-head">
        <div>
          <div className="brief-kicker">HORIZON mission brief</div>
          <h1>{site.name}</h1>
          <div>{site.lat.toFixed(4)}°, {site.lon.toFixed(4)}°E{site.height_m !== null ? ` · ${Math.round(site.height_m)} m above the 1737.4 km reference sphere` : ""}</div>
        </div>
        <div className={`brief-verdict ${ok ? "go" : "nogo"}`}>{ok ? "GO" : "NO-GO"}</div>
      </div>
      <p>
        Landing {new Date(landing).toISOString().slice(0, 16).replace("T", " ")} UTC, {crit.durationDays}-day surface mission, solar array and antenna at {mast}.
        Power system: {crit.power.arrayW} W array, {crit.power.loadW} W load, {crit.power.batteryWh} Wh battery.
      </p>
      <table>
        <tbody>{rows.map(([a, b, c]) => <tr key={a}><td>{a}</td><td><strong>{b}</strong></td><td>{c}</td></tr>)}</tbody>
      </table>
      {(shift !== null || others.length > 0) && (
        <>
          <h2>Alternatives</h2>
          <ul>
            {shift !== null && <li>Same site, land {fmtDay(landing + shift * DAY)} ({shift > 0 ? "+" : ""}{shift} days): GO</li>}
            {others.map(({ site: o, e }) => <li key={o.id}>{o.name}, same date: GO (sunlight {e!.sunPct.toFixed(0)}%, Earth {e!.earthPct.toFixed(0)}%)</li>)}
          </ul>
        </>
      )}
      <h2>Method and data</h2>
      <p>
        Terrain horizon from NASA LRO LOLA polar DEMs (20–240 m/pixel), ray-marched to 300 km in 720 directions. Sun and Earth
        positions from JPL DE440 via NAIF SPICE ({frame}), hourly; checked against JPL Horizons and NASA GSFC average-illumination maps.
        Site placement: {site.placement}. Illustrative coordinates, not official landing sites.
      </p>
      <p className="brief-foot">Generated {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · {location.href}</p>
    </section>
  );
}
