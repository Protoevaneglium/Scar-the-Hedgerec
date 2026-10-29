/**
 * ============================================================================
 * ZONE 1 — PALMTREE PANIC: ACT 3 (BOSS ACT — Blank Starter Foundation)
 * ============================================================================
 * Connected automatically after Act 2 ('z1_act2') via the 3-Act Zone
 * progression system:
 *   Act 1 ('palmtree') -> Act 2 ('z1_act2') -> Act 3 Boss Act ('z1_act3') -> Zone 2 Act 1
 *
 * Uses an Animal Capsule (`objects.capsule`) instead of a standard Goalpost.
 * Flip `lockedUntilBoss: true` once the owner designs the Zone 1 Boss in
 * `createBoss(terrain)` and `onUpdate(terrain, player, h)`!
 * ============================================================================
 */
(function (root) {
    'use strict';
    let SonicEngine = root.SonicEngine || null;
    if (!SonicEngine && typeof require === 'function') {
        try { SonicEngine = require('../sonic-engine.js'); } catch (_) {}
    }
    if (!SonicEngine || !SonicEngine.Terrain) return;

    SonicEngine.Terrain.registerLevel('z1_act3', {
        title: 'Z1 Act 3 (Boss)',
        zone: 1,
        zoneName: 'PALMTREE PANIC',
        act: 3,
        isBossAct: true,
        bgm: 'assets/level1.mp3', // Replace with boss BGM track when owner chooses one
        startX: 0,
        endX: 1440,
        deathY: 980,

        theme: {
            skyTop:        '#160a2c',
            skyMid:        '#441a5e',
            skyBottom:     '#8c366c',
            groundA:       '#b85c1c',
            groundB:       '#78340c',
            loopA:         '#fca800',
            loopB:         '#903000',
            trimColor:     '#19a424',
            trimHighlight: '#69f069',
        },

        // Compact Boss Arena starter canvas (owner customizes arena layout & boss):
        buildTerrain(b) {
            const floor = b.path(0, 560).flat(1440);
            b.addFloor(floor, { name: 'act 3 boss arena floor' });
            // Left & right arena boundary walls
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
            goalPost: null, // Boss Acts finish via the Animal Capsule below!
            capsule: {
                x: 1140,
                y: 560,
                lockedUntilBoss: false, // Set to `true` once `createBoss` is implemented
            },
        },

        setupObjects(rings) {
            // Classic pre-boss safety rings
            rings.addRingLine(360, 536, 34, 0, 3);
        },

        // Owner designs the Zone 1 Boss mechanics & sprites here when ready:
        createBoss(/* terrain */) {
            return null;
        },
        onUpdate(/* terrain, player, h */) {},
        drawBoss(/* ctx, boss, game */) {},
    });
})(typeof window !== 'undefined' ? window : globalThis);
