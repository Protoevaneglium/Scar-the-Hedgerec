/** Zone 2 Act 3 — Sanctuary Duet. Built from the shared boss-arena template. */
(function (root) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    if (!E) return;
    const Boss = root.SanctuaryDuoBoss || (typeof require === 'function' ? require('./sanctuary_duo_boss.js') : null);
    const NPC = root.RosieNPC || (typeof require === 'function' ? require('./rosie_npc.js') : null);
    const Dialogue = root.RosieDialogue || (typeof require === 'function' ? require('./rosie_dialogue.js') : null);
    const ARENA = Object.freeze({ left: 1000, right: 2460, floorY: 560, triggerX: 1000 });
    const art = (method, ...args) => {
        if (root.SanctuaryDuetArt && root.SanctuaryDuetArt[method]) root.SanctuaryDuetArt[method](...args);
    };

    E.Terrain.registerLevel('z2_act3', {
        title: 'Sanctuary Duet Act 3', zone: 2, zoneName: 'SANCTUARY DUET', act: 3,
        isBossAct: true, nextStage: null, bgm: 'assets/marble_canopy_act1.wav',
        startX: 0, endX: 2800, deathY: 1180, probeY: -380,
        cameraMinY: -120, cameraMaxY: 420, wallJump: true, smoothPresentation: false,
        animalZone: 'mz', animalTypes: ['locky', 'wocky'],
        theme: { skyTop: '#565bba', skyMid: '#d78fb5', skyBottom: '#ffe4ba',
            groundA: '#9e81b5', groundB: '#514061', loopA: '#f5dfa2', loopB: '#9575a5',
            trimColor: '#8caf57', trimHighlight: '#fff0b1' },

        buildTerrain(b, terrain) {
            const mainSurf = b.addFloor(b.path(0, 560).flat(2800), { name: 'floating sanctuary arena island' });
            mainSurf.thickness = 80;
            b.addLoop(500, 460, 100, 'Marble Gate Warm-up Loop');
            const balcony = b.addShelf(b.path(730, 420).flat(210), { name: 'sanctuary offering balcony', tier: 'high' });
            balcony.thickness = 45;
            // Low, one-way recovery ledges allow jumps over the volleys while keeping
            // both bosses reachable from the broad, continuous arena floor.
            const ledges = [
                b.addShelf(b.path(1190, 470).flat(120), { name: 'left duet dodge ledge', tier: 'mid' }),
                b.addShelf(b.path(2190, 470).flat(120), { name: 'right duet dodge ledge', tier: 'mid' }),
            ];
            ledges.forEach(s => { s.thickness = 28; });
            // End walls protect the island's playable deck; combat gates are managed
            // by the encounter and release as soon as both enemies are defeated.
            b.addWall(24, 180, 24, 560, 1, 0, 'island west parapet', { wallJump: true });
            b.addWall(2776, 180, 2776, 560, -1, 0, 'island east parapet', { wallJump: true });
            terrain.z2a3 = { mainSurf, balcony, ledges, arena: ARENA, assistRequested: false, reunion: null };
            terrain.sections = [{ name: 'Sanctuary Gate', x: 0 }, { name: 'Tag Team Arena', x: 1000 },
                { name: 'Animal Rescue', x: 2480 }];
        },
        checkpoints: [
            { name: '1. Sanctuary Gate', x: 140, y: 560 },
            { name: '2. Tag Team Arena', x: 1130, y: 560 },
        ],
        objects: {
            monitors: [{ x: 210, y: 560, item: 'shield' }, { x: 905, y: 560, item: 'rings' },
                { x: 820, y: 420, item: '1up' }],
            starPosts: [{ x: 960, y: 560 }],
            springs: [{ x: 710, y: 560, color: 'yellow', power: -10.2 }],
            platforms: [{ x: 890, y: 490, w: 64, ampY: 32, speed: .025, phase: Math.PI / 2 }],
            speedBoosters: [{ x: 340, y: 560, boost: 11.8 }],
            dashRings: [], timePosts: [], spikeClusters: [],
            enemies: [
                { kind: 'crab', type: 'motobug', x: 280, y: 560, minX: 250, maxX: 310, vx: .8 },
                { kind: 'crab', type: 'crab', x: 820, y: 560, minX: 780, maxX: 850, vx: .8 },
            ],
            bigRing: { x: 900, y: 374 }, goalPost: null,
            capsule: { x: 2630, y: 560, lockedUntilBoss: true },
        },
        createBoss(terrain) { return Boss.create(terrain, ARENA); },
        setupObjects(r, terrain) {
            const z = terrain.z2a3;
            z.assistRequested = false;
            z.reunion = terrain.boss.ally;
            z.reunion.conversation = Dialogue.create();
            z.reunion.followAcrossStage = true;
            r.addRingLine(350, 532, 25, 0, 5);
            r.addLoopRings(terrain.loops[0], 12);
            r.addRingLine(750, 391, 26, 0, 6);
            for (const x of [1090, 1590, 2130]) r.addRingLine(x, 532, 27, 0, 6);
        },
        onUpdate(terrain, player, h, input = {}) {
            const z = terrain.z2a3;
            if (!z || !Number.isFinite(h) || h <= 0) return;
            if (player.gameOver || player.state === E.STATE.DYING) {
                z.assistRequested = false;
                NPC.cancelHug(z.reunion); Dialogue.close(z.reunion.conversation);
                // The encounter records the interrupted life without advancing it.
                Boss.update(terrain, player, h, {});
                return;
            }
            const capsule = terrain.capsule;
            if (capsule && (capsule.opened || capsule.cleared)) {
                z.assistRequested = false;
                if (terrain.boss.defeated) Boss.update(terrain, player, h, {});
                Dialogue.close(z.reunion.conversation); NPC.finish(z.reunion, h);
                return;
            }
            Boss.update(terrain, player, h, { ...input, talkPressed: !!z.assistRequested || !!input.talkPressed });
            z.assistRequested = false;
            z.reunion = terrain.boss.ally;
            const n = z.reunion;
            if (!n.conversation) n.conversation = Dialogue.create();
            if (!terrain.boss.defeated || player.state === E.STATE.DYING) return;
            // Slide her ordinary NPC home along the island without moving her body.
            // The current position remains inside the existing walking territory,
            // so following Scar to the rescue never snaps her across the arena.
            n.x = Math.max(ARENA.left + 360, Math.min(ARENA.right + 90,
                Math.max(n.actorX - 179, Math.min(n.actorX + 359, player.x))));
            const reaction = NPC.update(n, player, { ...input, dialogueOpen: Dialogue.view(n.conversation).open }, h);
            if (reaction.talk) player.emit('rosieTalk', n);
            if (reaction.hop) player.emit('rosieHop', n);
            if (reaction.hug) { n.hugged = true; player.emit('rosieHug', n); }
        },
        drawBackground: (c, g) => art('drawBackground', c, g),
        drawBack: (c, g) => art('drawBack', c, g),
        drawTerrain: (c, g) => art('drawTerrain', c, g),
        drawLoops: (c, g) => art('drawLoops', c, g),
        drawPlatform: (c, p) => art('drawPlatform', c, p),
        drawFront: (c, g) => art('drawFront', c, g),
        drawForeground: (c, g) => art('drawForeground', c, g),
        drawHUD: (c, g) => art('drawHUD', c, g),
        drawBoss: (c, boss, g) => art('drawBoss', c, boss, g),
    });
})(typeof window !== 'undefined' ? window : globalThis);
