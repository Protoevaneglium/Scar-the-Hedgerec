/** Combat regressions for the real two-boss/ally encounter and shared player physics. */
'use strict';
const assert = require('assert');
const E = require('../public/sonic-engine');
const Duo = require('../public/levels/sanctuary_duo_boss');
require('../public/levels/zone2_act3');

function test(name, run) { run(); console.log('  PASS ' + name); }
function fixture(events = {}) {
    const terrain = new E.Terrain('z2_act3'), player = new E.Player(terrain, events);
    player.place(1130, 0, 560);
    return { terrain, player, boss: terrain.boss };
}
function wait(f, frames, input = {}, hz = 60, stop = () => false) {
    const step = 60 / hz;
    for (let time = 0; time < frames - 1e-6; time += step) {
        Duo.update(f.terrain, f.player, step, input);
        if (stop()) return true;
    }
    return false;
}
function ready(f) {
    f.player.invincTimer = 100000;
    wait(f, 105);
    assert.strictEqual(f.boss.state, 'battle');
}
function spinAt(f, member, h = 1) {
    const p = f.player;
    p.x = member.x; p.y = member.y - 48;
    p.curled = true; p.hurtPose = false; p.state = E.STATE.AIRBORNE;
    p.xsp = 0; p.ysp = 2; p.gsp = 0;
    Duo.update(f.terrain, p, h);
}
function nextOpening(f, hz = 60) {
    f.player.x = f.boss.left + 50; f.player.y = f.boss.floorY - 19;
    f.player.curled = false; f.player.state = E.STATE.STANDING;
    return wait(f, 1400, {}, hz, () => f.boss.members.some(m => m.openTimer > 0));
}
function battleControls(f, previousJump) {
    const b = f.boss, p = f.player;
    const target = b.members.find(m => m.openTimer > 0)
        || b.members.find(m => m.id === b.ally.assistTarget && m.hp > 0)
        || b.members.find(m => m.hp > 0);
    const desired = target.x - 70, dx = target.x - p.x;
    const jump = p.grounded && Math.abs(dx) < 130 && target.openTimer > 0;
    const input = { left: p.x > desired + 12, right: p.x < desired - 12,
        jumpHeld: jump, jumpPressed: jump && !previousJump };
    if (!p.grounded) { input.left = dx < -5; input.right = dx > 5; input.jumpHeld = true; }
    return { input, jump };
}
function winWithPhysics(hz) {
    const events = { hit: 0, defeat: 0, start: 0, assists: 0, deaths: 0 };
    const f = fixture({ bossHit: b => { events.hit++; if (b.hp === 0) events.allyBeforeVictory = b.ally.actorX; }, bossDefeat: () => events.defeat++,
        duoStart: () => events.start++, duoAssist: () => events.assists++, deathStart: () => events.deaths++ });
    // Separate attack-path verification from projectile protection, which is tested
    // below with real rings/shields. Armor must still resist invincibility.
    f.player.invincTimer = 100000;
    let previousJump = false;
    for (let i = 0; i < hz * 100 && !f.boss.defeated; i++) {
        const { input, jump } = battleControls(f, previousJump);
        f.player.update(input, 1 / hz); previousJump = jump;
    }
    assert(f.boss.defeated, `${hz} Hz real movement/jump sequence must defeat both bosses; hp=${f.boss.hp}`);
    assert.strictEqual(f.boss.hp, 0); assert(f.boss.members.every(m => m.hp === 0));
    assert.strictEqual(events.hit, 12); assert.strictEqual(events.defeat, 1); assert.strictEqual(events.start, 1);
    assert.strictEqual(events.deaths, 0); assert(events.assists >= events.hit);
    assert(f.boss.members.every(m => m.openings >= 6));
    assert.strictEqual(f.boss.projectiles.length, 0);
    return { ...f, events };
}

console.log('\nSanctuary Duet armored tag-team combat');
test('entry starts once, uses the real arena checkpoint and retains a bounded collectible ring pool', () => {
    let starts = 0;
    const f = fixture({ duoStart: () => starts++ });
    f.player.invincTimer = 100000;
    const count = f.terrain.rings.length;
    const waitingX = f.boss.ally.actorX;
    Duo.update(f.terrain, f.player, 1);
    assert(Math.abs(f.boss.ally.actorX - waitingX) <= 2.5, 'entry must not snap Rosie through the combat gate');
    assert.strictEqual(starts, 1); assert.strictEqual(f.boss.state, 'intro');
    assert.strictEqual(f.terrain.activeCheckpoint, f.terrain.checkpoints[1]);
    assert.strictEqual(f.terrain.rings.length, count + 8);
    for (let i = 0; i < 1300; i++) {
        const n = f.boss.ally, oldX = n.actorX, oldPose = n.state, oldClock = n.animationClock;
        const oldMembers = f.boss.members.map(m => m.x);
        Duo.update(f.terrain, f.player, 1);
        assert(Math.abs(n.actorX - oldX) <= 6.5 + 1e-6, 'Rosie must move at her physical assist speed');
        f.boss.members.forEach((m, index) => assert(Math.abs(m.x - oldMembers[index]) <= .75 + 1e-6,
            'returning to guard must not snap an enemy to a different patrol phase'));
        if (oldPose === 'walk' && n.state === 'walk' && n.actorX !== oldX) {
            assert(Math.abs(n.animationClock - oldClock - Math.abs(n.actorX - oldX)) < 1e-6,
                'walking animation must follow actual distance, including faster tag assists');
        }
    }
    assert.strictEqual(starts, 1); assert.strictEqual(f.terrain.rings.length, count + 8);
    assert.strictEqual(new Set(f.boss.ringPickups).size, 8);
    const ring = f.boss.ringPickups[0];
    ring.collected = true;
    wait(f, 359);
    assert.strictEqual(ring.collected, true);
    wait(f, 2);
    assert.strictEqual(ring.collected, false); assert.strictEqual(ring.respawnTimer, null);
});

test('closed armor rejects repeated spin contacts, speed and invincibility without taking damage', () => {
    for (const hz of [30, 60, 144]) {
        const f = fixture(); ready(f); f.boss.autoAssistTimer = 100000;
        const target = f.boss.members[0], score = f.player.score;
        for (let i = 0; i < 80; i++) {
            f.player.invincTimer = 100000; spinAt(f, target, 60 / hz);
            assert.strictEqual(target.hp, 6); assert.strictEqual(f.boss.hp, 12);
        }
        f.player.curled = false; f.player.x = target.x; f.player.y = target.y - 43;
        f.player.gsp = f.player.xsp = 16; Duo.update(f.terrain, f.player, 1);
        assert.strictEqual(target.hp, 6); assert.strictEqual(f.player.score, score);
    }
});

test('Rosie physically approaches a recovering enemy and one assist buys only one Scar hit', () => {
    for (const hz of [30, 60, 144]) {
        const f = fixture(); ready(f); f.boss.autoAssistTimer = 100000;
        const origin = f.boss.ally.actorX;
        Duo.update(f.terrain, f.player, 60 / hz, { talkPressed: true });
        assert(f.boss.queuedAssist > 0);
        assert(wait(f, 1000, {}, hz, () => f.boss.ally.assistCount === 1));
        const n = f.boss.ally, target = f.boss.members.find(m => m.openTimer > 0);
        assert(target && target.state === 'open' && !target.shell);
        assert(Math.abs(n.actorX - origin) > 100, 'Rosie must travel to the shell, rather than open it remotely');
        assert(Math.abs(n.actorX - target.x) <= 65, 'the shell break must happen at her actual contact');
        const hp = target.hp; spinAt(f, target, 60 / hz);
        assert.strictEqual(target.hp, hp - 1); assert(target.shell && target.openTimer === 0);
        for (let i = 0; i < 30; i++) spinAt(f, target, 60 / hz);
        assert.strictEqual(target.hp, hp - 1, 'camping or bouncing cannot hit twice in the same opening');
    }
});

test('held assist input stays latched through direct catch-up substeps and cooldown cannot queue spam', () => {
    const f = fixture(); ready(f); f.boss.autoAssistTimer = 100000;
    Duo.update(f.terrain, f.player, 2, { talkPressed: true });
    const first = f.boss.queuedAssist;
    Duo.update(f.terrain, f.player, 2, { talkPressed: true });
    assert(f.boss.queuedAssist < first, 'held input cannot refresh a pending assist');
    assert(wait(f, 1000, {}, 60, () => f.boss.ally.assistCount === 1));
    f.boss.queuedAssist = 0;
    for (let i = 0; i < 20; i++) Duo.update(f.terrain, f.player, 1, { talkPressed: i % 2 === 0 });
    assert.strictEqual(f.boss.queuedAssist, 0);
    assert.strictEqual(f.boss.ally.assistCount, 1);
});

test('both weapons are telegraphed and launched from the correct enemy, with returning claws', () => {
    for (const hz of [30, 60, 144]) {
        const shots = [], f = fixture({ bossAttack: shot => shots.push({ kind: shot.kind, state: shot.member.state, age: shot.member.stateAge }) });
        ready(f); f.boss.autoAssistTimer = 100000;
        const warned = new Set(), weapons = new Set(); let returning = false;
        const h = 60 / hz;
        for (let time = 0; time < 650; time += h) {
            for (const m of f.boss.members) if (m.state === 'warn') warned.add(m.id);
            for (const p of f.boss.projectiles) { weapons.add(p.kind); if (p.kind === 'claw' && p.returning) returning = true; }
            Duo.update(f.terrain, f.player, h);
        }
        assert.deepStrictEqual([...warned].sort(), ['crawfish', 'crocodile']);
        assert.deepStrictEqual([...weapons].sort(), ['claw', 'note']); assert(returning);
        assert(shots.some(s => s.kind === 'note') && shots.some(s => s.kind === 'claw'));
        assert(shots.every(s => s.state === 'attack'), 'warnings cannot deal an early shot');
    }
});

test('real note and claw contacts use shared shield, ring, invulnerability and fatal-damage rules', () => {
    for (const kind of ['note', 'claw']) for (const protection of ['shield', 'rings', 'invincibility', 'fatal']) {
        const f = fixture(); ready(f); f.boss.autoAssistTimer = 100000;
        assert(wait(f, 700, {}, 60, () => f.boss.projectiles.some(p => p.kind === kind)));
        const projectile = f.boss.projectiles.find(p => p.kind === kind), player = f.player;
        player.invincTimer = protection === 'invincibility' ? 100 : 0;
        player.invulnTimer = 0; player.shield = protection === 'shield'; player.rings = protection === 'rings' ? 5 : 0;
        player.x = projectile.x; player.y = projectile.y; player.state = E.STATE.AIRBORNE; player.curled = false;
        f.boss.previousPlayerX = player.x; f.boss.previousPlayerY = player.y;
        Duo.update(f.terrain, player, 1);
        if (protection === 'shield') assert(!player.shield && player.invulnTimer > 0 && player.state !== E.STATE.DYING);
        if (protection === 'rings') assert(player.rings === 0 && f.terrain.scatteredRings.length === 5 && player.invulnTimer > 0);
        if (protection === 'invincibility') assert(player.state !== E.STATE.DYING && !player.hurtPose);
        if (protection === 'fatal') assert.strictEqual(player.state, E.STATE.DYING);
    }
});

test('a failed life freezes the encounter and retry restores health, armor, ally and existing pickups in place', () => {
    let starts = 0;
    const f = fixture({ duoStart: () => starts++ }); ready(f);
    assert(nextOpening(f)); spinAt(f, f.boss.members.find(m => m.openTimer > 0));
    assert.strictEqual(f.boss.hp, 11);
    const ally = f.boss.ally, rings = f.boss.ringPickups.slice(), count = f.terrain.rings.length;
    f.player.invincTimer = 0; f.player.rings = 0; f.player.shield = false;
    f.player.die('GAME OVER', false);
    const before = JSON.stringify({ age: f.boss.age, members: f.boss.members, projectiles: f.boss.projectiles, actorX: ally.actorX });
    wait(f, 150);
    assert.strictEqual(JSON.stringify({ age: f.boss.age, members: f.boss.members, projectiles: f.boss.projectiles, actorX: ally.actorX }), before);
    f.player.respawn(); Duo.update(f.terrain, f.player, 1);
    assert.strictEqual(f.terrain.boss, f.boss); assert.strictEqual(f.boss.ally, ally);
    assert.strictEqual(f.boss.hp, 12); assert(f.boss.members.every(m => m.hp === 6 && m.shell && !m.openTimer));
    assert.strictEqual(f.boss.projectiles.length, 0); assert.strictEqual(ally.assistCount, 0);
    assert.strictEqual(f.terrain.rings.length, count); assert(rings.every(r => f.boss.ringPickups.includes(r)));
    assert.strictEqual(starts, 2);
});

test('real player running and jumping wins all twelve distinct hit windows at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        const f = winWithPhysics(hz), score = f.player.score;
        const defeatAges = f.boss.members.map(m => m.defeatAge);
        assert(defeatAges.every(Number.isFinite));
        assert(Math.abs(f.boss.ally.actorX - f.events.allyBeforeVictory) <= 2.4 * 60 / hz + 1e-6,
            'victory may advance Rosie by normal walking, but cannot relocate her');
        wait(f, 200, {}, hz);
        assert.strictEqual(f.events.hit, 12); assert.strictEqual(f.events.defeat, 1);
        assert.strictEqual(f.player.score, score); assert.strictEqual(f.boss.effects.length, 0);
        f.player.x = f.boss.right + 130; Duo.update(f.terrain, f.player, 1);
        assert(f.player.x > f.boss.right, 'victory must release the combat gate so the real capsule is reachable');
    }
});

test('normal shield and ring recovery allow a real dodge-and-tag victory without forced protection at every refresh rate', () => {
    for (const hz of [30, 60, 144]) {
        let deaths = 0, hits = 0;
        const f = fixture({ deathStart: () => deaths++, bossHit: () => hits++ });
        const { boss: b, player: p, terrain: t } = f;
        p.rings = 18; p.shield = true;
        let previousJump = false;
        for (let i = 0; i < hz * 160 && !b.defeated && !deaths; i++) {
            const target = b.members.find(m => m.openTimer > 0)
                || b.members.find(m => m.id === b.ally.assistTarget && m.hp > 0)
                || b.members.find(m => m.hp > 0);
            const attacking = target.openTimer > 0 || (b.ally.assistTarget === target.id
                && Math.abs(b.ally.actorX - target.x) < 150 && b.ally.assistPhase);
            let desired = target.x - (attacking ? 70 : 220), recovery = null;
            if (p.rings === 0) {
                recovery = t.rings.filter(r => !r.collected && r.x > b.left && r.x < b.right)
                    .concat(t.scatteredRings.filter(r => r.life > 15))
                    .sort((a, c) => Math.abs(a.x - p.x) - Math.abs(c.x - p.x))[0];
                if (recovery) desired = recovery.x;
            }
            const hazard = b.projectiles.some(s => Math.abs(s.x - p.x) < 160 && Math.abs(s.y - p.y) < 80);
            const jump = p.grounded && (recovery ? recovery.y < p.y - 30
                : (target.openTimer > 0 && Math.abs(target.x - p.x) < 150) || hazard);
            const input = { left: p.x > desired + 9, right: p.x < desired - 9,
                jumpHeld: jump, jumpPressed: jump && !previousJump, talkPressed: i % (hz * 3) === 0 };
            if (!p.grounded) {
                const airTarget = recovery ? recovery.x : target.openTimer > 0 ? target.x : desired;
                input.left = airTarget < p.x - 5; input.right = airTarget > p.x + 5; input.jumpHeld = true;
            }
            p.update(input, 1 / hz); previousJump = jump;
        }
        assert(b.defeated && hits === 12, `${hz} Hz normal fight must be winnable through physical inputs; hp=${b.hp}`);
        assert.strictEqual(deaths, 0, `${hz} Hz normal ring recovery route must preserve a life`);
        assert.strictEqual(t.rings.filter(r => r.duoRing).length, 8, 'resupply stays a finite pool');
    }
});

test('invalid timing cannot change state and extreme catch-up stays bounded without growing resources', () => {
    const f = fixture(); ready(f);
    const before = JSON.stringify(f.boss);
    for (const delta of [NaN, Infinity, -Infinity, -1, 0]) Duo.update(f.terrain, f.player, delta);
    assert.strictEqual(JSON.stringify(f.boss), before);
    Duo.update(f.terrain, f.player);
    assert.strictEqual(f.boss.age, 106, 'omitted timing defaults to one frame');
    const age = f.boss.age;
    Duo.update(f.terrain, f.player, 1000000, null);
    assert(Math.abs(f.boss.age - age - 15) < 1e-6);
    assert.notStrictEqual(JSON.stringify(f.boss), before);
    for (let i = 0; i < 2000; i++) Duo.update(f.terrain, f.player, i % 2 ? .41 : 2.1, {});
    assert(f.boss.projectiles.length <= 24 && f.boss.effects.length <= 128);
    assert(Number.isFinite(f.boss.age) && Number.isFinite(f.boss.ally.actorX));
});
