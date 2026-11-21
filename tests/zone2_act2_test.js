/** Molten Sanctuary regressions: real routes, timed lava, reunion and shared objects. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
require('../public/levels/zone2_act1.js');
require('../public/levels/zone2_act2.js');

let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(events = {}) {
    const terrain = new Terrain('z2_act2');
    return { terrain, player: new Player(terrain, events) };
}
function simulate(player, seconds, controls, stop, hz = 60) {
    let previousJump = false;
    for (let frame = 0; frame < Math.ceil(seconds * hz); frame++) {
        const input = controls(frame * 60 / hz, player) || {};
        const jump = !!input.jump;
        player.update({ ...input, jumpHeld: jump, jumpPressed: jump && !previousJump }, 1 / hz);
        previousJump = jump;
        if (stop(player)) return frame / hz;
    }
    return null;
}
function speedRun(frame) {
    if (frame < 10) return { down: true };
    if (frame < 45) return { down: true, jump: [12, 20, 28, 36].some(n => frame >= n && frame < n + 2) };
    return { right: true };
}
function finished(terrain) { return terrain.goalPost.spinning || terrain.goalPost.cleared; }
function position(p) { return `x=${p.x.toFixed(1)} y=${p.y.toFixed(1)}`; }
function isolateLava(terrain) {
    // Remove unrelated encounters so a timer assertion cannot pass because a badnik hit first.
    terrain.enemies = []; terrain.rings = []; terrain.monitors = []; terrain.springs = [];
    terrain.spinners = []; terrain.bouncePoles = []; terrain.speedBoosters = []; terrain.dashRings = [];
}
function parkInLava(terrain, player) {
    const zone = terrain.z2a2.lavaZones[0];
    player.x = (zone.x0 + zone.x1) / 2;
    const feet = zone.surfaceY !== undefined ? zone.surfaceY + 2 : (zone.y0 + zone.y1) / 2;
    player.y = feet - player.radii.height;
    player.state = STATE.STANDING; player.curled = false;
    player.xsp = player.ysp = player.gsp = 0;
    return zone;
}

console.log('\nZone 2 Act 2 — Molten Sanctuary');

test('the supplied Rosie sprite and original sound effects ship with source attribution', () => {
    const sprite = fs.readFileSync(path.join(__dirname, '../public/assets/rosie.png'));
    assert(sprite.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert(sprite.readUInt32BE(16) === 524 && sprite.readUInt32BE(20) === 474,
        'Rosie must use the provided Sonic CD sprite atlas');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/sfx/sonic_cd_manifest.json'), 'utf8'));
    assert(manifest.ripper && manifest.sourceArchive && manifest.samples.length >= 4);
    for (const sample of manifest.samples) {
        const wav = fs.readFileSync(path.join(__dirname, '../public', sample.file));
        assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
        assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE');
        assert.strictEqual(crypto.createHash('sha256').update(wav).digest('hex'), sample.sha256,
            `${sample.key} must preserve the provided recording`);
    }
});
test('the campaign continues into a full lava-and-sanctuary act with the shared object kit', () => {
    const { terrain } = fixture(), z = terrain.z2a2;
    assert.strictEqual(terrain.levelDef.zone, 2);
    assert.strictEqual(terrain.levelDef.act, 2);
    assert.strictEqual(Terrain.LEVELS.z2_act1.nextStage, 'z2_act2');
    assert(terrain.endX >= 12000 && z.mainSurf === terrain.mainFloor);
    assert(z.upperRoads.length >= 2 && z.slides.length >= 2, 'the act needs branching skyways and actual slide routes');
    assert(z.lavaZones.length >= 2 && z.lifts.length > 0 && z.vents.length > 0,
        'lava galleries, sky lifts and thermal updrafts must be part of the level');
    assert.strictEqual(z.ignitionFrames, 900, 'the lava must ignite after fifteen seconds at 60 FPS');
    for (const key of ['rings', 'loops', 'monitors', 'starPosts', 'springs', 'platforms',
        'speedBoosters', 'enemies', 'swingPlatforms', 'spinners', 'breakableWalls',
        'breakableFloors', 'trapDoors', 'rocks', 'houdiniGroups']) {
        assert(terrain[key].length > 0, `the baseline ${key} must remain available in Act 2`);
    }
    assert(terrain.bigRing && terrain.goalPost && !terrain.capsule);
    assert(z.reunion.x < terrain.goalPost.x, 'Rosie must be encountered before the goal');
});

test('lava contact is safe before fifteen seconds and damaging afterward at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        let elapsed = 0, hitAt = null;
        const { terrain, player } = fixture({ ringLoss: () => { if (hitAt === null) hitAt = elapsed; } });
        isolateLava(terrain); parkInLava(terrain, player);
        player.rings = 10;
        for (let frame = 0; frame < Math.ceil(15.1 * hz); frame++) {
            elapsed = (frame + 1) / hz;
            terrain.updateObjects(player, 60 / hz);
            if (elapsed < 15 - 1 / hz) {
                assert.strictEqual(player.rings, 10, `${hz} Hz lava burned Scar before ignition`);
                assert.notStrictEqual(player.state, STATE.DYING);
            }
        }
        assert(hitAt !== null, `${hz} Hz lava must damage Scar after ignition`);
        assert(hitAt >= 15 - 1e-6 && hitAt <= 15 + 1 / hz + 1e-6,
            `${hz} Hz ignition occurred at ${hitAt.toFixed(5)} seconds`);
        assert(terrain.z2a2.lavaActive && terrain.z2a2.lavaAge >= 900);
        assert.strictEqual(player.rings, 0);
        assert.strictEqual(player.lives, 3, 'the recovery window must prevent an immediate second fatal hit');
        assert.notStrictEqual(player.state, STATE.DYING);
    }
});

test('hot lava respects shields, invincibility, recovery windows and the safe upper routes', () => {
    for (const protection of ['shield', 'invincibility', 'safe-height']) {
        const { terrain, player } = fixture();
        isolateLava(terrain); const zone = parkInLava(terrain, player);
        terrain.z2a2.lavaAge = terrain.z2a2.ignitionFrames;
        player.rings = 7;
        if (protection === 'shield') player.shield = true;
        if (protection === 'invincibility') player.invincTimer = 900;
        if (protection === 'safe-height') player.y = (zone.y0 ?? zone.surfaceY) - 100;
        terrain.updateObjects(player, 1);
        assert.strictEqual(player.rings, 7, `${protection} must protect Scar's rings`);
        if (protection === 'shield') {
            assert(!player.shield && player.invulnTimer > 0, 'lava should consume a shield and provide recovery');
            terrain.updateObjects(player, 1);
            assert.strictEqual(player.rings, 7, 'the next lava contact must respect recovery protection');
        }
        assert.notStrictEqual(player.state, STATE.DYING);
    }
});

test('the lava clock freezes during death, game over and completion', () => {
    for (const phase of ['dying', 'game-over', 'spinning', 'cleared']) {
        const { terrain, player } = fixture();
        isolateLava(terrain);
        terrain.z2a2.lavaAge = 120;
        if (phase === 'dying') player.state = STATE.DYING;
        if (phase === 'game-over') player.gameOver = true;
        if (phase === 'spinning') { terrain.goalPost.spinning = true; terrain.goalPost.spinTimer = 120; }
        if (phase === 'cleared') terrain.goalPost.cleared = true;
        for (let frame = 0; frame < 10; frame++) terrain.updateObjects(player, 1);
        assert.strictEqual(terrain.z2a2.lavaAge, 120, `the timer must pause during ${phase}`);
    }
});

test('each checkpoint respawns on a safe physical deck', () => {
    const { terrain, player } = fixture();
    for (const checkpoint of terrain.checkpoints) {
        terrain.activeCheckpoint = checkpoint;
        player.x = checkpoint.x + 100; player.y = terrain.deathY;
        player.respawn();
        assert.strictEqual(player.x, checkpoint.x);
        assert(player.grounded, `${checkpoint.name} must have safe ground`);
        assert(Math.abs(player.y + player.radii.height - checkpoint.y) < 4,
            `${checkpoint.name} selects the wrong height: ${position(player)}`);
        assert(!finished(terrain));
    }
});

test('thermal vents launch Scar once, and real sky lifts carry him with their collision decks', () => {
    for (const hz of [30, 60, 144]) {
        let launches = 0;
        const { terrain, player } = fixture({ thermalVent: () => launches++ });
        const vent = terrain.z2a2.vents[0];
        player.place(vent.x, 0, vent.y);
        terrain.updateObjects(player, 60 / hz);
        assert.strictEqual(launches, 1, `${hz} Hz vent must emit its real launch callback`);
        assert.strictEqual(player.state, STATE.AIRBORNE);
        assert(player.ysp < -12 && player.xsp >= 9.8 && player.springTwirl,
            'a thermal updraft must launch upward and forward with an airborne pose');
        player.x = vent.x; player.y = vent.y - player.radii.height;
        player.ysp = 2;
        terrain.updateObjects(player, 60 / hz);
        assert.strictEqual(launches, 1, 'the launch cooldown must prevent a second immediate blast');

        const lift = terrain.z2a2.lifts[0];
        assert(terrain.platforms.includes(lift) && lift.surface,
            'a sky lift must use the shared real platform collision surface');
        player.place(lift.x, 0, lift.y);
        assert.strictEqual(player.groundSurface, lift.surface, 'Scar must stand on the lift rather than an invisible proxy');
        const before = { x: player.x, y: player.y };
        terrain.updateObjects(player, 60 / hz);
        assert(Math.abs(player.x - before.x - lift.dx) < .001);
        assert(Math.abs(player.y - before.y - lift.dy) < .001);
        assert(Math.abs(lift.dy) > 0, 'the sky lift must actually change altitude');
    }
});

test('running and spin-dashing reach Rosie and the goal without losing a life at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) for (const [label, controls] of [
        ['spin-dash', speedRun], ['plain running', () => ({ right: true })],
    ]) {
        let deaths = 0, boosts = 0;
        const { terrain, player } = fixture({ deathStart: () => deaths++, boost: () => boosts++ });
        const elapsed = simulate(player, 65, controls, () => finished(terrain), hz);
        assert(elapsed !== null, `${hz} Hz ${label} route stalled at ${position(player)}`);
        assert.strictEqual(deaths, 0, `${hz} Hz ${label} route must not require dying`);
        assert(terrain.z2a2.reunion.met, 'the route must meet Rosie before the sign spins');
        assert(boosts > 0 && player.rings > 0, 'the speed route must offer real boosters and safety rings');
    }
});

test('the upper sanctuary routes reconnect to Rosie and a clearable goal', () => {
    const sample = fixture().terrain.z2a2.upperRoads;
    for (const hz of [30, 60, 144]) for (let index = 0; index < sample.length; index++) {
        let deaths = 0;
        const { terrain, player } = fixture({ deathStart: () => deaths++ });
        const deck = terrain.z2a2.upperRoads[index];
        const x = deck.x0 + Math.min(70, (deck.x1 - deck.x0) / 4);
        player.place(x, 0, deck.f(x));
        assert.strictEqual(player.groundSurface, deck, `skyway ${index + 1} must support entry`);
        const elapsed = simulate(player, 65, speedRun, () => finished(terrain), hz);
        assert(elapsed !== null, `${hz} Hz skyway ${index + 1} stalled at ${position(player)}`);
        assert.strictEqual(deaths, 0, `${hz} Hz skyway ${index + 1} needs a safe landing route`);
        assert(terrain.z2a2.reunion.met);
    }
});

test('collapsing sky bridges really drop onto a lower recovery road', () => {
    for (const hz of [30, 60, 144]) for (const index of [0, 1]) {
        const { terrain, player } = fixture();
        terrain.enemies = []; terrain.springs = []; terrain.monitors = [];
        const bridge = terrain.breakableFloors[index];
        player.place(bridge.x + bridge.w / 2, 0, bridge.y);
        assert.strictEqual(player.groundSurface, bridge.surface);
        simulate(player, 3, () => ({}), () => false, hz);
        assert(bridge.broken && player.y + player.radii.height > bridge.y + 50,
            `${hz} Hz bridge ${index + 1} must actually drop Scar when it collapses`);
        assert.strictEqual(player.lives, 3, 'a collapsing shortcut must provide a safe recovery below');
    }
});

test('Rosie is required for completion and her reunion reward cannot repeat', () => {
    const { terrain, player } = fixture();
    terrain.rings = [];
    player.place(terrain.goalPost.x + 1, 0, terrain.goalPost.y);
    player.update({}, 1 / 60);
    assert(!finished(terrain), 'a teleport past Rosie cannot skip the reunion');
    const reunion = terrain.z2a2.reunion;
    player.place(reunion.x - 24, 0, reunion.y);
    assert(simulate(player, 4, () => ({}), () => reunion.met) !== null,
        'approaching Rosie must complete the reunion automatically');
    const score = player.score;
    for (let frame = 0; frame < 240; frame++) terrain.updateObjects(player, 1);
    assert.strictEqual(player.score, score, 'the reunion cannot repeatedly grant its reward');
    player.place(terrain.goalPost.x + 1, 0, terrain.goalPost.y);
    player.update({}, 1 / 60);
    assert(finished(terrain), 'the real signpost must work once Rosie has been met');
});

test('badnik rescues animate real animals and resets restore every new mechanic without duplicate surfaces', () => {
    const { terrain, player } = fixture();
    const enemy = terrain.enemies.find(en => en.kind === 'crab');
    player.x = enemy.x; player.y = enemy.y - 14;
    player.state = STATE.AIRBORNE; player.curled = true;
    player.xsp = player.gsp = 0; player.ysp = 2;
    terrain.updateObjects(player, 1);
    assert(!enemy.alive && terrain.animals.length > 0, 'real badnik contact must free an animal');
    const animal = terrain.animals[0], poses = new Set();
    for (let frame = 0; frame < 120; frame++) {
        terrain.updateAnimals(player, 1); poses.add(animal.frame);
        assert(Number.isFinite(animal.x) && Number.isFinite(animal.y));
    }
    assert(poses.has(1) && poses.has(2), 'the freed animal must animate both movement poses');
    const dynamicCount = terrain.surfaces.filter(surface => surface.dynamicObject).length;
    for (let reset = 0; reset < 3; reset++) {
        terrain.z2a2.lavaAge = 1000;
        terrain.z2a2.reunion.met = true;
        terrain.resetObjects();
        assert.strictEqual(terrain.z2a2.lavaAge, 0);
        assert(!terrain.z2a2.lavaActive && !terrain.z2a2.reunion.met);
        assert.strictEqual(terrain.animals.length, 0);
        assert.strictEqual(terrain.surfaces.filter(surface => surface.dynamicObject).length, dynamicCount,
            'resetting must replace dynamic collision surfaces rather than accumulating them');
        assert(!finished(terrain));
    }
});

if (failures) { console.error(`\n${failures} Molten Sanctuary regression(s) failed.`); process.exitCode = 1; }
else console.log('  All Molten Sanctuary regressions passed.');
