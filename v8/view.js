/**
 * ARES-IV views: drone TOP VIEW, SLOPE MAP overlay, OBLIQUE 3D view and the
 * astronaut HUD (elevation, grade ahead, climb to next waypoint, profile strip).
 * Initialised from main.js via AresViews.init(window.ARES).
 */
window.AresViews = (function () {
  let A = null;              // { viewer, terrain, router, getWaypoints, getSite }
  let slopeLayer = null;
  let slopeOn = false;
  let lastHud = 0;
  const D2R = Math.PI / 180;
  const mPerDeg = () => D2R * A.terrain.cfg.MARS_RADIUS_EQ;
  const maxSlope = () => parseFloat(document.getElementById('max-slope-slider')?.value || '16');


  function slopeColor(deg) {
    const m = maxSlope();
    if (deg < m * 0.5) return [74, 222, 128, 150];   // green
    if (deg < m) return [250, 204, 21, 170];          // yellow
    return [239, 68, 68, 190];                        // red
  }


  function bounds() {
    const wps = A.getWaypoints();
    const site = A.getSite();
    let w, e, s, n;
    if (wps.length) {
      w = Math.min(...wps.map(p => p.lon)); e = Math.max(...wps.map(p => p.lon));
      s = Math.min(...wps.map(p => p.lat)); n = Math.max(...wps.map(p => p.lat));
    } else { w = e = site.lon; s = n = site.lat; }
    const spanLon = Math.max(0.1, (e - w) * 1.4), spanLat = Math.max(0.1, (n - s) * 1.4);
    const cx = (w + e) / 2, cy = (s + n) / 2;
    return {
      w: cx - spanLon / 2, e: cx + spanLon / 2,
      s: Math.max(-89, cy - spanLat / 2), n: Math.min(89, cy + spanLat / 2)
    };
  }


  function bearing(lon1, lat1, lon2, lat2) {
    const f1 = lat1 * D2R, f2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
    return Math.atan2(Math.sin(dl) * Math.cos(f2),
      Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl));
  }


  function offset(lon, lat, brg, distM) {
    const R = A.terrain.cfg.MARS_RADIUS_EQ;
    const dLat = (distM * Math.cos(brg)) / R / D2R;
    const dLon = (distM * Math.sin(brg)) / (R * Math.max(0.05, Math.cos(lat * D2R))) / D2R;
    return { lon: lon + dLon, lat: lat + dLat };
  }


  /* ---------- Slope map overlay ---------- */
  async function showSlope(on) {
    slopeOn = on;
    const { viewer, terrain } = A;
    if (slopeLayer) { viewer.imageryLayers.remove(slopeLayer, true); slopeLayer = null; }
    setStatus('');
    if (!on) return;
    const b = bounds(), N = 256;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const lon = b.w + ((x + 0.5) / N) * (b.e - b.w);
        const lat = b.n - ((y + 0.5) / N) * (b.n - b.s);
        const i = (y * N + x) * 4;
        if (!terrain.sampleTerrain(lon, lat).valid) continue; // transparent = no data
        const c = slopeColor(terrain.getLocalSlopeDegrees(lon, lat));
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3];
      }
    }
    cx.putImageData(img, 0, 0);
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(cv.toDataURL(), {
      rectangle: Cesium.Rectangle.fromDegrees(b.w, b.s, b.e, b.n),
      ellipsoid: terrain.marsEllipsoid
    });
    slopeLayer = viewer.imageryLayers.addImageryProvider(provider);
    const res = terrain.getResolutionAt((b.w + b.e) / 2, (b.s + b.n) / 2);
    setStatus(res > 1000
      ? `⚠ DEM cells ≈ ${(res / 1000).toFixed(1)} km: slope is NOT reliable here. Add a local patch.`
      : `DEM resolution ≈ ${Math.round(res)} m per cell`, res > 1000);
  }


  /* ---------- Cameras ---------- */
  function topDown() {
    const { viewer, terrain } = A;
    const b = bounds();
    const cx = (b.w + b.e) / 2, cy = (b.s + b.n) / 2;
    const spanM = Math.max((b.e - b.w) * mPerDeg() * Math.cos(cy * D2R), (b.n - b.s) * mPerDeg());
    const h = terrain.getVisualSurfaceHeight(cx, cy) + spanM * 1.0;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(cx, cy, h, terrain.marsEllipsoid),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1.5
    });
    showSlope(true);
  }


  function oblique() {
    const { viewer, terrain } = A;
    const wps = A.getWaypoints(), site = A.getSite();
    const a = wps[0] || site;
    const brg = wps.length > 1 ? bearing(wps[0].lon, wps[0].lat, wps[1].lon, wps[1].lat) : 0;
    const back = offset(a.lon, a.lat, brg + Math.PI, 600);
    const h = terrain.getVisualSurfaceHeight(back.lon, back.lat) + 350;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(back.lon, back.lat, h, terrain.marsEllipsoid),
      orientation: { heading: brg, pitch: -22 * D2R, roll: 0 },
      duration: 1.5
    });
  }


  /* ---------- UI ---------- */
  let statusEl, hudEl, hudText, hudCanvas;
  function setStatus(msg, warn) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = warn ? '#fca5a5' : '#cbd5e1';
  }


  function injectUI() {
    const host = document.getElementById('viewport-container') || document.body;
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;top:10px;right:10px;z-index:30;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font-family:monospace;';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-secondary';
      b.textContent = label;
      b.onclick = fn;
      return b;
    };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;';
    row.append(
      mk('🚁 TOP VIEW', topDown),
      mk('▲ OBLIQUE 3D', oblique),
      mk('🎨 SLOPE MAP', () => showSlope(!slopeOn))
    );
    const legend = document.createElement('div');
    legend.style.cssText = 'font-size:10px;color:#cbd5e1;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;';
    legend.innerHTML = '<span style="color:#4ade80">■</span> easy &nbsp;<span style="color:#facc15">■</span> steep &nbsp;<span style="color:#ef4444">■</span> over limit';
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:10px;max-width:320px;text-align:right;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;';
    bar.append(row, legend, statusEl);
    host.appendChild(bar);


    hudEl = document.createElement('div');
    hudEl.style.cssText = 'position:absolute;left:50%;bottom:38px;transform:translateX(-50%);z-index:30;display:none;background:rgba(2,6,23,.85);border:1px solid #38bdf8;border-radius:8px;padding:8px 10px;color:#e2e8f0;font:11px monospace;';
    hudText = document.createElement('div');
    hudCanvas = document.createElement('canvas');
    hudCanvas.width = 340; hudCanvas.height = 70;
    hudEl.append(hudText, hudCanvas);
    host.appendChild(hudEl);
  }


  /* ---------- Astronaut HUD ---------- */
  function updateHud() {
    const { viewer, terrain } = A;
    const cam = viewer.camera;
    const c = Cesium.Cartographic.fromCartesian(cam.positionWC, terrain.marsEllipsoid);
    const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
    const agl = c.height - terrain.getVisualSurfaceHeight(lon, lat);
    if (!(agl < 1500 && cam.pitch > -1.4)) { hudEl.style.display = 'none'; return; }
    hudEl.style.display = 'block';
    const res = terrain.getResolutionAt(lon, lat);
    const base = Math.max(50, 2 * res);          // never claim finer slope than the data allows
    const L = base * 8, n = 60, step = L / n;
    const z0 = terrain.getMolaMeters(lon, lat);
    const zs = [];
    for (let i = 0; i <= n; i++) {
      const p = offset(lon, lat, cam.heading, i * step);
      zs.push(terrain.getMolaMeters(p.lon, p.lat));
    }
    const zBase = zs[Math.round(base / step)];
    const grade = Math.atan((zBase - z0) / base) / D2R;
    let wpLine = '';
    const wps = A.getWaypoints();
    if (wps.length) {
      let best = null;
      wps.forEach((w, i) => {
        const dx = (w.lon - lon) * mPerDeg() * Math.cos(lat * D2R), dy = (w.lat - lat) * mPerDeg();
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { i, d, dz: terrain.getMolaMeters(w.lon, w.lat) - z0 };
      });
      wpLine = `<br>NEAREST WP ${best.i + 1}: ${(best.d / 1000).toFixed(2)} km • Δh ${best.dz >= 0 ? '+' : ''}${Math.round(best.dz)} m`;
    }
    const col = Math.abs(grade);
    hudText.innerHTML =
      `ELEV ${Math.round(z0)} m • ALT ABOVE GROUND ${Math.round(agl)} m<br>` +
      `GRADE AHEAD <b style="color:${col >= maxSlope() ? '#ef4444' : col >= maxSlope() / 2 ? '#facc15' : '#4ade80'}">${grade >= 0 ? '+' : ''}${grade.toFixed(1)}°</b> (over ${Math.round(base)} m)` +
      wpLine +
      `<br>DEM ≈ ${Math.round(res)} m/cell • profile ${(L / 1000).toFixed(1)} km ahead`;


    // profile strip
    const g = hudCanvas.getContext('2d');
    g.clearRect(0, 0, 340, 70);
    const mn = Math.min(...zs), mx = Math.max(...zs), span = Math.max(20, mx - mn);
    const X = i => 4 + (i / n) * 332;
    const Y = z => 64 - ((z - mn) / span) * 56;
    for (let i = 0; i < n; i++) {
      const sg = Math.abs(Math.atan((zs[i + 1] - zs[i]) / step) / D2R);
      g.strokeStyle = sg >= maxSlope() ? '#ef4444' : sg >= maxSlope() / 2 ? '#facc15' : '#4ade80';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(i), Y(zs[i])); g.lineTo(X(i + 1), Y(zs[i + 1])); g.stroke();
    }
    g.fillStyle = '#38bdf8';
    g.fillRect(3, 4, 2, 62);
    g.fillStyle = '#94a3b8';
    g.font = '9px monospace';
    g.fillText('YOU', 8, 12);
    g.fillText(`${Math.round(mx)} m`, 300, 12);
    g.fillText(`${Math.round(mn)} m`, 300, 66);
  }


  function init(ctx) {
    A = ctx;
    injectUI();
    A.viewer.scene.postRender.addEventListener(() => {
      const t = performance.now();
      if (t - lastHud < 250) return;
      lastHud = t;
      try { updateHud(); } catch (_e) { hudEl.style.display = 'none'; }
    });
    document.getElementById('btn-compute-route')?.addEventListener('click', () => {
      if (slopeOn) setTimeout(() => showSlope(true), 400);
    });
    document.getElementById('max-slope-slider')?.addEventListener('change', () => { if (slopeOn) showSlope(true); });
  }


  return { init, showSlope, topDown, oblique };
})();

