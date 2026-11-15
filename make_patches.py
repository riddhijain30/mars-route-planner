#!/usr/bin/env python3
"""
Cut real 16-bit MOLA elevation windows out of the USGS GeoTIFF into small JSON files.
Install once:
    pip install rasterio numpy
Run (downloads only small site windows over HTTP range requests):
    python tools/make_patches.py --patches
Run (optional global grid too; downloads or reads local 2 GB GeoTIFF):
    python tools/make_patches.py --src Mars_MGS_MOLA_DEM_mosaic_global_463m.tif --patches --global
"""
import argparse
import json
import os
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.enums import Resampling

URL = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
NODATA = -32768
SITES = {
    "gale": (137.44, -4.59),
    "jezero": (77.45, 18.44),
    "valles": (-72.0, -10.5),
    "olympus": (-133.8, 18.65),
    "insight": (135.62, 4.5),
    "viking1": (-47.95, 22.27),
}


def open_src(src):
    return rasterio.open(src if os.path.exists(src) else "/vsicurl/" + src)


class Geo:
    """Pixel geometry of the simple-cylindrical MOLA mosaic (128 px/deg, about +/-88 deg lat)."""

    def __init__(self, ds, lon_left):
        self.ds, self.W, self.H = ds, ds.width, ds.height
        self.ppd = self.W / 360.0
        self.lat_top = self.H / self.ppd / 2.0
        self.lon_left = lon_left

    def read(self, west, east, south, north):
        """Read a lon/lat box (degrees). Handles the 0/360 seam. Returns int32 array."""
        w0 = (west - self.lon_left) % 360.0
        c0 = int(round(w0 * self.ppd))
        cols = int(round((east - west) * self.ppd))
        r0 = max(0, int(round((self.lat_top - north) * self.ppd)))
        r1 = min(self.H, int(round((self.lat_top - south) * self.ppd)))
        rows = r1 - r0
        first = min(cols, self.W - c0)
        part = [self.ds.read(1, window=Window(c0, r0, first, rows))]
        if first < cols:
            part.append(self.ds.read(1, window=Window(0, r0, cols - first, rows)))
        arr = np.concatenate(part, axis=1)
        return np.rint(arr).astype(np.int32)


def sanity_check(geo):
    """Olympus Mons summit is about +21,000 m near 226.2E (-133.8E), 18.65N."""
    lon = 226.2 if geo.lon_left >= 0 else 226.2 - 360
    a = geo.read(lon - 0.2, lon + 0.2, 18.45, 18.85)
    print(f"Sanity check: Olympus Mons window max = {a.max()} m (expect ~21000)")
    if a.max() < 19000:
        print("WARNING: geometry assumption looks wrong. Try re-running with --lon-left -180")


def write_patch(geo, key, lon, lat, half, out):
    west, east, south, north = lon - half, lon + half, lat - half, lat + half
    arr = geo.read(west, east, south, north)
    h, w = arr.shape
    wn = ((west + 180) % 360) - 180
    data = {
        "key": key,
        "west": wn,
        "east": wn + (east - west),
        "south": south,
        "north": north,
        "width": w,
        "height": h,
        "noDataValue": NODATA,
        "resolutionM": round(463.0 * 128 / geo.ppd),
        "source": "MGS MOLA MEGDR 463m (USGS Astrogeology)",
        "elevations": arr.flatten().tolist(),
    }
    os.makedirs(f"{out}/patches", exist_ok=True)
    with open(f"{out}/patches/{key}.json", "w") as f:
        json.dump(data, f)
    print(f"patch {key}: {w}x{h}, min {arr.min()} m, max {arr.max()} m")


def write_global(geo, out, gw, gh):
    frac = 2 * geo.lat_top / 180.0
    oh = int(round(gh * frac))
    arr = geo.ds.read(1, out_shape=(oh, gw), resampling=Resampling.average)
    arr = np.rint(arr).astype(np.int32)
    if geo.lon_left >= 0:
        arr = np.roll(arr, -gw // 2, axis=1)
    top = (gh - oh) // 2
    full = np.full((gh, gw), NODATA, dtype=np.int32)
    full[top : top + oh, :] = arr
    os.makedirs(out, exist_ok=True)
    with open(f"{out}/mola_global.json", "w") as f:
        json.dump(
            {
                "width": gw,
                "height": gh,
                "noDataValue": NODATA,
                "elevations": full.flatten().tolist(),
            },
            f,
        )
    print(f"global grid {gw}x{gh} written to {out}/mola_global.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=URL)
    ap.add_argument("--out", default="data")
    ap.add_argument("--lon-left", type=float, default=0.0, help="longitude of column 0 (0 for 0-360E mosaics, -180 otherwise)")
    ap.add_argument("--half", type=float, default=0.75, help="patch half-size in degrees (0.75 = ~90 km box)")
    ap.add_argument("--patches", action="store_true")
    ap.add_argument("--global", dest="glob", action="store_true")
    ap.add_argument("--gw", type=int, default=1024)
    ap.add_argument("--gh", type=int, default=512)
    ap.add_argument("--site", action="append", default=[], help="name:lon:lat (east longitude, -180..180)")
    a = ap.parse_args()

    ds = open_src(a.src)
    geo = Geo(ds, a.lon_left)
    print(f"Source {ds.width}x{ds.height}, {geo.ppd:.1f} px/deg, lat +/-{geo.lat_top:.1f}")
    sanity_check(geo)

    sites = dict(SITES)
    for s in a.site:
        k, lo, la = s.split(":")
        sites[k] = (float(lo), float(la))

    if a.patches:
        for k, (lo, la) in sites.items():
            write_patch(geo, k, lo, la, a.half, a.out)
        with open(f"{a.out}/patches/index.json", "w") as f:
            json.dump({"patches": list(sites.keys())}, f)

    if a.glob:
        write_global(geo, a.out, a.gw, a.gh)


if __name__ == "__main__":
    main()
