"""Independent check: compare our Sun/Earth azimuth-elevation with JPL Horizons
for a few built sites and times. Writes web/public/data/validation.json.

Usage:  python validate_horizons.py   (run build.py first; needs internet)
"""
import json
import urllib.parse
import urllib.request

import numpy as np

import ephem
from common import MASTS, WEB_DATA
from horizon import nudge_off_pole

SITES = ["mons-mouton", "shackleton-rim", "mons-malapert"]
START, STOP, STEP = "2027-03-01 00:00", "2027-03-04 00:00", "6 h"
BODIES = {"Sun": ("10", "SUN"), "Earth": ("399", "EARTH")}


def horizons_azel(command, lat, lon, alt_km):
    q = {
        "format": "json", "COMMAND": f"'{command}'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.6f},{lat:.6f},{alt_km:.4f}'",
        "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{STEP}'",
        "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'",
        "APPARENT": "'AIRLESS'", "TIME_TYPE": "'UT'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url) as r:
        text = json.load(r)["result"]
    if "$$SOE" not in text:
        raise RuntimeError(text[-800:])
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        cells = [c.strip() for c in line.split(",")]
        nums = []
        for c in cells[1:]:
            try:
                nums.append(float(c))
            except ValueError:
                pass
        rows.append((cells[0], nums[-2], nums[-1]))
    return rows


def main():
    index = {s["id"]: s for s in json.loads((WEB_DATA / "index.json").read_text())["sites"]}
    n = len(horizons_azel("10", -85, 0, 0))  # number of epochs in the window
    ets = ephem.epochs(START.replace(" ", "T") + ":00", n, step_h=6)
    out = []
    for sid in SITES:
        s = index.get(sid)
        if not s:
            print(f"skip {sid}: not built")
            continue
        h = (s["height_m"] or 0) + MASTS[0]["offset_m"]
        lat = nudge_off_pole(s["lat"])
        for body, (cmd, naif) in BODIES.items():
            az, el, _ = ephem.az_el(ephem.body_vectors(ets, naif), lat, s["lon"], h)
            jpl = horizons_azel(cmd, s["lat"], s["lon"], h / 1000)
            for i, (t, jaz, jel) in enumerate(jpl):
                daz = (az[i] - jaz + 180) % 360 - 180
                out.append({"site": s["name"], "time": t, "body": body,
                            "ours_az": round(float(az[i]), 6), "ours_el": round(float(el[i]), 6),
                            "jpl_az": jaz, "jpl_el": jel,
                            "d_az": round(float(daz), 6), "d_el": round(float(el[i] - jel), 6)})
            print(f"  {sid:16s} {body:5s} max |d_el| = "
                  f"{max(abs(r['d_el']) for r in out if r['site'] == s['name'] and r['body'] == body):.6f} deg")
    summary = {
        "max_abs_d_el": max(abs(r["d_el"]) for r in out),
        "max_abs_d_az": max(abs(r["d_az"]) for r in out),
        "rms_d_el": float(np.sqrt(np.mean([r["d_el"] ** 2 for r in out]))),
        "n": len(out),
    }
    (WEB_DATA / "validation.json").write_text(json.dumps({
        "reference": "JPL Horizons API (observer ephemeris, airless apparent az/el, site on body 301)",
        "window": f"{START} to {STOP} UT every {STEP}",
        "summary": summary, "rows": out}, indent=1))
    print("summary:", summary)


if __name__ == "__main__":
    main()
