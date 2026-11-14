// Any point the user picks, evaluated in the browser: the same geometry as pipeline/horizon.py and
// pipeline/ephem.py, but on a coarser terrain map (LOLA 75-90 S at 480 m per pixel) and with Sun/Earth
// positions taken from the precomputed Moon-centered vectors.
import type { Terrain } from "./components/Terrain3D";
import { IndexFile, Site } from "./model";

const R = 1737400; // LOLA reference sphere, m
const R_SUN_KM = 695700;
const D2R = Math.PI / 180;
const MASTS = [["0 m", 0.5], ["2 m", 2], ["10 m", 10]] as const;
const AZ_STEP = 0.5;
export const CUSTOM_PREFIX = "custom:";

type Dem = { n: number; scale: number; z: Int16Array };
type Browser = NonNullable<IndexFile["browser"]>;

let demP: Promise<Dem> | null = null;
let ephP: Promise<Float32Array> | null = null;

function loadDem(b: Browser) {
  demP ??= fetch(`data/${b.dem.file}`).then(async (r) => {
    if (!r.ok) throw new Error("terrain map not found");
    return { n: b.dem.n, scale: b.dem.scale_m, z: new Int16Array(await r.arrayBuffer()) };
  });
  return demP;
}

function loadEphem(b: Browser) {
  ephP ??= fetch(`data/${b.ephem.file}`).then(async (r) => {
    if (!r.ok) throw new Error("Sun/Earth positions not found");
    return new Float32Array(await r.arrayBuffer());
  });
  return ephP;
}

// Detailed terrain near the spot: the 80 m tiles within NEAR_M, stitched into one patch. Tests at the ten
// listed sites showed this near detail matters and the 480 m map is enough beyond it.
const NEAR_M = 12e3;
type Patch = Dem & { row0: number; col0: number; rows: number; cols: number; z32: Float32Array };

async function loadPatch(b: Browser, lat0: number, lon0: number): Promise<Patch | null> {
  const t = b.tiles;
  if (!t) return null;
  const rho = 2 * R * Math.tan((Math.PI / 2 + lat0) / 2);
  const col = (rho * Math.sin(lon0)) / t.scale_m + t.n / 2 - 0.5;
  const row = (-rho * Math.cos(lon0)) / t.scale_m + t.n / 2 - 0.5;
  const span = NEAR_M / t.scale_m + 2;
  const tr0 = Math.max(0, Math.floor((row - span) / t.tile)), tr1 = Math.min(t.n / t.tile - 1, Math.floor((row + span) / t.tile));
  const tc0 = Math.max(0, Math.floor((col - span) / t.tile)), tc1 = Math.min(t.n / t.tile - 1, Math.floor((col + span) / t.tile));
  if (tr0 > tr1 || tc0 > tc1) return null;
  const rows = (tr1 - tr0 + 1) * t.tile, cols = (tc1 - tc0 + 1) * t.tile;
  const z32 = new Float32Array(rows * cols).fill(NaN);
  const have = new Set(t.keys);
  const jobs: Promise<void>[] = [];
  let any = false;
  for (let tr = tr0; tr <= tr1; tr++) {
    for (let tc = tc0; tc <= tc1; tc++) {
      if (!have.has(`${tr}_${tc}`)) continue;
      any = true;
      jobs.push(fetch(`data/${t.dir}/${tr}_${tc}.bin`).then(async (r) => {
        if (!r.ok) return;
        const z = new Int16Array(await r.arrayBuffer());
        for (let i = 0; i < t.tile; i++) {
          const base = ((tr - tr0) * t.tile + i) * cols + (tc - tc0) * t.tile;
          for (let j = 0; j < t.tile; j++) z32[base + j] = z[i * t.tile + j] * t.step_m;
        }
      }));
    }
  }
  if (!any) return null;
  await Promise.all(jobs);
  return { n: t.n, scale: t.scale_m, z: new Int16Array(0), row0: tr0 * t.tile, col0: tc0 * t.tile, rows, cols, z32 };
}

function samplePatch(p: Patch, lat: number, lon: number): number {
  const rho = 2 * R * Math.tan((Math.PI / 2 + lat) / 2);
  const col = (rho * Math.sin(lon)) / p.scale + p.n / 2 - 0.5 - p.col0;
  const row = (-rho * Math.cos(lon)) / p.scale + p.n / 2 - 0.5 - p.row0;
  if (!(row >= 0 && col >= 0 && row < p.rows - 1 && col < p.cols - 1)) return NaN;
  const r0 = Math.floor(row), c0 = Math.floor(col), fr = row - r0, fc = col - c0, i = r0 * p.cols + c0;
  return p.z32[i] * (1 - fr) * (1 - fc) + p.z32[i + 1] * (1 - fr) * fc + p.z32[i + p.cols] * fr * (1 - fc) + p.z32[i + p.cols + 1] * fr * fc;
}

// LOLA south polar stereographic: longitude 0 points up (toward Earth), 90 E to the right.
function sample(d: Dem, lat: number, lon: number): number {
  const rho = 2 * R * Math.tan((Math.PI / 2 + lat) / 2);
  const col = (rho * Math.sin(lon)) / d.scale + d.n / 2 - 0.5;
  const row = (-rho * Math.cos(lon)) / d.scale + d.n / 2 - 0.5;
  if (!(row >= 0 && col >= 0 && row < d.n - 1 && col < d.n - 1)) return NaN;
  const r0 = Math.floor(row), c0 = Math.floor(col), fr = row - r0, fc = col - c0, i = r0 * d.n + c0;
  return d.z[i] * (1 - fr) * (1 - fc) + d.z[i + 1] * (1 - fr) * fc + d.z[i + d.n] * fr * (1 - fc) + d.z[i + d.n + 1] * fr * fc;
}

function destination(lat0: number, lon0: number, az: number, dist: number): [number, number] {
  const delta = dist / R;
  const sinLat = Math.sin(lat0) * Math.cos(delta) + Math.cos(lat0) * Math.sin(delta) * Math.cos(az);
  const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
  const lon = lon0 + Math.atan2(Math.sin(az) * Math.sin(delta) * Math.cos(lat0), Math.cos(delta) - Math.sin(lat0) * sinLat);
  return [lat, lon];
}

// Polar map position (km, y toward longitude 0) to latitude/longitude in degrees.
export function polarToLatLon(xKm: number, yKm: number): [number, number] {
  const rho = Math.hypot(xKm, yKm) * 1000;
  return [-90 + (2 * Math.atan(rho / (2 * R))) / D2R, Math.atan2(xKm, yKm) / D2R];
}

function polarXyKm(latDeg: number, lonDeg: number): [number, number] {
  const rho = (2 * R * Math.tan((Math.PI / 2 + latDeg * D2R) / 2)) / 1000;
  return [rho * Math.sin(lonDeg * D2R), rho * Math.cos(lonDeg * D2R)];
}

export function customId(lat: number, lon: number) {
  return `${CUSTOM_PREFIX}${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function parseCustomId(id: string): [number, number] | null {
  if (!id.startsWith(CUSTOM_PREFIX)) return null;
  const [a, b] = id.slice(CUSTOM_PREFIX.length).split(",").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

// Horizon, hourly Sun/Earth tracks and a 3D terrain disk for one point. Throws with a plain message
// if the point is outside the terrain map.
export async function buildCustomSite(ix: IndexFile, latDeg: number, lonDeg: number): Promise<{ site: Site; terrain: Terrain }> {
  const b = ix.browser;
  if (!b) throw new Error("This version of HORIZON has no data for custom points.");
  const lat0 = Math.max(latDeg, -89.999) * D2R; // at the exact pole every direction is "north"
  const lon0 = lonDeg * D2R;
  const [dem, vec, patch] = await Promise.all([loadDem(b), loadEphem(b), loadPatch(b, lat0, lon0)]);
  // Height at distance d from the spot: 80 m tiles nearby, the 480 m map beyond (or where tiles end).
  const height = (la: number, lo: number, d: number) => {
    if (patch && d < NEAR_M) {
      const z = samplePatch(patch, la, lo);
      if (!Number.isNaN(z)) return z;
    }
    return sample(dem, la, lo);
  };
  const h = height(lat0, lon0, 0);
  if (Number.isNaN(h)) throw new Error("Pick a point between 75°S and the south pole: that's where our terrain map reaches.");
  const detailed = patch !== null && !Number.isNaN(samplePatch(patch, lat0, lon0));

  // Skyline: 720 directions, rays out to 300 km, curvature included. With 80 m detail, rays start two
  // pixels out, as in the pipeline; on the 480 m map alone they start inside the first pixel, because on
  // a hilltop the skyline is set by how the ground curves away nearby.
  const nAz = Math.round(360 / AZ_STEP);
  const dists: number[] = [];
  for (let d = detailed ? 160 : dem.scale / 4; d <= 300e3; d *= 1.01) dists.push(d);
  const horizon: Record<string, number[]> = Object.fromEntries(MASTS.map(([m]) => [m, new Array(nAz)]));
  const block: (number | null)[] = new Array(nAz);
  for (let k = 0; k < nAz; k++) {
    const az = k * AZ_STEP * D2R;
    const best = MASTS.map(() => -Infinity);
    let bestD = 0;
    for (const d of dists) {
      const [la, lo] = destination(lat0, lon0, az, d);
      const z = height(la, lo, d);
      if (Number.isNaN(z)) continue;
      const delta = d / R, r2 = R + z;
      MASTS.forEach(([, off], j) => {
        const ang = Math.atan2(r2 * Math.cos(delta) - (R + h + off), r2 * Math.sin(delta));
        if (ang > best[j]) { best[j] = ang; if (j === 0) bestD = d; }
      });
    }
    MASTS.forEach(([m], j) => { horizon[m][k] = Number.isFinite(best[j]) ? best[j] / D2R : -1; });
    block[k] = bestD ? Math.round(bestD / 10) / 100 : null;
  }

  // Sun and Earth seen from the site, every hour (same local axes as pipeline/ephem.py).
  const n = b.ephem.n;
  const up = [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)];
  const east = [-Math.sin(lon0), Math.cos(lon0), 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  const siteKm = up.map((u) => (u * (R + h + MASTS[0][1])) / 1000);
  const sunAz = new Float32Array(n), sunEl = new Float32Array(n), earthAz = new Float32Array(n), earthEl = new Float32Array(n);
  let sunRadSum = 0;
  for (let i = 0; i < n; i++) {
    for (const [o, azA, elA] of [[0, sunAz, sunEl], [3, earthAz, earthEl]] as const) {
      const vx = vec[i * 6 + o] - siteKm[0], vy = vec[i * 6 + o + 1] - siteKm[1], vz = vec[i * 6 + o + 2] - siteKm[2];
      const rng = Math.hypot(vx, vy, vz);
      const e = vx * east[0] + vy * east[1] + vz * east[2];
      const nn = vx * north[0] + vy * north[1] + vz * north[2];
      const u = vx * up[0] + vy * up[1] + vz * up[2];
      azA[i] = ((Math.atan2(e, nn) / D2R) % 360 + 360) % 360;
      elA[i] = Math.asin(u / rng) / D2R;
      if (o === 0) sunRadSum += Math.asin(R_SUN_KM / rng) / D2R;
    }
  }

  // 3D: a 300 km disk sampled from the same map (coarser than the listed sites' terrain).
  const spokes = 360;
  const rr: number[] = [];
  for (let r = 240; r <= 150e3; r *= 1.02) rr.push(r);
  const zz = new Float32Array(spokes * rr.length);
  let fill = 0;
  for (let s = 0; s < spokes; s++) {
    const az = (s / spokes) * 2 * Math.PI;
    rr.forEach((r, j) => {
      const [la, lo] = destination(lat0, lon0, az, r);
      const z = height(la, lo, r);
      if (!Number.isNaN(z)) fill = z;
      zz[s * rr.length + j] = ((Number.isNaN(z) ? fill : z) - h - (r * r) / (2 * R)) / 1000;
    });
  }

  const [x, y] = polarXyKm(latDeg, lonDeg);
  const site: Site = {
    id: customId(latDeg, lonDeg),
    name: `Your spot (${Math.abs(latDeg).toFixed(2)}°S, ${lonDeg.toFixed(2)}°E)`,
    about: detailed
      ? "A point you picked. Terrain comes from NASA LOLA maps: 80 m detail within 12 km, 480 m beyond."
      : "A point you picked, beyond our detailed tiles (north of 84°S): terrain comes from a 480 m NASA LOLA map, so results are rough.",
    lat: latDeg, lon: lonDeg, x_km: x, y_km: y,
    height_m: Math.round(h),
    placement: "your coordinates",
    terrain: detailed ? "LOLA 80 m tiles + 480 m map" : b.dem.source + " (480 m)",
    masts: MASTS.map(([m]) => m),
    az_step: AZ_STEP,
    horizon,
    block_km: block,
    sun_radius_deg: sunRadSum / n,
    t0: Date.parse(b.ephem.start),
    n,
    sunAz, sunEl, earthAz, earthEl,
  };
  return { site, terrain: { spokes, r: Float32Array.from(rr, (r) => r / 1000), z: zz } };
}
