/**
 * ARES-IV Master Application Controller
 * Integrates CesiumJS 3D Spherical Globe + 2.5D Flat Terrain View,
 * Real USGS MOLA DEM Patches, Multi-Mission WMTS Overlays with 2x1 GeographicTilingScheme,
 * AresViews Slope Map & Astronaut HUD, 2m Visor / 1.5km VTOL Fly-Through & NASA Archive APIs.
 */
(function () {
  const cfg = window.MARS_CONFIG;
  const terrain = new MartianTerrain();
  const router = new EVARouter(terrain);
  const marsEllipsoid = terrain.marsEllipsoid;
  const marsTiling = new Cesium.GeographicTilingScheme({
    ellipsoid: marsEllipsoid,
    numberOfLevelZeroTilesX: 2,
    numberOfLevelZeroTilesY: 1
  });

  // Initialize Cesium Viewer with 3D Sphere, 2.5D Flat (Columbus View), and 2D Map support
  const viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    timeline: false,
    animation: false,
    baseLayer: false,
    globe: new Cesium.Globe(marsEllipsoid),
    mapProjection: new Cesium.GeographicProjection(marsEllipsoid)
  });

  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1.5;

  // Multi-Mission NASA Mars Trek WMTS Layers with explicit 2x1 Mars Equirectangular TilingScheme
  const providers = {
    viking: new Cesium.WebMapTileServiceImageryProvider({
      url: cfg.NASA_API.WMTS_VIKING,
      layer: 'Viking_MDIM21_ClrMosaic_global_232m',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 8,
      tilingScheme: marsTiling,
      ellipsoid: marsEllipsoid
    }),
    mola: new Cesium.WebMapTileServiceImageryProvider({
      url: cfg.NASA_API.WMTS_MOLA_HILLSHADE,
      layer: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 7,
      tilingScheme: marsTiling,
      ellipsoid: marsEllipsoid
    }),
    themis: new Cesium.WebMapTileServiceImageryProvider({
      url: cfg.NASA_API.WMTS_THEMIS_IR,
      layer: 'Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12',
      style: 'default',
      format: 'image/png',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 8,
      tilingScheme: marsTiling,
      ellipsoid: marsEllipsoid
    })
  };

  viewer.imageryLayers.addImageryProvider(providers.viking);
  const activeLayers = {
    mola: viewer.imageryLayers.addImageryProvider(providers.mola),
    themis: viewer.imageryLayers.addImageryProvider(providers.themis)
  };
  activeLayers.mola.alpha = 0.65;
  activeLayers.themis.alpha = 0.55;
  activeLayers.themis.show = false;

  async function probeLayerTile(sampleUrl, pillId, readyText) {
    const pill = document.getElementById(pillId);
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('Timeout')), 6000);
        img.onload = () => { clearTimeout(timer); resolve(); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('Unreachable')); };
        img.src = sampleUrl;
      });
      if (pill) pill.textContent = readyText;
    } catch (_e) {
      if (pill) {
        pill.textContent = 'FAILED';
        pill.style.borderColor = '#ef4444';
        pill.style.color = '#fca5a5';
      }
    }
  }

  probeLayerTile('https://trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/0/0/0.jpg', 'status-viking', 'READY');
  probeLayerTile('https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/0/0/0.jpg', 'status-mola', 'READY');

  // Application State
  let selectedSite = cfg.SITES.gale;
  let waypoints = [];
  let profileSamples = [];
  let lastComparisonData = null;
  let lastOptimizationSummary = null;
  let activeFlyTimer = null;
  let activeGalleryController = null;

  const sitePinEntities = [];
  const routeEntities = [];
  const roverTrackEntities = [];
  const contourEntities = [];

  function getMobilityConfig() {
    const key = document.getElementById('mobility-selector').value;
    return cfg.MOBILITY_PROFILES[key] || cfg.MOBILITY_PROFILES.suit;
  }

  function getMaxSlopeLimit() {
    return parseFloat(document.getElementById('max-slope-slider').value) || 16;
  }

  function getAvoidanceWeight() {
    return parseFloat(document.getElementById('slope-penalty-slider').value) || 2.0;
  }

  function renderSitePins() {
    sitePinEntities.forEach(e => viewer.entities.remove(e));
    sitePinEntities.length = 0;

    Object.values(cfg.SITES).forEach(site => {
      const elev = terrain.getMolaMeters(site.lon, site.lat);
      const visH = terrain.getVisualSurfaceHeight(site.lon, site.lat, 1800);
      sitePinEntities.push(viewer.entities.add({
        id: `site_pin_${site.key}`,
        siteData: site,
        position: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, visH, marsEllipsoid),
        point: { pixelSize: 11, color: Cesium.Color.GOLD, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: {
          text: `📍 ${site.name} (${elev}m)`,
          font: 'bold 11.5px Chakra Petch, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#f7dec8'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16)
        }
      }));
    });
  }

  function renderRoverTraverses() {
    roverTrackEntities.forEach(e => viewer.entities.remove(e));
    roverTrackEntities.length = 0;
    if (!document.getElementById('layer-rover-tracks').checked) return;

    Object.entries(cfg.ROVER_TRAVERSES).forEach(([, points]) => {
      const positions = points.map(pt =>
        Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, terrain.getVisualSurfaceHeight(pt.lon, pt.lat, 90), marsEllipsoid)
      );
      roverTrackEntities.push(viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#d946ef'),
            dashLength: 12.0
          })
        }
      }));
      points.forEach(pt => {
        roverTrackEntities.push(viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, terrain.getVisualSurfaceHeight(pt.lon, pt.lat, 110), marsEllipsoid),
          point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#f0abfc'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
          label: {
            text: pt.name,
            font: '9.5px JetBrains Mono, monospace',
            fillColor: Cesium.Color.fromCssColorString('#f5d0fe'),
            pixelOffset: new Cesium.Cartesian2(0, -11),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 260000)
          }
        }));
      });
    });
  }

  function renderLocalContours() {
    contourEntities.forEach(e => viewer.entities.remove(e));
    contourEntities.length = 0;
    if (!document.getElementById('layer-contours').checked || terrain.demSourceState === 'ERROR') return;

    const cLon = selectedSite.lon;
    const cLat = selectedSite.lat;
    const radii = [0.18, 0.36, 0.54, 0.72, 0.9];
    radii.forEach(rDeg => {
      const ringPos = [];
      for (let a = 0; a <= 360; a += 10) {
        const rad = Cesium.Math.toRadians(a);
        const lon = cLon + Math.cos(rad) * rDeg;
        const lat = cLat + Math.sin(rad) * rDeg;
        ringPos.push(Cesium.Cartesian3.fromDegrees(lon, lat, terrain.getVisualSurfaceHeight(lon, lat, 75), marsEllipsoid));
      }
      contourEntities.push(viewer.entities.add({
        polyline: {
          positions: ringPos,
          width: 1.5,
          material: Cesium.Color.fromCssColorString('rgba(240, 157, 81, 0.42)')
        }
      }));
    });
  }

  function syncWaypointListUI() {
    document.getElementById('wp-count-label').textContent = waypoints.length;
    const listUI = document.getElementById('waypoint-list-ui');
    listUI.textContent = '';

    waypoints.forEach((wp, idx) => {
      const tag = idx === 0 ? 'ORIGIN' : idx === waypoints.length - 1 ? 'TARGET' : `WP ${idx + 1}`;
      const row = document.createElement('div');
      row.className = 'wp-list-item';

      const leftSpan = document.createElement('span');
      leftSpan.textContent = `[${tag}] ${wp.lat.toFixed(2)}°, ${wp.lon.toFixed(2)}°`;

      const rightDiv = document.createElement('div');
      rightDiv.className = 'wp-item-actions';
      const elevSpan = document.createElement('span');
      elevSpan.textContent = `${wp.elev}m`;
      rightDiv.appendChild(elevSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'wp-del-btn';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        waypoints.splice(idx, 1);
        invalidateAndRebuildRoute(true);
      });
      rightDiv.appendChild(delBtn);

      row.appendChild(leftSpan);
      row.appendChild(rightDiv);
      listUI.appendChild(row);
    });
  }

  function renderInlineComparisonTable(directMetrics, optMetrics) {
    const wrapper = document.getElementById('inline-comparison-wrapper');
    const tbody = document.getElementById('inline-comparison-tbody');
    tbody.textContent = '';
    if (!directMetrics || !optMetrics) {
      wrapper.style.display = 'none';
      return;
    }
    wrapper.style.display = 'block';

    const rows = [
      ['Geodesic Dist', `${(directMetrics.totalDistMeters / 1000).toFixed(2)} km`, `${(optMetrics.totalDistMeters / 1000).toFixed(2)} km`],
      ['Max Sampled Slope', `${directMetrics.maxLocalSlopeDeg.toFixed(1)}°`, `${optMetrics.maxLocalSlopeDeg.toFixed(1)}°`],
      ['Climb / Drop', `+${Math.round(directMetrics.totalAscent)}m / -${Math.round(directMetrics.totalDescent)}m`, `+${Math.round(optMetrics.totalAscent)}m / -${Math.round(optMetrics.totalDescent)}m`],
      ['Out / Return', `${directMetrics.outboundWalkHours.toFixed(1)}h / ${directMetrics.returnWalkHours.toFixed(1)}h`, `${optMetrics.outboundWalkHours.toFixed(1)}h / ${optMetrics.returnWalkHours.toFixed(1)}h`],
      ['Feasibility', directMetrics.feasible ? 'PASS' : 'FAIL', optMetrics.feasible ? 'PASS' : 'FAIL']
    ];

    rows.forEach(([label, dVal, oVal]) => {
      const tr = document.createElement('tr');
      [label, dVal, oVal].forEach((txt, i) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (i > 0 && txt === 'FAIL') td.style.color = '#f87171';
        if (i > 0 && txt === 'PASS') td.style.color = '#4ade80';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function drawElevationSparkline() {
    const canvas = document.getElementById('elevation-profile-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (profileSamples.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText('Click 2+ points on Mars (or click BENCHMARK)...', 16, 48);
      return;
    }

    const padL = 44, padR = 12, padT = 12, padB = 20;
    const plotW = canvas.width - padL - padR;
    const plotH = canvas.height - padT - padB;

    const elevs = profileSamples.map(s => s.elev);
    const minE = Math.min(...elevs) - 120;
    const maxE = Math.max(...elevs) + 120;
    const maxDist = profileSamples[profileSamples.length - 1].distKm || 1;
    const maxSlopeLimit = getMaxSlopeLimit();

    ctx.strokeStyle = 'rgba(196, 113, 62, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = '#e6c3a5';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(`${Math.round(maxE)}m`, 3, padT + 7);
    ctx.fillText(`${Math.round(minE)}m`, 3, padT + plotH);
    ctx.fillText('0.0km', padL, canvas.height - 4);
    ctx.fillText(`${maxDist.toFixed(1)}km`, padL + plotW - 38, canvas.height - 4);

    ctx.beginPath();
    profileSamples.forEach((s, i) => {
      const x = padL + (s.distKm / maxDist) * plotW;
      const y = padT + plotH - ((s.elev - minE) / Math.max(1, maxE - minE)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.lineTo(padL, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 242, 254, 0.16)';
    ctx.fill();

    profileSamples.forEach(s => {
      if (s.slopeDeg > maxSlopeLimit) {
        const x = padL + (s.distKm / maxDist) * plotW;
        const y = padT + plotH - ((s.elev - minE) / Math.max(1, maxE - minE)) * plotH;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function rebuildRouteAndTelemetry() {
    routeEntities.forEach(e => viewer.entities.remove(e));
    routeEntities.length = 0;
    profileSamples = [];

    const mob = getMobilityConfig();
    const maxSlopeLimit = getMaxSlopeLimit();
    const routeBadge = document.getElementById('route-status-badge');
    const gradeBadge = document.getElementById('profile-grade-badge');
    const computeBtn = document.getElementById('btn-compute-route');

    document.getElementById('budget-limit-label').textContent = `${mob.maxBudgetH.toFixed(1)}h`;

    waypoints.forEach((wp, index) => {
      wp.elev = terrain.getMolaMeters(wp.lon, wp.lat);
      const wpPos = Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, terrain.getVisualSurfaceHeight(wp.lon, wp.lat, 140), marsEllipsoid);
      routeEntities.push(viewer.entities.add({
        position: wpPos,
        point: { pixelSize: 9, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
        label: {
          text: `${wp.label || `WP${index + 1}`} (${wp.elev}m)`,
          font: '10.5px JetBrains Mono, monospace',
          fillColor: Cesium.Color.CYAN,
          pixelOffset: new Cesium.Cartesian2(0, -14)
        }
      }));

      if (wp.viaPoints && wp.viaPoints.length > 0) {
        wp.viaPoints.forEach(vp => {
          const vpPos = Cesium.Cartesian3.fromDegrees(vp.lon, vp.lat, terrain.getVisualSurfaceHeight(vp.lon, vp.lat, 110), marsEllipsoid);
          routeEntities.push(viewer.entities.add({
            position: vpPos,
            point: { pixelSize: 5, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 }
          }));
        });
      }
    });

    syncWaypointListUI();

    if (terrain.demSourceState === 'LOADING' || terrain.demSourceState === 'ERROR' || waypoints.length < 2) {
      computeBtn.disabled = true;
      computeBtn.textContent =
        terrain.demSourceState === 'LOADING'
          ? '⏳ LOADING MOLA DEM...'
          : terrain.demSourceState === 'ERROR'
          ? '⚠️ RUN make_patches.py FIRST'
          : '🧭 RUN METRIC A* (NEED 2+ WPS)';
      routeBadge.className = 'badge-amber';
      routeBadge.textContent = waypoints.length === 1 ? 'AWAITING TARGET' : 'NO ROUTE';
      gradeBadge.textContent = 'AWAITING ROUTE';
      document.getElementById('metric-distance').textContent = '0.00 km';
      document.getElementById('metric-gain').textContent = '+0 / -0 m';
      document.getElementById('metric-slope').textContent = '0.0° / 0.0°';
      document.getElementById('metric-net-elev').textContent = '0 m';
      document.getElementById('t-out').textContent = '0.0h';
      document.getElementById('t-ret').textContent = '0.0h';
      document.getElementById('t-stop').textContent = '0.0h';
      document.getElementById('t-rsv').textContent = '0.0h';
      document.getElementById('metric-time').textContent = '0.0h';
      document.getElementById('budget-pct-label').textContent = '100% REM';
      document.getElementById('budget-bar').style.width = '100%';
      document.getElementById('hazard-container').textContent = '';
      renderInlineComparisonTable(null, null);
      drawElevationSparkline();
      return;
    }

    computeBtn.disabled = waypoints[waypoints.length - 1].isOptimized;
    computeBtn.textContent = waypoints[waypoints.length - 1].isOptimized
      ? '✓ A* EVALUATED (ADJUST SLIDERS TO RE-RUN)'
      : `🧭 RUN METRIC A* (≤${maxSlopeLimit}° LIMIT)`;

    const fullNodeChain = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
      if (waypoints[i].viaPoints && waypoints[i].viaPoints.length > 0) {
        waypoints[i].viaPoints.forEach(vp => fullNodeChain.push(vp));
      }
      fullNodeChain.push(waypoints[i]);
    }

    const metrics = router.evaluateNodeChain(fullNodeChain, mob, maxSlopeLimit);
    profileSamples = metrics.samples;

    metrics.segments.forEach(seg => {
      let subColor = Cesium.Color.fromCssColorString('#00f2fe');
      if (!seg.valid || seg.slopeDeg > maxSlopeLimit) subColor = Cesium.Color.RED;
      else if (seg.slopeDeg > maxSlopeLimit * 0.5) subColor = Cesium.Color.ORANGE;

      const pos1 = Cesium.Cartesian3.fromDegrees(seg.lon1, seg.lat1, terrain.getVisualSurfaceHeight(seg.lon1, seg.lat1, 95), marsEllipsoid);
      const pos2 = Cesium.Cartesian3.fromDegrees(seg.lon2, seg.lat2, terrain.getVisualSurfaceHeight(seg.lon2, seg.lat2, 95), marsEllipsoid);
      routeEntities.push(viewer.entities.add({
        polyline: {
          positions: [pos1, pos2],
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: subColor })
        }
      }));
    });

    if (metrics.feasible) {
      routeBadge.className = 'badge-amber ok';
      routeBadge.textContent = 'FEASIBLE UNDER MODEL';
      gradeBadge.textContent = `MAX ${metrics.maxLocalSlopeDeg.toFixed(1)}° (PASS)`;
    } else {
      routeBadge.className = 'badge-amber danger';
      routeBadge.textContent = 'INFEASIBLE (VIOLATION)';
      gradeBadge.textContent = 'CONSTRAINT ALERT';
    }

    const netElev = waypoints[waypoints.length - 1].elev - waypoints[0].elev;
    const netSign = netElev > 0 ? '+' : '';
    document.getElementById('metric-distance').textContent = `${(metrics.totalDistMeters / 1000).toFixed(2)} km`;
    document.getElementById('metric-gain').textContent = `+${Math.round(metrics.totalAscent)} / -${Math.round(metrics.totalDescent)} m`;
    document.getElementById('metric-slope').textContent = `${metrics.maxLocalSlopeDeg.toFixed(1)}° / ${metrics.avgSlopeDeg.toFixed(1)}°`;
    document.getElementById('metric-net-elev').textContent = `${netSign}${netElev} m`;

    document.getElementById('t-out').textContent = `${metrics.outboundWalkHours.toFixed(1)}h`;
    document.getElementById('t-ret').textContent = `${metrics.returnWalkHours.toFixed(1)}h`;
    document.getElementById('t-stop').textContent = `${metrics.scienceStopsHours.toFixed(2)}h`;
    document.getElementById('t-rsv').textContent = `${metrics.reserveHours.toFixed(1)}h`;
    document.getElementById('metric-time').textContent = `${metrics.totalMissionHours.toFixed(1)}h`;

    const remPct = Math.max(0, Math.round(100 - (metrics.totalMissionHours / mob.maxBudgetH) * 100));
    document.getElementById('budget-pct-label').textContent = `${remPct}% REM`;
    const bar = document.getElementById('budget-bar');
    bar.style.width = `${remPct}%`;
    bar.style.backgroundColor = remPct > 40 ? '#4ade80' : remPct > 15 ? '#f59e0b' : '#ef4444';

    renderInlineComparisonTable(lastComparisonData?.direct, lastComparisonData?.optimized);

    const hazardBox = document.getElementById('hazard-container');
    hazardBox.textContent = '';

    if (lastOptimizationSummary) {
      const infoDiv = document.createElement('div');
      infoDiv.className = lastOptimizationSummary.startsWith('INFEASIBLE') ? 'hazard-item' : 'info-item';
      infoDiv.textContent = lastOptimizationSummary;
      hazardBox.appendChild(infoDiv);
    }

    const alerts = [];
    if (metrics.hasNoData) alerts.push('NO-DATA VIOLATION: Route crosses cells outside active MOLA patch/grid coverage.');
    if (metrics.violatesSlope) alerts.push(`HARD SLOPE VIOLATION: Sampled grade (${metrics.maxLocalSlopeDeg.toFixed(1)}°) exceeds ${maxSlopeLimit}° threshold.`);
    if (metrics.exceedsBudget) alerts.push(`TIME BUDGET EXCEEDED: Total EVA duration (${metrics.totalMissionHours.toFixed(1)}h) exceeds ${mob.maxBudgetH.toFixed(1)}h limit.`);
    if (waypoints.some(w => Math.abs(w.lat) > 65) && document.getElementById('layer-themis').checked) {
      alerts.push('THEMIS COVERAGE GAP: Route enters >65° latitude; THEMIS Day-IR mosaic lacks polar coverage.');
    }
    if (document.getElementById('layer-solar-shadows').checked) {
      const lst = parseFloat(document.getElementById('sun-angle-slider').value);
      if (lst < 6.5 || lst > 17.5) {
        alerts.push(`LOW-SUN COLD TRAP (${document.getElementById('sun-time-val').textContent}): Deep crater shadows active; auxiliary suit thermal reserve required.`);
      }
    }

    alerts.forEach(msg => {
      const d = document.createElement('div');
      d.className = 'hazard-item';
      d.textContent = msg;
      hazardBox.appendChild(d);
    });

    drawElevationSparkline();
  }

  function invalidateAndRebuildRoute(clearDetours = false) {
    exitPovMode();
    if (clearDetours) {
      waypoints.forEach(wp => { wp.isOptimized = false; wp.viaPoints = []; });
      lastOptimizationSummary = null;
      lastComparisonData = null;
    }
    rebuildRouteAndTelemetry();
  }

  function optimizeAllSegments() {
    if (waypoints.length < 2) return;
    const mob = getMobilityConfig();
    const maxSlopeLimit = getMaxSlopeLimit();
    const avoidanceWeight = getAvoidanceWeight();

    const endWp = waypoints[waypoints.length - 1];
    const startWp = waypoints[waypoints.length - 2];

    const directEval = router.evaluateNodeChain([startWp, endWp], mob, maxSlopeLimit);
    const astarRes = router.runMetricTangentAStar(startWp, endWp, mob, maxSlopeLimit, avoidanceWeight);

    endWp.isOptimized = true;

    if (!astarRes.found) {
      endWp.viaPoints = [];
      lastComparisonData = null;
      lastOptimizationSummary = `INFEASIBLE CORRIDOR: ${astarRes.reason}`;
      rebuildRouteAndTelemetry();
      return;
    }

    const candChain = [startWp, ...astarRes.viaPoints, endWp];
    const candEval = router.evaluateNodeChain(candChain, mob, maxSlopeLimit);
    lastComparisonData = { direct: directEval, optimized: candEval };

    if (!candEval.hasNoData && !candEval.violatesSlope) {
      const directScore = directEval.totalDistMeters * (1 + Math.pow(directEval.maxLocalSlopeDeg / maxSlopeLimit, 2) * avoidanceWeight);
      const candScore = candEval.totalDistMeters * (1 + Math.pow(candEval.maxLocalSlopeDeg / maxSlopeLimit, 2) * avoidanceWeight);

      if (directEval.violatesSlope || (astarRes.viaPoints.length > 0 && candScore < directScore * 0.995)) {
        endWp.viaPoints = astarRes.viaPoints;
        lastOptimizationSummary = `A* FEASIBLE DETOUR (${astarRes.expandedCount} nodes): Grade ${directEval.maxLocalSlopeDeg.toFixed(1)}° → ${candEval.maxLocalSlopeDeg.toFixed(1)}°; Dist ${(directEval.totalDistMeters / 1000).toFixed(2)}km → ${(candEval.totalDistMeters / 1000).toFixed(2)}km.`;
      } else {
        endWp.viaPoints = [];
        lastOptimizationSummary = `A* VERIFIED DIRECT GEODESIC: Baseline path (${directEval.maxLocalSlopeDeg.toFixed(1)}° max grade) is already feasible and optimal.`;
      }
    } else {
      endWp.viaPoints = [];
      lastOptimizationSummary = `INFEASIBLE CANDIDATE REJECTED: Post-search geodesic check found ${candEval.maxLocalSlopeDeg.toFixed(1)}° grade (Limit: ${maxSlopeLimit}°).`;
    }

    rebuildRouteAndTelemetry();
  }

  // Dual-Mode 3D Route Fly-Through (1.5km VTOL Drone Recon vs 2.2m Offroad / Astronaut POV)
  function exitPovMode() {
    if (activeFlyTimer) {
      cancelAnimationFrame(activeFlyTimer);
      activeFlyTimer = null;
    }
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    document.getElementById('pov-banner').classList.add('hidden');
    ['btn-pov-free', 'btn-pov-drone', 'btn-pov-astronaut'].forEach(id =>
      document.getElementById(id).classList.remove('active-pov')
    );
    document.getElementById('btn-pov-free').classList.add('active-pov');
  }

  function startRouteFlyThrough(mode) {
    if (profileSamples.length < 2) loadBenchmarkPreset();
    if (profileSamples.length < 2) return;
    exitPovMode();

    const isDrone = mode === 'drone';
    document.getElementById('btn-pov-free').classList.remove('active-pov');
    document.getElementById(isDrone ? 'btn-pov-drone' : 'btn-pov-astronaut').classList.add('active-pov');

    const clearanceMeters = isDrone ? 1500.0 : 2.2; 
    const banner = document.getElementById('pov-banner');
    const bannerText = document.getElementById('pov-banner-text');
    banner.classList.remove('hidden');

    let progress = 0; 
    const speed = isDrone ? 0.08 : 0.03; // Smoothness speed

    function frameLoop() {
      // Stop condition
      if (!document.getElementById(isDrone ? 'btn-pov-drone' : 'btn-pov-astronaut').classList.contains('active-pov')) return;
      if (progress >= profileSamples.length - 2) {
        bannerText.textContent = `✓ ${isDrone ? 'VTOL RECON' : 'SURFACE TRAVERSE'} COMPLETE`;
        return;
      }

      // Smooth interpolation math
      const idx = Math.floor(progress);
      const frac = progress - idx;
      const p1 = profileSamples[idx];
      const p2 = profileSamples[idx + 1];

      // Glide current coordinates
      const curLon = p1.lon + (p2.lon - p1.lon) * frac;
      const curLat = p1.lat + (p2.lat - p1.lat) * frac;
      const curH = terrain.getVisualSurfaceHeight(curLon, curLat, clearanceMeters);

      // Look ahead like a driver steering a car
      const lookIdx = Math.min(idx + 3, profileSamples.length - 1);
      const target = profileSamples[lookIdx];
      const targetH = terrain.getVisualSurfaceHeight(target.lon, target.lat, clearanceMeters);

      // Tell Cesium to position the camera and stare at the target
      const posCart = Cesium.Cartesian3.fromDegrees(curLon, curLat, curH, marsEllipsoid);
      const targetCart = Cesium.Cartesian3.fromDegrees(target.lon, target.lat, targetH, marsEllipsoid);
      const direction = Cesium.Cartesian3.subtract(targetCart, posCart, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(direction, direction);

      viewer.camera.setView({
        destination: posCart,
        orientation: { 
          direction: direction, 
          up: marsEllipsoid.geodeticSurfaceNormal(posCart) 
        }
      });

      // If drone, tilt the gimbal down to see the ground
      if (isDrone) viewer.camera.lookDown(Cesium.Math.toRadians(45));

      bannerText.textContent = `${isDrone ? '🚁 VTOL AERIAL' : '👨‍🚀 OFFROAD POV'} • DIST: ${p1.distKm.toFixed(2)}km • MOLA: ${p1.elev}m • SLOPE: ${p1.slopeDeg.toFixed(1)}°`;

      progress += speed;
      activeFlyTimer = requestAnimationFrame(frameLoop);
    }

    activeFlyTimer = requestAnimationFrame(frameLoop);
  }

  function jumpToSite(siteKey) {
    exitPovMode();
    const site = cfg.SITES[siteKey];
    if (!site) return;
    selectedSite = site;
    document.getElementById('site-selector').value = siteKey;
    renderLocalContours();

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.alt, marsEllipsoid),
      orientation: { heading: 0.0, pitch: Cesium.Math.toRadians(-65), roll: 0.0 },
      duration: 1.5
    });

    document.getElementById('prompt-title').textContent = `📍 ${site.name}`;
    document.getElementById('prompt-text').textContent = `${site.mission} • ${site.science}`;
    document.getElementById('recon-prompt').classList.remove('hidden');
  }

  function loadBenchmarkPreset() {
    const bm = selectedSite.benchmarkWaypoints || cfg.SITES.gale.benchmarkWaypoints;
    waypoints = bm.map(pt => ({
      lon: pt.lon,
      lat: pt.lat,
      label: pt.label,
      elev: terrain.getMolaMeters(pt.lon, pt.lat),
      isOptimized: false,
      viaPoints: []
    }));
    lastOptimizationSummary = `Loaded ${selectedSite.name} Benchmark EVA (${waypoints.length} Waypoints). Click 'RUN METRIC A* SEARCH' to optimize.`;
    lastComparisonData = null;
    rebuildRouteAndTelemetry();
  }

  function updateSolarLighting() {
    const enabled = document.getElementById('layer-solar-shadows').checked;
    const lstHours = parseFloat(document.getElementById('sun-angle-slider').value) || 14.5;
    const hh = Math.floor(lstHours);
    const mm = Math.round((lstHours - hh) * 60);
    document.getElementById('sun-time-val').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LST`;

    viewer.scene.globe.enableLighting = enabled;
    if (enabled) {
      const siteLon = selectedSite ? selectedSite.lon : 137.44;
      const utcHours = (((lstHours - siteLon / 15.0) % 24) + 24) % 24;
      const uH = Math.floor(utcHours);
      const uM = Math.floor((utcHours - uH) * 60);
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(
        `2026-07-15T${String(uH).padStart(2, '0')}:${String(uM).padStart(2, '0')}:00Z`
      );
    }
    rebuildRouteAndTelemetry();
  }

  // Modal Dialog & Hostname-Validated NASA Archive Photo Gallery
  const dialogBackdrop = document.getElementById('custom-dialog-backdrop');
  const dialogCard = document.getElementById('custom-dialog-card');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogBody = document.getElementById('dialog-body-content');
  const retryGalleryBtn = document.getElementById('btn-retry-gallery');

  function showMissionDialog(title, contentNodeOrHtml, wide = false, showRetry = false) {
    dialogTitle.textContent = title;
    dialogBody.textContent = '';
    if (typeof contentNodeOrHtml === 'string') {
      dialogBody.innerHTML = contentNodeOrHtml;
    } else if (contentNodeOrHtml instanceof Node) {
      dialogBody.appendChild(contentNodeOrHtml);
    }
    dialogCard.classList.toggle('wide-modal', wide);
    retryGalleryBtn.classList.toggle('hidden', !showRetry);
    dialogBackdrop.classList.remove('hidden');
    document.getElementById('trek-menu-drawer').classList.add('hidden');
  }

  async function openNasaPhotoGallery() {
    document.getElementById('recon-prompt').classList.add('hidden');
    const loadingP = document.createElement('p');
    loadingP.textContent = `Querying images-api.nasa.gov for official ${selectedSite.name} (${selectedSite.mission}) observations...`;
    showMissionDialog(`NASA ARCHIVE: ${selectedSite.name.toUpperCase()}`, loadingP, true, true);

    if (activeGalleryController) activeGalleryController.abort();
    activeGalleryController = new AbortController();
    const timeoutId = setTimeout(() => activeGalleryController.abort(), 8000);

    try {
      const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(selectedSite.query)}&media_type=image`;
      const res = await fetch(url, { signal: activeGalleryController.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawItems = data.collection?.items || [];

      const validItems = [];
      for (const item of rawItems) {
        if (!item.data?.[0] || !Array.isArray(item.links)) continue;
        const preview = item.links.find(l => l.rel === 'preview' || l.render === 'image') || item.links[0];
        if (!preview?.href) continue;
        try {
          const parsedUrl = new URL(preview.href);
          if ((parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') && parsedUrl.hostname.endsWith('.nasa.gov')) {
            validItems.push({ info: item.data[0], imgUrl: preview.href });
          }
        } catch (_e) {}
        if (validItems.length >= 12) break;
      }

      const container = document.createElement('div');
      const note = document.createElement('p');
      note.textContent = `Verified nasa.gov mission archive records for ${selectedSite.name} (non-georeferenced metadata search):`;
      container.appendChild(note);

      if (validItems.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.textContent = 'Zero verified nasa.gov preview images returned for this query.';
        container.appendChild(emptyP);
        showMissionDialog(`NASA ARCHIVE: ${selectedSite.name.toUpperCase()}`, container, true, true);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'photo-grid';

      validItems.forEach(({ info, imgUrl }) => {
        const card = document.createElement('div');
        card.className = 'photo-card';

        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = info.title || 'NASA Mission Asset';
        img.onerror = () => { card.style.display = 'none'; };
        img.addEventListener('click', () => window.open(imgUrl, '_blank', 'noopener,noreferrer'));
        card.appendChild(img);

        const body = document.createElement('div');
        body.className = 'photo-card-body';

        const titleEl = document.createElement('div');
        titleEl.className = 'photo-card-title';
        titleEl.textContent = info.title?.trim() || `NASA Asset (${info.nasa_id || 'Archive'})`;

        const metaEl = document.createElement('div');
        metaEl.className = 'photo-card-meta';
        const dateStr = info.date_created ? info.date_created.slice(0, 10) : 'NASA';
        metaEl.textContent = `${info.center || 'JPL'} | ${dateStr} | ID: ${info.nasa_id || 'N/A'}`;

        const descEl = document.createElement('div');
        descEl.className = 'photo-card-desc';
        const cleanDesc = (info.description || '').replace(/<[^>]*>?/gm, '').trim();
        descEl.textContent = cleanDesc || `Official NASA observation for ${selectedSite.name}.`;

        body.appendChild(titleEl);
        body.appendChild(metaEl);
        body.appendChild(descEl);
        card.appendChild(body);
        grid.appendChild(card);
      });

      container.appendChild(grid);
      showMissionDialog(`NASA ARCHIVE: ${selectedSite.name.toUpperCase()}`, container, true, true);
    } catch (err) {
      clearTimeout(timeoutId);
      const errP = document.createElement('p');
      errP.textContent = `Archive request failed or timed out (${err.message}). Click ↻ RETRY in the header.`;
      showMissionDialog(`NASA ARCHIVE ERROR`, errP, false, true);
    }
  }

  // Fusion 360 ViewCube Orientation Sync & Click Handler
  const vcCube = document.getElementById('vc-cube');
  const vcCompass = document.getElementById('vc-compass');
  const vcLabel = document.getElementById('vc-orientation-label');

  function orientCameraAroundSite(viewKey) {
    exitPovMode();
    const spec = cfg.VIEWCUBE_ORIENTATIONS[viewKey];
    if (!spec) return;
    const range = selectedSite.alt * spec.distMult;
    const center = Cesium.Cartesian3.fromDegrees(
      selectedSite.lon,
      selectedSite.lat,
      terrain.getVisualSurfaceHeight(selectedSite.lon, selectedSite.lat, 0),
      marsEllipsoid
    );
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, range * 0.15), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(spec.headingDeg),
        Cesium.Math.toRadians(spec.pitchDeg),
        range
      ),
      duration: 0.9
    });
  }

  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      orientCameraAroundSite(el.getAttribute('data-view'));
    });
  });

  document.getElementById('vc-home-btn').addEventListener('click', () => jumpToSite(selectedSite.key));

  viewer.scene.postRender.addEventListener(() => {
    const headingDeg = Cesium.Math.toDegrees(viewer.camera.heading);
    const pitchDeg = Cesium.Math.toDegrees(viewer.camera.pitch);
    vcCube.style.transform = `rotateX(${pitchDeg.toFixed(1)}deg) rotateY(${(-headingDeg).toFixed(1)}deg)`;
    vcCompass.style.transform = `rotate(${(-headingDeg).toFixed(1)}deg)`;
    const modeTag =
      viewer.scene.mode === Cesium.SceneMode.SCENE3D
        ? '3D SPHERE'
        : viewer.scene.mode === Cesium.SceneMode.COLUMBUS_VIEW
        ? '2.5D FLAT'
        : '2D MAP';
    vcLabel.textContent = `${modeTag} • PITCH ${Math.round(pitchDeg)}°`;
  });

  // ESP32 Bluetooth BLE Gamepad Loop
  function pollGamepadLoop() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[0];
    const pill = document.getElementById('gamepad-pill');
    if (pad && pad.connected) {
      pill.style.display = 'flex';
      const deadzone = 0.15;
      const lx = Math.abs(pad.axes[0]) > deadzone ? pad.axes[0] : 0;
      const ly = Math.abs(pad.axes[1]) > deadzone ? pad.axes[1] : 0;
      if (lx !== 0 || ly !== 0) {
        viewer.camera.rotateRight(lx * 0.015);
        viewer.camera.rotateUp(ly * 0.015);
      }
    } else {
      pill.style.display = 'none';
    }
    requestAnimationFrame(pollGamepadLoop);
  }
  requestAnimationFrame(pollGamepadLoop);

  // Cesium Canvas Mouse & Click Handlers
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction(movement => {
    const pos = viewer.camera.pickEllipsoid(movement.endPosition, marsEllipsoid);
    if (Cesium.defined(pos)) {
      const carto = Cesium.Cartographic.fromCartesian(pos, marsEllipsoid);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const sample = terrain.sampleTerrain(lon, lat);
      const slope = terrain.getLocalSlopeDegrees(lon, lat);
      document.getElementById('hud-latlon').textContent = `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
      document.getElementById('hud-elev').textContent = sample.valid ? `${sample.elev} m (${sample.source})` : 'NO DATA';
      document.getElementById('hud-slope').textContent = `${slope.toFixed(1)}°`;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(click => {
    if (terrain.demSourceState === 'LOADING') return;
    const picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id?.siteData) {
      selectedSite = picked.id.siteData;
      document.getElementById('site-selector').value = selectedSite.key;
      document.getElementById('prompt-title').textContent = `📍 ${selectedSite.name}`;
      document.getElementById('prompt-text').textContent = `${selectedSite.mission} • ${selectedSite.science}`;
      document.getElementById('recon-prompt').classList.remove('hidden');
      return;
    }

    const pos = viewer.camera.pickEllipsoid(click.position, marsEllipsoid);
    if (!Cesium.defined(pos)) return;
    const carto = Cesium.Cartographic.fromCartesian(pos, marsEllipsoid);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const sample = terrain.sampleTerrain(lon, lat);

    if (!sample.valid) {
      lastOptimizationSummary = 'INFEASIBLE WAYPOINT REJECTED: Coordinate is outside valid MOLA DEM patch coverage.';
      rebuildRouteAndTelemetry();
      return;
    }

    lastOptimizationSummary = null;
    lastComparisonData = null;
    waypoints.push({
      lon,
      lat,
      label: `WP ${waypoints.length + 1}`,
      elev: sample.elev,
      isOptimized: false,
      viaPoints: []
    });
    rebuildRouteAndTelemetry();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // UI Event Bindings
  document.getElementById('site-selector').addEventListener('change', e => jumpToSite(e.target.value));

  const archBtns = ['btn-arch-sphere', 'btn-arch-flat', 'btn-arch-2d'];
  function setArchitectureMode(btnId, morphFn) {
    exitPovMode();
    archBtns.forEach(id => document.getElementById(id).classList.remove('active-pov'));
    document.getElementById(btnId).classList.add('active-pov');
    morphFn();
  }
  document.getElementById('btn-arch-sphere').addEventListener('click', () =>
    setArchitectureMode('btn-arch-sphere', () => viewer.scene.morphTo3D(1.0))
  );
  document.getElementById('btn-arch-flat').addEventListener('click', () =>
    setArchitectureMode('btn-arch-flat', () => viewer.scene.morphToColumbusView(1.0))
  );
  document.getElementById('btn-arch-2d').addEventListener('click', () =>
    setArchitectureMode('btn-arch-2d', () => viewer.scene.morphTo2D(1.0))
  );

  document.getElementById('btn-pov-free').addEventListener('click', exitPovMode);
  document.getElementById('btn-pov-drone').addEventListener('click', () => startRouteFlyThrough('drone'));
  document.getElementById('btn-pov-astronaut').addEventListener('click', () => startRouteFlyThrough('surface'));
  document.getElementById('btn-exit-pov').addEventListener('click', () => {
    exitPovMode();
    jumpToSite(selectedSite.key);
  });

  document.getElementById('btn-preset-mount-sharp').addEventListener('click', loadBenchmarkPreset);
  document.getElementById('btn-undo-wp').addEventListener('click', () => {
    if (waypoints.length > 0) {
      waypoints.pop();
      invalidateAndRebuildRoute(true);
    }
  });
  document.getElementById('btn-clear-waypoints').addEventListener('click', () => {
    waypoints = [];
    invalidateAndRebuildRoute(true);
  });
  document.getElementById('btn-compute-route').addEventListener('click', optimizeAllSegments);
  document.getElementById('btn-open-nasa-photos').addEventListener('click', openNasaPhotoGallery);
  document.getElementById('btn-fetch-photos').addEventListener('click', openNasaPhotoGallery);
  document.getElementById('btn-retry-gallery').addEventListener('click', openNasaPhotoGallery);
  document.getElementById('btn-dismiss-prompt').addEventListener('click', () =>
    document.getElementById('recon-prompt').classList.add('hidden')
  );

  document.getElementById('layer-mola').addEventListener('change', e => {
    activeLayers.mola.show = e.target.checked;
  });
  document.getElementById('rng-mola').addEventListener('input', e => {
    document.getElementById('val-mola').textContent = `${e.target.value}%`;
    activeLayers.mola.alpha = e.target.value / 100;
  });
  document.getElementById('layer-themis').addEventListener('change', e => {
    activeLayers.themis.show = e.target.checked;
    if (e.target.checked) {
      probeLayerTile('https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12/1.0.0/default/default028mm/1/0/0.png', 'status-themis', 'READY ±65°');
    } else {
      document.getElementById('status-themis').textContent = 'STANDBY';
    }
    rebuildRouteAndTelemetry();
  });
  document.getElementById('rng-themis').addEventListener('input', e => {
    document.getElementById('val-themis').textContent = `${e.target.value}%`;
    activeLayers.themis.alpha = e.target.value / 100;
  });
  document.getElementById('layer-rover-tracks').addEventListener('change', renderRoverTraverses);
  document.getElementById('layer-contours').addEventListener('change', renderLocalContours);

  document.getElementById('mobility-selector').addEventListener('change', () => invalidateAndRebuildRoute(true));
  document.getElementById('max-slope-slider').addEventListener('input', e => {
    document.getElementById('max-slope-val').textContent = `${e.target.value}°`;
    invalidateAndRebuildRoute(true);
  });
  document.getElementById('slope-penalty-slider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    const lbl = v < 1.5 ? 'MIN-DIST' : v < 2.8 ? 'BALANCED' : 'FLAT-FIRST';
    document.getElementById('slope-penalty-val').textContent = `${lbl} (${v.toFixed(1)}x)`;
    invalidateAndRebuildRoute(true);
  });
  document.getElementById('exaggeration-slider').addEventListener('input', e => {
    const val = parseFloat(e.target.value) || 1.0;
    terrain.visualExaggeration = val;
    document.getElementById('exaggeration-val').textContent =
      val === 1.0 ? '1.0x (True 1:1)' : `${val.toFixed(1)}x (Visual Only)`;
    const exagPill = document.getElementById('exag-honesty-pill');
    if (val > 1.0) {
      exagPill.style.display = 'flex';
      document.getElementById('exag-badge-val').textContent = `${val.toFixed(1)}x (MATH 1:1)`;
    } else {
      exagPill.style.display = 'none';
    }
    viewer.terrainProvider = terrain.buildCesiumTerrainProvider();
    renderSitePins();
    renderRoverTraverses();
    renderLocalContours();
    rebuildRouteAndTelemetry();
  });

  document.getElementById('layer-solar-shadows').addEventListener('change', updateSolarLighting);
  document.getElementById('sun-angle-slider').addEventListener('input', updateSolarLighting);

  // Trek Drawer & Exporters
  const trekDrawer = document.getElementById('trek-menu-drawer');
  document.getElementById('btn-toggle-trek-menu').addEventListener('click', () => trekDrawer.classList.toggle('hidden'));
  document.getElementById('btn-close-trek-menu').addEventListener('click', () => trekDrawer.classList.add('hidden'));
  document.getElementById('btn-close-dialog').addEventListener('click', () => {
    if (activeGalleryController) activeGalleryController.abort();
    dialogBackdrop.classList.add('hidden');
  });

  function exportMissionJson() {
    const payload = {
      mission: 'ARES-IV Spherical & Flat Mars EVA Plan',
      timestamp: new Date().toISOString(),
      demSourceState: terrain.demSourceState,
      visualExaggeration: terrain.visualExaggeration,
      mathScale: '1:1_TRUE_MOLA_METERS',
      site: selectedSite.name,
      mobility: getMobilityConfig(),
      hardMaxSlopeDeg: getMaxSlopeLimit(),
      waypoints
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ares4-${selectedSite.key}-eva-plan.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-json').addEventListener('click', exportMissionJson);
  document.getElementById('menu-item-export-json').addEventListener('click', exportMissionJson);

  document.getElementById('menu-item-distance').addEventListener('click', () => {
    if (!lastComparisonData) {
      showMissionDialog('DIRECT VS. A* COMPARISON', '<p>Plot at least 2 waypoints and click <strong>RUN METRIC A* SEARCH</strong> to populate the comparison metrics.</p>');
      return;
    }
    showMissionDialog('DIRECT VS. A* ROUTE COMPARISON', document.getElementById('inline-comparison-wrapper').innerHTML);
  });
  document.getElementById('menu-item-elevation').addEventListener('click', () =>
    showMissionDialog('ELEVATION PROFILE METRICS', `
      <ul>
        <li><strong>Geodesic Surface Distance:</strong> ${document.getElementById('metric-distance').textContent}</li>
        <li><strong>Cumulative Climb / Drop:</strong> ${document.getElementById('metric-gain').textContent}</li>
        <li><strong>Max / Avg Slope Grade:</strong> ${document.getElementById('metric-slope').textContent}</li>
        <li><strong>Endpoint Net Δh:</strong> ${document.getElementById('metric-net-elev').textContent}</li>
      </ul>
    `)
  );
  document.getElementById('menu-item-sunangle').addEventListener('click', () =>
    showMissionDialog('SOLAR LIGHTING & SHADOW DIAGNOSTICS', `
      <ul>
        <li><strong>Target Local Solar Time:</strong> ${document.getElementById('sun-time-val').textContent}</li>
        <li><strong>Planetary Lighting Status:</strong> ${document.getElementById('layer-solar-shadows').checked ? 'Active' : 'Disabled'}</li>
      </ul>
    `)
  );
  document.getElementById('menu-item-nasa-gallery').addEventListener('click', openNasaPhotoGallery);
  document.getElementById('menu-item-credits').addEventListener('click', () =>
    showMissionDialog('NASA DATA PROVENANCE & CREDITS', `
      <ul>
        <li><strong>Topography:</strong> NASA MGS Mars Orbiter Laser Altimeter (MOLA) Global MEGDR 463m (USGS Astrogeology).</li>
        <li><strong>Optical Base:</strong> NASA Viking Orbiter MDIM2.1 Global Mosaic (232m/px).</li>
        <li><strong>Thermal IR:</strong> NASA Mars Odyssey THEMIS Day-IR Global Mosaic (100m/px, ±65° Lat).</li>
        <li><strong>Surface Reconnaissance:</strong> NASA Image and Video Library API (<code>images-api.nasa.gov</code>).</li>
      </ul>
    `)
  );

  // Live NASA Curiosity REMS Telemetry Fetch (Supports both array & single-object maas2 feed)
  async function fetchLiveNasaMarsWeather() {
    const statusEl = document.getElementById('telemetry-status');
    try {
      const res = await fetch(cfg.NASA_API.MSL_WEATHER_URL);
      if (!res.ok) throw new Error('REMS offline');
      const data = await res.json();
      const latest = Array.isArray(data.soles) ? data.soles[0] : data;
      if (latest && latest.sol) {
        document.getElementById('tel-sol').textContent = latest.sol || '4995';
        document.getElementById('tel-temp').textContent = `${latest.min_temp ?? '-71'}°C / ${latest.max_temp ?? '-5'}°C`;
        document.getElementById('tel-pressure').textContent = `${latest.pressure ?? '777'} Pa`;
        statusEl.textContent = 'MSL LIVE';
        return;
      }
      throw new Error('Empty weather object');
    } catch (_e) {
      statusEl.textContent = 'MSL ARCHIVE';
    }
  }

  // Boot Sequence
  async function bootPlanner() {
    fetchLiveNasaMarsWeather();
    const demReport = await terrain.initGlobalMolaDem();
    const badge = document.getElementById('dem-status-badge');
    const dot = document.getElementById('dem-dot');
    const calibEl = document.getElementById('calib-readout');

    badge.textContent = `DEM: ${demReport.state}`;
    calibEl.textContent = demReport.summary;
    if (demReport.state === 'REAL_DEM_VALIDATED' || demReport.state === 'LOCAL_MOLA_DEM' || demReport.state === 'REMOTE_MOLA_DEM') {
      dot.className = 'pulse-green';
    }

    viewer.terrainProvider = terrain.buildCesiumTerrainProvider();
    renderSitePins();
    renderRoverTraverses();
    jumpToSite('gale');
    loadBenchmarkPreset();
  }

  window.ARES = { viewer, terrain, router, getWaypoints: () => waypoints, getSite: () => selectedSite };
  if (window.AresViews) window.AresViews.init(window.ARES);
  bootPlanner();
})();
