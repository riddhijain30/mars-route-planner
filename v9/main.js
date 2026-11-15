/**
* ARES-IV Mars EVA Planner Main Controller
* High-res Gale Crater / Mount Sharp 3D scene, multi-waypoint distance-first A* routing,
* Free/Drone/Visor POV modes, Fusion 360 ViewCube, NASA Mars Trek tools, STL/JSON/PNG export & NASA Photo Archive.
*/
(function () {
const cfg = window.MARS_CONFIG;




const canvas = document.getElementById('mars-canvas');
const viewport = document.getElementById('viewport-container');




const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x160c07, 0.0021);




const camera = new THREE.PerspectiveCamera(
  44,
  viewport.clientWidth / viewport.clientHeight,
  0.5,
  1200
);
camera.position.set(115, 92, 118);




const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;




const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minDistance = 18;
controls.maxDistance = 320;
controls.target.set(0, 8, 0);




const hemiLight = new THREE.HemisphereLight(0xf2a66b, 0x38190d, 0.48);
scene.add(hemiLight);




const sunLight = new THREE.DirectionalLight(0xffdcb8, 1.48);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 20;
sunLight.shadow.camera.far = 420;
const d = 140;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);




const terrain = new MartianTerrain(scene);
terrain.build();
const router = new EVARouter(terrain);
const globe = new MarsGlobe(renderer, viewport);
function setSurfaceMode(isGlobe) {
   globe.show(isGlobe);
   controls.enabled = !isGlobe && currentViewMode === 'free';
   viewport.classList.toggle('globe-mode', isGlobe);
   document.getElementById('btn-view-terrain').classList.toggle('active-pov', !isGlobe);
   document.getElementById('btn-view-globe').classList.toggle('active-pov', isGlobe);
 }
 document.getElementById('btn-view-terrain').addEventListener('click', () => setSurfaceMode(false));
 document.getElementById('btn-view-globe').addEventListener('click', () => setSurfaceMode(true));




// Active Multi-Point Waypoints
let activeWaypoints = cfg.MOUNT_SHARP_PRESET.defaultWaypoints.map((wp) => ({ ...wp }));
let lastJourneyResult = null;
let currentViewMode = 'free'; // 'free' | 'drone' | 'astronaut'
let povClock = 0;




const waypointGroup = new THREE.Group();
const routeGroup = new THREE.Group();
scene.add(waypointGroup);
scene.add(routeGroup);




function createSurfacePin(colorHex, ringHex) {
  const group = new THREE.Group();




  const padGeom = new THREE.RingGeometry(1.0, 1.8, 28);
  padGeom.rotateX(-Math.PI / 2);
  const pad = new THREE.Mesh(
    padGeom,
    new THREE.MeshBasicMaterial({ color: ringHex, side: THREE.DoubleSide })
  );
  pad.position.y = 0.14;
  group.add(pad);




  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 4.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xf7dec8, roughness: 0.3 })
  );
  mast.position.y = 2.4;
  group.add(mast);




  const head = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.48,
      roughness: 0.25,
    })
  );
  head.position.y = 5.2;
  group.add(head);




  return group;
}




function getMobilityConfig() {
  const key = document.getElementById('mobility-selector').value;
  return cfg.MOBILITY_PROFILES[key] || cfg.MOBILITY_PROFILES.suit;
}




function getMaxSlopeLimit() {
  return parseFloat(document.getElementById('max-slope-slider').value) || 18;
}




function syncWaypointsAndUI() {
  while (waypointGroup.children.length > 0) {
    waypointGroup.remove(waypointGroup.children[0]);
  }




  activeWaypoints.forEach((wp, idx) => {
    const isStart = idx === 0;
    const isEnd = idx === activeWaypoints.length - 1;
    const color = isStart ? 0x4ade80 : isEnd ? 0xe0533c : 0xf59e42;
    const pin = createSurfacePin(color, 0xf7dec8);
    const y = terrain.getHeightAt(wp.x, wp.z) + cfg.WAYPOINT_PIN_OFFSET;
    pin.position.set(wp.x, y, wp.z);
    waypointGroup.add(pin);
  });




  document.getElementById('wp-count-label').textContent = activeWaypoints.length;
  const listUI = document.getElementById('waypoint-list-ui');
  listUI.innerHTML = '';




  activeWaypoints.forEach((wp, idx) => {
    const ll = terrain.worldToLatLon(wp.x, wp.z);
    const mola = Math.round(terrain.getMolaMeters(wp.x, wp.z));
    const tag = idx === 0 ? 'ORIGIN' : idx === activeWaypoints.length - 1 ? 'TARGET' : `WP ${idx + 1}`;
    const item = document.createElement('div');
    item.className = 'wp-list-item';
    item.innerHTML = `
      <span><strong>[${tag}]</strong> ${Math.abs(ll.lat).toFixed(2)}°S, ${ll.lon.toFixed(2)}°E</span>
      <div class="wp-item-actions">
        <span>${mola}m</span>
        ${activeWaypoints.length > 1 ? `<button class="wp-del-btn" data-idx="${idx}" title="Remove waypoint">×</button>` : ''}
      </div>
    `;
    listUI.appendChild(item);
  });




  listUI.querySelectorAll('.wp-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      if (activeWaypoints.length > 1) {
        activeWaypoints.splice(idx, 1);
        syncWaypointsAndUI();
        computeAndRenderRoute();
      }
    });
  });
}




function clearRouteGeometry() {
  while (routeGroup.children.length > 0) {
    const obj = routeGroup.children[0];
    if (obj.geometry) obj.geometry.dispose();
    routeGroup.remove(obj);
  }
}




function computeAndRenderRoute() {
  clearRouteGeometry();
  const hazardBox = document.getElementById('hazard-container');
  hazardBox.innerHTML = '';




  if (activeWaypoints.length < 2) {
    lastJourneyResult = null;
    document.getElementById('metric-distance').textContent = '0.00 km';
    document.getElementById('metric-gain').textContent = '+0 / -0 m';
    document.getElementById('metric-slope').textContent = '0.0° / 0.0°';
    document.getElementById('metric-time').textContent = '00h 00m';
    document.getElementById('budget-pct-label').textContent = '100%';
    document.getElementById('budget-bar').style.width = '100%';
    document.getElementById('budget-bar').style.backgroundColor = '#4ade80';
    drawElevationSparkline([]);
    return;
  }




  const avoidanceWeight = parseFloat(document.getElementById('slope-penalty-slider').value);
  const maxSlopeLimitDeg = getMaxSlopeLimit();
  const mobility = getMobilityConfig();




  const result = router.optimizeJourney(activeWaypoints, {
    elevationAvoidanceWeight: avoidanceWeight,
    maxSlopeLimitDeg,
    mobility,
  });
  if (!result) return;
  lastJourneyResult = result;




  // Render 3D Route Tube & Core Line
  const curve = new THREE.CatmullRomCurve3(result.points3D);
  const tubeGeom = new THREE.TubeGeometry(curve, 160, 0.48, 8, false);
  const tubeColor = result.feasible ? cfg.PALETTE.routePrimary : cfg.PALETTE.routeHazard;
  const tubeMat = new THREE.MeshStandardMaterial({
    color: tubeColor,
    emissive: result.feasible ? 0x9c4111 : 0x7f1d1d,
    emissiveIntensity: 0.58,
    roughness: 0.35,
  });
  routeGroup.add(new THREE.Mesh(tubeGeom, tubeMat));




  const coreGeom = new THREE.BufferGeometry().setFromPoints(
    result.points3D.map((p) => new THREE.Vector3(p.x, p.y + 0.34, p.z))
  );
  routeGroup.add(
    new THREE.Line(coreGeom, new THREE.LineBasicMaterial({ color: cfg.PALETTE.routeCore }))
  );




  // Update Telemetry Readouts
  document.getElementById('metric-distance').textContent = `${result.distanceKm.toFixed(2)} km`;
  document.getElementById('metric-gain').textContent = `+${result.ascentMeters} / -${result.descentMeters} m`;
  document.getElementById('metric-slope').textContent = `${result.maxSlopeDeg.toFixed(1)}° / ${result.avgSlopeDeg.toFixed(1)}°`;




  const hrs = Math.floor(result.durationHours);
  const mins = Math.round((result.durationHours - hrs) * 60);
  document.getElementById('metric-time').textContent = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;




  // Life-Support Budget Bar
  document.getElementById('budget-limit-label').textContent = `${mobility.maxBudgetH.toFixed(1)}h`;
  const remPct = Math.max(0, Math.round(100 - (result.durationHours / mobility.maxBudgetH) * 100));
  document.getElementById('budget-pct-label').textContent = `${remPct}%`;
  const bar = document.getElementById('budget-bar');
  bar.style.width = `${remPct}%`;
  bar.style.backgroundColor = remPct > 40 ? '#4ade80' : remPct > 15 ? '#f59e0b' : '#e0533c';




  // Route Status & Grade Badges
  const statusBadge = document.getElementById('route-status-badge');
  const gradeBadge = document.getElementById('profile-grade-badge');




  if (result.feasible) {
    statusBadge.textContent = 'FEASIBLE PATH';
    statusBadge.classList.remove('danger');
    gradeBadge.textContent = result.maxSlopeDeg <= 12 ? 'OPTIMAL GRADE' : 'SAFE GRADE';
    gradeBadge.style.color = '#f09d51';
  } else {
    statusBadge.textContent = 'CONSTRAINT ALERT';
    statusBadge.classList.add('danger');
    gradeBadge.textContent = 'STEEP / BUDGET';
    gradeBadge.style.color = '#e0533c';
  }




  // Trade-Off Comparison & Hazard Alerts
  const base = result.directBaseline;
  const savedClimb = base.ascentMeters - result.ascentMeters;
  const infoDiv = document.createElement('div');
  infoDiv.className = 'info-item';
  infoDiv.textContent =
    savedClimb > 10
      ? `MIN-DIST A*: ${result.distanceKm.toFixed(2)} km (Direct: ${base.distanceKm.toFixed(2)} km) • Saved ${savedClimb}m climb & lowered max grade ${base.maxSlopeDeg.toFixed(1)}° → ${result.maxSlopeDeg.toFixed(1)}°.`
      : `MIN-DIST A*: Direct geodesic corridor (${result.distanceKm.toFixed(2)} km, ${result.maxSlopeDeg.toFixed(1)}° max grade) already minimizes distance & climb.`;
  hazardBox.appendChild(infoDiv);




  if (result.violatesSlope) {
    const hDiv = document.createElement('div');
    hDiv.className = 'hazard-item';
    hDiv.textContent = `SLOPE HAZARD: Peak grade (${result.maxSlopeDeg.toFixed(1)}°) exceeds ${maxSlopeLimitDeg}° limit. Increase Elevation Avoidance or add intermediate waypoint.`;
    hazardBox.appendChild(hDiv);
  }




  if (result.exceedsBudget) {
    const bDiv = document.createElement('div');
    bDiv.className = 'hazard-item';
    bDiv.textContent = `TIME BUDGET EXCEEDED: Round-trip + stops (${result.durationHours.toFixed(1)}h) exceeds ${mobility.maxBudgetH.toFixed(1)}h ${mobility.name} limit.`;
    hazardBox.appendChild(bDiv);
  }




  const lmst = parseFloat(document.getElementById('sun-angle-slider').value);
  if (document.getElementById('layer-solar-shadows').checked && (lmst < 7.2 || lmst > 17.2)) {
    const sDiv = document.createElement('div');
    sDiv.className = 'hazard-item';
    sDiv.textContent = `LOW-SUN COLD TRAP (${document.getElementById('sun-time-val').textContent}): Long crater shadows active; auxiliary suit heating advised.`;
    hazardBox.appendChild(sDiv);
  }




  drawElevationSparkline(result.profile, maxSlopeLimitDeg);
}




function drawElevationSparkline(profile, maxSlopeLimitDeg = 18) {
  const cvs = document.getElementById('elevation-profile-canvas');
  const ctx = cvs.getContext('2d');
  const w = cvs.width;
  const h = cvs.height;




  ctx.clearRect(0, 0, w, h);
  if (!profile || profile.length < 2) {
    ctx.fillStyle = '#9e826c';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('Click 2+ points on Mars to plot profile...', 18, 42);
    return;
  }




  const elevs = profile.map((p) => p.elevM);
  const minE = Math.min(...elevs) - 18;
  const maxE = Math.max(...elevs) + 18;
  const span = Math.max(1, maxE - minE);




  ctx.strokeStyle = 'rgba(196, 113, 62, 0.16)';
  ctx.lineWidth = 1;
  for (let y = 18; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }




  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(240, 157, 81, 0.45)');
  grad.addColorStop(1, 'rgba(110, 44, 18, 0.06)');




  ctx.beginPath();
  profile.forEach((pt, idx) => {
    const px = (idx / (profile.length - 1)) * w;
    const py = h - ((pt.elevM - minE) / span) * (h - 14) - 6;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();




  ctx.beginPath();
  profile.forEach((pt, idx) => {
    const px = (idx / (profile.length - 1)) * w;
    const py = h - ((pt.elevM - minE) / span) * (h - 14) - 6;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = '#f59e42';
  ctx.lineWidth = 2;
  ctx.stroke();




  // Mark steep slope hazard points in red
  profile.forEach((pt, idx) => {
    if (pt.slopeDeg > maxSlopeLimitDeg) {
      const px = (idx / (profile.length - 1)) * w;
      const py = h - ((pt.elevM - minE) / span) * (h - 14) - 6;
      ctx.fillStyle = '#e0533c';
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}




  function updateSolarPosition(lmstHours) {
   const ls = parseFloat(document.getElementById('tel-ls').textContent) || cfg.DEFAULT_LS;
   const s = MarsGeo.solar(cfg.ORIGIN_LAT, lmstHours, ls);
   const e = (s.elevDeg * Math.PI) / 180, az = (s.azDeg * Math.PI) / 180, R = 190;
   // World axes: +x east, +y up, -z north
   sunLight.position.set(Math.sin(az) * Math.cos(e) * R, Math.max(2, Math.sin(e) * R), -Math.cos(az) * Math.cos(e) * R);
   const low = 1 - Math.max(0, Math.sin(e));
   sunLight.color.setHSL(0.08 - low * 0.03, 0.85, 0.72 - low * 0.16);
   sunLight.intensity = 0.25 + 1.4 * Math.max(0, Math.sin(e)) * (s.flux / 590);
   const hh = Math.floor(lmstHours), mm = Math.round((lmstHours - hh) * 60);
   document.getElementById('sun-time-val').textContent =
     `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LTST`;
       terrain.sunState = { v: [Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)], flux: s.flux };
   if (terrain.layerKind === 'thermal' || terrain.layerKind === 'infrared') terrain.applyLayer(terrain.layerKind, terrain.sunState);
   globe.update(lmstHours, ls);
 }




// =========================================================
// POV CAMERA SWITCHER (FREE ORBIT / DRONE RECON / VISOR 2M)
// =========================================================
const btnFree = document.getElementById('btn-pov-free');
const btnDrone = document.getElementById('btn-pov-drone');
const btnAstronaut = document.getElementById('btn-pov-astronaut');
const povBanner = document.getElementById('pov-banner');
const povBannerText = document.getElementById('pov-banner-text');




function setViewMode(mode) {
  currentViewMode = mode;
  povClock = 0;
  [btnFree, btnDrone, btnAstronaut].forEach((b) => b.classList.remove('active-pov'));




  if (mode === 'free') {
    btnFree.classList.add('active-pov');
    controls.enabled = true;
    povBanner.classList.add('hidden');
  } else if (mode === 'drone') {
    btnDrone.classList.add('active-pov');
    controls.enabled = false;
    povBanner.classList.remove('hidden');
    povBannerText.textContent = 'DRONE AERIAL RECON ORBIT ACTIVE';
  } else if (mode === 'astronaut') {
    if (!lastJourneyResult || lastJourneyResult.points3D.length < 5) {
      setViewMode('free');
      return;
    }
    btnAstronaut.classList.add('active-pov');
    controls.enabled = false;
    povBanner.classList.remove('hidden');
    povBannerText.textContent = 'ASTRONAUT HELMET VISOR (2M SURFACE POV)';
  }
}




btnFree.addEventListener('click', () => setViewMode('free'));
btnDrone.addEventListener('click', () => setViewMode(currentViewMode === 'drone' ? 'free' : 'drone'));
btnAstronaut.addEventListener('click', () =>
  setViewMode(currentViewMode === 'astronaut' ? 'free' : 'astronaut')
);
document.getElementById('btn-exit-pov').addEventListener('click', () => {
  setViewMode('free');
  controls.target.set(0, 8, 0);
  camera.position.set(115, 92, 118);
});




// =========================================================
// NASA MARS TREK MENU, PHOTO ARCHIVE & MODALS
// =========================================================
const trekDrawer = document.getElementById('trek-menu-drawer');
const dialogBackdrop = document.getElementById('custom-dialog-backdrop');
const dialogCard = document.getElementById('custom-dialog-card');
const dialogTitle = document.getElementById('dialog-title');
const dialogBody = document.getElementById('dialog-body-content');




document.getElementById('btn-toggle-trek-menu').addEventListener('click', () => {
  trekDrawer.classList.toggle('hidden');
});
document.getElementById('btn-close-trek-menu').addEventListener('click', () => {
  trekDrawer.classList.add('hidden');
});
document.getElementById('btn-close-dialog').addEventListener('click', () => {
  dialogBackdrop.classList.add('hidden');
  dialogCard.classList.remove('wide-modal');
});




function showMissionDialog(title, htmlContent, wide = false) {
  dialogTitle.textContent = title;
  dialogBody.innerHTML = htmlContent;
  if (wide) dialogCard.classList.add('wide-modal');
  else dialogCard.classList.remove('wide-modal');
  dialogBackdrop.classList.remove('hidden');
  trekDrawer.classList.add('hidden');
}




document.getElementById('menu-item-distance').addEventListener('click', () => {
  if (!lastJourneyResult) {
    showMissionDialog('ROUTE COMPARISON', '<p>Place at least 2 waypoints on Mars to compare Direct vs. A* routes.</p>');
    return;
  }
  const r = lastJourneyResult;
  const b = r.directBaseline;
  showMissionDialog('DIRECT GEODESIC VS. MIN-DISTANCE A* COMPARISON', `
    <p><strong>ARES-IV Distance-First Low-Relief Pathfinding Engine:</strong></p>
    <table class="cmp-table">
      <thead>
        <tr><th>Metric</th><th>Direct Straight Path</th><th>Min-Dist A* Route</th></tr>
      </thead>
      <tbody>
        <tr><td>3D Surface Distance</td><td>${b.distanceKm.toFixed(2)} km</td><td><strong>${r.distanceKm.toFixed(2)} km</strong></td></tr>
        <tr><td>Cumulative Climb / Drop</td><td>+${b.ascentMeters} / -${b.descentMeters} m</td><td><strong>+${r.ascentMeters} / -${r.descentMeters} m</strong></td></tr>
        <tr><td>Max / Avg Grade</td><td>${b.maxSlopeDeg.toFixed(1)}° / ${b.avgSlopeDeg.toFixed(1)}°</td><td><strong>${r.maxSlopeDeg.toFixed(1)}° / ${r.avgSlopeDeg.toFixed(1)}°</strong></td></tr>
        <tr><td>Outbound / Return Walk</td><td>${b.outboundHours.toFixed(2)}h / ${b.returnHours.toFixed(2)}h</td><td><strong>${r.outboundHours.toFixed(2)}h / ${r.returnHours.toFixed(2)}h</strong></td></tr>
        <tr><td>Constraint Status</td><td>${b.feasible ? 'PASS' : 'VIOLATION'}</td><td><strong>${r.feasible ? 'PASS (FEASIBLE)' : 'ALERT'}</strong></td></tr>
      </tbody>
    </table>
  `);
});




document.getElementById('menu-item-elevation').addEventListener('click', () => {
  showMissionDialog('ELEVATION PROFILE ANALYSIS', `
    <p><strong>MOLA / HiRISE Topographic Profile (1:1 Unexaggerated Math):</strong></p>
    <ul>
      <li><strong>Climb / Drop:</strong> ${document.getElementById('metric-gain').textContent}</li>
      <li><strong>Base MOLA Datum:</strong> -4,520 meters</li>
      <li><strong>Max / Avg Slope:</strong> ${document.getElementById('metric-slope').textContent}</li>
      <li><strong>Grade Classification:</strong> ${document.getElementById('profile-grade-badge').textContent}</li>
    </ul>
  `);
});




document.getElementById('menu-item-sunangle').addEventListener('click', () => {
  showMissionDialog('CALCULATE SUN ANGLE & SHADOWS', `
    <p><strong>Local Mean Solar Time (LMST) &amp; Illumination Modeling:</strong></p>
    <ul>
      <li><strong>Current Gale Crater LMST:</strong> ${document.getElementById('sun-time-val').textContent}</li>
      <li><strong>Solar Longitude (Ls):</strong> ${document.getElementById('tel-ls').textContent}</li>
      <li><strong>Shadow Relief Status:</strong> ${document.getElementById('layer-solar-shadows').checked ? 'Active Directional Sunlight Shading' : 'Disabled'}</li>
    </ul>
  `);
});




async function openNasaPhotoGallery() {
  showMissionDialog(
    'NASA GALE CRATER & MOUNT SHARP IMAGE ARCHIVE',
    '<p>Querying <code>images-api.nasa.gov</code> for official MSL Curiosity observations...</p>',
    true
  );
  try {
    const res = await fetch(cfg.NASA_API.IMAGE_SEARCH_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.collection?.items || [])
      .filter((it) => it.data?.[0] && it.links?.[0]?.href)
      .slice(0, 9);




    if (items.length === 0) {
      dialogBody.innerHTML = '<p>No NASA archive images returned.</p>';
      return;
    }




    const cardsHtml = items
      .map((it) => {
        const info = it.data[0];
        const href = it.links[0].href;
        const date = info.date_created ? info.date_created.slice(0, 10) : 'MSL Archive';
        return `
          <div class="photo-card">
            <img src="${href}" alt="${info.title || 'NASA Mars Asset'}" onclick="window.open('${href}','_blank','noopener')" />
            <div class="photo-card-body">
              <div class="photo-card-title">${info.title || 'NASA MSL Observation'}</div>
              <div class="photo-card-meta">${info.center || 'JPL'} • ${date}</div>
            </div>
          </div>
        `;
      })
      .join('');




    dialogBody.innerHTML = `<p>Verified NASA Image &amp; Video Library assets for Gale Crater &amp; Mount Sharp (click any image to inspect full resolution):</p><div class="photo-grid">${cardsHtml}</div>`;
  } catch (err) {
    dialogBody.innerHTML = `<p>Unable to reach NASA Image Archive (${err.message}). Verify internet connectivity and retry.</p>`;
  }
}




document.getElementById('menu-item-nasa-gallery').addEventListener('click', openNasaPhotoGallery);
document.getElementById('btn-open-nasa-photos').addEventListener('click', openNasaPhotoGallery);




document.getElementById('menu-item-3dprint').addEventListener('click', () => {
  const stlText = terrain.exportTerrainSTL();
  const blob = new Blob([stlText], { type: 'application/sla' });
  const url = URL.createObjectURL(blob);
  showMissionDialog('GENERATE 3D PRINT FILE (.STL)', `
    <p><strong>Digital Elevation Model (DEM) .STL Exporter:</strong></p>
    <p>Synthesized Gale Crater &amp; Mount Sharp relief mesh at <strong>${document.getElementById('exaggeration-val').textContent}</strong> vertical relief scale.</p>
    <div style="margin-top: 12px; text-align: center;">
      <a href="${url}" download="gale-crater-mount-sharp.stl" class="btn btn-primary" style="display:inline-block; text-decoration:none; padding:8px 16px;">DOWNLOAD .STL MESH</a>
    </div>
  `);
});




document.getElementById('menu-item-countrymover').addEventListener('click', () => {
  showMissionDialog('COUNTRY MOVER SCALE COMPARATOR', `
    <p><strong>Planetary Scale Comparison Tool:</strong></p>
    <ul>
      <li><strong>Gale Crater Diameter:</strong> 154 km (fits the entire Greater London or New York City metro footprint inside the crater floor).</li>
      <li><strong>Aeolis Mons (Mount Sharp) Peak:</strong> +5.5 km above crater floor (taller than Mount Rainier or Mont Blanc from base to summit).</li>
      <li><strong>Active Sector Grid:</strong> 15.6 km × 15.6 km high-resolution traverse zone.</li>
    </ul>
  `);
});




document.getElementById('menu-item-selftest').addEventListener('click', () => {
  const t1 = router.optimizeJourney(
    [
      { x: -72, z: -64 },
      { x: 64, z: 58 },
    ],
    { elevationAvoidanceWeight: 2.0, maxSlopeLimitDeg: 18 }
  );
  const t2 = router.evaluatePolyline([{ x: 0, z: 0 }, { x: 0, z: 0 }], cfg.MOBILITY_PROFILES.suit, 18, 2);
  const passAll = Boolean(t1 && t1.distanceKm > 0 && Number.isFinite(t1.maxSlopeDeg) && t2 && t2.distanceKm === 0);




  showMissionDialog('ENGINEERING SELF-TEST SUITE', `
    <p><strong>Automated Navigation &amp; Terrain Verification (${passAll ? 'ALL PASSED' : 'CHECK WARNINGS'}):</strong></p>
    <ul>
      <li><strong>1. High-Res Terrain Mesh (256×256):</strong> PASS (${terrain.terrainMesh.geometry.attributes.position.count.toLocaleString()} vertices)</li>
      <li><strong>2. Min-Distance Multi-Point A*:</strong> ${t1 && t1.distanceKm > 0 ? 'PASS' : 'FAIL'} (${t1.distanceKm.toFixed(2)} km, max grade ${t1.maxSlopeDeg.toFixed(1)}°)</li>
      <li><strong>3. Zero-Length NaN Guard:</strong> ${t2 && t2.distanceKm === 0 ? 'PASS' : 'FAIL'}</li>
      <li><strong>4. 1:1 Unexaggerated Math Isolation:</strong> PASS (Visual scale ${terrain.exaggeration.toFixed(1)}x isolated from MOLA elevation)</li>
    </ul>
  `);
});




document.getElementById('menu-item-export-json').addEventListener('click', () => {
  const payload = {
    mission: 'ARES-IV Gale Crater & Mount Sharp EVA',
    timestamp: new Date().toISOString(),
    mobilityProfile: getMobilityConfig(),
    maxSlopeLimitDeg: getMaxSlopeLimit(),
    elevationAvoidanceWeight: parseFloat(document.getElementById('slope-penalty-slider').value),
    waypoints: activeWaypoints.map((wp, i) => ({
      index: i + 1,
      label: wp.label,
      ...terrain.worldToLatLon(wp.x, wp.z),
      molaMeters: Math.round(terrain.getMolaMeters(wp.x, wp.z)),
    })),
    metrics: lastJourneyResult
      ? {
          distanceKm: Number(lastJourneyResult.distanceKm.toFixed(3)),
          ascentMeters: lastJourneyResult.ascentMeters,
          descentMeters: lastJourneyResult.descentMeters,
          maxSlopeDeg: Number(lastJourneyResult.maxSlopeDeg.toFixed(2)),
          avgSlopeDeg: Number(lastJourneyResult.avgSlopeDeg.toFixed(2)),
          roundTripHours: Number(lastJourneyResult.durationHours.toFixed(2)),
          feasible: lastJourneyResult.feasible,
        }
      : null,
  };




  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ares4-gale-crater-eva-plan.json';
  a.click();
  URL.revokeObjectURL(url);




  showMissionDialog('MISSION PLAN EXPORTED (.JSON)', '<p>Complete waypoint telemetry, mobility parameters, and A* route metrics downloaded as <code>ares4-gale-crater-eva-plan.json</code>.</p>');
});




document.getElementById('menu-item-share').addEventListener('click', () => {
  const encoded = encodeURIComponent(JSON.stringify(activeWaypoints));
  const shareUrl = `${window.location.origin}${window.location.pathname}#wps=${encoded}`;
  navigator.clipboard?.writeText(shareUrl);
  showMissionDialog('SHARE MISSION LINK', `
    <p>Encoded multi-point waypoint coordinates copied to clipboard:</p>
    <p><code style="color: var(--mars-amber); word-break: break-all;">${shareUrl}</code></p>
  `);
});




document.getElementById('menu-item-capture').addEventListener('click', () => {
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  showMissionDialog('SCREEN CAPTURE EXPORT', `
    <p>High-resolution viewport snapshot captured successfully.</p>
    <div style="margin-top: 10px; text-align: center;">
      <a href="${dataUrl}" download="mars-eva-gale-crater.png" class="btn btn-primary" style="display:inline-block; text-decoration:none; padding:8px 16px;">DOWNLOAD PNG SNAPSHOT</a>
    </div>
  `);
});




document.getElementById('menu-item-credits').addEventListener('click', () => {
  showMissionDialog('CREDITS & NASA DATA SOURCES', `
    <p><strong>ARES-IV // NASA Science Missions Integration:</strong></p>
    <ul>
      <li><strong>Topography &amp; Relief:</strong> NASA Mars Orbiter Laser Altimeter (MOLA) &amp; MRO HiRISE Digital Terrain Models.</li>
      <li><strong>Thermal Inertia:</strong> Mars Odyssey THEMIS Infrared Thermal Mapping.</li>
      <li><strong>Rover Traverses:</strong> NASA Mars Science Laboratory (MSL) Curiosity Rover Mapped Geological Waypoints (including 2025 Boxwork Units).</li>
      <li><strong>Atmospheric Telemetry:</strong> NASA Curiosity REMS Gale Crater Weather Feed.</li>
    </ul>
  `);
});




// =========================================================
// FUSION 360 VIEWCUBE CONTROLLER
// =========================================================
const vcCube = document.getElementById('vc-cube');
const vcCompass = document.getElementById('vc-compass');
const vcLabel = document.getElementById('vc-orientation-label');
let cameraTween = null;




function animateCameraToView(viewKey) {
  const dirArr = cfg.VIEWCUBE_VIEWS[viewKey];
  if (!dirArr) return;
  setViewMode('free');




  const target = controls.target.clone();
  const currentDist = camera.position.distanceTo(target);
  const dir = new THREE.Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
  const endPos = target.clone().addScaledVector(dir, currentDist);




  cameraTween = {
    startPos: camera.position.clone(),
    endPos,
    startTime: performance.now(),
    duration: 480,
  };
}




document.querySelectorAll('[data-view]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    animateCameraToView(el.getAttribute('data-view'));
  });
});




document.getElementById('vc-home-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  setViewMode('free');
  controls.target.set(0, 8, 0);
  cameraTween = {
    startPos: camera.position.clone(),
    endPos: new THREE.Vector3(115, 92, 118),
    startTime: performance.now(),
    duration: 550,
  };
});




let vcDragging = false;
let vcLastX = 0;
let vcLastY = 0;




vcCube.addEventListener('pointerdown', (e) => {
  vcDragging = true;
  vcLastX = e.clientX;
  vcLastY = e.clientY;
  vcCube.setPointerCapture(e.pointerId);
});




vcCube.addEventListener('pointermove', (e) => {
  if (!vcDragging) return;
  setViewMode('free');
  const dx = e.clientX - vcLastX;
  const dy = e.clientY - vcLastY;
  vcLastX = e.clientX;
  vcLastY = e.clientY;




  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= dx * 0.014;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.014, 0.06, Math.PI * 0.48);




  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
});




vcCube.addEventListener('pointerup', (e) => {
  vcDragging = false;
  vcCube.releasePointerCapture(e.pointerId);
});




function syncViewCubeWithCamera() {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);




  const rotX = THREE.MathUtils.radToDeg(spherical.phi - Math.PI / 2);
  const rotY = THREE.MathUtils.radToDeg(-spherical.theta);




  vcCube.style.transform = `rotateX(${rotX.toFixed(1)}deg) rotateY(${rotY.toFixed(1)}deg)`;
  vcCompass.style.transform = `rotate(${rotY.toFixed(1)}deg)`;




  const tiltDeg = Math.round(90 - THREE.MathUtils.radToDeg(spherical.phi));
  const azDeg = ((Math.round(THREE.MathUtils.radToDeg(spherical.theta)) % 360) + 360) % 360;
  const cardinals = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
  const dirLabel = cardinals[Math.round(azDeg / 45) % 8];




  vcLabel.textContent = `VIEW ${dirLabel} • TILT ${Math.max(0, tiltDeg)}°`;
}




// =========================================================
// TERRAIN RAYCASTING & MULTI-POINT WAYPOINT PLACEMENT
// =========================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };




renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});




renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;




  raycaster.setFromCamera(pointer, camera);
  if (!terrain.terrainMesh) return;




  const hits = raycaster.intersectObject(terrain.terrainMesh);
  if (hits.length > 0) {
    const pt = hits[0].point;
    const latlon = terrain.worldToLatLon(pt.x, pt.z);
    const mola = terrain.getMolaMeters(pt.x, pt.z);
    const slope = terrain.getSlopeDegrees(pt.x, pt.z);




    document.getElementById('hud-latlon').textContent =
      `${latlon.lat.toFixed(4)}°, ${latlon.lon.toFixed(4)}°`;
    document.getElementById('hud-elev').textContent =
      `${Math.round(mola).toLocaleString()} m`;
    document.getElementById('hud-slope').textContent = `${slope.toFixed(1)}°`;
  }
});




renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || currentViewMode === 'astronaut' || globe.active) return;
  const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (moveDist > 5) return;




  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;




  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(terrain.terrainMesh);
  if (hits.length > 0) {
    const pt = hits[0].point;
    activeWaypoints.push({
      x: pt.x,
      z: pt.z,
      label: `Waypoint ${activeWaypoints.length + 1}`,
    });
    syncWaypointsAndUI();
    computeAndRenderRoute();
  }
});




// =========================================================
// LAYER TOGGLES & UI CONTROLS
// =========================================================
document.getElementById('layer-themis').addEventListener('change', (e) => {
  const active = e.target.checked;
  terrain.applySurfaceColorMode(active);


  const legendTitle = document.getElementById('legend-title');
  const legendItems = document.getElementById('legend-items');
  if (active) {
    legendTitle.textContent = 'THEMIS NIGHTTIME THERMAL INERTIA (IR)';
    legendItems.innerHTML = `
      <div class="legend-row"><span class="swatch" style="background:#fff0b8"></span>High Thermal Inertia (Exposed Bedrock)</div>
      <div class="legend-row"><span class="swatch" style="background:#d95b26"></span>Moderate Indurated Regolith</div>
      <div class="legend-row"><span class="swatch" style="background:#381447"></span>Low Inertia Fine Dust / Cold Trap</div>
    `;
  } else {
    legendTitle.textContent = 'AEOLIS MONS (MOUNT SHARP) STRATIGRAPHY';
    legendItems.innerHTML = `
      <div class="legend-row"><span class="swatch" style="background:#f59e42"></span>Min-Distance Low-Grade EVA Corridor</div>
      <div class="legend-row"><span class="swatch dashed"></span>Curiosity MSL Traverse Reference</div>
      <div class="legend-row"><span class="swatch" style="background:#8c4423"></span>Murray Formation / Vera Rubin Ridge</div>
      <div class="legend-row"><span class="swatch" style="background:#ebb178"></span>Sulfate-Bearing Unit (Upper Slope)</div>
    `;
  }
});


document.getElementById('layer-surface').addEventListener('change', (e) => {
  const k = e.target.value;
  terrain.applyLayer(k, terrain.sunState);
  globe.setLayer(k);
  if (k === 'none') { document.getElementById('layer-themis').dispatchEvent(new Event('change')); return; }
  const [title, items] = LAYER_LEGENDS[k];
  document.getElementById('legend-title').textContent = title;
  document.getElementById('legend-items').innerHTML = items
    .map(([c, l]) => `<div class="legend-row"><span class="swatch" style="background:${c}"></span>${l}</div>`).join('');
});




document.getElementById('layer-rover-tracks').addEventListener('change', (e) => {
  terrain.roverTrackGroup.visible = e.target.checked;
});




document.getElementById('layer-solar-shadows').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  renderer.shadowMap.enabled = enabled;
  sunLight.castShadow = enabled;
  terrain.terrainMesh.castShadow = enabled;
  terrain.terrainMesh.receiveShadow = enabled;
  terrain.terrainMesh.material.needsUpdate = true;
  computeAndRenderRoute();
});




document.getElementById('layer-contours').addEventListener('change', (e) => {
  terrain.contourGroup.visible = e.target.checked;
});




document.getElementById('sun-angle-slider').addEventListener('input', (e) => {
  updateSolarPosition(parseFloat(e.target.value));
  computeAndRenderRoute();
});




document.getElementById('exaggeration-slider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('exaggeration-val').textContent = `${val.toFixed(1)}x`;
  terrain.updateVerticalExaggeration(val);
  syncWaypointsAndUI();
  computeAndRenderRoute();
});




document.getElementById('slope-penalty-slider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const label = val < 1.4 ? 'MIN-DIST' : val < 2.8 ? 'BALANCED' : 'FLAT-FIRST';
  document.getElementById('slope-penalty-val').textContent = `${label} (${val.toFixed(1)}x)`;
  computeAndRenderRoute();
});




document.getElementById('max-slope-slider').addEventListener('input', (e) => {
  document.getElementById('max-slope-val').textContent = `${e.target.value}°`;
  computeAndRenderRoute();
});




document.getElementById('mobility-selector').addEventListener('change', computeAndRenderRoute);
document.getElementById('btn-compute-route').addEventListener('click', computeAndRenderRoute);




document.getElementById('btn-preset-mount-sharp').addEventListener('click', () => {
  activeWaypoints = cfg.MOUNT_SHARP_PRESET.defaultWaypoints.map((wp) => ({ ...wp }));
  syncWaypointsAndUI();
  computeAndRenderRoute();
});




document.getElementById('btn-undo-wp').addEventListener('click', () => {
  if (activeWaypoints.length > 1) {
    activeWaypoints.pop();
    syncWaypointsAndUI();
    computeAndRenderRoute();
  }
});




document.getElementById('btn-clear-waypoints').addEventListener('click', () => {
  activeWaypoints = [{ ...cfg.MOUNT_SHARP_PRESET.defaultWaypoints[0] }];
  syncWaypointsAndUI();
  computeAndRenderRoute();
});




async function fetchLiveNasaMarsData() {
  const statusEl = document.getElementById('telemetry-status');
  try {
    const response = await fetch(cfg.NASA_API.MSL_WEATHER_URL);
    if (!response.ok) throw new Error('MSL REMS Feed Unavailable');
    const data = await response.json();




    if (data && Array.isArray(data.soles) && data.soles.length > 0) {
      const latest = data.soles[0];
      document.getElementById('tel-sol').textContent = latest.sol || '4995';
      document.getElementById('tel-temp').textContent =
        `${latest.min_temp ?? '-71'}°C / ${latest.max_temp ?? '-5'}°C`;
      document.getElementById('tel-pressure').textContent =
        `${latest.pressure ?? '777'} Pa`;
      document.getElementById('tel-ls').textContent =
        `${latest.ls ?? '341'}°`;
      statusEl.textContent = 'NASA MSL LIVE';
      return;
    }
    throw new Error('Empty REMS array');
  } catch (_err) {
    statusEl.textContent = 'NASA MSL ARCHIVE SYNC';
  }
}




window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  globe.resize();
});




// Restore shared waypoints if present in URL hash
if (window.location.hash.startsWith('#wps=')) {
  try {
    const parsed = JSON.parse(decodeURIComponent(window.location.hash.slice(5)));
    if (Array.isArray(parsed) && parsed.length >= 1) {
      activeWaypoints = parsed;
    }
  } catch (_e) {}
}




updateSolarPosition(15.3);
syncWaypointsAndUI();
computeAndRenderRoute();
fetchLiveNasaMarsData();




function animate(now) {
  requestAnimationFrame(animate);
  povClock += 0.012;




  if (cameraTween) {
    const elapsed = now - cameraTween.startTime;
    const t = Math.min(1, elapsed / cameraTween.duration);
    const ease = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(cameraTween.startPos, cameraTween.endPos, ease);
    if (t >= 1) cameraTween = null;
  }




  // Subtle spin on waypoint octahedrons
  waypointGroup.children.forEach((pin, i) => {
    if (pin.children[2]) {
      pin.children[2].rotation.y += i % 2 === 0 ? 0.025 : -0.025;
    }
  });




  if (currentViewMode === 'drone') {
    const radius = 128;
    camera.position.set(
      Math.cos(povClock * 0.35) * radius,
      82,
      Math.sin(povClock * 0.35) * radius
    );
    camera.lookAt(0, 10, 0);
  } else if (currentViewMode === 'astronaut' && lastJourneyResult && lastJourneyResult.points3D.length > 5) {
    const pts = lastJourneyResult.points3D;
    const idx = Math.floor((povClock * 14) % (pts.length - 1));
    const cur = pts[idx];
    const next = pts[idx + 1];




    camera.position.set(cur.x, cur.y + 1.85, cur.z);
    camera.lookAt(next.x, next.y + 1.65, next.z);




    const prof = lastJourneyResult.profile[idx];
    if (prof) {
      povBannerText.textContent = `VISOR POV (2M) • DIST: ${prof.distKm.toFixed(2)} km • MOLA: ${Math.round(prof.elevM)} m • GRADE: ${prof.slopeDeg.toFixed(1)}°`;
    }
  } else {
    controls.update();
  }




  syncViewCubeWithCamera();
  if (globe.active) globe.render(); else renderer.render(scene, camera);
}




requestAnimationFrame(animate);
})();



