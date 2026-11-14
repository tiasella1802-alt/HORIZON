"""Read LOLA polar stereographic GDR DEMs (PDS3 .IMG + .LBL) and sample them by lat/lon.

Projection follows the LOLA DSMAP_POLAR.CAT description for the south pole:
longitude 0 points up (toward Earth), 90E points right, sphere radius 1737.4 km.
"""
import re
from pathlib import Path

import numpy as np

from common import DEM_PRODUCTS, DEMS, R_MOON_M


class PolarDEM:
    def __init__(self, img_path):
        img_path = Path(img_path)
        lbl = img_path.with_suffix(".LBL").read_text(errors="ignore")

        def kw(name):
            m = re.search(rf"^\s*{name}\s*=\s*([^\s<]+)", lbl, re.M)
            if not m:
                raise ValueError(f"{name} missing in {img_path.name} label")
            return m.group(1).strip("'\"")

        self.name = img_path.stem
        self.n = int(kw("LINES"))
        if int(kw("LINE_SAMPLES")) != self.n:
            raise ValueError("expected a square DEM")
        if float(kw("CENTER_LATITUDE")) != -90:
            raise ValueError("only south polar DEMs are supported")
        if int(kw("SAMPLE_BITS")) != 16:
            raise ValueError("expected 16-bit samples")
        self.scale = float(kw("MAP_SCALE"))
        self.k = float(kw("SCALING_FACTOR"))
        self.data = np.memmap(img_path, dtype="<i2", mode="r", shape=(self.n, self.n))

    def latlon_to_pixel(self, lat, lon):
        """Fractional 0-based (row, col) for planetocentric lat/lon in radians."""
        rho = 2 * R_MOON_M * np.tan((np.pi / 2 + lat) / 2)
        x = rho * np.sin(lon)
        y = rho * np.cos(lon)
        col = x / self.scale + self.n / 2 - 0.5
        row = -y / self.scale + self.n / 2 - 0.5
        return row, col

    def pixel_to_latlon(self, row, col):
        x = (col - self.n / 2 + 0.5) * self.scale
        y = -(row - self.n / 2 + 0.5) * self.scale
        rho = np.hypot(x, y)
        lat = -np.pi / 2 + 2 * np.arctan(0.5 * rho / R_MOON_M)
        lon = np.arctan2(x, y)
        return lat, lon

    def sample(self, lat, lon):
        """Bilinear height (m above the 1737.4 km sphere); NaN outside this DEM."""
        row, col = self.latlon_to_pixel(lat, lon)
        out = np.full(np.shape(row), np.nan)
        ok = (row >= 0) & (col >= 0) & (row < self.n - 1) & (col < self.n - 1)
        if not ok.any():
            return out
        r, c = row[ok], col[ok]
        r0, c0 = np.floor(r).astype(np.int64), np.floor(c).astype(np.int64)
        fr, fc = r - r0, c - c0
        d = self.data
        v = (d[r0, c0] * (1 - fr) * (1 - fc) + d[r0, c0 + 1] * (1 - fr) * fc
             + d[r0 + 1, c0] * fr * (1 - fc) + d[r0 + 1, c0 + 1] * fr * fc)
        out[ok] = v * self.k
        return out


class MultiDEM:
    """Samples the finest available DEM at each point, falling back to coarser ones."""

    def __init__(self, products=DEM_PRODUCTS, folder=DEMS):
        self.dems = [PolarDEM(folder / f"{p}.IMG") for p in products if (folder / f"{p}.IMG").exists()]
        if not self.dems:
            raise FileNotFoundError(f"no LOLA DEMs in {folder}; run download.py first")

    @property
    def finest_scale(self):
        return min(d.scale for d in self.dems)

    def sample(self, lat, lon):
        lat, lon = np.broadcast_arrays(np.asarray(lat, float), np.asarray(lon, float))
        out = np.full(lat.shape, np.nan)
        for dem in self.dems:
            todo = np.isnan(out)
            if not todo.any():
                break
            out[todo] = dem.sample(lat[todo], lon[todo])
        return out

    def source_at(self, lat, lon):
        for dem in self.dems:
            if not np.isnan(dem.sample(np.array([lat]), np.array([lon]))[0]):
                return dem.name
        return None
