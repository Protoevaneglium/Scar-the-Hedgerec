'use strict';
const assert = require('assert');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
require('../public/levels/zone1_act2.js');
require('../public/levels/kitt_boss.js');
require('../public/levels/zone1_act3.js');

function fixture(stage = 'z1_act3') {
    const terrain = new Terrain(stage);
    return { terrain, player: new Player(terrain) };
}
function advance(player, frames, hz = 60, input = {}) {
    for (let i = 0; i < Math.ceil(frames * hz / 60); i++) player.update(input, 1 / hz);
}
function dropOnSwitch(terrain, player) {
    player.x = terrain.capsule.x;
    player.y = terrain.capsule.y - 130;
    player.xsp = player.gsp = 0;
    player.ysp = 2;
    player.state = STATE.AIRBORNE;
    player.curled = true;
    player.jumped = false;
}
function test(name, fn) {
    fn();
    console.log(`  ✓ ${name}`);
}

console.log('\nAnimals and capsules');
test('normal acts use signposts and the boss act uses a locked capsule', () => {
    for (const stage of ['palmtree', 'z1_act2']) {
        const { terrain } = fixture(stage);
        assert(terrain.goalPost && !terrain.capsule);
    }
    const { terrain } = fixture();
    assert(!terrain.goalPost && terrain.capsule.lockedUntilBoss);
});

test('every destroyed badnik releases one themed animal, while monitors release none', () => {
    for (const stage of ['palmtree', 'z1_act2']) {
        const { terrain, player } = fixture(stage);
        const enemy = terrain.enemies.find(en => en.kind === 'crab');
        const pair = stage === 'palmtree' ? ['flicky', 'ricky'] : ['flicky', 'becky'];
        for (let n = 0; n < 2; n++) {
            // Use two real enemies at the same safe encounter point to exercise the zone pair.
            const target = n === 0 ? enemy : terrain.enemies.find(en => en.alive && en.kind === 'crab');
            target.x = 420; target.y = terrain.mainFloor.f(420);
            target.minX = target.maxX = 420; target.vx = 0;
            player.x = target.x; player.y = target.y - 14;
            player.xsp = player.gsp = 0; player.ysp = 2;
            player.state = STATE.AIRBORNE; player.curled = true;
            terrain.updateObjects(player, 1);
            assert(!target.alive);
            assert.strictEqual(terrain.animals.length, n + 1);
            assert.strictEqual(terrain.animals[n].type, pair[n]);
            terrain.updateObjects(player, 1);
            assert.strictEqual(terrain.animals.length, n + 1, 'dead enemies cannot release twice');
        }
        const monitor = terrain.monitors[0];
        player.x = monitor.x; player.y = monitor.y - 15;
        player.curled = true; player.state = STATE.AIRBORNE; player.ysp = 1;
        terrain.updateObjects(player, 1);
        assert(monitor.broken && terrain.animals.length === 2);
        terrain.resetObjects();
        assert.strictEqual(terrain.animals.length, 0);
    }
});

test('the capsule rejects boss lock, body contact, and rising underside contact', () => {
    const { terrain, player } = fixture();
    dropOnSwitch(terrain, player);
    advance(player, 45);
    assert(!terrain.capsule.opened, 'the live boss must lock the switch');
    terrain.boss.defeated = true;
    player.x = terrain.capsule.x + 26;
    player.y = terrain.capsule.y - 120;
    player.state = STATE.AIRBORNE; player.curled = true; player.xsp = player.gsp = 0; player.ysp = 2;
    advance(player, 32);
    assert(!terrain.capsule.opened, 'landing on the dome must not press the narrow button');
    player.x = terrain.capsule.x;
    player.y = terrain.capsule.y - 60;
    player.state = STATE.AIRBORNE; player.curled = true; player.ysp = -6;
    advance(player, 8);
    assert(!terrain.capsule.opened, 'moving upward through the button must not press it');
});

test('a real landing releases a staggered crowd and waits for the rescue at 30, 60, and 144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain, player } = fixture();
        terrain.boss.defeated = true;
        dropOnSwitch(terrain, player);
        let guard = 0;
        while (!terrain.capsule.opened && guard++ < hz) player.update({}, 1 / hz);
        const cap = terrain.capsule;
        assert(cap.opened, `${hz}Hz landing must press the button`);
        assert(!cap.cleared && !cap.buttonTopSurf.enabled);
        advance(player, 35, hz);
        assert(cap.phase === 'exploding' && cap.releasedCount === 0 && !cap.cleared);
        advance(player, 45, hz);
        assert(cap.phase === 'broken' && cap.releasedCount > 0 && cap.releasedCount < 12);
        assert(!cap.topSurf.enabled && !cap.leftSurf.enabled && !cap.rightSurf.enabled);
        const poses = new Set();
        const types = new Set();
        for (let i = 0; i < hz * 2; i++) {
            player.update({}, 1 / hz);
            for (const animal of terrain.animals) {
                poses.add(animal.frame); types.add(animal.type);
                assert(Number.isFinite(animal.x) && Number.isFinite(animal.y));
                assert(animal.source === 'capsule');
            }
        }
        assert.strictEqual(cap.releasedCount, 12);
        assert(cap.cleared, 'the act must eventually reach the tally');
        assert.deepStrictEqual([...types].sort(), ['cucky', 'micky']);
        assert(poses.has(0) && poses.has(1) && poses.has(2), 'release and both movement poses must animate');
        assert(terrain.animals.some(a => a.vx < 0) && terrain.animals.some(a => a.vx > 0));
        terrain.resetObjects();
        assert(!terrain.capsule.opened && !terrain.capsule.cleared && terrain.capsule.buttonTopSurf.enabled);
        assert.strictEqual(terrain.animals.length, 0);
    }
});

test('rescued animals hop on actual shelves and retire after leaving the playable area', () => {
    const { terrain, player } = fixture('z1_act2');
    const shelf = terrain.floors.find(f => f.oneWay && f.x1 - f.x0 > 150);
    const x = (shelf.x0 + shelf.x1) / 2;
    const animal = terrain.spawnAnimal(x, shelf.f(x) - 10, { type: 'pocky', direction: 1 });
    let landed = false, hopped = false;
    for (let i = 0; i < 90; i++) {
        terrain.updateAnimals(player, 1);
        if (animal.grounded) {
            landed = true;
            assert(Math.abs(animal.y - shelf.f(animal.x)) < 2, 'feet must meet the actual shelf');
        }
        if (landed && animal.vy < -1 && animal.vx > 0) hopped = true;
    }
    assert(landed && hopped);
    for (let i = 0; i < 600; i++) terrain.updateAnimals(player, 1);
    assert.strictEqual(terrain.animals.length, 0);
});
