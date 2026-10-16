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
        AIRBORNE: 'AIRBORNE',
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
        constructor(x1, y1, x2, y2, hnx, hny, layer = -1, name = 'line') {
            const ex = x2 - x1, ey = y2 - y1, len = Math.hypot(ex, ey);
            let nx = ey / len, ny = -ex / len;
            if (nx * hnx + ny * hny < 0) { nx = -nx; ny = -ny; }
            Object.assign(this, { kind: 'line', x1, y1, x2, y2, nx, ny, layer, name });
            this.bounds = {
                minX: Math.min(x1, x2) - 1, maxX: Math.max(x1, x2) + 1,
                minY: Math.min(y1, y2) - 1, maxY: Math.max(y1, y2) + 1,
            };
        }
        intersect(ox, oy, dx, dy, tMin, tMax) {
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
        constructor({ pieces, ceiling = false, layer = -1, name = 'field' }) {
            this.kind = 'height';
            this.pieces = pieces;
            this.x0 = pieces[0].x0;
            this.x1 = pieces[pieces.length - 1].x1;
            this.ceiling = ceiling;
            this.side = ceiling ? -1 : 1;
            this.layer = layer;
            this.name = name;
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
            Object.assign(this, { kind: 'arc', cx, cy, r, fromDeg, toDeg: toD, layer, name });
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
       PART 2/5 — TERRAIN + GREEN HILL TEST COURSE
       ====================================================================== */
    class Terrain {
        constructor() {
            this.surfaces = [];
            this.floors = [];
            this.ceilings = [];
            this.lines = [];
            this.sections = [];
            this.build();
        }

        add(s) {
            this.surfaces.push(s);
            if (s.kind === 'height') (s.ceiling ? this.ceilings : this.floors).push(s);
            else if (s.kind === 'line') this.lines.push(s);
            return s;
        }

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
            this.loop = { cx, cy, r: R };
            // Layer 0 = entry side: bottom -> right wall -> ceiling (past apex for a seamless hand-off)
            this.loopArc0 = this.add(new ArcSurface({ cx, cy, r: R, fromDeg: 0, toDeg: 190, layer: 0, name: 'loop L0' }));
            // Layer 1 = ceiling -> left wall -> bottom/exit
            this.loopArc1 = this.add(new ArcSurface({ cx, cy, r: R, fromDeg: 170, toDeg: 360, layer: 1, name: 'loop L1' }));
            this.gates = { entryX: cx - R - 48, apexX: cx, exitX: cx + R + 48 };

            // S-curve tunnel ceiling (64px vertical clearance) + rock block faces and roof
            const tx0 = 4360, tx1 = 5080, clearance = 64, roofY = valleyY - 230;
            const c = new PathBuilder(tx0, valleyY - clearance);
            c.flat(40).sWave(640, 70).flat(40);
            this.tunnelCeiling = this.add(c.toSurface({ ceiling: true, name: 'tunnel ceiling' }));
            this.add(new LineSurface(tx0, roofY, tx0, valleyY - clearance, -1, 0, -1, 'tunnel left face'));
            this.add(new LineSurface(tx1, roofY, tx1, valleyY - clearance, 1, 0, -1, 'tunnel right face'));
            this.add(new LineSurface(tx0, roofY, tx1, roofY, 0, -1, -1, 'tunnel roof'));
            this.tunnel = { x0: tx0, x1: tx1, roofY };

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

        /** Closest surface hit along a unit ray on the given collision layer (-1 surfaces are on both). */
        raycast(ox, oy, dx, dy, maxDist, layer, tMin = 0) {
            const sx = ox + dx * tMin, sy = oy + dy * tMin;
            const ex = ox + dx * maxDist, ey = oy + dy * maxDist;
            const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
            const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
            let best = null;
            for (let i = 0; i < this.surfaces.length; i++) {
                const s = this.surfaces[i];
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

    /* ======================================================================
       PART 3/4 — PLAYER: 6-SENSOR RIG + STATE MACHINE
       ====================================================================== */
    class Player {
        constructor(terrain, events) {
            this.terrain = terrain;
            this.events = events || {};
            this.sensors = {};
            this.place(terrain.spawnX);
        }

        emit(name, data) { const fn = this.events[name]; if (fn) fn(data, this); }

        get grounded() { return this.state !== STATE.AIRBORNE; }
        get radii() { return this.curled ? HITBOX.ROLL : HITBOX.STAND; }

        /** Drop the player onto the ground at x (standing). */
        place(x, layer = 0) {
            const hit = this.terrain.getSurfaceAt(x, this.terrain.probeY, layer);
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
            this.crouching = false;
            this.skidding = false;
            this.ballSpin = 0;
            this.runPhase = 0;
            this.airMotion = 'down';
            if (hit) this.groundSensors();
        }

        respawn() {
            const cps = this.terrain.checkpoints;
            let cp = cps[0];
            for (const c of cps) if (c.x <= this.x) cp = c;
            this.place(cp.x);
            this.emit('respawn', cp);
        }

        /**
         * input: { left, right, down, jumpHeld, jumpPressed }  (jumpPressed = edge this render frame)
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
            this.prevX = this.x;
            this.prevY = this.y;
            this.skidding = false;
            if (this.state === STATE.SPINDASH) this.stepSpindash(inp, h, jumpPressed);
            else if (this.state === STATE.AIRBORNE) this.stepAirborne(inp, h);
            else this.stepGrounded(inp, h, jumpPressed);
            this.checkGates();
            this.updateCosmetics(h);
            if (this.y > this.terrain.deathY) { this.emit('death'); this.respawn(); }
        }

        /* ---------- curl / uncurl (spec §2: ±5px toward the floor normal) ---------- */
        curl() {
            if (this.curled) return;
            this.curled = true;
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
                this.emit('spindashRev', 0);
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
                    } else if (this.gsp > -P.TOP) {
                        this.gsp = Math.max(this.gsp - P.ACC * h, -P.TOP);
                    }
                    if (this.gsp <= 0) this.facing = -1;
                } else if (right) {
                    if (this.gsp < 0) {
                        this.skidding = this.gsp <= -4;
                        this.gsp += P.DEC * h;
                        if (this.gsp >= 0) this.gsp = P.SKID_SNAP;
                    } else if (this.gsp < P.TOP) {
                        this.gsp = Math.min(this.gsp + P.ACC * h, P.TOP);
                    }
                    if (this.gsp >= 0) this.facing = 1;
                } else {
                    this.gsp -= Math.min(Math.abs(this.gsp), P.FRC * h) * sign(this.gsp);
                }
                // Enter ROLLING: grounded, Down, |gsp| >= 1.0
                if (inp.down && Math.abs(this.gsp) >= P.ROLL_MIN_SPEED) {
                    this.curl();
                    this.state = STATE.ROLLING;
                    this.emit('roll');
                }
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
        }

        jump() {
            const a = this.angle;
            // Xsp/Ysp from gsp (§3.3), then the perpendicular impulse (§5)
            this.xsp = this.gsp * Math.cos(a) - PHYS.JMP * Math.sin(a);
            this.ysp = -this.gsp * Math.sin(a) - PHYS.JMP * Math.cos(a);
            this.curl(); // AIRBORNE + ROLLING hitbox (same +5px rule so the ball starts on the ground)
            this.jumped = true;
            this.crouching = false;
            this.state = STATE.AIRBORNE;
            this.emit('jump');
        }

        becomeAirborne() {
            this.state = STATE.AIRBORNE;
            this.jumped = false; // walked/rolled off or slipped: no variable-jump clamp
            this.crouching = false;
            this.xsp = this.gsp * Math.cos(this.angle);
            this.ysp = -this.gsp * Math.sin(this.angle);
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

        /* ---------- AIRBORNE (§5) ---------- */
        stepAirborne(inp, h) {
            const P = PHYS;
            // Variable jump height: jump not held while Ysp < -4 -> clamp (only for real jumps)
            if (this.jumped && !inp.jumpHeld && this.ysp < P.JMP_RELEASE_CAP) this.ysp = P.JMP_RELEASE_CAP;

            // Air acceleration (never pulls speed back down to TOP)
            if (inp.left) {
                if (this.xsp > -P.TOP) this.xsp = Math.max(this.xsp - P.AIR_ACC * h, -P.TOP);
                this.facing = -1;
            } else if (inp.right) {
                if (this.xsp < P.TOP) this.xsp = Math.min(this.xsp + P.AIR_ACC * h, P.TOP);
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
            const hit = this.terrain.raycast(ox, oy, dx, dy, len, this.layer, tMin);
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
                const pen = r.push - F.hit.t;
                this.x -= fr.rx * pen; this.y -= fr.ry * pen;
                this.gsp = 0; this.xsp = 0; this.ysp = 0;
            } else if (E.active && E.hit && E.hit.t < r.push) {
                const pen = r.push - E.hit.t;
                this.x += fr.rx * pen; this.y += fr.ry * pen;
                this.gsp = 0; this.xsp = 0; this.ysp = 0;
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
            if (E.active && E.hit && E.hit.t < r.push) { this.x += r.push - E.hit.t; if (this.xsp < 0) this.xsp = 0; }
            if (F.active && F.hit && F.hit.t < r.push) { this.x -= r.push - F.hit.t; if (this.xsp > 0) this.xsp = 0; }

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
            this.y += hit.t - r.height;
            this.angle = hit.angle;
            const xsp = this.xsp, ysp = this.ysp;
            this.gsp = clamp(landingGroundSpeed(xsp, ysp, this.angle), -PHYS.MAX_SPEED, PHYS.MAX_SPEED);
            this.uncurl();                 // back to the standing hitbox (-5px)
            this.jumped = false;
            this.state = this.gsp === 0 ? STATE.STANDING : STATE.RUNNING;
            this.xsp = this.gsp * Math.cos(this.angle);
            this.ysp = -this.gsp * Math.sin(this.angle);
            this.emit('land', { angleDeg: toDeg(this.angle), xsp, ysp, gsp: this.gsp });
            this.groundSensors();          // settle onto the mode axis
        }

        /* ---------- LOOP GATES (crossing-based, can't be skipped at 16px/frame) ---------- */
        checkGates() {
            const L = this.terrain.loop, G = this.terrain.gates;
            const crossed = (gx) => (this.prevX < gx) !== (this.x < gx);
            const inBand = this.y > L.cy - L.r - 80 && this.y < L.cy + L.r + 40;
            if (inBand && crossed(G.entryX)) this.layer = 0;   // Left Entry Gate
            if (inBand && crossed(G.exitX)) this.layer = 1;    // Right Exit Gate
            // Apex Gate at 180°: "moving right" = positive ground speed (forward through the loop).
            // On the ceiling world Xsp is negated, so gsp is the only meaningful direction here.
            if (this.grounded && this.y < L.cy && crossed(G.apexX)) {
                if (this.gsp > 0) this.layer = 1;
                else if (this.gsp < 0) this.layer = 0;
            }
        }

        updateCosmetics(h) {
            if (this.state === STATE.AIRBORNE) {
                this.visualAngle = this.angle;
            } else {
                const diff = wrapSigned(this.angle - this.visualAngle);
                this.visualAngle = wrapAngle(this.visualAngle + diff * (1 - Math.pow(0.4, h)));
            }
            const roll = this.state === STATE.SPINDASH ? 0.8 * this.facing * 14
                : (this.grounded ? this.gsp : this.xsp);
            this.ballSpin += (roll / 14) * h;
            this.runPhase += Math.abs(this.gsp) * h * 0.13;
        }
    }

    function closestWithin(hits, maxT) {
        let best = null;
        for (const h of hits) if (h && h.t <= maxT && (!best || h.t < best.t)) best = h;
        return best;
    }

    return {
        PHYS, HITBOX, STATE, MODE_FRAMES, DEG, TAU,
        toDeg, wrapAngle, getQuadrantMode, landingGroundSpeed, normalToAngle,
        LineSurface, HeightFieldSurface, ArcSurface, PathBuilder, Terrain, Player,
    };
});
