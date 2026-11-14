"""Independent check of HORIZON's terrain + ephemeris model against NASA GSFC's published
average illumination and Earth-visibility maps for the lunar south pole (Mazarico et al. 2011).

The NASA maps give, per pixel, the fraction of hourly timesteps over 18.6 years in which ANY part
of the solar (or Earth) disk is above the local horizon. We compute exactly that with HORIZON's own
pipeline (LOLA horizon profiles + DE440 positions) at the 10 polar sites plus random points, and
compare. Writes web/public/data/validation_illumination.json.

Usage:  python download.py --illumination   (once)
        python validate_illumination.py [--points 150] [--step-h 2]
"""
import argparse
import json
import time

import numpy as np

import ephem
from common import ILLUMINATION, ILLUMINATION_EARTH, ILLUMINATION_SUN, MASTS, R_MOON_M, R_SUN_KM, WEB_DATA
from dem import MultiDEM
from horizon import compute_horizon, nudge_off_pole

R_EARTH_KM = 6371.0
START = "2009-07-01T00:00:00"  # 18.6 years (one lunar nodal cycle) from the start of the LRO era
YEARS = 18.6


def visible_fraction(az_deg, el_deg, radius_deg, prof, az_step):
    """Fraction of epochs in which any part of the disk is above the horizon profile."""
    x = (az_deg % 360) / az_step
    i = np.floor(x).astype(int) % prof.size
    f = x - np.floor(x)
    h = prof[i] * (1 - f) + prof[(i + 1) % prof.size] * f
    return float(np.mean(el_deg + radius_deg > h))


def random_points(n, rng, lat_min=-89.9, lat_max=-85.0):
    """Area-uniform random points in a polar cap ring."""
    c_lo, c_hi = 1 - np.cos(np.radians(90 + lat_min)), 1 - np.cos(np.radians(90 + lat_max))
    colat = np.degrees(np.arccos(1 - rng.uniform(c_lo, c_hi, n)))
    return -90 + colat, rng.uniform(-180, 180, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--points", type=int, default=150)
    ap.add_argument("--step-h", type=float, default=2.0)
    args = ap.parse_args()

    terrain = MultiDEM()
    nasa_sun = MultiDEM(ILLUMINATION_SUN, ILLUMINATION)
    nasa_earth = MultiDEM(ILLUMINATION_EARTH, ILLUMINATION)

    n = int(YEARS * 365.25 * 24 / args.step_h)
    ets = ephem.epochs(START, n, step_h=args.step_h)
    t = time.time()
    sun_v = ephem.body_vectors(ets, "SUN")
    earth_v = ephem.body_vectors(ets, "EARTH")
    print(f"ephemeris: {n} epochs every {args.step_h} h over {YEARS} years ({time.time() - t:.0f} s)")

    index = json.loads((WEB_DATA / "index.json").read_text())["sites"]
    pts = [(s["name"], s["lat"], s["lon"], True) for s in index if s["height_m"] is not None]
    lat_r, lon_r = random_points(args.points, np.random.default_rng(2026))
    pts += [(f"random {k + 1}", float(a), float(b), False) for k, (a, b) in enumerate(zip(lat_r, lon_r))]

    rows = []
    t = time.time()
    for name, lat, lon, is_site in pts:
        la, lo = np.radians(nudge_off_pole(lat)), np.radians(lon)
        ref_sun = float(nasa_sun.sample(np.array([la]), np.array([lo]))[0])
        ref_earth = float(nasa_earth.sample(np.array([la]), np.array([lo]))[0])
        if np.isnan(ref_sun):
            continue
        offset = MASTS[0]["offset_m"]
        _, prof, _, h = compute_horizon(terrain, lat, lon, [offset], az_step=0.5)
        if h is None:
            continue
        p = prof[offset]
        elat = nudge_off_pole(lat)
        s_az, s_el, s_rng = ephem.az_el(sun_v, elat, lon, h + offset)
        e_az, e_el, e_rng = ephem.az_el(earth_v, elat, lon, h + offset)
        ours_sun = visible_fraction(s_az, s_el, np.degrees(np.arcsin(R_SUN_KM / s_rng)), p, 0.5)
        ours_earth = visible_fraction(e_az, e_el, np.degrees(np.arcsin(R_EARTH_KM / e_rng)), p, 0.5)
        rows.append({"name": name, "site": is_site, "lat": round(lat, 4), "lon": round(lon, 4),
                     "ours_sun": round(ours_sun, 4), "nasa_sun": round(ref_sun, 4),
                     "ours_earth": round(ours_earth, 4), "nasa_earth": round(ref_earth, 4)})
        if is_site:
            print(f"  {name:28s} sun ours {ours_sun:5.3f} nasa {ref_sun:5.3f} | earth ours {ours_earth:5.3f} nasa {ref_earth:5.3f}")
    print(f"{len(rows)} points in {time.time() - t:.0f} s")

    def stats(key):
        a = np.array([r[f"ours_{key}"] for r in rows])
        b = np.array([r[f"nasa_{key}"] for r in rows])
        d = a - b
        return {"r": round(float(np.corrcoef(a, b)[0, 1]), 4), "median_abs_diff": round(float(np.median(np.abs(d))), 4),
                "mean_diff": round(float(d.mean()), 4), "p90_abs_diff": round(float(np.percentile(np.abs(d), 90)), 4),
                "n": int(len(d))}

    summary = {"sun": stats("sun"), "earth": stats("earth")}
    print("summary:", json.dumps(summary))
    (WEB_DATA / "validation_illumination.json").write_text(json.dumps({
        "reference": "NASA GSFC / LOLA average solar and Earth visibility maps (Mazarico et al. 2011), PDS LOLA EXTRAS/ILLUMINATION",
        "products": ILLUMINATION_SUN + ILLUMINATION_EARTH,
        "definition": "fraction of time any part of the disk is above the local horizon",
        "window": f"{START}Z + {YEARS} years, every {args.step_h} h",
        "summary": summary, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()
