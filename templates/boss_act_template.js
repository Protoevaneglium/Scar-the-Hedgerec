/**
 * ============================================================================
 * SCAR THE HEDGEREC — ACT 3 BOSS ACT TEMPLATE (ANIMAL CAPSULE ARENA)
 * ============================================================================
 * Every Zone in Scar the Hedgerec follows the classic 3-Act structure:
 *   Act 1 -> Act 2 -> Act 3 (Boss Act) -> Next Zone Act 1
 *
 * Copy this file to `public/levels/zone2_act3.js` (etc.) and include it after
 * Act 2 in `public/index.html`.
 *
 * WHAT THIS BOSS ACT TEMPLATE INCLUDES AUTOMATICALLY:
 *   - 16-bit Title Card with `ACT 3` medallion and `★ BOSS ACT ★` badge
 *   - Enclosed Boss Arena floor with left & right arena walls
 *   - Pre-arena safety Rings & Ring TV Monitor
 *   - Classic Sonic Animal Capsule (`objects.capsule` from `common_objects.png`):
 *       * Solid 64x60 capsule body + top plunger button
 *       * Can lock until `terrain.boss.defeated === true` (`lockedUntilBoss: true`)
 *       * Jumping on the top plunger button depresses it, pops 4 explosions,
 *         releases hopping critters, tallies Zone Clear bonuses, and fades into
 *         the Next Zone's Act 1!
 *   - Classic Lives carryover (`player.lives`, `'1up'` monitors, `GAME OVER` / `TIME OVER`)
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

    const LEVEL_ID = 'boss_template'; // <-- Change to 'z2_act3', 'z3_act3', etc.

    SonicEngine.Terrain.registerLevel(LEVEL_ID, {
        title: 'Boss Starter (Act 3)',
        zone: 2,
        zoneName: 'NEW ZONE',
        act: 3,
        isBossAct: true,
        bgm: null, // e.g. 'assets/boss_theme.mp3'
        startX: 0,
        endX: 1440,
        deathY: 980,

        theme: {
            skyTop:        '#160a2c',
            skyMid:        '#3e1858',
            skyBottom:     '#7c2e64',
            groundA:       '#5c3c20',
            groundB:       '#422814',
            loopA:         '#744a26',
            loopB:         '#4e3016',
            trimColor:     '#25b52a',
            trimHighlight: '#7dff6a',
        },

        buildTerrain(b) {
            const floor = b.path(0, 560).flat(1440);
            b.addFloor(floor, { name: 'boss arena floor' });
            b.addWall(24, 120, 24, 560, 1, 0, 'arena left wall');
            b.addWall(1416, 120, 1416, 560, -1, 0, 'arena right wall');
        },

        checkpoints: [
            { name: 'Boss Arena', x: 140, y: 560 },
        ],

        objects: {
            monitors: [
                { x: 260, y: 560, item: 'rings' },
            ],
            starPosts: [],
            springs: [],
            spikeClusters: [],
            platforms: [],
            speedBoosters: [],
            bigRing: null,
            goalPost: null,
            // Act 3 Animal Capsule: set `lockedUntilBoss: true` once `createBoss` returns a boss!
            capsule: {
                x: 1140,
                y: 560,
                lockedUntilBoss: false,
            },
        },

        setupObjects(rings) {
            rings.addRingLine(360, 536, 34, 0, 3);
        },

        // Owner designs the Zone Boss state, attack pattern & sprite drawing here:
        createBoss(/* terrain */) {
            // Example when ready:
            // return { x: 860, y: 380, hp: 8, flashTimer: 0, defeated: false };
            return null;
        },
        onUpdate(/* terrain, player, h */) {
            // Update `terrain.boss` movement, hit detection (`player.curled`), and set `boss.defeated = true` at 0 HP!
        },
        drawBoss(/* ctx, boss, game */) {
            // Custom boss sprite rendering
        },
    });
})(typeof window !== 'undefined' ? window : globalThis);
