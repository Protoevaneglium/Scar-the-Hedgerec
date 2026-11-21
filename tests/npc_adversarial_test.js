/** Adversarial NPC and Molten Sanctuary lifetime regressions with reproducible inputs. */
'use strict';
const assert = require('assert');
const C = require('../public/levels/rosie_npc.js');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
require('../public/levels/zone2_act2.js');

let failures = 0, simulated = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function playerAt(n, x = n.x - 60) {
    return { x, y: n.y - 19, radii: { height: 19 }, grounded: true, gsp: 0, xsp: 0, rings: 5 };
}
function fixture(events = {}) {
    const terrain = new Terrain('z2_act2'), player = new Player(terrain, events);
    terrain.enemies = []; terrain.rings = []; terrain.monitors = [];
    return { terrain, player, z: terrain.z2a2 };
}
console.log('\nAdversarial Rosie and Molten Sanctuary');

test('invalid and extreme standalone update/finish times cannot hang or corrupt the actor', () => {
    const n = C.create(), p = playerAt(n);
    for (const bad of [NaN, Infinity, -Infinity, 0, -1]) {
        const before = JSON.stringify(n);
        assert.deepStrictEqual(C.update(n, p, { upPressed: true }, bad), { met: false, talk: false, hop: false });
        assert.strictEqual(JSON.stringify(n), before, 'an invalid update must not consume input or mutate the actor');
        C.finish(n, bad);
        assert.strictEqual(JSON.stringify(n), before, 'an invalid finish tick must not corrupt animation or jump physics');
    }
    const bounded = C.create(), delayed = C.create();
    C.update(bounded, p, { jumpPressed: true, jumpHeld: true }, 15);
    C.update(delayed, p, { jumpPressed: true, jumpHeld: true }, Number.MAX_VALUE);
    assert.deepStrictEqual(delayed, bounded, 'a delayed callback must simulate at most 250 ms of NPC catch-up');
    assert(delayed.age === 15 && Number.isFinite(delayed.actorY));
    const finishBounded = JSON.parse(JSON.stringify(delayed)), finishDelayed = JSON.parse(JSON.stringify(delayed));
    C.finish(finishBounded, 15); C.finish(finishDelayed, Number.MAX_VALUE);
    assert.deepStrictEqual(finishDelayed, finishBounded);
    assert(Number.isFinite(finishDelayed.actorY) && finishDelayed.actorY <= finishDelayed.y);
    const finishSeparate = JSON.parse(JSON.stringify(delayed));
    for (let i = 0; i < 15; i++) C.finish(finishSeparate, 1);
    assert.deepStrictEqual(finishBounded, finishSeparate,
        'finishing a hop must use ordinary one-frame physics even after a delayed callback');
});

test('crowding at either sanctuary boundary resolves without trapping or pushing Scar', () => {
    for (const hz of [30, 60, 144]) for (const side of [-1, 1]) {
        const n = C.create(); n.met = n.noticed = true;
        n.actorX = n.x + (side < 0 ? -360 : 180);
        const p = playerAt(n, n.actorX - side * 10), originalX = p.x;
        for (let frame = 0; frame < hz * 3; frame++) {
            C.update(n, p, {}, 60 / hz);
            assert(n.actorX >= n.x - 360 && n.actorX <= n.x + 180);
            assert.strictEqual(p.x, originalX, 'making room may move Rosie, never Scar');
        }
        assert(Math.abs(n.actorX - p.x) >= 40,
            `${hz} Hz boundary ${side}: an outward blocked step must choose room on the other side`);
        assert(!n.makingRoom, 'the avoidance state must eventually resolve');
    }
});

test('a quick Up edge blocked by cooldown is not replayed in a later substep', () => {
    const n = C.create(), p = playerAt(n);
    n.met = n.noticed = true; n.talkCooldown = 1.5;
    const blocked = C.update(n, p, { upPressed: true }, 2);
    assert(!blocked.talk && n.chatIndex === 0,
        'a press before cooldown expiry cannot become a new press in the second substep');
    C.update(n, p, {}, 1);
    assert(C.update(n, p, { upPressed: true }, 2).talk, 'a genuinely new press after cooldown should work');
    assert.strictEqual(n.chatIndex, 1, 'the update must consume one dialogue edge once');
});

test('a conversation interrupts old patrol timing until the response has been shown', () => {
    const n = C.create(), p = playerAt(n);
    n.met = n.noticed = true; n.idleAge = 260; n.patrolPhase = 'out'; n.patrolTarget = n.x + 38;
    assert(C.update(n, p, { upPressed: true }, 1).talk);
    const x = n.actorX;
    for (let i = 0; i < 130; i++) {
        C.update(n, p, {}, 1);
        assert.strictEqual(n.actorX, x, 'a stale patrol clock must not walk away during a new conversation');
    }
    assert(n.messageTimer > 0 && n.canTalk);
});

test('seeded jittered interactions stay finite, grounded correctly, bounded, and animate actual movement', () => {
    const rates = [2, 1, 60 / 144, .7, 1.8, 0];
    for (let seed = 1; seed <= 12; seed++) {
        let rng = seed;
        const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 0x100000000; };
        const n = C.create(), p = playerAt(n);
        let up = false, jump = false, met = 0, frameTime = 0, lastTalk = -Infinity, lastHop = -Infinity;
        for (let frame = 0; frame < 6000; frame++) {
            if (frame % 75 === 0) {
                p.x = n.x - 500 + random() * 1000;
                p.y = n.y - 19 - (random() < .2 ? 180 : 0);
                p.gsp = random() < .35 ? (random() < .5 ? -10 : 10) : 0;
            }
            const nextUp = random() < .07 ? !up : up;
            const nextJump = random() < .05 ? !jump : jump;
            const h = rates[(frame + seed) % rates.length], beforeX = n.actorX;
            const result = C.update(n, p, { up: nextUp, upPressed: nextUp && !up,
                jumpHeld: nextJump, jumpPressed: nextJump && !jump }, h);
            frameTime += h;
            if (result.met) met++;
            if (result.talk) { assert(frameTime - lastTalk >= 119 - 1e-6, `seed ${seed}: talk cooldown`); lastTalk = frameTime; }
            if (result.hop) { assert(frameTime - lastHop >= 99 - 1e-6, `seed ${seed}: hop cooldown`); lastHop = frameTime; }
            for (const key of ['actorX', 'actorY', 'animationClock', 'vy', 'timer', 'messageTimer', 'age']) {
                assert(Number.isFinite(n[key]), `seed ${seed}, frame ${frame}: ${key} must stay finite`);
            }
            assert(n.actorX >= n.x - 360 - 1e-6 && n.actorX <= n.x + 180 + 1e-6);
            assert(n.actorY <= n.y + 1e-6, `seed ${seed}: feet may never sink under the temple floor`);
            if (n.grounded) assert.strictEqual(n.actorY, n.y);
            else assert.strictEqual(n.state, 'hop');
            if (h > 0 && n.state === 'walk') assert(Math.abs(n.actorX - beforeX) > 1e-8,
                `seed ${seed}, frame ${frame}: a walk cycle must correspond to actual displacement`);
            assert(met <= 1, `seed ${seed}: ordinary reactions cannot replay the reunion`);
            if (h > 0) { up = nextUp; jump = nextJump; }
            simulated++;
        }
    }
});

test('jittered lava ignition and warning cues are exact once and survive a normal death retry', () => {
    let ignitions = 0, warnings = 0;
    const { terrain, player, z } = fixture({ lavaIgnite: () => ignitions++, heatWarning: () => warnings++ });
    const chunks = [2, .42, 1.2, .7, 1.9];
    player.place(120, 0, 360);
    let frame = 0;
    while (z.lavaAge < 900) {
        const h = Math.min(chunks[frame++ % chunks.length], 900 - z.lavaAge);
        terrain.updateObjects(player, h);
    }
    assert(z.lavaActive && Math.abs(z.lavaAge - 900) < 1e-6);
    assert.strictEqual(ignitions, 1); assert.strictEqual(warnings, 5);
    const age = z.lavaAge;
    player.die();
    for (let i = 0; i < 400 && player.state === STATE.DYING; i++) player.update({}, 1 / 60);
    assert(player.lives === 2 && player.state !== STATE.DYING, 'death must return to a playable retry');
    assert.strictEqual(z.lavaAge, age, 'the global ignition clock pauses, rather than resetting or advancing, during death');
    player.update({}, 1 / 60);
    assert(z.lavaAge > age && z.lavaActive);
    assert.strictEqual(ignitions, 1, 'retrying a life cannot replay global ignition');
    terrain.resetObjects();
    assert(!z.lavaAge && !z.lavaActive && !z.reunion.met);
});

if (failures) process.exitCode = 1;
else console.log(`  Adversarial NPC checks passed (${simulated.toLocaleString()} seeded jittered updates).`);
