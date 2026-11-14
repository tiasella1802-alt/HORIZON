"""Precompute everything the HORIZON web app shows.

For each site: snap to real terrain, compute horizon profiles for each mast height, and
Sun/Earth azimuth-elevation hourly over the chosen period. Writes JSON into web/public/data.

Usage:  python build.py                               (all sites, 2027-01-01 for 730 days)
        python build.py --sites mons-mouton,south-pole --days 90 --az-step 1
"""
import argparse
import base64
import json
import time
from datetime import datetime, timezone

import numpy as np

import ephem
from common import DEMS, MASTS, R_MOON_M, R_SUN_KM, ROOT, WEB_DATA
from dem import MultiDEM, PolarDEM
from horizon import compute_horizon, nudge_off_pole, polar_heightmap, snap_site

ANGLE_SCALE = 90  # angles stored as int16 in units of 1/90 degree (~0.011 deg)
TERRAIN_RADIUS_M = 150e3  # 3D view: a 300 km wide disk around each site
TERRAIN_SPOKES = 540  # 0.67 deg apart: ~60 m at 5 km, ~350 m at 30 km
NEAR_M, NEAR_STEP_M = 2000.0, 0.1  # finer height steps close to the site


def pack(angles_deg):
    q = np.round(np.asarray(angles_deg) * ANGLE_SCALE).astype("<i2")
    return base64.b64encode(q.tobytes()).decode("ascii")


def polar_xy_km(lat_deg, lon_deg):
    rho = 2 * R_MOON_M * np.tan((np.pi / 2 + np.radians(lat_deg)) / 2) / 1000
    return float(rho * np.sin(np.radians(lon_deg))), float(rho * np.cos(np.radians(lon_deg)))


def resolve(site, mdem):
    kind = site["kind"]
    if kind == "summit":
        lat, lon = snap_site(mdem, site["lat"], site["lon"], 0, site["radius_km"] * 1000)
        how = f"highest LOLA point within {site['radius_km']} km of the USGS feature center"
    elif kind == "rim":
        r0, r1 = site["ring_km"]
        lat, lon = snap_site(mdem, site["lat"], site["lon"], r0 * 1000, r1 * 1000)
        how = f"highest LOLA point {r0}-{r1} km from the USGS crater center"
    else:
        lat, lon = site["lat"], site["lon"]
        how = "fixed coordinates"
    return lat, lon, how


def hillshade_png(dem, out_png, stride=8):
    from PIL import Image

    z = np.asarray(dem.data[::stride, ::stride], dtype=np.float32) * dem.k
    px = dem.scale * stride
    gy, gx = np.gradient(z, px)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    sun_az, sun_alt = np.radians(315), np.radians(35)
    shade = np.sin(sun_alt) * np.cos(slope) + np.cos(sun_alt) * np.sin(slope) * np.cos(sun_az - aspect)
    img = np.clip(shade, 0, 1) ** 0.8 * 255
    Image.fromarray(img.astype(np.uint8)).save(out_png, optimize=True)
    return dem.n * dem.scale / 2 / 1000  # half-width of the map, km


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2027-01-01T00:00:00")
    ap.add_argument("--days", type=int, default=730)
    ap.add_argument("--sites", default="", help="comma-separated ids (default: all)")
    ap.add_argument("--az-step", type=float, default=0.5)
    args = ap.parse_args()

    cfg = json.loads((ROOT / "pipeline" / "sites.json").read_text())
    sites = cfg["sites"]
    if args.sites:
        wanted = set(args.sites.split(","))
        sites = [s for s in sites if s["id"] in wanted]

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    mdem = MultiDEM()
    print("DEMs:", ", ".join(f"{d.name} ({d.scale:g} m)" for d in mdem.dems))

    hours = args.days * 24
    ets = ephem.epochs(args.start, hours)
    sun_v = ephem.body_vectors(ets, "SUN")
    earth_v = ephem.body_vectors(ets, "EARTH")
    print(f"ephemeris: {hours} hourly epochs from {args.start} UTC, frame {ephem.FRAME}")

    index = []
    for s in sites:
        lat, lon, how = resolve(s, mdem)
        rec = build_location(mdem, s["id"], s["name"], lat, lon, args.start, hours, sun_v, earth_v, args.az_step,
                             about=s.get("about", ""), feature=s.get("feature"), placement=how)
        index.append({k: rec[k] for k in SUMMARY_KEYS})

    old = WEB_DATA / "index.json"
    previous = json.loads(old.read_text()) if old.exists() else {}
    missions = previous.get("missions", [])
    browser = previous.get("browser")
    if not args.sites:
        map_dem = next((d for d in mdem.dems if d.name == "LDEM_80S_80M"), mdem.dems[-1])
        half = hillshade_png(map_dem, WEB_DATA / "hillshade.png")
        map_meta = {"image": "hillshade.png", "half_width_km": half, "source": map_dem.name}
        missions = build_missions(mdem, args.az_step)
        browser = export_browser_data(sun_v, earth_v, args.start, hours)
    else:
        map_meta = previous.get("map")
        keep = [s for s in previous.get("sites", []) if s["id"] not in {r["id"] for r in index}]
        index = keep + index

    (WEB_DATA / "index.json").write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "period": {"start": args.start + "Z", "days": args.days},
        "frame": ephem.FRAME,
        "map": map_meta,
        "sites": index,
        "missions": missions,
        "browser": browser,
    }, indent=1))
    print(f"wrote {len(index)} sites and {len(missions)} mission replays to {WEB_DATA}")


SUMMARY_KEYS = ("id", "name", "about", "lat", "lon", "x_km", "y_km", "height_m", "placement", "terrain")


def export_browser_data(sun_v, earth_v, start, hours, factor=2):
    """Data the web app needs to evaluate any point the user picks, without a server:
    - a coarser copy of LDEM_75S_240M (2x2 block mean, 480 m/px, int16 meters above 1737.4 km),
      covering 75-90 S in the same LOLA polar stereographic projection;
    - Moon-centered Sun and Earth positions (km, MOON_ME, LT+S) for every hour of the period."""
    src = PolarDEM(DEMS / "LDEM_75S_240M.IMG")
    n = src.n // factor
    z = np.asarray(src.data[: n * factor, : n * factor], dtype=np.float32) * src.k
    z = z.reshape(n, factor, n, factor).mean(axis=(1, 3))
    (WEB_DATA / "dem_75s_480m.bin").write_bytes(np.round(z).astype("<i2").tobytes())
    vec = np.hstack([sun_v, earth_v]).astype("<f4")
    (WEB_DATA / "ephem_vectors.bin").write_bytes(vec.tobytes())
    print(f"browser data: {n}x{n} DEM at {src.scale * factor:g} m, {hours} hourly Sun/Earth vectors")
    return {
        "dem": {"file": "dem_75s_480m.bin", "n": n, "scale_m": src.scale * factor, "source": src.name,
                "units": "int16 meters above the 1737.4 km sphere, row-major, LOLA south polar stereographic"},
        "ephem": {"file": "ephem_vectors.bin", "start": start + "Z", "step_h": 1, "n": hours, "frame": ephem.FRAME,
                  "layout": "float32 LE per hour: sun x y z, earth x y z (km, Moon-centered)"},
        "tiles": export_near_tiles(),
    }


def export_near_tiles(scale=80.0, tile=128, n=4608, step=0.25):
    """80 m terrain tiles for 84-90 S (same projection, centered on the pole), so the app can load just the
    few tiles within ~10 km of a picked spot: tests at the 10 sites showed that detail is needed only that
    close; the 480 m map is enough beyond. Heights are int16 in 0.25 m steps (fine enough that the
    stand-on-the-Moon view shows no terraces). Tiles entirely outside the 84 S circle are skipped."""
    mdem = MultiDEM()
    out_dir = WEB_DATA / "tiles80"
    out_dir.mkdir(exist_ok=True)
    for old in out_dir.glob("*.bin"):
        old.unlink()
    half = n * scale / 2
    r_max = 2 * R_MOON_M * np.tan(np.radians(6) / 2)  # 84 S
    keys = []
    for tr in range(n // tile):
        for tc in range(n // tile):
            cols = tc * tile + np.arange(tile)
            rows = tr * tile + np.arange(tile)
            x = (cols[None, :] - n / 2 + 0.5) * scale
            y = -(rows[:, None] - n / 2 + 0.5) * scale
            if np.hypot(np.abs(x).min(), np.abs(y).min()) > r_max:  # nearest corner beyond 84 S
                continue
            x, y = np.broadcast_arrays(x, y)
            rho = np.hypot(x, y)
            lat = -np.pi / 2 + 2 * np.arctan(rho / (2 * R_MOON_M))
            lon = np.arctan2(x, y)
            z = mdem.sample(lat, lon)
            z = np.where(np.isnan(z), np.nanmean(z) if np.isfinite(z).any() else 0, z)
            (out_dir / f"{tr}_{tc}.bin").write_bytes(np.clip(np.round(z / step), -32768, 32767).astype("<i2").tobytes())
            keys.append(f"{tr}_{tc}")
    size = len(keys) * tile * tile * 2 / 1e6
    print(f"near tiles: {len(keys)} tiles of {tile}x{tile} at {scale:g} m ({size:.0f} MB), half width {half / 1000:.1f} km")
    return {"dir": "tiles80", "n": n, "scale_m": scale, "tile": tile, "step_m": step, "keys": keys,
            "units": "int16 heights in step_m units above the 1737.4 km sphere; tile r_c covers rows r*tile.., cols c*tile.."}


def build_location(mdem, sid, name, lat, lon, start, hours, sun_v, earth_v, az_step, about="", feature=None, placement=""):
    """Horizon, hourly Sun/Earth tracks and 3D terrain for one location; writes site_/terrain_<sid>.json."""
    t = time.time()
    az, prof, block, h = compute_horizon(mdem, lat, lon, [m["offset_m"] for m in MASTS], az_step)
    h_m = 0.0 if h is None else h
    elat = nudge_off_pole(lat)
    sun_az, sun_el, sun_rng = ephem.az_el(sun_v, elat, lon, h_m + MASTS[0]["offset_m"])
    earth_az, earth_el, _ = ephem.az_el(earth_v, elat, lon, h_m + MASTS[0]["offset_m"])
    x, y = polar_xy_km(lat, lon)
    rec = {
        "id": sid, "name": name, "about": about, "feature": feature,
        "lat": round(lat, 5), "lon": round(lon, 5), "x_km": round(x, 3), "y_km": round(y, 3),
        "height_m": None if h is None else round(h, 1),
        "placement": placement, "terrain": mdem.source_at(np.radians(elat), np.radians(lon)),
        "masts": [m["label"] for m in MASTS],
        "az_step": az_step,
        "horizon": {m["label"]: [round(v, 3) for v in prof[m["offset_m"]]] for m in MASTS},
        "block_km": [None if np.isnan(v) else round(v / 1000, 2) for v in block],
        "sun_radius_deg": round(float(np.degrees(np.arcsin(R_SUN_KM / sun_rng)).mean()), 4),
        "ephem": {
            "start": start + "Z", "step_h": 1, "n": hours, "scale": ANGLE_SCALE,
            "sun_az": pack(sun_az), "sun_el": pack(sun_el),
            "earth_az": pack(earth_az), "earth_el": pack(earth_el),
        },
    }
    (WEB_DATA / f"site_{sid}.json").write_text(json.dumps(rec, separators=(",", ":")))
    if h is not None:
        r, z = polar_heightmap(mdem, lat, lon, h, TERRAIN_SPOKES, r_max=TERRAIN_RADIUS_M)
        z = np.where(np.isnan(z), np.nanmin(z), z)
        # int16 heights: 0.1 m steps within NEAR_M of the site (whole-meter steps show as terraces
        # in the stand-on-the-Moon view), 1 m beyond, where relief exceeds the 0.1 m range.
        near = int(np.searchsorted(r, NEAR_M))
        q = np.round(z).astype(np.int64)
        q[:, :near] = np.round(z[:, :near] / NEAR_STEP_M)
        if np.abs(q).max() > 32767:
            raise ValueError(f"{sid}: terrain heights overflow int16")
        (WEB_DATA / f"terrain_{sid}.json").write_text(json.dumps({
            "layout": "polar: z[spoke][ring], spokes clockwise from north", "units": "m relative to site, curvature included",
            "spokes": TERRAIN_SPOKES, "r_km": [round(v / 1000, 5) for v in r],
            "near_rings": near, "near_step_m": NEAR_STEP_M,
            "z": base64.b64encode(q.astype("<i2").tobytes()).decode("ascii"),
        }, separators=(",", ":")))
    print(f"  {sid:18s} {lat:9.4f} {lon:9.4f}  h={h_m:7.0f} m  "
          f"max horizon {max(prof[MASTS[0]['offset_m']]):5.2f} deg  ({time.time() - t:.1f} s)")
    return rec


def build_missions(mdem, az_step):
    """Replay real landings: each mission gets its own hourly window starting at touchdown."""
    path = ROOT / "pipeline" / "missions.json"
    if not path.exists():
        return []
    out = []
    for m in json.loads(path.read_text())["missions"]:
        start = m["landed"].rstrip("Z")
        hours = m["days"] * 24
        ets = ephem.epochs(start, hours)
        rec = build_location(mdem, m["id"], m["name"], m["lat"], m["lon"], start, hours,
                             ephem.body_vectors(ets, "SUN"), ephem.body_vectors(ets, "EARTH"), az_step,
                             about=m["outcome"], placement="published landing coordinates")
        out.append({**{k: rec[k] for k in SUMMARY_KEYS},
                     **{k: m[k] for k in ("agency", "landed", "days", "view_days", "outcome", "events", "sources") if k in m},
                     **({"crater_m": m["crater_m"]} if "crater_m" in m else {})})
    return out


if __name__ == "__main__":
    main()
