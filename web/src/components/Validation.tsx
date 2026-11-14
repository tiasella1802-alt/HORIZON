import { useEffect, useState } from "react";

type Row = { site: string; time: string; body: string; ours_az: number; ours_el: number; jpl_az: number; jpl_el: number; d_az: number; d_el: number };
type ValidationFile = { reference: string; window: string; summary: { max_abs_d_el: number; max_abs_d_az: number; rms_d_el: number; n: number }; rows: Row[] };

const deg = (x: number) => (x < 0.001 ? `${x.toFixed(6)}°` : `${x.toFixed(3)}°`);

type CustomFile = {
  sites_with_tiles: number; median_abs_sun_diff_pts: number; median_abs_earth_diff_pts: number;
  median_verdict_agreement_pct: number; min_verdict_agreement_pct: number;
  outside_tiles: { site: string; verdict_agreement_pct: number };
  worst_earth_case: { site: string; full: number; browser: number; why: string };
};

type IllumRow ={ name: string; site: boolean; ours_sun: number; nasa_sun: number; ours_earth: number; nasa_earth: number };
type Stats = { r: number; median_abs_diff: number; mean_diff: number; p90_abs_diff: number; n: number };
type IllumFile = { window: string; definition: string; summary: { sun: Stats; earth: Stats }; rows: IllumRow[] };

// Ours vs NASA GSFC, one dot per location; points on the diagonal agree exactly.
function Scatter({ rows, body }: { rows: IllumRow[]; body: "sun" | "earth" }) {
  const S = 260, P = 34;
  const x = (f: number) => P + f * (S - P - 8);
  const y = (f: number) => S - P + 8 - f * (S - P - 8) - 8;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const ours = (r: IllumRow) => (body === "sun" ? r.ours_sun : r.ours_earth);
  const nasa = (r: IllumRow) => (body === "sun" ? r.nasa_sun : r.nasa_earth);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="scatter" role="img"
      aria-label={`HORIZON versus NASA average ${body === "sun" ? "sunlight" : "Earth visibility"}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} className="grid" />
          <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} className="grid" />
          <text x={x(t)} y={y(0) + 13} className="tick" textAnchor="middle">{t * 100}%</text>
          <text x={x(0) - 4} y={y(t) + 3} className="tick" textAnchor="end">{t * 100}</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="diag" />
      {rows.filter((r) => !r.site).map((r) => (
        <circle key={r.name} cx={x(nasa(r))} cy={y(ours(r))} r={2.4} className={`sc ${body}`} />
      ))}
      {rows.filter((r) => r.site).map((r) => (
        <circle key={r.name} cx={x(nasa(r))} cy={y(ours(r))} r={4} className="sc site">
          <title>{`${r.name}: ours ${(ours(r) * 100).toFixed(1)}%, NASA ${(nasa(r) * 100).toFixed(1)}%`}</title>
        </circle>
      ))}
      <text x={x(0.5)} y={S - 2} className="tick" textAnchor="middle">NASA GSFC map</text>
      <text x={10} y={y(0.5)} className="tick" textAnchor="middle" transform={`rotate(-90 10 ${y(0.5)})`}>HORIZON</text>
    </svg>
  );
}

export default function Validation() {
  const [v, setV] = useState<ValidationFile | null>(null);
  const [il, setIl] = useState<IllumFile | null>(null);
  const [cv, setCv] = useState<CustomFile | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("data/validation.json").then((r) => (r.ok ? r.json() : null)).then(setV).catch(() => setV(null));
    fetch("data/validation_illumination.json").then((r) => (r.ok ? r.json() : null)).then(setIl).catch(() => setIl(null));
    fetch("data/validation_custom.json").then((r) => (r.ok ? r.json() : null)).then(setCv).catch(() => setCv(null));
  }, []);

  return (
    <section className="panel">
      <h2>Accuracy</h2>
      <p className="plain-summary">
        Three checks against NASA: sunlight matches NASA Goddard's south-pole maps, Sun and Earth positions match JPL Horizons,
        and replays match what happened to real landers (see <em>Real missions</em>). Details below.
      </p>
      {cv && (
        <div className="illum">
          <p>
            <strong>Custom spots.</strong> Coordinates you enter are computed in your browser, from 80 m terrain near the spot and a
            480 m map farther out. Tested at {cv.sites_with_tiles} of our sites against the full calculation: sunlight within{" "}
            {cv.median_abs_sun_diff_pts} points and Earth contact within {cv.median_abs_earth_diff_pts} (medians), same verdict{" "}
            {cv.median_verdict_agreement_pct}% of the time (worst site {cv.min_verdict_agreement_pct}%).
          </p>
          <p className="muted small">
            North of 84°S there is no 80 m terrain, so results are rougher ({cv.outside_tiles.site}:{" "}
            {cv.outside_tiles.verdict_agreement_pct}% same verdict). The worst case is the {cv.worst_earth_case.site} itself, where Earth
            contact comes out {cv.worst_earth_case.browser}% instead of {cv.worst_earth_case.full}%.
          </p>
        </div>
      )}
      {il && (
        <div className="illum">
          <p>
            <strong>NASA Goddard's south-pole maps.</strong> Goddard publishes long-run average sunlight and Earth visibility near the
            pole (Mazarico et al. 2011). We computed the same thing at {il.summary.sun.n} locations: our {il.rows.filter((r) => r.site).length} sites and{" "}
            {il.rows.filter((r) => !r.site).length} random points.
          </p>
          <div className="illum-row">
            {(["sun", "earth"] as const).map((b) => (
              <figure key={b}>
                <Scatter rows={il.rows} body={b} />
                <figcaption>
                  <strong>{b === "sun" ? "Sunlight" : "Earth visibility"}</strong>: correlation r = {il.summary[b].r.toFixed(3)}, median
                  difference {(il.summary[b].median_abs_diff * 100).toFixed(2)} percentage points
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="muted small">
            Same definition as NASA: fraction of time any part of the disk is above the local horizon, {il.window}. Large dots are
            HORIZON's sites. At sharp peaks we read a few points higher than NASA's map, because we evaluate the exact summit
            while each NASA pixel averages 60–120 m of the slopes around it.
          </p>
        </div>
      )}
      {v ? (
        <>
          <p>
            Sun and Earth positions checked against <strong>JPL Horizons</strong> at {new Set(v.rows.map((r) => r.site)).size} sites,{" "}
            {v.summary.n} comparisons ({v.window}): largest elevation difference{" "}
            <strong>{deg(v.summary.max_abs_d_el)}</strong> (RMS {deg(v.summary.rms_d_el)}), largest azimuth difference{" "}
            {deg(v.summary.max_abs_d_az)}. For scale, the Sun's disk is about 0.53° across.
          </p>
          <p className="muted small">
            Horizons uses the same DE440 ephemeris, so this confirms our frames, site geometry and az/el math. It does not test
            DE440 itself. The terrain horizon is checked separately: projection round-trip, 40 m vs 80 m DEM agreement, and
            Shackleton's depth (<code>pipeline/check_terrain.py</code>).
          </p>
          <button className="link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} all comparisons</button>
          {open && (
            <div className="matrix-wrap">
              <table className="vtable">
                <thead><tr><th>Site</th><th>Time (UT)</th><th>Body</th><th>Our az / el</th><th>JPL az / el</th><th>Δel</th></tr></thead>
                <tbody>
                  {v.rows.map((r, k) => (
                    <tr key={k}>
                      <td>{r.site}</td><td>{r.time}</td><td>{r.body}</td>
                      <td>{r.ours_az.toFixed(5)} / {r.ours_el.toFixed(5)}</td>
                      <td>{r.jpl_az.toFixed(5)} / {r.jpl_el.toFixed(5)}</td>
                      <td>{r.d_el.toFixed(6)}°</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="muted">No cross-check file yet. Run <code>python validate_horizons.py</code> in the pipeline folder.</p>
      )}
      <h3>Known limits</h3>
      <ul className="small">
        <li>Terrain comes from LOLA DEMs at 20–240 m per pixel. Boulders and features smaller than a few pixels are not in the horizon, so very local shadows are missed.</li>
        <li>Rays stop at 300 km or the edge of DEM coverage (about 75°S). Sites near 84°S looking north may miss very distant terrain.</li>
        <li>"Sunlit" means at least half the solar disk is above the terrain horizon. "Earth in view" uses Earth's center.</li>
        <li>The battery model is illustrative: a Sun-tracking solar array whose output follows the visible fraction of the solar disk, a constant load, and no thermal effects. Edit the array, load and battery in Mission requirements.</li>
        <li>Sites are snapped to the highest LOLA point near each USGS feature. They are illustrative, not NASA's official landing-site coordinates.</li>
      </ul>
    </section>
  );
}
