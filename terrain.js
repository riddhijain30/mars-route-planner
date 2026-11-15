/**
* High-Resolution Martian Surface Synthesis (Upgraded Version 5 Engine)
* Sedimentary Mount Sharp Strata, Impact Craters with Ejecta Rims & Central Peaks,
* Procedural Regolith Albedo + Bump Maps, THEMIS Thermal IR, Contours & STL Exporter
*/
class MartianTerrain {
constructor(scene) {
  this.scene = scene;
  this.cfg = window.MARS_CONFIG;
  this.exaggeration = this.cfg.DEFAULT_EXAGGERATION;
  this.themisActive = false;




  this.terrainMesh = null;
  this.contourGroup = new THREE.Group();
  this.roverTrackGroup = new THREE.Group();
  this.scene.add(this.contourGroup);
  this.scene.add(this.roverTrackGroup);




  const maps = this.createProceduralMartianMaps();
  this.surfaceTexture = maps.albedoMap;
  this.bumpTexture = maps.bumpMap;
}




createProceduralMartianMaps() {
  const size = 1024;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d');




  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');




  // Base iron-oxide regolith tone
  ctx.fillStyle = '#9c4c27';
  ctx.fillRect(0, 0, size, size);




  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);




  // Sedimentary wind-carved strata bands
  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin(y * 0.032) * 24 + Math.cos(y * 0.095) * 10;
    ctx.fillStyle =
      y % 6 === 0
        ? 'rgba(58, 24, 11, 0.25)'
        : 'rgba(228, 138, 76, 0.16)';
    ctx.fillRect(0, y, size, 2);




    ctx.fillStyle = 'rgba(116, 48, 22, 0.13)';
    ctx.fillRect(wave + 30, y, 460, 1.5);




    const bumpLum = Math.round(128 + Math.sin(y * 0.11) * 26 + Math.cos(y * 0.29) * 14);
    bCtx.fillStyle = `rgb(${bumpLum},${bumpLum},${bumpLum})`;
    bCtx.fillRect(0, y, size, 2);
  }




  // Wind-blown eolian sand ripples & basaltic gravel grain
  for (let i = 0; i < 26000; i++) {
    const rx = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * size;
    const ry = Math.abs((Math.sin(i * 78.233) * 29413.123) % 1) * size;
    const isDark = i % 3 === 0;




    ctx.fillStyle = isDark
      ? 'rgba(34, 14, 8, 0.30)'
      : 'rgba(244, 170, 96, 0.22)';
    ctx.fillRect(rx, ry, 2, 2);




    bCtx.fillStyle = isDark
      ? 'rgba(70, 70, 70, 0.35)'
      : 'rgba(205, 205, 205, 0.35)';
    bCtx.fillRect(rx, ry, 2, 2);
  }




  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.repeat.set(7, 7);




  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(7, 7);




  return { albedoMap, bumpMap };
}




/**
 * Unexaggerated 1:1 physical elevation model of Gale Crater & Aeolis Mons (Mount Sharp)
 */
getRawElevation(x, z) {
  // Primary Aeolis Mons (Mount Sharp) massif & terraced sedimentary benches
  const distMassif = Math.hypot(x - 68, z - 66);
  const mountSharp = 24.5 * Math.exp(-(distMassif * distMassif) / (2 * 68 * 68));




  // Vera Rubin Ridge & Greenheugh Pediment structural benches
  const ridgeBench =
    4.6 * Math.exp(-Math.pow((x - z * 0.92) / 25, 2)) * Math.sin(x * 0.045 + 0.8);
  const boxworkPlateau =
    2.2 * Math.exp(-Math.pow((x - 42) / 22, 2) - Math.pow((z - 32) / 20, 2));




  const strataBase = mountSharp + ridgeBench + boxworkPlateau;
  const terraceStep = Math.sin(strataBase * 1.48) * 0.44;




  // Multi-scale impact craters with ejecta rims & central uplift peaks
  const craters = [
    { cx: -28, cz: 18,  r: 19, depth: 5.4, rim: 1.45, peak: 0.9 },
    { cx: 24,  cz: -32, r: 22, depth: 6.2, rim: 1.65, peak: 1.1 },
    { cx: -52, cz: -24, r: 13, depth: 3.6, rim: 0.95, peak: 0.0 },
    { cx: 42,  cz: 12,  r: 14, depth: 3.9, rim: 1.05, peak: 0.0 },
    { cx: 4,   cz: 44,  r: 16, depth: 4.5, rim: 1.25, peak: 0.6 },
    { cx: -76, cz: 46,  r: 15, depth: 4.1, rim: 1.10, peak: 0.0 },
    { cx: 74,  cz: -48, r: 17, depth: 4.8, rim: 1.30, peak: 0.7 },
    { cx: -12, cz: -68, r: 11, depth: 3.1, rim: 0.85, peak: 0.0 },
  ];




  let craterOffset = 0;
  for (const c of craters) {
    const d = Math.hypot(x - c.cx, z - c.cz);
    if (d < c.r * 1.55) {
      const norm = d / c.r;
      if (norm < 1.0) {
        craterOffset -= c.depth * (1 - norm * norm);
      }
      const rimGauss = Math.exp(-Math.pow((norm - 1.03) / 0.16, 2));
      craterOffset += c.rim * rimGauss;




      if (c.peak > 0 && norm < 0.35) {
        craterOffset += c.peak * Math.exp(-(norm * norm) / 0.025);
      }
    }
  }




  // Yardangs, wind-scoured channels & regolith micro-undulations
  const micro =
    Math.sin(x * 0.14) * Math.cos(z * 0.14) * 0.52 +
    Math.sin(x * 0.31 + z * 0.27) * 0.21 +
    Math.cos(x * 0.58 - z * 0.49) * 0.09;




  return strataBase + terraceStep + craterOffset + micro;
}




getHeightAt(x, z) {
  return this.getRawElevation(x, z) * this.exaggeration;
}




getMolaMeters(x, z) {
  return (
    this.cfg.BASE_DATUM_METERS +
    this.getRawElevation(x, z) * this.cfg.ELEVATION_SCALE_METERS
  );
}




getSlopeDegrees(x, z) {
  const eps = 0.8;
  const hL = this.getRawElevation(x - eps, z);
  const hR = this.getRawElevation(x + eps, z);
  const hD = this.getRawElevation(x, z - eps);
  const hU = this.getRawElevation(x, z + eps);




  const dx = ((hR - hL) * this.cfg.ELEVATION_SCALE_METERS) / (2 * eps * this.cfg.METERS_PER_UNIT);
  const dz = ((hU - hD) * this.cfg.ELEVATION_SCALE_METERS) / (2 * eps * this.cfg.METERS_PER_UNIT);
  const grad = Math.hypot(dx, dz);
  return (Math.atan(grad) * 180) / Math.PI;
}




 worldToLatLon(x, z) {
   const c = this.cfg, lat0 = c.ORIGIN_LAT;
   const lat = lat0 - (z * c.METERS_PER_UNIT) / MarsGeo.mPerDegLat(lat0);
   const lon = c.ORIGIN_LON + (x * c.METERS_PER_UNIT) / MarsGeo.mPerDegLon((lat + lat0) / 2);
   return { lat, lon };
 }




build() {
  if (this.terrainMesh) {
    this.scene.remove(this.terrainMesh);
    this.terrainMesh.geometry.dispose();
  }




  const size = this.cfg.WORLD_SIZE;
  const segs = this.cfg.GRID_SEGMENTS;
  const geom = new THREE.PlaneGeometry(size, size, segs, segs);
  geom.rotateX(-Math.PI / 2);




  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);




  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = this.getHeightAt(x, z);
    pos.setY(i, y);
  }




  geom.computeVertexNormals();
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));




  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: this.surfaceTexture,
    bumpMap: this.bumpTexture,
    bumpScale: 0.42,
    roughness: 0.86,
    metalness: 0.05,
    flatShading: false,
  });




  this.terrainMesh = new THREE.Mesh(geom, mat);
  this.terrainMesh.receiveShadow = true;
  this.terrainMesh.castShadow = true;
  this.scene.add(this.terrainMesh);




  this.applyLayer(this.layerKind || 'none', this.sunState);
  this.rebuildContours();
  this.rebuildRoverTracks();
}




applySurfaceColorMode(isThemis) {
  this.themisActive = isThemis;
  if (!this.terrainMesh) return;




  const geom = this.terrainMesh.geometry;
  const pos = geom.attributes.position;
  const colors = geom.attributes.color;
  const color = new THREE.Color();




  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rawH = this.getRawElevation(x, z);
    const slope = this.getSlopeDegrees(x, z);




    if (isThemis) {
      const thermalInertia = THREE.MathUtils.clamp(
        ((rawH + 5) / 28) * 0.55 + (slope / 26) * 0.55,
        0,
        1
      );




      if (thermalInertia < 0.28) {
        color.setHSL(0.76 - thermalInertia * 0.55, 0.72, 0.16 + thermalInertia * 0.45);
      } else if (thermalInertia < 0.65) {
        const t = (thermalInertia - 0.28) / 0.37;
        color.setHSL(0.02 + t * 0.05, 0.85, 0.32 + t * 0.18);
      } else {
        const t = (thermalInertia - 0.65) / 0.35;
        color.setHSL(0.08 + t * 0.05, 0.92, 0.52 + t * 0.36);
      }
    } else {
      const hNorm = THREE.MathUtils.clamp((rawH + 6) / 31, 0, 1);
      const strata = Math.sin(rawH * 1.95) * 0.042;




      if (slope > 19) {
        color.setHex(0x472314).offsetHSL(0, 0, strata);
      } else if (hNorm < 0.32) {
        color.setHex(0x8c4423).lerp(new THREE.Color(0xb55d31), hNorm / 0.32);
      } else if (hNorm < 0.72) {
        color.setHex(0xb55d31).lerp(new THREE.Color(0xd97d3e), (hNorm - 0.32) / 0.4);
      } else {
        color.setHex(0xd97d3e).lerp(new THREE.Color(0xebb178), (hNorm - 0.72) / 0.28);
      }
      color.offsetHSL(0, 0, strata);
    }




    colors.setXYZ(i, color.r, color.g, color.b);
  }




  colors.needsUpdate = true;
  this.terrainMesh.material.map = isThemis ? null : this.surfaceTexture;
  this.terrainMesh.material.bumpMap = isThemis ? null : this.bumpTexture;
  this.terrainMesh.material.needsUpdate = true;
}


  // Cached per-vertex raw elevation and gradient (m/m). The x/z grid never changes, so this is computed once.
 ensureGrad() {
   if (this._grad) return;
   const pos = this.terrainMesh.geometry.attributes.position, n = pos.count, eps = 0.8;
   const k = this.cfg.ELEVATION_SCALE_METERS / (2 * eps * this.cfg.METERS_PER_UNIT);
   this._grad = new Float32Array(n * 2); this._raw = new Float32Array(n);
   for (let i = 0; i < n; i++) {
     const x = pos.getX(i), z = pos.getZ(i);
     this._raw[i] = this.getRawElevation(x, z);
     this._grad[2 * i] = (this.getRawElevation(x + eps, z) - this.getRawElevation(x - eps, z)) * k;
     this._grad[2 * i + 1] = (this.getRawElevation(x, z + eps) - this.getRawElevation(x, z - eps)) * k;
   }
 }


 // kind: 'none' | 'thermal' | 'infrared' | 'chemical'. sun = { v: [east, up, -north], flux }
 applyLayer(kind, sun) {
   this.layerKind = kind || 'none';
   if (this.layerKind === 'none' || !this.terrainMesh) return this.applySurfaceColorMode(this.themisActive);
   this.ensureGrad();
   const S = sun || { v: [0, 1, 0], flux: 590 }, G = this._grad, up = S.v[1] > 0;
   const geom = this.terrainMesh.geometry, pos = geom.attributes.position, col = geom.attributes.color;
   const ramp = (v, s) => { v = Math.min(1, Math.max(0, v)) * (s.length - 1) * 0.9999; const i = v | 0, f = v - i;
     return s[i].map((a, j) => (a + (s[i + 1][j] - a) * f) / 255); };
   const THM = [[42, 63, 156], [60, 140, 200], [240, 220, 120], [220, 60, 30]];
   const INF = [[0, 0, 4], [87, 15, 109], [187, 55, 84], [249, 142, 8], [252, 255, 164]];
   const B0 = MarsGeo.planck(140), B1 = MarsGeo.planck(320), c = new THREE.Color();
   for (let i = 0; i < pos.count; i++) {
     const gx = G[2 * i], gz = G[2 * i + 1], raw = this._raw[i], slope = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
     if (this.layerKind === 'chemical') {
       if (slope > 19) c.setRGB(0.2, 0.22, 0.28);
       else if (raw < 4) c.setRGB(0.28, 0.62, 0.45);       // clay-bearing, lower strata
       else if (raw < 12) c.setRGB(0.74, 0.24, 0.2);       // hematite-rich ridge
       else c.setRGB(0.92, 0.78, 0.36);                    // sulfate-bearing upper unit
       c.offsetHSL(0, 0, Math.sin(raw * 1.95) * 0.05);
     } else {
       // Surface normal (x east, y up, z south) dotted with the sun vector
       const cosI = up ? Math.max(0, (-gx * S.v[0] + S.v[1] - gz * S.v[2]) / Math.hypot(gx, 1, gz)) : 0;
       const inertia = Math.min(1, Math.max(0, ((raw + 5) / 28) * 0.55 + (slope / 26) * 0.55));
       const T = MarsGeo.skinTemp(cosI, S.flux, 145 + 45 * inertia);
       const rgb = this.layerKind === 'thermal' ? ramp((T - 150) / 170, THM)
         : ramp(Math.sqrt(Math.min(1, Math.max(0, (MarsGeo.planck(T) - B0) / (B1 - B0)))), INF);
       c.setRGB(rgb[0], rgb[1], rgb[2]);
     }
     col.setXYZ(i, c.r, c.g, c.b);
   }
   col.needsUpdate = true;
   this.terrainMesh.material.map = null; this.terrainMesh.material.bumpMap = null; this.terrainMesh.material.needsUpdate = true;
 }
rebuildContours() {
  while (this.contourGroup.children.length > 0) {
    const child = this.contourGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    this.contourGroup.remove(child);
  }




  const half = this.cfg.WORLD_SIZE / 2 - 4;
  const step = 2.4;
  const levels = [-5, -3, -1, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
  const segments = [];




  for (const level of levels) {
    for (let x = -half; x < half; x += step) {
      for (let z = -half; z < half; z += step) {
        const h00 = this.getRawElevation(x, z) - level;
        const h10 = this.getRawElevation(x + step, z) - level;
        const h01 = this.getRawElevation(x, z + step) - level;




        if ((h00 > 0) !== (h10 > 0)) {
          const t = Math.abs(h00) / (Math.abs(h00) + Math.abs(h10));
          const px = x + t * step;
          const pz = z;
          segments.push(px, this.getHeightAt(px, pz) + 0.2, pz);
        }
        if ((h00 > 0) !== (h01 > 0)) {
          const t = Math.abs(h00) / (Math.abs(h00) + Math.abs(h01));
          const px = x;
          const pz = z + t * step;
          segments.push(px, this.getHeightAt(px, pz) + 0.2, pz);
        }
      }
    }
  }




  if (segments.length > 0) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x6b3118,
      transparent: true,
      opacity: 0.72,
    });
    this.contourGroup.add(new THREE.LineSegments(geom, lineMat));
  }
}




rebuildRoverTracks() {
  while (this.roverTrackGroup.children.length > 0) {
    const child = this.roverTrackGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    this.roverTrackGroup.remove(child);
  }




  const wps = this.cfg.MOUNT_SHARP_PRESET.historicalWaypoints;
  const curvePts = wps.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const catmull = new THREE.CatmullRomCurve3(curvePts);




  const sampled = catmull.getPoints(180);
  const clampedPoints = sampled.map(
    (pt) =>
      new THREE.Vector3(
        pt.x,
        this.getHeightAt(pt.x, pt.z) + this.cfg.ROVER_TRACK_OFFSET,
        pt.z
      )
  );




  const trackGeom = new THREE.BufferGeometry().setFromPoints(clampedPoints);
  const trackMat = new THREE.LineDashedMaterial({
    color: 0xf2a65a,
    dashSize: 2.2,
    gapSize: 1.2,
  });




  const trackLine = new THREE.Line(trackGeom, trackMat);
  trackLine.computeLineDistances();
  this.roverTrackGroup.add(trackLine);




  const nodeGeom = new THREE.CylinderGeometry(0.65, 0.85, 0.4, 12);
  const nodeMat = new THREE.MeshStandardMaterial({
    color: 0xd96b27,
    emissive: 0x6b2808,
    roughness: 0.4,
  });




  wps.forEach((wp) => {
    const y = this.getHeightAt(wp.x, wp.z) + 0.22;
    const mesh = new THREE.Mesh(nodeGeom, nodeMat);
    mesh.position.set(wp.x, y, wp.z);
    this.roverTrackGroup.add(mesh);
  });
}




updateVerticalExaggeration(newVal) {
  this.exaggeration = newVal;
  this.build();
}




/**
 * Generates a downloadable ASCII STL mesh of the current Gale Crater sector
 */
exportTerrainSTL() {
  const res = 72;
  const size = this.cfg.WORLD_SIZE;
  const half = size / 2;
  const step = size / res;
  const lines = ['solid ARES_IV_Gale_Crater_Mount_Sharp'];




  const v = (gx, gz) => {
    const x = -half + gx * step;
    const z = -half + gz * step;
    const y = this.getHeightAt(x, z) + 12;
    return [x.toFixed(3), (-z).toFixed(3), y.toFixed(3)];
  };




  const addTri = (p1, p2, p3) => {
    lines.push('  facet normal 0 0 1');
    lines.push('    outer loop');
    lines.push(`      vertex ${p1[0]} ${p1[1]} ${p1[2]}`);
    lines.push(`      vertex ${p2[0]} ${p2[1]} ${p2[2]}`);
    lines.push(`      vertex ${p3[0]} ${p3[1]} ${p3[2]}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  };




  for (let ix = 0; ix < res; ix++) {
    for (let iz = 0; iz < res; iz++) {
      const p00 = v(ix, iz);
      const p10 = v(ix + 1, iz);
      const p01 = v(ix, iz + 1);
      const p11 = v(ix + 1, iz + 1);
      addTri(p00, p10, p11);
      addTri(p00, p11, p01);
    }
  }




  lines.push('endsolid ARES_IV_Gale_Crater_Mount_Sharp');
  return lines.join('\n');
}
}





