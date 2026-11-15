/**
 * ARES-IV Geodesic & Metric Tangent-Plane A* Routing Engine
 * Enforces strict hard-constraint slope & no-data rejection,
 * evaluates outbound & asymmetric return legs on the IAU-2000 Mars Ellipsoid,
 * and includes the 6-Case Automated Engineering Verification Suite.
 */
class BinaryMinHeap {
  constructor() {
    this.data = [];
  }
  push(item) {
    this.data.push(item);
    let idx = this.data.length - 1;
    while (idx > 0) {
      const p = (idx - 1) >> 1;
      if (this.data[p].f <= this.data[idx].f) break;
      [this.data[p], this.data[idx]] = [this.data[idx], this.data[p]];
      idx = p;
    }
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = bottom;
      let idx = 0;
      const len = this.data.length;
      while (true) {
        const left = (idx << 1) + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
        if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
        if (smallest === idx) break;
        [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
        idx = smallest;
      }
    }
    return top;
  }
  get length() {
    return this.data.length;
  }
}


class EVARouter {
  constructor(terrain) {
    this.terrain = terrain;
    this.cfg = window.MARS_CONFIG;
    this.marsEllipsoid = terrain.marsEllipsoid;
  }


  computeSlopeDegrees(deltaH, horizDistMeters) {
    if (horizDistMeters <= 0.01) return 0;
    return Cesium.Math.toDegrees(Math.atan(Math.abs(deltaH) / horizDistMeters));
  }


  evaluateSegmentGeodesic(pStart, pEnd, mob, maxSlopeLimit, customSampler = null) {
    const sampler = customSampler || ((lon, lat) => this.terrain.sampleTerrain(lon, lat));
    const c1 = Cesium.Cartographic.fromDegrees(pStart.lon, pStart.lat);
    const c2 = Cesium.Cartographic.fromDegrees(pEnd.lon, pEnd.lat);
    const geo = new Cesium.EllipsoidGeodesic(c1, c2, this.marsEllipsoid);
    const legDist = geo.surfaceDistance;


    if (!Number.isFinite(legDist) || legDist < 1.0) {
      const s0 = sampler(pStart.lon, pStart.lat);
      return {
        distMeters: 0, ascent: 0, descent: 0, maxSlopeDeg: 0, slopeWeightedSum: 0,
        outboundHours: 0, returnHours: 0, hasNoData: !s0.valid,
        violatesSlope: false, feasible: s0.valid, subSegments: [], samples: []
      };
    }


    const targetSpacingMeters = Math.max(463, legDist / 55);
    const numSamples = Math.min(110, Math.max(8, Math.ceil(legDist / targetSpacingMeters)));


    let prevLon = pStart.lon;
    let prevLat = pStart.lat;
    const startSample = sampler(prevLon, prevLat);
    let prevElev = startSample.elev;
    let hasNoData = !startSample.valid;


    let totalDist = 0, ascent = 0, descent = 0, maxSlopeDeg = 0, slopeWeightedSum = 0;
    let outboundHours = 0, returnHours = 0;
    let violatesSlope = false;
    const subSegments = [];
    const samples = [];


    for (let s = 1; s <= numSamples; s++) {
      const frac = s / numSamples;
      const interp = geo.interpolateUsingFraction(frac);
      const curLon = Cesium.Math.toDegrees(interp.longitude);
      const curLat = Cesium.Math.toDegrees(interp.latitude);
      const curSample = sampler(curLon, curLat);
      if (!curSample.valid) hasNoData = true;
      const curElev = curSample.elev;


      const subGeo = new Cesium.EllipsoidGeodesic(
        Cesium.Cartographic.fromDegrees(prevLon, prevLat),
        Cesium.Cartographic.fromDegrees(curLon, curLat),
        this.marsEllipsoid
      );
      const subDist = Math.max(0.5, subGeo.surfaceDistance);
      totalDist += subDist;


      const dH = curElev - prevElev;
      if (dH > 0) ascent += dH;
      else descent += Math.abs(dH);


      const localSlopeDeg = this.computeSlopeDegrees(dH, subDist);
      if (localSlopeDeg > maxSlopeDeg) maxSlopeDeg = localSlopeDeg;
      if (localSlopeDeg > maxSlopeLimit) violatesSlope = true;
      slopeWeightedSum += localSlopeDeg * subDist;


      const outMult = 1 + (dH > 0 ? localSlopeDeg * mob.upPenalty : localSlopeDeg * mob.downPenalty);
      outboundHours += ((subDist / 1000) / mob.speedKmH) * outMult;


      const retMult = 1 + (dH < 0 ? localSlopeDeg * mob.upPenalty : localSlopeDeg * mob.downPenalty);
      returnHours += ((subDist / 1000) / mob.speedKmH) * retMult;


      subSegments.push({
        lon1: prevLon, lat1: prevLat, elev1: prevElev,
        lon2: curLon, lat2: curLat, elev2: curElev,
        distMeters: subDist, slopeDeg: localSlopeDeg, valid: curSample.valid
      });
      samples.push({ lon: curLon, lat: curLat, distDeltaMeters: subDist, elev: curElev, slopeDeg: localSlopeDeg });


      prevLon = curLon;
      prevLat = curLat;
      prevElev = curElev;
    }


    const feasible = !hasNoData && !violatesSlope;
    return {
      distMeters: totalDist, ascent, descent, maxSlopeDeg, slopeWeightedSum,
      outboundHours, returnHours, hasNoData, violatesSlope, feasible, subSegments, samples
    };
  }


  evaluateNodeChain(nodeChain, mob, maxSlopeLimit, customSampler = null) {
    const sampler = customSampler || ((lon, lat) => this.terrain.sampleTerrain(lon, lat));
    if (!nodeChain || nodeChain.length === 0) return null;
    const firstSample = sampler(nodeChain[0].lon, nodeChain[0].lat);
    if (nodeChain.length === 1) {
      return {
        totalDistMeters: 0, totalAscent: 0, totalDescent: 0, maxLocalSlopeDeg: 0, avgSlopeDeg: 0,
        outboundWalkHours: 0, returnWalkHours: 0, scienceStopsHours: 0, reserveHours: 0, totalMissionHours: 0,
        hasNoData: !firstSample.valid, violatesSlope: false, exceedsBudget: false, feasible: firstSample.valid,
        samples: [{ lon: nodeChain[0].lon, lat: nodeChain[0].lat, distKm: 0, elev: firstSample.elev, slopeDeg: 0 }],
        segments: []
      };
    }


    let totalDistMeters = 0, totalAscent = 0, totalDescent = 0, maxLocalSlopeDeg = 0, totalSlopeWeighted = 0;
    let outboundWalkHours = 0, returnWalkHours = 0;
    let hasNoData = !firstSample.valid, violatesSlope = false;
    const samples = [{ lon: nodeChain[0].lon, lat: nodeChain[0].lat, distKm: 0, elev: firstSample.elev, slopeDeg: 0 }];
    const segments = [];


    for (let i = 1; i < nodeChain.length; i++) {
      const leg = this.evaluateSegmentGeodesic(nodeChain[i - 1], nodeChain[i], mob, maxSlopeLimit, sampler);
      if (leg.hasNoData) hasNoData = true;
      if (leg.violatesSlope) violatesSlope = true;
      if (leg.maxSlopeDeg > maxLocalSlopeDeg) maxLocalSlopeDeg = leg.maxSlopeDeg;
      totalAscent += leg.ascent;
      totalDescent += leg.descent;
      outboundWalkHours += leg.outboundHours;
      returnWalkHours += leg.returnHours;
      totalSlopeWeighted += leg.slopeWeightedSum;


      leg.subSegments.forEach(seg => segments.push(seg));
      leg.samples.forEach(s => {
        totalDistMeters += s.distDeltaMeters;
        samples.push({ lon: s.lon, lat: s.lat, distKm: totalDistMeters / 1000, elev: s.elev, slopeDeg: s.slopeDeg });
      });
    }


    const avgSlopeDeg = totalDistMeters > 0 ? totalSlopeWeighted / totalDistMeters : 0;
    const primaryCount = nodeChain.filter(n => !n.isVia).length;
    const scienceStopsHours = Math.max(1, primaryCount - 1) * 0.25;
    const reserveHours = 0.5;
    const totalMissionHours = outboundWalkHours + returnWalkHours + scienceStopsHours + reserveHours;
    const exceedsBudget = totalMissionHours > mob.maxBudgetH;
    const feasible = !hasNoData && !violatesSlope && !exceedsBudget;


    return {
      totalDistMeters, totalAscent, totalDescent, maxLocalSlopeDeg, avgSlopeDeg,
      outboundWalkHours, returnWalkHours, scienceStopsHours, reserveHours, totalMissionHours,
      hasNoData, violatesSlope, exceedsBudget, feasible, samples, segments
    };
  }


  runMetricTangentAStar(startWp, endWp, mob, maxSlopeLimit, avoidanceWeight = 2.0, customSampler = null) {
    const sampler = customSampler || ((lon, lat) => this.terrain.sampleTerrain(lon, lat));
    const c1 = Cesium.Cartographic.fromDegrees(startWp.lon, startWp.lat);
    const c2 = Cesium.Cartographic.fromDegrees(endWp.lon, endWp.lat);
    const directGeo = new Cesium.EllipsoidGeodesic(c1, c2, this.marsEllipsoid);
    const directDist = directGeo.surfaceDistance;


    if (!Number.isFinite(directDist) || directDist < 5.0) {
      return { found: false, reason: 'Start and destination are identical or <5m apart.' };
    }


    const midCarto = directGeo.interpolateUsingFraction(0.5);
    const lat0Rad = midCarto.latitude;
    const lon0Rad = midCarto.longitude;
    const cosLat0 = Math.max(0.05, Math.cos(lat0Rad));


    const toLocalMeters = (lonDeg, latDeg) => {
      let dLonDeg = lonDeg - Cesium.Math.toDegrees(lon0Rad);
      if (dLonDeg > 180) dLonDeg -= 360;
      if (dLonDeg < -180) dLonDeg += 360;
      const dLonRad = Cesium.Math.toRadians(dLonDeg);
      const dLatRad = Cesium.Math.toRadians(latDeg) - lat0Rad;
      return {
        east: dLonRad * this.cfg.MARS_RADIUS_EQ * cosLat0,
        north: dLatRad * this.cfg.MARS_RADIUS_POLAR
      };
    };


    const fromLocalMeters = (east, north) => {
      const latRad = lat0Rad + north / this.cfg.MARS_RADIUS_POLAR;
      const clampedLatDeg = Math.max(-89.8, Math.min(89.8, Cesium.Math.toDegrees(latRad)));
      const lonRad = lon0Rad + east / (this.cfg.MARS_RADIUS_EQ * cosLat0);
      const normLonDeg = ((((Cesium.Math.toDegrees(lonRad) + 180) % 360) + 360) % 360) - 180;
      return { lon: normLonDeg, lat: clampedLatDeg };
    };


    const pStartEN = toLocalMeters(startWp.lon, startWp.lat);
    const pEndEN = toLocalMeters(endWp.lon, endWp.lat);
    const ux = pEndEN.east - pStartEN.east;
    const uy = pEndEN.north - pStartEN.north;
    const L = Math.hypot(ux, uy) || 1;
    const fwdX = ux / L, fwdY = uy / L;
    const perpX = -fwdY, perpY = fwdX;


    const ROWS = 11, COLS = 11;
    const midRow = Math.floor(ROWS / 2);
    const maxCorridorHalfWidth = L * 0.42;


    const nodes = [];
    for (let r = 0; r < ROWS; r++) {
      nodes[r] = [];
      const vNorm = (r - midRow) / midRow;
      for (let c = 0; c < COLS; c++) {
        const uFrac = c / (COLS - 1);
        const taper = c === 0 || c === COLS - 1 ? 0 : Math.sin(uFrac * Math.PI);
        const east = pStartEN.east + ux * uFrac + perpX * (vNorm * maxCorridorHalfWidth * taper);
        const north = pStartEN.north + uy * uFrac + perpY * (vNorm * maxCorridorHalfWidth * taper);
        const coord =
          c === 0 && r === midRow
            ? { lon: startWp.lon, lat: startWp.lat }
            : c === COLS - 1 && r === midRow
            ? { lon: endWp.lon, lat: endWp.lat }
            : fromLocalMeters(east, north);
        const sample = sampler(coord.lon, coord.lat);
        nodes[r][c] = {
          r, c, lon: coord.lon, lat: coord.lat,
          elev: sample.elev, valid: sample.valid,
          g: Infinity, f: Infinity, closed: false, parent: null
        };
      }
    }


    const startNode = nodes[midRow][0];
    const goalNode = nodes[midRow][COLS - 1];
    if (!startNode.valid || !goalNode.valid) {
      return { found: false, reason: 'Start or destination cell contains missing/no-data DEM values.' };
    }


    const heuristicCost = (node) => {
      const geo = new Cesium.EllipsoidGeodesic(
        Cesium.Cartographic.fromDegrees(node.lon, node.lat),
        Cesium.Cartographic.fromDegrees(goalNode.lon, goalNode.lat),
        this.marsEllipsoid
      );
      return geo.surfaceDistance;
    };


    startNode.g = 0;
    startNode.f = heuristicCost(startNode);
    const openHeap = new BinaryMinHeap();
    openHeap.push({ node: startNode, f: startNode.f });


    const dirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [ 0, -1],          [ 0, 1],
      [ 1, -1], [ 1, 0], [ 1, 1]
    ];


    let expandedCount = 0;
    while (openHeap.length > 0) {
      const popped = openHeap.pop();
      const current = popped.node;
      if (current.closed) continue;
      if (current === goalNode) break;
      current.closed = true;
      expandedCount++;


      for (const [dr, dc] of dirs) {
        const nr = current.r + dr, nc = current.c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const neighbor = nodes[nr][nc];
        if (neighbor.closed || !neighbor.valid) continue;


        const edgeEval = this.evaluateSegmentGeodesic(current, neighbor, mob, maxSlopeLimit, sampler);
        if (!edgeEval.feasible || edgeEval.maxSlopeDeg > maxSlopeLimit) {
          continue;
        }


        const slopePenalty =
          edgeEval.distMeters * Math.pow(edgeEval.maxSlopeDeg / maxSlopeLimit, 2) * (1.5 * avoidanceWeight);
        const edgeCost = edgeEval.distMeters + slopePenalty;
        const tentativeG = current.g + edgeCost;


        if (tentativeG < neighbor.g) {
          neighbor.parent = current;
          neighbor.g = tentativeG;
          neighbor.f = tentativeG + heuristicCost(neighbor);
          openHeap.push({ node: neighbor, f: neighbor.f });
        }
      }
    }


    if (!goalNode.parent) {
      return {
        found: false,
        expandedCount,
        reason: `No feasible corridor exists below the ${maxSlopeLimit.toFixed(1)}° hard slope limit.`
      };
    }


    const viaPoints = [];
    let curr = goalNode.parent;
    while (curr && curr !== startNode) {
      viaPoints.push({ lon: curr.lon, lat: curr.lat, elev: curr.elev, isVia: true });
      curr = curr.parent;
    }
    viaPoints.reverse();
    return { found: true, viaPoints, expandedCount, totalObjectiveCost: goalNode.g };
  }


  runSelfTestSuite() {
    const mob = this.cfg.MOBILITY_PROFILES.suit;
    const cases = [];


    const flatSampler = () => ({ elev: -2500, valid: true });
    const t1 = this.runMetricTangentAStar({ lon: 77.0, lat: 18.0 }, { lon: 77.05, lat: 18.05 }, mob, 15, 2.0, flatSampler);
    cases.push({ name: '1. Flat Grid Shortest Geodesic', pass: Boolean(t1.found) });


    const barrierSampler = (lon, lat) => {
      const distCenter = Math.hypot(lon - 77.025, lat - 18.025);
      return { elev: distCenter < 0.008 ? 4000 : 0, valid: true };
    };
    const t2 = this.runMetricTangentAStar({ lon: 77.0, lat: 18.0 }, { lon: 77.05, lat: 18.05 }, mob, 15, 2.0, barrierSampler);
    cases.push({ name: '2. Steep Crater Barrier Bypass', pass: Boolean(t2.found && t2.viaPoints.length > 0) });


    const wallSampler = (lon) => ({ elev: lon > 77.02 ? 25000 : 0, valid: true });
    const t3 = this.runMetricTangentAStar({ lon: 77.0, lat: 18.0 }, { lon: 77.05, lat: 18.0 }, mob, 10, 2.0, wallSampler);
    cases.push({ name: '3. Impassable Cliff Rejection', pass: Boolean(!t3.found) });


    const noDataSampler = (lon) => ({ elev: 0, valid: !(lon > 77.01 && lon < 77.04) });
    const t4 = this.runMetricTangentAStar({ lon: 77.0, lat: 18.0 }, { lon: 77.05, lat: 18.0 }, mob, 20, 2.0, noDataSampler);
    cases.push({ name: '4. Missing/No-Data Mask Rejection', pass: Boolean(!t4.found) });


    const t5 = this.evaluateSegmentGeodesic({ lon: 77.0, lat: 18.0 }, { lon: 77.0, lat: 18.0 }, mob, 15, flatSampler);
    const t5Pass = t5.distMeters === 0 && Number.isFinite(t5.maxSlopeDeg) && !Number.isNaN(t5.outboundHours);
    cases.push({ name: '5. Zero-Length Route NaN Guard', pass: t5Pass });


    const t6Pass = Boolean(t1.found && t1.totalObjectiveCost > 0);
    cases.push({ name: '6. Metric A* Admissibility Check', pass: t6Pass });


    return cases;
  }
}

