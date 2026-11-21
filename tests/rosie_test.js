/** Rosie must use planted idle poses and animate her walk only during real movement. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Terrain, Player, STATE } = require('../public/sonic-engine.js');
require('../public/levels/zone2_act2.js');

let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function fixture(events = {}) {
    const terrain = new Terrain('z2_act2');
    terrain.rings = []; terrain.enemies = []; terrain.monitors = [];
    return { terrain, player: new Player(terrain, events), rosie: terrain.z2a2.reunion };
}
function controllerFixture() {
    const controller = require('../public/levels/rosie_npc.js');
    const { player } = fixture();
    const npc = controller.create(13920, 560);
    player.place(npc.x - 60, 0, npc.y);
    return { controller, npc, player };
}
function artFixture() {
    const calls = [];
    const ctx = {
        drawImage: (...args) => calls.push(['drawImage', ...args]),
        save() {}, restore() {},
        translate: (...args) => calls.push(['translate', ...args]),
        scale: (...args) => calls.push(['scale', ...args]),
        getImageData: () => ({ data: new Uint8ClampedArray(8) }),
        putImageData() {}, fillRect() {},
    };
    const canvas = { getContext: () => ctx };
    class ImageStub {
        set src(value) {
            this.naturalWidth = 524; this.naturalHeight = 474;
            this.onload();
        }
    }
    const sandbox = { Image: ImageStub, document: { createElement: () => canvas } };
    sandbox.window = sandbox;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/levels/rosie.js'), 'utf8'), sandbox);
    calls.length = 0;
    return { art: sandbox.RosieArt, ctx, calls };
}

console.log('\nRosie poses and reunion behavior');
test('stationary Rosie holds a neutral pose with a brief blink and never uses the crying row', () => {
    const { art } = artFixture();
    const neutral = art.getFrame('idle', 0);
    assert(neutral.x === 251 && neutral.y === 53, 'idle must use the inspected planted neutral pose');
    for (let clock = 0; clock < 480; clock++) {
        const frame = art.getFrame('idle', clock);
        assert(frame === neutral || frame === art.frames.blink[0], 'idle must not cycle through movement or greeting poses');
        assert.strictEqual(frame.y, 53, 'waiting must never show the open-mouth distress poses');
    }
    assert.strictEqual(art.getFrame('idle', 233), neutral);
    assert.strictEqual(art.getFrame('idle', 234), art.frames.blink[0]);
    assert.strictEqual(art.getFrame('idle', 240), neutral);
    const walking = new Set([0, 7, 14].map(clock => art.getFrame('walk', clock)));
    assert.strictEqual(walking.size, 3, 'actual walking must use all three inspected walk poses');
    for (const frame of walking) assert.strictEqual(frame.y, 101);
    for (const clock of [0, 10, 20, 300]) assert.strictEqual(art.getFrame('greet', clock).y, 53);
    assert.strictEqual(art.getFrame('greet', 300), art.frames.greet.at(-1), 'the greeting must finish without looping forever');
});

test('sprite feet stay planted, body anchors stay stable, and facing follows the actor state', () => {
    const { art, ctx, calls } = artFixture();
    for (const state of ['idle', 'walk', 'greet', 'hop']) for (const clock of [0, 7, 14, 28, 237]) {
        calls.length = 0;
        assert(art.draw(ctx, 100, 560, 900, { state, facing: -1, animationClock: clock }));
        const translation = calls.find(call => call[0] === 'translate');
        assert.deepStrictEqual(translation.slice(1), [100, 560], 'Rosie must not bob or jump while standing on the temple');
        const frame = art.getFrame(state, clock);
        const draw = calls.find(call => call[0] === 'drawImage');
        assert.deepStrictEqual(draw.slice(2, 6), [frame.x, frame.y, frame.w, frame.h]);
        assert.deepStrictEqual(draw.slice(6, 8), [-frame.anchorX, -frame.anchorY], 'draw offsets must use the inspected body/foot anchors');
        assert(calls.find(call => call[0] === 'scale')[1] < 0, 'left facing must mirror the right-facing source');
    }
    calls.length = 0;
    art.draw(ctx, 100, 560, 0, { state: 'idle', facing: 1, animationClock: 0 });
    assert(calls.find(call => call[0] === 'scale')[1] > 0, 'Rosie must face Scar after he passes her');
    calls.length = 0;
    art.draw(ctx, 100, 560, 400, true);
    assert.strictEqual(calls.find(call => call[0] === 'drawImage')[3], 53,
        'an old boolean reunion argument must not reintroduce the crying poses');
    const hop = art.getFrame('hop', 0);
    assert(hop.x === 251 && hop.y === 145 && hop.anchorY === 34,
        'a physical hop must use the inspected airborne pose');
});

test('Rosie notices Scar and takes small real patrol steps before the first reunion at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture();
        const h = 60 / hz;
        player.place(npc.x - 800, 0, npc.y);
        const positions = new Set(), states = new Set();
        for (let frame = 0; frame < hz * 7; frame++) {
            controller.update(npc, player, {}, h);
            positions.add(npc.actorX.toFixed(2)); states.add(npc.state);
            assert(npc.actorX >= npc.x - 360 && npc.actorX <= npc.x + 180,
                `${hz} Hz patrol must stay in the sanctuary`);
            assert.strictEqual(npc.actorY, npc.y);
        }
        assert(!npc.met && positions.size > 3 && states.has('walk') && states.has('idle'),
            `${hz} Hz waiting must alternate quiet idles with real small patrol steps`);
        controller.resetAfterRespawn(npc);
        player.place(npc.x - 450, 0, npc.y);
        let greeted = false;
        for (let frame = 0; frame < hz * 2; frame++) {
            controller.update(npc, player, {}, h);
            greeted ||= npc.state === 'greet';
        }
        assert(greeted && !npc.met, 'Rosie should notice Scar before the reunion range');
    }
});

test('Rosie follows Scar within the temple and stops beside him at 30/60/144 Hz', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture();
        const h = 60 / hz;
        controller.update(npc, player, {}, h);
        assert(npc.met);
        player.place(npc.x + 150, 0, npc.y);
        player.facing = -1; // This fixture tests ordinary following while Scar faces Rosie.
        const startX = npc.actorX;
        let moved = false;
        for (let frame = 0; frame < hz * 5; frame++) {
            const previousX = npc.actorX;
            controller.update(npc, player, {}, h);
            moved ||= Math.abs(npc.actorX - previousX) > 1e-6;
            assert(Math.abs(npc.actorX - previousX) <= 2.4 * h + 1e-6, 'following speed must be bounded');
        }
        assert(moved && npc.actorX > startX + 50, `${hz} Hz Rosie must physically follow Scar`);
        assert(Math.abs(Math.abs(player.x - npc.actorX) - 48) < 5,
            `${hz} Hz following must stop beside Scar rather than overlap him`);
        assert(npc.state === 'idle' && npc.grounded && npc.actorY === npc.y);
        assert.strictEqual(npc.facing, 1);
        const settledX = npc.actorX;
        for (let frame = 0; frame < hz; frame++) {
            const previousX = npc.actorX;
            controller.update(npc, player, {}, h);
            if (npc.state === 'walk') assert(Math.abs(npc.actorX - previousX) > 0,
                'a walk pose must correspond to an actual follow or patrol step');
            assert(Math.abs(npc.actorX - settledX) <= 38.01, 'quiet patrols must stay small after following stops');
        }
        player.place(npc.x - 800, 0, npc.y);
        for (let frame = 0; frame < hz * 6; frame++) controller.update(npc, player, {}, h);
        assert(npc.actorX >= npc.x - 360 && npc.actorX <= npc.x + 180,
            'following must not take Rosie out of the finish temple');
    }
});

test('Up talks on a new press, respects cooldown, and never repeats from a held key', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture();
        const h = 60 / hz;
        controller.update(npc, player, {}, h);
        let talks = 0;
        const update = input => {
            const event = controller.update(npc, player, input, h);
            if (event.talk) talks++;
            return event;
        };
        assert(update({ up: true }).talk && npc.message && npc.messageTimer > 0,
            `${hz} Hz a nearby new Up press must produce a dialogue reaction`);
        update({ up: false });
        assert(!update({ up: true }).talk, 'a second press inside the cooldown must not spam dialogue');
        for (let frame = 0; frame < hz * 4; frame++) update({ up: true });
        assert.strictEqual(talks, 1, 'a held Up key must not repeat after cooldown expires');
        update({ up: false });
        assert(update({ up: true }).talk);
        assert.strictEqual(talks, 2);
        player.place(npc.x - 800, 0, npc.y);
        update({ up: false });
        for (let frame = 0; frame < hz * 3; frame++) update({});
        assert(!update({ up: true }).talk, 'distant input must not talk to Rosie');
    }
});

test('long idle patrols respect personal space and Rosie steps aside without pushing Scar', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture();
        const h = 60 / hz;
        controller.update(npc, player, {}, h);
        player.place(npc.x + 150, 0, npc.y);
        player.facing = -1; // Quiet patrol spacing applies while Scar faces Rosie.
        for (let frame = 0; frame < hz * 3; frame++) controller.update(npc, player, {}, h);
        const scarX = player.x;
        assert(Math.abs(scarX - npc.actorX) >= 40, 'following must first stop outside the overlap range');
        let patrolWalks = 0;
        for (let frame = 0; frame < hz * 20; frame++) {
            controller.update(npc, player, {}, h);
            if (npc.state === 'walk') patrolWalks++;
            assert(Math.abs(scarX - npc.actorX) >= 40 - 1e-6,
                `${hz} Hz a quiet patrol must not walk into Scar's sprite`);
            assert.strictEqual(player.x, scarX, 'NPC patrols must never push or teleport Scar');
        }
        assert(patrolWalks > 0, 'the spacing rule should still allow real idle patrols');
        player.place(npc.actorX, 0, npc.y);
        const crossedX = player.x;
        for (let frame = 0; frame < hz * 2; frame++) {
            controller.update(npc, player, {}, h);
            assert.strictEqual(player.x, crossedX, 'Rosie must make room by moving herself');
        }
        assert(Math.abs(npc.actorX - crossedX) >= 40,
            `${hz} Hz Rosie should gently step aside when Scar stops on her position`);
    }
});

test('nearby jumping causes a physical hop with gravity, landing, and a held-key cooldown', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture();
        const h = 60 / hz;
        controller.update(npc, player, {}, h);
        controller.update(npc, player, { jumpPressed: true, jumpHeld: true }, h);
        assert(!npc.grounded && npc.vy < 0 && npc.state === 'hop', `${hz} Hz jumping should launch Rosie physically`);
        let peak = npc.actorY, landings = 0, airborne = true;
        for (let frame = 0; frame < hz * 3; frame++) {
            controller.update(npc, player, { jumpPressed: false, jumpHeld: true }, h);
            peak = Math.min(peak, npc.actorY);
            if (airborne && npc.grounded) landings++;
            airborne = !npc.grounded;
        }
        assert(peak < npc.y - 20 && peak > npc.y - 60, 'the hop must have an actual visible arc');
        assert(npc.grounded && npc.actorY === npc.y && npc.vy === 0);
        assert.strictEqual(landings, 1, 'holding Jump must not create repeated automatic hops');
        controller.update(npc, player, { jumpHeld: false }, h);
        controller.update(npc, player, { jumpPressed: true, jumpHeld: true }, h);
        assert(!npc.grounded, 'a fresh nearby jump may cause another hop after cooldown');
    }
});

test('Up plus Jump reacts as a hop without also opening dialogue', () => {
    for (const hz of [30, 60, 144]) {
        const { controller, npc, player } = controllerFixture(), h = 60 / hz;
        controller.update(npc, player, {}, h);
        const result = controller.update(npc, player, { up: true, jumpPressed: true, jumpHeld: true }, h);
        assert(result.hop && !result.talk && !npc.grounded,
            'the peel-out combination must not trigger both NPC actions');
        assert(!controller.update(npc, player, { up: true, jumpHeld: false }, h).talk,
            'releasing Jump while holding Up is not a new dialogue press');
    }
});

test('the live reunion preserves Scar controls and rewards once while Rosie stays interactive', () => {
    for (const hz of [30, 60, 144]) {
        let reunions = 0;
        const { terrain, player, rosie } = fixture({ rosieReunion: () => reunions++ });
        player.place(rosie.x - 200, 0, rosie.y);
        player.gsp = player.xsp = 4;
        const x = player.x;
        player.update({ right: true }, 1 / hz);
        assert(rosie.met && player.x > x + 1 && player.gsp >= 4, 'meeting Rosie must not freeze Scar or erase movement');
        const score = player.score;
        player.place(rosie.x - 60, 0, rosie.y);
        for (let frame = 0; frame < hz * 4; frame++) player.update({}, 1 / hz);
        assert(rosie.timer <= 0 && !terrain.goalPost.locked);
        assert.strictEqual(reunions, 1);
        assert.strictEqual(player.score, score, 'subsequent following, idles and greetings must not grant another reunion reward');
        player.update({ up: true }, 1 / hz);
        assert(rosie.message && rosie.messageTimer > 0, 'the real input bridge must carry Up into Rosie dialogue');
        player.update({ up: false }, 1 / hz);
        player.update({ jumpPressed: true, jumpHeld: true }, 1 / hz);
        assert(!rosie.grounded, 'the real input bridge must carry Jump into the NPC reaction');
    }
});

test('death and game over pause the NPC; respawn and reset clear pending reactions', () => {
    for (const hz of [30, 60, 144]) for (const mode of ['dying', 'gameOver']) {
        const { terrain, player, rosie } = fixture();
        player.place(rosie.x - 60, 0, rosie.y);
        player.update({ jumpPressed: true, jumpHeld: true }, 1 / hz);
        if (mode === 'dying') player.state = STATE.DYING;
        if (mode === 'gameOver') player.gameOver = true;
        const state = [rosie.actorX, rosie.actorY, rosie.animationClock, rosie.messageTimer, rosie.timer];
        player.update({}, 1 / hz);
        assert.deepStrictEqual([rosie.actorX, rosie.actorY, rosie.animationClock, rosie.messageTimer, rosie.timer], state,
            `${mode} must not advance the NPC while gameplay is paused`);
    }
    for (const hz of [30, 60, 144]) {
        const { terrain, player, rosie } = fixture();
        player.place(rosie.x - 60, 0, rosie.y);
        player.update({ jumpPressed: true, jumpHeld: true }, 1 / hz);
        assert(rosie.met && rosie.timer > 0);
        terrain.activeCheckpoint = terrain.checkpoints[0];
        player.respawn(); player.update({}, 1 / hz);
        assert.strictEqual(rosie.state, 'idle');
        assert.strictEqual(rosie.timer, 0);
        assert(rosie.grounded && rosie.actorY === rosie.y && !rosie.messageTimer && rosie.actorX === rosie.x);
        terrain.resetObjects();
        const reset = terrain.z2a2.reunion;
        assert(!reset.met && reset.timer === 0 && reset.state === 'idle' && reset.actorX === reset.x && reset.actorY === reset.y);
        assert(terrain.goalPost.locked, 'a reset must restore the first reunion before completion');
    }
});

test('finishing cancels following and interactions while an airborne Rosie lands naturally', () => {
    for (const hz of [30, 60, 144]) for (const mode of ['spinning', 'cleared']) {
        const { terrain, player, rosie } = fixture();
        player.place(rosie.x - 60, 0, rosie.y);
        player.update({ jumpPressed: true, jumpHeld: true }, 1 / hz);
        assert(!rosie.grounded);
        if (mode === 'spinning') { terrain.goalPost.spinning = true; terrain.goalPost.spinTimer = 100; }
        if (mode === 'cleared') terrain.goalPost.cleared = true;
        const x = rosie.actorX, lavaAge = terrain.z2a2.lavaAge;
        for (let frame = 0; frame < hz * 2; frame++) player.update({ up: true, jumpPressed: true }, 1 / hz);
        assert.strictEqual(rosie.actorX, x, 'results must not let Rosie patrol or follow Scar');
        assert(rosie.grounded && rosie.actorY === rosie.y && rosie.state === 'idle',
            'a hop already in progress must fall back to the temple floor');
        assert(!rosie.canTalk && !rosie.following);
        assert.strictEqual(terrain.z2a2.lavaAge, lavaAge, 'the lava clock must stay frozen after completion');
    }
});

if (failures) process.exitCode = 1;
else console.log('  All Rosie regressions passed.');
