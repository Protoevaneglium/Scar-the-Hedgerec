/** Reproducible engine stress cases and seeded gameplay traces. Zero dependencies. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Terrain, Player, STATE, PHYS } = require('../public/sonic-engine.js');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
for (const match of html.matchAll(/<script src="(levels\/[^"]+)"/g)) require('../public/' + match[1]);

const stages = ['palmtree', ...Object.keys(Terrain.LEVELS).filter(id => Terrain.LEVELS[id].inCampaign !== false), 'test'];
function test(name, fn) { fn(); console.log(`  ✓ ${name}`); }
function fixture(stage = 'palmtree', events = {}) {
    const terrain = new Terrain(stage), player = new Player(terrain, events);
    return { terrain, player };
}
function registerFixture(id, objects) {
    Terrain.registerLevel(id, {
        startX: 0, endX: 2000, probeY: -500, deathY: 1100,
        buildTerrain(b) { b.addFloor(b.path(0, 700).flat(2000)); },
        checkpoints: [{ x: 100, y: 700 }], objects: { goalPost: null, ...objects },
    });
}
console.log('\nAdversarial engine and combat');

test('moving and swinging platforms start at their configured phase without a first-frame teleport', () => {
    for (const stage of stages.slice(0, -1)) {
        const { terrain, player } = fixture(stage);
        const before = [...terrain.platforms, ...terrain.swingPlatforms].map(p => ({ p, x: p.x, y: p.y }));
        terrain.updateObjects(player, 1 / 3);
        for (const old of before) {
            const p = old.p;
            const maxSpeed = p.len ? p.len * p.maxAngle * p.speed : Math.hypot(p.ampX, p.ampY) * p.speed;
            assert(Math.hypot(p.x - old.x, p.y - old.y) <= maxSpeed / 3 + 1e-5,
                `${stage}: ${p.surface.name} jumped ${Math.hypot(p.x - old.x, p.y - old.y).toFixed(1)} px on its first tick`);
            assert(Math.abs(p.surface.x1 - (p.x - (p.w || 48) / 2)) < .01);
        }
    }
});

test('jumping inherits platform velocity consistently at 30, 60 and 144 Hz', () => {
    registerFixture('__moving_jump', { platforms: [{ x: 800, y: 300, w: 100, ampX: 70, ampY: 45, speed: .03, phase: .2 }] });
    registerFixture('__swing_jump', { swingPlatforms: [{ pivotX: 800, pivotY: 130, len: 170, speed: .03, maxAngle: .7, phase: .2 }] });
    for (const id of ['__moving_jump', '__swing_jump']) {
        const velocities = [];
        for (const hz of [30, 60, 144]) {
            const { terrain, player } = fixture(id);
            const platform = (terrain.platforms[0] || terrain.swingPlatforms[0]);
            // Sample the same time in the object's motion, then jump directly
            // from its physical deck; dx is per-substep, not px per 60 Hz frame.
            terrain.clock = 30 - 60 / hz;
            terrain.updateObjects(player, 60 / hz);
            player.place(platform.x, 0, platform.surface.y1);
            player.jump();
            velocities.push({ hz, x: player.xsp, y: player.ysp });
        }
        for (const value of velocities) {
            assert(Math.abs(value.x - velocities[1].x) < .06 && Math.abs(value.y - velocities[1].y) < .06,
                `${id}: ${value.hz} Hz inherited (${value.x.toFixed(3)}, ${value.y.toFixed(3)}), 60 Hz (${velocities[1].x.toFixed(3)}, ${velocities[1].y.toFixed(3)})`);
        }
    }
});

test('invalid or stalled frame timing cannot enter an unbounded substep loop', () => {
    const { player } = fixture('test');
    let steps = 0;
    player.step = () => { assert(++steps <= 15, 'a paused frame must not replay unlimited physics'); };
    for (const invalid of [Infinity, -Infinity, NaN, -1, 0, undefined]) player.update({}, invalid);
    assert.strictEqual(steps, 0, 'invalid or nonpositive deltas must leave simulation alone');
    player.update(null, 3600);
    assert(steps > 0 && steps <= 15);
});

test('invalid ring grants cannot corrupt totals or loop forever granting lives', () => {
    const { player } = fixture('test');
    player.addLife = () => { throw new Error('invalid ring input must not award lives'); };
    for (const value of [NaN, Infinity, -Infinity, -10, .5, Number.MAX_VALUE, '100']) player.addRings(value);
    assert.strictEqual(player.rings, 0);
    const { player: large } = fixture('test');
    let jingles = 0;
    large.events.oneUp = () => jingles++;
    large.addRings(1000000000);
    assert.strictEqual(large.lives, 10000003);
    assert.strictEqual(jingles, 1, 'a batch should award all earned lives with one event rather than millions of callbacks');
});

test('damage cancels stored attacks and expands a rolling hitbox without sinking its feet', () => {
    const { terrain, player } = fixture('test');
    player.curl(); player.state = STATE.ROLLING; player.gsp = 10;
    player.rings = 10; player.dropDashReady = true; player.dropDashCharging = true;
    player.boostTrailTimer = 42; player.springTwirl = true;
    const feet = player.y + player.radii.height;
    terrain.hurtPlayer(player, player.x + 10);
    assert(Math.abs(player.y + player.radii.height - feet) < .001, 'uncurl on damage must preserve floor contact');
    assert(!player.curled && !player.dropDashReady && !player.dropDashCharging && !player.boostTrailTimer && !player.springTwirl,
        'ring loss must cancel boosts and charged attacks');
    assert.strictEqual(player.groundSurface, null);
});

test('a fatal enemy hit cannot also collect the giant ring or finish the sign in the same tick', () => {
    const { terrain, player } = fixture('palmtree');
    terrain.rings = []; terrain.monitors = []; terrain.springs = []; terrain.spinners = []; terrain.bouncePoles = [];
    const goal = terrain.goalPost;
    player.place(goal.x + 1, 0, goal.y);
    terrain.bigRing = { x: player.x, y: player.y, collected: false, flashTimer: 0 };
    terrain.enemies = [{ kind: 'crab', x: player.x, y: player.y + 14, minX: player.x, maxX: player.x, vx: 0, alive: true }];
    terrain.updateObjects(player, 1);
    assert.strictEqual(player.state, STATE.DYING);
    assert(!goal.spinning && !goal.cleared && !terrain.bigRing.collected && player.rings === 0,
        'death must be terminal for the remainder of the object tick');
});

test('respawns provide a short protection window against enemies camping a checkpoint', () => {
    registerFixture('__spawn_camp', { enemies: [{ kind: 'crab', x: 100, y: 700, minX: 100, maxX: 100, vx: 0 }] });
    const { terrain, player } = fixture('__spawn_camp');
    player.die();
    for (let i = 0; i < 70; i++) player.update({}, 1 / 60);
    assert.strictEqual(player.lives, 2);
    assert.notStrictEqual(player.state, STATE.DYING, 'checkpoint spawn must not immediately cost the next life');
    assert(player.invulnTimer > 0);
    for (let i = 0; i < 30; i++) player.update({ right: true }, 1 / 60);
    assert.strictEqual(player.lives, 2, 'Scar must have time to leave the enemy');
});

test('latched interaction input is consumed only on the first physics substep', () => {
    const { terrain, player } = fixture('z2_act2');
    const received = [];
    const original = terrain.levelDef.onUpdate;
    terrain.levelDef.onUpdate = (_t, _p, _h, input) => received.push(!!input.upPressed);
    try { player.update({ upPressed: true }, 1 / 30); }
    finally { terrain.levelDef.onUpdate = original; }
    assert.deepStrictEqual(received, [true, false]);
});

test('death cancels a pending time warp and makes its source post usable on retry', () => {
    const { terrain, player } = fixture('palmtree');
    terrain.enemies = []; terrain.springs = []; terrain.monitors = []; terrain.spinners = []; terrain.bouncePoles = [];
    terrain.timeEra = 'present';
    const post = terrain.timePosts[0];
    terrain.rings[0].collected = true;
    player.x = post.x; player.y = post.y - player.radii.height;
    player.state = STATE.STANDING; player.gsp = player.xsp = player.ysp = 0;
    terrain.updateObjects(player, 1);
    assert(post.active && terrain.timeWarpSource === post && terrain.timeWarpTarget);
    terrain.timeWarpCharge = 88;
    player.die();
    assert(!terrain.timeWarpTarget && !terrain.timeWarpSource && !terrain.timeWarpCharge && !post.active);
    assert.strictEqual(terrain.timeEra, 'present', 'cancelling a pending trip must preserve the actual era');
    assert(terrain.rings[0].collected, 'cancelling a trip must not reset unrelated encounters or collectibles');
    player.respawn();
    player.x = post.x; player.y = post.y - player.radii.height;
    player.state = STATE.STANDING; player.gsp = player.xsp = player.ysp = 0;
    terrain.updateObjects(player, 1);
    assert(post.active && terrain.timeWarpTarget && terrain.timeWarpSource === post, 'the same post must trigger again on retry');
    terrain.timeWarpTarget = null; terrain.timeWarpSource = null; terrain.timeEra = 'past';
    player.die();
    assert(post.active && terrain.timeEra === 'past', 'a completed trip must keep its era and used post');
});

test('seeded mixed-input traces stay finite through checkpoints, deaths and jittered frame rates', () => {
    let updates = 0, seconds = 0;
    const knownStates = new Set(Object.values(STATE));
    for (const stage of stages) for (const seed of [0x13579bdf, 0xc0ffee, 0x51a7, 0xdeadbeef]) {
        let randomState = seed >>> 0;
        const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 0x100000000);
        const { terrain, player } = fixture(stage);
        let jumpHeld = false, controls = {};
        for (let frame = 0; frame < 2400; frame++) {
            if (frame % 23 === 0) controls = { left: random() < .35, right: random() < .72, down: random() < .23, up: random() < .12 };
            const jump = frame % 13 < 4 && random() < .8;
            const input = { ...controls, jumpHeld: jump, jumpPressed: jump && !jumpHeld };
            jumpHeld = jump;
            if (frame % 400 === 0) {
                const cp = terrain.checkpoints[Math.floor(random() * terrain.checkpoints.length)];
                player.gameOver = false; player.lives = 3; player.place(cp.x, 0, cp.y);
                terrain.activeCheckpoint = cp;
            }
            const dt = [1 / 30, 1 / 60, 1 / 144, 1 / 48, 1 / 90][Math.floor(random() * 5)];
            player.update(input, dt); updates++; seconds += dt;
            for (const key of ['x', 'y', 'xsp', 'ysp', 'gsp', 'angle', 'visualAngle', 'runPhase', 'ballSpin']) {
                assert(Number.isFinite(player[key]), `${stage} seed ${seed} frame ${frame}: ${key} is not finite`);
            }
            assert(knownStates.has(player.state), `${stage} seed ${seed}: unknown state ${player.state}`);
            assert(player.lives >= 0 && player.rings >= 0 && player.score >= 0);
            assert(Math.abs(player.xsp) < 40 && Math.abs(player.ysp) < 40,
                `${stage} seed ${seed}: runaway velocity (${player.xsp}, ${player.ysp})`);
        }
    }
    console.log(`      (${updates} updates, ${(seconds / 60).toFixed(1)} simulated minutes, ${stages.length * 4} reproducible traces)`);
});
