/**
* Shortest-Distance First Multi-Point EVA Router
* High-resolution 8-Neighbor Min-Heap A* prioritizing lowest physical surface distance
* while avoiding steep elevation changes and respecting hard slope safety limits.
*/
class BinaryMinHeap {
constructor() {
  this.data = [];
}
push(node, priority) {
  this.data.push({ node, priority });
  let idx = this.data.length - 1;
  while (idx > 0) {
    const parent = (idx - 1) >> 1;
    if (this.data[parent].priority <= this.data[idx].priority) break;
    [this.data[parent], this.data[idx]] = [this.data[idx], this.data[parent]];
    idx = parent;
  }
}
pop() {
  if (this.data.length === 0) return null;
  const top = this.data[0].node;
  const end = this.data.pop();
  if (this.data.length > 0) {
    this.data[0] = end;
    let idx = 0;
    const len = this.data.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < len && this.data[right].priority < this.data[smallest].priority) smallest = right;
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
  this.gridRes = 152;
}




worldToGrid(x, z) {
  const half = this.cfg.WORLD_SIZE / 2;
  const gx = Math.round(((x + half) / this.cfg.WORLD_SIZE) * (this.gridRes - 1));
  const gz = Math.round(((z + half) / this.cfg.WORLD_SIZE) * (this.gridRes - 1));
  return {
    gx: THREE.MathUtils.clamp(gx, 0, this.gridRes - 1),
    gz: THREE.MathUtils.clamp(gz, 0, this.gridRes - 1),
  };
}




gridToWorld(gx, gz) {
  const half = this.cfg.WORLD_SIZE / 2;
  const x = (gx / (this.gridRes - 1)) * this.cfg.WORLD_SIZE - half;
  const z = (gz / (this.gridRes - 1)) * this.cfg.WORLD_SIZE - half;
  return { x, z };
}




/**
 * Optimizes a multi-waypoint journey and compares against direct straight-line baseline
 */
optimizeJourney(waypoints, options = {}) {
  if (!waypoints || waypoints.length < 2) return null;




  const {
    elevationAvoidanceWeight = 2.0,
    maxSlopeLimitDeg = 18.0,
    mobility = this.cfg.MOBILITY_PROFILES.suit,
  } = options;




  const combinedWorldPts = [];
  let allSegmentsFeasible = true;




  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = this.findMinDistanceLowReliefPath(
      waypoints[i],
      waypoints[i + 1],
      elevationAvoidanceWeight,
      maxSlopeLimitDeg
    );
    if (!seg.feasible) allSegmentsFeasible = false;
    if (i > 0) seg.rawPoints.shift();
    combinedWorldPts.push(...seg.rawPoints);
  }




  const optimizedMetrics = this.evaluatePolyline(combinedWorldPts, mobility, maxSlopeLimitDeg, waypoints.length);
  const directMetrics = this.evaluatePolyline(waypoints, mobility, maxSlopeLimitDeg, waypoints.length);




  return {
    ...optimizedMetrics,
    directBaseline: directMetrics,
    allSegmentsFeasible,
  };
}




/**
 * Distance-first 8-neighbor A* with smooth elevation-change avoidance
 */
findMinDistanceLowReliefPath(startWorld, endWorld, avoidanceWeight, maxSlopeLimitDeg) {
  const startG = this.worldToGrid(startWorld.x, startWorld.z);
  const endG = this.worldToGrid(endWorld.x, endWorld.z);




  const N = this.gridRes;
  const total = N * N;
  const gScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);




  const startIdx = startG.gz * N + startG.gx;
  const endIdx = endG.gz * N + endG.gx;




  const cellMeters = (this.cfg.WORLD_SIZE / (N - 1)) * this.cfg.METERS_PER_UNIT;




  // Precompute elevation & slope grid for fast O(1) A* lookups
  const elevGrid = new Float32Array(total);
  const slopeGrid = new Float32Array(total);
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      const w = this.gridToWorld(gx, gz);
      const idx = gz * N + gx;
      elevGrid[idx] = this.terrain.getMolaMeters(w.x, w.z);
      slopeGrid[idx] = this.terrain.getSlopeDegrees(w.x, w.z);
    }
  }




  gScore[startIdx] = 0;
  const openHeap = new BinaryMinHeap();
  const h0 = Math.hypot(endG.gx - startG.gx, endG.gz - startG.gz) * cellMeters;
  openHeap.push(startIdx, h0);




  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];




  let found = false;




  while (openHeap.length > 0) {
    const current = openHeap.pop();
    if (closed[current]) continue;
    if (current === endIdx) {
      found = true;
      break;
    }
    closed[current] = 1;




    const cx = current % N;
    const cz = Math.floor(current / N);
    const currElev = elevGrid[current];




    for (const [dx, dz, stepMult] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;




      const nIdx = nz * N + nx;
      if (closed[nIdx]) continue;




      const horizMeters = stepMult * cellMeters;
      const nextElev = elevGrid[nIdx];
      const deltaH = Math.abs(nextElev - currElev);
      const stepSlopeDeg = (Math.atan(deltaH / horizMeters) * 180) / Math.PI;
      const cellSlopeDeg = Math.max(stepSlopeDeg, slopeGrid[nIdx]);




      // Primary cost: True 3D surface distance in meters (lowest distance first)
      const surfaceStepMeters = Math.hypot(horizMeters, deltaH);




      // Secondary cost: Elevation change avoidance (keeps path flat without huge detours)
      const elevChangeCost = deltaH * 0.65 * avoidanceWeight;




      // Progressive slope guard & hard cliff avoidance above maxSlopeLimitDeg
      const gradeRatio = cellSlopeDeg / Math.max(1, maxSlopeLimitDeg);
      const gradeCost =
        gradeRatio > 0.65
          ? surfaceStepMeters * Math.pow(gradeRatio - 0.65, 2) * (2.5 * avoidanceWeight)
          : 0;
      const cliffGuard =
        cellSlopeDeg > maxSlopeLimitDeg
          ? surfaceStepMeters * (12 + Math.pow(cellSlopeDeg - maxSlopeLimitDeg, 2) * 3.0)
          : 0;




      const tentativeG = gScore[current] + surfaceStepMeters + elevChangeCost + gradeCost + cliffGuard;




      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        const h = Math.hypot(endG.gx - nx, endG.gz - nz) * cellMeters;
        openHeap.push(nIdx, tentativeG + h);
      }
    }
  }




  if (!found) {
    return { rawPoints: [startWorld, endWorld], feasible: false };
  }




  const rawPoints = [];
  let curr = endIdx;
  while (curr !== -1) {
    const gx = curr % N;
    const gz = Math.floor(curr / N);
    rawPoints.push(this.gridToWorld(gx, gz));
    curr = cameFrom[curr];
  }
  rawPoints.reverse();
  rawPoints[0] = { x: startWorld.x, z: startWorld.z };
  rawPoints[rawPoints.length - 1] = { x: endWorld.x, z: endWorld.z };




  // Light path thinning to prevent jagged grid stair-stepping while preserving terrain turns
  const simplified = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length - 1; i += 2) {
    simplified.push(rawPoints[i]);
  }
  simplified.push(rawPoints[rawPoints.length - 1]);




  return { rawPoints: simplified, feasible: true };
}




/**
 * Evaluates 1:1 unexaggerated distance, ascent/descent, slope grade & asymmetric outbound+return time
 */
evaluatePolyline(points, mobility, maxSlopeLimitDeg, primaryWaypointCount = 2) {
  if (!points || points.length < 2) return null;




  const vecs = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(vecs);
  const denseSamples = curve.getPoints(Math.max(110, points.length * 5));




  let totalDistMeters = 0;
  let totalAscentMeters = 0;
  let totalDescentMeters = 0;
  let maxSlopeDeg = 0;
  let slopeWeightedSum = 0;
  let outboundHours = 0;
  let returnHours = 0;
  const profile = [];




  const clamped3DPoints = denseSamples.map((pt, idx) => {
    const mola = this.terrain.getMolaMeters(pt.x, pt.z);
    let segSlopeDeg = this.terrain.getSlopeDegrees(pt.x, pt.z);




    if (idx > 0) {
      const prev = denseSamples[idx - 1];
      const prevMola = this.terrain.getMolaMeters(prev.x, prev.z);
      const dxMeters = Math.hypot(pt.x - prev.x, pt.z - prev.z) * this.cfg.METERS_PER_UNIT;
      const dElev = mola - prevMola;
      const segDist = Math.hypot(dxMeters, dElev);




      totalDistMeters += segDist;
      if (dElev > 0) totalAscentMeters += dElev;
      else totalDescentMeters += Math.abs(dElev);




      const pathGrade = dxMeters > 0.05 ? (Math.atan(Math.abs(dElev) / dxMeters) * 180) / Math.PI : 0;
      segSlopeDeg = Math.max(segSlopeDeg, pathGrade);
      if (segSlopeDeg > maxSlopeDeg) maxSlopeDeg = segSlopeDeg;
      slopeWeightedSum += segSlopeDeg * segDist;




      // Outbound & asymmetric reverse-return metabolic time
      const run = dxMeters > 0.05 ? dElev / dxMeters : 0; // signed rise/run
      const tob = (s) => Math.exp(-3.5 * (Math.abs(s + 0.05) - 0.05));
      outboundHours += segDist / 1000 / mobility.speedKmH / tob(run);
      returnHours += segDist / 1000 / mobility.speedKmH / tob(-run);
    }




    profile.push({
      distKm: totalDistMeters / 1000,
      elevM: mola,
      slopeDeg: segSlopeDeg,
    });




    const y = this.terrain.getHeightAt(pt.x, pt.z) + this.cfg.PATH_RIBBON_OFFSET;
    return new THREE.Vector3(pt.x, y, pt.z);
  });




  const distanceKm = totalDistMeters / 1000;
  const avgSlopeDeg = totalDistMeters > 0 ? slopeWeightedSum / totalDistMeters : 0;
  const scienceStopsHours = Math.max(1, primaryWaypointCount - 1) * 0.25;
  const reserveHours = 0.5;
  const totalMissionHours = outboundHours + returnHours + scienceStopsHours + reserveHours;




  const violatesSlope = maxSlopeDeg > maxSlopeLimitDeg;
  const exceedsBudget = totalMissionHours > mobility.maxBudgetH;




  return {
    points3D: clamped3DPoints,
    profile,
    distanceKm,
    ascentMeters: Math.round(totalAscentMeters),
    descentMeters: Math.round(totalDescentMeters),
    maxSlopeDeg,
    avgSlopeDeg,
    outboundHours,
    returnHours,
    scienceStopsHours,
    reserveHours,
    durationHours: totalMissionHours,
    violatesSlope,
    exceedsBudget,
    feasible: !violatesSlope && !exceedsBudget,
  };
}
}





