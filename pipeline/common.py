"""Shared paths and constants for the HORIZON pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
KERNELS = RAW / "kernels"
DEMS = RAW / "dem"
WEB_DATA = ROOT / "web" / "public" / "data"

# LOLA reference sphere (all LOLA polar GDR products use it)
R_MOON_M = 1737400.0
R_SUN_KM = 695700.0

# Heights above the DEM surface for which horizons are computed.
# "0 m" is placed 0.5 m above the surface so the observer never sits inside interpolated terrain.
MASTS = [
    {"label": "0 m", "offset_m": 0.5},
    {"label": "2 m", "offset_m": 2.0},
    {"label": "10 m", "offset_m": 10.0},
]

# Finest first. The 875S_20M product is optional (adds detail within ~75 km of the pole).
# LDEM_60S_240M reaches past 69 S, for the Chandrayaan-3 mission replay.
DEM_PRODUCTS = ["LDEM_875S_20M", "LDEM_85S_40M", "LDEM_80S_80M", "LDEM_75S_240M", "LDEM_60S_240M"]
DEM_REQUIRED = ["LDEM_85S_40M", "LDEM_80S_80M", "LDEM_75S_240M", "LDEM_60S_240M"]
DEM_BASE_URL = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/"

# Independent reference: NASA GSFC average illumination / Earth visibility maps (Mazarico et al. 2011),
# averaged over hourly steps spanning 18.6 years. Finest first.
ILLUMINATION = RAW / "illumination"
ILLUMINATION_BASE_URL = "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/"
ILLUMINATION_SUN = ["AVGVISIB_85S_060M_201608", "AVGVISIB_75S_120M_201608"]
ILLUMINATION_EARTH = [p + "_EARTH" for p in ILLUMINATION_SUN]
ILLUMINATION_PRODUCTS = ILLUMINATION_SUN + ILLUMINATION_EARTH

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNEL_URLS = {
    "naif0012.tls": NAIF + "lsk/naif0012.tls",
    "de440s.bsp": NAIF + "spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc": NAIF + "pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": NAIF + "fk/satellites/moon_de440_250416.tf",
}
