/** Autonomous hugs must be gentle, optional, interruptible, and frame-rate independent. */
'use strict';
const assert = require('assert');
const C = require('../public/levels/rosie_npc.js');
let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(side = 1) {
    const n = C.create(1000, 500);
    n.met = n.noticed = true;
    const p = { x: n.x + side * 60, y: n.y - 19, radii: { height: 19 },
        grounded: true, state: 'STANDING', facing: side, gsp: 0, xsp: 0, ysp: 0, rings: 5 };
    return { n, p };
}
function advance(n, p, frames, h = 1, input = {}) {
    let hugs = 0, talks = 0;
    while (frames > 1e-8) {
        const step = Math.min(frames, h), before = JSON.stringify(p), x = n.actorX;
        const result = C.update(n, p, input, step);
        hugs += !!result.hug; talks += !!result.talk;
        assert.strictEqual(JSON.stringify(p), before, 'NPC behavior must never mutate or lock Scar');
        assert(n.actorX >= n.x - 360 && n.actorX <= n.x + 180);
        assert(Number.isFinite(n.actorX) && Number.isFinite(n.heartTimer));
        if (n.state === 'walk') assert(Math.abs(n.actorX - x) > 0, 'walking must move Rosie');
        frames -= step;
    }
    return { hugs, talks };
}
function hold(n, p, h = 1) {
    let hugs = 0, elapsed = 0;
    while (n.hugPhase !== 'hold' && elapsed < 150) {
        hugs += advance(n, p, h, h).hugs; elapsed += h;
    }
    assert.strictEqual(n.hugPhase, 'hold', 'Rosie should approach and reach a hug');
    assert.strictEqual(hugs, 1, 'one physical approach emits one hug event');
}
console.log('\nRosie autonomous hugs');

test('looking away invites a delayed natural approach and a planted hug from either side at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) for (const side of [-1, 1]) {
        const { n, p } = fixture(side), h = 60 / hz, origin = n.actorX;
        advance(n, p, 29, h);
        assert.strictEqual(n.actorX, origin, 'she waits before entering personal space');
        assert.strictEqual(n.hugPhase, null);
        let walked = false, hugs = 0;
        for (let elapsed = 0; elapsed < 100 && n.hugPhase !== 'hold'; elapsed += h) {
            const x = n.actorX;
            hugs += advance(n, p, h, h).hugs;
            walked ||= n.state === 'walk';
            assert(Math.abs(n.actorX - x) <= 1.2 * h + 1e-6, 'hug approach has a gentle bounded speed');
        }
        assert(walked && hugs === 1 && n.state === 'hug');
        assert(Math.abs(n.actorX - (p.x - side * 18)) < 1e-6, 'hug stays behind Scar');
        assert(n.hugTimer > 0 && n.heartTimer > 0 && n.actorY === n.y && n.grounded);
        const hugX = n.actorX, heart = n.heartTimer;
        advance(n, p, 20, h);
        assert.strictEqual(n.actorX, hugX, 'the hold does not drift');
        assert(n.heartTimer > heart, 'the renderer receives advancing heart timing');
        advance(n, p, 72, h);
        assert.strictEqual(n.hugPhase, null);
        assert.strictEqual(n.heartTimer, 0);
        assert(n.hugCooldown > 400, 'the completed hug starts a substantial cooldown');
        assert.strictEqual(advance(n, p, 300, h).hugs, 0, 'remaining nearby cannot spam hugs');
        assert(Math.abs(n.actorX - p.x) >= 40, 'Rosie returns to ordinary spacing after the hug');
    }
});

test('looking toward, unknown facing, unsafe poses, different decks, and requested space never trigger a hug', () => {
    const cases = [
        ({ p }) => { p.facing = -1; },
        ({ p }) => { delete p.facing; },
        ({ p }) => { p.facing = 0; },
        ({ p }) => { p.facing = NaN; },
        ({ p }) => { delete p.state; },
        ({ p }) => { p.state = 'RUNNING'; },
        ({ p }) => { p.state = 'SPINDASH'; },
        ({ p }) => { p.grounded = false; },
        ({ p }) => { p.y -= 30; },
        ({ p }) => { p.gsp = .3; },
        ({ p }) => { p.xsp = .3; },
        ({ p }) => { p.hurtPose = true; },
        ({ p }) => { p.invulnTimer = 30; },
        ({ p }) => { p.crouching = true; },
        ({ n }) => { n.conversation = { memory: { hugPreference: 'ask' } }; },
        ({ n }) => { n.conversation = { memory: { hugPreference: 'space' } }; },
        ({ n, p }) => { n.met = false; n.actorX = n.x - 250; p.x = n.x - 300; p.facing = -1; },
    ];
    cases.forEach((change, index) => {
        const f = fixture(); change(f);
        assert.strictEqual(advance(f.n, f.p, 180, .7).hugs, 0, `blocked case ${index}`);
        assert.strictEqual(f.n.hugPhase, null, `blocked case ${index}`);
        assert.strictEqual(f.n.heartTimer, 0);
    });
    for (const preference of ['unknown', 'welcome']) {
        const { n, p } = fixture(); n.conversation = { memory: { hugPreference: preference } };
        hold(n, p);
    }
});

test('turning, movement, jumps, hurt, dialogue, or leaving cancel both approach and hold immediately', () => {
    const interruptions = [
        f => { f.p.facing *= -1; },
        f => { f.p.gsp = 1; },
        f => { f.p.x += 10; },
        f => { f.input = { right: true }; },
        f => { f.input = { down: true }; },
        f => { f.input = { jumpPressed: true, jumpHeld: true }; },
        f => { f.p.grounded = false; f.p.state = 'AIRBORNE'; },
        f => { f.p.hurtPose = true; },
        f => { f.p.invulnTimer = 100; },
        f => { f.p.x += 500; },
        f => { f.p.y -= 100; },
        f => { f.input = { dialogueOpen: true }; },
        f => { f.n.conversation = { active: true }; },
        f => { f.input = { talkPressed: true }; },
        f => { f.n.conversation = { memory: { hugPreference: 'space' } }; },
    ];
    for (const phase of ['approach', 'hold']) interruptions.forEach((interrupt, index) => {
        const f = fixture();
        if (phase === 'hold') hold(f.n, f.p);
        else { advance(f.n, f.p, 32); assert.strictEqual(f.n.hugPhase, 'approach'); }
        interrupt(f);
        advance(f.n, f.p, 1, 1, f.input || {});
        assert.strictEqual(f.n.hugPhase, null, `${phase} interruption ${index}`);
        assert.notStrictEqual(f.n.state, 'hug');
        assert.strictEqual(f.n.heartTimer, 0, 'cancelled hugs leave no detached hearts');
        assert(f.n.hugCooldown > 0);
    });
});

test('Up takes priority over hugging, while an open conversation suppresses patrol and following', () => {
    const { n, p } = fixture(); hold(n, p);
    const result = advance(n, p, 2, 2, { upPressed: true, up: true });
    assert.strictEqual(result.talks, 1);
    assert.strictEqual(result.hugs, 0);
    assert(n.state === 'greet' && !n.hugPhase && n.heartTimer === 0);
    p.x = n.x + 150;
    n.conversation = { active: true };
    const x = n.actorX;
    advance(n, p, 600, 2, { dialogueOpen: true, upPressed: true });
    assert.strictEqual(n.actorX, x, 'an open conversation keeps Rosie available in place');
    assert(!n.following && !n.patrolPhase && !n.canTalk && n.facing === 1);
});

test('temple boundaries never permit an out-of-bounds hug approach', () => {
    for (const side of [-1, 1]) {
        const { n, p } = fixture(side);
        p.x = side === 1 ? n.x - 350 : n.x + 170;
        n.actorX = p.x - side * 8;
        assert.strictEqual(advance(n, p, 300, 2).hugs, 0, 'an unreachable behind position cannot start a hug');
        assert.strictEqual(n.hugPhase, null);
    }
});

test('death, results, and respawn close hugs while preserving conversation memory', () => {
    for (const mode of ['DYING', 'gameOver', 'finish', 'respawn']) {
        const { n, p } = fixture(); hold(n, p);
        const conversation = { active: true, nodeId: 'hello', memory: { hugPreference: 'welcome', route: 'sky' } };
        n.conversation = conversation;
        const x = n.actorX;
        if (mode === 'DYING') { p.state = 'DYING'; C.update(n, p); }
        if (mode === 'gameOver') { p.gameOver = true; C.update(n, p); }
        if (mode === 'finish') C.finish(n, 2);
        if (mode === 'respawn') C.resetAfterRespawn(n);
        assert.strictEqual(n.hugPhase, null);
        assert.strictEqual(n.heartTimer, 0);
        assert.notStrictEqual(n.state, 'hug');
        if (mode !== 'respawn') assert.strictEqual(n.actorX, x, 'cancelling a hug never teleports Rosie');
        else {
            assert.strictEqual(n.conversation, conversation);
            assert(!conversation.active && conversation.nodeId === null);
            assert.deepStrictEqual(conversation.memory, { hugPreference: 'welcome', route: 'sky' });
            assert(n.met && n.actorX === n.x);
        }
    }
});

if (failures) process.exitCode = 1;
else console.log('  All hug regressions passed.');
