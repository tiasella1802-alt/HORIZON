"""Download the LOLA polar DEMs and NAIF SPICE kernels HORIZON needs.

Usage:  python download.py            (required files, ~295 MB)
        python download.py --fine     (also LDEM_875S_20M, +115 MB)
"""
import argparse
import sys
import urllib.request

from common import (DEM_BASE_URL, DEM_REQUIRED, DEMS, ILLUMINATION, ILLUMINATION_BASE_URL, ILLUMINATION_PRODUCTS,
                    KERNEL_URLS, KERNELS)


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  have {dest.name}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  get  {url}")
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                sys.stdout.write(f"\r       {done / 1e6:7.1f} / {total / 1e6:.1f} MB")
                sys.stdout.flush()
    if total:
        print()
    tmp.replace(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fine", action="store_true", help="also fetch LDEM_875S_20M")
    ap.add_argument("--illumination", action="store_true",
                    help="also fetch NASA GSFC average Sun/Earth visibility maps for validate_illumination.py (~334 MB)")
    args = ap.parse_args()

    if args.illumination:
        print("NASA GSFC polar illumination maps (Mazarico et al. 2011)")
        for p in ILLUMINATION_PRODUCTS:
            fetch(ILLUMINATION_BASE_URL + p + ".LBL", ILLUMINATION / (p + ".LBL"))
            fetch(ILLUMINATION_BASE_URL + p + ".IMG", ILLUMINATION / (p + ".IMG"))

    print("SPICE kernels")
    for name, url in KERNEL_URLS.items():
        fetch(url, KERNELS / name)

    print("LOLA polar DEMs")
    products = DEM_REQUIRED + (["LDEM_875S_20M"] if args.fine else [])
    for p in products:
        fetch(DEM_BASE_URL + p + ".LBL", DEMS / (p + ".LBL"))
        fetch(DEM_BASE_URL + p + ".IMG", DEMS / (p + ".IMG"))
    print("done")


if __name__ == "__main__":
    main()
