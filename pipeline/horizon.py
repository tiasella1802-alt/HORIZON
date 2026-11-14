"""Terrain horizon profiles: for each azimuth, the highest elevation angle of terrain
seen from a site, found by marching rays outward over the LOLA DEMs on a sphere."""
import numpy as np

from common import R_MOON_M


def destination(lat0, lon0, az, dist_m):
    """Great-circle destination (radians) from (lat0, lon0) along azimuth az for dist_m."""
    delta = dist_m / R_MOON_M
    sin_lat = np.sin(lat0) * np.cos(delta) + np.cos(lat0) * np.sin(delta) * np.cos(az)
    lat = np.arcsin(np.clip(sin_lat, -1, 1))
    lon = lon0 + np.arctan2(np.sin(az) * np.sin(delta) * np.cos(lat0),
                            np.cos(delta) - np.sin(lat0) * sin_lat)
    return lat, lon


def ray_distances(d_min, d_max=300e3, growth=1.004):
    n = int(np.ceil(np.log(d_max / d_min) / np.log(growth))) + 1
    return d_min * growth ** np.arange(n)


def nudge_off_pole(lat_deg):
    # Exactly at the pole every direction is "north"; stay ~30 m away so local axes are defined.
    return max(lat_deg, -89.999)


def compute_horizon(mdem, lat_deg, lon_deg, mast_offsets_m, az_step=0.5, d_max=300e3, chunk=48):
    """Returns azimuths (deg), {offset: elevation angles (deg)}, blocking distances (m, first mast),
    and the site's surface height (m above the 1737.4 km sphere)."""
    lat0 = np.radians(nudge_off_pole(lat_deg))
    lon0 = np.radians(lon_deg)
    h_site = float(mdem.sample(np.array([lat0]), np.array([lon0]))[0])
    az = np.radians(np.arange(0, 360, az_step))
    if np.isnan(h_site):
        # Outside terrain coverage: smooth-sphere horizon (dip below horizontal from height h).
        prof = {m: np.full(az.size, -np.degrees(np.arccos(R_MOON_M / (R_MOON_M + m)))) for m in mast_offsets_m}
        return np.degrees(az), prof, np.full(az.size, np.nan), None

    # Start two fine pixels out: closer samples only see interpolation noise around the observer.
    d = ray_distances(2 * mdem.finest_scale, d_max)
    delta = d / R_MOON_M
    prof = {m: np.empty(az.size) for m in mast_offsets_m}
    block = np.empty(az.size)
    for i in range(0, az.size, chunk):
        a = az[i:i + chunk, None]
        lat, lon = destination(lat0, lon0, a, d[None, :])
        r2 = R_MOON_M + mdem.sample(lat, lon)  # NaN beyond all DEM coverage
        for j, m in enumerate(mast_offsets_m):
            r1 = R_MOON_M + h_site + m
            ang = np.arctan2(r2 * np.cos(delta) - r1, r2 * np.sin(delta))
            ang = np.where(np.isnan(ang), -np.inf, ang)
            prof[m][i:i + chunk] = np.degrees(ang.max(axis=1))
            if j == 0:
                block[i:i + chunk] = d[ang.argmax(axis=1)]
    return np.degrees(az), prof, block, h_site


def polar_heightmap(mdem, lat_deg, lon_deg, h_site, spokes=540, r0=30.0, r_max=150e3, growth=1.013):
    """Terrain around a site on a polar grid: `spokes` azimuths (clockwise from north) times rings
    spaced geometrically from r0 to r_max, so detail is fine near the site and coarse far away.
    Heights are meters relative to the site, including the drop from the Moon's curvature
    (r^2 / 2R) so 3D views show the same horizon geometry as the ray-marched profile."""
    lat0, lon0 = np.radians(nudge_off_pole(lat_deg)), np.radians(lon_deg)
    n_r = int(np.ceil(np.log(r_max / r0) / np.log(growth))) + 1
    r = r0 * growth ** np.arange(n_r)
    az = np.radians(np.arange(spokes) * 360.0 / spokes)
    lat, lon = destination(lat0, lon0, az[:, None], r[None, :])
    z = mdem.sample(lat, lon) - h_site - r[None, :] ** 2 / (2 * R_MOON_M)
    return r, z


def snap_site(mdem, lat_deg, lon_deg, r_in_m, r_out_m, step_m=100, crest_m=1000):
    """Highest DEM point within r_out of a feature center (r_in=0), or, for a crater rim
    (r_in>0), the highest point on the ring that is also a radial crest: no higher ground
    within crest_m inward or outward. That keeps the pick off slopes of neighboring peaks."""
    lat0, lon0 = np.radians(lat_deg), np.radians(lon_deg)
    az = np.radians(np.arange(0, 360, 0.5))[:, None]
    pad = crest_m if r_in_m > 0 else 0
    d = np.arange(max(r_in_m - pad, step_m), r_out_m + pad + step_m, step_m)
    lat, lon = destination(lat0, lon0, az, d[None, :])
    h = mdem.sample(lat, lon)
    if np.all(np.isnan(h)):
        return lat_deg, lon_deg
    if r_in_m > 0:
        # Peak in both directions: radially +-crest_m, and +-1.5 deg of azimuth along the rim.
        w, a = int(crest_m // step_m), 3
        hp = np.pad(np.nan_to_num(h, nan=-1e9), ((a, a), (w, w)), mode="wrap")
        hp[:, :w] = hp[:, -w:] = -1e9
        local_max = np.lib.stride_tricks.sliding_window_view(hp, (2 * a + 1, 2 * w + 1)).max(axis=(2, 3))
        keep = (h >= local_max) & (d >= r_in_m)[None, :] & (d <= r_out_m)[None, :]
        h = np.where(keep, h, np.nan)
        if np.all(np.isnan(h)):
            print("    warning: no rim crest found in the ring; check ring_km")
            return lat_deg, lon_deg
    k = np.nanargmax(h)
    if r_in_m == 0 and np.unravel_index(k, h.shape)[1] >= d.size - 2:
        print(f"    warning: highest point is on the {r_out_m / 1000:.0f} km search edge; widen the radius")
    return float(np.degrees(lat.flat[k])), float((np.degrees(lon.flat[k]) + 180) % 360 - 180)
