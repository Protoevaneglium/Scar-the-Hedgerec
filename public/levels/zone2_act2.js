/** Zone 2 Act 2 — Molten Sanctuary: marble chutes below, floating temples above. */
(function (root) {
    'use strict';
    const E = root.SonicEngine || (typeof require === 'function' ? require('../sonic-engine.js') : null);
    if (!E) return;
    const { STATE, HITBOX } = E;
    const NPC = root.RosieNPC || (typeof require === 'function' ? require('./rosie_npc.js') : null);
    const Dialogue = root.RosieDialogue || (typeof require === 'function' ? require('./rosie_dialogue.js') : null);
    const rise = (p, width, dy) => p.ease(width / 2, 0, 2 * dy / width).ease(width / 2, 2 * dy / width, 0);
    const art = (method, ...args) => {
        if (root.MarbleSkyArt && root.MarbleSkyArt[method]) root.MarbleSkyArt[method](...args);
    };
    E.Terrain.registerLevel('z2_act2', {
        title: 'Molten Sanctuary Act 2', zone: 2, zoneName: 'MOLTEN SANCTUARY', act: 2,
        isBossAct: false, nextStage: null, bgm: 'assets/marble_canopy_act1.wav',
        startX: 0, endX: 14400, deathY: 1500, probeY: -900,
        cameraMinY: -620, cameraMaxY: 700, wallJump: true, smoothPresentation: false,
        animalZone: 'mz', animalTypes: ['locky', 'wocky'],
        theme: { skyTop: '#ac588b', skyMid: '#f3a3ae', skyBottom: '#ffe7bf',
            groundA: '#8a67ab', groundB: '#463454', trimColor: '#759d44', trimHighlight: '#f6ecac' },

        buildTerrain(b, terrain) {
            const p = b.path(0, 360).flat(600);
            rise(p, 1200, 360); p.flat(1800);
            rise(p, 600, -180); p.flat(900);
            rise(p, 900, 240); p.flat(1600);
            rise(p, 1000, -220); p.flat(1200);
            rise(p, 700, 160); p.flat(1300);
            rise(p, 1200, -160); p.flat(1400);
            const mainSurf = b.addFloor(p, { name: 'molten marble recovery road' });
            b.addLoop(3060, 600, 120, 'Basalt Furnace Loop');
            b.addLoop(6950, 650, 130, 'Molten Gallery Loop');
            b.addLoop(9150, 455, 105, 'Cloud Gate Loop');
            b.addLoop(13120, 450, 110, 'Sanctuary Home Loop');

            const a = b.path(1500, 280).flat(1500); rise(a, 600, 180); a.flat(200); rise(a, 700, 80);
            const upperA = b.addShelf(a, { name: 'ivory aqueduct slide', tier: 'high' });
            const d = b.path(4700, 180).flat(1400); rise(d, 1600, 160); rise(d, 900, 220);
            const upperB = b.addShelf(d, { name: 'sky sanctuary spiral expressway', tier: 'high' });
            const e = b.path(8900, -100).flat(1800); rise(e, 800, 300); e.flat(500); rise(e, 1000, 360);
            const upperC = b.addShelf(e, { name: 'cloud sea homeward chute', tier: 'high' });
            const upperRoads = [upperA, upperB, upperC];
            upperRoads.forEach(f => { f.thickness = 64; });
            // Leave landing room after each updraft before the next loop entrance.
            b.addLoop(2800, 180, 100, 'Ivory Aqueduct Loop');
            b.addLoop(5900, 75, 105, 'Sun Temple Sky Loop');
            b.addLoop(10500, -205, 105, 'Sky Sanctuary Crown Loop');

            const lavaZones = [
                { name: 'Basalt Furnace', x0: 1900, x1: 2700, surfaceY: 720, y0: 710, y1: 1040 },
                { name: 'Molten Gallery', x0: 6020, x1: 6580, surfaceY: 780, y0: 770, y1: 1100 },
                { name: 'Last Lava Crossing', x0: 10600, x1: 11520, surfaceY: 720, y0: 710, y1: 1040 },
            ];
            const basalt = [];
            for (const zone of lavaZones) for (let x = zone.x0 + 50; x < zone.x1 - 50; x += 160) {
                const f = b.addShelf(b.path(x, zone.surfaceY - 28).flat(100), { name: 'cool basalt stepping stone', tier: 'mid' });
                f.thickness = 42; f.basalt = true; basalt.push(f);
            }
            const balcony = b.addShelf(b.path(11800, 20).flat(300), { name: 'giant ring cloud balcony', tier: 'high' });
            balcony.thickness = 60;
            // These optional bridges sit ABOVE the skyway: when they collapse,
            // Scar really drops to the recovery deck rather than an overlapping floor.
            const bridgeLandings = [
                b.addShelf(b.path(7500, 180).flat(280), { name: 'crumbling temple approach', tier: 'high' }),
                b.addShelf(b.path(7908, 180).flat(312), { name: 'crumbling temple landing', tier: 'high' }),
                b.addShelf(b.path(12228, 80).flat(252), { name: 'cloud bridge landing', tier: 'high' }),
            ];
            bridgeLandings.forEach(f => { f.thickness = 38; });
            const galleryRoof = b.addShelf(b.path(5750, 570).flat(980), { name: 'lava gallery roof', tier: 'mid' });
            galleryRoof.thickness = 52;
            b.addCeiling(b.path(5750, 622).flat(980), { name: 'lava gallery ceiling' });
            // Wall kicks provide an alternative to the automatic thermal launch.
            const shafts = [{ x0: 4550, x1: 4710, top: 180, bottom: 474 }, { x0: 8740, x1: 8900, top: -100, bottom: 492 }];
            for (const s of shafts) {
                b.addWall(s.x0, s.top, s.x0, s.bottom, 1, 0, 'sanctuary climb left', { wallJump: true });
                b.addWall(s.x1, s.top, s.x1, s.bottom, -1, 0, 'sanctuary climb right', { wallJump: true });
            }
            terrain.z2a2 = { mainSurf, upperRoads, upperA, upperB, upperC, basalt, balcony, galleryRoof, shafts, lavaZones,
                slides: [{ x0: 600, x1: 1800 }, { x0: 5100, x1: 6000 }, { x0: 9800, x1: 10500 },
                    { x0: 3000, x1: 3600 }, { x0: 6100, x1: 7700 }, { x0: 10700, x1: 11500 }] };
            terrain.sections = [{ name: 'Marble Chute', x: 0 }, { name: 'Furnace & Aqueduct', x: 1900 },
                { name: 'Molten Gallery', x: 5100 }, { name: 'Sky Sanctuary', x: 8580 }, { name: 'Rosie Reunion', x: 13700 }];
        },
        checkpoints: [
            { name: '1. Marble Chute', x: 120, y: 360 },
            { name: '2. Ivory Aqueduct', x: 1560, y: 280 },
            { name: '3. Gallery Launch', x: 4310, y: 527.069 },
            { name: '4. Temple Skyway', x: 4780, y: 180 },
            { name: '5. Cloud Gate', x: 8480, y: 550.96 },
            { name: '6. Sanctuary Crown', x: 8970, y: -100 },
            { name: '7. Rosie’s Sanctuary', x: 13740, y: 560 },
        ],
        objects(terrain) {
            const z = terrain.z2a2, m = z.mainSurf;
            return {
                monitors: [{ x: 310, y: 360, item: 'shield' }, { x: 1690, y: 280, item: 'shoes' },
                    { x: 3730, y: m.f(3730), item: 'rings' }, { x: 4900, y: 180, item: 'shoes' },
                    { x: 7770, y: m.f(7770), item: 'shield' }, { x: 9070, y: -100, item: 'shoes' },
                    { x: 11950, y: 20, item: '1up' }, { x: 13120, y: 560, item: 'invinc' }],
                starPosts: [4200, 7700, 8460, 12940, 13640].map(x => ({ x, y: m.f(x) })),
                springs: [{ x: 3600, y: m.f(3600), color: 'yellow', power: -11.5 },
                    { x: 7520, y: 340, color: 'red', power: -13.5 },
                    { x: 11680, y: z.upperC.f(11680), color: 'red', power: -12.5 }],
                speedBoosters: [530, 2860, 4220, 6790, 8090, 8930, 11720, 13100, 13560].map(x => ({ x, y: m.f(x), boost: 12.8 }))
                    .concat([{ x: 1590, y: 280, boost: 12.4 }, { x: 1900, y: 280, boost: 12.8 },
                        { x: 2510, y: 280, boost: 12.8 },
                        { x: 4800, y: 180, boost: 12.6 }, { x: 5050, y: 180, boost: 12.8 }, { x: 5640, y: 180, boost: 12.8 },
                        { x: 8960, y: -100, boost: 12.8 }, { x: 9180, y: -100, boost: 13.2 }, { x: 10100, y: -100, boost: 13.2 }]),
                dashRings: [{ x: 4060, y: 350, angleDeg: -8, boost: 13 }, { x: 8170, y: 370, angleDeg: -14, boost: 13 },
                    { x: 12480, y: 270, angleDeg: 14, boost: 13.4 }],
                platforms: [{ kind: 'skyLift', x: 1730, y: 440, w: 104, ampY: 200, speed: .018, phase: Math.PI / 2 },
                    { kind: 'skyLift', x: 4630, y: 345, w: 104, ampY: 165, speed: .018, phase: Math.PI / 2 },
                    { kind: 'skyLift', x: 8820, y: 230, w: 112, ampY: 330, speed: .016, phase: Math.PI / 2 },
                    { x: 12570, y: 45, w: 88, ampX: 65, ampY: 45, speed: .025 }],
                bouncePoles: [{ x: 466, y: 338, power: -9.5 }, { x: 7350, y: 756, power: -10.8 }],
                spinners: [{ x: 5520, y: 670 }, { x: 7420, y: 650 }, { x: 10030, y: 90 }],
                swingPlatforms: [{ pivotX: 2780, pivotY: 320, len: 130, maxAngle: .6, speed: .026 },
                    { pivotX: 12090, pivotY: -110, len: 145, maxAngle: .65, speed: .022 }],
                breakableWalls: [{ x: 3520, y: m.f(3520) }, { x: 7980, y: m.f(7980) }],
                rocks: [{ x: 1120, y: m.f(1120) }, { x: 12680, y: m.f(12680) }],
                breakableFloors: [{ x: 7780, y: 180, w: 128, h: 40 }, { x: 12100, y: 80, w: 128, h: 40 }],
                trapDoors: [{ x: 6720, y: 570, w: 64, period: 240, openDuration: 70 }],
                houdiniGroups: [{ triggerX: 11500, triggerY: 680, steps: [
                    { x: 11540, y: 650 }, { x: 11580, y: 615 }, { x: 11620, y: 580 }, { x: 11660, y: 545 }] }],
                enemies: [680, 3240, 3890, 5440, 7120, 7840, 9660, 11790, 12740].map(x => ({
                    kind: 'crab', x, y: m.f(x), minX: x - 45, maxX: x + 45, vx: 1.2 }))
                    .concat([{ kind: 'buzz', x: 2350, y: 175, phase: .2 }, { kind: 'buzz', x: 5570, y: 40, phase: 2 },
                        { kind: 'buzz', x: 9630, y: -195, phase: 1 }, { kind: 'buzz', x: 11100, y: 100, phase: .7 }]),
                spikeClusters: [{ x: 6740, y: 570 }],
                timePosts: [{ x: 3820, y: m.f(3820), kind: 'PAST' }, { x: 13230, y: 560, kind: 'FUTURE' }],
                bigRing: { x: 11950, y: -24 }, goalPost: { x: 14100, y: 560 }, capsule: null,
            };
        },
        setupObjects(r, terrain) {
            const z = terrain.z2a2;
            z.lavaAge = 0; z.ignitionFrames = 900; z.lavaActive = false;
            z.reunion = NPC.create(13920, 560);
            z.reunion.conversation = Dialogue.create();
            z.vents = [{ x: 1320, power: -14.5 }, { x: 4310, power: -16 }, { x: 8580, power: -18.5 }]
                .map(v => ({ ...v, y: z.mainSurf.f(v.x), phase: 0, active: true, cooldown: 0 }));
            z.lifts = terrain.platforms.filter(p => p.kind === 'skyLift');
            z.playerRespawnSerial = 0;
            terrain.goalPost.locked = true;
            for (let x = 390; x < 13600; x += 440) r.addSurfaceRings(z.mainSurf, x, 25, 6, 26);
            for (const f of z.upperRoads) for (let x = f.x0 + 90; x < f.x1 - 160; x += 410) r.addSurfaceRings(f, x, 25, 6, 26);
            for (const f of z.basalt) r.addRingLine(f.x0 + 20, f.f(f.x0) - 28, 28, 0, 3);
            for (const loop of terrain.loops) r.addLoopRings(loop, 14);
            r.addRingLine(13740, 530, 30, 0, 6);
            r.addRingLine(11840, -12, 30, 0, 7);
        },
        onUpdate(terrain, player, h, input = {}) {
            const z = terrain.z2a2, gp = terrain.goalPost;
            if (player.gameOver || player.state === STATE.DYING) {
                NPC.cancelHug(z.reunion); Dialogue.close(z.reunion.conversation); return;
            }
            if (gp.spinning || gp.cleared) {
                Dialogue.close(z.reunion.conversation); NPC.finish(z.reunion, h); return;
            }
            if (z.playerRespawnSerial !== (player.respawnSerial || 0)) {
                z.playerRespawnSerial = player.respawnSerial || 0;
                for (const v of z.vents) v.cooldown = 0;
                // A retry must not leave Rosie walking after a distant checkpoint.
                NPC.resetAfterRespawn(z.reunion);
            }
            const previousAge = z.lavaAge;
            z.lavaAge += h;
            z.lavaActive = z.lavaAge >= z.ignitionFrames - 1e-6;
            const secondsLeft = Math.ceil((z.ignitionFrames - z.lavaAge) / 60);
            if (secondsLeft > 0 && secondsLeft <= 5 && secondsLeft !== Math.ceil((z.ignitionFrames - previousAge) / 60)) {
                player.emit('heatWarning');
            }
            if (previousAge < z.ignitionFrames - 1e-6 && z.lavaActive) player.emit('lavaIgnite');
            const feet = player.y + player.radii.height;
            if (z.lavaActive && player.invulnTimer <= 0 && !(player.invincTimer > 0)) {
                const lava = z.lavaZones.find(l => player.x >= l.x0 && player.x <= l.x1 && feet >= l.y0 && feet <= l.y1);
                if (lava) { terrain.hurtPlayer(player, player.x + (player.facing || 1) * 24); player.emit('lavaBurn'); }
            }
            if (player.state === STATE.DYING) return;
            for (const v of z.vents) {
                v.cooldown = Math.max(0, v.cooldown - h);
                if (v.active && v.cooldown <= 0 && Math.abs(player.x - v.x) <= 36
                    && feet >= v.y - 52 && feet <= v.y + 14 && player.ysp >= -1) {
                    v.cooldown = 90;
                    player.uncurl(); player.y = v.y - HITBOX.STAND.height - 3;
                    player.state = STATE.AIRBORNE; player.groundSurface = null;
                    player.xsp = Math.max(9.8, player.xsp); player.ysp = v.power;
                    player.jumped = false; player.springTwirl = true; player.hurtPose = false;
                    player.dropDashReady = false; player.dropDashCharging = false; player.dropDashCharge = 0;
                    player.emit('thermalVent', v);
                }
            }
            const sliding = player.grounded && player.gsp > 1 && player.groundSurface
                && player.groundSurface.kind === 'height' && player.groundSurface.df(player.x) > .07
                && z.slides.some(s => player.x >= s.x0 && player.x <= s.x1);
            if (sliding) {
                player.curl(); player.state = STATE.ROLLING;
                player.gsp = Math.min(16, Math.max(8.5, player.gsp + .08 * h));
                if (!player.onMarbleSlide) player.emit('marbleSlide');
            }
            player.onMarbleSlide = !!sliding;
            const rosie = z.reunion;
            const reaction = NPC.update(rosie, player, { ...input,
                dialogueOpen: Dialogue.view(rosie.conversation).open }, h);
            if (reaction.met) {
                player.score += 1000;
                terrain.popups.push({ x: rosie.x, y: rosie.y - 70, text: 'ROSIE! +1000', life: 120 });
                player.emit('rosieReunion', rosie);
            }
            if (reaction.talk) player.emit('rosieTalk', rosie);
            if (reaction.hop) player.emit('rosieHop', rosie);
            if (reaction.hug) { rosie.hugged = true; player.emit('rosieHug', rosie); }
            gp.locked = !rosie.met || rosie.timer > 0;
        },
        drawBackground: (c, g) => art('drawBackground', c, g),
        drawBack: (c, g) => art('drawBack', c, g),
        drawLoops: (c, g) => art('drawLoops', c, g),
        drawTerrain: (c, g) => art('drawTerrain', c, g),
        drawPlatform: (c, p) => art('drawPlatform', c, p),
        drawFront: (c, g) => art('drawFront', c, g),
        drawForeground: (c, g) => art('drawForeground', c, g),
        drawHUD: (c, g) => art('drawHUD', c, g),
    });
})(typeof window !== 'undefined' ? window : globalThis);
