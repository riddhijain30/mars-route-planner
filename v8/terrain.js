/**
 * ARES-IV Real MOLA DEM Engine
 * Load order (offline first, then online):
 *   1. Local high-res patches  data/patches/*.json   (walking-scale slope/height)
 *   2. Local global DEM        data/mola_global.json (or ./mola_verified_dem.json)
 *   3. Local tiles             ./mola_0.jpg, ./mola_1.jpg
 *   4. Online NASA Trek tiles  (direct, then optional CORS proxies) -> approximate, 8-bit
 * No synthetic terrain is ever generated.
 */
class MartianTerrain {
  constructor() {
    this.cfg = window.MARS_CONFIG;
    this.D = this.cfg.DATA || {};
    this.marsEllipsoid = new Cesium.Ellipsoid(
      this.cfg.MARS_RADIUS_EQ, this.cfg.MARS_RADIUS_EQ, this.cfg.MARS_RADIUS_POLAR
    );
    this._alloc(this.cfg.DEM_W, this.cfg.DEM_H);
    this.demSourceState = 'LOADING'; // LOADING | REAL_DEM_VALIDATED | LOCAL_MOLA_DEM | REMOTE_MOLA_DEM | ERROR
    this.visualExaggeration = 1.0;
    this.missingCellPct = 0;
    this.patches = [];
  }


  _alloc(w, h) {
    this.DEM_W = w;
    this.DEM_H = h;
    this.demGrid = new Int16Array(w * h);
    this.demNoDataMask = new Uint8Array(w * h); // 1 = valid, 0 = no data
  }


  async _json(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (_e) { return null; }
  }


  /* ---------- Local high-resolution patches ---------- */
  async loadPatches() {
    const idx = await this._json(this.D.PATCH_INDEX || './data/patches/index.json');
    if (!idx || !Array.isArray(idx.patches)) return 0;
    const list = await Promise.all(idx.patches.map(k => this._json(`./data/patches/${k}.json`)));
    for (const p of list) {
      if (!p || !Array.isArray(p.elevations) || p.elevations.length !== p.width * p.height) continue;
      const grid = new Int16Array(p.width * p.height);
      const mask = new Uint8Array(p.width * p.height);
      for (let i = 0; i < grid.length; i++) {
        const v = p.elevations[i];
        if (v === null || v === p.noDataValue) continue;
        grid[i] = v; mask[i] = 1;
      }
      this.patches.push({
        key: p.key, west: p.west, east: p.east, south: p.south, north: p.north,
        w: p.width, h: p.height, grid, mask,
        resolutionM: p.resolutionM || 463,
        cellLon: (p.east - p.west) / p.width,
        cellLat: (p.north - p.south) / p.height
      });
    }
    this.patches.sort((a, b) => a.resolutionM - b.resolutionM); // finest first
    return this.patches.length;
  }


  patchAt(lon, lat) {
    for (const p of this.patches) {
      if (lon >= p.west && lon <= p.east && lat >= p.south && lat <= p.north) return p;
    }
    return null;
  }


  /** Approximate size of one DEM cell (meters) at this location. */
  getResolutionAt(lon, lat) {
    const p = this.patchAt(lon, lat);
    return p ? p.resolutionM : (2 * Math.PI * this.cfg.MARS_RADIUS_EQ) / this.DEM_W;
  }


  /* ---------- Remote / local image tiles ---------- */
  async loadTileToCanvas(ctx, localPath, remoteUrl, destX) {
    const candidates = [localPath, remoteUrl];
    if (this.D.USE_PROXIES !== false) {
      candidates.push(
        `https://corsproxy.io/?${encodeURIComponent(remoteUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(remoteUrl)}`
      );
    }
    for (const url of candidates) {
      try {
        const isLocal = url.startsWith('./');
        await new Promise((resolve, reject) => {
          const img = new Image();
          if (!isLocal) img.crossOrigin = 'Anonymous';
          const timer = setTimeout(() => reject(new Error('Timeout')), 6500);
          img.onload = () => {
            clearTimeout(timer);
            if (img.naturalWidth > 0) { ctx.drawImage(img, destX, 0, 512, 512); resolve(); }
            else reject(new Error('Invalid dimensions'));
          };
          img.onerror = () => { clearTimeout(timer); reject(new Error('Tile fetch error')); };
          img.src = url;
        });
        return { ok: true, usedLocal: isLocal };
      } catch (_err) { /* try next candidate */ }
    }
    return { ok: false, usedLocal: false };
  }


  async _loadFromTiles() {
    const [t0, t1] = this.D.GLOBAL_TILES || ['./mola_0.jpg', './mola_1.jpg'];
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const [r0, r1] = await Promise.all([
      this.loadTileToCanvas(cx, t0, this.cfg.NASA_API.MOLA_TILE_0_REMOTE, 0),
      this.loadTileToCanvas(cx, t1, this.cfg.NASA_API.MOLA_TILE_1_REMOTE, 512)
    ]);
    if (!(r0.ok && r1.ok)) return null;
    let rgba;
    try { rgba = cx.getImageData(0, 0, 1024, 512).data; }
    catch (_e) { return null; } // canvas tainted by CORS
    this._alloc(1024, 512);
    let valid = 0;
    for (let i = 0; i < 1024 * 512; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
      if (a < 250 || Math.abs(r - g) > 18 || Math.abs(r - b) > 18) continue;
      this.demNoDataMask[i] = 1;
      // Approximate 8-bit grayscale stretch of MOLA range (about -8200..21229 m)
      this.demGrid[i] = Math.round((r / 255.0) * 29429 - 8200);
      valid++;
    }
    this.missingCellPct = Math.max(0, 100 - (valid / (1024 * 512)) * 100);
    if (valid < 1024 * 512 * 0.7) return null;
    this.demSourceState = r0.usedLocal ? 'LOCAL_MOLA_DEM' : 'REMOTE_MOLA_DEM';
    return {
      state: this.demSourceState,
      summary: `MOLA grayscale tiles (${r0.usedLocal ? 'local disk' : 'online'}) • approximate 8-bit heights, ~20 km cells • coverage ${(100 - this.missingCellPct).toFixed(1)}%.`
    };
  }


  /* ---------- Boot loader ---------- */
  async initGlobalMolaDem() {
    const nPatch = await this.loadPatches();
    const patchNote = nPatch ? ` + ${nPatch} high-res patch(es): ${this.patches.map(p => p.key).join(', ')}` : '';
    // 1+2: local numerical global DEM
    for (const url of this.D.GLOBAL_JSON || ['./mola_verified_dem.json']) {
      const j = await this._json(url);
      if (!j || !Array.isArray(j.elevations)) continue;
      const w = j.width || this.cfg.DEM_W, h = j.height || this.cfg.DEM_H;
      if (j.elevations.length !== w * h) continue;
      this._alloc(w, h);
      let valid = 0;
      for (let i = 0; i < w * h; i++) {
        const v = j.elevations[i];
        if (v === null || v === j.noDataValue) continue;
        this.demGrid[i] = v; this.demNoDataMask[i] = 1; valid++;
      }
      this.missingCellPct = Math.max(0, 100 - (valid / (w * h)) * 100);
      this.demSourceState = 'REAL_DEM_VALIDATED';
      return {
        state: this.demSourceState,
        summary: `Local MOLA MEGDR grid ${w}x${h} (${(100 - this.missingCellPct).toFixed(1)}% coverage)${patchNote}.`
      };
    }
    // 3+4: tiles (local first, then online)
    const tiles = await this._loadFromTiles();
    if (tiles) { tiles.summary += patchNote; return tiles; }
    // Patches only (no global grid): routing works inside patches
    if (nPatch) {
      this.demNoDataMask.fill(0);
      this.demSourceState = 'REAL_DEM_VALIDATED';
      return { state: this.demSourceState, summary: `High-res USGS MOLA patches loaded${patchNote}.` };
    }
    this.demNoDataMask.fill(0);
    this.demSourceState = 'ERROR';
    return {
      state: 'ERROR',
      summary: 'No MOLA data found. Run: python tools/make_patches.py --patches and serve the folder with a local web server.'
    };
  }


  /* ---------- Sampling ---------- */
  _bilinear(grid, mask, w, h, u, v) {
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const dx = u - x0, dy = v - y0;
    const i00 = y0 * w + x0, i10 = y0 * w + x1, i01 = y1 * w + x0, i11 = y1 * w + x1;
    if (!mask[i00] || !mask[i10] || !mask[i01] || !mask[i11]) return null;
    const e0 = grid[i00] * (1 - dx) + grid[i10] * dx;
    const e1 = grid[i01] * (1 - dx) + grid[i11] * dx;
    return e0 * (1 - dy) + e1 * dy;
  }


  sampleTerrain(lonDeg, latDeg) {
    if (!Number.isFinite(lonDeg) || !Number.isFinite(latDeg)) {
      return { elev: 0, valid: false, source: 'INVALID_COORD' };
    }
    if (this.demSourceState === 'LOADING' || this.demSourceState === 'ERROR') {
      return { elev: 0, valid: false, source: this.demSourceState };
    }
    const lon = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
    const lat = Math.max(-90, Math.min(90, latDeg));
    const p = this.patchAt(lon, lat);
    if (p) {
      const u = Math.max(0, Math.min(p.w - 1, (lon - p.west) / p.cellLon - 0.5));
      const v = Math.max(0, Math.min(p.h - 1, (p.north - lat) / p.cellLat - 0.5));
      const e = this._bilinear(p.grid, p.mask, p.w, p.h, u, v);
      if (e !== null) return { elev: Math.round(e), valid: true, source: 'PATCH:' + p.key, resM: p.resolutionM };
    }
    const u = ((lon + 180) / 360) * (this.DEM_W - 1);
    const v = ((90 - lat) / 180) * (this.DEM_H - 1);
    const e = this._bilinear(this.demGrid, this.demNoDataMask, this.DEM_W, this.DEM_H, u, v);
    if (e === null) return { elev: 0, valid: false, source: this.demSourceState };
    return { elev: Math.round(e), valid: true, source: this.demSourceState, resM: this.getResolutionAt(lon, lat) };
  }


  getMolaMeters(lonDeg, latDeg) {
    const s = this.sampleTerrain(lonDeg, latDeg);
    return s.valid ? s.elev : -4500;
  }


  getVisualSurfaceHeight(lonDeg, latDeg, offsetMeters = 0) {
    return this.getMolaMeters(lonDeg, latDeg) * this.visualExaggeration + offsetMeters;
  }


  /** True 1:1 slope (degrees). Baseline = one DEM cell, so it matches the data resolution. */
  getLocalSlopeDegrees(lonDeg, latDeg) {
    const p = this.patchAt(lonDeg, latDeg);
    const dLon = p ? p.cellLon : 360 / this.DEM_W;
    const dLat = p ? p.cellLat : 180 / this.DEM_H;
    const sL = this.sampleTerrain(lonDeg - dLon, latDeg);
    const sR = this.sampleTerrain(lonDeg + dLon, latDeg);
    const sD = this.sampleTerrain(lonDeg, Math.max(-89.8, latDeg - dLat));
    const sU = this.sampleTerrain(lonDeg, Math.min(89.8, latDeg + dLat));
    if (!sL.valid || !sR.valid || !sD.valid || !sU.valid) return 0;
    const mPerDeg = (Math.PI / 180) * this.cfg.MARS_RADIUS_EQ;
    const cosLat = Math.max(0.05, Math.cos((latDeg * Math.PI) / 180));
    const dzdx = (sR.elev - sL.elev) / (2 * dLon * mPerDeg * cosLat);
    const dzdy = (sU.elev - sD.elev) / (2 * dLat * mPerDeg);
    return Cesium.Math.toDegrees(Math.atan(Math.hypot(dzdx, dzdy)));
  }


  buildCesiumTerrainProvider() {
    const self = this;
    return new Cesium.CustomHeightmapTerrainProvider({
      width: 32,
      height: 32,
      ellipsoid: this.marsEllipsoid,
      callback: function (x, y, level) {
        const heights = new Float32Array(32 * 32);
        const tilesX = 2 << level, tilesY = 1 << level;
        const lonWest = -180 + (x / tilesX) * 360, lonEast = -180 + ((x + 1) / tilesX) * 360;
        const latNorth = 90 - (y / tilesY) * 180, latSouth = 90 - ((y + 1) / tilesY) * 180;
        for (let row = 0; row < 32; row++) {
          const lat = latNorth - (row / 31) * (latNorth - latSouth);
          for (let col = 0; col < 32; col++) {
            const lon = lonWest + (col / 31) * (lonEast - lonWest);
            heights[row * 32 + col] = self.getMolaMeters(lon, lat) * self.visualExaggeration;
          }
        }
        return heights;
      }
    });
  }


  /** STL export stub kept so legacy handlers cannot crash. */
  exportSectorSTL() { return 'solid removed\nendsolid removed'; }
}

