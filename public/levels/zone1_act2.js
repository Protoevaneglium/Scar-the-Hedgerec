/**
 * ============================================================================
 * ZONE 1 — PALMTREE PANIC: ACT 2 (Blank Starter Foundation)
 * ============================================================================
 * Connected automatically after Level 1 ('palmtree') via the 3-Act Zone
 * progression system:
 *   Act 1 ('palmtree') -> Act 2 ('z1_act2') -> Act 3 Boss Act ('z1_act3')
 *
 * Ready for the owner's creative decisions on map terrain, enemies & gimmicks!
 * ============================================================================
 */
(function (root) {
    'use strict';
    let SonicEngine = root.SonicEngine || null;
    if (!SonicEngine && typeof require === 'function') {
        try { SonicEngine = require('../sonic-engine.js'); } catch (_) {}
    }
    if (!SonicEngine || !SonicEngine.Terrain) return;

    SonicEngine.Terrain.registerLevel('z1_act2', {
        title: 'Z1 Act 2',
        zone: 1,
        zoneName: 'PALMTREE PANIC',
        act: 2,
        isBossAct: false,
        bgm: 'assets/level1.mp3',
        startX: 0,
        endX: 2600,
        deathY: 980,

        theme: {
            skyTop:        '#0a1948',
            skyMid:        '#1c58b8',
            skyBottom:     '#4ab4f8',
            groundA:       '#c46b22',
            groundB:       '#8a4210',
            loopA:         '#fca800',
            loopB:         '#a83c00',
            trimColor:     '#1db828',
            trimHighlight: '#7dff6a',
        },

        // Owner sculpts Act 2 map terrain bit-by-bit here:
        buildTerrain(b) {
            const floor = b.path(0, 560).flat(2600);
            b.addFloor(floor, { name: 'act 2 starter floor' });
        },

        checkpoints: [
            { name: 'Act 2 Start', x: 120, y: 560 },
        ],

        objects: {
            monitors: [
                { x: 340, y: 560, item: 'shield' },
                { x: 620, y: 560, item: '1up' },
            ],
            starPosts: [
                { x: 1050, y: 560 },
            ],
            springs: [
                { x: 1550, y: 560, color: 'yellow' },
            ],
            spikeClusters: [],
            platforms: [],
            speedBoosters: [],
            bigRing: null,
            goalPost: { x: 2350, y: 560 },
        },

        setupObjects(rings) {
            rings.addRingLine(430, 536, 32, 0, 5);
        },

        // Owner selects Act 2 enemies & custom mechanics when ready:
        enemySheet: null,
        enemyFrames: {},
        enemies: [],
    });
})(typeof window !== 'undefined' ? window : globalThis);
