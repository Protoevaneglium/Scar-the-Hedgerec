/**
 * ============================================================================
 * SCAR THE HEDGEREC — BLANK LEVEL CORE TEMPLATE
 * ============================================================================
 * Copy this file to `public/levels/level2.js` (or `level3.js`, etc.) and add:
 *   <script src="levels/level2.js"></script>
 * right after `<script src="sonic-engine.js"></script>` in `public/index.html`.
 *
 * ALREADY INCLUDED AUTOMATICALLY BY THE CORE ENGINE (No extra code needed!):
 *   - 360-degree 6-sensor fixed-point physics, slopes, rolling, variable jump & Spin Dash
 *   - Scar's 5-state speed-reactive sprite animations + Spin Dash ball + Shield/Invincibility auras
 *   - Common Sonic Objects (`assets/common_objects.png`):
 *       * Spinning Rings + 4-frame Ring Collection Sparkles + Scattered Rings on hit
 *       * TV Item Monitors (`'rings'` +10, `'shield'`, `'invinc'`, `'shoes'`) + Broken TV shells
 *       * Checkpoint Star Posts (spinning red/blue orb + active respawn point)
 *       * Red & Yellow Coil Springs (compress -> extend -> launch)
 *       * 3-Prong Spikes
 *       * Giant Special Ring / Okina Ring (+50 rings & +10,000 pts flash)
 *       * Spinning Robotnik -> Sonic Goal Post + Act Clear ring bonus
 *       * 5-frame Badnik/Monitor Explosions + Pixel Score Popups (`100`..`10000`)
 *   - Core WAV Sound Effects (`jump.wav`, `rings.wav`, `goalpost.wav`) + Looping BGM Player
 *   - Keyboard + Android/Termux Multi-Touch Controls (`◀`, `▼`, `▶`, `JUMP`)
 *
 * OWNER CREATIVE DECISIONS (Fill in bit-by-bit below!):
 *   1. Level ID, Title, Music Track (`bgm`), and Color Theme (`theme`)
 *   2. Map Terrain Layout (`buildTerrain` — flat runs, slopes, hills, shelves, tunnels, 360° loops)
 *   3. Common Object Placements (`objects` — rings, TV monitors, checkpoints, springs, spikes, goalpost)
 *   4. Level-Specific Enemy Sprite Sheet & Placements (`enemySheet`, `enemyFrames`, `enemies`)
 *   5. Optional Level Gimmicks or Act Boss (`createBoss`, `onUpdate`, `drawBack`, `drawFront`)
 * ============================================================================
 */
(function (root) {
    'use strict';
    let SonicEngine = root.SonicEngine || null;
    if (!SonicEngine && typeof require === 'function') {
        try { SonicEngine = require('../sonic-engine.js'); } catch (_) {
            try { SonicEngine = require('../public/sonic-engine.js'); } catch (__) {}
        }
    }
    if (!SonicEngine || !SonicEngine.Terrain) return;

    const LEVEL_ID = 'template'; // <-- Change to 'level2', 'level3', etc.

    SonicEngine.Terrain.registerLevel(LEVEL_ID, {
        // --------------------------------------------------------------------
        // 1. LEVEL METADATA, AUDIO & VISUAL THEME (Owner decides!)
        // --------------------------------------------------------------------
        title: 'Blank Starter',
        bgm: null,          // e.g. 'assets/level2.mp3' (null = silent until track is chosen)
        startX: 0,
        endX: 2600,         // Total level width in pixels (increase as map grows, e.g. 10000)
        deathY: 980,        // Bottom pit respawn threshold

        theme: {
            skyTop:        '#0d1b3e',
            skyMid:        '#1b3b6f',
            skyBottom:     '#2b5c8f',
            groundA:       '#5c3c20',
            groundB:       '#422814',
            loopA:         '#744a26',
            loopB:         '#4e3016',
            trimColor:     '#25b52a',
            trimHighlight: '#7dff6a',
        },

        // --------------------------------------------------------------------
        // 2. MAP TERRAIN DESIGN (Owner builds bit-by-bit!)
        // --------------------------------------------------------------------
        // Available `PathBuilder` methods on `b.path(startX, startY)`:
        //   .flat(width)                       -> flat ground of `width` px
        //   .bump(width, maxAngleDeg, +1|-1)   -> smooth hill (+1 = hump up, -1 = dip down)
        //   .ease(width, slope0, slope1)       -> smooth cubic slope transition (slope = tan(deg))
        //   .line(width, slope)                -> constant straight slope
        //   .sWave(width, heightDelta)         -> smooth S-curve up (+dy) or down (-dy)
        //
        // Surface registration helpers on `b`:
        //   b.addFloor(path, { name })         -> solid main ground
        //   b.addShelf(path, { tier: 'mid' })  -> jump-through elevated platform/tier (`oneWay: true`)
        //   b.addLoop(cx, cy, radius, name)    -> full dual-layer 360° Sonic loop!
        //   b.addCeiling(path, { name })       -> solid ceiling
        //   b.addWall(x0, y0, x1, y1, nx, ny)  -> vertical/angled solid wall
        buildTerrain(b, terrain) {
            // Minimal flat starter canvas ready for sculpting:
            const floor = b.path(0, 560).flat(2600);
            b.addFloor(floor, { name: 'starter main floor' });

            // Example elevated shelf (uncomment or expand as desired):
            // b.addShelf(b.path(700, 420).flat(320), { name: 'sample upper ledge', tier: 'mid' });

            // Example 360-degree loop sitting on y = 560 (cy = floorY - radius):
            // b.addLoop(1500, 560 - 128, 128, 'Loop #1');
        },

        // Warp checkpoints (keys 1-7 & Checkpoint button)
        checkpoints: [
            { name: 'Start', x: 120, y: 560 },
        ],

        // --------------------------------------------------------------------
        // 3. COMMON SONIC OBJECTS (TVs, Rings, Springs, Checkpoints, Goalpost)
        // --------------------------------------------------------------------
        objects: {
            // TV Item Monitors — item: 'rings' (+10) | 'shield' | 'invinc' | 'shoes'
            monitors: [
                { x: 340, y: 560, item: 'shield' },
            ],

            // Checkpoint Star Posts (spins red orb & saves respawn point)
            starPosts: [
                { x: 900, y: 560 },
            ],

            // Coil Springs — color: 'yellow' (medium bounce) | 'red' (high bounce)
            springs: [
                { x: 1400, y: 560, color: 'yellow' },
            ],

            // 3-Prong Spikes (upward floor hazards)
            spikeClusters: [
                // { x: 900, y: 560 },
            ],

            // Moving Platforms — { x, y, w, ampX, ampY, speed, phase }
            platforms: [
                // { x: 820, y: 430, w: 64, ampX: 60, ampY: 0, speed: 0.035 },
            ],

            // Speed Boosters — { x, y, boost }
            speedBoosters: [
                // { x: 1300, y: 560, boost: 12.0 },
            ],

            // Optional Giant Special Ring (+50 rings & +10,000 score)
            bigRing: null, // e.g. { x: 2150, y: 520 }

            // End-of-Act Robotnik/Sonic Spinning Goal Post
            goalPost: { x: 2350, y: 560 },
        },

        // Convenience ring placement helper (runs on load & reset)
        setupObjects(rings, terrain) {
            // 5 starter rings along the opening flat:
            rings.addRingLine(440, 536, 32, 0, 5);

            // More helpers you can use:
            // rings.addSurfaceRings(terrain.mainFloor, 1300, 36, 10, 20);
            // rings.addLoopRings(terrain.loops[0], 12);
        },

        // --------------------------------------------------------------------
        // 4. LEVEL-SPECIFIC ENEMIES (Owner chooses sprite sheet & behaviors!)
        // --------------------------------------------------------------------
        enemySheet: null,  // e.g. 'assets/level2_enemies.png'
        enemyFrames: {
            // Example atlas entry:
            // bot_walk1: { sx: 0,  sy: 0, w: 32, h: 24, ax: 16, ay: 24 },
            // bot_walk2: { sx: 34, sy: 0, w: 32, h: 24, ax: 16, ay: 24 },
        },
        enemies: [
            // Ground patrol enemy (`kind: 'crab'`):
            // { kind: 'crab', x: 950, y: 560, minX: 850, maxX: 1080, vx: 1.1, frames: ['bot_walk1', 'bot_walk2'], animRate: 0.2 },
            // Hovering / flying enemy (`kind: 'buzz'`):
            // { kind: 'buzz', x: 1400, y: 400, phase: 0, frames: ['fly_1', 'fly_2'], animRate: 0.3 },
        ],

        // --------------------------------------------------------------------
        // 5. OPTIONAL LEVEL GIMMICKS, CUSTOM ART & ACT BOSS HOOKS
        // --------------------------------------------------------------------
        createBoss(terrain) {
            return null; // Owner defines boss state when ready!
        },
        onUpdate(terrain, player, h) {
            // Runs every 60Hz physics substep `h` for custom level hazards or boss AI
        },
        drawBack(ctx, game) {
            // Optional custom background props behind terrain & loops
        },
        drawFront(ctx, game) {
            // Optional custom foreground props or Boss sprite rendering
        },
    });
})(typeof window !== 'undefined' ? window : globalThis);
