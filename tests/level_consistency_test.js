/** Cross-act guarantees for Scar's shared formula, including future campaign registrations. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createGameHarness } = require('./helpers/game_harness');
const E = require('../public/sonic-engine');
const { Terrain, Player, STATE } = E;
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
for (const match of html.matchAll(/<script src="(levels\/[^"]+)"/g)) require('../public/' + match[1]);
const campaign = ['palmtree', ...Object.keys(Terrain.LEVELS).filter(id => Terrain.LEVELS[id].inCampaign !== false)];
const objectLists = ['platforms', 'swingPlatforms', 'bouncePoles', 'spinners', 'houdiniGroups',
    'breakableWalls', 'breakableFloors', 'trapDoors', 'rocks', 'speedBoosters', 'dashRings', 'rings',
    'enemies', 'timePosts', 'starPosts', 'monitors', 'springs', 'spikeClusters'];
function test(name, fn) { fn(); console.log('  ✓ ' + name); }
function fixture(stage, events = {}) {
    const terrain = new Terrain(stage);
    return { terrain, player: new Player(terrain, events) };
}
function park(player) {
    const cp = player.terrain.checkpoints[0];
    player.place(cp.x, 0, cp.y);
    return { x: player.x, y: player.y + player.radii.height };
}
function isolate(terrain) {
    // Keep real terrain and act hooks, but separate the object under test from other contacts.
    for (const key of objectLists) terrain[key] = [];
    terrain.bigRing = terrain.goalPost = terrain.capsule = null;
    // Molten Sanctuary's hook requires its real goal; keep it safely at the finish.
    if (terrain.z2a2) terrain.goalPost = { x: terrain.endX - 300, y: 560, locked: true };
}
function snapshot(terrain) {
    return JSON.stringify({
        lists: Object.fromEntries(objectLists.map(key => [key, terrain[key].map(obj => {
            const data = {};
            for (const [name, value] of Object.entries(obj)) {
                if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) data[name] = value;
            }
            return data;
        })])),
        surfaces: terrain.surfaces.length, lines: terrain.lines.length,
        goal: terrain.goalPost, bigRing: terrain.bigRing,
        capsule: terrain.capsule && { x: terrain.capsule.x, y: terrain.capsule.y,
            lockedUntilBoss: terrain.capsule.lockedUntilBoss, opened: terrain.capsule.opened },
    });
}

console.log('\nShared level formula (' + campaign.length + ' campaign acts)');
test('every campaign act has the foundation, explicit enemy species and a matching finish', () => {
    for (const stage of campaign) {
        const { terrain } = fixture(stage);
        for (const key of ['rings', 'loops', 'monitors', 'starPosts', 'springs', 'platforms', 'enemies', 'speedBoosters']) {
            assert(terrain[key].length, `${stage}: missing ${key}`);
        }
        assert(terrain.bigRing, `${stage}: missing giant-ring reward`);
        for (const enemy of terrain.enemies) {
            assert(enemy.type, `${stage}: enemy identity must be defined before rendering`);
            assert(Number.isFinite(enemy.baseX) && Number.isFinite(enemy.baseY));
        }
        if (terrain.levelDef?.isBossAct) {
            assert(terrain.boss && terrain.capsule?.lockedUntilBoss && !terrain.goalPost, `${stage}: boss finish`);
        } else assert(terrain.goalPost && !terrain.capsule, `${stage}: signpost finish`);
    }
});

test('run, variable jump, spin dash, peel-out and drop dash follow the same rules in every act', () => {
    for (const stage of campaign) for (const hz of [30, 60, 144]) {
        const { terrain, player } = fixture(stage);
        isolate(terrain);
        for (let n = 0; n < hz / 2; n++) player.update({ right: true }, 1 / hz);
        assert(Math.abs(player.gsp - E.PHYS.ACC * 30) < .00001, `${stage}/${hz}: acceleration`);
        park(player);
        player.update({ jumpPressed: true, jumpHeld: true }, 1 / hz);
        assert(player.state === STATE.AIRBORNE && player.curled && player.ysp < -5, `${stage}/${hz}: jump`);
        player.update({}, 1 / hz);
        assert(player.ysp >= E.PHYS.JMP_RELEASE_CAP, `${stage}/${hz}: short hop`);
        park(player);
        player.update({ down: true, jumpPressed: true, jumpHeld: true }, 1 / hz);
        assert.strictEqual(player.state, STATE.SPINDASH);
        for (let n = 0; n < 4; n++) {
            player.update({ down: true, jumpPressed: true, jumpHeld: true }, 1 / hz);
            player.update({ down: true }, 1 / hz);
        }
        player.update({}, 1 / hz);
        assert(player.state === STATE.ROLLING && player.gsp >= 8 && player.gsp <= 12, `${stage}/${hz}: spin dash`);
        park(player);
        player.update({ up: true, jumpPressed: true, jumpHeld: true }, 1 / hz);
        for (let n = 0; n < hz; n++) player.update({ up: true }, 1 / hz);
        player.update({}, 1 / hz);
        assert(player.gsp >= 11.9 && !player.curled && player.boostTrailTimer > 0, `${stage}/${hz}: peel-out`);
        park(player);
        player.y -= 160; player.curl(); player.state = STATE.AIRBORNE;
        player.xsp = player.gsp = player.ysp = 0;
        let ready = 0, landed = 0;
        player.events.dropDashReady = () => ready++;
        player.events.dropDash = () => landed++;
        for (let n = 0; n < hz * 3 && !landed; n++) {
            player.update({ jumpPressed: n === 0, jumpHeld: true }, 1 / hz);
        }
        assert(ready === 1 && landed === 1 && player.curled && player.gsp >= 8, `${stage}/${hz}: drop dash`);
    }
});

test('rings, giant rings and all monitor items keep identical rewards and lifetimes across acts', () => {
    for (const stage of campaign) for (const item of ['ring', 'bigRing', 'rings', 'shield', 'invinc', 'shoes', '1up']) {
        const { terrain, player } = fixture(stage);
        const anchor = park(player);
        isolate(terrain);
        if (item === 'ring') terrain.rings = [{ x: anchor.x, y: anchor.y - 19, collected: false }];
        else if (item === 'bigRing') terrain.bigRing = { x: anchor.x, y: anchor.y - 19, collected: false, flashTimer: 0 };
        else terrain.monitors = [{ x: anchor.x, y: anchor.y, item, broken: false }];
        player.curl(); player.state = STATE.AIRBORNE; player.ysp = 1;
        terrain.updateObjects(player, 1);
        const expected = { ring: [1, 10], bigRing: [50, 10000], rings: [10, 100],
            shield: [0, 100], invinc: [0, 200], shoes: [0, 100], '1up': [0, 0] }[item];
        assert.deepStrictEqual([player.rings, player.score], expected, `${stage}/${item}: reward`);
        assert.strictEqual(!!player.shield, item === 'shield');
        assert.strictEqual(player.invincTimer || 0, item === 'invinc' ? 900 : 0);
        assert.strictEqual(player.shoesTimer || 0, item === 'shoes' ? 900 : 0);
        assert.strictEqual(player.lives, item === '1up' ? 4 : 3);
        terrain.updateObjects(player, 1);
        assert.deepStrictEqual([player.rings, player.score], expected, `${stage}/${item}: single reward`);
        player.addRings(100);
        assert.strictEqual(player.lives, item === '1up' ? 5 : 4, `${stage}: ring milestone`);
    }
});

test('shield damage, ring scattering and checkpoint death recovery are uniform', () => {
    for (const stage of campaign) {
        const { terrain, player } = fixture(stage);
        player.shield = true; player.rings = 25;
        terrain.hurtPlayer(player, player.x + 20);
        assert(!player.shield && player.rings === 25 && player.invulnTimer === 120);
        assert.strictEqual(terrain.scatteredRings.length, 0);
        player.invulnTimer = 0;
        terrain.hurtPlayer(player, player.x + 20);
        assert.strictEqual(player.rings, 0);
        assert.strictEqual(terrain.scatteredRings.length, 16);
        terrain.hurtPlayer(player, player.x + 20);
        assert.strictEqual(terrain.scatteredRings.length, 16, 'protected contact cannot hit twice');
        const cp = terrain.checkpoints[0];
        terrain.activeCheckpoint = cp;
        player.invulnTimer = 0;
        terrain.hurtPlayer(player, player.x + 20);
        assert.strictEqual(player.state, STATE.DYING);
        for (let n = 0; n < 70 && player.state === STATE.DYING; n++) player.update({}, 1 / 60);
        assert.strictEqual(player.lives, 2);
        assert.strictEqual(player.x, cp.x);
        assert(player.invulnTimer > 0 && player.rings === 0 && !player.shield);
    }
});

test('repeated resets restore all placements, enemy identities and collision surfaces without growth', () => {
    for (const stage of campaign) {
        const { terrain, player } = fixture(stage);
        const initial = snapshot(terrain);
        for (let n = 0; n < 5; n++) {
            terrain.rings[0].collected = true; terrain.monitors[0].broken = true;
            terrain.enemies[0].alive = false; terrain.enemies[0].x += 100;
            terrain.bigRing.collected = true;
            terrain.spawnAnimal(player.x, player.y);
            terrain.scatteredRings.push({ x: 100, y: 100, vx: 0, vy: 0, life: 160 });
            terrain.activeCheckpoint = terrain.checkpoints.at(-1);
            terrain.resetObjects();
            assert.strictEqual(snapshot(terrain), initial, `${stage}: reset ${n}`);
            assert(!terrain.animals.length && !terrain.scatteredRings.length && !terrain.activeCheckpoint);
        }
    }
});

test('new acts inherit stable enemy defaults and use the same species for sprites and motion', () => {
    const h = createGameHarness();
    try {
        const Engine = h.sandbox.SonicEngine;
        Engine.Terrain.registerLevel('consistency_defaults', {
            inCampaign: false, endX: 2000, objects: { goalPost: null, enemies: [
                { kind: 'crab', x: 600, y: 600, minX: 550, maxX: 650 },
                { kind: 'buzz', x: 800, y: 400 },
                { kind: 'buzz', type: 'chopper', x: 1000, y: 550 },
            ] },
        });
        h.game.loadStage('consistency_defaults', { skipTitleCard: true, skipFade: true });
        const terrain = h.game.terrain;
        assert.deepStrictEqual(Array.from(terrain.enemies, enemy => enemy.type), ['crab', 'buzz', 'chopper']);
        const crab = terrain.enemies[0], hover = terrain.enemies[1], fish = terrain.enemies[2];
        const frames = [];
        const drawImage = h.ctx.drawImage;
        h.ctx.drawImage = (source, ...args) => {
            if (source === h.game.enemySheet) frames.push(args.slice(0, 4));
            return drawImage(source, ...args);
        };
        h.game.drawEnemy(h.ctx, crab, 0);
        terrain.enemies.reverse();
        h.game.drawEnemy(h.ctx, crab, 2);
        assert.strictEqual(frames.length, 2);
        assert.deepStrictEqual(frames[0], frames[1], 'reordering enemies must not change a Crabmeat sprite into another species');
        terrain.updateObjects(h.game.player, 1);
        assert.strictEqual(fish.x, fish.baseX, 'leaping fish keep their vertical trajectory');
        assert(fish.y < fish.baseY, 'leaping fish rise from their base');
        assert.notStrictEqual(hover.x, hover.baseX, 'flying defaults use hover motion');
    } finally { h.dispose(); }
});

test('shared action sounds, trap-door feedback, title cards and campaign carryover work in every act', () => {
    const h = createGameHarness();
    try {
        const calls = [];
        const cues = { jump: 'jump', roll: 'roll', spindashRev: 'rev', spindashRelease: 'release',
            peeloutRev: 'peeloutRev', peeloutRelease: 'peeloutRelease', dropDashReady: 'dropDashReady',
            dropDash: 'dropDashRelease', dashRing: 'dashRing', ring: 'ring', ringLoss: 'ringLoss',
            oneUp: 'oneUp', bouncePole: 'bouncePole', enemyPop: 'spinner', breakWall: 'shatter',
            breakRock: 'shatter', breakFloor: 'shatter', checkpoint: 'timePost', timeWarp: 'timeWarp',
            goalPost: 'goalPost', deathStart: 'death', trapDoor: 'trapDoor' };
        for (const method of new Set([...Object.values(cues), 'scarVoice'])) h.audio[method] = (...args) => calls.push([method, ...args]);
        assert.deepStrictEqual(Array.from(h.game.getCampaignStages()), campaign);
        for (const stage of campaign) {
            h.game.loadStage(stage, { skipFade: true });
            assert(h.game.titleCard?.zoneName && h.game.titleCard.act >= 1, `${stage}: title card`);
            for (const [event, method] of Object.entries(cues)) {
                calls.length = 0;
                h.game.player.emit(event, { x: h.game.player.x, y: h.game.player.y, ysp: 0, isOpen: true });
                assert(calls.some(call => call[0] === method), `${stage}: missing ${event} sound`);
            }
            h.game.loadStage(stage, { skipTitleCard: true, skipFade: true });
            const terrain = h.game.terrain, player = h.game.player;
            // Exercise a real phase change on every stage that places trap doors.
            if (terrain.trapDoors.length) {
                const door = terrain.trapDoors[0];
                terrain.clock = door.period - door.openDuration - door.phase - 1;
                player.x = door.x; player.y = door.y - 100;
                calls.length = 0;
                terrain.updateObjects(player, 2);
                assert(calls.some(call => call[0] === 'trapDoor' && call[1] === true), `${stage}: opening cue`);
                terrain.clock = door.period - door.phase - 1;
                calls.length = 0;
                terrain.updateObjects(player, 2);
                assert(calls.some(call => call[0] === 'trapDoor' && call[1] === false), `${stage}: closing cue`);
            }
            h.game.player.score = 12345; h.game.player.lives = 5; h.game.player.shield = true;
            h.game.player.rings = 73; h.game.player.invincTimer = h.game.player.shoesTimer = 800;
            const next = h.game.getNextCampaignStage();
            if (next) {
                h.game.loadStage(next, { carryover: true });
                const p = h.game.player;
                assert(p.score === 12345 && p.lives === 5 && p.shield, `${stage}: carryover`);
                assert(p.rings === 0 && !p.invincTimer && !p.shoesTimer && h.game.stageTime === 0);
            }
        }
    } finally { h.dispose(); }
});
