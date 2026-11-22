/** Zone 2's tag-team encounter through the shipped Game/input/audio runtime. */
'use strict';
const assert = require('assert');
const { createGameHarness } = require('./helpers/game_harness');
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function run(h, count = 1, hz = 60) { for (let i = 0; i < count; i++) h.frame(1000 / hz); }
function ready(h) { h.game.titleCard = null; h.game.fadeAlpha = 0; }
function healthy(h) {
    assert.strictEqual(h.scheduledFrames.size, 1, 'the game must retain one animation callback');
    const stats = h.canvasStats();
    assert.strictEqual(stats.invalid, 0); assert.strictEqual(stats.restoreUnderflow, 0);
    assert.deepStrictEqual(stats.unbalanced, []);
}
function enterFight(h, hz = 60) {
    const g = h.game;
    ready(h);
    g.player.place(1130, 0, 560); g.player.invulnTimer = 100000;
    run(h, Math.ceil(hz * 2), hz);
    assert(g.terrain.boss.active && !g.terrain.boss.defeated, 'entering the island arena must start the duo');
    assert.strictEqual(g.terrain.boss.state, 'battle');
    return g.terrain.boss;
}
function snapshot(g) {
    const b = g.terrain.boss, p = g.player;
    return JSON.stringify({ time: g.stageTime, clock: g.terrain.clock,
        x: p.x, y: p.y, xsp: p.xsp, ysp: p.ysp, state: p.state,
        age: b.age, stateBoss: b.state, hp: b.hp, members: b.members,
        projectiles: b.projectiles, effects: b.effects, ally: b.ally,
        queuedAssist: b.queuedAssist, autoAssistTimer: b.autoAssistTimer });
}
function controller(h) {
    const pad = { id: 'Synthetic Xbox standard mapping', index: 0, connected: true,
        mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    h.sandbox.navigator.getGamepads = () => [pad];
    const button = (index, down) => { pad.buttons[index] = { pressed: !!down, value: down ? 1 : 0 }; };
    run(h, 3);
    assert(h.game.input.gamepadConnected && h.game.input.gamepadActive);
    return { pad, button };
}

test('the real Act 2 sign, tally and fade carry the campaign into the boss act', () => {
    const h = createGameHarness({ stage: 'z2_act2' }), g = h.game;
    try {
        ready(h);
        const p = g.player, z = g.terrain.z2a2, goal = g.terrain.goalPost;
        z.reunion.met = true; z.reunion.timer = 0; goal.locked = false;
        p.score = 9100; p.lives = 6; p.shield = true; p.rings = 17; g.stageTime = 95;
        p.place(goal.x + 1, 0, goal.y); p.update({}, 1 / 60);
        assert(goal.spinning, 'Scar must actually touch and spin the Act 2 sign');
        goal.spinTimer = 1; p.update({}, 1 / 60);
        assert(goal.cleared);
        g.updateActClear(1, true); g.updateActClear(1, true);
        assert.strictEqual(g.actClear.nextStage, 'z2_act3');
        const carriedScore = p.score;
        for (let i = 0; i < 180 && g.stageName === 'z2_act2'; i++) run(h);
        assert.strictEqual(g.stageName, 'z2_act3');
        assert.deepStrictEqual([g.player.score, g.player.lives, g.player.shield], [carriedScore, 6, true]);
        assert.strictEqual(g.player.rings, 0); assert.strictEqual(g.stageTime, 0);
        assert(g.titleCard && g.getStageMeta().act === 3 && g.terrain.levelDef.isBossAct);
        assert.strictEqual(g.getCampaignStages().length, 6);
        assert(g.terrain.boss && !g.terrain.boss.active && g.terrain.capsule.lockedUntilBoss && !g.terrain.goalPost);
        healthy(h);
    } finally { h.dispose(); }
});

test('Scar says the supplied Alright cue once on entry and once on a genuine retry', () => {
    for (const hz of [30, 60, 144]) {
        const h = createGameHarness({ stage: 'z2_act3' }), g = h.game, cues = [];
        try {
            ready(h);
            h.audio.scarVoice = (cue, options) => { cues.push({ cue, options }); return true; };
            run(h, 5, hz);
            assert.strictEqual(cues.length, 0, 'loading or waiting outside the arena must not speak the fight line');
            enterFight(h, hz);
            assert.deepStrictEqual(cues.map(item => item.cue), ['alright']);
            assert.strictEqual(cues[0].options.force, true, 'the fight line must not be swallowed by the Act 2 clear cooldown');
            run(h, Math.ceil(hz / 2), hz);
            assert.strictEqual(cues.length, 1);
            const p = g.player;
            p.die();
            for (let i = 0; i < hz * 3 && p.state === 'DYING'; i++) run(h, 1, hz);
            assert.notStrictEqual(p.state, 'DYING'); assert.strictEqual(p.lives, 2);
            p.place(1130, 0, 560); p.invulnTimer = 100000;
            run(h, 2, hz);
            assert.deepStrictEqual(cues.map(item => item.cue), ['alright', 'alright']);
            assert(g.terrain.boss.hp === 12 && g.terrain.boss.projectiles.length === 0);
            healthy(h);
        } finally { h.dispose(); }
    }
});

test('C and standard-controller X call Rosie once without opening chat or becoming a jump', () => {
    for (const device of ['keyboard', 'controller']) {
        const h = createGameHarness({ stage: 'z2_act3' }), g = h.game;
        let original;
        try {
            const pad = device === 'controller' ? controller(h) : null;
            const b = enterFight(h);
            b.autoAssistTimer = 100000; // Isolate the explicit call from her autonomous assist.
            assert(g.canCallRosie());
            let requests = 0;
            original = g.terrain.levelDef.onUpdate;
            g.terrain.levelDef.onUpdate = (terrain, player, step, input) => {
                if (terrain.z2a3.assistRequested) requests++;
                return original(terrain, player, step, input);
            };
            if (pad) pad.button(2, true);
            else h.dispatchWindow('keydown', { code: 'KeyC', repeat: false });
            run(h);
            assert.strictEqual(requests, 1);
            assert(b.queuedAssist || b.ally.assistPhase, 'the call must reach the actual team mechanic');
            assert(!g.rosieConversationView()?.open && !g.input.jumpHeld && !g.player.jumped);
            for (let i = 0; i < 8; i++) {
                if (!pad) h.dispatchWindow('keydown', { code: 'KeyC', repeat: true });
                run(h);
            }
            assert.strictEqual(requests, 1, 'held C or X cannot enqueue repeated assists');
            if (pad) pad.button(2, false); else h.dispatchWindow('keyup', { code: 'KeyC' });
            for (let i = 0; i < 600 && b.ally.assistCount === 0; i++) run(h);
            assert(b.ally.assistCount > 0, 'Rosie must actually travel to the boss and crack its shell');
            assert(b.members.some(member => member.openings > 0));
            healthy(h);
        } finally { if (original) g.terrain.levelDef.onUpdate = original; h.dispose(); }
    }
});

test('pause, Menu and hidden tabs freeze both opponents, projectiles and Rosie without catch-up', () => {
    for (const mode of ['keyboard', 'controller', 'hidden']) {
        const h = createGameHarness({ stage: 'z2_act3' }), g = h.game;
        try {
            const pad = mode === 'controller' ? controller(h) : null;
            const b = enterFight(h);
            run(h, 150);
            assert(b.age > 0 && b.ally.animationClock >= 0);
            if (mode === 'hidden') { h.sandbox.document.hidden = true; h.dispatchDocument('visibilitychange'); }
            else if (pad) { pad.button(9, true); run(h); pad.button(9, false); run(h); }
            else { h.dispatchWindow('keydown', { code: 'KeyP' }); run(h); h.dispatchWindow('keyup', { code: 'KeyP' }); }
            if (mode !== 'hidden') assert(g.paused);
            const frozen = snapshot(g);
            for (let i = 0; i < 8; i++) { h.frame(1000); assert.strictEqual(snapshot(g), frozen); }
            if (mode === 'hidden') { h.sandbox.document.hidden = false; h.dispatchDocument('visibilitychange'); }
            else if (pad) { pad.button(0, true); run(h); pad.button(0, false); }
            else { h.dispatchWindow('keydown', { code: 'KeyP' }); run(h); h.dispatchWindow('keyup', { code: 'KeyP' }); }
            const age = b.age;
            run(h);
            assert(!g.paused && b.age - age >= 0 && b.age - age <= 1.01,
                'the next real frame may advance one step, excluding the paused interval');
            assert(!g.input.jumpHeld && !g.player.jumped);
            healthy(h);
        } finally { h.dispose(); }
    }
});

test('after the battle Rosie keeps her branching conversation and releases ordinary controls cleanly', () => {
    const h = createGameHarness({ stage: 'z2_act3' }), g = h.game;
    try {
        const b = enterFight(h), n = b.ally;
        // Establish a completed encounter; combat and armor are exercised separately.
        b.defeated = true; b.hp = 0; b.state = 'victory'; b.projectiles.length = 0;
        for (const member of b.members) { member.hp = 0; member.defeated = true; member.state = 'defeated'; }
        g.player.place(g.terrain.capsule.x - 80, 0, 560); g.snapCamera();
        assert(g.terrain.capsule.x - 32 >= g.camX && g.terrain.capsule.x + 32 <= g.camX + g.W,
            'victory must release the combat camera so Scar can see and reach the rescue capsule');
        Object.assign(n, { x: 1900, y: 560, actorX: 1900, actorY: 560, grounded: true, vy: 0,
            met: true, noticed: true, actionTimer: 0, reactionTimer: 0, assistPhase: null, state: 'idle' });
        g.player.place(1960, 0, 560); g.player.invulnTimer = 0; g.player.hurtPose = false;
        run(h);
        assert(!g.canCallRosie() && g.canTalkToRosie());
        h.dispatchWindow('keydown', { code: 'KeyC', repeat: false }); run(h);
        h.dispatchWindow('keyup', { code: 'KeyC' });
        const view = g.rosieConversationView(), cp = g.cpIndex;
        assert(view?.open && view.choices.length === 3 && !h.elements.get('rosie-dialogue').hidden);
        assert(!g.player.jumped && !g.input.jumpHeld);
        h.dispatchWindow('keydown', { code: 'Digit1', repeat: false }); run(h);
        h.dispatchWindow('keyup', { code: 'Digit1' });
        assert(g.rosieConversationView().revision !== view.revision);
        assert.strictEqual(g.cpIndex, cp, 'a conversation reply must not warp the arena checkpoint');
        h.dispatchWindow('keydown', { code: 'Escape', repeat: false }); run(h);
        h.dispatchWindow('keyup', { code: 'Escape' });
        assert(!g.rosieConversationView().open && !g.paused);
        h.dispatchWindow('keydown', { code: 'Space', repeat: false }); run(h);
        assert(!g.player.grounded && g.player.ysp < 0, 'a fresh ordinary jump must still work after talking');
        healthy(h);
    } finally { h.dispose(); }
});

console.log('\nSanctuary Duet browser and Xbox integration');
for (const { name, run: check } of tests) { check(); console.log('  PASS ' + name); }
console.log(`Sanctuary Duet browser integration: ${tests.length} groups passed; standard gamepad states are synthetic.`);
