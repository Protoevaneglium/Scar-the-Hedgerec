/** Sanctuary Duet terrain, approach, checkpoint and shared capsule lifecycle. */
'use strict';
const assert = require('assert');
const { Terrain, Player, STATE } = require('../public/sonic-engine');
require('../public/levels/zone2_act3');
function fixture() {
    const terrain = new Terrain('z2_act3');
    return { terrain, player: new Player(terrain) };
}
function test(name, run) { run(); console.log('  PASS ' + name); }
console.log('\nZone 2 Act 3 — Sanctuary Duet');

test('a compact floating-island arena retains the shared foundation and a locked rescue', () => {
    const { terrain: t } = fixture();
    assert.strictEqual(t.levelDef.zone, 2); assert.strictEqual(t.levelDef.act, 3);
    assert(t.levelDef.isBossAct && !t.goalPost && t.capsule.lockedUntilBoss);
    assert(t.endX <= 3000, 'this act must stay an arena rather than another long course');
    for (const list of ['rings', 'loops', 'monitors', 'starPosts', 'springs', 'platforms', 'speedBoosters', 'enemies']) {
        assert(t[list].length > 0, `missing shared ${list}`);
    }
    assert(t.bigRing && t.enemies.every(e => e.type));
    assert.strictEqual(t.boss.kind, 'sanctuaryDuo');
    assert.deepStrictEqual(t.boss.members.map(m => m.species).sort(), ['crawfish', 'crocodile']);
    assert(t.boss.members.every(m => m.shell && m.hp > 0));
    assert.strictEqual(t.z2a3.reunion, t.boss.ally);
    assert(t.z2a3.reunion.conversation, 'Rosie keeps the real branching conversation library');
    for (let x = t.boss.left; x <= t.boss.right; x += 20) {
        assert.strictEqual(t.mainFloor.f(x), t.boss.floorY, 'both bosses need a continuous recovery deck');
    }
});

test('a real momentum run reaches the encounter at 30/60/144 Hz without losing a life', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain: t, player: p } = fixture();
        let starts = 0; p.events.duoStart = () => starts++;
        // Use the existing shield monitor and spin dash rather than bypassing the warm-up.
        p.place(140, 0, 560);
        for (let frame = 0; frame < hz * 25 && !t.boss.active; frame++) {
            p.update(frame < hz / 3 ? { down: true, jumpPressed: frame % Math.max(1, Math.round(hz / 12)) === 0, jumpHeld: true }
                : { right: true }, 1 / hz);
        }
        assert(t.boss.active, `${hz} Hz: approach must connect to the arena`);
        assert(p.lives === 3 && p.state !== STATE.DYING && !p.gameOver, `${hz} Hz: safe arena entry`);
        assert.strictEqual(starts, 1, `${hz} Hz: opening line once at fight entry`);
        assert(t.activeCheckpoint && t.activeCheckpoint.x > t.boss.left && t.activeCheckpoint.x < t.boss.right);
    }
});

test('every checkpoint is on a safe deck and resets restore one independent encounter', () => {
    const { terrain: t, player: p } = fixture();
    const initialSurfaces = t.surfaces.length, initialRings = t.rings.length;
    for (let cycle = 0; cycle < 8; cycle++) {
        t.resetObjects();
        assert.strictEqual(t.surfaces.length, initialSurfaces);
        assert.strictEqual(t.rings.length, initialRings);
        assert(!t.boss.active && !t.boss.defeated && !t.capsule.opened);
        assert(t.boss.members.every(m => m.hp === m.maxHP && m.shell));
        assert.strictEqual(t.z2a3.reunion, t.boss.ally);
        for (const cp of t.checkpoints) {
            p.place(cp.x, 0, cp.y);
            assert(p.grounded && Math.abs(p.y + p.radii.height - cp.y) < .01);
        }
    }
});

test('both bosses must fall before a real capsule landing can free animals and clear the zone', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain: t, player: p } = fixture();
        const drop = () => {
            p.x = t.capsule.x; p.y = t.capsule.y - 130;
            p.gsp = p.xsp = 0; p.ysp = 2; p.curl(); p.state = STATE.AIRBORNE;
        };
        drop();
        for (let n = 0; n < hz; n++) p.update({}, 1 / hz);
        assert(!t.capsule.opened, `${hz}: live shells keep the shared capsule locked`);
        // Combat damage is exercised by sanctuary_duo_boss_test. This checks the
        // ordinary rescue system after the encounter's final victory latch.
        t.boss.members.forEach(m => { m.hp = 0; m.defeated = true; m.state = 'defeated'; m.shell = false; });
        t.boss.hp = 0; t.boss.defeated = true; t.boss.active = true;
        drop();
        for (let n = 0; n < hz * 4 && !t.capsule.cleared; n++) p.update({}, 1 / hz);
        assert(t.capsule.opened && t.capsule.cleared, `${hz}: normal capsule rescue clears`);
        assert(t.animals.length > 0 && t.animals.every(a => ['locky', 'wocky'].includes(a.type)));
        const score = p.score;
        for (let n = 0; n < hz; n++) p.update({ right: true, jumpHeld: true, jumpPressed: true }, 1 / hz);
        assert.strictEqual(p.score, score, 'completed rescue cannot award twice');
    }
});

test('after victory Rosie walks across the island to Scar without teleporting', () => {
    for (const hz of [30, 60, 144]) {
        const { terrain: t, player: p } = fixture(), n = t.boss.ally;
        t.boss.active = true; t.boss.defeated = true; t.boss.hp = 0;
        t.boss.members.forEach(m => { m.hp = 0; m.state = 'defeated'; });
        n.actorX = 1085; n.actorY = 560; n.grounded = true; n.actionTimer = 0;
        p.place(2550, 0, 560);
        for (let tick = 0; tick < hz * 12; tick++) {
            const previous = n.actorX;
            t.levelDef.onUpdate(t, p, 60 / hz, {});
            assert(Math.abs(n.actorX - previous) <= 2.4 * 60 / hz + .0001, `${hz}: a real walking step`);
            assert(n.actorX >= t.boss.left && n.actorX <= 2730, 'Rosie remains on the island');
        }
        assert(Math.abs(n.actorX - p.x) <= 100, `${hz}: Rosie follows to the rescue and remains interactive`);
        assert.strictEqual(n.conversation.active, false);
    }
});
