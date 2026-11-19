// ============================================================================
// ABUJA LIFE — CORE 3D SIMULATION & AI ALGORITHMS ENGINE
// ============================================================================
// Houses 9 pure, conflict-free, modular algorithms wired into world3d.js:
//   #1 WeightedAStarRouter          — Weighted A* on road graph + local grid
//   #2 SpatialHashGrid              — O(1) broad-phase spatial partitioning
//   #3 OBBCollisionSolver           — SAT Oriented Bounding Box + Swept CCD
//   #4 SteeringAgentController      — Reynolds Boids & Steering (traffic/peds/police)
//   #6 ProceduralUrbanPlanner       — Seeded zoning, parcel subdivision & WFC blocks
//   #7 LODBatchManager              — Frustum culling, 3-tier LOD & InstancedMesh batching
//   #8 AckermannPacejkaVehiclePhysics — Bicycle Ackermann + Pacejka tire slip physics
//   #9 SpringArmCameraController    — Critically damped spring + raycast occlusion
//   #10 HermiteNetworkInterpolator  — Cubic Hermite spline dead reckoning netcode
// (Algorithm #5 UtilityGOAPPlanner lives in src/core/sims.js alongside Sims motives.)
// ============================================================================

// ----------------------------------------------------------------------------
// #1 WEIGHTED A* (A-STAR) ROUTER (ROAD NETWORK + LOCAL OBSTACLE GRID)
// ----------------------------------------------------------------------------
export class WeightedAStarRouter {
  constructor(districtsById = {}, edges = [], worldScale = 14) {
    this.districtsById = districtsById;
    this.edges = edges;
    this.worldScale = worldScale;
    this.adj = new Map();
    for (const e of edges) {
      if (!this.adj.has(e.a)) this.adj.set(e.a, []);
      if (!this.adj.has(e.b)) this.adj.set(e.b, []);
      this.adj.get(e.a).push({ to: e.b, edge: e });
      this.adj.get(e.b).push({ to: e.a, edge: e });
    }
  }

  _heuristic(idA, idB) {
    const a = this.districtsById[idA];
    const b = this.districtsById[idB];
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.y - a.y) * 0.45;
  }

  /**
   * Computes lowest-cost path between districts using Weighted A*
   * factoring in physical distance, road speed class, rush-hour congestion, and weather.
   */
  findDistrictPath(startId, goalId, opts = {}) {
    if (!startId || !goalId || startId === goalId) return startId ? [startId] : [];
    const { isPeak = false, isWet = false, avoidRail = true } = opts;

    const open = new Set([startId]);
    const cameFrom = new Map();
    const gScore = new Map([[startId, 0]]);
    const fScore = new Map([[startId, this._heuristic(startId, goalId)]]);

    while (open.size > 0) {
      let current = null;
      let bestF = Infinity;
      for (const node of open) {
        const f = fScore.get(node) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          current = node;
        }
      }
      if (!current) break;
      if (current === goalId) {
        const path = [current];
        while (cameFrom.has(current)) {
          current = cameFrom.get(current);
          path.unshift(current);
        }
        return path;
      }

      open.delete(current);
      const neighbors = this.adj.get(current) || [];
      for (const { to, edge } of neighbors) {
        if (avoidRail && edge.type === 'rail') continue;
        const a = this.districtsById[current];
        const b = this.districtsById[to];
        const baseLen = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : (edge.minutes || 15);
        let weight = baseLen;
        if (edge.type === 'expressway') weight *= 0.82;
        if (isPeak && edge.peak) weight *= edge.peak;
        if (isWet && edge.tags?.includes('flood')) weight *= 1.65;

        const tentativeG = (gScore.get(current) ?? Infinity) + weight;
        if (tentativeG < (gScore.get(to) ?? Infinity)) {
          cameFrom.set(to, current);
          gScore.set(to, tentativeG);
          fScore.set(to, tentativeG + this._heuristic(to, goalId));
          open.add(to);
        }
      }
    }
    return null;
  }

  /**
   * Local 2D grid A* (cellSize = 2m) for indoor/compound waypoint walking & obstacle-avoiding pursuits.
   */
  findLocalWaypointPath(startX, startZ, goalX, goalZ, isBlockedFn, cellSize = 2.5, maxSteps = 96) {
    const sx = Math.round(startX / cellSize);
    const sz = Math.round(startZ / cellSize);
    const gx = Math.round(goalX / cellSize);
    const gz = Math.round(goalZ / cellSize);
    if (sx === gx && sz === gz) return [{ x: goalX, z: goalZ }];

    const key = (x, z) => `${x},${z}`;
    const startKey = key(sx, sz);
    const open = new Map([[startKey, { x: sx, z: sz, g: 0, f: Math.hypot(gx - sx, gz - sz) }]]);
    const closed = new Set();
    const cameFrom = new Map();
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]
    ];

    let steps = 0;
    let closestNode = { x: sx, z: sz, h: Math.hypot(gx - sx, gz - sz) };

    while (open.size > 0 && steps++ < maxSteps) {
      let curKey = null;
      let cur = null;
      for (const [k, v] of open.entries()) {
        if (!cur || v.f < cur.f) {
          cur = v;
          curKey = k;
        }
      }
      if (!cur) break;
      const h = Math.hypot(gx - cur.x, gz - cur.z);
      if (h < closestNode.h) closestNode = { x: cur.x, z: cur.z, h };

      if (cur.x === gx && cur.z === gz) {
        return this._reconstructLocalPath(cameFrom, curKey, cellSize, goalX, goalZ);
      }

      open.delete(curKey);
      closed.add(curKey);

      for (const [dx, dz, cost] of dirs) {
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        const wx = nx * cellSize;
        const wz = nz * cellSize;
        if ((nx !== gx || nz !== gz) && typeof isBlockedFn === 'function' && isBlockedFn(wx, wz)) {
          continue;
        }
        const ng = cur.g + cost;
        const existing = open.get(nk);
        if (!existing || ng < existing.g) {
          cameFrom.set(nk, { prevKey: curKey, x: nx, z: nz });
          open.set(nk, { x: nx, z: nz, g: ng, f: ng + Math.hypot(gx - nx, gz - nz) });
        }
      }
    }

    const fallbackKey = key(closestNode.x, closestNode.z);
    if (cameFrom.has(fallbackKey)) {
      return this._reconstructLocalPath(cameFrom, fallbackKey, cellSize, goalX, goalZ);
    }
    return [{ x: goalX, z: goalZ }];
  }

  _reconstructLocalPath(cameFrom, endKey, cellSize, goalX, goalZ) {
    const out = [{ x: goalX, z: goalZ }];
    let cur = endKey;
    let guard = 0;
    while (cameFrom.has(cur) && guard++ < 128) {
      const node = cameFrom.get(cur);
      out.unshift({ x: node.x * cellSize, z: node.z * cellSize });
      cur = node.prevKey;
    }
    return out;
  }
}

// ----------------------------------------------------------------------------
// #2 BROAD-PHASE SPATIAL HASH GRID (O(1) COLLISION & PROXIMITY QUERIES)
// ----------------------------------------------------------------------------
export class SpatialHashGrid {
  constructor(cellSize = 36) {
    this.cellSize = cellSize;
    this.staticCells = new Map();
    this.dynamicCells = new Map();
    this._queryStamp = 0;
  }

  _cellCoord(v) {
    return Math.floor(v / this.cellSize);
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  _insertInto(cellMap, item, minX, maxX, minZ, maxZ) {
    const x0 = this._cellCoord(minX);
    const x1 = this._cellCoord(maxX);
    const z0 = this._cellCoord(minZ);
    const z1 = this._cellCoord(maxZ);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let bucket = cellMap.get(k);
        if (!bucket) {
          bucket = [];
          cellMap.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  insertStatic(item, minX, maxX, minZ, maxZ) {
    this._insertInto(this.staticCells, item, minX, maxX, minZ, maxZ);
  }

  insertDynamic(item, x, z, radius = 2) {
    this._insertInto(this.dynamicCells, item, x - radius, x + radius, z - radius, z + radius);
  }

  clearDynamic() {
    this.dynamicCells.clear();
  }

  queryRadius(x, z, radius, { includeStatic = true, includeDynamic = false } = {}) {
    const stamp = ++this._queryStamp;
    const results = [];
    const x0 = this._cellCoord(x - radius);
    const x1 = this._cellCoord(x + radius);
    const z0 = this._cellCoord(z - radius);
    const z1 = this._cellCoord(z + radius);

    const scan = (map) => {
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const bucket = map.get(this._key(cx, cz));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const it = bucket[i];
            if (it._shStamp !== stamp) {
              it._shStamp = stamp;
              results.push(it);
            }
          }
        }
      }
    };

    if (includeStatic) scan(this.staticCells);
    if (includeDynamic) scan(this.dynamicCells);
    return results;
  }
}

// ----------------------------------------------------------------------------
// #3 SAT ORIENTED BOUNDING BOX (OBB) COLLISION & SWEPT CCD SOLVER
// ----------------------------------------------------------------------------
export class OBBCollisionSolver {
  constructor(spatialGrid = null) {
    this.grid = spatialGrid || new SpatialHashGrid(36);
    this.obbs = [];
  }

  addOBB(x, z, width, depth, rotY = 0, label = 'building', height = 14) {
    const hw = width * 0.5 + 0.35;
    const hd = depth * 0.5 + 0.35;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    // Conservative world-space AABB for spatial hash indexing
    const extX = Math.abs(cos) * hw + Math.abs(sin) * hd;
    const extZ = Math.abs(sin) * hw + Math.abs(cos) * hd;
    const obb = { x, z, hw, hd, rotY, cos, sin, height, label };
    this.obbs.push(obb);
    this.grid.insertStatic(obb, x - extX, x + extX, z - extZ, z + extZ);
    return obb;
  }

  /**
   * Exact Circle-vs-OBB test in the OBB's local rotated coordinate frame (SAT equivalent).
   * Returns { hit, pushX, pushZ, obb } with minimum translation vector (MTV).
   */
  testCircleOBB(px, pz, radius, obb) {
    const dx = px - obb.x;
    const dz = pz - obb.z;
    // Transform into OBB local space (inverse rotation by -rotY)
    const lx = dx * obb.cos - dz * obb.sin;
    const lz = dx * obb.sin + dz * obb.cos;

    // Closest point on OBB to circle center
    const cx = Math.max(-obb.hw, Math.min(obb.hw, lx));
    const cz = Math.max(-obb.hd, Math.min(obb.hd, lz));

    const distX = lx - cx;
    const distZ = lz - cz;
    const distSq = distX * distX + distZ * distZ;

    if (distSq >= radius * radius) return null;

    let pushLocalX = 0;
    let pushLocalZ = 0;
    if (distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const pen = radius - dist;
      pushLocalX = (distX / dist) * pen;
      pushLocalZ = (distZ / dist) * pen;
    } else {
      // Circle center is inside OBB; push out along shallowest SAT axis
      const penX = obb.hw + radius - Math.abs(lx);
      const penZ = obb.hd + radius - Math.abs(lz);
      if (penX < penZ) {
        pushLocalX = lx >= 0 ? penX : -penX;
      } else {
        pushLocalZ = lz >= 0 ? penZ : -penZ;
      }
    }

    // Rotate MTV back to world space (+rotY)
    const pushX = pushLocalX * obb.cos + pushLocalZ * obb.sin;
    const pushZ = -pushLocalX * obb.sin + pushLocalZ * obb.cos;
    return { hit: true, pushX, pushZ, obb };
  }

  /**
   * Swept sub-stepped Continuous Collision Detection (CCD) prevents high-speed tunneling.
   */
  resolveSweptCircle(prevX, prevZ, nextPos, radius = 2.4) {
    const totalDx = nextPos.x - prevX;
    const totalDz = nextPos.z - prevZ;
    const moveDist = Math.hypot(totalDx, totalDz);
    const maxStep = Math.max(0.6, radius * 0.55);
    const steps = Math.max(1, Math.min(6, Math.ceil(moveDist / maxStep)));

    let curX = prevX;
    let curZ = prevZ;
    let hitAny = false;
    let hitLabel = null;

    for (let s = 1; s <= steps; s++) {
      curX += totalDx / steps;
      curZ += totalDz / steps;
      const candidates = this.grid.queryRadius(curX, curZ, radius + 16, { includeStatic: true });
      for (let i = 0; i < candidates.length; i++) {
        const res = this.testCircleOBB(curX, curZ, radius, candidates[i]);
        if (res) {
          curX += res.pushX;
          curZ += res.pushZ;
          hitAny = true;
          hitLabel = res.obb.label;
        }
      }
    }

    nextPos.x = curX;
    nextPos.z = curZ;
    return { hit: hitAny, label: hitLabel };
  }

  /** Point query for A* obstacle checks or ray-segment sampling. */
  isPointBlocked(x, z, padding = 1.2) {
    const candidates = this.grid.queryRadius(x, z, padding + 14, { includeStatic: true });
    for (let i = 0; i < candidates.length; i++) {
      if (this.testCircleOBB(x, z, padding, candidates[i])) return true;
    }
    return false;
  }

  /**
   * Ray vs OBB 3D slab test for Spring-Arm Camera Occlusion (Algorithm #9).
   * Returns closest normalized t in [0, 1] along segment A->B if occluded, else 1.0.
   */
  raycastSegmentOcclusion(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.05) return 1.0;

    const midX = (ax + bx) * 0.5;
    const midZ = (az + bz) * 0.5;
    const candidates = this.grid.queryRadius(midX, midZ, segLen * 0.5 + 16, { includeStatic: true });

    let bestT = 1.0;
    for (let i = 0; i < candidates.length; i++) {
      const obb = candidates[i];
      // Transform ray origin & direction into OBB local frame
      const ox = (ax - obb.x) * obb.cos - (az - obb.z) * obb.sin;
      const oz = (ax - obb.x) * obb.sin + (az - obb.z) * obb.cos;
      const rdx = dx * obb.cos - dz * obb.sin;
      const rdz = dx * obb.sin + dz * obb.cos;

      let tMin = 0.0;
      let tMax = bestT;

      // X slab
      if (Math.abs(rdx) < 1e-6) {
        if (ox < -obb.hw || ox > obb.hw) continue;
      } else {
        let t1 = (-obb.hw - ox) / rdx;
        let t2 = (obb.hw - ox) / rdx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) continue;
      }

      // Z slab
      if (Math.abs(rdz) < 1e-6) {
        if (oz < -obb.hd || oz > obb.hd) continue;
      } else {
        let t1 = (-obb.hd - oz) / rdz;
        let t2 = (obb.hd - oz) / rdz;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) continue;
      }

      // Y slab (0 .. obb.height)
      if (Math.abs(dy) < 1e-6) {
        if (ay < 0 || ay > obb.height) continue;
      } else {
        let t1 = (0 - ay) / dy;
        let t2 = (obb.height - ay) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) continue;
      }

      if (tMin > 0.05 && tMin < bestT) {
        bestT = tMin;
      }
    }
    return bestT;
  }
}

// ----------------------------------------------------------------------------
// #4 REYNOLDS STEERING BEHAVIORS & BOIDS (PURSUIT, SEPARATION, AVOIDANCE)
// ----------------------------------------------------------------------------
export class SteeringAgentController {
  static seek(posX, posZ, targetX, targetZ, maxSpeed) {
    const dx = targetX - posX;
    const dz = targetZ - posZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return { vx: 0, vz: 0, dist: 0 };
    return { vx: (dx / dist) * maxSpeed, vz: (dz / dist) * maxSpeed, dist };
  }

  static arrive(posX, posZ, targetX, targetZ, maxSpeed, slowRadius = 12) {
    const dx = targetX - posX;
    const dz = targetZ - posZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return { vx: 0, vz: 0, dist: 0 };
    const speed = dist < slowRadius ? maxSpeed * (dist / slowRadius) : maxSpeed;
    return { vx: (dx / dist) * speed, vz: (dz / dist) * speed, dist };
  }

  static flee(posX, posZ, threatX, threatZ, maxSpeed, panicRadius = 14) {
    const dx = posX - threatX;
    const dz = posZ - threatZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4 || dist > panicRadius) return { vx: 0, vz: 0, fleeing: false };
    const strength = (1 - dist / panicRadius) * maxSpeed;
    return { vx: (dx / dist) * strength, vz: (dz / dist) * strength, fleeing: true };
  }

  static separation(agentX, agentZ, peers, desiredSep = 8.5, weight = 18) {
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (let i = 0; i < peers.length; i++) {
      const p = peers[i];
      const dx = agentX - p.x;
      const dz = agentZ - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < desiredSep) {
        const push = (desiredSep - d) / desiredSep;
        sx += (dx / d) * push;
        sz += (dz / d) * push;
        count++;
      }
    }
    if (count === 0) return { vx: 0, vz: 0 };
    return { vx: (sx / count) * weight, vz: (sz / count) * weight };
  }

  /**
   * Computes obstacle-avoiding pursuit velocity for Police Hilux units executing PIT/flank maneuvers.
   */
  static computePursuitSteering(unit, playerPos, playerVel, peerPositions, obbSolver, dt) {
    const lookAhead = 0.65;
    const predX = playerPos.x + (playerVel?.x || 0) * lookAhead + Math.cos(unit.flankAngle || 0) * (unit.flankOffset || 0);
    const predZ = playerPos.z + (playerVel?.z || 0) * lookAhead + Math.sin(unit.flankAngle || 0) * (unit.flankOffset || 0);

    const seekVec = SteeringAgentController.arrive(unit.x, unit.z, predX, predZ, unit.speed || 46, 8);
    const sepVec = SteeringAgentController.separation(unit.x, unit.z, peerPositions, 9.5, 24);

    let vx = seekVec.vx + sepVec.vx;
    let vz = seekVec.vz + sepVec.vz;

    // Obstacle feeler rays (ahead, left-30°, right-30°)
    if (obbSolver) {
      const speedMag = Math.hypot(vx, vz);
      if (speedMag > 0.5) {
        const h = Math.atan2(vx, vz);
        const feelDist = 8.5;
        const aheadBlocked = obbSolver.isPointBlocked(unit.x + Math.sin(h) * feelDist, unit.z + Math.cos(h) * feelDist, 2.2);
        if (aheadBlocked) {
          const leftH = h + 0.65;
          const rightH = h - 0.65;
          const leftBlocked = obbSolver.isPointBlocked(unit.x + Math.sin(leftH) * feelDist, unit.z + Math.cos(leftH) * feelDist, 2.2);
          const steerH = leftBlocked ? rightH : leftH;
          vx = Math.sin(steerH) * (unit.speed || 46);
          vz = Math.cos(steerH) * (unit.speed || 46);
        }
      }
    }

    const mag = Math.hypot(vx, vz);
    const cap = unit.speed || 46;
    if (mag > cap) {
      vx = (vx / mag) * cap;
      vz = (vz / mag) * cap;
    }

    const nextPos = { x: unit.x + vx * dt, z: unit.z + vz * dt };
    if (obbSolver) {
      obbSolver.resolveSweptCircle(unit.x, unit.z, nextPos, 2.8);
    }
    const heading = mag > 0.5 ? Math.atan2(vx, vz) : (unit.heading || 0);
    return { x: nextPos.x, z: nextPos.z, heading, vx, vz };
  }
}

// ----------------------------------------------------------------------------
// #6 PROCEDURAL URBAN PLANNER (ZONING + PARCEL SUBDIVISION + CONSTRAINED WFC)
// ----------------------------------------------------------------------------
export class ProceduralUrbanPlanner {
  static _hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6D2B79F5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Generates authentic district-specific parcel layouts using zoning constraints
   * instead of clone-stamped circles across all 15 districts.
   */
  static generateDistrictLayout(district) {
    const id = district.id;
    const rng = ProceduralUrbanPlanner._hash(`abj_wfc_${id}`);
    const isCbd = id === 'cbd';
    const isElite = id === 'maitama' || id === 'asokoro' || id === 'guzape';
    const isNightlife = id === 'wuse2' || id === 'lagos_island';
    const isWaterfront = id === 'jabi' || id === 'mpape' || id === 'lagos_island';
    const isSatellite = district.zone === 2 && !isWaterfront;

    const paletteByZone = isElite
      ? { walls: [0xfef3c7, 0xf8fafc, 0xfde68a], roofs: [0x7c2d12, 0x334155, 0x451a03] }
      : isNightlife
        ? { walls: [0xe2e8f0, 0xf1f5f9, 0xfed7aa], roofs: [0x1e293b, 0x5c2415] }
        : { walls: [0xfed7aa, 0xfdba74, 0xfde68a, 0xe2e8f0], roofs: [0x5c2415, 0x7c2d12, 0x334155] };

    // Constrained parcel slots arranged along orthogonal urban street blocks
    const parcels = [];
    const blockOffsets = isCbd
      ? [
          { x: -30, z: -28, rot: 0, kind: 'skyscraper', w: 14, d: 12, h: 52 },
          { x: 30, z: -28, rot: Math.PI, kind: 'skyscraper', w: 15, d: 13, h: 64 },
          { x: -30, z: 28, rot: 0, kind: 'skyscraper', w: 13, d: 12, h: 44 },
          { x: 30, z: 28, rot: Math.PI, kind: 'skyscraper', w: 16, d: 14, h: 58 },
          { x: -46, z: 0, rot: Math.PI / 2, kind: 'commercial', w: 14, d: 10, h: 24 },
          { x: 46, z: 0, rot: -Math.PI / 2, kind: 'commercial', w: 14, d: 10, h: 28 },
          { x: 0, z: -46, rot: 0, kind: 'duplex', w: 13, d: 10, h: 12 },
          { x: 0, z: 46, rot: Math.PI, kind: 'duplex', w: 13, d: 10, h: 12 }
        ]
      : isElite
        ? [
            { x: -32, z: -24, rot: 0.15, kind: 'villa', w: 16, d: 13, h: 15.5 },
            { x: 32, z: -24, rot: -0.15, kind: 'villa', w: 17, d: 13, h: 16.5 },
            { x: -32, z: 24, rot: Math.PI - 0.15, kind: 'villa', w: 15, d: 12, h: 14.5 },
            { x: 32, z: 24, rot: Math.PI + 0.15, kind: 'villa', w: 16, d: 13, h: 16.0 },
            { x: -46, z: 0, rot: Math.PI / 2, kind: 'villa', w: 15, d: 12, h: 14.0 },
            { x: 46, z: 0, rot: -Math.PI / 2, kind: 'villa', w: 15, d: 12, h: 15.0 },
            { x: 0, z: -42, rot: 0, kind: 'villa', w: 16, d: 11, h: 15.0 }
          ]
        : [
            { x: -28, z: -26, rot: 0, kind: isNightlife ? 'commercial' : 'duplex', w: 13, d: 11, h: isNightlife ? 18 : 11 },
            { x: 28, z: -26, rot: 0, kind: 'duplex', w: 14, d: 10, h: 12 },
            { x: -28, z: 26, rot: Math.PI, kind: 'duplex', w: 13, d: 10, h: 11 },
            { x: 28, z: 26, rot: Math.PI, kind: isNightlife ? 'commercial' : 'duplex', w: 14, d: 11, h: isNightlife ? 20 : 12.5 },
            { x: -42, z: 0, rot: Math.PI / 2, kind: 'duplex', w: 12, d: 10, h: 10.5 },
            { x: 42, z: 0, rot: -Math.PI / 2, kind: 'duplex', w: 13, d: 10, h: 11.5 },
            { x: 0, z: -40, rot: 0, kind: 'duplex', w: 13, d: 10, h: 11 },
            { x: 0, z: 40, rot: Math.PI, kind: 'duplex', w: 13, d: 10, h: 11 }
          ];

    for (let i = 0; i < blockOffsets.length; i++) {
      const slot = blockOffsets[i];
      const jitterX = (rng() - 0.5) * 3.0;
      const jitterZ = (rng() - 0.5) * 3.0;
      parcels.push({
        x: slot.x + jitterX,
        z: slot.z + jitterZ,
        rot: slot.rot,
        kind: slot.kind,
        w: slot.w + (rng() - 0.5) * 1.6,
        d: slot.d + (rng() - 0.5) * 1.4,
        h: slot.h + (rng() - 0.5) * 2.0,
        wallHex: paletteByZone.walls[Math.floor(rng() * paletteByZone.walls.length)],
        roofHex: paletteByZone.roofs[Math.floor(rng() * paletteByZone.roofs.length)]
      });
    }

    // Only satellite/residential hubs get a neighborhood 5-aside football pitch; elite zones get manicured plazas
    return {
      zoneStyle: isCbd ? 'cbd' : isElite ? 'elite' : isNightlife ? 'nightlife' : isWaterfront ? 'waterfront' : 'residential',
      parcels,
      hasFootballPitch: isSatellite || id === 'garki' || id === 'utako',
      hasKoropePark: !isElite && !isCbd,
      treeDensity: isElite ? 8 : isWaterfront ? 7 : 5
    };
  }
}

// ----------------------------------------------------------------------------
// #7 HIERARCHICAL FRUSTUM CULLING, 3-TIER LOD & INSTANCED BATCHING MANAGER
// ----------------------------------------------------------------------------
export class LODBatchManager {
  constructor(THREE) {
    this.THREE = THREE;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.batchBuckets = new Map();
    this.lodGroups = [];
    this.instancedMeshes = [];
  }

  /** Register a transform matrix for GPU InstancedMesh batching by (key, geometry, material). */
  queueInstance(key, geometry, material, matrix, castShadow = false, receiveShadow = false) {
    let bucket = this.batchBuckets.get(key);
    if (!bucket) {
      bucket = { geometry, material, matrices: [], castShadow, receiveShadow };
      this.batchBuckets.set(key, bucket);
    }
    bucket.matrices.push(matrix.clone());
  }

  /** Commit all queued transforms into compact THREE.InstancedMesh draw calls. */
  commitBatches(scene) {
    const THREE = this.THREE;
    let totalInstances = 0;
    for (const [, bucket] of this.batchBuckets.entries()) {
      const count = bucket.matrices.length;
      if (count === 0) continue;
      const im = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
      for (let i = 0; i < count; i++) {
        im.setMatrixAt(i, bucket.matrices[i]);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = bucket.castShadow;
      im.receiveShadow = bucket.receiveShadow;
      im.frustumCulled = false; // Spans multiple districts cleanly
      scene.add(im);
      this.instancedMeshes.push(im);
      totalInstances += count;
    }
    this.batchBuckets.clear();
    return { batches: this.instancedMeshes.length, totalInstances };
  }

  registerLOD(entry) {
    // entry: { pos: Vector3, radius: number, highGroup, lowProxy, id }
    this.lodGroups.push(entry);
  }

  /** Updates frustum visibility & switches High Detail vs Simplified LOD Proxy by distance. */
  update(camera, playerPos, currentDistrictId, opts = {}) {
    const { lowPowerMode = false, forceAllHigh = false } = opts;
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const highDist = lowPowerMode ? 145 : 210;
    const cullDist = lowPowerMode ? 360 : 560;
    const sphere = new this.THREE.Sphere();

    for (let i = 0; i < this.lodGroups.length; i++) {
      const entry = this.lodGroups[i];
      const dist = Math.hypot(playerPos.x - entry.pos.x, playerPos.z - entry.pos.z);
      if (forceAllHigh || entry.id === currentDistrictId) {
        if (entry.highGroup) entry.highGroup.visible = true;
        if (entry.lowProxy) entry.lowProxy.visible = false;
        continue;
      }

      sphere.center.copy(entry.pos);
      sphere.radius = entry.radius || 65;
      const inView = this.frustum.intersectsSphere(sphere);

      if (!inView || dist > cullDist) {
        if (entry.highGroup) entry.highGroup.visible = false;
        if (entry.lowProxy) entry.lowProxy.visible = false;
      } else if (dist <= highDist) {
        if (entry.highGroup) entry.highGroup.visible = true;
        if (entry.lowProxy) entry.lowProxy.visible = false;
      } else {
        if (entry.highGroup) entry.highGroup.visible = false;
        if (entry.lowProxy) entry.lowProxy.visible = true;
      }
    }
  }
}

// ----------------------------------------------------------------------------
// #8 ACKERMANN STEERING + PACEJKA "MAGIC FORMULA" TIRE SLIP VEHICLE PHYSICS
// ----------------------------------------------------------------------------
export class AckermannPacejkaVehiclePhysics {
  constructor() {
    this.wheelbase = 5.7;       // Distance between front and rear axles (m)
    this.trackWidth = 4.4;      // Distance between left and right wheels (m)
    this.maxSteerAngle = 0.52;  // ~30° max front wheel lock
    this.vx = 0;                // Longitudinal velocity (forward)
    this.vz = 0;                // Lateral velocity (drift slide)
    this.yawRate = 0;
    this.steerAngle = 0;
    this.slipAngle = 0;
    this.isDrifting = false;
    this.isBraking = false;
  }

  /**
   * Pacejka Magic Formula lateral tire force: D * sin(C * atan(B * alpha))
   */
  _pacejkaLateral(slipAngle, gripMu) {
    const B = 7.2;
    const C = 1.45;
    const D = gripMu;
    return D * Math.sin(C * Math.atan(B * slipAngle));
  }

  /**
   * Computes inner & outer front wheel Ackermann steering angles so tires never scrub.
   */
  getAckermannWheelAngles(steerAngle) {
    if (Math.abs(steerAngle) < 0.005) return { left: 0, right: 0 };
    const turnRadius = this.wheelbase / Math.tan(Math.abs(steerAngle));
    const inner = Math.atan(this.wheelbase / Math.max(1.2, turnRadius - this.trackWidth * 0.5));
    const outer = Math.atan(this.wheelbase / (turnRadius + this.trackWidth * 0.5));
    if (steerAngle > 0) return { left: inner, right: outer };
    return { left: -outer, right: -inner };
  }

  step({ throttle = 0, steerInput = 0, handbrake = false, boost = false, isWet = false, heading = 0, dt = 0.016 }) {
    const maxSpeed = boost ? 132 : 88;
    const accelForce = boost ? 96 : 62;
    const brakeForce = 92;
    const gripMu = isWet ? 0.62 : 1.0; // Wet Abuja storm reduces road friction

    // Smooth steering rack response
    const targetSteer = -steerInput * this.maxSteerAngle;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 11);

    // Longitudinal acceleration / braking / aerodynamic drag
    this.isBraking = (throttle < -0.1 && this.vx > 2) || handbrake;
    if (throttle > 0.05) {
      this.vx += throttle * accelForce * dt;
    } else if (throttle < -0.05) {
      if (this.vx > 2) {
        this.vx = Math.max(0, this.vx + throttle * brakeForce * dt);
      } else {
        this.vx += throttle * (accelForce * 0.5) * dt;
      }
    } else {
      this.vx *= Math.pow(0.18, dt);
      if (Math.abs(this.vx) < 0.15) this.vx = 0;
    }

    if (handbrake) {
      this.vx *= Math.pow(0.45, dt);
    }
    this.vx = Math.max(-28, Math.min(maxSpeed, this.vx));

    // Ackermann bicycle-model yaw rate + Pacejka lateral slip dynamics
    const rearGrip = handbrake ? gripMu * 0.28 : gripMu;
    const speedAbs = Math.abs(this.vx);
    const ackermannYaw = speedAbs > 0.4
      ? (this.vx / this.wheelbase) * Math.tan(this.steerAngle)
      : 0;

    // Lateral velocity builds during sharp turns or handbrake slides
    const centrifugal = ackermannYaw * this.vx * (handbrake ? 0.82 : 0.28);
    this.vz += centrifugal * dt;

    const slip = speedAbs > 1.5 ? Math.atan2(this.vz, speedAbs) : 0;
    const lateralRestore = this._pacejkaLateral(slip, rearGrip) * 42 * dt;
    this.vz -= Math.sign(this.vz) * Math.min(Math.abs(this.vz), Math.abs(lateralRestore));
    this.vz *= Math.pow(handbrake ? 0.55 : 0.08, dt);

    const driftBoostYaw = handbrake && speedAbs > 12 ? -steerInput * 1.35 : 0;
    this.yawRate = ackermannYaw + driftBoostYaw;
    const nextHeading = heading + this.yawRate * dt;

    // Convert body-frame (vx forward, vz lateral) to world-frame displacement
    const sinH = Math.sin(nextHeading);
    const cosH = Math.cos(nextHeading);
    const worldDx = (sinH * this.vx + cosH * this.vz) * dt;
    const worldDz = (cosH * this.vx - sinH * this.vz) * dt;

    this.slipAngle = Math.max(-0.55, Math.min(0.55, slip));
    this.isDrifting = (handbrake && speedAbs > 14) || (Math.abs(this.slipAngle) > 0.14 && speedAbs > 26);

    return {
      dx: worldDx,
      dz: worldDz,
      heading: nextHeading,
      speed: this.vx,
      slipAngle: this.slipAngle,
      isDrifting: this.isDrifting,
      isBraking: this.isBraking,
      wheelAngles: this.getAckermannWheelAngles(this.steerAngle)
    };
  }
}

// ----------------------------------------------------------------------------
// #9 SPRING-ARM CAMERA OCCLUSION + CRITICALLY DAMPED SPRING SOLVER
// ----------------------------------------------------------------------------
export class SpringArmCameraController {
  constructor(stiffness = 14) {
    this.stiffness = stiffness;
    this.currentPos = { x: 0, y: 12, z: 20 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.currentArmRatio = 1.0;
    this.initialized = false;
  }

  /**
   * Frame-rate-independent critically damped spring update + OBB occlusion check.
   */
  update(pivot, desired, obbSolver, dt, minHeight = 2.6) {
    if (!this.initialized) {
      this.currentPos = { x: desired.x, y: desired.y, z: desired.z };
      this.initialized = true;
      return { ...this.currentPos };
    }

    // Spring-arm raycast against building OBBs (pull camera forward if blocked!)
    let targetRatio = 1.0;
    if (obbSolver) {
      const hitT = obbSolver.raycastSegmentOcclusion(
        pivot.x, pivot.y, pivot.z,
        desired.x, desired.y, desired.z
      );
      if (hitT < 0.99) {
        targetRatio = Math.max(0.22, hitT - 0.08);
      }
    }

    // Fast pull-in when occluded, smooth ease-out when clear
    const armRate = targetRatio < this.currentArmRatio ? 24 : 5.5;
    this.currentArmRatio += (targetRatio - this.currentArmRatio) * Math.min(1, dt * armRate);

    const targetX = pivot.x + (desired.x - pivot.x) * this.currentArmRatio;
    const targetY = Math.max(minHeight, pivot.y + (desired.y - pivot.y) * this.currentArmRatio);
    const targetZ = pivot.z + (desired.z - pivot.z) * this.currentArmRatio;

    // Critically damped spring analytical integration: exact across 30/60/120 Hz
    const omega = this.stiffness;
    const exp = Math.exp(-omega * dt);

    for (const axis of ['x', 'y', 'z']) {
      const tVal = axis === 'x' ? targetX : (axis === 'y' ? targetY : targetZ);
      const disp = this.currentPos[axis] - tVal;
      const temp = (this.velocity[axis] + omega * disp) * dt;
      this.velocity[axis] = (this.velocity[axis] - omega * temp) * exp;
      this.currentPos[axis] = tVal + (disp + temp) * exp;
    }

    return { ...this.currentPos };
  }
}

// ----------------------------------------------------------------------------
// #10 CLIENT-SIDE PREDICTION & CUBIC HERMITE SPLINE NETWORK INTERPOLATOR
// ----------------------------------------------------------------------------
export class HermiteNetworkInterpolator {
  constructor(interpWindowSec = 0.25) {
    this.interpWindow = interpWindowSec;
    this.entities = new Map();
  }

  pushSnapshot(id, x, z, timestampSec) {
    const existing = this.entities.get(id);
    if (!existing) {
      this.entities.set(id, {
        p0: { x, z },
        p1: { x, z },
        v0: { x: 0, z: 0 },
        v1: { x: 0, z: 0 },
        t0: timestampSec,
        t1: timestampSec + this.interpWindow,
        heading: 0
      });
      return;
    }
    const dt = Math.max(0.05, timestampSec - existing.t0);
    const vx = (x - existing.p1.x) / dt;
    const vz = (z - existing.p1.z) / dt;
    // Clamp absurd lag spikes (> 180 u/s) to instant snap
    if (Math.hypot(vx, vz) > 180) {
      existing.p0 = { x, z };
      existing.p1 = { x, z };
      existing.v0 = { x: 0, z: 0 };
      existing.v1 = { x: 0, z: 0 };
      existing.t0 = timestampSec;
      existing.t1 = timestampSec + this.interpWindow;
      return;
    }
    existing.p0 = { ...existing.p1 };
    existing.v0 = { ...existing.v1 };
    existing.p1 = { x, z };
    existing.v1 = { x: vx, z: vz };
    existing.t0 = timestampSec;
    existing.t1 = timestampSec + Math.max(0.12, Math.min(0.6, dt));
    if (Math.hypot(vx, vz) > 0.4) {
      existing.heading = Math.atan2(vx, vz);
    }
  }

  sample(id, nowSec) {
    const e = this.entities.get(id);
    if (!e) return null;
    const span = Math.max(0.05, e.t1 - e.t0);
    const u = Math.max(0, Math.min(1.25, (nowSec - e.t0) / span));

    if (u <= 1.0) {
      // Cubic Hermite basis functions h00, h10, h01, h11
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;

      const x = h00 * e.p0.x + h10 * span * e.v0.x + h01 * e.p1.x + h11 * span * e.v1.x;
      const z = h00 * e.p0.z + h10 * span * e.v0.z + h01 * e.p1.z + h11 * span * e.v1.z;
      const speed = Math.hypot(e.v1.x, e.v1.z);
      return { x, z, heading: e.heading, isMoving: speed > 0.35 };
    }

    // Mild bounded dead reckoning (up to 0.25 window past snapshot) during mobile jitter
    const extraT = (u - 1.0) * span * 0.5;
    return {
      x: e.p1.x + e.v1.x * extraT,
      z: e.p1.z + e.v1.z * extraT,
      heading: e.heading,
      isMoving: Math.hypot(e.v1.x, e.v1.z) > 0.35
    };
  }

  remove(id) {
    this.entities.delete(id);
  }
}
