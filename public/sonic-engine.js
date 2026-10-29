/**
 * sonic-engine.js — Sonic Retro 16-bit physics (source of truth: SONIC_PHYSICS_SPEC.md)
 *
 * Pure logic, no DOM:
 *   - Analytical terrain: C1-continuous height fields, line walls and circular loop arcs.
 *     Every surface is ONE-SIDED (a ray only hits it travelling into the solid side), so
 *     floors, ceilings, walls and the loop interior need no special-case flags.
 *   - Dual-layer 360° loop with Entry / Apex / Exit trigger gates.
 *   - 6-sensor rig (A–F) rotated by quadrant mode, landing momentum table.
 *   - Player state machine: STANDING, RUNNING, ROLLING, SPINDASH, AIRBORNE.
 *
 * All constants are px/frame @ 60 FPS. update(dtSeconds) scales by dt*60 and sub-steps so
 * no single integration step exceeds one 60 FPS frame (keeps the ±14px snap window valid).
 *
 * Works in the browser (window.SonicEngine) and Node (require) for headless tests.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SonicEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /* ======================================================================
       PART 1 — CORE CONSTANTS (px/frame @ 60 FPS)
       ====================================================================== */
    const PHYS = Object.freeze({
        ACC: 12 / 256,            // 0.046875
        DEC: 128 / 256,           // 0.5
        FRC: 12 / 256,            // 0.046875
        TOP: 6.0,                 // stop adding ACC here (never clamp down to it)
        MAX_SPEED: 16.0,          // hard cap on |gsp|, |Xsp|, |Ysp|
        ROLL_FRC: 6 / 256,        // 0.0234375
        ROLL_DEC: 32 / 256,       // 0.125
        AIR_ACC: 24 / 256,        // 0.09375
        GRV: 56 / 256,            // 0.21875
        JMP: 6.5,
        JMP_RELEASE_CAP: -4.0,
        SLP_NORMAL: 32 / 256,     // 0.125
        SLP_ROLL_UP: 20 / 256,    // 0.078125
        SLP_ROLL_DOWN: 80 / 256,  // 0.3125
        FALL_THRESHOLD: 2.5,

        AIR_DRAG: 0.96875,
        AIR_DRAG_MIN_XSP: 0.125,
        SKID_SNAP: 0.5,           // gsp after DEC crosses zero
        ROLL_MIN_SPEED: 1.0,
        UNROLL_SPEED: 0.5,
        SPINDASH_MAX_GSP: 0.5,
        SPINDASH_BASE: 8.0,
        SPINDASH_REV_ADD: 2.0,
        SPINDASH_REV_MAX: 8.0,
        SNAP_WINDOW: 14,
        GROUND_CAST_EXTRA: 16,
        CURL_OFFSET: 5,
        CONTROL_LOCK_FRAMES: 30,
        AIR_ANGLE_RETURN_DEG: 2.8125, // per frame, visual angle back toward 0° while airborne
    });

    const HITBOX = Object.freeze({
        STAND: Object.freeze({ width: 9, height: 19, push: 10 }),
        ROLL: Object.freeze({ width: 7, height: 14, push: 10 }),
    });

    const STATE = Object.freeze({
        STANDING: 'STANDING',
        RUNNING: 'RUNNING',
        ROLLING: 'ROLLING',
        SPINDASH: 'SPINDASH',
        PEELOUT: 'PEELOUT',
        AIRBORNE: 'AIRBORNE',
        DYING: 'DYING',
    });

    /* ======================================================================
       MATH HELPERS
       Angle convention (spec §3): 0 = floor, 90 = right wall (going up),
       180 = ceiling, 270 = left wall. Surface normal n(a) = (-sin a, -cos a).
       ====================================================================== */
    const DEG = Math.PI / 180;
    const TAU = Math.PI * 2;
    const wrapAngle = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
    const wrapSigned = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const toDeg = (a) => wrapAngle(a) / DEG;
    const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const normalToAngle = (nx, ny) => wrapAngle(Math.atan2(-nx, -ny));

    /** Spec §6 quadrant modes. */
    function getQuadrantMode(angle) {
        const d = toDeg(angle);
        if (d >= 315 || d < 45) return 0;   // floor
        if (d < 135) return 1;              // right wall
        if (d <= 225) return 2;             // ceiling
        return 3;                           // left wall
    }

    /**
     * Per-mode sensor frame. d = "down" (toward feet, ground-sensor cast direction),
     * r = "forward" (direction of +gsp travel, lateral axis for A/B and E/F).
     */
    const MODE_FRAMES = Object.freeze([
        Object.freeze({ dx: 0, dy: 1, rx: 1, ry: 0 }),    // 0 floor:      cast down,  forward right
        Object.freeze({ dx: 1, dy: 0, rx: 0, ry: -1 }),   // 1 right wall: cast right, forward up
        Object.freeze({ dx: 0, dy: -1, rx: -1, ry: 0 }),  // 2 ceiling:    cast up,    forward left
        Object.freeze({ dx: -1, dy: 0, rx: 0, ry: 1 }),   // 3 left wall:  cast left,  forward down
    ]);

    /** Spec §7 landing momentum conversion. */
    function landingGroundSpeed(xsp, ysp, angle) {
        const d = toDeg(angle);
        const s = Math.sin(angle);
        if (d <= 22.5 || d >= 337.5) return xsp;                                       // shallow
        if (d <= 45 || d >= 315) return Math.abs(xsp) > ysp ? xsp : ysp * 0.5 * -sign(s); // half-steep
        if (d < 90 || d > 270) return Math.abs(xsp) > ysp ? xsp : ysp * -sign(s);       // steep
        return xsp; // ceiling angles are never reached by the downward floor sensors
    }

    /* ======================================================================
       PART 2 — ANALYTICAL ONE-SIDED SURFACES
       intersect(ox, oy, dx, dy, tMin, tMax) -> { t, x, y, nx, ny, surface } | null
       (d must be a unit vector; a hit only counts when d · n < 0)
       ====================================================================== */
    class LineSurface {
        /** Normal is the perpendicular closest to the hint (hnx, hny), i.e. it points into open space. */
        constructor(x1, y1, x2, y2, hnx, hny, layer = -1, name = 'line', opts = {}) {
            this.kind = 'line';
            this.hnx = hnx;
            this.hny = hny;
            this.layer = layer;
            this.name = name;
            this.enabled = true;
            this.oneWay = !!opts.oneWay;
            this.onWallContact = opts.onWallContact || null;
            this.onFloorContact = opts.onFloorContact || null;
            this.setEndpoints(x1, y1, x2, y2);
        }
        setEndpoints(x1, y1, x2, y2) {
            const ex = x2 - x1, ey = y2 - y1, len = Math.hypot(ex, ey) || 1;
            let nx = ey / len, ny = -ex / len;
            if (nx * this.hnx + ny * this.hny < 0) { nx = -nx; ny = -ny; }
            this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
            this.nx = nx; this.ny = ny;
            this.bounds = {
                minX: Math.min(x1, x2) - 1, maxX: Math.max(x1, x2) + 1,
                minY: Math.min(y1, y2) - 1, maxY: Math.max(y1, y2) + 1,
            };
        }
        intersect(ox, oy, dx, dy, tMin, tMax) {
            if (!this.enabled) return null;
            if (dx * this.nx + dy * this.ny >= 0) return null;
            const ex = this.x2 - this.x1, ey = this.y2 - this.y1;
            const den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-12) return null;
            const wx = this.x1 - ox, wy = this.y1 - oy;
            const t = (wx * ey - wy * ex) / den;
            const u = (wx * dy - wy * dx) / den;
            if (t < tMin || t > tMax || u < -1e-6 || u > 1 + 1e-6) return null;
            return { t, x: ox + dx * t, y: oy + dy * t, nx: this.nx, ny: this.ny, surface: this };
        }
    }

    /**
     * y = f(x) built from C1-continuous analytic pieces (slopes match at every join, so the
     * surface normal is continuous everywhere — no tile seams).
     * Floor: solid below, normal (f', -1)/|.|.  Ceiling: solid above, normal (-f', 1)/|.|.
     */
    class HeightFieldSurface {
        constructor({ pieces, ceiling = false, layer = -1, name = 'field', oneWay = false, tier = 'main' }) {
            this.kind = 'height';
            this.pieces = pieces;
            this.x0 = pieces[0].x0;
            this.x1 = pieces[pieces.length - 1].x1;
            this.ceiling = ceiling;
            this.side = ceiling ? -1 : 1;
            this.layer = layer;
            this.name = name;
            this.enabled = true;
            this.oneWay = oneWay;
            this.tier = tier;
            let minY = Infinity, maxY = -Infinity;
            for (let x = this.x0; ; x += 2) {
                const xx = Math.min(x, this.x1), y = this.f(xx);
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                if (xx >= this.x1) break;
            }
            this.bounds = { minX: this.x0 - 1, maxX: this.x1 + 1, minY: minY - 2, maxY: maxY + 2 };
        }
        piece(x) {
            const p = this.pieces;
            let lo = 0, hi = p.length - 1;
            if (x <= p[0].x0) return p[0];
            if (x >= p[hi].x1) return p[hi];
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (x > p[mid].x1) lo = mid + 1; else hi = mid;
            }
            return p[lo];
        }
        f(x) { return this.piece(x).f(x); }
        df(x) { return this.piece(x).df(x); }
        normalAt(x) {
            const s = this.df(x), k = 1 / Math.sqrt(1 + s * s);
            return this.ceiling ? { x: -s * k, y: k } : { x: s * k, y: -k };
        }
        _g(ox, oy, dx, dy, t) { return this.side * ((oy + dy * t) - this.f(ox + dx * t)); } // <0 open, >=0 solid
        _hit(ox, oy, dx, dy, t) {
            const x = ox + dx * t, y = oy + dy * t, n = this.normalAt(x);
            return { t, x, y, nx: n.x, ny: n.y, surface: this };
        }
        intersect(ox, oy, dx, dy, tMin, tMax) {
            if (!this.enabled) return null;
            if (Math.abs(dx) < 1e-9) { // vertical ray: exact
                if (ox < this.x0 || ox > this.x1) return null;
                if (this.side * dy <= 0) return null;
                const t = (this.f(ox) - oy) / dy;
                return (t < tMin || t > tMax) ? null : this._hit(ox, oy, dx, dy, t);
            }
            let a = tMin, b = tMax;
            let ta = (this.x0 - ox) / dx, tb = (this.x1 - ox) / dx;
            if (ta > tb) { const s = ta; ta = tb; tb = s; }
            if (ta > a) a = ta;
            if (tb < b) b = tb;
            if (a > b) return null;
            const n = Math.max(1, Math.ceil((b - a) / 2));
            let t0 = a, g0 = this._g(ox, oy, dx, dy, a);
            for (let i = 1; i <= n; i++) {
                const t1 = a + (b - a) * (i / n);
                const g1 = this._g(ox, oy, dx, dy, t1);
                if (g0 < 0 && g1 >= 0) { // open -> solid crossing: bisect
                    let lo = t0, hi = t1;
                    for (let k = 0; k < 24; k++) {
                        const mid = 0.5 * (lo + hi);
                        if (this._g(ox, oy, dx, dy, mid) < 0) lo = mid; else hi = mid;
                    }
                    return this._hit(ox, oy, dx, dy, hi);
                }
                t0 = t1; g0 = g1;
            }
            return null;
        }
    }

    /** Interior of a circle (loop). Normal points to the centre. Range is in surface-angle degrees. */
    class ArcSurface {
        constructor({ cx, cy, r, fromDeg, toDeg: toD, layer = -1, name = 'arc' }) {
            Object.assign(this, { kind: 'arc', cx, cy, r, fromDeg, toDeg: toD, layer, name, enabled: true, oneWay: false });
            this.bounds = { minX: cx - r - 1, maxX: cx + r + 1, minY: cy - r - 1, maxY: cy + r + 1 };
        }
        contains(deg) {
            return this.fromDeg <= this.toDeg
                ? deg >= this.fromDeg && deg <= this.toDeg
                : deg >= this.fromDeg || deg <= this.toDeg;
        }
        /** World point on the circle for a given surface angle. */
        pointAt(angle) { return { x: this.cx + this.r * Math.sin(angle), y: this.cy + this.r * Math.cos(angle) }; }
        intersect(ox, oy, dx, dy, tMin, tMax) {
            if (!this.enabled) return null;
            const fx = ox - this.cx, fy = oy - this.cy;
            const b = fx * dx + fy * dy, c = fx * fx + fy * fy - this.r * this.r;
            const disc = b * b - c;
            if (disc < 0) return null;
            const s = Math.sqrt(disc);
            const roots = [-b - s, -b + s];
            for (let i = 0; i < 2; i++) {
                const t = roots[i];
                if (t < tMin || t > tMax) continue;
                const x = ox + dx * t, y = oy + dy * t;
                const nx = (this.cx - x) / this.r, ny = (this.cy - y) / this.r;
                if (dx * nx + dy * ny >= 0) continue;
                if (!this.contains(toDeg(normalToAngle(nx, ny)))) continue;
                return { t, x, y, nx, ny, surface: this };
            }
            return null;
        }
    }

    /** Builds C1-continuous height-field pieces left to right. */
    class PathBuilder {
        constructor(x, y) { this.x = x; this.y = y; this.pieces = []; }
        _push(len, f, df) {
            const x0 = this.x;
            this.pieces.push({ x0, x1: x0 + len, f, df });
            this.x = x0 + len;
            this.y = f(this.x);
            return this;
        }
        flat(len) { const y0 = this.y; return this._push(len, () => y0, () => 0); }
        /** Straight line with slope dy/dx (screen coords: positive = downhill to the right). */
        line(len, slope) {
            const x0 = this.x, y0 = this.y;
            return this._push(len, (x) => y0 + slope * (x - x0), () => slope);
        }
        /** Slope blends linearly from s0 to s1 (quadratic curve) — joins two slopes with no kink. */
        ease(len, s0, s1) {
            const x0 = this.x, y0 = this.y, k = (s1 - s0) / len;
            return this._push(len,
                (x) => { const u = x - x0; return y0 + s0 * u + 0.5 * k * u * u; },
                (x) => s0 + k * (x - x0));
        }
        /** Cosine hill (dir=+1) or dip (dir=-1) whose steepest point is exactly `deg`. */
        bump(len, deg, dir) {
            const x0 = this.x, y0 = this.y, w = TAU / len;
            const amp = len * Math.tan(deg * DEG) / Math.PI;
            return this._push(len,
                (x) => y0 - dir * amp * (1 - Math.cos(w * (x - x0))) / 2,
                (x) => -dir * amp * w * Math.sin(w * (x - x0)) / 2);
        }
        /** S-curve: y0 + amp·sin(2πt)·sin(πt) — dips then rises, zero slope at both ends. */
        sWave(len, amp) {
            const x0 = this.x, y0 = this.y;
            return this._push(len,
                (x) => { const t = (x - x0) / len; return y0 + amp * Math.sin(TAU * t) * Math.sin(Math.PI * t); },
                (x) => {
                    const t = (x - x0) / len;
                    return amp * (TAU * Math.cos(TAU * t) * Math.sin(Math.PI * t)
                        + Math.PI * Math.sin(TAU * t) * Math.cos(Math.PI * t)) / len;
                });
        }
        toSurface(opts = {}) { return new HeightFieldSurface({ pieces: this.pieces.slice(), ...opts }); }
    }

    /* ======================================================================
       PALMTREE PANIC GOOD FUTURE SPRITE ATLAS (public/assets/palmtree_objects.png)
       Exact pixel rects extracted from Paraemon's Sonic CD sheet (1:1 16-bit scale)
       ====================================================================== */
    const PALMTREE_SPRITES = Object.freeze({
        trapDoorUp:       { x: 249, y: 99,  w: 8,   h: 48 },
        trapDoorFlat:     { x: 265, y: 119, w: 48,  h: 8  },
        trapDoorDown:     { x: 321, y: 99,  w: 8,   h: 48 },
        splashBurst: [
            { x: 337, y: 99,  w: 32, h: 32 },
            { x: 377, y: 99,  w: 24, h: 24 },
            { x: 409, y: 99,  w: 16, h: 16 },
        ],
        splashPlume: [
            { x: 249, y: 203, w: 24, h: 16 },
            { x: 281, y: 187, w: 32, h: 32 },
            { x: 321, y: 187, w: 32, h: 32 },
            { x: 361, y: 171, w: 32, h: 48 },
            { x: 401, y: 155, w: 32, h: 64 },
            { x: 441, y: 203, w: 24, h: 16 },
        ],
        platformSmall:    { x: 509, y: 99,  w: 32,  h: 32 },
        platformLarge:    { x: 549, y: 99,  w: 64,  h: 32 },
        plantTall:        { x: 509, y: 168, w: 24,  h: 40 },
        plantShort:       { x: 541, y: 168, w: 24,  h: 24 },
        houdiniTrigger:   { x: 249, y: 256, w: 24,  h: 24 },
        houdiniSteps: [
            { x: 281, y: 256, w: 24, h: 24 },
            { x: 313, y: 256, w: 24, h: 24 },
            { x: 345, y: 256, w: 24, h: 24 },
            { x: 377, y: 256, w: 24, h: 24 },
        ],
        spinnerSilver:    { x: 421, y: 256, w: 32,  h: 16 },
        spinnerDark:      { x: 461, y: 256, w: 32,  h: 16 },
        swingPivot:       { x: 513, y: 256, w: 16,  h: 16 },
        swingChain:       { x: 537, y: 256, w: 16,  h: 16 },
        swingLedge:       { x: 561, y: 256, w: 48,  h: 16 },
        poleStraight:     { x: 249, y: 325, w: 32,  h: 16 },
        poleBentDown:     { x: 289, y: 321, w: 32,  h: 24 },
        poleBentUp:       { x: 329, y: 317, w: 32,  h: 32 },
        rock:             { x: 381, y: 317, w: 40,  h: 32 },
        wallCols: [
            { x: 529, y: 301, w: 16, h: 48 },
            { x: 553, y: 301, w: 16, h: 48 },
            { x: 577, y: 301, w: 16, h: 48 },
        ],
        wallShards: [
            { x: 441, y: 309, w: 16, h: 16 },
            { x: 465, y: 309, w: 16, h: 16 },
            { x: 489, y: 309, w: 16, h: 16 },
            { x: 441, y: 333, w: 16, h: 16 },
            { x: 465, y: 333, w: 16, h: 16 },
            { x: 489, y: 333, w: 16, h: 16 },
        ],
        breakFloorThin:   { x: 489, y: 386, w: 128, h: 40 },
        breakFloorThick:  { x: 489, y: 442, w: 128, h: 56 },
        breakFloorSlopeL: { x: 249, y: 386, w: 80,  h: 80 },
        breakFloorSlopeR: { x: 369, y: 506, w: 80,  h: 80 },
        breakFloorTiles: [
            { x: 361, y: 410, w: 16, h: 16 }, // grass
            { x: 361, y: 434, w: 16, h: 16 }, // yellow down-arrow dirt
            { x: 361, y: 458, w: 16, h: 16 }, // gold/brown diamond
            { x: 361, y: 482, w: 16, h: 16 }, // dark brown base triangle
        ],
        blockThing:       { x: 477, y: 535, w: 32,  h: 16 },
    });

    /* ======================================================================
       PART 2/5 — TERRAIN + COURSES (GREEN HILL TEST & PALMTREE PANIC ACT 1)
       ====================================================================== */
    class Terrain {
        constructor(stage = 'test') {
            this.stage = stage;
            this.surfaces = [];
            this.floors = [];
            this.ceilings = [];
            this.lines = [];
            this.sections = [];
            this.loops = [];
            this.tunnels = [];
            this.waterfalls = [];
            this.waterZones = [];
            this.palmTrees = [];
            this.plants = [];
            this.flowers = [];
            this.platforms = [];
            this.swingPlatforms = [];
            this.bouncePoles = [];
            this.spinners = [];
            this.houdiniGroups = [];
            this.breakableWalls = [];
            this.breakableFloors = [];
            this.trapDoors = [];
            this.rocks = [];
            this.speedBoosters = [];
            this.dashRings = [];
            this.rings = [];
            this.scatteredRings = [];
            this.enemies = [];
            this.timePosts = [];
            this.starPosts = [];
            this.monitors = [];
            this.springs = [];
            this.spikeClusters = [];
            this.bigRing = null;
            this.goalPost = null;
            this.capsule = null;
            this.boss = null;
            this.debris = [];
            this.splashes = [];
            this.popups = [];
            this.timeEra = 'good_future'; // 'good_future' | 'present' | 'past'
            this.timeWarpTarget = null;
            this.timeWarpCharge = 0;
            this.timeWarpFlash = 0;
            this.clock = 0;
            this.levelDef = Terrain.LEVELS[stage] || null;
            this.hasObjects = (stage === 'palmtree') || Boolean(this.levelDef);
            if (this.levelDef) this.buildCustomLevel(this.levelDef);
            else if (stage === 'palmtree') this.buildPalmtree();
            else this.build();
        }

        resetObjects() {
            if (this.levelDef) this.setupCustomObjects(this.levelDef);
            else if (this.stage === 'palmtree') this.setupPalmtreeObjects();
        }

        buildCustomLevel(def) {
            this.probeY = def.probeY !== undefined ? def.probeY : -400;
            this.startX = def.startX !== undefined ? def.startX : 0;
            this.endX = def.endX !== undefined ? def.endX : 4000;
            this.deathY = def.deathY !== undefined ? def.deathY : 1020;

            const builder = {
                path: (x0, y0) => new PathBuilder(x0, y0),
                addFloor: (pathOrSurf, opts = {}) => {
                    const surf = (pathOrSurf instanceof PathBuilder) ? pathOrSurf.toSurface(opts) : pathOrSurf;
                    if (!this.mainFloor && !surf.oneWay && !surf.ceiling) this.mainFloor = surf;
                    return this.add(surf);
                },
                addShelf: (pathOrSurf, opts = {}) => {
                    const merged = { oneWay: true, tier: 'mid', ...opts };
                    const surf = (pathOrSurf instanceof PathBuilder) ? pathOrSurf.toSurface(merged) : pathOrSurf;
                    return this.add(surf);
                },
                addCeiling: (pathOrSurf, opts = {}) => {
                    const merged = { ceiling: true, ...opts };
                    const surf = (pathOrSurf instanceof PathBuilder) ? pathOrSurf.toSurface(merged) : pathOrSurf;
                    return this.add(surf);
                },
                addWall: (x0, y0, x1, y1, nx, ny, name = 'wall', opts = {}) => {
                    return this.add(new LineSurface(x0, y0, x1, y1, nx, ny, -1, name, opts));
                },
                addLoop: (cx, cy, r, name = 'Loop') => this.addLoop(cx, cy, r, name),
                addTunnel: (tunnelDef) => {
                    this.tunnels.push(tunnelDef);
                    if (!this.tunnel) this.tunnel = tunnelDef;
                    return tunnelDef;
                },
            };

            if (typeof def.buildTerrain === 'function') {
                def.buildTerrain(builder, this);
            }
            if (!this.mainFloor) {
                const fallback = new PathBuilder(this.startX, 600).flat(this.endX - this.startX);
                this.mainFloor = this.add(fallback.toSurface({ name: 'starter floor' }));
            }

            // Course boundary walls
            this.add(new LineSurface(this.startX, -600, this.startX, this.deathY + 100, 1, 0, -1, 'start wall'));
            this.add(new LineSurface(this.endX, -600, this.endX, this.deathY + 100, -1, 0, -1, 'end wall'));

            const defaultStartY = this.mainFloor ? this.mainFloor.f(this.startX + 120) : 600;
            this.checkpoints = (def.checkpoints && def.checkpoints.length)
                ? def.checkpoints.map((cp) => ({ ...cp }))
                : [{ name: def.title || 'Start', x: this.startX + 120, y: defaultStartY }];
            this.spawnX = this.checkpoints[0].x;

            this.setupCustomObjects(def);
        }

        setupCustomObjects(def) {
            this.surfaces = this.surfaces.filter((s) => !s.dynamicObject);
            this.lines = this.lines.filter((s) => !s.dynamicObject);
            const addObjSurface = (s) => { s.dynamicObject = true; return this.add(s); };

            this.debris = [];
            this.splashes = [];
            this.popups = [];
            this.scatteredRings = [];
            this.activeCheckpoint = null;
            this.clock = 0;

            const src = (typeof def.objects === 'function' ? def.objects(this) : def.objects) || {};

            // Moving platforms
            this.platforms = (src.platforms || []).map((d) => {
                const w = d.w || (d.large ? 64 : 48), h = d.h || 24;
                const surf = addObjSurface(new LineSurface(d.x - w / 2, d.y, d.x + w / 2, d.y, 0, -1, -1, 'platform', { oneWay: true }));
                const obj = {
                    ampX: 0, ampY: 0, speed: 0.035, phase: 0,
                    ...d, baseX: d.x, baseY: d.y, w, h, dx: 0, dy: 0, surface: surf,
                };
                surf.ownerPlatform = obj;
                return obj;
            });

            this.swingPlatforms = [];
            this.bouncePoles = (src.bouncePoles || []).map((d) => ({ dir: 1, power: -11.5, ...d, state: 'straight', timer: 0 }));
            this.spinners = (src.spinners || []).map((d) => ({ variant: 'silver', ...d, cooldown: 0, spinTimer: 0 }));
            this.houdiniGroups = [];
            this.breakableWalls = [];
            this.breakableFloors = [];
            this.trapDoors = [];
            this.rocks = [];
            this.speedBoosters = (src.speedBoosters || []).map((d) => ({ boost: 11.5, ...d, cooldown: 0 }));
            this.dashRings = (src.dashRings || []).map((d) => ({
                x: d.x, y: d.y,
                angleDeg: d.angleDeg !== undefined ? d.angleDeg : 0,
                boost: d.boost !== undefined ? d.boost : 12.6,
                color: d.color || 'starlight',
                cooldown: 0,
                flash: 0,
            }));
            this.waterZones = (src.waterZones || []).map((d) => ({ x0: d.x0, x1: d.x1, y: d.y }));
            this.timePosts = (src.timePosts || []).map((d) => ({ spin: 0, active: false, ...d }));

            // Common Sonic Foundation Objects (TV Monitors, Checkpoint Star Posts, Springs, Spikes, Big Ring, Goal Post)
            this.starPosts = (src.starPosts || []).map((d) => ({ x: d.x, y: d.y, active: false, spinTimer: 0 }));
            this.monitors = (src.monitors || []).map((d) => ({ x: d.x, y: d.y, item: d.item || 'rings', broken: false }));
            this.springs = (src.springs || []).map((d) => ({
                x: d.x, y: d.y,
                color: d.color || 'yellow',
                power: d.power !== undefined ? d.power : (d.color === 'red' ? -13.5 : -10.8),
                timer: 0,
            }));
            this.spikeClusters = (src.spikeClusters || []).map((d) => ({ x: d.x, y: d.y }));
            this.bigRing = src.bigRing ? { x: src.bigRing.x, y: src.bigRing.y, collected: false, flashTimer: 0 } : null;
            this.goalPost = (src.goalPost !== null && !def.isBossAct) || (src.goalPost && typeof src.goalPost === 'object')
                ? {
                    x: src.goalPost ? src.goalPost.x : (this.endX - 250),
                    y: src.goalPost ? src.goalPost.y : (this.mainFloor ? this.mainFloor.f(this.endX - 250) : 600),
                    spinning: false, cleared: false, spinTimer: 0, angle: 0,
                }
                : null;

            // Optional Animal Capsule (used in Act 3 Boss Acts to finish the Zone after boss defeat)
            if (src.capsule) {
                const cx = src.capsule.x, cy = src.capsule.y;
                const topSurf = addObjSurface(new LineSurface(cx - 28, cy - 60, cx + 28, cy - 60, 0, -1, -1, 'capsule top', { oneWay: true }));
                const leftSurf = addObjSurface(new LineSurface(cx - 30, cy - 60, cx - 30, cy, -1, 0, -1, 'capsule L'));
                const rightSurf = addObjSurface(new LineSurface(cx + 30, cy - 60, cx + 30, cy, 1, 0, -1, 'capsule R'));
                this.capsule = {
                    x: cx, y: cy,
                    lockedUntilBoss: src.capsule.lockedUntilBoss !== undefined ? !!src.capsule.lockedUntilBoss : false,
                    opened: false, cleared: false, openTimer: 0,
                    topSurf, leftSurf, rightSurf,
                };
            } else {
                this.capsule = null;
            }

            // Rings (individual coordinates + convenience line/surface/loop helpers)
            this.rings = (src.rings || []).map((r) => ({ x: r.x, y: r.y, collected: false }));
            const ringHelpers = {
                addRing: (x, y) => this.rings.push({ x, y, collected: false }),
                addRingLine: (x0, y0, dx, dy, count) => {
                    for (let i = 0; i < count; i++) this.rings.push({ x: x0 + dx * i, y: y0 + dy * i, collected: false });
                },
                addSurfaceRings: (surf, x0, step, count, offset = 18) => {
                    const target = surf || this.mainFloor;
                    if (!target) return;
                    for (let i = 0; i < count; i++) {
                        const rx = x0 + i * step;
                        this.rings.push({ x: rx, y: target.f(rx) - offset, collected: false });
                    }
                },
                addLoopRings: (lp, n = 12) => {
                    if (!lp) return;
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * TAU;
                        this.rings.push({ x: lp.cx + (lp.r - 22) * Math.sin(a), y: lp.cy + (lp.r - 22) * Math.cos(a), collected: false });
                    }
                },
            };

            // Level-specific enemies (owner decides per level)
            this.enemies = (def.enemies || src.enemies || []).map((en) => ({
                kind: en.kind || 'crab',
                alive: true,
                vx: en.vx !== undefined ? en.vx : 1.0,
                baseX: en.baseX !== undefined ? en.baseX : en.x,
                baseY: en.baseY !== undefined ? en.baseY : en.y,
                phase: en.phase || 0,
                ...en,
            }));

            // Optional Boss state (owner decides per level)
            this.boss = (def.createBoss && typeof def.createBoss === 'function') ? def.createBoss(this) : null;

            if (typeof def.setupObjects === 'function') {
                def.setupObjects(ringHelpers, this, addObjSurface);
            }
        }

        add(s) {
            this.surfaces.push(s);
            if (s.kind === 'height') (s.ceiling ? this.ceilings : this.floors).push(s);
            else if (s.kind === 'line') this.lines.push(s);
            return s;
        }

        addLoop(cx, cy, r, name = 'loop') {
            const arc0 = this.add(new ArcSurface({ cx, cy, r, fromDeg: 0, toDeg: 190, layer: 0, name: `${name} L0` }));
            const arc1 = this.add(new ArcSurface({ cx, cy, r, fromDeg: 170, toDeg: 360, layer: 1, name: `${name} L1` }));
            const gates = { entryX: cx - r - 48, apexX: cx, exitX: cx + r + 48 };
            const lp = { cx, cy, r, arc0, arc1, gates, name };
            this.loops.push(lp);
            if (this.loops.length === 1) {
                this.loop = lp;
                this.loopArc0 = arc0;
                this.loopArc1 = arc1;
                this.gates = gates;
            }
            return lp;
        }

        /* ---------------- Original Green Hill Physics Verification Course ---------------- */
        build() {
            const T60 = Math.tan(60 * DEG);
            const Y0 = 600;
            this.probeY = Y0 - 1000;

            const p = new PathBuilder(0, Y0);
            const mark = (name) => this.sections.push({ name, x: p.x });

            // 1. Flat starting runway (spin dash testing)
            mark('Spin Dash Runway');
            p.flat(1000);

            // 2. Rolling sine-wave hills — steepest points exactly 25°, 30°, 35°, 40°, 40°
            mark('Rolling Hills ±25°–40°');
            p.bump(400, 25, +1).bump(400, 30, -1).bump(400, 35, +1).bump(400, 40, -1).bump(400, 40, +1);
            p.flat(150);

            // 3. Deep valley drop: 0° -> sustained 60° downhill -> 0°
            mark('60° Valley Drop');
            p.ease(160, 0, T60).line(100, T60).ease(160, T60, 0);
            const valleyY = p.y;
            this.valleyY = valleyY;

            // Valley floor (runs straight through under the loop)
            mark('Loop-de-Loop');
            p.flat(830); // to x = 4400

            // 4a. S-curve tunnel floor
            mark('S-Curve Tunnel');
            p.sWave(640, 70);
            p.flat(240);

            // 4b. 45° launch ramp ending at a lip over the gap
            mark('45° Launch Ramp');
            p.ease(100, 0, -1).line(70, -1);
            this.lip = { x: p.x, y: p.y };
            this.mainFloor = this.add(p.toSurface({ name: 'main floor' }));

            // Dual-layer 360° loop (bottom tangent to the valley floor)
            const R = 128, cx = 4000, cy = valleyY - R;
            this.addLoop(cx, cy, R, 'loop');

            // S-curve tunnel ceiling (64px vertical clearance) + rock block faces and roof
            const tx0 = 4360, tx1 = 5080, clearance = 64, roofY = valleyY - 230;
            const c = new PathBuilder(tx0, valleyY - clearance);
            c.flat(40).sWave(640, 70).flat(40);
            this.tunnelCeiling = this.add(c.toSurface({ ceiling: true, name: 'tunnel ceiling' }));
            this.add(new LineSurface(tx0, roofY, tx0, valleyY - clearance, -1, 0, -1, 'tunnel left face'));
            this.add(new LineSurface(tx1, roofY, tx1, valleyY - clearance, 1, 0, -1, 'tunnel right face'));
            this.add(new LineSurface(tx0, roofY, tx1, roofY, 0, -1, -1, 'tunnel roof'));
            this.tunnel = { x0: tx0, x1: tx1, roofY, ceiling: this.tunnelCeiling, floor: this.mainFloor };
            this.tunnels.push(this.tunnel);

            // Gap + landing plateau
            const gapW = 220, plateauX = this.lip.x + gapW, plateauY = valleyY, pitBottom = valleyY + 600;
            this.add(new LineSurface(this.lip.x, this.lip.y, this.lip.x, pitBottom, 1, 0, -1, 'ramp face'));
            const q = new PathBuilder(plateauX, plateauY);
            mark('Landing Plateau');
            q.flat(1000);
            this.plateau = this.add(q.toSurface({ name: 'plateau' }));
            this.add(new LineSurface(plateauX, plateauY, plateauX, pitBottom, -1, 0, -1, 'plateau face'));
            this.gap = { x0: this.lip.x, x1: plateauX };

            // Course bounds
            this.startX = 0;
            this.endX = plateauX + 1000;
            this.add(new LineSurface(0, Y0 - 800, 0, Y0, 1, 0, -1, 'start wall'));
            this.add(new LineSurface(this.endX, plateauY - 800, this.endX, plateauY, -1, 0, -1, 'end wall'));
            this.deathY = valleyY + 320;

            this.checkpoints = [
                { name: 'Runway', x: 160 },
                { name: 'Hills', x: 960 },
                { name: 'Valley Drop', x: 3080 },
                { name: 'Loop', x: 3650 },
                { name: 'S-Tunnel', x: 4300 },
                { name: 'Launch Ramp', x: 5150 },
                { name: 'Plateau', x: plateauX + 150 },
            ];
            this.spawnX = this.checkpoints[0].x;
        }

        /* ==================================================================
           PALMTREE PANIC ZONE — ACT 1 (Sonic CD)
           Multi-tiered (High / Middle / Low) level design faithfully modeled
           after Sonic CD's Palmtree Panic Act 1 map & Good Future objects.
           ================================================================== */
        buildPalmtree() {
            this.probeY = -300;
            this.valleyY = 742;

            const mark = (name, x) => this.sections.push({ name, x });

            // --------------------------------------------------------------
            // 1. CONTINUOUS LOW / BASE FLOOR (x = 0 .. 10400)
            //    In Sonic CD's Palmtree Panic Act 1, the bottom of the map is
            //    a continuous lower route with water basins, tunnels, & ramps!
            // --------------------------------------------------------------
            const base = new PathBuilder(0, 420);
            mark('1. Cliffside & Green Slide', 0);
            base.flat(460); // Starting cliff (0..460 at y=420)
            // Drop into the Under-Slide Secret Cavern (460..760: y=420 -> y=742)
            base.ease(100, 0, 1.4).line(130, 1.4).ease(70, 1.4, 0); // y = 742 at x = 760
            // Secret cavern floor + Loop #1 runway (760..2300 at y=742)
            mark('2. Loop #1 & Cavern Exit', 1640);
            base.flat(1540); // to x = 2300

            // Gentle hill into the Twin Waterfall Splash Basin (2300..3660)
            mark('3. Twin Waterfalls Canyon', 2300);
            base.bump(300, 26, +1); // 2300..2600
            base.flat(1060);        // 2600..3660 (Shallow water splash basin at y=742)

            // Undulating cavern transition & Underground Dome Hills (3660..5300)
            mark('4. Giant Dome Arch', 3900);
            base.bump(340, 28, +1); // 3660..4000
            base.bump(300, 22, -1); // 4000..4300
            base.bump(340, 26, +1).bump(320, 30, -1).bump(340, 30, +1); // 4300..5300

            // Giant U-Trench / Half-Pipe Launcher (5300..5900)
            base.sWave(600, 72); // dips to 814 then launches up at x = 5900 (y=742)

            // Lower Corkscrew Valley & Loop #2 Runway (5900..7050 at y=742)
            mark('5. Corkscrew & Loop #2', 5900);
            base.flat(1150); // hosts Loop #2 at cx = 6650

            // Rolling speed hills into Waterfall Fortress (7050..7650)
            base.bump(300, 26, +1).bump(300, 32, +1);

            // Waterfall Fortress Lower Splash Basin (7650..8750 at y=742)
            mark('6. Waterfall Fortress', 7650);
            base.flat(1100);

            // Vertical S-Chute Launch Ramp (8750..9150: climbs from y=742 to y=574)
            base.ease(140, 0, -0.64615).line(120, -0.64615).ease(140, -0.64615, 0); // Δy = -168 -> y = 574

            // Final Palmtree Colonnade & Goal Straightaway (9150..10400 at y=574)
            mark('7. Palmtree Straightaway', 9150);
            base.flat(1250);

            this.mainFloor = this.add(base.toSurface({ name: 'palmtree base floor', oneWay: false, tier: 'low' }));
            this.lip = { x: 9150, y: 574 };
            this.gap = { x0: -1000, x1: -900 }; // no bottomless pit on base floor

            // --------------------------------------------------------------
            // 2. THE GREAT GREEN SLIDE (x = 588 .. 1660, y = 420 -> 742)
            //    Bridged from x=460..588 by Breakable Floor #1!
            // --------------------------------------------------------------
            const slide = new PathBuilder(588, 420);
            slide.ease(132, 0, 0.34255).line(808, 0.34255).ease(132, 0.34255, 0); // Δy = +322 -> y = 742 at x=1660
            this.greenSlide = this.add(slide.toSurface({ name: 'great green slide', oneWay: true, tier: 'mid' }));

            // --------------------------------------------------------------
            // 3. DUAL-LAYER 360° LOOPS (#1 after Green Slide, #2 in Corkscrew Valley)
            // --------------------------------------------------------------
            this.addLoop(1950, 742 - 128, 128, 'Loop #1');
            this.addLoop(6650, 742 - 128, 128, 'Loop #2');

            // --------------------------------------------------------------
            // 4. MIDDLE ROUTE TIERS (oneWay = true, top-solid Sonic CD shelves)
            // --------------------------------------------------------------
            // Mid Tier 2A & 2B: Twin Waterfall Canyon Shelf (y = 540, split by Breakable Floor #2 at 2680..2808 & TrapDoor at 3080..3128)
            const mid2a = new PathBuilder(2220, 540).flat(460); // 2220..2680
            this.add(mid2a.toSurface({ name: 'waterfall mid shelf A', oneWay: true, tier: 'mid' }));

            const mid2b = new PathBuilder(2808, 540).flat(272); // 2808..3080
            this.add(mid2b.toSurface({ name: 'waterfall mid shelf B', oneWay: true, tier: 'mid' }));

            const mid2c = new PathBuilder(3128, 540).bump(260, 22, -1).flat(252); // 3128..3640
            this.add(mid2c.toSurface({ name: 'waterfall mid shelf C', oneWay: true, tier: 'mid' }));

            // Mid Tier 3A & 3B: Inside the Giant Hollow Dome (x = 4040..4680 and 4808..5320, y = 540)
            const mid3a = new PathBuilder(4040, 540).flat(120).sWave(520, 38); // 4040..4680
            this.add(mid3a.toSurface({ name: 'dome interior A', oneWay: true, tier: 'mid' }));

            const mid3b = new PathBuilder(4808, 540).flat(260).ease(120, 0, -0.35).ease(132, -0.35, 0); // 4808..5320 -> y=496
            this.add(mid3b.toSurface({ name: 'dome interior B', oneWay: true, tier: 'mid' }));

            // Mid Tier 4: The Corkscrew S-Curve Tunnel (x = 5940..7340, y = 490)
            const mid4 = new PathBuilder(5940, 490);
            mid4.flat(60).sWave(640, 68).flat(280); // 5940..6920 (TrapDoor #2 at 6920..6968)
            this.corkscrewFloor = this.add(mid4.toSurface({ name: 'corkscrew tunnel floor', oneWay: true, tier: 'mid' }));

            const mid4b = new PathBuilder(6968, 490).flat(212).ease(80, 0, -0.6).line(80, -0.6); // 6968..7340 launch lip
            this.add(mid4b.toSurface({ name: 'corkscrew exit ramp', oneWay: true, tier: 'mid' }));

            // Matching ceiling for the Corkscrew S-Curve Tunnel (x = 5980..6660)
            const corkCeil = new PathBuilder(5980, 490 - 66);
            corkCeil.flat(20).sWave(640, 68).flat(20);
            const ccSurf = this.add(corkCeil.toSurface({ ceiling: true, name: 'corkscrew ceiling' }));
            this.tunnel = { x0: 5980, x1: 6660, roofY: 340, ceiling: ccSurf, floor: this.corkscrewFloor };
            this.tunnels.push(this.tunnel);

            // Matching ceiling for the Final S-Chute Launch Ramp (x = 8750..9150)
            const chuteCeil = new PathBuilder(8750, 742 - 68);
            chuteCeil.ease(140, 0, -0.64615).line(120, -0.64615).ease(140, -0.64615, 0);
            const chuteSurf = this.add(chuteCeil.toSurface({ ceiling: true, name: 's-chute ceiling' }));
            this.tunnels.push({ x0: 8750, x1: 9150, roofY: 460, ceiling: chuteSurf, floor: this.mainFloor });

            // Mid Tier 5: Waterfall Fortress Ledges (x = 7640..7820, 7948..8080, 8240..8420, 8468..8720 at y = 530)
            this.add(new PathBuilder(7640, 530).flat(180).toSurface({ name: 'fortress mid A', oneWay: true, tier: 'mid' }));
            this.add(new PathBuilder(7948, 530).flat(132).toSurface({ name: 'fortress mid B', oneWay: true, tier: 'mid' }));
            this.add(new PathBuilder(8240, 530).flat(180).toSurface({ name: 'fortress mid C', oneWay: true, tier: 'mid' }));
            this.add(new PathBuilder(8468, 530).flat(252).toSurface({ name: 'fortress mid D', oneWay: true, tier: 'mid' }));

            // --------------------------------------------------------------
            // 5. HIGH ROUTE TIERS (oneWay = true, Sonic CD Speed / Skill Reward Paths)
            // --------------------------------------------------------------
            // High Tier 1: Cliffside Sky Ledge above the Great Green Slide (x = 480..1040 and 1320..1580, y = 250)
            this.add(new PathBuilder(480, 250).flat(200).bump(360, 18, +1).toSurface({ name: 'cliff sky ledge A', oneWay: true, tier: 'high' }));
            this.add(new PathBuilder(1320, 250).flat(260).toSurface({ name: 'cliff sky ledge B', oneWay: true, tier: 'high' }));

            // High Tier 2: Twin Waterfall Sky Arch (x = 2360..3780, y = 340)
            const high2 = new PathBuilder(2360, 340).bump(560, 22, +1).flat(300).bump(560, 22, +1);
            this.add(high2.toSurface({ name: 'waterfall sky arch', oneWay: true, tier: 'high' }));

            // High Tier 3: The Giant Dome Arch Crest (x = 4060..5380, rising from y=380 up to y=212 at x=4720!)
            const high3 = new PathBuilder(4060, 380).bump(1320, 28, +1);
            this.add(high3.toSurface({ name: 'giant dome arch crest', oneWay: true, tier: 'high' }));

            // High Tier 4: Upper Corkscrew Canopy & Waterfall Peaks (x = 6020..6680 and 6900..7400 and 7620..8680, y = 300)
            this.add(new PathBuilder(6020, 300).bump(660, 20, +1).toSurface({ name: 'canopy peak A', oneWay: true, tier: 'high' }));
            this.add(new PathBuilder(6900, 300).flat(500).toSurface({ name: 'canopy peak B', oneWay: true, tier: 'high' }));
            this.add(new PathBuilder(7620, 300).bump(500, 20, +1).flat(560).toSurface({ name: 'waterfall peak', oneWay: true, tier: 'high' }));

            // --------------------------------------------------------------
            // 6. SCENERY: WATERFALLS, WATER BASINS, PALM TREES & PLANTS
            // --------------------------------------------------------------
            this.waterfalls = [
                { x: 2640, w: 180, y0: 340, y1: 742 },
                { x: 3320, w: 180, y0: 340, y1: 742 },
                { x: 7780, w: 170, y0: 300, y1: 742 },
                { x: 8110, w: 140, y0: 300, y1: 742 },
                { x: 8420, w: 140, y0: 530, y1: 742 },
            ];
            this.waterZones = [
                { x0: 2600, x1: 3660, y: 742 },
                { x0: 7650, x1: 8750, y: 742 },
            ];

            // Iconic Palmtree Panic trees across all 3 tiers + the 10-tree Final Straightaway colonnade
            const treeCoords = [
                [80, 420, 1.1], [230, 420, 0.95], [410, 420, 1.05],
                [560, 250, 1.0], [960, 250, 0.9], [1460, 250, 1.0],
                [1720, 742, 1.15], [2200, 742, 1.0],
                [2300, 540, 0.95], [2560, 540, 1.05], [3260, 540, 1.0],
                [2480, 320, 0.9], [2980, 340, 1.1], [3660, 325, 0.95],
                [3820, 680, 1.0], [4220, 340, 1.0], [4520, 240, 1.15], [4720, 212, 1.2], [4920, 240, 1.1], [5200, 340, 1.0],
                [6100, 742, 1.05], [6340, 742, 0.95], [7020, 742, 1.1],
                [6160, 280, 0.95], [7120, 300, 1.05], [7700, 530, 1.0], [8620, 530, 0.95],
                // Final Straightaway Colonnade (matching the right side of the Sonic CD map!)
                [9220, 574, 1.15], [9330, 574, 1.0], [9440, 574, 1.15], [9550, 574, 1.0],
                [9660, 574, 1.15], [9770, 574, 1.0], [9880, 574, 1.15], [10040, 574, 1.1],
                [10160, 574, 1.0], [10280, 574, 1.15],
            ];
            this.palmTrees = treeCoords.map(([x, y, scale]) => ({ x, y, scale }));

            // Good Future Plants from the sprite sheet (plantTall & plantShort)
            const plantX = [120, 190, 340, 620, 880, 1420, 1760, 2260, 2480, 2880, 3200, 3560, 4160, 4460, 4760, 5120, 6040, 6280, 7080, 7720, 8320, 9275, 9385, 9495, 9605, 9715, 9825, 10100];
            this.plants = plantX.map((x, i) => {
                let y = this.mainFloor.f(x);
                if (x >= 2240 && x <= 3600 && i % 2 === 0) y = 540;
                if (x >= 520 && x <= 1000 && i % 2 === 1) y = 250;
                return { x, y, tall: i % 2 === 0 };
            });

            // Course bounds
            this.startX = 0;
            this.endX = 10400;
            this.add(new LineSurface(0, -400, 0, 900, 1, 0, -1, 'start wall'));
            this.add(new LineSurface(this.endX, -400, this.endX, 900, -1, 0, -1, 'end wall'));
            this.deathY = 1020;

            this.checkpoints = [
                { name: 'Cliff & Slide', x: 160, y: 420 },
                { name: 'Loop #1', x: 1680, y: 742 },
                { name: 'Twin Waterfalls', x: 2300, y: 540 },
                { name: 'Giant Dome Arch', x: 3920, y: 700 },
                { name: 'Corkscrew & Loop #2', x: 5950, y: 742 },
                { name: 'Waterfall Fortress', x: 7680, y: 530 },
                { name: 'Palmtree Finale', x: 9200, y: 574 },
            ];
            this.spawnX = this.checkpoints[0].x;

            // Populate all interactive Good Future Objects, Rings, Badniks, Time Posts & Goal Signpost
            this.setupPalmtreeObjects();
        }

        /** Create / reset all dynamic Sonic CD Palmtree Panic objects and their collision surfaces. */
        setupPalmtreeObjects() {
            // Remove any previous dynamic object surfaces before rebuilding
            this.surfaces = this.surfaces.filter((s) => !s.dynamicObject);
            this.lines = this.lines.filter((s) => !s.dynamicObject);

            const addObjSurface = (s) => {
                s.dynamicObject = true;
                return this.add(s);
            };

            this.debris = [];
            this.splashes = [];
            this.popups = [];
            this.scatteredRings = [];
            this.clock = 0;

            // 1. FLOATING & MOVING PLATFORMS (platformSmall 32x32, platformLarge 64x32)
            const platDefs = [
                { x: 1120, y: 250, large: true,  ampX: 50, ampY: 0,  speed: 0.035, phase: 0 },
                { x: 1240, y: 250, large: false, ampX: 0,  ampY: 28, speed: 0.04,  phase: 1.2 },
                { x: 2150, y: 630, large: true,  ampX: 0,  ampY: 45, speed: 0.035, phase: 0.5 },
                { x: 2740, y: 310, large: true,  ampX: 60, ampY: 0,  speed: 0.03,  phase: 0 },
                { x: 3420, y: 310, large: true,  ampX: 60, ampY: 0,  speed: 0.03,  phase: 3.14 },
                { x: 3960, y: 615, large: true,  ampX: 0,  ampY: 40, speed: 0.04,  phase: 0 },
                { x: 4460, y: 440, large: false, ampX: 45, ampY: 0,  speed: 0.04,  phase: 0.8 },
                { x: 5580, y: 600, large: true,  ampX: 65, ampY: 0,  speed: 0.035, phase: 0 },
                { x: 7480, y: 410, large: true,  ampX: 0,  ampY: 50, speed: 0.035, phase: 1.5 },
            ];
            this.platforms = platDefs.map((d) => {
                const w = d.large ? 64 : 32, h = 32;
                const surf = addObjSurface(new LineSurface(d.x - w / 2, d.y, d.x + w / 2, d.y, 0, -1, -1, 'platform', { oneWay: true }));
                const obj = { ...d, baseX: d.x, baseY: d.y, w, h, dx: 0, dy: 0, surface: surf };
                surf.ownerPlatform = obj;
                return obj;
            });

            // 2. SWINGING PLATFORMS (swingPivot 16x16, swingChain 16x16, swingLedge 48x16)
            const swingDefs = [
                { pivotX: 2744, pivotY: 600, len: 76, maxAngle: 0.85, speed: 0.035, phase: 0 },
                { pivotX: 3440, pivotY: 600, len: 76, maxAngle: 0.85, speed: 0.035, phase: 1.6 },
                { pivotX: 6790, pivotY: 225, len: 72, maxAngle: 0.80, speed: 0.04,  phase: 0.7 },
                { pivotX: 8160, pivotY: 445, len: 76, maxAngle: 0.85, speed: 0.038, phase: 2.1 },
            ];
            this.swingPlatforms = swingDefs.map((d) => {
                const x = d.pivotX, y = d.pivotY + d.len;
                const surf = addObjSurface(new LineSurface(x - 24, y - 6, x + 24, y - 6, 0, -1, -1, 'swing platform', { oneWay: true }));
                const obj = { ...d, x, y, angle: 0, dx: 0, dy: 0, surface: surf };
                surf.ownerPlatform = obj;
                return obj;
            });

            // 3. BOUNCE POLES (poleStraight, poleBentDown, poleBentUp — 32px springy poles)
            const poleDefs = [
                { x: 295,  y: 372, dir: 1,  power: -11.5 }, // Jump onto it to launch to High Tier 1!
                { x: 2180, y: 724, dir: 1,  power: -11.8 }, // Launches from Loop #1 exit to Mid Tier 2
                { x: 2290, y: 500, dir: 1,  power: -11.8 }, // Jump onto it from Mid Tier 2 to High Tier 2
                { x: 3720, y: 724, dir: -1, power: -11.5 }, // Launches out of Waterfall Basin
                { x: 3980, y: 522, dir: 1,  power: -11.5 }, // Launches up to Giant Dome Arch
                { x: 5900, y: 700, dir: 1,  power: -12.2 }, // Jump to launch from U-Trench to Corkscrew / High Tier 4
                { x: 5980, y: 472, dir: 1,  power: -11.8 }, // Launches from Corkscrew to High Tier 4
                { x: 7610, y: 724, dir: 1,  power: -12.0 }, // Launches up to Waterfall Fortress
                { x: 8680, y: 724, dir: -1, power: -12.0 }, // Launches out of Fortress Basin
            ];
            this.bouncePoles = poleDefs.map((d) => ({ ...d, state: 'straight', timer: 0 }));

            // 4. SPINNERS (spinnerSilver & spinnerDark pinball bumpers)
            const spinnerDefs = [
                { x: 1620, y: 360, variant: 'silver' },
                { x: 2940, y: 485, variant: 'silver' },
                { x: 3010, y: 455, variant: 'dark'   },
                { x: 4420, y: 480, variant: 'silver' },
                { x: 4510, y: 450, variant: 'dark'   },
                { x: 5600, y: 510, variant: 'silver' },
                { x: 7420, y: 350, variant: 'dark'   },
                { x: 8360, y: 470, variant: 'silver' },
            ];
            this.spinners = spinnerDefs.map((d) => ({ ...d, cooldown: 0, spinTimer: 0 }));

            // 5. HOUDINI STEPS (houdiniTrigger 24x24 + 4 sparkling step platforms)
            const houdiniDefs = [
                {
                    triggerX: 355, triggerY: 408,
                    steps: [
                        { x: 385, y: 378 }, { x: 415, y: 346 }, { x: 445, y: 314 }, { x: 472, y: 282 },
                    ],
                },
                {
                    triggerX: 3880, triggerY: 660,
                    steps: [
                        { x: 3915, y: 630 }, { x: 3950, y: 598 }, { x: 3985, y: 568 }, { x: 4020, y: 542 },
                    ],
                },
                {
                    triggerX: 7310, triggerY: 425,
                    steps: [
                        { x: 7350, y: 396 }, { x: 7390, y: 366 }, { x: 7430, y: 336 }, { x: 7470, y: 308 },
                    ],
                },
            ];
            this.houdiniGroups = houdiniDefs.map((g) => {
                const steps = g.steps.map((st, idx) => {
                    const surf = addObjSurface(new LineSurface(st.x - 12, st.y - 12, st.x + 12, st.y - 12, 0, -1, -1, 'houdini step', { oneWay: true }));
                    surf.enabled = true; // Active in Good Future; sparkles when triggered!
                    return { ...st, idx, active: true, animTimer: idx * 8, surface: surf };
                });
                return { triggerX: g.triggerX, triggerY: g.triggerY, triggered: false, steps };
            });

            // 6. BREAKABLE WALLS (3 columns x 16x48 = 48x48 golden triangle walls)
            const wallDefs = [
                { x: 880,  y: 742 }, // In the Under-Slide Secret Cavern
                { x: 3420, y: 540 }, // On Mid Tier 2C
                { x: 4120, y: 540 }, // Entrance to the Giant Hollow Dome
                { x: 6960, y: 742 }, // After Loop #2
                { x: 8600, y: 530 }, // On Waterfall Fortress Mid Tier
            ];
            this.breakableWalls = wallDefs.map((d) => {
                const w = 48, h = 48;
                const wall = { x: d.x, y: d.y, w, h, broken: false, leftSurf: null, rightSurf: null, topSurf: null };
                const tryBreak = (player) => {
                    if (wall.broken) return true;
                    const speed = Math.abs(player.grounded ? player.gsp : player.xsp);
                    if (player.curled || speed >= 3.5) {
                        this.shatterWall(wall, player);
                        return true;
                    }
                    return false;
                };
                wall.leftSurf = addObjSurface(new LineSurface(d.x - w / 2, d.y - h, d.x - w / 2, d.y, -1, 0, -1, 'breakable wall L', { onWallContact: tryBreak }));
                wall.rightSurf = addObjSurface(new LineSurface(d.x + w / 2, d.y - h, d.x + w / 2, d.y, 1, 0, -1, 'breakable wall R', { onWallContact: tryBreak }));
                wall.topSurf = addObjSurface(new LineSurface(d.x - w / 2, d.y - h, d.x + w / 2, d.y - h, 0, -1, -1, 'breakable wall top', { oneWay: true }));
                return wall;
            });

            // 7. BREAKABLE FLOORS (128x40 thin & 128x56 thick grass/arrow/triangle bridges)
            const floorDefs = [
                { x: 460,  y: 420, w: 128, h: 40, kind: 'thin'  }, // Bridges Cliff Start -> Great Green Slide (over Secret Cavern)
                { x: 2680, y: 540, w: 128, h: 56, kind: 'thick' }, // Bridges Mid Tier 2 over Waterfall #1
                { x: 4680, y: 540, w: 128, h: 40, kind: 'thin'  }, // Inside Giant Hollow Dome
                { x: 7820, y: 530, w: 128, h: 56, kind: 'thick' }, // Over Waterfall Fortress chasm
            ];
            this.breakableFloors = floorDefs.map((d) => {
                const bf = { ...d, broken: false, stepping: false, timer: 0, respawnTimer: 0, surface: null };
                bf.surface = addObjSurface(new LineSurface(d.x, d.y, d.x + d.w, d.y, 0, -1, -1, 'breakable floor', {
                    oneWay: true,
                    onFloorContact: (player, fromAir) => {
                        if (bf.broken) return;
                        bf.stepping = true;
                        // Stomping from a jump/roll breaks faster; running fast across lets you clear it before it drops!
                        if (fromAir && player.curled && player.ysp > 4.5) bf.timer += 10;
                    },
                }));
                bf.surface.ownerBreakFloor = bf;
                return bf;
            });

            // 8. TRAP DOORS (48x8 mechanical bridge bars that hinge open/closed)
            const trapDefs = [
                { x: 3080, y: 540, w: 48, period: 210, openDuration: 75, phase: 0   },
                { x: 6920, y: 490, w: 48, period: 210, openDuration: 75, phase: 70  },
                { x: 8420, y: 530, w: 48, period: 210, openDuration: 75, phase: 140 },
            ];
            this.trapDoors = trapDefs.map((d) => {
                const surf = addObjSurface(new LineSurface(d.x, d.y, d.x + d.w, d.y, 0, -1, -1, 'trap door', { oneWay: true }));
                return { ...d, isOpen: false, warn: false, surface: surf };
            });

            // 9. ROCKS (40x32 boulders — steppable on top, smashable from the side when curled/fast)
            const rockDefs = [
                { x: 1180, y: 742 },
                { x: 3180, y: 742 },
                { x: 4980, y: 720 },
                { x: 7220, y: 730 },
            ];
            this.rocks = rockDefs.map((d) => {
                const w = 40, h = 32;
                const rk = { x: d.x, y: d.y, w, h, broken: false, topSurf: null, leftSurf: null, rightSurf: null };
                const trySmash = (player) => {
                    if (rk.broken) return true;
                    const speed = Math.abs(player.grounded ? player.gsp : player.xsp);
                    if (player.curled || speed >= 4.0) {
                        this.shatterRock(rk, player);
                        return true;
                    }
                    return false;
                };
                rk.topSurf = addObjSurface(new LineSurface(d.x - w / 2, d.y - h, d.x + w / 2, d.y - h, 0, -1, -1, 'rock top', { oneWay: true }));
                rk.leftSurf = addObjSurface(new LineSurface(d.x - w / 2, d.y - h, d.x - w / 2, d.y, -1, 0, -1, 'rock L', { onWallContact: trySmash }));
                rk.rightSurf = addObjSurface(new LineSurface(d.x + w / 2, d.y - h, d.x + w / 2, d.y, 1, 0, -1, 'rock R', { onWallContact: trySmash }));
                return rk;
            });

            // 10. SPEED BOOSTERS (classic Sonic CD ground boosters before loops & giant climbs)
            this.speedBoosters = [
                { x: 1690, y: 742, boost: 11.8, cooldown: 0 }, // Before Loop #1
                { x: 4090, y: 380, boost: 11.0, cooldown: 0 }, // Before Giant Dome Arch Crest
                { x: 6390, y: 742, boost: 11.8, cooldown: 0 }, // Before Loop #2
                { x: 8730, y: 742, boost: 12.2, cooldown: 0 }, // Before S-Chute Launch Ramp
                { x: 9240, y: 574, boost: 12.5, cooldown: 0 }, // Final Straightaway sprint
            ];

            // 11. TIME POSTS, CHECKPOINT STAR POSTS, SPRINGS, MONITORS, SPIKES, GIANT RING & GOAL SIGNPOST
            this.timePosts = [
                { x: 420,  y: 420, kind: 'FUTURE', spin: 0, active: false },
                { x: 2420, y: 540, kind: 'PAST',   spin: 0, active: false },
                { x: 3060, y: 340, kind: 'FUTURE', spin: 0, active: false },
                { x: 6220, y: 742, kind: 'FUTURE', spin: 0, active: false },
            ];
            this.starPosts = [
                { x: 1680, y: 742, active: false, spinTimer: 0 },
                { x: 2300, y: 540, active: false, spinTimer: 0 },
                { x: 3920, y: 700, active: false, spinTimer: 0 },
                { x: 5950, y: 742, active: false, spinTimer: 0 },
                { x: 7680, y: 530, active: false, spinTimer: 0 },
                { x: 9200, y: 574, active: false, spinTimer: 0 },
            ];
            this.activeCheckpoint = null;
            this.monitors = [
                { x: 205,  y: 420, item: 'shield', broken: false },
                { x: 640,  y: 250, item: 'rings',  broken: false },
                { x: 1480, y: 250, item: '1up',    broken: false },
                { x: 1580, y: 742, item: 'shoes',  broken: false },
                { x: 2460, y: 540, item: 'shield', broken: false },
                { x: 3240, y: 340, item: 'invinc', broken: false },
                { x: 4120, y: 540, item: 'rings',  broken: false },
                { x: 4720, y: 212, item: 'invinc', broken: false },
                { x: 6140, y: 742, item: 'shield', broken: false },
                { x: 7060, y: 300, item: 'rings',  broken: false },
                { x: 8300, y: 530, item: 'shoes',  broken: false },
                { x: 8580, y: 530, item: '1up',    broken: false },
                { x: 9360, y: 574, item: 'rings',  broken: false },
            ];
            this.springs = [
                { x: 1080, y: 742, color: 'red',    power: -13.5, timer: 0 },
                { x: 2245, y: 540, color: 'red',    power: -13.2, timer: 0 },
                { x: 4055, y: 540, color: 'yellow', power: -11.0, timer: 0 },
                { x: 5960, y: 490, color: 'red',    power: -13.2, timer: 0 },
                { x: 7655, y: 530, color: 'red',    power: -13.5, timer: 0 },
            ];
            this.spikeClusters = [
                { x: 840,  y: 250 },
                { x: 2860, y: 540 },
                { x: 4480, y: 540 },
                { x: 8050, y: 530 },
            ];
            this.bigRing = { x: 9830, y: 536, collected: false, flashTimer: 0 };
            this.goalPost = { x: 9950, y: 574, spinning: false, cleared: false, spinTimer: 0, angle: 0 };

            // 12. BADNIKS (Varied Badnik roster: Motobug, Crabmeat, Buzz Bomber, Spikes, Caterkiller, Burrobot, Batbrain, Chopper)
            this.enemies = [
                { kind: 'crab', type: 'motobug',     x: 260,  y: 420, minX: 210,  maxX: 330,  vx: 1.1, alive: true },
                { kind: 'buzz', type: 'buzz',        x: 360,  y: 310, baseX: 360,  baseY: 310, phase: 0.4, alive: true },
                { kind: 'crab', type: 'spikes',      x: 740,  y: 250, minX: 580,  maxX: 920,  vx: 1.0, alive: true },
                { kind: 'buzz', type: 'batbrain',    x: 980,  y: 340, baseX: 980,  baseY: 340, phase: 1.1, alive: true },
                { kind: 'crab', type: 'crab',        x: 1360, y: 742, minX: 1240, maxX: 1520, vx: 1.1, alive: true },
                { kind: 'buzz', type: 'buzz',        x: 1820, y: 310, baseX: 1820, baseY: 310, phase: 0,   alive: true },
                { kind: 'crab', type: 'caterkiller', x: 2520, y: 540, minX: 2380, maxX: 2640, vx: 1.2, alive: true },
                { kind: 'buzz', type: 'chopper',     x: 2730, y: 630, baseX: 2730, baseY: 630, phase: 0.3, alive: true },
                { kind: 'crab', type: 'burrobot',    x: 2940, y: 540, minX: 2825, maxX: 3060, vx: 1.15, alive: true },
                { kind: 'buzz', type: 'batbrain',    x: 3100, y: 260, baseX: 3100, baseY: 260, phase: 1.5, alive: true },
                { kind: 'crab', type: 'motobug',     x: 3500, y: 742, minX: 3320, maxX: 3620, vx: 1.2, alive: true },
                { kind: 'crab', type: 'spikes',      x: 4320, y: 540, minX: 4160, maxX: 4520, vx: 1.1, alive: true },
                { kind: 'crab', type: 'burrobot',    x: 4560, y: 710, minX: 4400, maxX: 4720, vx: 1.3, alive: true },
                { kind: 'buzz', type: 'buzz',        x: 4720, y: 150, baseX: 4720, baseY: 150, phase: 0.7, alive: true },
                { kind: 'crab', type: 'caterkiller', x: 6200, y: 742, minX: 6040, maxX: 6340, vx: 1.2, alive: true },
                { kind: 'buzz', type: 'batbrain',    x: 7140, y: 230, baseX: 7140, baseY: 230, phase: 2.2, alive: true },
                { kind: 'buzz', type: 'chopper',     x: 7860, y: 620, baseX: 7860, baseY: 620, phase: 1.4, alive: true },
                { kind: 'crab', type: 'crab',        x: 8010, y: 530, minX: 7960, maxX: 8070, vx: 0.9, alive: true },
                { kind: 'crab', type: 'spikes',      x: 8560, y: 742, minX: 8380, maxX: 8660, vx: 1.3, alive: true },
            ];

            // 13. RINGS — Generous Sonic CD ring arcs across High, Mid, and Low routes + inside both Loops!
            this.rings = [];
            const addRingLine = (x0, y0, dx, dy, count) => {
                for (let i = 0; i < count; i++) this.rings.push({ x: x0 + dx * i, y: y0 + dy * i, collected: false });
            };
            const addSurfaceRings = (surf, x0, step, count, offset = 18) => {
                for (let i = 0; i < count; i++) {
                    const rx = x0 + i * step;
                    this.rings.push({ x: rx, y: surf.f(rx) - offset, collected: false });
                }
            };
            const addLoopRings = (lp, n = 10) => {
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * TAU;
                    this.rings.push({ x: lp.cx + (lp.r - 22) * Math.sin(a), y: lp.cy + (lp.r - 22) * Math.cos(a), collected: false });
                }
            };

            // Start cliff & Great Green Slide rings
            addRingLine(200, 396, 32, 0, 5);
            addSurfaceRings(this.greenSlide, 680, 48, 16, 20);
            // High Tier 1 jackpot rings
            addRingLine(540, 224, 34, 0, 8);
            addRingLine(1350, 224, 34, 0, 6);
            // Secret cavern rings
            addRingLine(960, 718, 34, 0, 6);
            // Loop #1 rings
            addLoopRings(this.loops[0], 12);
            // Section 2: Low, Mid, and High Waterfall Canyon rings
            addRingLine(2340, 514, 36, 0, 6);
            addRingLine(2840, 514, 36, 0, 5);
            addRingLine(2780, 714, 42, 0, 8);
            for (let i = 0; i < 12; i++) {
                const rx = 2480 + i * 95;
                this.rings.push({ x: rx, y: 310 - Math.sin((i / 11) * Math.PI) * 35, collected: false });
            }
            // Section 3: Giant Dome Arch Crest + Hollow Dome Interior + Low Cavern
            for (let i = 0; i < 16; i++) {
                const rx = 4140 + i * 75;
                const t = (rx - 4060) / 1320;
                const archY = 380 - 168 * (1 - Math.cos(TAU * t)) / 2;
                this.rings.push({ x: rx, y: archY - 22, collected: false });
            }
            addRingLine(4200, 512, 42, 0, 8);
            addSurfaceRings(this.mainFloor, 4380, 65, 12, 20);
            // Section 4: Corkscrew Tunnel & Loop #2
            addSurfaceRings(this.corkscrewFloor, 6020, 50, 12, 20);
            addLoopRings(this.loops[1], 12);
            addRingLine(6960, 272, 36, 0, 8);
            // Section 5: Waterfall Fortress
            addRingLine(7670, 504, 34, 0, 4);
            addRingLine(8260, 504, 34, 0, 4);
            addRingLine(7780, 270, 45, 0, 10);
            addSurfaceRings(this.mainFloor, 8780, 42, 8, 22);
            // Section 6: Final Palmtree Straightaway celebration rings
            addRingLine(9280, 548, 36, 0, 16);
        }

        shatterWall(wall, player) {
            if (wall.broken) return;
            wall.broken = true;
            wall.leftSurf.enabled = false;
            wall.rightSurf.enabled = false;
            wall.topSurf.enabled = false;
            if (player) {
                player.score = (player.score || 0) + 100;
                player.emit('breakWall', wall);
            }
            this.popups.push({ x: wall.x, y: wall.y - 36, text: '+100', life: 40 });
            const dir = player && (player.grounded ? player.gsp : player.xsp) < 0 ? -1 : 1;
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    this.debris.push({
                        kind: 'wallShard',
                        shardIdx: (row + col) % PALMTREE_SPRITES.wallShards.length,
                        x: wall.x - 16 + col * 16,
                        y: wall.y - 40 + row * 16,
                        vx: dir * (2.5 + col * 1.2 + Math.random() * 1.5),
                        vy: -3.5 - (2 - row) * 1.4 - Math.random() * 1.5,
                        rot: 0,
                        vrot: (Math.random() - 0.5) * 0.25,
                        life: 55,
                    });
                }
            }
        }

        shatterRock(rk, player) {
            if (rk.broken) return;
            rk.broken = true;
            rk.topSurf.enabled = false;
            rk.leftSurf.enabled = false;
            rk.rightSurf.enabled = false;
            if (player) {
                player.score = (player.score || 0) + 100;
                player.emit('breakRock', rk);
            }
            this.popups.push({ x: rk.x, y: rk.y - 28, text: '+100', life: 40 });
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI - Math.PI;
                this.debris.push({
                    kind: 'rockChunk',
                    x: rk.x + (i % 3 - 1) * 10,
                    y: rk.y - 16,
                    vx: Math.cos(a) * (2.5 + Math.random() * 2),
                    vy: -3.5 - Math.random() * 3,
                    rot: i,
                    vrot: 0.2,
                    life: 48,
                });
            }
        }

        collapseFloor(bf, player) {
            if (bf.broken) return;
            bf.broken = true;
            bf.surface.enabled = false;
            bf.respawnTimer = 300; // Respawns after 5 seconds so player can replay routes
            if (player) player.emit('breakFloor', bf);
            const cols = Math.floor(bf.w / 16);
            const rows = Math.min(4, Math.floor(bf.h / 16));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    this.debris.push({
                        kind: 'floorTile',
                        tileRow: r,
                        x: bf.x + c * 16 + 8,
                        y: bf.y + r * 16 + 8,
                        vx: (c - cols / 2) * 0.25,
                        vy: -0.5 + r * 0.4,
                        delay: Math.abs(c - cols / 2) * 2 + (rows - 1 - r) * 2,
                        life: 55,
                    });
                }
            }
        }

        spawnWaterSplash(x, y, type = 'plume') {
            this.splashes.push({ x, y, type, frame: 0, timer: 0 });
        }

        /** Step all dynamic stage & common Sonic objects for substep `h` (in 60Hz frames). */
        updateObjects(player, h) {
            if (this.stage !== 'palmtree' && !this.hasObjects) return;
            this.clock += h;

            // 1. Moving Platforms
            for (const p of this.platforms) {
                const nx = p.baseX + Math.sin(this.clock * p.speed + p.phase) * p.ampX;
                const ny = p.baseY + Math.sin(this.clock * p.speed + p.phase) * p.ampY;
                p.dx = nx - p.x;
                p.dy = ny - p.y;
                p.x = nx; p.y = ny;
                p.surface.setEndpoints(p.x - p.w / 2, p.y, p.x + p.w / 2, p.y);
                if (player.grounded && player.groundSurface === p.surface) {
                    player.x += p.dx;
                    player.y += p.dy;
                }
            }

            // 2. Swinging Pendulum Platforms
            for (const sw of this.swingPlatforms) {
                sw.angle = Math.sin(this.clock * sw.speed + sw.phase) * sw.maxAngle;
                const nx = sw.pivotX + Math.sin(sw.angle) * sw.len;
                const ny = sw.pivotY + Math.cos(sw.angle) * sw.len;
                sw.dx = nx - sw.x;
                sw.dy = ny - sw.y;
                sw.x = nx; sw.y = ny;
                sw.surface.setEndpoints(sw.x - 24, sw.y - 6, sw.x + 24, sw.y - 6);
                if (player.grounded && player.groundSurface === sw.surface) {
                    player.x += sw.dx;
                    player.y += sw.dy;
                }
            }

            // 3. Bounce Poles
            const feetY = player.y + player.radii.height;
            for (const bp of this.bouncePoles) {
                if (bp.timer > 0) {
                    bp.timer -= h;
                    if (bp.timer <= 0) bp.state = 'straight';
                    else if (bp.timer < 12) bp.state = 'up';
                }
                if (Math.abs(player.x - bp.x) <= 22 && Math.abs(feetY - bp.y) <= 18 && player.ysp >= -1.5 && bp.timer <= 10) {
                    bp.state = 'down';
                    bp.timer = 18;
                    player.y = bp.y - HITBOX.ROLL.height - 2;
                    player.ysp = bp.power;
                    player.state = STATE.AIRBORNE;
                    player.curled = true;
                    player.jumped = false;
                    player.crouching = false;
                    player.emit('bouncePole', bp);
                }
            }

            // 4. Spinners (pinball cylinder bumpers)
            for (const sp of this.spinners) {
                sp.spinTimer += h;
                if (sp.cooldown > 0) sp.cooldown -= h;
                const dx = player.x - sp.x, dy = player.y - sp.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 24 && sp.cooldown <= 0) {
                    sp.cooldown = 12;
                    let ang = Math.atan2(dy, dx);
                    if (dy <= 4) ang = Math.min(-0.35, Math.max(-Math.PI + 0.35, ang)); // upward bias
                    const spd = Math.max(8.2, Math.hypot(player.xsp, player.ysp));
                    player.xsp = Math.cos(ang) * spd;
                    player.ysp = Math.sin(ang) * spd;
                    player.state = STATE.AIRBORNE;
                    player.curled = true;
                    player.jumped = false;
                    player.score = (player.score || 0) + 100;
                    this.popups.push({ x: sp.x, y: sp.y - 20, text: '+100', life: 36 });
                    player.emit('spinner', sp);
                }
            }

            // 5. Houdini Steps (sparkle & materialize when trigger block is touched)
            for (const hg of this.houdiniGroups) {
                if (!hg.triggered && Math.abs(player.x - hg.triggerX) < 28 && Math.abs(player.y - hg.triggerY) < 34) {
                    hg.triggered = true;
                    player.emit('houdini', hg);
                }
                for (const st of hg.steps) {
                    st.animTimer += h * (hg.triggered ? 0.45 : 0.18);
                }
            }

            // 6. Breakable Floors
            for (const bf of this.breakableFloors) {
                if (bf.broken) {
                    bf.respawnTimer -= h;
                    if (bf.respawnTimer <= 0) {
                        bf.broken = false;
                        bf.stepping = false;
                        bf.timer = 0;
                        bf.surface.enabled = true;
                    }
                    continue;
                }
                if (player.grounded && player.groundSurface === bf.surface) {
                    bf.stepping = true;
                }
                if (bf.stepping) {
                    bf.timer += h;
                    if (bf.timer >= 24) {
                        this.collapseFloor(bf, player);
                    }
                }
            }

            // 7. Trap Doors (periodic open / close cycle)
            for (const td of this.trapDoors) {
                const phase = (this.clock + td.phase) % td.period;
                const openStart = td.period - td.openDuration;
                const wasOpen = td.isOpen;
                td.warn = phase >= openStart - 25 && phase < openStart;
                td.isOpen = phase >= openStart;
                td.surface.enabled = !td.isOpen;
                if (td.isOpen !== wasOpen && Math.abs(player.x - td.x) < 420) {
                    player.emit('trapDoor', td);
                }
            }

            // 8. Speed Boosters
            for (const sb of this.speedBoosters) {
                if (sb.cooldown > 0) sb.cooldown -= h;
                if (sb.cooldown <= 0 && player.grounded && Math.abs(player.x - sb.x) < 24 && Math.abs(feetY - sb.y) < 20) {
                    sb.cooldown = 24;
                    const dir = player.gsp < -0.5 ? -1 : 1;
                    if (Math.abs(player.gsp) < sb.boost) player.gsp = sb.boost * dir;
                    player.facing = dir;
                    player.xsp = player.gsp * Math.cos(player.angle);
                    player.ysp = -player.gsp * Math.sin(player.angle);
                    player.boostTrailTimer = Math.max(player.boostTrailTimer || 0, 36);
                    player.emit('boost', sb);
                }
            }

            // 8b. Starlight / Sonic Colors Aerial Dash Rings
            if (this.dashRings) {
                for (const dr of this.dashRings) {
                    if (dr.cooldown > 0) dr.cooldown = Math.max(0, dr.cooldown - h);
                    if (dr.flash > 0) dr.flash = Math.max(0, dr.flash - h);
                    if (dr.cooldown <= 0 && Math.hypot(player.x - dr.x, player.y - dr.y) < 30) {
                        dr.cooldown = 22;
                        dr.flash = 16;
                        const rad = (dr.angleDeg || 0) * DEG;
                        player.x = dr.x;
                        player.y = dr.y;
                        player.xsp = Math.cos(rad) * dr.boost;
                        player.ysp = Math.sin(rad) * dr.boost;
                        player.gsp = player.xsp;
                        player.facing = player.xsp >= 0 ? 1 : -1;
                        player.state = STATE.AIRBORNE;
                        player.jumped = false;
                        player.crouching = false;
                        player.springTwirl = true;
                        player.boostTrailTimer = Math.max(player.boostTrailTimer || 0, 42);
                        player.score = (player.score || 0) + 100;
                        this.popups.push({ x: dr.x, y: dr.y - 22, text: '+100', life: 36 });
                        player.emit('dashRing', dr);
                    }
                }
            }

            // 9. Water Basin Splashes (uses splashPlume & splashBurst sprites from sheet!)
            for (const wz of this.waterZones) {
                if (player.x >= wz.x0 && player.x <= wz.x1 && Math.abs(feetY - wz.y) <= 10) {
                    if (Math.abs(player.gsp) >= 2.5 && Math.floor(this.clock) % 8 === 0 && this.splashes.length < 16) {
                        this.spawnWaterSplash(player.x - player.facing * 8, wz.y, 'plume');
                    }
                }
            }
            for (let i = this.splashes.length - 1; i >= 0; i--) {
                const sp = this.splashes[i];
                sp.timer += h;
                const maxFrames = sp.type === 'burst' ? PALMTREE_SPRITES.splashBurst.length : PALMTREE_SPRITES.splashPlume.length;
                sp.frame = Math.floor(sp.timer / 3.5);
                if (sp.frame >= maxFrames) this.splashes.splice(i, 1);
            }

            // 10. Rings & Scattered Rings + Power-up Timers
            if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - h);
            if (player.invincTimer > 0) player.invincTimer = Math.max(0, player.invincTimer - h);
            if (player.shoesTimer > 0) player.shoesTimer = Math.max(0, player.shoesTimer - h);
            for (const r of this.rings) {
                if (!r.collected && Math.hypot(player.x - r.x, player.y - r.y) < 22) {
                    r.collected = true;
                    player.score = (player.score || 0) + 10;
                    this.debris.push({ kind: 'ringSparkle', x: r.x, y: r.y, vx: 0, vy: 0, life: 16, maxLife: 16 });
                    if (player.addRings) player.addRings(1);
                    else { player.rings = (player.rings || 0) + 1; player.emit('ring', player.rings); }
                }
            }
            for (let i = this.scatteredRings.length - 1; i >= 0; i--) {
                const sr = this.scatteredRings[i];
                sr.x += sr.vx * h;
                sr.y += sr.vy * h;
                sr.vy += 0.16 * h;
                sr.life -= h;
                const surf = this.getSurfaceAt(sr.x, sr.y - 12, 0);
                if (surf && sr.y >= surf.y - 6 && sr.vy > 0) {
                    sr.y = surf.y - 6;
                    sr.vy = -sr.vy * 0.72;
                }
                if (sr.life < 130 && player.invulnTimer < 90 && Math.hypot(player.x - sr.x, player.y - sr.y) < 22) {
                    this.debris.push({ kind: 'ringSparkle', x: sr.x, y: sr.y, vx: 0, vy: 0, life: 16, maxLife: 16 });
                    if (player.addRings) player.addRings(1);
                    else { player.rings = (player.rings || 0) + 1; player.emit('ring', player.rings); }
                    this.scatteredRings.splice(i, 1);
                    continue;
                }
                if (sr.life <= 0) this.scatteredRings.splice(i, 1);
            }

            // 11. Badniks (Level 1 + Sonic 2 Act 2 Badniks: Buzzer, Masher, Coconuts, Sping, Grounder, Crawl, Shellcracker, Slicer, Octus, Balkiry, Nebula, Chop, Asteron, Turtloid)
            for (const en of this.enemies) {
                if (!en.alive) continue;
                if (en.kind === 'crab') {
                    en.x += en.vx * h;
                    if (en.x <= en.minX) { en.x = en.minX; en.vx = Math.abs(en.vx); }
                    if (en.x >= en.maxX) { en.x = en.maxX; en.vx = -Math.abs(en.vx); }
                    const surf = this.getSurfaceAt(en.x, en.y - 24, 0);
                    if (surf && Math.abs(surf.y - en.y) < 30) en.y = surf.y;
                } else if (en.type === 'chopper' || en.type === 'masher') {
                    en.x = en.baseX;
                    const leapAmp = en.leapHeight || 82;
                    en.y = en.baseY - Math.abs(Math.sin(this.clock * 0.055 + (en.phase || 0))) * leapAmp;
                } else if (en.type === 'balkiry') {
                    const span = en.span || 95;
                    en.x = en.baseX + Math.sin(this.clock * 0.05 + (en.phase || 0)) * span;
                    en.y = en.baseY + Math.sin(this.clock * 0.09 + (en.phase || 0)) * 12;
                } else {
                    en.x = en.baseX + Math.sin(this.clock * 0.035 + en.phase) * 55;
                    en.y = en.baseY + Math.sin(this.clock * 0.07 + en.phase) * 18;
                }
                const ex = en.x, ey = en.kind === 'crab' ? en.y - 14 : en.y;
                if (Math.hypot(player.x - ex, player.y - ey) < 24) {
                    const fastBoost = (player.boostTrailTimer && player.boostTrailTimer > 0)
                        || player.onCoasterRail
                        || (player.shoesTimer && player.shoesTimer > 0 && Math.abs(player.grounded ? player.gsp : player.xsp) >= 6.5)
                        || Math.abs(player.grounded ? player.gsp : player.xsp) >= 7.5;
                    const attacking = player.curled || fastBoost || (player.invincTimer && player.invincTimer > 0) || (player.state === STATE.AIRBORNE && player.ysp > 0 && player.y < ey);
                    if (attacking) {
                        en.alive = false;
                        if (!player.grounded && player.ysp > 0) player.ysp = -Math.max(6.5, Math.abs(player.ysp));
                        player.score = (player.score || 0) + 100;
                        this.popups.push({ x: ex, y: ey - 16, text: '+100', life: 42 });
                        this.debris.push({ kind: 'explosion', x: ex, y: ey, vx: 0, vy: 0, life: 20, maxLife: 20 });
                        player.emit('enemyPop', en);
                    } else if (!player.invulnTimer || player.invulnTimer <= 0) {
                        this.hurtPlayer(player, ex);
                    }
                }
            }

            // 11b. Checkpoint Star Posts, Item Monitors, Springs, Spikes & Giant Ring
            if (this.starPosts) {
                for (const sp of this.starPosts) {
                    if (sp.spinTimer > 0) sp.spinTimer = Math.max(0, sp.spinTimer - h);
                    if (!sp.active && Math.abs(player.x - sp.x) < 24 && Math.abs(feetY - sp.y) < 56) {
                        sp.active = true;
                        sp.spinTimer = 64;
                        this.activeCheckpoint = { x: sp.x, y: sp.y };
                        player.emit('checkpoint', sp);
                    }
                }
            }
            if (this.monitors) {
                for (const m of this.monitors) {
                    if (m.broken) continue;
                    const mx = m.x, my = m.y - 15;
                    if (Math.hypot(player.x - mx, player.y - my) < 24) {
                        const fastMonitorSmash = (player.boostTrailTimer && player.boostTrailTimer > 0)
                            || Math.abs(player.grounded ? player.gsp : player.xsp) >= 8.5;
                        if (player.curled || fastMonitorSmash || (player.state === STATE.AIRBORNE && player.ysp > 0 && player.y < my)) {
                            m.broken = true;
                            if (!player.grounded && player.ysp > 0) player.ysp = -Math.max(5.5, Math.abs(player.ysp));
                            this.debris.push({ kind: 'explosion', x: mx, y: my, vx: 0, vy: 0, life: 20, maxLife: 20 });
                            this.debris.push({ kind: 'monitorIcon', item: m.item, x: mx, y: my - 4, vx: 0, vy: -1.1, life: 32, maxLife: 32 });
                            if (m.item === 'rings') {
                                player.score = (player.score || 0) + 100;
                                if (player.addRings) player.addRings(10);
                                else { player.rings = (player.rings || 0) + 10; player.emit('ring', player.rings); }
                            } else if (m.item === 'shield') {
                                player.shield = true;
                                player.score = (player.score || 0) + 100;
                            } else if (m.item === 'invinc') {
                                player.invincTimer = 900;
                                player.score = (player.score || 0) + 200;
                            } else if (m.item === 'shoes') {
                                player.shoesTimer = 900;
                                if (player.grounded && Math.abs(player.gsp) < 9.5) {
                                    player.gsp = (player.facing || 1) * 9.5;
                                }
                                player.score = (player.score || 0) + 100;
                            } else if (m.item === '1up' || m.item === 'oneUp') {
                                if (player.addLife) player.addLife();
                                else player.lives = (player.lives || 3) + 1;
                            }
                            player.emit('enemyPop', m);
                        }
                    }
                }
            }
            if (this.springs) {
                for (const sp of this.springs) {
                    if (sp.timer > 0) sp.timer = Math.max(0, sp.timer - h);
                    if (Math.abs(player.x - sp.x) < 20 && Math.abs(feetY - sp.y) < 18 && player.ysp >= -1.0 && sp.timer <= 8) {
                        sp.timer = 16;
                        player.y = sp.y - player.radii.height - 4;
                        player.ysp = sp.power;
                        player.state = STATE.AIRBORNE;
                        player.jumped = false;
                        player.crouching = false;
                        player.springTwirl = true;
                        player.emit('bouncePole', sp);
                    }
                }
            }
            if (this.spikeClusters) {
                for (const sc of this.spikeClusters) {
                    if (Math.abs(player.x - sc.x) < 18 && feetY >= sc.y - 30 && feetY <= sc.y + 4 && player.ysp >= 0) {
                        if ((!player.invulnTimer || player.invulnTimer <= 0) && (!player.invincTimer || player.invincTimer <= 0)) {
                            this.hurtPlayer(player, sc.x);
                        }
                    }
                }
            }
            if (this.bigRing) {
                const br = this.bigRing;
                if (br.flashTimer > 0) br.flashTimer = Math.max(0, br.flashTimer - h);
                if (!br.collected && Math.hypot(player.x - br.x, player.y - br.y) < 38) {
                    br.collected = true;
                    br.flashTimer = 28;
                    player.score = (player.score || 0) + 10000;
                    this.popups.push({ x: br.x, y: br.y - 28, text: '+10000', life: 60 });
                    if (player.addRings) player.addRings(50);
                    else { player.rings = (player.rings || 0) + 50; player.emit('ring', player.rings); }
                }
            }
            if (this.capsule) {
                const cap = this.capsule;
                const unlocked = !cap.lockedUntilBoss || !this.boss || this.boss.defeated;
                if (!cap.opened && unlocked) {
                    if (Math.abs(player.x - cap.x) < 26 && feetY >= cap.y - 80 && feetY <= cap.y - 54 && player.ysp >= -1.0) {
                        cap.opened = true;
                        cap.openTimer = 85;
                        player.ysp = -6.5;
                        player.state = STATE.AIRBORNE;
                        player.groundSurface = null;
                        player.jumped = false;
                        for (let k = 0; k < 4; k++) {
                            this.debris.push({
                                kind: 'explosion',
                                x: cap.x + (k - 1.5) * 16,
                                y: cap.y - 36 - (k % 2) * 16,
                                vx: 0, vy: 0, delay: k * 6, life: 20, maxLife: 20,
                            });
                        }
                        player.emit('goalPost', cap);
                    }
                }
                if (cap.opened && !cap.cleared) {
                    cap.openTimer -= h;
                    if (cap.openTimer <= 55 && cap.topSurf && cap.topSurf.enabled) {
                        cap.topSurf.enabled = false;
                        cap.leftSurf.enabled = false;
                        cap.rightSurf.enabled = false;
                    }
                    if (cap.openTimer <= 0) {
                        cap.cleared = true;
                    }
                }
            }

            // 12. Sonic CD Time Posts ('FUTURE' / 'PAST') & Time Warp mechanic
            for (const tp of this.timePosts) {
                if (tp.spin > 0) tp.spin = Math.max(0, tp.spin - h);
                if (!tp.active && Math.abs(player.x - tp.x) < 20 && Math.abs(feetY - tp.y) < 36) {
                    tp.active = true;
                    tp.spin = 75;
                    this.timeWarpTarget = tp.kind === 'FUTURE' ? 'good_future' : 'past';
                    this.timeWarpCharge = 0;
                    player.emit('timePost', tp);
                }
            }
            if (this.timeWarpTarget) {
                const spd = Math.abs(player.grounded ? player.gsp : player.xsp);
                if (spd >= 6.0) {
                    this.timeWarpCharge += h;
                    if (this.timeWarpCharge >= 90) {
                        this.timeEra = this.timeWarpTarget;
                        this.timeWarpTarget = null;
                        this.timeWarpCharge = 0;
                        this.timeWarpFlash = 35;
                        player.score = (player.score || 0) + 500;
                        this.popups.push({ x: player.x, y: player.y - 32, text: `TIME WARP: ${this.timeEra.toUpperCase().replace('_', ' ')}!`, life: 65 });
                        player.emit('timeWarp', this.timeEra);
                    }
                } else {
                    this.timeWarpCharge = Math.max(0, this.timeWarpCharge - h * 0.4);
                }
            }
            if (this.timeWarpFlash > 0) this.timeWarpFlash = Math.max(0, this.timeWarpFlash - h);

            // 13. Goal Signpost (End of Act 1 at x = 9950)
            if (this.goalPost) {
                const gp = this.goalPost;
                if (!gp.spinning && !gp.cleared && player.x >= gp.x && Math.abs(feetY - gp.y) < 120) {
                    gp.spinning = true;
                    gp.spinTimer = 110;
                    const ringBonus = (player.rings || 0) * 100;
                    player.score = (player.score || 0) + 1000 + ringBonus;
                    this.popups.push({ x: gp.x, y: gp.y - 64, text: `ACT CLEAR! +${1000 + ringBonus}`, life: 120 });
                    player.emit('goalPost', gp);
                }
                if (gp.spinning) {
                    gp.spinTimer -= h;
                    gp.angle += h * 0.45;
                    if (gp.spinTimer <= 0) {
                        gp.spinning = false;
                        gp.cleared = true;
                    }
                }
            }

            // 14. Debris & Score Popups
            for (let i = this.debris.length - 1; i >= 0; i--) {
                const d = this.debris[i];
                if (d.delay && d.delay > 0) { d.delay -= h; continue; }
                d.x += d.vx * h;
                d.y += d.vy * h;
                if (d.kind !== 'sparkle' && d.kind !== 'ringSparkle' && d.kind !== 'explosion' && d.kind !== 'monitorIcon') {
                    d.vy += 0.24 * h;
                }
                if (d.vrot) d.rot += d.vrot * h;
                d.life -= h;
                if (d.life <= 0) this.debris.splice(i, 1);
            }
            for (let i = this.popups.length - 1; i >= 0; i--) {
                const pp = this.popups[i];
                pp.y -= 0.45 * h;
                pp.life -= h;
                if (pp.life <= 0) this.popups.splice(i, 1);
            }
            if (this.levelDef && typeof this.levelDef.onUpdate === 'function') {
                this.levelDef.onUpdate(this, player, h);
            }
        }

        hurtPlayer(player, hazardX) {
            if (player.invincTimer && player.invincTimer > 0) return;
            if (player.shield) {
                player.shield = false;
                player.invulnTimer = 120;
                const dir = player.x < hazardX ? -1 : 1;
                player.state = STATE.AIRBORNE;
                player.curled = false;
                player.jumped = false;
                player.hurtPose = true;
                player.xsp = dir * 2.5;
                player.ysp = -4.2;
                player.emit('ringLoss', 0);
                return;
            }
            const rings = player.rings || 0;
            if (rings > 0) {
                const dropCount = Math.min(rings, 16);
                for (let i = 0; i < dropCount; i++) {
                    const ang = -Math.PI * 0.15 - (i / Math.max(1, dropCount - 1)) * Math.PI * 0.7;
                    const spd = (i % 2 === 0 ? 4.2 : 2.8);
                    this.scatteredRings.push({
                        x: player.x,
                        y: player.y - 6,
                        vx: Math.cos(ang) * spd,
                        vy: Math.sin(ang) * spd - 1.5,
                        life: 160,
                    });
                }
                player.rings = 0;
                player.invulnTimer = 120;
                const dir = player.x < hazardX ? -1 : 1;
                player.state = STATE.AIRBORNE;
                player.curled = false;
                player.jumped = false;
                player.hurtPose = true;
                player.xsp = dir * 2.5;
                player.ysp = -4.2;
                player.emit('ringLoss', dropCount);
            } else {
                if (player.die) player.die('GAME OVER', false);
                else if (player.loseLife) player.loseLife('GAME OVER');
                else { player.emit('death'); player.respawn(); }
            }
        }

        /** Closest surface hit along a unit ray on the given collision layer (-1 surfaces are on both). */
        raycast(ox, oy, dx, dy, maxDist, layer, tMin = 0, ignoreOneWay = false) {
            const sx = ox + dx * tMin, sy = oy + dy * tMin;
            const ex = ox + dx * maxDist, ey = oy + dy * maxDist;
            const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
            const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
            let best = null;
            for (let i = 0; i < this.surfaces.length; i++) {
                const s = this.surfaces[i];
                if (!s.enabled) continue;
                if (ignoreOneWay && s.oneWay) continue;
                if (s.layer !== -1 && s.layer !== layer) continue;
                const b = s.bounds;
                if (maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY) continue;
                const h = s.intersect(ox, oy, dx, dy, tMin, best ? best.t : maxDist);
                if (h) best = h;
            }
            if (best) best.angle = normalToAngle(best.nx, best.ny);
            return best;
        }

        /** Spec query: first solid surface at/below (x, y) on `layer`, with its continuous normal angle. */
        getSurfaceAt(x, y, layer) {
            const h = this.raycast(x, y, 0, 1, 1e5, layer);
            if (!h) return null;
            return { x: h.x, y: h.y, angle: h.angle, angleDeg: toDeg(h.angle), nx: h.nx, ny: h.ny, surface: h.surface };
        }
    }

    Terrain.LEVELS = {};
    Terrain.registerLevel = function (id, def) {
        Terrain.LEVELS[id] = { id, ...def };
        return Terrain.LEVELS[id];
    };

    /* ======================================================================
       PART 3/4 — PLAYER: 6-SENSOR RIG + STATE MACHINE
       ====================================================================== */
    class Player {
        constructor(terrain, events) {
            this.terrain = terrain;
            this.events = events || {};
            this.sensors = {};
            this.rings = 0;
            this.score = 0;
            this.lives = 3;
            this.nextLifeRings = 100;
            this.gameOver = false;
            this.gameOverReason = null;
            this.invulnTimer = 0;
            this.groundSurface = null;
            this.place(terrain.spawnX, 0, terrain.checkpoints[0] && terrain.checkpoints[0].y);
        }

        emit(name, data) { const fn = this.events[name]; if (fn) fn(data, this); }

        addRings(n = 1) {
            this.rings = (this.rings || 0) + n;
            if (!this.nextLifeRings) this.nextLifeRings = 100;
            while (this.rings >= this.nextLifeRings) {
                this.nextLifeRings += 100;
                this.addLife();
            }
            this.emit('ring', this.rings);
        }

        addLife() {
            this.lives = (this.lives !== undefined ? this.lives : 3) + 1;
            if (this.terrain && this.terrain.popups) {
                this.terrain.popups.push({ x: this.x, y: this.y - 28, text: '1UP!', life: 55 });
            }
            this.emit('oneUp', this.lives);
        }

        /**
         * Classic Sonic Death Mechanic & Physics:
         * Triggered when damaged at 0 rings (without a shield) or when falling into a gap off-screen (y > deathY).
         * Scar pops straight up (`ysp = -7.0`), locks the camera, plays his shocked -> screaming death frames,
         * and plummets off the bottom of the screen ignoring terrain collision before losing a life / respawning.
         */
        die(reason = 'GAME OVER', fromPit = false) {
            if (this.gameOver || this.state === STATE.DYING) return;
            this.state = STATE.DYING;
            this.uncurl();
            this.groundSurface = null;
            this.gsp = 0;
            this.xsp = 0;
            this.ysp = fromPit ? -7.6 : -7.0;
            if (fromPit && this.y > this.terrain.deathY) {
                this.y = this.terrain.deathY;
            }
            this.angle = 0;
            this.visualAngle = 0;
            this.mode = 0;
            this.jumped = false;
            this.crouching = false;
            this.lookingUp = false;
            this.skidding = false;
            this.springTwirl = false;
            this.hurtPose = false;
            this.onCoasterRail = false;
            this.dropDashCharging = false;
            this.dropDashCharge = 0;
            this.dropDashReady = false;
            this.boostTrailTimer = 0;
            this.shield = false;
            this.invincTimer = 0;
            this.shoesTimer = 0;
            this.invulnTimer = 0;
            this.deathTimer = 0;
            this.deathOffscreenY = null;
            this.deathReason = reason || 'GAME OVER';
            this.emit('deathStart', { reason: this.deathReason, fromPit });
        }

        stepDying(h) {
            this.deathTimer = (this.deathTimer || 0) + h;
            this.y += this.ysp * h;
            this.ysp = Math.min(this.ysp + PHYS.GRV * h, PHYS.MAX_SPEED);
            // Classic Sonic: the life is only lost once Scar has fallen completely off the bottom
            // of the (frozen) camera view. The renderer sets `deathOffscreenY`; headless sims fall
            // back to the original 68-frame timer. A hard cap guarantees the death always resolves.
            const offscreen = (this.deathOffscreenY != null)
                ? this.y > this.deathOffscreenY
                : this.deathTimer >= 68;
            if (offscreen || this.deathTimer >= 300) {
                this.deathOffscreenY = null;
                this.loseLife(this.deathReason || 'GAME OVER');
            }
        }

        loseLife(reason = 'GAME OVER') {
            if (this.gameOver) return;
            this.shield = false;
            this.invincTimer = 0;
            this.shoesTimer = 0;
            this.rings = 0;
            this.nextLifeRings = 100;
            this.deathTimer = 0;
            this.lives = Math.max(0, (this.lives !== undefined ? this.lives : 3) - 1);
            this.emit('death', { lives: this.lives, reason });
            if (this.lives <= 0) {
                this.gameOver = true;
                this.gameOverReason = reason;
                this.gsp = 0; this.xsp = 0; this.ysp = 0;
                this.emit('gameOver', reason);
            } else {
                this.respawn();
            }
        }

        get grounded() { return this.state !== STATE.AIRBORNE && this.state !== STATE.DYING; }
        get radii() { return this.curled ? HITBOX.ROLL : HITBOX.STAND; }

        /** Drop the player onto the ground at x (standing). Optional targetY probes near a specific tier. */
        place(x, layer = 0, targetY = null) {
            const probeFrom = targetY != null ? targetY - 60 : this.terrain.probeY;
            const hit = this.terrain.getSurfaceAt(x, probeFrom, layer) || this.terrain.getSurfaceAt(x, this.terrain.probeY, layer);
            this.x = x;
            this.y = hit ? hit.y - HITBOX.STAND.height : this.terrain.probeY;
            this.prevX = this.x; this.prevY = this.y;
            this.gsp = 0; this.xsp = 0; this.ysp = 0;
            this.angle = 0; this.visualAngle = 0; this.mode = 0;
            this.state = hit ? STATE.STANDING : STATE.AIRBORNE;
            this.curled = false;      // true => ROLL hitbox (rolling, spindash, jump, rolled off a ledge)
            this.jumped = false;      // true => variable jump height applies
            this.facing = 1;
            this.layer = layer;
            this.controlLock = 0;
            this.spindashRev = 0;
            this.peeloutRev = 0;
            this.lookingUp = false;
            this.crouching = false;
            this.skidding = false;
            this.dropDashCharging = false;
            this.dropDashCharge = 0;
            this.dropDashReady = false;
            this.springTwirl = false;
            this.springTwirlPhase = 0;
            this.hurtPose = false;
            this.onCoasterRail = false;
            this.boostTrailTimer = 0;
            this.deathTimer = 0;
            this.ballSpin = 0;
            this.runPhase = 0;
            this.airMotion = 'down';
            this.groundSurface = hit ? hit.surface : null;
            if (hit) this.groundSensors();
        }

        respawn() {
            if (this.terrain.activeCheckpoint) {
                const ac = this.terrain.activeCheckpoint;
                this.place(ac.x, 0, ac.y);
                this.emit('respawn', ac);
                return;
            }
            const cps = this.terrain.checkpoints;
            let cp = cps[0];
            for (const c of cps) if (c.x <= this.x) cp = c;
            this.place(cp.x, 0, cp.y);
            this.emit('respawn', cp);
        }

        /**
         * input: { left, right, up, down, jumpHeld, jumpPressed }  (jumpPressed = edge this render frame)
         * dtSeconds: real elapsed time. Scaled to 60 FPS frames and sub-stepped (each step <= 1 frame).
         */
        update(input, dtSeconds) {
            const dt60 = Math.max(0, dtSeconds) * 60;
            if (dt60 <= 0) return;
            const steps = Math.max(1, Math.ceil(dt60 - 1e-6));
            const h = dt60 / steps;
            for (let i = 0; i < steps; i++) this.step(input, h, i === 0 && !!input.jumpPressed);
        }

        step(inp, h, jumpPressed) {
            if (this.gameOver) return;
            this.prevX = this.x;
            this.prevY = this.y;
            this.skidding = false;
            if (this.state === STATE.DYING) {
                this.stepDying(h);
                return;
            }
            if (this.boostTrailTimer > 0) this.boostTrailTimer = Math.max(0, this.boostTrailTimer - h);
            if (this.terrain.updateObjects) this.terrain.updateObjects(this, h);
            if (this.state === STATE.DYING) return;
            if (this.state === STATE.SPINDASH) this.stepSpindash(inp, h, jumpPressed);
            else if (this.state === STATE.PEELOUT) this.stepPeelout(inp, h, jumpPressed);
            else if (this.state === STATE.AIRBORNE) this.stepAirborne(inp, h, jumpPressed);
            else this.stepGrounded(inp, h, jumpPressed);
            this.checkGates();
            this.updateCosmetics(h);
            if (this.y > this.terrain.deathY) { this.die('GAME OVER', true); }
        }

        /* ---------- curl / uncurl (spec §2: ±5px toward the floor normal) ---------- */
        curl() {
            if (this.curled) return;
            this.curled = true;
            this.springTwirl = false;
            this.x += Math.sin(this.angle) * PHYS.CURL_OFFSET;
            this.y += Math.cos(this.angle) * PHYS.CURL_OFFSET;
        }
        uncurl() {
            if (!this.curled) return;
            this.curled = false;
            this.x -= Math.sin(this.angle) * PHYS.CURL_OFFSET;
            this.y -= Math.cos(this.angle) * PHYS.CURL_OFFSET;
        }

        /* ---------- GROUNDED: STANDING / RUNNING / ROLLING ---------- */
        stepGrounded(inp, h, jumpPressed) {
            const P = PHYS;
            const hasShoes = !!(this.shoesTimer && this.shoesTimer > 0);
            const top = hasShoes ? P.TOP * 2 : P.TOP;
            const acc = hasShoes ? P.ACC * 2 : P.ACC;
            const frc = hasShoes ? P.FRC * 2 : P.FRC;

            // Control lock: left/right are ignored while > 0 (friction etc. still apply).
            const locked = this.controlLock > 0;
            if (locked) this.controlLock = Math.max(0, this.controlLock - h);
            const left = !locked && inp.left;
            const right = !locked && !left && inp.right;

            const rolling = this.state === STATE.ROLLING;

            // Spin Dash: grounded, |gsp| < 0.5, holding Down, pressing Jump
            if (!rolling && inp.down && jumpPressed && Math.abs(this.gsp) < P.SPINDASH_MAX_GSP) {
                this.gsp = 0; this.xsp = 0; this.ysp = 0;
                this.curl();
                this.state = STATE.SPINDASH;
                this.spindashRev = 0;
                this.crouching = false;
                this.lookingUp = false;
                this.emit('spindashRev', 0);
                this.groundSensors();
                return;
            }

            // Sonic CD Super Peel-Out: grounded, |gsp| < 0.5, holding Up, pressing Jump -> Figure-8 charge on feet!
            if (!rolling && inp.up && !inp.down && jumpPressed && Math.abs(this.gsp) < P.SPINDASH_MAX_GSP) {
                this.gsp = 0; this.xsp = 0; this.ysp = 0;
                this.uncurl();
                this.state = STATE.PEELOUT;
                this.peeloutRev = 6;
                this.crouching = false;
                this.lookingUp = false;
                this.emit('peeloutRev', this.peeloutRev);
                this.groundSensors();
                return;
            }

            // §3.1 Slope factor FIRST
            const sinA = Math.sin(this.angle);
            if (rolling) {
                const uphill = sign(this.gsp) === sign(sinA);
                this.gsp -= (uphill ? P.SLP_ROLL_UP : P.SLP_ROLL_DOWN) * sinA * h;
            } else {
                this.gsp -= P.SLP_NORMAL * sinA * h;
            }

            // §5 Jump
            if (jumpPressed) { this.jump(); return; }

            // §3.2 Input & friction
            if (rolling) {
                if (left && this.gsp > 0) this.gsp = Math.max(0, this.gsp - P.ROLL_DEC * h);
                else if (right && this.gsp < 0) this.gsp = Math.min(0, this.gsp + P.ROLL_DEC * h);
                this.gsp -= Math.min(Math.abs(this.gsp), P.ROLL_FRC * h) * sign(this.gsp);
                if (Math.abs(this.gsp) < P.UNROLL_SPEED) {
                    this.uncurl();
                    this.state = STATE.RUNNING;
                }
            } else {
                if (left) {
                    if (this.gsp > 0) {
                        this.skidding = this.gsp >= 4;
                        this.gsp -= P.DEC * h;
                        if (this.gsp <= 0) this.gsp = -P.SKID_SNAP;
                    } else if (this.gsp > -top) {
                        this.gsp = Math.max(this.gsp - acc * h, -top);
                    }
                    if (this.gsp <= 0) this.facing = -1;
                } else if (right) {
                    if (this.gsp < 0) {
                        this.skidding = this.gsp <= -4;
                        this.gsp += P.DEC * h;
                        if (this.gsp >= 0) this.gsp = P.SKID_SNAP;
                    } else if (this.gsp < top) {
                        this.gsp = Math.min(this.gsp + acc * h, top);
                    }
                    if (this.gsp >= 0) this.facing = 1;
                } else {
                    this.gsp -= Math.min(Math.abs(this.gsp), frc * h) * sign(this.gsp);
                }
                // Enter ROLLING: grounded, Down, |gsp| >= 1.0
                if (inp.down && Math.abs(this.gsp) >= P.ROLL_MIN_SPEED) {
                    this.curl();
                    this.state = STATE.ROLLING;
                    this.emit('roll');
                }
            }

            // Level 2 Coaster Rail Surge: low-friction magnetic rail tailwind on tubular coaster bridges
            this.onCoasterRail = false;
            if (this.groundSurface && this.groundSurface.coasterSpans) {
                for (let i = 0; i < this.groundSurface.coasterSpans.length; i++) {
                    const sp = this.groundSurface.coasterSpans[i];
                    if (this.x >= sp[0] && this.x <= sp[1]) {
                        this.onCoasterRail = true;
                        break;
                    }
                }
            }
            if (this.onCoasterRail && this.curled && Math.abs(this.gsp) >= 2.0 && Math.abs(this.gsp) < 10.5) {
                this.gsp += sign(this.gsp) * 0.05 * h;
                this.emit('coasterRail', this.gsp);
            } else if (this.onCoasterRail && Math.abs(this.gsp) >= P.TOP) {
                this.emit('coasterRail', this.gsp);
            }

            this.gsp = clamp(this.gsp, -P.MAX_SPEED, P.MAX_SPEED);

            // §3.3 gsp -> world velocity, then move
            this.xsp = this.gsp * Math.cos(this.angle);
            this.ysp = -this.gsp * Math.sin(this.angle);
            this.x += this.xsp * h;
            this.y += this.ysp * h;

            if (!this.groundSensors()) return; // ran off an edge

            // §6 Slip & detach
            const deg = toDeg(this.angle);
            if (Math.abs(this.gsp) < P.FALL_THRESHOLD && deg >= 46 && deg <= 314) {
                this.controlLock = P.CONTROL_LOCK_FRAMES;
                if (deg >= 70 && deg <= 290) {
                    this.becomeAirborne();
                    this.emit('detach', deg);
                    return;
                }
            }

            if (this.state !== STATE.ROLLING) this.state = this.gsp === 0 ? STATE.STANDING : STATE.RUNNING;
            this.crouching = this.state === STATE.STANDING && !!inp.down;
            this.lookingUp = this.state === STATE.STANDING && !!inp.up && !inp.down;
        }

        jump() {
            const a = this.angle;
            // Inherit any moving/swinging platform velocity
            const plat = this.groundSurface && this.groundSurface.ownerPlatform;
            const pvx = plat ? plat.dx : 0, pvy = plat ? plat.dy : 0;
            // Xsp/Ysp from gsp (§3.3), then the perpendicular impulse (§5)
            this.xsp = this.gsp * Math.cos(a) - PHYS.JMP * Math.sin(a) + pvx;
            this.ysp = -this.gsp * Math.sin(a) - PHYS.JMP * Math.cos(a) + pvy;
            this.curl(); // AIRBORNE + ROLLING hitbox (same +5px rule so the ball starts on the ground)
            this.jumped = true;
            this.crouching = false;
            this.lookingUp = false;
            this.onCoasterRail = false;
            this.dropDashCharging = false;
            this.dropDashCharge = 0;
            this.dropDashReady = false;
            this.groundSurface = null;
            this.state = STATE.AIRBORNE;
            this.emit('jump');
        }

        becomeAirborne() {
            this.state = STATE.AIRBORNE;
            this.jumped = false; // walked/rolled off or slipped: no variable-jump clamp
            this.crouching = false;
            this.lookingUp = false;
            this.onCoasterRail = false;
            this.groundSurface = null;
            this.xsp = this.gsp * Math.cos(this.angle);
            this.ysp = -this.gsp * Math.sin(this.angle);
            // Launching off a steep ski-jump ramp uncurled triggers Scar's aerial corkscrew twirl!
            if (!this.curled && this.ysp < -3.6) {
                this.springTwirl = true;
            }
        }

        /* ---------- SPINDASH (§4) ---------- */
        stepSpindash(inp, h, jumpPressed) {
            const P = PHYS;
            this.gsp = 0; this.xsp = 0; this.ysp = 0;
            if (!inp.down) { // release -> launch
                this.gsp = clamp((P.SPINDASH_BASE + Math.floor(this.spindashRev) / 2) * this.facing, -P.MAX_SPEED, P.MAX_SPEED);
                this.state = STATE.ROLLING; // already curled
                this.spindashRev = 0;
                this.xsp = this.gsp * Math.cos(this.angle);
                this.ysp = -this.gsp * Math.sin(this.angle);
                this.boostTrailTimer = Math.max(this.boostTrailTimer || 0, 28);
                this.emit('spindashRelease', Math.abs(this.gsp));
                return;
            }
            // decay every frame while holding Down: rev -= (rev / 0.125) / 256  (== rev/32 per frame)
            this.spindashRev *= Math.pow(1 - (1 / 0.125) / 256, h);
            if (jumpPressed) {
                this.spindashRev = Math.min(this.spindashRev + P.SPINDASH_REV_ADD, P.SPINDASH_REV_MAX);
                this.emit('spindashRev', this.spindashRev);
            }
            this.groundSensors();
        }

        /* ---------- SONIC CD SUPER PEEL-OUT (Up + Jump -> Figure-8 Launch on Feet!) ---------- */
        stepPeelout(inp, h, jumpPressed) {
            const P = PHYS;
            this.gsp = 0; this.xsp = 0; this.ysp = 0;
            if (!inp.up) { // release Up -> launch forward on feet in full Figure-8 Peel-Out Run!
                const chargeRatio = Math.min(1, (this.peeloutRev || 0) / 30);
                const launchSpd = 8 + chargeRatio * 4; // 8.0 .. 12.0 px/frame!
                this.gsp = clamp(launchSpd * this.facing, -P.MAX_SPEED, P.MAX_SPEED);
                this.uncurl();
                this.state = STATE.RUNNING;
                this.peeloutRev = 0;
                this.xsp = this.gsp * Math.cos(this.angle);
                this.ysp = -this.gsp * Math.sin(this.angle);
                this.boostTrailTimer = Math.max(this.boostTrailTimer || 0, 45);
                this.emit('peeloutRelease', Math.abs(this.gsp));
                return;
            }
            const prevTier = Math.floor((this.peeloutRev || 0) / 6);
            this.peeloutRev = Math.min(30, (this.peeloutRev || 0) + 0.65 * h + (jumpPressed ? 6 : 0));
            const newTier = Math.floor(this.peeloutRev / 6);
            if (jumpPressed || newTier > prevTier) {
                this.emit('peeloutRev', this.peeloutRev);
            }
            this.groundSensors();
        }

        /* ---------- AIRBORNE (§5 + Mid-Air Drop Dash) ---------- */
        stepAirborne(inp, h, jumpPressed = false) {
            const P = PHYS;
            const hasShoes = !!(this.shoesTimer && this.shoesTimer > 0);
            const top = hasShoes ? P.TOP * 2 : P.TOP;
            const airAcc = hasShoes ? P.AIR_ACC * 2 : P.AIR_ACC;

            // Variable jump height: jump not held while Ysp < -4 -> clamp (only for real jumps)
            if (this.jumped && !inp.jumpHeld && this.ysp < P.JMP_RELEASE_CAP) this.ysp = P.JMP_RELEASE_CAP;

            // Mid-Air Drop Dash: press & hold Jump again while curled in mid-air to charge instant landing roll!
            if (this.curled && !this.hurtPose) {
                if (jumpPressed && !this.dropDashCharging) {
                    this.dropDashCharging = true;
                    this.dropDashCharge = 0;
                }
                if (this.dropDashCharging) {
                    if (inp.jumpHeld) {
                        const wasReady = this.dropDashReady;
                        this.dropDashCharge += h;
                        if (this.dropDashCharge >= 14) {
                            this.dropDashReady = true;
                            if (!wasReady) this.emit('dropDashReady');
                        }
                    } else {
                        this.dropDashCharging = false;
                        this.dropDashCharge = 0;
                        this.dropDashReady = false;
                    }
                }
            }

            // Air acceleration (never pulls speed back down to TOP)
            if (inp.left) {
                if (this.xsp > -top) this.xsp = Math.max(this.xsp - airAcc * h, -top);
                this.facing = -1;
            } else if (inp.right) {
                if (this.xsp < top) this.xsp = Math.min(this.xsp + airAcc * h, top);
                this.facing = 1;
            }

            // Air drag BEFORE gravity
            if (this.ysp > -4 && this.ysp < 0 && Math.abs(this.xsp) >= P.AIR_DRAG_MIN_XSP) {
                this.xsp *= Math.pow(P.AIR_DRAG, h);
            }
            this.xsp = clamp(this.xsp, -P.MAX_SPEED, P.MAX_SPEED);

            this.x += this.xsp * h;
            this.y += this.ysp * h;

            // Gravity
            this.ysp = Math.min(this.ysp + P.GRV * h, P.MAX_SPEED);

            // Gradually return angle toward 0°
            const diff = wrapSigned(-this.angle), stepA = P.AIR_ANGLE_RETURN_DEG * DEG * h;
            this.angle = Math.abs(diff) <= stepA ? 0 : wrapAngle(this.angle + sign(diff) * stepA);
            this.mode = getQuadrantMode(this.angle);

            this.airSensors();
        }

        /* ---------- SENSOR RIG ---------- */
        cast(name, ox, oy, dx, dy, len, active, tMin = 0) {
            // One-way platforms/tiers (Sonic CD top-solid metatiles) only collide with ground sensors A and B
            const ignoreOneWay = (name !== 'A' && name !== 'B');
            const hit = this.terrain.raycast(ox, oy, dx, dy, len, this.layer, tMin, ignoreOneWay);
            const s = { name, ox, oy, dx, dy, len, hit, active };
            this.sensors[name] = s;
            return s;
        }

        /** Grounded: E/F push, C/D (visual), A/B snap within ±14px along the mode axis. Returns false if it fell off. */
        groundSensors() {
            const r = this.radii;
            const fr = MODE_FRAMES[this.mode = getQuadrantMode(this.angle)];

            // E (backward) / F (forward) at centre height — only the side we're moving toward collides
            const E = this.cast('E', this.x, this.y, -fr.rx, -fr.ry, r.push, this.gsp < 0);
            const F = this.cast('F', this.x, this.y, fr.rx, fr.ry, r.push, this.gsp > 0);
            if (F.active && F.hit && F.hit.t < r.push) {
                const broke = F.hit.surface.onWallContact && F.hit.surface.onWallContact(this);
                if (!broke) {
                    const pen = r.push - F.hit.t;
                    this.x -= fr.rx * pen; this.y -= fr.ry * pen;
                    this.gsp = 0; this.xsp = 0; this.ysp = 0;
                }
            } else if (E.active && E.hit && E.hit.t < r.push) {
                const broke = E.hit.surface.onWallContact && E.hit.surface.onWallContact(this);
                if (!broke) {
                    const pen = r.push - E.hit.t;
                    this.x += fr.rx * pen; this.y += fr.ry * pen;
                    this.gsp = 0; this.xsp = 0; this.ysp = 0;
                }
            }

            // C/D ceiling sensors (cast "up" relative to the mode; collision only matters airborne)
            this.cast('C', this.x - fr.rx * r.width, this.y - fr.ry * r.width, -fr.dx, -fr.dy, r.height, false);
            this.cast('D', this.x + fr.rx * r.width, this.y + fr.ry * r.width, -fr.dx, -fr.dy, r.height, false);

            // A (left/back) / B (right/front): cast height + 16 along the mode's down axis
            const len = r.height + PHYS.GROUND_CAST_EXTRA;
            const A = this.cast('A', this.x - fr.rx * r.width, this.y - fr.ry * r.width, fr.dx, fr.dy, len, true);
            const B = this.cast('B', this.x + fr.rx * r.width, this.y + fr.ry * r.width, fr.dx, fr.dy, len, true);

            let win = null;
            for (const s of [A, B]) {
                const hit = s.hit;
                if (!hit) continue;
                const dist = hit.t - r.height;               // feet -> surface
                if (dist < -PHYS.SNAP_WINDOW || dist > PHYS.SNAP_WINDOW) continue;
                if (!win || hit.t < win.t) win = hit;         // highest / closest wins
            }
            if (!win) { this.becomeAirborne(); return false; }

            const dist = win.t - r.height;
            this.x += fr.dx * dist;
            this.y += fr.dy * dist;
            this.angle = win.angle;
            this.mode = getQuadrantMode(this.angle);
            this.groundSurface = win.surface;
            if (win.surface.onFloorContact) win.surface.onFloorContact(this, false);
            return true;
        }

        /** Airborne: sensors chosen by the dominant motion direction. */
        airSensors() {
            const r = this.radii;
            const ax = Math.abs(this.xsp), ay = Math.abs(this.ysp);
            const motion = ax >= ay ? (this.xsp >= 0 ? 'right' : 'left') : (this.ysp >= 0 ? 'down' : 'up');
            this.airMotion = motion;

            // Walls (E/F)
            const E = this.cast('E', this.x, this.y, -1, 0, r.push, motion !== 'right');
            const F = this.cast('F', this.x, this.y, 1, 0, r.push, motion !== 'left');
            if (E.active && E.hit && E.hit.t < r.push) {
                const broke = E.hit.surface.onWallContact && E.hit.surface.onWallContact(this);
                if (!broke) { this.x += r.push - E.hit.t; if (this.xsp < 0) this.xsp = 0; }
            }
            if (F.active && F.hit && F.hit.t < r.push) {
                const broke = F.hit.surface.onWallContact && F.hit.surface.onWallContact(this);
                if (!broke) { this.x -= r.push - F.hit.t; if (this.xsp > 0) this.xsp = 0; }
            }

            // Ceiling (C/D) — bonk
            const cdActive = motion !== 'down';
            const C = this.cast('C', this.x - r.width, this.y, 0, -1, r.height, cdActive);
            const D = this.cast('D', this.x + r.width, this.y, 0, -1, r.height, cdActive);
            if (cdActive && this.ysp < 0) {
                const hit = closestWithin([C.hit, D.hit], r.height - 1e-9);
                if (hit) { this.y += r.height - hit.t; this.ysp = 0; this.emit('bonk'); }
            }

            // Floor (A/B) — land when the feet reach the surface while moving down
            const abActive = motion !== 'up';
            const len = r.height + PHYS.GROUND_CAST_EXTRA;
            const A = this.cast('A', this.x - r.width, this.y, 0, 1, len, abActive, -8);
            const B = this.cast('B', this.x + r.width, this.y, 0, 1, len, abActive, -8);
            if (abActive && this.ysp >= 0) {
                const hit = closestWithin([A.hit, B.hit], r.height);
                if (hit) this.land(hit);
            }
        }

        land(hit) {
            const r = this.radii;
            const xsp = this.xsp, ysp = this.ysp;
            this.groundSurface = hit.surface;
            if (hit.surface.onFloorContact) hit.surface.onFloorContact(this, true);
            this.y += hit.t - r.height;
            this.angle = hit.angle;
            this.gsp = clamp(landingGroundSpeed(xsp, ysp, this.angle), -PHYS.MAX_SPEED, PHYS.MAX_SPEED);
            this.jumped = false;
            this.springTwirl = false;
            this.hurtPose = false;

            const executeDropDash = !!(this.dropDashReady && this.curled);
            this.dropDashCharging = false;
            this.dropDashCharge = 0;
            this.dropDashReady = false;

            if (executeDropDash) {
                const sameDir = sign(this.gsp) === this.facing || Math.abs(this.gsp) < 0.5;
                const ddSpeed = sameDir
                    ? clamp(this.gsp * 0.5 + 8.5 * this.facing, -12, 12)
                    : clamp(8.5 * this.facing, -12, 12);
                this.gsp = ddSpeed;
                this.curl();
                this.state = STATE.ROLLING;
                this.boostTrailTimer = Math.max(this.boostTrailTimer || 0, 36);
                this.emit('dropDash', Math.abs(this.gsp));
            } else {
                this.uncurl();                 // back to the standing hitbox (-5px)
                this.state = this.gsp === 0 ? STATE.STANDING : STATE.RUNNING;
            }
            this.xsp = this.gsp * Math.cos(this.angle);
            this.ysp = -this.gsp * Math.sin(this.angle);
            // Spawn water splash if landing in a Palmtree Panic or Level 2 plasma water zone
            if (this.terrain.waterZones) {
                const feetY = this.y + this.radii.height;
                for (const wz of this.terrain.waterZones) {
                    if (this.x >= wz.x0 && this.x <= wz.x1 && Math.abs(feetY - wz.y) <= 16) {
                        this.terrain.spawnWaterSplash(this.x, wz.y, 'burst');
                    }
                }
            }
            this.emit('land', { angleDeg: toDeg(this.angle), xsp, ysp, gsp: this.gsp });
            this.groundSensors();          // settle onto the mode axis
        }

        /* ---------- LOOP GATES (crossing-based, supports multiple 360° loops) ---------- */
        checkGates() {
            const crossed = (gx) => (this.prevX < gx) !== (this.x < gx);
            const loops = this.terrain.loops && this.terrain.loops.length
                ? this.terrain.loops
                : [{ ...this.terrain.loop, gates: this.terrain.gates }];
            for (const L of loops) {
                const G = L.gates;
                const inBand = this.y > L.cy - L.r - 80 && this.y < L.cy + L.r + 40;
                if (inBand && crossed(G.entryX)) this.layer = 0;   // Left Entry Gate
                if (inBand && crossed(G.exitX)) this.layer = 1;    // Right Exit Gate
                if (this.grounded && this.y < L.cy && crossed(G.apexX)) {
                    if (this.gsp > 0) this.layer = 1;
                    else if (this.gsp < 0) this.layer = 0;
                }
            }
        }

        updateCosmetics(h) {
            if (this.state === STATE.AIRBORNE) {
                this.visualAngle = this.angle;
                if (this.springTwirl) {
                    this.springTwirlPhase = (this.springTwirlPhase || 0) + 0.34 * h;
                }
            } else {
                const diff = wrapSigned(this.angle - this.visualAngle);
                this.visualAngle = wrapAngle(this.visualAngle + diff * (1 - Math.pow(0.4, h)));
                this.springTwirlPhase = 0;
            }
            const roll = this.state === STATE.SPINDASH ? 0.8 * this.facing * 14
                : this.dropDashReady ? 1.15 * this.facing * 14
                : (this.grounded ? this.gsp : this.xsp);
            this.ballSpin += (roll / 14) * h;
            const runSpd = this.state === STATE.PEELOUT ? (6 + (this.peeloutRev || 0) * 0.25) : Math.abs(this.gsp);
            this.runPhase += runSpd * h * 0.13;
        }
    }

    function closestWithin(hits, maxT) {
        let best = null;
        for (const h of hits) if (h && h.t <= maxT && (!best || h.t < best.t)) best = h;
        return best;
    }

    return {
        PHYS, HITBOX, STATE, MODE_FRAMES, DEG, TAU, PALMTREE_SPRITES,
        toDeg, wrapAngle, getQuadrantMode, landingGroundSpeed, normalToAngle,
        LineSurface, HeightFieldSurface, ArcSurface, PathBuilder, Terrain, Player,
    };
});
