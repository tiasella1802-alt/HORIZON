"""Sanity checks for the DEM projection and horizon code. Run after download.py.

1. Pixel <-> lat/lon round trip.
2. Different-resolution DEMs agree at the same points (a mirrored or rotated projection would not).
3. Shackleton's floor is far below its rim at the USGS center (a wrong longitude sign would miss it).
4. A known-flat check: the horizon of a bare sphere matches the analytic dip angle.
"""
import numpy as np

from common import DEMS, R_MOON_M
from dem import MultiDEM, PolarDEM
from horizon import compute_horizon, destination


def main():
    fine = PolarDEM(DEMS / "LDEM_85S_40M.IMG")
    coarse = PolarDEM(DEMS / "LDEM_80S_80M.IMG")

    rng = np.random.default_rng(1)
    lat = np.radians(rng.uniform(-89.9, -85.5, 2000))
    lon = np.radians(rng.uniform(-180, 180, 2000))
    r, c = fine.latlon_to_pixel(lat, lon)
    lat2, lon2 = fine.pixel_to_latlon(r, c)
    err = np.degrees(np.abs(np.angle(np.exp(1j * (lon2 - lon))))).max()
    print(f"1. round trip: max lat err {np.degrees(np.abs(lat2 - lat)).max():.2e} deg, lon err {err:.2e} deg")

    hf, hc = fine.sample(lat, lon), coarse.sample(lat, lon)
    d = hf - hc
    print(f"2. 40 m vs 80 m DEM at 2000 points: median |diff| {np.median(np.abs(d)):.1f} m, "
          f"95th pct {np.percentile(np.abs(d), 95):.1f} m, correlation {np.corrcoef(hf, hc)[0, 1]:.4f}")

    mdem = MultiDEM()
    c_lat, c_lon = np.radians(-89.67), np.radians(129.78)
    floor = mdem.sample(np.array([c_lat]), np.array([c_lon]))[0]
    az = np.radians(np.arange(0, 360, 2))
    rim_lat, rim_lon = destination(c_lat, c_lon, az, 10.5e3)
    rim = np.nanmedian(mdem.sample(rim_lat, rim_lon))
    mirrored = mdem.sample(np.array([c_lat]), np.array([-c_lon]))[0]
    print(f"3. Shackleton: floor {floor:.0f} m, rim median {rim:.0f} m, depth {rim - floor:.0f} m "
          f"(same latitude, mirrored longitude: {mirrored:.0f} m)")

    class Flat:  # a perfectly smooth sphere
        finest_scale = 40.0

        def sample(self, la, lo):
            return np.zeros(np.broadcast(la, lo).shape)

    _, prof, _, _ = compute_horizon(Flat(), -88.0, 0.0, [10.0], az_step=10, d_max=50e3)
    analytic = -np.degrees(np.arccos(R_MOON_M / (R_MOON_M + 10.0)))
    print(f"4. smooth sphere, 10 m mast: horizon {prof[10.0].mean():.4f} deg vs analytic {analytic:.4f} deg")


if __name__ == "__main__":
    main()
