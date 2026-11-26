/** Mirage Aqueduct — normal-act template, with Hydrocity / Sandopolis route inspiration. */
(function (root) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    if (!E) return;
    const rise = (p, w, dy) => p.ease(w / 2, 0, 2 * dy / w).ease(w / 2, 2 * dy / w, 0);
    const art = (name, ...args) => root.MirageAqueductArt?.[name]?.(...args);
    E.Terrain.registerLevel('z3_act1', {
        title: 'Mirage Aqueduct Act 1', zone: 3, zoneName: 'MIRAGE AQUEDUCT', act: 1,
        isBossAct: false, nextStage: 'z3_act2', bgm: 'assets/mirage_aqueduct.wav',
        startX: 0, endX: 15400, deathY: 1320, probeY: -650,
        cameraMinY: -450, cameraMaxY: 800, wallJump: true,
        spritePresentation: 'volume', changingSkies: true, animalZone: 'mz', animalTypes: ['flicky', 'pocky'],
        theme: { skyTop: '#207dc6', skyMid: '#54ced9', skyBottom: '#f8dfad',
            groundA: '#e2b35d', groundB: '#8b573d', loopA: '#efc06b', loopB: '#826044',
            trimColor: '#138e9a', trimHighlight: '#9ef5e5' },
        buildTerrain(b, terrain) {
            // A continuous lower course catches every missed upper-route jump.
            const p = b.path(0, 480).flat(700);
            rise(p, 800, 240).flat(1700);          // 1500–3200: oasis basin and first loop.
            rise(p, 600, -140).flat(1300);        // 3800–5100: sluice gallery.
            rise(p, 800, 220).flat(1800);         // 5900–7700: submerged temple courtyard.
            rise(p, 700, -200).flat(1800);        // 8400–10200: cross-channel foundations.
            rise(p, 800, 120).flat(1400);         // 11000–12400: sandfall vault.
            rise(p, 900, -240).flat(2100);        // 13300–15400: sunset promenade.
            const main = b.addFloor(p, { name: 'aqueduct recovery course' });
            const a = b.path(1740, 430).flat(720); rise(a, 760, -200).flat(820); rise(a, 760, 240).flat(240);
            const upperA = b.addShelf(a, { name: 'Oasis high aqueduct', tier: 'high' });
            const c = b.path(5590, 370).flat(650); rise(c, 850, -250).flat(1400); rise(c, 900, 300).flat(220);
            const upperB = b.addShelf(c, { name: 'Cross-current expressway', tier: 'high' });
            const d = b.path(9820, 320).flat(700); rise(d, 780, -360).flat(1050); rise(d, 900, 360).flat(200);
            const upperC = b.addShelf(d, { name: 'Sandfall crown', tier: 'high' });
            const roads = [upperA, upperB, upperC];
            roads.forEach(s => { s.thickness = 96; });
            b.addLoop(2540, 600, 120, 'Oasis turquoise loop');
            b.addLoop(7310, 10, 110, 'Sky canal loop');
            b.addLoop(11630, 600, 120, 'Sand vault loop');
            const reward = b.addShelf(b.path(11940, -210).flat(260), { name: 'Sun disk treasury', tier: 'high' });
            reward.thickness = 82;
            const bridgeIn = b.addShelf(b.path(9090, 330).flat(220), { name: 'ruined bridge approach', tier: 'mid' });
            const bridgeOut = b.addShelf(b.path(9486, 330).flat(220), { name: 'ruined bridge landing', tier: 'mid' });
            bridgeIn.thickness = bridgeOut.thickness = 60;
            const roof = b.addShelf(b.path(4170, 370).flat(650), { name: 'sluice gallery roof', tier: 'mid' });
            roof.thickness = 56;
            b.addCeiling(b.path(4170, 426).flat(650), { name: 'sluice tunnel ceiling' });
            const shafts = [{ x0: 5310, x1: 5470, top: 260, bottom: 600 },
                { x0: 9520, x1: 9680, top: 220, bottom: 500 }];
            for (const s of shafts) {
                b.addWall(s.x0, s.top, s.x0, s.bottom, 1, 0, 'aqueduct climb left', { wallJump: true });
                b.addWall(s.x1, s.top, s.x1, s.bottom, -1, 0, 'aqueduct climb right', { wallJump: true });
            }
            terrain.z3a1 = { main, roads, upperA, upperB, upperC, reward, roof, shafts,
                pools: [{ x0: 1560, x1: 3180, y: 678 }, { x0: 5980, x1: 7670, y: 756 },
                    { x0: 11030, x1: 12360, y: 678 }],
                chutes: [{ surface: main, x0: 730, x1: 1500 }, { surface: main, x0: 5140, x1: 5900 },
                    { surface: upperA, x0: 4050, x1: 4800 }, { surface: upperB, x0: 8500, x1: 9390 },
                    { surface: upperC, x0: 12360, x1: 13250 }],
                waterfalls: [{ x: 1630, top: 260, bottom: 720 }, { x: 5010, top: 260, bottom: 580 },
                    { x: 7980, top: 110, bottom: 800 }, { x: 10570, top: 140, bottom: 720 },
                    { x: 13680, top: 80, bottom: 480 }],
            };
            terrain.sections = [{ name: 'Oasis Descent', x: 0 }, { name: 'Golden Aqueduct', x: 1740 },
                { name: 'Sluice Gallery', x: 3850 }, { name: 'Cross-Current Temple', x: 5590 },
                { name: 'Sandfall Crown', x: 9820 }, { name: 'Sunset Promenade', x: 13300 }];
        },
        checkpoints: [{ name: '1. Oasis Descent', x: 120, y: 480 },
            { name: '2. Oasis Basin', x: 1700, y: 720 }, { name: '3. Sluice Gallery', x: 3940, y: 580 },
            { name: '4. Cross-Current Temple', x: 6100, y: 800 },
            { name: '5. Sandfall Gate', x: 9790, y: 600 }, { name: '6. Sunset Promenade', x: 13700, y: 480 }],
        objects(t) {
            const z = t.z3a1, m = z.main;
            return {
                monitors: [{ x: 300, y: 480, item: 'shield' }, { x: 1930, y: 430, item: 'shoes' },
                    { x: 4020, y: 580, item: 'rings' }, { x: 5730, y: 370, item: 'shield' },
                    { x: 10000, y: 320, item: 'shoes' }, { x: 12040, y: -210, item: '1up' },
                    { x: 13880, y: 480, item: 'invinc' }],
                starPosts: [1650, 3900, 6060, 9710, 13640].map(x => ({ x, y: m.f(x) })),
                springs: [{ x: 11990, y: -40, color: 'red' },
                    { x: 8980, y: z.upperB.f(8980), color: 'yellow' },
                    { x: 14010, y: 480, color: 'yellow' }],
                platforms: [{ kind: 'sluiceLift', x: 1810, y: 575, w: 112, ampY: 145, speed: .022, phase: Math.PI / 2 },
                    { kind: 'sluiceLift', x: 5660, y: 570, w: 112, ampY: 200, speed: .018, phase: Math.PI / 2 },
                    { kind: 'sluiceLift', x: 9860, y: 460, w: 112, ampY: 140, speed: .022, phase: Math.PI / 2 }],
                speedBoosters: [530, 2060, 3240, 4100, 6180, 7860, 8670, 10250, 11210, 12500, 13980]
                    .map(x => ({ x, y: m.f(x), boost: 12.2 }))
                    .concat([{ x: 1960, y: 430, boost: 12.8 }, { x: 3480, y: 230, boost: 12.8 },
                        { x: 5800, y: 370, boost: 12.8 }, { x: 6950, y: 120, boost: 13 },
                        { x: 10080, y: 320, boost: 12.8 }, { x: 11500, y: -40, boost: 13 }]),
                dashRings: [{ x: 4880, y: 360, angleDeg: -12, boost: 13 },
                    { x: 13300, y: 230, angleDeg: 10, boost: 13 }],
                bouncePoles: [{ x: 14620, y: 456, power: -10.8 }],
                spinners: [{ x: 4680, y: 505 }, { x: 12980, y: 340 }],
                swingPlatforms: [{ pivotX: 5280, pivotY: 210, len: 150, maxAngle: .55, speed: .024 }],
                breakableWalls: [{ x: 3420, y: m.f(3420) }, { x: 10440, y: m.f(10440) }],
                rocks: [{ x: 8800, y: 600 }, { x: 13040, y: m.f(13040) }],
                breakableFloors: [{ x: 9310, y: 330, w: 128, h: 40 }],
                trapDoors: [{ x: 9438, y: 330, w: 48, period: 240, openDuration: 75 }],
                houdiniGroups: [{ triggerX: 11400, triggerY: 670, steps: [
                    { x: 11450, y: 650 }, { x: 11490, y: 616 }, { x: 11530, y: 582 }] }],
                spikeClusters: [{ x: 4450, y: 370 }, { x: 9640, y: 330 }],
                enemies: [940, 3620, 4480, 6770, 8890, 10500, 12750, 14340].map((x, i) => ({
                    kind: 'crab', type: ['burrobot', 'crab', 'caterkiller', 'motobug'][i % 4],
                    x, y: m.f(x), minX: x - 45, maxX: x + 45, vx: 1 }))
                    .concat([{ kind: 'buzz', type: 'chopper', x: 2810, y: 690, phase: 0 },
                        { kind: 'buzz', type: 'chopper', x: 6510, y: 770, phase: 2 },
                        { kind: 'buzz', type: 'buzz', x: 3300, y: 100, phase: 1 },
                        { kind: 'buzz', type: 'batbrain', x: 8150, y: 40, phase: 1.5 },
                        { kind: 'buzz', type: 'buzz', x: 11490, y: -155, phase: 0 }]),
                timePosts: [{ x: 4140, y: 580, kind: 'PAST' }, { x: 13800, y: 480, kind: 'FUTURE' }],
                bigRing: { x: 12130, y: -254 }, goalPost: { x: 15020, y: 480 }, capsule: null,
            };
        },
        setupObjects(r, t) {
            const z = t.z3a1;
            z.jets = [{ x: 1640, y: z.main.f(1640), power: -14.5 },
                { x: 5500, y: z.main.f(5500), power: -18 }, { x: 9690, y: 600, power: -14.5 }]
                .map(j => ({ ...j, cooldown: 0 }));
            z.respawnSerial = 0; z.current = false; z.sliding = false;
            for (let x = 450; x < 14800; x += 370) r.addSurfaceRings(z.main, x, 28, 6, 26);
            for (const s of z.roads) for (let x = s.x0 + 100; x < s.x1 - 190; x += 350) r.addSurfaceRings(s, x, 28, 6, 26);
            for (const loop of t.loops) r.addLoopRings(loop, 14);
            r.addRingLine(11960, -240, 26, 0, 8);
        },
        onUpdate(t, p, h) {
            const z = t.z3a1;
            if (p.gameOver || p.state === E.STATE.DYING || t.goalPost?.spinning || t.goalPost?.cleared) return;
            if (z.respawnSerial !== (p.respawnSerial || 0)) {
                z.respawnSerial = p.respawnSerial || 0;
                z.jets.forEach(j => { j.cooldown = 0; });
                z.current = z.sliding = false;
            }
            const feet = p.y + p.radii.height;
            const current = p.grounded && z.pools.some(w => p.x > w.x0 && p.x < w.x1 && feet > w.y && feet < w.y + 90);
            // Gentle, escapable flow. Left input can brake/reverse; jumping exits it.
            if (current && p.gsp >= 0) p.gsp = Math.min(16, p.gsp + .035 * h);
            const sliding = p.grounded && p.gsp > 1 && z.chutes.some(s => p.groundSurface === s.surface && p.x >= s.x0 && p.x <= s.x1);
            if (sliding) {
                p.curl(); p.state = E.STATE.ROLLING;
                p.gsp = Math.min(16, Math.max(7.5, p.gsp + .06 * h));
                if (!z.sliding) p.emit('waterSlide');
            }
            z.current = !!current; z.sliding = !!sliding;
            for (const j of z.jets) {
                j.cooldown = Math.max(0, j.cooldown - h);
                if (j.cooldown || Math.abs(p.x - j.x) > 30 || feet < j.y - 40 || feet > j.y + 12 || p.ysp < -1) continue;
                j.cooldown = 90;
                p.uncurl(); p.y = j.y - E.HITBOX.STAND.height - 3;
                p.state = E.STATE.AIRBORNE; p.groundSurface = null;
                p.xsp = Math.max(7.5, p.xsp); p.ysp = j.power;
                p.jumped = false; p.springTwirl = true; p.hurtPose = false;
                p.dropDashReady = p.dropDashCharging = false; p.dropDashCharge = 0;
                p.emit('waterJet', j);
            }
        },
        drawBackground: (c, g) => art('drawBackground', c, g),
        drawBack: (c, g) => art('drawBack', c, g),
        drawTerrain: (c, g) => art('drawTerrain', c, g),
        drawLoops: (c, g) => art('drawLoops', c, g),
        drawPlatform: (c, p, g) => art('drawPlatform', c, p, g),
        drawFront: (c, g) => art('drawFront', c, g),
        drawForeground: (c, g) => art('drawForeground', c, g),
        drawHUD: (c, g) => art('drawHUD', c, g),
    });
})(typeof window !== 'undefined' ? window : globalThis);
