/** Gameplay regressions for the Kitt Bazooka act; uses the real collision engine. */
'use strict';
const assert = require('assert');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
const KittBoss = require('../public/levels/kitt_boss.js');
require('../public/levels/zone1_act3.js');

let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(events = {}) {
    const terrain = new Terrain('z1_act3');
    return { terrain, player: new Player(terrain, events), boss: terrain.boss };
}
function simulate(player, seconds, controls = () => ({}), stop = () => false, hz = 60) {
    let previousJump = false;
    for (let i = 0; i < Math.ceil(seconds * hz); i++) {
        const input = controls(i * 60 / hz, player) || {};
        const jump = !!input.jump;
        player.update({ ...input, jumpHeld: jump, jumpPressed: jump && !previousJump }, 1 / hz);
        previousJump = jump;
        if (stop(player, i * 60 / hz)) return true;
    }
    return false;
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
function routeControls(frame, player) {
    const shaft = player.terrain.z3.shafts.find(s => player.x > s.x0 - 16 && player.x < s.x1 + 16
        && player.y > s.top - 40 && player.y < s.bottom + 20);
    return shaft ? shaftControls(frame, player, shaft) : spinDashThenRun(frame);
}
function activateBoss(terrain, player) {
    const boss = terrain.boss;
    player.place(boss.left + 130, 0, boss.floorY);
    KittBoss.update(terrain, player, 1);
    player.x = boss.left + 22;
    player.y = boss.floorY - 19;
    player.invulnTimer = 100000;
    return boss;
}
function advanceBoss(terrain, player, frames, until = () => false, h = 1) {
    for (let i = 0; i < frames / h; i++) {
        KittBoss.update(terrain, player, h);
        if (until(terrain.boss)) return true;
    }
    return false;
}
function collectRing(player, ring, hz = 60) {
    player.x = ring.x; player.y = ring.y;
    player.xsp = 0; player.ysp = 0; player.gsp = 0;
    player.state = STATE.AIRBORNE;
    player.curled = false; player.hurtPose = false;
    player.update({}, 1 / hz);
}
function waitInArena(terrain, player, seconds, hz = 60) {
    player.x = terrain.boss.left + 22;
    player.y = terrain.boss.floorY - 19;
    player.curled = false;
    for (let i = 0; i < Math.ceil(seconds * hz); i++) terrain.updateObjects(player, 60 / hz);
}

console.log('\nAct 3 — Kitt Bazooka');
test('the act provides a complete speed course and a locked boss capsule', () => {
    const { terrain, boss } = fixture();
    assert(terrain.endX >= 8000, 'Act 3 must include an approach course');
    assert(terrain.loops.length >= 5, 'lower and upper loop routes must be present');
    assert(terrain.springs.length >= 8, 'the spring route must be populated');
    assert(terrain.levelDef.wallJump, 'wall jumps must be enabled for the climb');
    assert(boss && !boss.defeated, 'Kitt must exist before entering his arena');
    assert(terrain.capsule.lockedUntilBoss && !terrain.capsule.opened);
    assert.strictEqual(terrain.goalPost, null);
});

test('a momentum run with wall kicks reaches the boss without death at 30, 60, and 144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        let deaths = 0, springLaunches = 0;
        const visited = new Set();
        const { terrain, player, boss } = fixture({ deathStart: () => deaths++, bouncePole: () => springLaunches++ });
        const arrived = simulate(player, 45, routeControls, p => {
            if (p.groundSurface) visited.add(p.groundSurface);
            return boss.active;
        }, hz);
        assert(arrived, `${hz} Hz route stopped at x=${player.x.toFixed(1)} y=${player.y.toFixed(1)}`);
        assert.strictEqual(deaths, 0, `${hz} Hz approach should preserve a life`);
        assert(player.rings > 0, `${hz} Hz approach should provide safety rings`);
        assert(springLaunches > 0, `${hz} Hz approach must exercise a real spring or bounce pole`);
        assert(terrain.loops.filter(loop => visited.has(loop.arc0) && visited.has(loop.arc1)).length >= 2,
            `${hz} Hz route must complete multiple loops through both collision layers`);
        assert(player.y + player.radii.height <= boss.floorY + 8,
            `${hz} Hz arrival must enter above the arena deck, feet=${(player.y + player.radii.height).toFixed(1)}`);
        assert(!terrain.capsule.opened, 'reaching the arena cannot clear the act');
    }
});

test('the canyon spring connects to the upper viaduct at every supported refresh rate', () => {
    for (const hz of [30, 60, 144]) {
        let launched = false;
        const { terrain, player } = fixture();
        const spring = terrain.springs.find(s => s.x === 720);
        player.events.bouncePole = source => { if (source === spring) launched = true; };
        player.place(spring.x, 0, spring.y);
        const reached = simulate(player, 10, () => ({ right: true }), p => p.groundSurface === terrain.z3.sunDeck, hz);
        assert(launched && reached, `${hz} Hz canyon spring must land on its upper road, x=${player.x.toFixed(1)} y=${player.y.toFixed(1)}`);
    }
});

test('both marked shafts support slides and alternating wall kicks to their summits', () => {
    for (const hz of [30, 60, 144]) for (let index = 0; index < 2; index++) {
        let kicks = 0, deaths = 0;
        const directions = new Set();
        const { terrain, player } = fixture({
            wallJump: event => { kicks++; directions.add(event.direction); },
            deathStart: () => deaths++,
        });
        const shaft = terrain.z3.shafts[index];
        player.x = shaft.x0 + 12;
        player.y = shaft.bottom - 40;
        player.state = STATE.AIRBORNE;
        player.curled = false;
        player.xsp = 0; player.ysp = 2;
        player.update({ left: true }, 1 / 60);
        assert.strictEqual(player.wallSlide, -1, 'pushing toward the marked wall should start a slide');
        const climbed = simulate(player, 15, (frame, p) => shaftControls(frame, p, shaft),
            p => p.y < shaft.top - 30, hz);
        assert(climbed, `${hz} Hz shaft ${index + 1} stopped at x=${player.x.toFixed(1)} y=${player.y.toFixed(1)}`);
        assert(kicks >= 2 && directions.has(-1) && directions.has(1), 'the climb must use both wall kick directions');
        assert.strictEqual(deaths, 0, 'the climb must not cost a life');
    }
});

test('boss rings spawn on entry, collect normally, and replenish without moving live rings', () => {
    for (const hz of [30, 60, 144]) {
        let ringEvents = 0;
        const { terrain, player } = fixture({ ring: () => ringEvents++ });
        assert.strictEqual(terrain.rings.filter(ring => ring.bossRing).length, 0, 'dormant arena rings must not spawn early');
        advanceBoss(terrain, player, 600);
        assert.strictEqual(terrain.rings.filter(ring => ring.bossRing).length, 0, 'waiting before entry cannot start the refill pool');
        const boss = activateBoss(terrain, player);
        const pool = boss.ringPickups;
        assert.strictEqual(pool.length, 10, 'the arena provides a bounded ten-ring wave');
        assert.strictEqual(new Set(pool).size, 10);
        assert(pool.every(ring => terrain.rings.includes(ring) && ring.bossRing && !ring.collected),
            'boss pickups must use the real collectible ring objects');
        const target = pool[0], originalPosition = { x: target.x, y: target.y };
        const ringsBefore = player.rings, scoreBefore = player.score;
        collectRing(player, target, hz);
        const collected = pool.filter(ring => ring.collected);
        assert(target.collected, `${hz} Hz boss ring must be collectible`);
        assert.strictEqual(player.rings - ringsBefore, collected.length);
        assert.strictEqual(player.score - scoreBefore, collected.length * 10);
        assert.strictEqual(ringEvents, collected.length, 'pickups must invoke the normal ring sound/event callback');
        const livePositions = new Map(pool.filter(ring => !ring.collected).map(ring => [ring, { x: ring.x, y: ring.y }]));
        waitInArena(terrain, player, 6.8, hz);
        assert(target.collected, `${hz} Hz collected rings must stay gone until the seven-second refill`);
        for (const [ring, position] of livePositions) {
            assert.strictEqual(ring.x, position.x, 'an available ring must not follow the moving boss');
            assert.strictEqual(ring.y, position.y, 'an available ring must retain its jump trajectory');
        }
        waitInArena(terrain, player, .4, hz);
        assert(!target.collected, `${hz} Hz collected rings must replenish after seven seconds`);
        assert.notDeepStrictEqual({ x: target.x, y: target.y }, originalPosition,
            'a collected arc slot should refill around Kitt after he has moved');
        assert(Math.abs(target.x - boss.x) >= 125, 'a refilled arc must leave room to approach the live boss');
        assert.strictEqual(terrain.rings.filter(ring => ring.bossRing).length, 10);
        assert.strictEqual(boss.ringPickups, pool, 'refills must retain the bounded pool');
        for (const ring of pool) {
            assert(ring.x > boss.left && ring.x < boss.right && ring.y < boss.floorY,
                'refilled rings must stay inside the playable arena');
        }
        // Repeated collection/refill cycles may reuse entries, but must never append new waves.
        for (let wave = 0; wave < 2; wave++) {
            for (const ring of pool) if (!ring.collected) collectRing(player, ring, hz);
            waitInArena(terrain, player, 7.2, hz);
            assert.strictEqual(terrain.rings.filter(ring => ring.bossRing).length, 10);
            assert.strictEqual(new Set(boss.ringPickups).size, 10);
        }
    }
});

test('Kitt warns before claw volleys, bazooka rockets, and rush attacks', () => {
    const { terrain, player } = fixture();
    const boss = activateBoss(terrain, player);
    assert(boss.active && boss.state === 'intro');
    assert(terrain.activeCheckpoint.x >= boss.left, 'a boss retry must restart in the arena');
    assert(terrain.checkpoints.includes(terrain.activeCheckpoint), 'boss retries must preserve checkpoint identity for the UI');
    assert(advanceBoss(terrain, player, 300, b => b.state === 'clawWarn'));
    const warningTime = boss.timer;
    advanceBoss(terrain, player, warningTime - 1);
    assert.strictEqual(boss.projectiles.length, 0, 'claw warning must give time to react');
    assert(advanceBoss(terrain, player, 100, b => b.projectiles.some(p => p.kind === 'claw')));
    advanceBoss(terrain, player, 50);
    assert.strictEqual(boss.nextShot, 3, 'phase one must fire a readable three-missile volley');
    assert(advanceBoss(terrain, player, 500, b => b.state === 'rocketWarn'));
    const count = boss.projectiles.filter(p => p.kind === 'rocket').length;
    advanceBoss(terrain, player, boss.timer - 1);
    assert.strictEqual(boss.projectiles.filter(p => p.kind === 'rocket').length, count);
    assert(advanceBoss(terrain, player, 30, b => b.projectiles.some(p => p.kind === 'rocket')));
    assert(advanceBoss(terrain, player, 500, b => b.state === 'rushWarn'));
    assert(advanceBoss(terrain, player, 80, b => b.state === 'rush'));
    const before = boss.x;
    advanceBoss(terrain, player, 10);
    assert(boss.x !== before, 'rush must move Kitt through the arena');
    assert(boss.hp === boss.maxHP, 'waiting away from the boss cannot damage it');
});

test('spinning returns real missiles to Kitt and hit flash prevents duplicate damage', () => {
    const { terrain, player } = fixture();
    const boss = activateBoss(terrain, player);
    assert(advanceBoss(terrain, player, 400, b => b.projectiles.some(p => p.kind === 'claw')));
    const missile = boss.projectiles.find(p => p.kind === 'claw');
    player.state = STATE.AIRBORNE;
    player.curled = true;
    player.x = missile.x;
    player.y = missile.y;
    KittBoss.update(terrain, player, 1);
    assert(missile.reflected, 'jump-spin must return an incoming missile');
    player.x = boss.left + 22;
    player.y = boss.floorY - 19;
    assert(advanceBoss(terrain, player, 160, b => b.hp < b.maxHP), 'returned missile must reach Kitt');
    assert.strictEqual(boss.hp, boss.maxHP - 1);
    const hp = boss.hp;
    player.x = boss.x;
    player.y = boss.y - 73;
    KittBoss.update(terrain, player, 1);
    assert.strictEqual(boss.hp, hp, 'a hit flash must suppress another hit');
});

test('an uncurled missile hit scatters rings and gives Scar a recovery window', () => {
    const { terrain, player } = fixture();
    const boss = activateBoss(terrain, player);
    assert(advanceBoss(terrain, player, 400, b => b.projectiles.some(p => p.kind === 'claw')));
    const missile = boss.projectiles.find(p => p.kind === 'claw');
    player.invulnTimer = 0;
    player.rings = 5;
    player.curled = false;
    player.x = missile.x;
    player.y = missile.y;
    KittBoss.update(terrain, player, 1);
    assert.strictEqual(player.rings, 0);
    assert(terrain.scatteredRings.length > 0 && player.hurtPose && player.invulnTimer > 0);
    assert.strictEqual(player.lives, 3, 'a hit while carrying rings must spare the life');
    player.x = boss.x;
    player.y = boss.y - 73;
    KittBoss.update(terrain, player, 1);
    assert.strictEqual(player.state, STATE.AIRBORNE, 'recovery prevents immediate contact death');
    assert.strictEqual(player.lives, 3);
});

test('eight spin contacts produce overdrive, defeat, capsule clear, and a clean stage reset', () => {
    const { terrain, player } = fixture();
    const boss = activateBoss(terrain, player);
    advanceBoss(terrain, player, 112);
    const scoreBefore = player.score;
    let finalRing = null, ringScore = 0;
    for (let hit = 0; hit < 8; hit++) {
        if (hit === 7) {
            finalRing = boss.ringPickups.find(ring => !ring.collected);
            const beforePickup = player.score;
            collectRing(player, finalRing);
            ringScore = player.score - beforePickup;
            assert(finalRing.collected, 'prepare a live refill countdown before the final hit');
        }
        player.state = STATE.AIRBORNE;
        player.curled = true;
        player.hurtPose = false;
        player.x = boss.x;
        player.y = boss.y - 73;
        player.ysp = 4;
        KittBoss.update(terrain, player, 1);
        assert.strictEqual(boss.hp, 7 - hit, `spin contact ${hit + 1}`);
        if (hit === 3) assert.strictEqual(boss.phase, 2, 'four remaining hits must trigger overdrive');
        if (hit < 7) {
            assert(player.ysp < 0, 'successful attacks must bounce Scar away');
            player.x = boss.left + 22;
            player.y = boss.floorY - 19;
            advanceBoss(terrain, player, 75);
        }
    }
    assert(boss.defeated && boss.state === 'defeat');
    assert.strictEqual(boss.projectiles.length, 0, 'victory must clear every missile');
    assert.strictEqual(player.score, scoreBefore + ringScore + 1500, 'boss reward is granted once');
    waitInArena(terrain, player, 8);
    assert(finalRing.collected, 'defeating Kitt must stop collected rings from replenishing');
    player.state = STATE.AIRBORNE;
    player.curled = true;
    player.x = terrain.capsule.x;
    player.y = terrain.capsule.y - 100;
    player.xsp = 0; player.ysp = 2;
    assert(simulate(player, 4, () => ({}), () => terrain.capsule.cleared), 'victory must unlock the capsule switch');
    terrain.resetObjects();
    assert.strictEqual(terrain.boss.hp, terrain.boss.maxHP);
    assert(!terrain.boss.defeated && !terrain.boss.active && !terrain.capsule.opened);
    assert.strictEqual(terrain.boss.projectiles.length, 0);
    assert.strictEqual(terrain.rings.filter(ring => ring.bossRing).length, 0, 'a full stage reset removes the old arena pool');
});

test('a death and checkpoint respawn restart boss health and remove old projectiles', () => {
    const { terrain, player } = fixture();
    const boss = activateBoss(terrain, player);
    const ringPool = boss.ringPickups.slice();
    assert(advanceBoss(terrain, player, 400, b => b.projectiles.length > 0));
    player.x = boss.x;
    player.y = boss.y - 73;
    player.curled = true;
    KittBoss.update(terrain, player, 1);
    assert(boss.hp < boss.maxHP);
    const ring = ringPool.find(pickup => !pickup.collected);
    collectRing(player, ring);
    assert(ring.collected);
    const countdown = ring.respawnTimer;
    player.die();
    KittBoss.update(terrain, player, 1);
    advanceBoss(terrain, player, 500);
    assert(ring.collected && ring.respawnTimer === countdown, 'the death animation must pause arena ring timers');
    player.respawn();
    KittBoss.update(terrain, player, 1);
    assert.notStrictEqual(terrain.boss, boss, 'retry must replace the old encounter');
    assert.strictEqual(terrain.boss.hp, terrain.boss.maxHP);
    assert.strictEqual(terrain.boss.projectiles.length, 0);
    assert(terrain.boss.active && terrain.boss.state === 'intro');
    assert.strictEqual(terrain.rings.filter(pickup => pickup.bossRing).length, 10, 'retry must not append another arena wave');
    assert(ringPool.every(pickup => terrain.boss.ringPickups.includes(pickup)), 'retry must reuse the same collectible ring entries');
    assert(terrain.boss.ringPickups.every(pickup => !pickup.collected && pickup.respawnTimer === null),
        'retry must provide a fresh visible ring wave with reset timers');
});

process.exitCode = failures ? 1 : 0;
