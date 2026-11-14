// Data model and visibility math. All heavy geometry is precomputed by the Python
// pipeline; here we only combine horizon profiles with Sun/Earth tracks.

export type SiteSummary = {
  id: string;
  name: string;
  about: string;
  lat: number;
  lon: number;
  x_km: number;
  y_km: number;
  height_m: number | null;
  placement: string;
  terrain: string | null;
};

export type MissionMeta = SiteSummary & {
  agency: string;
  landed: string;
  days: number;
  view_days: number;
  outcome: string;
  events: { t: string; date_only: boolean; label: string }[];
  sources: { label: string; url: string }[];
  crater_m?: number;
};

export type IndexFile = {
  generated: string;
  period: { start: string; days: number };
  frame: string;
  map: { image: string; half_width_km: number; source: string } | null;
  sites: SiteSummary[];
  missions?: MissionMeta[];
  // For points the user picks: a coarse terrain map and hourly Sun/Earth vectors (see custom.ts).
  browser?: {
    dem: { file: string; n: number; scale_m: number; source: string };
    ephem: { file: string; start: string; step_h: number; n: number; frame: string };
    tiles?: { dir: string; n: number; scale_m: number; tile: number; step_m: number; keys: string[] };
  };
};

type SiteFile = SiteSummary & {
  masts: string[];
  az_step: number;
  horizon: Record<string, number[]>;
  block_km: (number | null)[];
  sun_radius_deg: number;
  ephem: {
    start: string;
    step_h: number;
    n: number;
    scale: number;
    sun_az: string;
    sun_el: string;
    earth_az: string;
    earth_el: string;
  };
};

export type Site = Omit<SiteFile, "ephem"> & {
  t0: number; // ms since epoch of the first hourly sample
  n: number;
  sunAz: Float32Array;
  sunEl: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
};

export type Visibility = {
  sunFrac: Float32Array; // fraction of the solar disk above the terrain horizon, 0..1
  earth: Uint8Array; // 1 when Earth's center is above the terrain horizon
  power: Float32Array; // relative output of a Sun-tracking array: the visible fraction of the solar disk
  sunPrefix: Int32Array; // prefix counts of sunlit hours (sunFrac >= 0.5)
  earthPrefix: Int32Array;
  bothPrefix: Int32Array;
  powerPrefix: Float64Array;
  nextDark: Int32Array; // first hour index >= i that is not sunlit (n if none)
};

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
export const SUNLIT = 0.5;

export function decode(b64: string, scale: number): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(2 * i, true) / scale;
  return out;
}

export async function loadIndex(): Promise<IndexFile> {
  const r = await fetch("data/index.json");
  if (!r.ok) throw new Error("data/index.json not found. Run the pipeline (see README).");
  return r.json();
}

export async function loadSite(id: string): Promise<Site> {
  const r = await fetch(`data/site_${id}.json`);
  if (!r.ok) throw new Error(`data for ${id} not found`);
  const f: SiteFile = await r.json();
  const { ephem, ...rest } = f;
  return {
    ...rest,
    t0: Date.parse(ephem.start),
    n: ephem.n,
    sunAz: decode(ephem.sun_az, ephem.scale),
    sunEl: decode(ephem.sun_el, ephem.scale),
    earthAz: decode(ephem.earth_az, ephem.scale),
    earthEl: decode(ephem.earth_el, ephem.scale),
  };
}

export function horizonAt(profile: number[], step: number, azDeg: number): number {
  const n = profile.length;
  const x = (((azDeg % 360) + 360) % 360) / step;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return profile[i] * (1 - f) + profile[(i + 1) % n] * f;
}

// Fraction of a disk of angular radius r whose center sits d degrees above a straight horizon.
function diskFraction(d: number, r: number): number {
  const x = d / r;
  if (x >= 1) return 1;
  if (x <= -1) return 0;
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

export function computeVisibility(site: Site, mast: string): Visibility {
  const prof = site.horizon[mast];
  const n = site.n;
  const sunFrac = new Float32Array(n);
  const earth = new Uint8Array(n);
  const power = new Float32Array(n);
  const sunPrefix = new Int32Array(n + 1);
  const earthPrefix = new Int32Array(n + 1);
  const bothPrefix = new Int32Array(n + 1);
  const powerPrefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const hs = horizonAt(prof, site.az_step, site.sunAz[i]);
    const f = diskFraction(site.sunEl[i] - hs, site.sun_radius_deg);
    sunFrac[i] = f;
    power[i] = f; // Sun-tracking array: output follows the visible fraction of the solar disk
    earth[i] = site.earthEl[i] > horizonAt(prof, site.az_step, site.earthAz[i]) ? 1 : 0;
    const lit = f >= SUNLIT ? 1 : 0;
    sunPrefix[i + 1] = sunPrefix[i] + lit;
    earthPrefix[i + 1] = earthPrefix[i] + earth[i];
    bothPrefix[i + 1] = bothPrefix[i] + (lit & earth[i]);
    powerPrefix[i + 1] = powerPrefix[i] + power[i];
  }
  const nextDark = new Int32Array(n + 1);
  nextDark[n] = n;
  for (let i = n - 1; i >= 0; i--) nextDark[i] = sunFrac[i] < SUNLIT ? i : nextDark[i + 1];
  return { sunFrac, earth, power, sunPrefix, earthPrefix, bothPrefix, powerPrefix, nextDark };
}

export type WindowStats = {
  sunPct: number;
  earthPct: number;
  bothPct: number;
  meanPower: number;
  firstDarkH: number; // hours of uninterrupted sunlight from the start (capped at window length)
  longestDarkH: number;
  longestNoEarthH: number;
};

function longestRun(i0: number, i1: number, isGap: (i: number) => boolean): number {
  let best = 0;
  let run = 0;
  for (let i = i0; i < i1; i++) {
    run = isGap(i) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

// Fast stats for the slip matrix (O(1) per window).
export function quickStats(v: Visibility, i0: number, hours: number) {
  const i1 = i0 + hours;
  return {
    sunPct: (100 * (v.sunPrefix[i1] - v.sunPrefix[i0])) / hours,
    earthPct: (100 * (v.earthPrefix[i1] - v.earthPrefix[i0])) / hours,
    firstDarkH: Math.min(v.nextDark[i0] - i0, hours),
  };
}

export function windowStats(v: Visibility, i0: number, hours: number): WindowStats {
  const i1 = i0 + hours;
  return {
    ...quickStats(v, i0, hours),
    bothPct: (100 * (v.bothPrefix[i1] - v.bothPrefix[i0])) / hours,
    meanPower: (v.powerPrefix[i1] - v.powerPrefix[i0]) / hours,
    longestDarkH: longestRun(i0, i1, (i) => v.sunFrac[i] < SUNLIT),
    longestNoEarthH: longestRun(i0, i1, (i) => v.earth[i] === 0),
  };
}

// Lander power system (illustrative defaults for a small lander; the user can change them).
export type Power = { arrayW: number; loadW: number; batteryWh: number };

export type Criteria = { durationDays: number; minSunPct: number; minEarthPct: number; power: Power };

// Hour-by-hour energy balance: solar array output scales with the power index (Sun-tracking
// array x visible fraction of the disk); the battery starts full and absorbs the difference.
export function batteryRun(v: Visibility, i0: number, hours: number, p: Power, keepSeries = false) {
  let wh = p.batteryWh;
  let min = wh;
  let emptyH: number | null = null;
  const series = keepSeries ? new Float32Array(hours) : null;
  for (let h = 0; h < hours; h++) {
    wh = Math.min(p.batteryWh, wh + p.arrayW * v.power[i0 + h] - p.loadW);
    if (wh <= 0) {
      wh = 0;
      if (emptyH === null) emptyH = h;
    }
    if (wh < min) min = wh;
    if (series) series[h] = (100 * wh) / p.batteryWh;
  }
  return { minPct: (100 * min) / p.batteryWh, emptyH, series };
}

// 1 = meets both thresholds; below 1 = how close the worse of the two comes.
export function score(s: { sunPct: number; earthPct: number }, c: Criteria): number {
  const a = c.minSunPct > 0 ? s.sunPct / c.minSunPct : 1;
  const b = c.minEarthPct > 0 ? s.earthPct / c.minEarthPct : 1;
  return Math.min(1, a, b);
}

export function hourIndex(site: Site, t: number): number {
  return Math.round((t - site.t0) / HOUR);
}

// Mission starting at time t: null when outside the precomputed period. GO needs both thresholds
// met and a battery that never runs flat; a flat battery caps the score just below GO.
export function evaluate(site: Site, v: Visibility, t: number, crit: Criteria) {
  const hours = crit.durationDays * 24;
  const i0 = hourIndex(site, t);
  if (i0 < 0 || i0 + hours > site.n) return null;
  const q = quickStats(v, i0, hours);
  const bat = batteryRun(v, i0, hours, crit.power);
  const s = bat.emptyH === null ? score(q, crit) : Math.min(score(q, crit), 0.9);
  return { ...q, battery: bat, score: s, ok: s >= 1 };
}

// Smallest change of landing date (days) from t that makes the site pass; later dates win ties.
export function nearestGoodShift(site: Site, v: Visibility, t: number, crit: Criteria, maxDays = 30): number | null {
  for (let d = 1; d <= maxDays; d++) {
    if (evaluate(site, v, t + d * DAY, crit)?.ok) return d;
    if (evaluate(site, v, t - d * DAY, crit)?.ok) return -d;
  }
  return null;
}

// Polar sites (with terrain) that pass for a mission starting at t, best first. The equatorial
// contrast site is never suggested as an alternative.
export function goodSitesAt(sites: Site[], vis: Record<string, Visibility>, t: number, crit: Criteria) {
  return sites
    .filter((site) => site.height_m !== null)
    .map((site) => ({ site, e: evaluate(site, vis[site.id], t, crit) }))
    .filter((x) => x.e?.ok)
    .sort((a, b) => b.e!.sunPct + b.e!.earthPct - (a.e!.sunPct + a.e!.earthPct));
}

// First landing day (from ~1 month into the period) that passes for this site, preferring one
// with sunlight from touchdown onward; falls back to any passing day.
export function firstGoodDay(site: Site, v: Visibility, crit: Criteria): number {
  let fallback: number | null = null;
  for (let d = 30; (d + crit.durationDays) * 24 <= site.n; d++) {
    const e = evaluate(site, v, site.t0 + d * DAY, crit);
    if (!e?.ok) continue;
    if (e.firstDarkH >= 24) return site.t0 + d * DAY;
    fallback ??= site.t0 + d * DAY;
  }
  return fallback ?? site.t0 + 30 * DAY;
}

// Hours from index i until test() changes value (sunset, sunrise, Earthset...); null if it doesn't
// change before the data ends.
export function hoursUntilChange(n: number, i: number, test: (k: number) => boolean): number | null {
  const now = test(i);
  for (let k = i + 1; k < n; k++) if (test(k) !== now) return k - i;
  return null;
}

// "14 h", "2 d 5 h": compact countdowns.
export function fmtCountdown(h: number): string {
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} days`;
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function fmtHours(h: number): string {
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}
