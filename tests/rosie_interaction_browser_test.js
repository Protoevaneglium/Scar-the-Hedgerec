/** Exercise the shipped Rosie behavior, art passes, keyboard actions, and dialogue DOM together. */
'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(side = -1) {
    const h = createGameHarness({ stage: 'z2_act2' });
    const g = h.game, n = g.terrain.z2a2.reunion, p = g.player;
    g.titleCard = null; g.fadeAlpha = 0;
    g.terrain.rings = []; g.terrain.enemies = []; g.terrain.monitors = [];
    n.met = n.noticed = true; n.timer = n.actionTimer = n.messageTimer = 0;
    p.place(n.x + side * 60, 0, n.y);
    p.facing = side; p.rings = 20; p.invulnTimer = 0; p.hurtPose = false;
    g.snapCamera(); g.render();
    assert(g.canTalkToRosie(), 'the fixture must start physically beside Rosie');
    return { h, g, n, p };
}
function frames(h, count) { for (let i = 0; i < count; i++) h.frame(); }
function tap(h, code, extra = {}) {
    h.dispatchWindow('keydown', { code, ...extra });
    h.dispatchWindow('keyup', { code, ...extra });
}
function view(f) { return f.g.rosieConversationView(); }
function open(f) {
    tap(f.h, 'KeyC'); f.h.frame();
    assert(view(f).open && !f.h.elements.get('rosie-dialogue').hidden);
    return view(f);
}
function clickChoice(f, index) {
    const button = f.h.elements.get('rosie-choice-' + index);
    assert(!button.hidden && button.textContent, 'a visible choice must be bound to real dialogue');
    button.dispatch('click'); f.h.frame();
    return view(f);
}
function hold(f) {
    const start = { x: f.p.x, y: f.p.y, gsp: f.p.gsp, xsp: f.p.xsp, ysp: f.p.ysp, state: f.p.state };
    let frame = 0;
    for (; frame < 170 && f.n.state !== 'hug'; frame++) {
        f.h.frame();
        assert.deepStrictEqual({ x: f.p.x, y: f.p.y, gsp: f.p.gsp, xsp: f.p.xsp, ysp: f.p.ysp, state: f.p.state }, start,
            'the real hug update must never move Scar or replace his controls');
    }
    assert(f.n.state === 'hug' && f.n.heartTimer > 0, 'a real grounded look-away must reach the hug');
    assert(f.n.hugged, 'the level must receive and record the one-time hug event');
}
function closed(f) {
    assert(!view(f)?.open, 'the conversation must close');
    assert(f.h.elements.get('rosie-dialogue').hidden, 'the dialogue DOM must close too');
}
console.log('\nRosie browser interaction integration');

test('both hug facings render body behind Scar, a glove in front, and rising hearts without moving Scar', () => {
    for (const side of [-1, 1]) {
        const f = fixture(side), { h, g, n, p } = f;
        try {
            hold(f);
            assert(Math.abs(n.actorX - (p.x - side * 18)) < 1e-6 && n.facing === side);
            const calls = [], hearts = [];
            const art = h.sandbox.RosieArt, originalBody = art.draw, originalArm = art.drawHugArm;
            const originalPlayer = g.drawPlayer, originalFill = h.ctx.fill, originalBegin = h.ctx.beginPath;
            const originalMove = h.ctx.moveTo, originalLine = h.ctx.lineTo;
            let polygon = [];
            art.draw = (...args) => { if (args[4]?.state === 'hug') calls.push('body'); return originalBody(...args); };
            art.drawHugArm = (...args) => { calls.push('arm'); return originalArm(...args); };
            g.drawPlayer = function (...args) { calls.push('scar'); return originalPlayer.apply(this, args); };
            h.ctx.beginPath = (...args) => { polygon = []; return originalBegin(...args); };
            h.ctx.moveTo = (...args) => { polygon.push(args); return originalMove(...args); };
            h.ctx.lineTo = (...args) => { polygon.push(args); return originalLine(...args); };
            h.ctx.fill = (...args) => {
                if (h.ctx.fillStyle === '#ff8dbd') { calls.push('heart'); hearts.push(polygon.map(point => point.slice())); }
                return originalFill(...args);
            };
            const before = JSON.stringify({ x: p.x, y: p.y, state: p.state, facing: p.facing, gsp: p.gsp, xsp: p.xsp, ysp: p.ysp });
            n.heartTimer = 5; g.render();
            assert.deepStrictEqual(calls, ['body', 'scar', 'arm', 'heart', 'heart', 'heart']);
            assert.strictEqual(hearts.length, 3);
            const firstHearts = hearts.splice(0); calls.length = 0;
            n.heartTimer = 10; g.render();
            assert.strictEqual(hearts.length, 3);
            for (let i = 0; i < 3; i++) {
                assert(hearts[i][0][1] < firstHearts[i][0][1], 'each heart must rise above Rosie as its age advances');
                assert.strictEqual(hearts[i].length, 8, 'the heart must use the actual foreground polygon');
            }
            assert.strictEqual(JSON.stringify({ x: p.x, y: p.y, state: p.state, facing: p.facing, gsp: p.gsp, xsp: p.xsp, ysp: p.ysp }), before);
            p.facing *= -1; calls.length = 0; hearts.length = 0; g.render();
            assert(!calls.includes('arm') && !hearts.length && !n.hugPhase && !n.heartTimer,
                'turning toward Rosie removes both foreground glove and hearts immediately');
            const stats = h.canvasStats();
            assert(!stats.invalid && !stats.restoreUnderflow && !stats.unbalanced.length);
        } finally { h.dispose(); }
    }
});

test('a quick C tap opens once, held repeats stay open, and C or Escape closes without a jump', () => {
    const f = fixture();
    try {
        f.h.dispatchWindow('keydown', { code: 'KeyC' });
        f.h.dispatchWindow('keyup', { code: 'KeyC' });
        assert.strictEqual(f.g.input.actions.length, 1, 'a rapid tap must survive until RAF');
        assert(!f.g.input.jumpPressed && !f.g.input.jumpHeld);
        f.h.frame();
        const first = view(f);
        assert(first.open && first.nodeId === 'arrival');
        for (let i = 0; i < 8; i++) f.h.dispatchWindow('keydown', { code: 'KeyC', repeat: true });
        frames(f.h, 3);
        assert(view(f).open && view(f).session === first.session && view(f).revision === first.revision);
        tap(f.h, 'KeyC'); f.h.frame(); closed(f);
        assert(!f.g.input.jumpHeld && !f.g.input.jumpPressed && f.p.grounded);
        open(f); tap(f.h, 'Escape'); f.h.frame(); closed(f);
    } finally { f.h.dispose(); }
});

test('number keys choose three different branches and cannot warp checkpoints during conversation', () => {
    const nodes = ['story', 'sanctuary', null];
    for (let index = 0; index < 3; index++) {
        const f = fixture(); let warps = 0;
        try {
            const original = f.g.gotoCheckpoint;
            f.g.gotoCheckpoint = function (...args) { warps++; return original.apply(this, args); };
            open(f);
            for (const code of ['Digit4', 'Digit5', 'Digit6', 'Digit7']) tap(f.h, code);
            f.h.frame();
            assert.strictEqual(view(f).nodeId, 'arrival');
            tap(f.h, 'Digit' + (index + 1)); f.h.frame();
            assert.strictEqual(view(f).nodeId, nodes[index]);
            assert.strictEqual(warps, 0, 'dialogue numbers must never become checkpoint actions');
            assert(Math.abs(f.p.x - (f.n.x - 60)) < 1e-6);
        } finally { f.h.dispose(); }
    }
    const f = fixture();
    try {
        tap(f.h, 'Digit2'); f.h.frame();
        assert.strictEqual(f.g.cpIndex, 1, 'the ordinary checkpoint shortcut still works outside dialogue');
    } finally { f.h.dispose(); }
});

test('stale and duplicate choices cannot skip a line, while real on-screen buttons stay synchronized', () => {
    const f = fixture();
    try {
        f.h.elements.get('btn-talk').dispatch('click'); f.h.frame();
        const first = view(f);
        assert(first.open && f.h.elements.get('btn-talk').hidden);
        assert.strictEqual(f.h.elements.get('rosie-dialogue-line').textContent, first.text);
        const button = f.h.elements.get('rosie-choice-0');
        assert.strictEqual(Number(button.dataset.revision), first.revision);
        button.dispatch('click'); button.dispatch('click'); f.h.frame();
        const next = view(f);
        assert.strictEqual(next.nodeId, 'story', 'two clicks before one frame may choose only one reply');
        assert.strictEqual(next.revision, first.revision + 1);
        f.g.input.actions.push({ type: 'dialogueChoice', index: 0, revision: first.revision });
        f.h.frame();
        assert.strictEqual(view(f).nodeId, 'story', 'an event from the previous line must be rejected');
        clickChoice(f, 1);
        assert.strictEqual(view(f).nodeId, 'care');
        assert.strictEqual(f.h.elements.get('rosie-dialogue-line').textContent, view(f).text);
        f.h.elements.get('rosie-dialogue-close').dispatch('click'); f.h.frame(); closed(f);
        assert(!f.h.elements.get('btn-talk').hidden, 'the nearby talk button returns after closing');
    } finally { f.h.dispose(); }
});

test('Space, Z and X retain real jump controls during conversation and a distant C retains its jump', () => {
    for (const code of ['Space', 'KeyZ', 'KeyX']) {
        const f = fixture();
        try {
            open(f); const y = f.p.y;
            const focusedReply = f.h.elements.get('rosie-choice-0');
            Object.assign(focusedReply.dataset, { conversationControl: 'choice', choice: '0' });
            tap(f.h, code, { target: focusedReply }); frames(f.h, 3);
            assert(!f.p.grounded && f.p.y < y && f.p.ysp < 0, `${code} must launch Scar through real physics`);
            closed(f);
        } finally { f.h.dispose(); }
    }
    const f = fixture();
    try {
        f.p.place(120, 0, 360); f.g.snapCamera(); f.g.render();
        assert(!f.g.canTalkToRosie());
        tap(f.h, 'KeyC'); f.h.frame();
        assert(!f.p.grounded && f.p.ysp < 0, 'C away from Rosie keeps the legacy jump');
        assert(!view(f).open);
    } finally { f.h.dispose(); }
});

test('walking away closes naturally and a still-held C cannot turn into a jump afterward', () => {
    const f = fixture();
    try {
        f.h.dispatchWindow('keydown', { code: 'KeyC' }); f.h.frame();
        assert(view(f).open);
        const x = f.p.x;
        f.h.dispatchWindow('keydown', { code: 'ArrowLeft' });
        let elapsed = 0;
        while (view(f).open && elapsed++ < 150) f.h.frame();
        f.h.dispatchWindow('keyup', { code: 'ArrowLeft' });
        assert(f.p.x < x - 40 && !f.g.canTalkToRosie(), 'talking must leave Scar free to walk away');
        closed(f);
        f.h.dispatchWindow('keydown', { code: 'KeyC', repeat: true });
        assert(!f.g.input.jumpHeld && !f.g.input.jumpPressed, 'held C repeat after leaving must not create a jump');
        f.h.dispatchWindow('keyup', { code: 'KeyC' });
    } finally { f.h.dispose(); }
});

test('a real jump, death, warp, or finish clears a live hug through the browser callbacks', () => {
    for (const mode of ['jump', 'death', 'warp', 'clear']) {
        const f = fixture(1);
        try {
            hold(f);
            if (mode === 'jump') tap(f.h, 'Space');
            if (mode === 'death') f.p.die();
            if (mode === 'warp') f.g.gotoCheckpoint(1);
            if (mode === 'clear') f.g.terrain.goalPost.cleared = true;
            f.h.frame();
            assert(!f.n.hugPhase && !f.n.heartTimer && f.n.state !== 'hug', `${mode} must remove live embrace effects`);
            if (mode === 'jump') assert(!f.p.grounded && f.p.ysp < 0, 'a hug must never prevent a real jump');
        } finally { f.h.dispose(); }
    }
});

test('death, game over, checkpoint warps, reset, another act, and act clear remove the panel and hug effects', () => {
    for (const mode of ['death', 'gameOver', 'warp', 'reset', 'stage', 'clear', 'spinning']) {
        const f = fixture(1);
        try {
            hold(f); open(f);
            assert(!f.n.hugPhase && !f.n.heartTimer, 'starting dialogue must interrupt an existing hug');
            if (mode === 'death') f.p.die();
            if (mode === 'gameOver') { f.p.lives = 1; f.p.loseLife(); }
            if (mode === 'warp') f.g.gotoCheckpoint(1);
            if (mode === 'reset') f.g.resetCurrentStage();
            if (mode === 'stage') f.g.loadStage('z2_act1', { skipTitleCard: true, skipFade: true });
            if (mode === 'clear') f.g.terrain.goalPost.cleared = true;
            if (mode === 'spinning') { f.g.terrain.goalPost.spinning = true; f.g.terrain.goalPost.spinTimer = 100; }
            f.h.frame(); closed(f);
            assert(!f.g.canTalkToRosie());
            const n = f.g.terrain.z2a2?.reunion;
            if (n) assert(!n.hugPhase && !n.heartTimer && n.state !== 'hug');
        } finally { f.h.dispose(); }
    }
});

test('hidden tabs pause both an open conversation and an in-progress hug without catch-up', () => {
    for (const phase of ['dialogue', 'hug']) {
        const f = fixture(1);
        try {
            if (phase === 'dialogue') open(f); else hold(f);
            f.h.sandbox.document.hidden = true; f.h.dispatchDocument('visibilitychange');
            const snapshot = () => JSON.stringify({ n: f.n, time: f.g.stageTime, x: f.p.x, y: f.p.y });
            const frozen = snapshot(), draws = f.h.canvasStats().draws;
            for (let i = 0; i < 10; i++) { f.h.frame(1000); assert.strictEqual(snapshot(), frozen); }
            assert.strictEqual(f.h.canvasStats().draws, draws);
            const hearts = f.n.heartTimer;
            f.h.sandbox.document.hidden = false; f.h.dispatchDocument('visibilitychange'); f.h.frame();
            if (phase === 'dialogue') assert(view(f).open);
            else assert(f.n.heartTimer > hearts && f.n.heartTimer <= hearts + 1.01, 'hidden time must not finish a hug');
        } finally { f.h.dispose(); }
    }
});

test('real dialogue choices remember ask/space and suppress automatic hugs after closing', () => {
    for (const [index, preference] of [[1, 'ask'], [2, 'space']]) {
        const f = fixture(1);
        try {
            open(f);
            for (const step of [0, 0, 1, 1]) clickChoice(f, step);
            assert.strictEqual(view(f).nodeId, 'hug_check');
            clickChoice(f, index);
            assert.strictEqual(f.n.conversation.memory.hugPreference, preference);
            tap(f.h, 'Escape'); f.h.frame(); closed(f);
            frames(f.h, 240);
            assert(!f.n.hugPhase && !f.n.heartTimer && !f.n.hugged,
                `${preference} must suppress hugs even while Scar stands looking away`);
            f.g.terrain.activeCheckpoint = f.g.terrain.checkpoints[0];
            f.p.respawn(); f.h.frame();
            assert.strictEqual(f.n.conversation.memory.hugPreference, preference, 'ordinary death retry preserves the selected preference');
        } finally { f.h.dispose(); }
    }
});

if (failures) process.exitCode = 1;
else console.log('  All Rosie browser integration regressions passed.');
