/** Standard-mapped synthetic pads through the shipped RAF/Game/physics runtime.
 * This validates integration; it does not claim physical Xbox hardware testing.
 */
'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
const tests = [];
function test(name, run) { tests.push({ name, run }); }

function rig(stage = 'palmtree', hz = 60) {
    const h = createGameHarness({ stage }), g = h.game;
    const pad = { id: 'Synthetic Xbox standard mapping', index: 0, connected: true,
        mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    let pads = [pad];
    h.sandbox.navigator.getGamepads = () => pads.map(p => p && ({ ...p, axes: p.axes.slice(),
        buttons: p.buttons.map(button => ({ ...button })) }));
    const r = { h, g, pad, button(index, down = true) { pad.buttons[index] = { pressed: down, value: down ? 1 : 0 }; },
        run(count = 1, ms = 1000 / hz) { for (let i = 0; i < count; i++) h.frame(ms); },
        neutral(count = 3) { pad.axes.fill(0); for (let i = 0; i < pad.buttons.length; i++) r.button(i, false); r.run(count); },
        tap(index) { r.button(index); r.run(); r.button(index, false); r.run(); },
        key(code, down = true) { h.dispatchWindow(down ? 'keydown' : 'keyup', { code, repeat: false }); },
        disconnect() { pads = []; }, reconnect() { pads = [pad]; },
        placeAtStart() { const cp = g.terrain.checkpoints[0]; g.player.place(cp.x, 0, cp.y); },
    };
    g.titleCard = null; g.fadeAlpha = 0;
    r.neutral();
    assert(g.input.gamepadConnected && g.input.gamepadActive, 'a neutral standard controller must arm through Game.frame');
    return r;
}
function healthy(r) {
    assert.strictEqual(r.h.scheduledFrames.size, 1, 'controller interaction must preserve the singleton animation loop');
    const stats = r.h.canvasStats();
    assert.strictEqual(stats.invalid, 0); assert.strictEqual(stats.restoreUnderflow, 0);
    assert.deepStrictEqual(stats.unbalanced, []);
}
function world(g) {
    const p = g.player, t = g.terrain;
    return JSON.stringify({ stage: g.stageName, time: g.stageTime, clock: t.clock,
        x: p.x, y: p.y, xsp: p.xsp, ysp: p.ysp, gsp: p.gsp, state: p.state,
        lives: p.lives, rings: p.rings, score: p.score, death: p.deathTimer,
        over: g.gameOverTimer, clear: g.actClear, title: g.titleCard, fade: g.fadeAlpha,
        camera: [g.camX, g.camY], lava: t.z2a2?.lavaAge, npc: t.z2a2?.reunion,
        platforms: t.platforms.map(item => [item.x, item.y, item.dx, item.dy]),
        particles: g.particles, trail: g.scarTrail });
}
function nearRosie(r) {
    const { g } = r, n = g.terrain.z2a2.reunion;
    n.met = n.noticed = true; n.actionTimer = n.reactionTimer = 0;
    n.actorX = n.x; n.actorY = n.y;
    g.player.place(n.x + 60, 0, n.y); g.player.facing = 1; g.player.rings = 20;
    g.player.invulnTimer = 0;
    r.neutral();
    assert(g.canTalkToRosie());
    return n;
}

test('D-pad/stick movement and held A use the actual player at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        const r = rig('palmtree', hz), { g } = r;
        try {
            const startX = g.player.x;
            r.button(15); r.run(Math.ceil(hz / 2));
            assert(g.player.x > startX + 10, `${hz} Hz D-pad must run Scar`);
            r.neutral(); r.placeAtStart();
            const beforeStick = g.player.x;
            r.pad.axes[0] = 1; r.run(Math.ceil(hz / 2));
            assert(g.player.x > beforeStick + 10, `${hz} Hz left stick must run Scar`);
            r.neutral(); r.placeAtStart();
            const standingFeet = g.player.y + g.player.radii.height;
            r.button(0); r.run(2);
            assert(!g.player.grounded && g.player.y + g.player.radii.height < standingFeet && g.player.ysp < 0,
                `${hz} Hz A must create a real jump`);
            let landed = false;
            for (let i = 0; i < hz * 3; i++) {
                r.run();
                if (g.player.grounded) landed = true;
                if (landed) assert(g.player.grounded, 'holding A must not auto-jump after landing');
            }
            assert(landed, 'the held-jump trace must include landing');
            healthy(r);
        } finally { r.h.dispose(); }
    }
});

test('down+A charges/releases spindash and up+A charges/releases a real peelout', () => {
    const r = rig(), { g } = r;
    try {
        r.button(13); r.button(0); r.run();
        assert.strictEqual(g.player.state, 'SPINDASH');
        r.button(0, false); r.run(3); r.button(0); r.run();
        assert(g.player.spindashRev > 0);
        r.button(0, false); r.button(13, false); r.run();
        assert.strictEqual(g.player.state, 'ROLLING');
        assert(Math.abs(g.player.gsp) >= 8);
        r.neutral(); r.placeAtStart();
        r.button(12); r.button(0); r.run();
        assert.strictEqual(g.player.state, 'PEELOUT');
        r.run(20); r.button(0, false); r.button(12, false); r.run();
        assert.strictEqual(g.player.state, 'RUNNING');
        assert(Math.abs(g.player.gsp) >= 8 && g.player.boostTrailTimer > 0);
        healthy(r);
    } finally { r.h.dispose(); }
});

test('a fresh A performs a marked-wall kick while airborne', () => {
    const r = rig('z2_act1'), { g } = r;
    try {
        const p = g.player, shaft = g.terrain.z2.shafts[0];
        p.x = shaft.x0 + 12; p.y = shaft.bottom - 26;
        p.state = 'AIRBORNE'; p.curled = false; p.xsp = 0; p.ysp = 2;
        r.button(14); r.run();
        assert.strictEqual(p.wallSlide, -1);
        r.button(0); r.run();
        assert(p.xsp > 7 && p.ysp < -7 && p.wallKickTimer > 0, 'A must reach the real wall-contact jump mechanic');
        assert(!p.grounded && p.facing === 1);
        healthy(r);
    } finally { r.h.dispose(); }
});

test('X opens dialogue, pad navigation selects, A replies once, and B leaves', () => {
    const r = rig('z2_act2'), { g } = r;
    try {
        nearRosie(r);
        r.button(2); r.run();
        let view = g.rosieConversationView();
        assert(view.open && !g.player.jumped);
        const initialRevision = view.revision;
        r.run(12);
        assert(g.rosieConversationView().open && g.rosieConversationView().revision === initialRevision,
            'holding X must not close or restart the conversation');
        r.neutral();
        const x = g.player.x;
        r.pad.axes[0] = 1; r.run(15);
        assert.strictEqual(g.player.x, x, 'pad dialogue navigation may not move Scar');
        r.pad.axes[0] = 0;
        r.tap(13);
        assert.strictEqual(g.dialogueSelection, 1);
        assert.strictEqual(r.h.elements.get('rosie-choice-1').getAttribute('aria-current'), 'true');
        r.button(0); r.run();
        view = g.rosieConversationView();
        assert(view.open && view.revision !== initialRevision);
        const replyRevision = view.revision;
        r.run(20);
        assert.strictEqual(g.rosieConversationView().revision, replyRevision, 'held A may not send repeated replies');
        assert(g.player.grounded && !g.player.jumped);
        r.neutral(); r.tap(1);
        assert(!g.rosieConversationView().open);
        assert(g.player.grounded && !g.input.jumpHeld);
        healthy(r);
    } finally { r.h.dispose(); }
});

test('A closing a conversation cannot become a gameplay jump until release and a fresh press', () => {
    const r = rig('z2_act2'), { g } = r;
    try {
        nearRosie(r); r.tap(2); r.neutral();
        r.tap(13); r.tap(13);
        assert.strictEqual(g.dialogueSelection, 2);
        r.button(0); r.run();
        assert(!g.rosieConversationView().open, 'the selected goodbye must close the conversation');
        r.run(20);
        assert(g.player.grounded && !g.player.jumped && !g.input.jumpHeld,
            'the held confirm button must stay consumed after dialogue closes');
        r.neutral(); r.button(0); r.run();
        assert(!g.player.grounded && g.player.ysp < 0, 'a later fresh A must still jump');
        healthy(r);
    } finally { r.h.dispose(); }
});

test('Menu freezes every world phase and A resumes without a jump or paused-time catch-up', () => {
    for (const phase of ['playing', 'dying', 'gameOver', 'tally', 'fadeOut', 'rosieHop']) {
        const r = rig(phase === 'rosieHop' ? 'z2_act2' : 'palmtree'), { g } = r;
        try {
            const p = g.player;
            if (phase === 'dying') p.die();
            if (phase === 'gameOver') { p.lives = 1; p.loseLife(); g.gameOverTimer = 145; }
            if (phase === 'tally' || phase === 'fadeOut') {
                g.terrain.goalPost.cleared = true; g.updateActClear(1, false);
                g.actClear.phase = phase; g.fadeAlpha = phase === 'fadeOut' ? .4 : 0;
            }
            if (phase === 'rosieHop') {
                const n = nearRosie(r);
                p.update({ jumpPressed: true, jumpHeld: true }, 1 / 60);
                assert(!n.grounded && n.actorY < n.y);
            }
            r.tap(9);
            assert(g.paused && !r.h.elements.get('pause-panel').hidden);
            const frozen = world(g);
            for (let i = 0; i < 12; i++) {
                r.run(1, 1000);
                assert.strictEqual(world(g), frozen, `${phase}: paused callbacks may not advance any world timer or movement`);
                assert.strictEqual(g.dt60, 0);
            }
            const stageTime = g.stageTime;
            r.button(0); r.run(1, 1000);
            assert(!g.paused && r.h.elements.get('pause-panel').hidden);
            assert.strictEqual(g.stageTime, stageTime, 'the resume callback must exclude its paused interval');
            assert(!g.input.jumpHeld && !g.input.jumpPressed, 'resume A may not leak into the player');
            if (phase === 'playing') {
                r.run(10);
                assert(g.player.grounded && !g.player.jumped, 'held resume A may not jump on subsequent gameplay frames');
                r.neutral(); r.button(0); r.run();
                assert(!g.player.grounded && g.player.ysp < 0);
            }
            healthy(r);
        } finally { r.h.dispose(); }
    }
});

test('pausing a conversation hides its panel, preserves the branch and restores its selection', () => {
    const r = rig('z2_act2'), { g } = r;
    try {
        nearRosie(r); r.tap(2); r.neutral(); r.tap(13);
        const view = g.rosieConversationView(), selection = g.dialogueSelection;
        assert(view.open && selection === 1);
        r.tap(9);
        assert(g.paused && r.h.elements.get('rosie-dialogue').hidden);
        const frozen = world(g);
        r.run(30);
        assert.strictEqual(world(g), frozen);
        assert(g.rosieConversationView().open && g.rosieConversationView().revision === view.revision);
        r.tap(0); r.neutral();
        assert(!g.paused && !r.h.elements.get('rosie-dialogue').hidden);
        assert.strictEqual(g.dialogueSelection, selection);
        assert.strictEqual(g.rosieConversationView().revision, view.revision, 'resuming may not submit a dialogue reply');
        r.button(0); r.run();
        assert(g.rosieConversationView().revision !== view.revision, 'a later A confirms the restored choice');
        healthy(r);
    } finally { r.h.dispose(); }
});

test('disconnect preserves keyboard sources; reconnect, visibility and focus changes require neutral', () => {
    const r = rig(), { g, h } = r;
    try {
        r.key('KeyD'); r.key('Space'); r.button(15); r.button(0); r.run();
        r.disconnect(); r.run();
        assert(g.input.right && g.input.jumpHeld, 'unplugging a pad must preserve held keyboard controls');
        r.key('KeyD', false); r.key('Space', false);
        assert(!g.input.right && !g.input.jumpHeld);
        r.reconnect(); r.placeAtStart(); r.run(10);
        assert(!g.input.right && !g.input.jumpHeld && g.player.grounded,
            'reconnecting with held A/direction must wait for neutral');
        r.neutral(); r.button(0); r.run();
        assert(!g.player.grounded);
        h.dispatchWindow('blur');
        assert(!g.input.jumpHeld);
        h.dispatchWindow('focus'); r.placeAtStart(); r.run(10);
        assert(g.player.grounded && !g.input.jumpHeld, 'refocusing with held A must not jump');
        r.neutral();
        h.sandbox.document.hidden = true; h.dispatchDocument('visibilitychange');
        const frozen = world(g);
        r.button(0); r.run(2, 1000);
        assert.strictEqual(world(g), frozen);
        h.sandbox.document.hidden = false; h.dispatchDocument('visibilitychange'); r.placeAtStart(); r.run(10);
        assert(g.player.grounded && !g.input.jumpHeld, 'returning with held A must wait for neutral');
        r.neutral(); r.button(0); r.run(); assert(!g.player.grounded);
        healthy(r);
    } finally { h.dispose(); }
});

test('A continues game over and act results without carrying a held jump into the new scene', () => {
    for (const phase of ['gameOver', 'results']) {
        const r = rig(), { g } = r;
        try {
            const oldPlayer = g.player;
            if (phase === 'gameOver') { oldPlayer.lives = 1; oldPlayer.loseLife(); g.gameOverTimer = 145; }
            else {
                g.terrain.goalPost.cleared = true; g.updateActClear(1, false);
                g.actClear.phase = 'hold'; g.actClear.timer = 50;
            }
            r.button(0); r.run();
            for (let i = 0; i < 90 && g.player === oldPlayer; i++) r.run();
            assert.notStrictEqual(g.player, oldPlayer, `${phase}: A must continue into a fresh scene`);
            const nextPlayer = g.player;
            r.run(15);
            assert.strictEqual(g.player, nextPlayer);
            assert(g.player.grounded && !g.player.jumped && !g.input.jumpHeld,
                `${phase}: the held continue press may not become a new-scene jump`);
            r.neutral(); r.button(0); r.run();
            assert(!g.player.grounded, 'a fresh post-transition A must still work');
            healthy(r);
        } finally { r.h.dispose(); }
    }
});

console.log('\nGamepad gameplay, conversations and pause integration (synthetic standard mapping)');
let failures = 0;
for (const { name, run } of tests) {
    try { run(); console.log(`  PASS ${name}`); }
    catch (error) { failures++; console.error(`  FAIL ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
else console.log(`Gamepad Game integration: ${tests.length} groups passed; physical hardware not tested.`);
