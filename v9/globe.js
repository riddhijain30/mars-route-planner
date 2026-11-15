/**
* v9: Mars geodesy, solar geometry, thermal/IR physics and the 3D globe (Three.js r128).
* Load after config.js and before terrain.js.
*/
(function () {
 const D = Math.PI / 180, C = window.MARS_CONFIG, M = C.MARS, SIG = 5.670374e-8;
 const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));


 const Geo = {
   e2: 1 - (M.B * M.B) / (M.A * M.A),
   mPerDegLat(phi) { const s = Math.sin(phi * D); return (D * M.A * (1 - this.e2)) / Math.pow(1 - this.e2 * s * s, 1.5); },
   mPerDegLon(phi) { const s = Math.sin(phi * D); return (D * M.A * Math.cos(phi * D)) / Math.sqrt(1 - this.e2 * s * s); },
   haversine(a, b) {
     const p1 = a.lat * D, p2 = b.lat * D, dl = (b.lon - a.lon) * D;
     const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
     return 2 * M.MEAN * Math.asin(Math.min(1, Math.sqrt(h)));
   },
   bearing(a, b) {
     const p1 = a.lat * D, p2 = b.lat * D, dl = (b.lon - a.lon) * D;
     return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D) + 360) % 360;
   },
   solar(lat, t, ls) {
     const p = lat * D, dec = Math.asin(Math.sin(M.OBLIQ * D) * Math.sin(ls * D)), h = ((t - 12) / 24) * 2 * Math.PI;
     const e = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(h));
     const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(p) - Math.cos(dec) * Math.sin(p) * Math.cos(h));
     const r = (M.SMA_AU * (1 - M.ECC ** 2)) / (1 + M.ECC * Math.cos((ls - M.PERI_LS) * D));
     return { decDeg: dec / D, elevDeg: e / D, azDeg: (az / D + 360) % 360, auDist: r, flux: 1361 / (r * r) };
   },
   // Radiative-balance skin temperature: night floor Tn (K), albedo 0.25, emissivity 0.98
   skinTemp(cosz, flux, Tn) { return Math.pow(Tn ** 4 + (0.75 * flux * Math.max(0, cosz)) / (0.98 * SIG), 0.25); },
   // Planck spectral radiance (W m-2 sr-1 m-1) at wavelength lam (m)
   planck(T, lam = 10e-6) {
     const h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
     return (2 * h * c * c) / Math.pow(lam, 5) / (Math.exp((h * c) / (lam * k * T)) - 1);
   },
 };
 window.MarsGeo = Geo;


 const ramp = (v, s) => { v = clamp(v) * (s.length - 1) * 0.9999; const i = v | 0, f = v - i, a = s[i], b = s[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
 const THM = [[42, 63, 156], [60, 140, 200], [240, 220, 120], [220, 60, 30]];
 const INF = [[0, 0, 4], [87, 15, 109], [187, 55, 84], [249, 142, 8], [252, 255, 164]];
 window.LAYER_LEGENDS = {
   thermal: ['SURFACE TEMPERATURE (RADIATIVE BALANCE)', [['#2a3f9c', '~150 K night'], ['#f0dc78', '~230 K'], ['#dc3c1e', '300 K+ at noon']]],
   infrared: ['INFRARED RADIANCE AT 10 µM (PLANCK)', [['#050004', 'Cold / low radiance'], ['#bb3754', 'Warm'], ['#fcffa4', 'Hot / high radiance']]],
   chemical: ['MINERAL UNITS (ILLUSTRATIVE, NOT CRISM)', [['#47a173', 'Clay-bearing (phyllosilicate)'], ['#bd3d33', 'Hematite-rich'], ['#ebc75c', 'Sulfate-bearing'], ['#323847', 'Basaltic / steep']]],
 };


 // lon east-positive 0-360; matches THREE.SphereGeometry u = lon/360
 const vec = (lon, lat, r) => { const l = lon * D, p = lat * D; return new THREE.Vector3(-r * Math.cos(p) * Math.cos(l), r * Math.sin(p), r * Math.cos(p) * Math.sin(l)); };
 const ll = (v) => ({ lat: Math.asin(clamp(v.y, -1, 1)) / D, lon: (Math.atan2(v.z, -v.x) / D + 360) % 360 });


 // Large-scale relief blobs: Olympus/Tharsis, Hellas, Argyre (amp km, unit vector, width deg)
 const BLOBS = [[14, 18.65, 226.2, 4], [8, 1, 248, 22], [-9, -42.4, 70, 12], [-3, -50, 317, 8]].map((b) => [b[0], vec(b[2], b[1], 1), b[3]]);
 // Procedural placeholder field: e = elevation (km), i = thermal-inertia proxy, c = composition field
 function field(lon, lat) {
   const v = vec(lon, lat, 1);
   const n = Math.sin(5 * v.x + 2 * v.y) * Math.cos(4 * v.z - v.x) * 0.5 + Math.sin(11 * v.x - 7 * v.y + 3 * v.z) * 0.25 + Math.sin(23 * v.z + 13 * v.y) * 0.12;
   let e = 2.2 * n - 2 * Math.sin(lat * D);
   for (const [a, w, s] of BLOBS) e += a * Math.exp(-((Math.acos(clamp(v.dot(w), -1, 1)) / (s * D)) ** 2));
   return { e, i: clamp(0.5 + 0.5 * n), c: Math.sin(9 * v.y + 4 * v.x) * Math.cos(6 * v.z) };
 }


 function label(text) {
   const c = document.createElement('canvas'); c.width = 256; c.height = 48;
   const x = c.getContext('2d'); x.font = '600 22px sans-serif'; x.fillStyle = '#f7dec8'; x.fillText(text, 6, 32);
   const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
   s.scale.set(34, 6.4, 1); return s;
 }


 class MarsGlobe {
   constructor(renderer, container) {
     this.renderer = renderer; this.container = container; this.active = false;
     this.R = C.GLOBE.RADIUS; this.K = (this.R / (M.MEAN / 1000)) * C.GLOBE.RELIEF;
     this.home = C.SITES[0]; this.kind = 'none'; this.relief = true; this.points = [];
     this.dyn = []; this.ptDyn = []; this.userTex = null; this.sunP = { dec: 0, lon: this.home.lon, flux: 590 };


     this.scene = new THREE.Scene();
     this.camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 1, 3000);
     this.camera.position.copy(vec(this.home.lon, this.home.lat, this.R * 3.4));
     this.controls = new THREE.OrbitControls(this.camera, renderer.domElement);
     Object.assign(this.controls, { enablePan: false, enableDamping: true, minDistance: this.R * 1.5, maxDistance: this.R * 6, enabled: false });
     this.sun = new THREE.DirectionalLight(0xfff0dd, 1.7);
     this.scene.add(this.sun, new THREE.AmbientLight(0x3a1c10, 0.55));


     // Surface texture (procedural, repainted per layer) and relief mesh
     this.W = 512; this.H = 256;
     this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
     this.ctx = this.cv.getContext('2d'); this.img = this.ctx.createImageData(this.W, this.H);
     this.tex = new THREE.CanvasTexture(this.cv);
     this.elev = new Float32Array(this.W * this.H); this.I = new Float32Array(this.W * this.H); this.n2 = new Float32Array(this.W * this.H);
     for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
       const f = field(((x + 0.5) / this.W) * 360, 90 - ((y + 0.5) / this.H) * 180), k = y * this.W + x;
       this.elev[k] = f.e; this.I[k] = f.i; this.n2[k] = f.c;
     }
     this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 });
     const geom = new THREE.SphereGeometry(this.R, 192, 96), pa = geom.attributes.position;
     this.dir = new Float32Array(pa.count * 3); this.ev = new Float32Array(pa.count);
     for (let i = 0; i < pa.count; i++) {
       const v = new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)).normalize(), p = ll(v);
       this.dir.set([v.x, v.y, v.z], 3 * i); this.ev[i] = field(p.lon, p.lat).e;
     }
     this.globe = new THREE.Mesh(geom, this.mat); this.scene.add(this.globe);
     new THREE.TextureLoader().load(C.GLOBE.TEXTURE_URL, (t) => {
       t.wrapS = THREE.RepeatWrapping; if (C.GLOBE.SPANS_NEG180) t.offset.x = 0.5;
       this.userTex = t; if (this.kind === 'none') this.setLayer('none');
     }, undefined, () => {});


     // 30-degree graticule, site markers and great-circle arcs from the home site (all re-draped on relief change)
     const pairs = [];
     for (let lo = 0; lo < 360; lo += 30) for (let la = -90; la < 90; la += 2) pairs.push([lo, la], [lo, la + 2]);
     for (let la = -60; la <= 60; la += 30) for (let lo = 0; lo < 360; lo += 2) pairs.push([lo, la], [lo + 2, la]);
     this.track(new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2a65a, transparent: true, opacity: 0.22 })),
       () => pairs.map(([lo, la]) => vec(lo, la, this.rAt(lo, la, 0.25))));
     C.SITES.forEach((s, i) => {
       const m = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 1.9 : 1.4, 16, 12), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffd400 : 0xffffff }));
       this.track(m, () => vec(s.lon, s.lat, this.rAt(s.lon, s.lat, 1)));
       this.track(label(s.name), () => vec(s.lon, s.lat, this.rAt(s.lon, s.lat, 7)));
       if (i > 0) this.track(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 })),
         () => this.drape(this.home, s, 64, 0.6));
     });


     this.panel = document.createElement('div'); this.panel.className = 'globe-panel hidden'; container.appendChild(this.panel);
     this.panel.addEventListener('click', (e) => {
       const a = e.target.dataset && e.target.dataset.act; if (!a) return;
       if (a === 'undo') this.points.pop(); else if (a === 'clear') this.points = [];
       else if (a === 'relief') { this.relief = !this.relief; this.applyRelief(); }
       this.rebuildPoints();
     });


     // Click terrain to add a point (ignore drags)
     const el = renderer.domElement, ray = new THREE.Raycaster(); let down = null;
     el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
     el.addEventListener('pointerup', (e) => {
       if (!this.active || e.button !== 0 || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
       const r = el.getBoundingClientRect();
       ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
       const h = ray.intersectObject(this.globe)[0];
       if (h) { this.points.push(ll(h.point.clone().normalize())); this.rebuildPoints(); }
     });


     this.applyRelief(); this.setLayer('none'); this.renderPanel();
   }


   rAt(lon, lat, lift = 0) { return this.R + (this.relief ? field(lon, lat).e * this.K : 0) + lift; }
   dirs(a, b, n) {
     const va = vec(a.lon, a.lat, 1), vb = vec(b.lon, b.lat, 1), om = Math.acos(clamp(va.dot(vb), -1, 1)), s = Math.sin(om), out = [];
     for (let i = 0; i <= n; i++) { const t = i / n; out.push(s < 1e-9 ? va.clone() : va.clone().multiplyScalar(Math.sin((1 - t) * om) / s).add(vb.clone().multiplyScalar(Math.sin(t * om) / s))); }
     return out;
   }
   drape(a, b, n, lift) { return this.dirs(a, b, n).map((v) => { const p = ll(v); return v.multiplyScalar(this.rAt(p.lon, p.lat, lift)); }); }


   track(obj, fn, bucket = this.dyn) { bucket.push({ obj, fn }); this.scene.add(obj); this.place({ obj, fn }); }
   place(d) {
     const r = d.fn();
     if (d.obj.isMesh || d.obj.isSprite) d.obj.position.copy(r);
     else { d.obj.geometry.dispose(); d.obj.geometry = new THREE.BufferGeometry().setFromPoints(r); }
   }
   refresh() { this.dyn.concat(this.ptDyn).forEach((d) => this.place(d)); }


   applyRelief() {
     const pa = this.globe.geometry.attributes.position;
     for (let i = 0; i < pa.count; i++) { const r = this.R + (this.relief ? this.ev[i] * this.K : 0); pa.setXYZ(i, this.dir[3 * i] * r, this.dir[3 * i + 1] * r, this.dir[3 * i + 2] * r); }
     pa.needsUpdate = true; this.globe.geometry.computeVertexNormals(); this.globe.geometry.computeBoundingSphere(); this.refresh();
   }


   // Repaint the equirectangular surface texture for the active analysis layer
   paint() {
     const { W, H } = this, k = this.kind, d = this.img.data, sd = Math.sin(this.sunP.dec * D), cd = Math.cos(this.sunP.dec * D);
     const B0 = Geo.planck(140), B1 = Geo.planck(320);
     for (let y = 0; y < H; y++) {
       const lat = (90 - ((y + 0.5) / H) * 180) * D, sl = Math.sin(lat), cl = Math.cos(lat), cap = clamp((Math.abs(lat / D) - 82) / 4);
       for (let x = 0; x < W; x++) {
         const i = y * W + x, e = this.elev[i]; let c;
         if (k === 'chemical') { const n = this.n2[i]; c = e > 3 && n > 0.2 ? [235, 200, 90] : Math.abs(e) < 3 && n > 0.35 ? [190, 60, 50] : e < -1 && n < 0 ? [80, 170, 120] : [60, 68, 86]; }
         else if (k === 'thermal' || k === 'infrared') {
           const T = Geo.skinTemp(sl * sd + cl * cd * Math.cos(((x + 0.5) / W) * 2 * Math.PI - this.sunP.lon * D), this.sunP.flux, 145 + 45 * this.I[i]);
           c = k === 'thermal' ? ramp((T - 150) / 170, THM) : ramp(Math.sqrt(clamp((Geo.planck(T) - B0) / (B1 - B0))), INF);
         } else { const t = clamp(0.5 + 0.06 * e); c = [(120 + 110 * t) * (1 - cap) + 240 * cap, (58 + 62 * t) * (1 - cap) + 240 * cap, (34 + 46 * t) * (1 - cap) + 235 * cap]; }
         d[4 * i] = c[0]; d[4 * i + 1] = c[1]; d[4 * i + 2] = c[2]; d[4 * i + 3] = 255;
       }
     }
     this.ctx.putImageData(this.img, 0, 0); this.tex.needsUpdate = true;
   }
   setLayer(k) {
     this.kind = k;
     const nat = k === 'none';
     if (!(nat && this.userTex)) this.paint();
     this.mat.map = nat && this.userTex ? this.userTex : this.tex;
     this.mat.emissiveMap = nat ? null : this.tex; this.mat.emissiveIntensity = nat ? 0 : 0.7; this.mat.needsUpdate = true;
   }


   rebuildPoints() {
     this.ptDyn.forEach((d) => { this.scene.remove(d.obj); if (d.obj.geometry) d.obj.geometry.dispose(); }); this.ptDyn = [];
     const P = this.points;
     P.forEach((p, i) => this.track(new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10),
       new THREE.MeshBasicMaterial({ color: i === 0 ? 0x4ade80 : i === P.length - 1 ? 0xe0533c : 0xf59e42 })), () => vec(p.lon, p.lat, this.rAt(p.lon, p.lat, 1.2)), this.ptDyn));
     if (P.length > 1) this.track(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff0d4 })),
       () => P.slice(1).flatMap((b, i) => this.drape(P[i], b, 48, 0.8)), this.ptDyn);
     this.renderPanel();
   }


   // Great-circle legs sampled along the surface: 3D length, climb/drop, regional grade, rover time (Tobler)
   metrics() {
     const rover = C.MOBILITY_PROFILES.rover, tob = (s) => Math.exp(-3.5 * (Math.abs(s + 0.05) - 0.05));
     const legs = this.points.slice(1).map((b, j) => {
       const a = this.points[j], ds = this.dirs(a, b, 64).map(ll); let km = 0, up = 0, dn = 0, mg = 0, h = 0, pe = field(ds[0].lon, ds[0].lat).e;
       for (let i = 1; i < ds.length; i++) {
         const e = field(ds[i].lon, ds[i].lat).e, hz = Geo.haversine(ds[i - 1], ds[i]) / 1000, de = e - pe, run = hz > 0 ? de / hz : 0;
         km += Math.hypot(hz, de); if (de > 0) up += de; else dn -= de; mg = Math.max(mg, Math.atan(Math.abs(run)) / D);
         h += Math.hypot(hz, de) / rover.speedKmH / tob(run); pe = e;
       }
       return { km, up, dn, mg, h, gc: Geo.haversine(a, b) / 1000, brg: Geo.bearing(a, b) };
     });
     return { legs, tot: legs.reduce((t, l) => ({ km: t.km + l.km, up: t.up + l.up, dn: t.dn + l.dn, mg: Math.max(t.mg, l.mg), h: t.h + l.h, gc: t.gc + l.gc }), { km: 0, up: 0, dn: 0, mg: 0, h: 0, gc: 0 }) };
   }


   renderPanel() {
     const P = this.points, f = (n, d = 0) => n.toFixed(d);
     let h = `<div class="legend-title">3D GLOBE · CLICK THE SURFACE TO ADD POINTS</div>
       <div class="wp-seq-header"><span>POINTS (${P.length})</span><span class="wp-action-group">
       <button class="btn-mini" data-act="undo">UNDO</button><button class="btn-mini" data-act="compute">COMPUTE PATH</button>
       <button class="btn-mini btn-mini-danger" data-act="clear">CLEAR</button><button class="btn-mini" data-act="relief">RELIEF ${this.relief ? 'ON' : 'OFF'}</button></span></div>`;
     h += P.map((p, i) => `<div>${i + 1}. ${f(p.lat, 2)}°, ${f(p.lon, 2)}°E · ${f(field(p.lon, p.lat).e, 1)} km</div>`).join('');
     if (P.length > 1) {
       const m = this.metrics();
       h += `<table class="cmp-table"><tr><th>Leg</th><th>Surface km</th><th>Brg</th><th>Climb/Drop km</th><th>Max grade</th><th>Rover h</th></tr>` +
         m.legs.map((l, i) => `<tr><td>${i + 1}→${i + 2}</td><td>${f(l.km)} (GC ${f(l.gc)})</td><td>${f(l.brg)}°</td><td>+${f(l.up, 1)}/-${f(l.dn, 1)}</td><td>${f(l.mg, 1)}°</td><td>${f(l.h, 1)}</td></tr>`).join('') +
         `<tr><th>Total</th><th>${f(m.tot.km)}</th><th></th><th>+${f(m.tot.up, 1)}/-${f(m.tot.dn, 1)}</th><th>${f(m.tot.mg, 1)}°</th><th>${f(m.tot.h, 1)}</th></tr></table>
         <p>Great-circle path draped over the terrain. Grades are regional scale (about 10-100 km samples). Rover time uses ${C.MOBILITY_PROFILES.rover.speedKmH} km/h with Tobler's grade factor.</p>`;
     }
     h += `<p>From ${this.home.name}: ` + C.SITES.slice(1).map((s) => `${s.name} ${f(Geo.haversine(this.home, s) / 1000)} km @ ${f(Geo.bearing(this.home, s))}°`).join(' · ') + `</p><p>${this.solarTxt || ''}</p>`;
     this.panel.innerHTML = h;
   }


   show(on) { this.active = on; this.controls.enabled = on; this.panel.classList.toggle('hidden', !on); }


   update(lmst, ls) {
     const s = Geo.solar(this.home.lat, lmst, ls);
     this.sunP = { dec: s.decDeg, lon: this.home.lon + (12 - lmst) * 15, flux: s.flux };
     this.sun.position.copy(vec(this.sunP.lon, s.decDeg, this.R * 5));
     this.solarTxt = `Sub-solar lat ${s.decDeg.toFixed(1)}° · Sun elev. at ${this.home.name} ${s.elevDeg.toFixed(1)}° · ${s.auDist.toFixed(3)} AU · ${s.flux.toFixed(0)} W/m²`;
     if ((this.kind === 'thermal' || this.kind === 'infrared') && !this._p) this._p = requestAnimationFrame(() => { this._p = 0; this.paint(); });
     this.renderPanel();
   }
   resize() { this.camera.aspect = this.container.clientWidth / this.container.clientHeight; this.camera.updateProjectionMatrix(); }
   render() { this.controls.update(); this.renderer.render(this.scene, this.camera); }
 }
 window.MarsGlobe = MarsGlobe;
})();

