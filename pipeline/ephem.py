"""Sun and Earth azimuth/elevation from a lunar surface site, via NAIF SPICE (spiceypy).

Frame: MOON_ME (mean Earth / polar axis), the frame the LOLA DEMs are defined in.
Azimuth is clockwise from local north; at the south pole "north" is along the site's meridian.
"""
import numpy as np
import spiceypy as spice

from common import KERNEL_URLS, KERNELS, R_MOON_M

_loaded = False
FRAME = "MOON_ME"


def load_kernels():
    global _loaded, FRAME
    if _loaded:
        return
    for name in KERNEL_URLS:
        path = KERNELS / name
        if not path.exists():
            raise FileNotFoundError(f"{path} missing; run download.py first")
        spice.furnsh(str(path))
    # Older frame kernels lack the MOON_ME alias.
    if spice.namfrm("MOON_ME") == 0:
        FRAME = "MOON_ME_DE440_ME421"
    _loaded = True


def epochs(start_utc, hours, step_h=1):
    load_kernels()
    et0 = spice.str2et(start_utc)
    return et0 + 3600.0 * step_h * np.arange(hours)


def body_vectors(ets, target):
    """Moon-centered target positions (km) in MOON_ME, corrected for light time and aberration."""
    load_kernels()
    pos, _ = spice.spkpos(target, ets, FRAME, "LT+S", "MOON")
    return np.asarray(pos)


def local_axes(lat_deg, lon_deg):
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.cross(up, east)
    return east, north, up


def az_el(vecs_moon_km, lat_deg, lon_deg, height_m):
    """Topocentric azimuth/elevation (deg) and range (km) of Moon-centered vectors seen from a site."""
    east, north, up = local_axes(lat_deg, lon_deg)
    site = up * (R_MOON_M + height_m) / 1000.0
    v = vecs_moon_km - site
    rng = np.linalg.norm(v, axis=1)
    e, n, u = v @ east, v @ north, v @ up
    az = np.degrees(np.arctan2(e, n)) % 360
    el = np.degrees(np.arcsin(u / rng))
    return az, el, rng
