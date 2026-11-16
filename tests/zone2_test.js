/** Marble Canopy gameplay regressions using the real, frame-rate-independent engine. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
require('../public/levels/zone2_act1.js');

let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(events = {}) {
    const terrain = new Terrain('z2_act1');
    return { terrain, player: new Player(terrain, events) };
}
function simulate(player, seconds, controls, stop, hz) {
    let previousJump = false;
    for (let i = 0; i < Math.ceil(seconds * hz); i++) {
        const input = controls(i * 60 / hz, player) || {};
        const jump = !!input.jump;
        player.update({ ...input, jumpHeld: jump, jumpPressed: jump && !previousJump }, 1 / hz);
        previousJump = jump;
        if (stop(player)) return i / hz;
    }
    return null;
}
function spinDashThenRun(frame) {
    if (frame < 10) return { down: true };
    if (frame < 45) return { down: true, jump: [12, 20, 28, 36].some(n => frame >= n && frame < n + 2) };
    return { right: true };
}
function shaftControls(frame, player, shaft) {
    const nearLeft = player.x < shaft.x0 + 22;
    const nearRight = player.x > shaft.x1 - 22;
    const direction = nearLeft ? -1 : nearRight ? 1 : Math.sign(player.xsp) || 1;
    return {
        left: direction < 0, right: direction > 0,
        jump: (player.grounded || nearLeft || nearRight) && frame % 8 < 2,
    };
}
function upperRouteControls(frame, player) {
    const shaft = player.terrain.z2.shafts.find(s => player.x > s.x0 - 16 && player.x < s.x1 + 16
        && player.y > s.top - 40 && player.y < s.bottom + 20);
    return shaft ? shaftControls(frame, player, shaft) : spinDashThenRun(frame);
}
function atGoal(terrain) { return terrain.goalPost.spinning || terrain.goalPost.cleared; }
function position(player) { return `x=${player.x.toFixed(1)} y=${player.y.toFixed(1)}`; }

console.log('\nZone 2 Act 1 — Marble Canopy');
test('the act has its own soundtrack, marked climbs, recovery road, and a normal goal', () => {
    const { terrain } = fixture();
    const def = terrain.levelDef;
    assert.strictEqual(def.zone, 2);
    assert.strictEqual(def.act, 1);
    assert(def.wallJump && !def.isBossAct);
    assert.strictEqual(terrain.z2.shafts.length, 4);
    assert(terrain.endX >= 10000, 'the new zone needs a complete speed course');
    assert(terrain.z2.mainSurf === terrain.mainFloor);
    assert(terrain.goalPost && !terrain.capsule);
    assert(def.bgm && def.bgm !== 'assets/level1.mp3', 'Zone 2 needs a distinct soundtrack');
    assert(fs.existsSync(path.join(__dirname, '../public', def.bgm)), 'the soundtrack must ship with the game');
    for (const shaft of terrain.z2.shafts) {
        const walls = terrain.lines.filter(s => s.wallJump && (s.x1 === shaft.x0 || s.x1 === shaft.x1));
        assert(walls.some(w => w.nx > .95) && walls.some(w => w.nx < -.95), 'each shaft needs two real kickable walls');
        assert(shaft.bottom < terrain.z2.mainSurf.f((shaft.x0 + shaft.x1) / 2) - 40,
            'optional climbs must leave the recovery road open');
    }
});

test('a fast recovery-road run reaches the goal without losing a life at 30, 60, and 144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        let deaths = 0, boosts = 0;
        const visited = new Set();
        const { terrain, player } = fixture({ deathStart: () => deaths++, boost: () => boosts++ });
        const elapsed = simulate(player, 60, spinDashThenRun, p => {
            if (p.groundSurface) visited.add(p.groundSurface);
            return atGoal(terrain);
        }, hz);
        assert(elapsed !== null, `${hz} Hz recovery run stalled at ${position(player)}`);
        assert.strictEqual(deaths, 0, `${hz} Hz recovery run should preserve a life`);
        assert(player.rings > 0, `${hz} Hz road needs collectible safety rings`);
        assert(boosts > 0, `${hz} Hz run should use the stage's speed boosters`);
        assert(terrain.loops.some(loop => visited.has(loop.arc0) && visited.has(loop.arc1)),
            `${hz} Hz fast route must traverse a complete loop`);
        assert(elapsed < 50, `${hz} Hz recovery route should maintain fast pacing; ${elapsed.toFixed(2)} seconds`);
    }
});

test('all four shafts slide and climb with alternating wall kicks at every supported refresh rate', () => {
    for (const hz of [30, 60, 144]) for (let index = 0; index < 4; index++) {
        let kicks = 0, deaths = 0;
        const directions = new Set();
        const { terrain, player } = fixture({
            wallJump: event => { kicks++; directions.add(event.direction); },
            deathStart: () => deaths++,
        });
        const shaft = terrain.z2.shafts[index];
        player.x = shaft.x0 + 12;
        // Keep the initial feet clear of entrance springs while touching the wall.
        player.y = shaft.bottom - 26;
        player.state = STATE.AIRBORNE;
        player.curled = false;
        player.xsp = 0; player.ysp = 2;
        player.update({ left: true }, 1 / 60);
        assert.strictEqual(player.wallSlide, -1, `shaft ${index + 1} needs a real left-wall slide`);
        const elapsed = simulate(player, 18, (frame, p) => shaftControls(frame, p, shaft),
            p => p.y < shaft.top - 30, hz);
        assert(elapsed !== null, `${hz} Hz shaft ${index + 1} climb stalled at ${position(player)}`);
        assert(kicks >= 2 && directions.has(-1) && directions.has(1), 'a climb must exercise both wall kick directions');
        assert.strictEqual(deaths, 0, `shaft ${index + 1} climb should preserve a life`);
    }
});

test('checkpoint respawns place Scar on safe terrain with the goal still available', () => {
    const { terrain, player } = fixture();
    for (const checkpoint of terrain.checkpoints) {
        terrain.activeCheckpoint = { x: checkpoint.x, y: checkpoint.y };
        player.x = checkpoint.x + 100;
        player.y = terrain.deathY;
        player.state = STATE.AIRBORNE;
        player.respawn();
        assert.strictEqual(player.x, checkpoint.x, 'respawn must honor the activated checkpoint');
        assert(player.grounded, `${checkpoint.name} must start on a real floor`);
        assert(Math.abs(player.y + player.radii.height - checkpoint.y) < 4,
            `${checkpoint.name} respawn selected the wrong floor: ${position(player)}`);
        assert(player.y < terrain.deathY - 100);
        assert(!atGoal(terrain), 'loading a checkpoint cannot clear the act');
    }
});

test('each upper expressway runs forward and reconnects to a clearable goal at 30, 60, and 144 Hz', () => {
    for (const hz of [30, 60, 144]) for (const key of ['upperA', 'upperB', 'upperC', 'finale']) {
        let deaths = 0;
        const visited = new Set();
        const { terrain, player } = fixture({ deathStart: () => deaths++ });
        const deck = terrain.z2[key];
        assert(deck, `${key} should be a playable upper route`);
        const x = deck.x0 + Math.min(100, (deck.x1 - deck.x0) / 4);
        player.place(x, 0, deck.f(x));
        assert.strictEqual(player.groundSurface, deck, `${key} must support a safe entry`);
        const elapsed = simulate(player, 60, upperRouteControls, p => {
            if (p.groundSurface) visited.add(p.groundSurface);
            return atGoal(terrain);
        }, hz);
        assert(elapsed !== null, `${hz} Hz ${key} failed to reconnect at ${position(player)}`);
        assert.strictEqual(deaths, 0, `${hz} Hz ${key} should preserve a life`);
        if (key === 'upperC') {
            const loop = terrain.loops.find(l => l.name === 'Floating Sanctuary Loop');
            assert(loop && visited.has(loop.arc0) && visited.has(loop.arc1),
                `${hz} Hz sanctuary route must complete its sky loop through both collision layers`);
        }
    }
});

test('the sanctuary reward spring lands on its treasure balcony at every supported refresh rate', () => {
    for (const hz of [30, 60, 144]) {
        let launched = false, deaths = 0;
        const { terrain, player } = fixture({ deathStart: () => deaths++ });
        const spring = terrain.springs.find(s => s.x > terrain.z2.reward.x0 && s.x < terrain.z2.reward.x1);
        assert(spring, 'the reward balcony needs a spring beneath it');
        player.events.bouncePole = source => { if (source === spring) launched = true; };
        player.place(spring.x, 0, spring.y);
        assert.strictEqual(player.groundSurface, terrain.z2.upperC);
        const elapsed = simulate(player, 6, () => ({}), p => p.groundSurface === terrain.z2.reward, hz);
        assert(launched && elapsed !== null, `${hz} Hz reward spring missed its balcony at ${position(player)}`);
        assert.strictEqual(deaths, 0);
        assert(terrain.bigRing.x > terrain.z2.reward.x0 && terrain.bigRing.x < terrain.z2.reward.x1,
            'the special ring must remain over the reachable reward balcony');
        assert(terrain.monitors.some(m => m.item === '1up' && m.x > terrain.z2.reward.x0
            && m.x < terrain.z2.reward.x1 && m.y === terrain.z2.reward.f(m.x)),
        'the extra-life monitor must remain on the reward balcony');
    }
});

test('the original interactive object kit is present and resets without duplicate collision surfaces', () => {
    const { terrain } = fixture();
    const keys = ['swingPlatforms', 'spinners', 'breakableWalls', 'breakableFloors', 'trapDoors', 'rocks', 'houdiniGroups'];
    const counts = keys.map(key => terrain[key].length);
    assert(counts.every(n => n > 0), 'Marble Canopy must include the earlier interactive objects');
    const surfaces = terrain.surfaces.filter(s => s.dynamicObject).length;
    for (let reset = 0; reset < 3; reset++) {
        terrain.resetObjects();
        assert.deepStrictEqual(keys.map(key => terrain[key].length), counts);
        assert.strictEqual(terrain.surfaces.filter(s => s.dynamicObject).length, surfaces);
        assert(terrain.breakableWalls.every(w => !w.broken && w.leftSurf.enabled && w.rightSurf.enabled && w.topSurf.enabled));
        assert(terrain.breakableFloors.every(f => !f.broken && f.surface.enabled));
    }
});

test('real rolling collisions smash the marble walls and rocks at every supported refresh rate', () => {
    for (const hz of [30, 60, 144]) for (const key of ['breakableWalls', 'rocks']) {
        let hits = 0;
        const event = key === 'rocks' ? 'breakRock' : 'breakWall';
        const { terrain, player } = fixture({ [event]: () => hits++ });
        const object = terrain[key][0];
        const x = object.x - 100;
        player.place(x, 0, terrain.mainFloor.f(x));
        player.curl(); player.state = STATE.ROLLING;
        player.gsp = player.xsp = 12;
        const elapsed = simulate(player, 3, () => ({ right: true }), () => object.broken, hz);
        assert(elapsed !== null && hits === 1, `${hz} Hz ${key} must shatter through real collision`);
        assert(!object.leftSurf.enabled && !object.rightSurf.enabled && !object.topSurf.enabled);
    }
});

test('collapsing and opening bridges drop safely onto the lower recovery road', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain, player } = fixture();
        const floor = terrain.breakableFloors[0];
        player.place(floor.x + 40, 0, floor.y);
        assert.strictEqual(player.groundSurface, floor.surface);
        assert(simulate(player, 2, () => ({}), () => floor.broken, hz) !== null);
        assert(!floor.surface.enabled, 'collapsed tiles must release the player');
        assert(simulate(player, 3, () => ({}), p => p.groundSurface === terrain.mainFloor, hz) !== null,
            `${hz} Hz collapsed bridge must have a safe catch road`);
        player.place(120, 0, 600);
        for (let i = 0; i < 310; i++) terrain.updateObjects(player, 1);
        assert(!floor.broken && floor.surface.enabled, 'the bridge must regenerate');

        const door = terrain.trapDoors[0];
        // Select its closed phase, then cross the warning-to-open boundary.
        terrain.clock = 0; terrain.updateObjects(player, 1);
        player.place(door.x + 20, 0, door.y);
        assert.strictEqual(player.groundSurface, door.surface);
        terrain.clock = door.period - door.openDuration - 1;
        terrain.updateObjects(player, 1);
        assert(door.isOpen && !door.surface.enabled);
        assert(simulate(player, 3, () => ({}), p => p.groundSurface === terrain.mainFloor, hz) !== null,
            `${hz} Hz open trap door must reconnect to the recovery road`);
    }
});

test('swing platforms carry Scar, bumpers bounce, and sparkling steps support the shortcut', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain, player } = fixture();
        const swing = terrain.swingPlatforms[0];
        player.place(swing.x, 0, swing.y - 6);
        assert.strictEqual(player.groundSurface, swing.surface);
        const before = { x: player.x, y: player.y };
        terrain.updateObjects(player, 60 / hz);
        assert(Math.abs(player.x - before.x - swing.dx) < .001);
        assert(Math.abs(player.y - before.y - swing.dy) < .001);
        assert(Math.abs(swing.dx) > 0, 'the swing must actually move');

        const bumper = terrain.spinners[0];
        player.x = bumper.x; player.y = bumper.y;
        player.state = STATE.AIRBORNE; player.curled = false;
        player.xsp = 1; player.ysp = 2;
        terrain.updateObjects(player, 60 / hz);
        assert(player.curled && player.ysp < 0 && bumper.cooldown > 0);

        const group = terrain.houdiniGroups[0];
        player.x = group.triggerX; player.y = group.triggerY;
        terrain.updateObjects(player, 60 / hz);
        assert(group.triggered, 'the sparkling steps must respond to their trigger');
        const step = group.steps[0];
        player.place(step.x, 0, step.y - 12);
        assert.strictEqual(player.groundSurface, step.surface);
    }
});

if (failures) { console.error(`\n${failures} Zone 2 regression(s) failed.`); process.exitCode = 1; }
else console.log('  All Zone 2 regressions passed.');
