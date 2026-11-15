window.AresViews = (function () {
 let A = null, slopeLayer = null, slopeOn = false, lastHud = 0;
 const D2R = Math.PI / 180, mPerDeg = () => D2R * A.terrain.cfg.MARS_RADIUS_EQ;
 const maxSlope = () => parseFloat(document.getElementById('max-slope-slider')?.value || '16');


 function slopeColor(deg) {
   const m = maxSlope();
   return deg < m * 0.5 ? [74, 222, 128, 150] : deg < m ? [250, 204, 21, 170] : [239, 68, 68, 190];
 }


 function bounds() {
   const wps = A.getWaypoints(), site = A.getSite();
   let w = wps.length ? Math.min(...wps.map(p => p.lon)) : site.lon;
   let e = wps.length ? Math.max(...wps.map(p => p.lon)) : site.lon;
   let s = wps.length ? Math.min(...wps.map(p => p.lat)) : site.lat;
   let n = wps.length ? Math.max(...wps.map(p => p.lat)) : site.lat;
   const cx = (w + e) / 2, cy = (s + n) / 2;
   return { w: cx - 0.5, e: cx + 0.5, s: Math.max(-89, cy - 0.5), n: Math.min(89, cy + 0.5) };
 }


 async function showSlope(on) {
   slopeOn = on; const { viewer, terrain } = A;
   if (slopeLayer) { viewer.imageryLayers.remove(slopeLayer, true); slopeLayer = null; }
   if (!on) return;
   const b = bounds(), N = 128, cv = document.createElement('canvas');
   cv.width = N; cv.height = N; const cx = cv.getContext('2d');
   const img = cx.createImageData(N, N);
   for (let y = 0; y < N; y++) {
     for (let x = 0; x < N; x++) {
       const lon = b.w + (x / N) * (b.e - b.w), lat = b.n - (y / N) * (b.n - b.s);
       const i = (y * N + x) * 4;
       if (!terrain.sampleTerrain(lon, lat).valid) continue;
       const c = slopeColor(terrain.getLocalSlopeDegrees(lon, lat));
       img.data[i] = c[0]; img.data[i+1] = c[1]; img.data[i+2] = c[2]; img.data[i+3] = c[3];
     }
   }
   cx.putImageData(img, 0, 0);
   const provider = await Cesium.SingleTileImageryProvider.fromUrl(cv.toDataURL(), {
     rectangle: Cesium.Rectangle.fromDegrees(b.w, b.s, b.e, b.n), ellipsoid: terrain.marsEllipsoid
   });
   slopeLayer = viewer.imageryLayers.addImageryProvider(provider);
 }


 function topDown() {
   const { viewer, terrain } = A, b = bounds();
   const cx = (b.w + b.e) / 2, cy = (b.s + b.n) / 2;
   viewer.camera.flyTo({
     destination: Cesium.Cartesian3.fromDegrees(cx, cy, 150000, terrain.marsEllipsoid),
     orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 }, duration: 1.0
   });
 }


 function oblique() {
   const { viewer, terrain } = A, site = A.getSite();
   viewer.camera.flyTo({
     destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat - 0.3, 30000, terrain.marsEllipsoid),
     orientation: { heading: 0, pitch: -35 * D2R, roll: 0 }, duration: 1.0
   });
 }


 function init(ctx) { A = ctx; }
 return { init, showSlope, topDown, oblique };
})();

