/** Controller polling runs the shipped InputHandler, without browser or hardware dependencies. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const source = html.slice(html.indexOf('class InputHandler {'), html.indexOf('const SENSOR_COLORS'));
let passed = 0;
function test(name, run) { run(); passed++; console.log(`  PASS ${name}`); }
function target(extra = {}) {
    const listeners = new Map();
    return { ...extra, addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
    }, dispatch(type, event = {}) {
        for (const fn of listeners.get(type) || []) fn({ preventDefault() {}, ...event });
    } };
}
function pad(index = 0, id = 'Xbox Wireless Controller') {
    return { index, id, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}
function fixture() {
    const f = { pads: [], time: 0, unlocks: 0, open: false, paused: false, canTalk: true, revision: 11 };
    f.window = target();
    f.bar = target({ style: {} });
    f.buttons = ['left', 'right', 'up', 'down', 'jump'].map(key => target({ dataset: { key },
        classList: { add() {}, remove() {}, toggle() {}, contains: name => name === 'tbtn' } }));
    f.document = target({ hidden: false, getElementById: () => f.bar, querySelectorAll: () => f.buttons,
        elementFromPoint: x => f.buttons[x] });
    f.navigator = { maxTouchPoints: 2, getGamepads: () => f.pads };
    const context = { window: f.window, document: f.document, navigator: f.navigator,
        performance: { now: () => f.time }, audio: { unlock() { f.unlocks++; if (f.audioDenied) throw new Error('Audio denied'); } },
        conversation: { isOpen: () => f.open, canTalk: () => f.canTalk, revision: () => f.revision, isPaused: () => f.paused } };
    vm.createContext(context);
    vm.runInContext(source + '\nwindow.input = new InputHandler(conversation);', context);
    f.input = f.window.input;
    f.poll = () => f.input.pollGamepad();
    f.key = (code, down = true, extra = {}) => f.window.dispatch(down ? 'keydown' : 'keyup', { code, ...extra });
    f.set = (p, index, pressed) => { p.buttons[index] = { pressed, value: pressed ? 1 : 0 }; };
    f.arm = p => { f.pads = [p]; f.poll(); assert(f.input.gamepadConnected && f.input.gamepadActive); };
    f.actions = type => f.input.actions.filter(action => action.type === type);
    return f;
}

console.log('\nXbox / standard gamepad input');

test('initial connection and every mapped held control require neutral before input is armed', () => {
    const heldControls = [
        p => { p.axes[0] = .4; }, p => { p.axes[1] = -.4; },
        ...[0, 1, 2, 9, 12, 13, 14, 15].map(index => p => { p.buttons[index].pressed = true; }),
    ];
    for (const hold of heldControls) {
        const f = fixture(), p = pad(); hold(p); f.pads = [p];
        f.poll(); f.poll();
        assert(f.input.gamepadConnected && !f.input.gamepadActive);
        assert(!f.input.left && !f.input.up && !f.input.jumpHeld && !f.input.jumpPressed);
        assert.strictEqual(f.input.actions.length, 0);
        p.axes = [0, 0]; p.buttons.forEach(button => { button.pressed = false; button.value = 0; });
        f.poll(); assert(f.input.gamepadActive);
        f.set(p, 0, true); f.poll();
        assert(f.input.jumpHeld && f.input.jumpPressed);
    }
    const f = fixture(), p = pad();
    p.buttons[3].pressed = p.buttons[4].pressed = true;
    f.arm(p);
    assert.strictEqual(f.input.actions.length, 0, 'unmapped Y/LB buttons must not activate a command');
});

test('left-stick hysteresis prevents drift and Dpad deliberately overrides the same axis', () => {
    const f = fixture(), p = pad(); f.arm(p);
    for (const [value, expected] of [[.249, false], [.25, true], [.21, true], [.151, true], [.15, false]]) {
        p.axes[0] = value; f.poll(); assert.strictEqual(f.input.right, expected, String(value));
    }
    p.axes[0] = -.25; f.poll(); assert(f.input.left && !f.input.right);
    p.axes[0] = -.16; f.poll(); assert(f.input.left);
    p.axes[0] = -.15; f.poll(); assert(!f.input.left);
    p.axes[1] = -.25; f.poll(); assert(f.input.up && f.input.upPressed);
    f.input.endFrame(); p.axes[1] = -.18; f.poll(); assert(f.input.up && !f.input.upPressed);
    p.axes[1] = -.15; f.poll(); assert(!f.input.up);
    p.axes[1] = .25; f.poll(); assert(f.input.down);
    p.axes = [-1, -1]; f.set(p, 15, true); f.set(p, 13, true); f.poll();
    assert(f.input.right && f.input.down && !f.input.left && !f.input.up);
    f.set(p, 14, true); f.set(p, 12, true); f.poll();
    assert(!f.input.left && !f.input.right && !f.input.up && !f.input.down, 'opposing Dpad buttons cancel one another');
});

test('A latches one jump edge, combinations retain up/down and only fresh input unlocks audio', () => {
    const f = fixture(), p = pad(); f.arm(p);
    assert.strictEqual(f.unlocks, 0);
    f.set(p, 12, true); f.set(p, 0, true); f.poll();
    assert(f.input.up && f.input.upPressed && f.input.jumpHeld && f.input.jumpPressed);
    assert.strictEqual(f.unlocks, 1);
    f.input.endFrame(); f.poll(); f.poll();
    assert(f.input.up && f.input.jumpHeld && !f.input.jumpPressed && !f.input.upPressed);
    assert.strictEqual(f.unlocks, 1);
    f.set(p, 12, false); f.set(p, 0, false); f.poll();
    assert(!f.input.up && !f.input.jumpHeld);
    f.set(p, 13, true); f.set(p, 0, true); f.audioDenied = true;
    assert.doesNotThrow(() => f.poll());
    assert(f.input.down && f.input.jumpPressed, 'an audio denial must not block a spin-dash input');
    assert.strictEqual(f.input.actions.length, 0);
});

test('keyboard, touch and controller sources merge without releasing or stealing other edges', () => {
    const f = fixture(), p = pad(); f.arm(p);
    f.key('ArrowRight'); f.key('Space');
    p.axes[0] = 1; f.set(p, 0, true); f.poll();
    f.input.resetGamepad();
    assert(f.input.right && f.input.jumpHeld && f.input.jumpPressed, 'pad reset must preserve keyboard holds and queued jump');
    f.key('ArrowRight', false); f.key('Space', false); f.input.endFrame();
    f.poll(); f.set(p, 0, false); p.axes[0] = 0; f.poll();
    f.set(p, 0, true); f.poll(); assert(f.input.jumpPressed);
    f.key('ArrowUp');
    f.pads = []; f.poll();
    assert(!f.input.jumpHeld && !f.input.jumpPressed, 'disconnect cancels a pending controller-only jump');
    assert(f.input.up && f.input.upPressed, 'disconnect preserves a keyboard-only Up edge');
    f.bar.dispatch('touchstart', { touches: [{ clientX: 1, clientY: 0 }] });
    assert(f.input.right);
    f.arm(pad()); f.input.resetGamepad();
    assert(f.input.right, 'controller reset cannot cancel held touch movement');
});

test('one stable active controller survives sparse slots and another controller connecting', () => {
    const f = fixture(), p1 = pad(1, 'Xbox One'), p0 = pad(0, 'Xbox Series');
    f.pads = [null, p1]; f.poll(); assert.strictEqual(f.input.gamepadIndex, 1);
    f.pads = [p0, p1]; p0.axes[0] = -1; p1.axes[0] = 1; f.poll();
    assert.strictEqual(f.input.gamepadIndex, 1); assert(f.input.right && !f.input.left);
    f.set(p0, 0, true); f.poll(); assert(!f.input.jumpPressed, 'an inactive pad cannot jump');
    f.pads = [p0]; f.poll();
    assert.strictEqual(f.input.gamepadIndex, 0);
    assert(f.input.gamepadConnected && !f.input.gamepadActive && !f.input.right && !f.input.jumpHeld);
    p0.axes[0] = 0; f.set(p0, 0, false); f.poll(); assert(f.input.gamepadActive);
    f.set(p0, 0, true); f.poll(); assert(f.input.jumpPressed);
    f.window.dispatch('gamepaddisconnected', { gamepad: p0 });
    assert(!f.input.jumpHeld && !f.input.jumpPressed && !f.input.gamepadConnected);
    const replacement = pad(0, 'Xbox replacement'); f.set(replacement, 0, true); f.pads = [replacement]; f.poll();
    assert(!f.input.gamepadActive && !f.input.jumpHeld);
});

test('missing, blocked, malformed and unsupported pad APIs release only controller input', () => {
    const f = fixture(), p = pad(); f.arm(p);
    f.key('ArrowLeft'); p.axes[0] = 1; f.poll(); assert(f.input.right);
    f.navigator.getGamepads = () => { throw new Error('SecurityError'); };
    assert.doesNotThrow(() => f.poll());
    assert(f.input.left && !f.input.right && !f.input.gamepadConnected);
    f.navigator.getGamepads = undefined; assert.doesNotThrow(() => f.poll());
    f.navigator.getGamepads = () => [null, { ...pad(1), mapping: '' }, { ...pad(2), connected: false }];
    f.poll(); assert(!f.input.gamepadConnected && f.input.left);
    f.navigator.getGamepads = () => [p]; p.axes = [NaN, Infinity]; f.poll();
    assert(f.input.gamepadActive && !f.input.right && !f.input.down);
    Object.defineProperty(p, 'buttons', { get() { throw new Error('Device removed'); } });
    assert.doesNotThrow(() => f.poll());
    assert(!f.input.gamepadConnected && f.input.left);
});

test('X opens talk once; dialogue A confirms, B/X close, and held buttons never become a jump', () => {
    const f = fixture(), p = pad(); f.arm(p);
    f.set(p, 2, true); f.set(p, 0, true); f.poll();
    assert.strictEqual(f.actions('talk').length, 1);
    assert(!f.input.jumpHeld && !f.input.jumpPressed, 'talk takes precedence over simultaneous A');
    f.open = true; f.input.endFrame(); f.poll();
    assert(!f.input.gamepadActive && f.input.actions.length === 0);
    f.set(p, 2, false); f.set(p, 0, false); f.poll(); assert(f.input.gamepadActive);
    f.key('ArrowRight'); p.axes[0] = -1; f.poll();
    assert(f.input.right && !f.input.left, 'dialogue suppresses only pad movement, so keyboard can still leave');
    p.axes[0] = 0; f.set(p, 0, true); f.poll();
    assert.strictEqual(f.actions('dialogueConfirm').length, 1);
    assert.strictEqual(f.actions('dialogueConfirm')[0].revision, 11);
    assert(!f.input.jumpHeld && !f.input.jumpPressed);
    f.input.endFrame(); f.poll(); assert.strictEqual(f.input.actions.length, 0);
    f.open = false; f.poll(); assert(!f.input.gamepadActive && !f.input.jumpHeld);
    f.set(p, 0, false); f.poll(); f.set(p, 0, true); f.poll(); assert(f.input.jumpPressed);
    for (const closeButton of [1, 2]) {
        f.open = true; f.set(p, 0, false); f.poll();
        f.set(p, closeButton, true); f.poll();
        assert.strictEqual(f.actions('dialogueClose').length, 1);
        assert(!f.input.jumpHeld);
        f.input.endFrame(); f.set(p, closeButton, false); f.poll();
    }
    f.open = false; f.poll(); f.input.endFrame(); f.set(p, 1, true); f.poll();
    assert.strictEqual(f.input.actions.length, 0, 'B has no gameplay command');
});

test('dialogue navigation has a 250ms repeat, finite clock handling and revision-tagged actions', () => {
    const f = fixture(), p = pad(); f.open = true; f.arm(p);
    f.set(p, 13, true); f.poll();
    assert.strictEqual(f.actions('dialogueMove').length, 1);
    assert.strictEqual(f.actions('dialogueMove')[0].delta, 1);
    assert.strictEqual(f.actions('dialogueMove')[0].revision, 11);
    f.input.endFrame(); f.time = 249; f.poll(); assert.strictEqual(f.input.actions.length, 0);
    f.time = 250; f.poll(); assert.strictEqual(f.actions('dialogueMove').length, 1);
    f.input.endFrame(); f.time = 10000; f.poll();
    assert.strictEqual(f.actions('dialogueMove').length, 1, 'long pauses must queue one navigation step, not a burst');
    f.input.endFrame(); f.time = NaN; f.poll(); assert.strictEqual(f.input.actions.length, 0);
    f.time = 10; f.poll(); assert.strictEqual(f.input.actions.length, 0);
    f.time = 260; f.poll(); assert.strictEqual(f.actions('dialogueMove').length, 1);
    f.input.endFrame(); f.set(p, 13, false); f.set(p, 12, true); f.poll();
    assert.strictEqual(f.actions('dialogueMove')[0].delta, -1, 'changing direction should respond immediately');
    assert(!f.input.up && !f.input.down && !f.input.upPressed);
    f.input.endFrame(); f.set(p, 0, true); f.time += 1000; f.poll();
    assert.strictEqual(f.actions('dialogueConfirm').length, 1);
    assert.strictEqual(f.actions('dialogueMove').length, 0, 'confirm must not also move the new reply selection');
});

test('Menu toggles pause once and paused A/B resume without leaking into gameplay', () => {
    const f = fixture(), p = pad(); f.arm(p);
    f.set(p, 9, true); f.poll();
    assert.strictEqual(f.actions('pause').length, 1);
    assert.strictEqual(f.actions('pause')[0].source, 'gamepad');
    f.input.endFrame(); f.poll(); assert.strictEqual(f.input.actions.length, 0);
    f.paused = true; f.poll(); assert(!f.input.gamepadActive);
    f.set(p, 9, false); f.poll();
    for (const button of [0, 1]) {
        f.set(p, button, true); f.poll();
        assert.strictEqual(f.actions('resume').length, 1);
        assert(!f.input.jumpHeld && !f.input.jumpPressed);
        f.input.endFrame(); f.poll(); assert.strictEqual(f.input.actions.length, 0);
        f.set(p, button, false); f.poll();
    }
    f.set(p, 2, true); p.axes[0] = 1; f.poll();
    assert.strictEqual(f.input.actions.length, 0); assert(!f.input.right);
    f.paused = false; f.poll(); assert(!f.input.gamepadActive && !f.input.right);
    f.set(p, 2, false); p.axes[0] = 0; f.poll(); assert(f.input.gamepadActive);
    f.key('KeyP'); assert.strictEqual(f.actions('pause').length, 1); f.input.endFrame();
    f.key('Escape'); assert.strictEqual(f.actions('pause').length, 1); f.input.endFrame();
    f.open = true; f.key('Escape'); assert.strictEqual(f.actions('dialogueClose').length, 1); f.input.endFrame();
    f.open = false; f.paused = true;
    for (const code of ['Space', 'Enter', 'Escape', 'KeyP']) {
        f.key(code); assert.strictEqual(f.actions('resume').length, 1);
        assert(!f.input.jumpHeld && !f.input.jumpPressed);
        f.input.endFrame(); f.key(code, false);
    }
});

test('blur, visibility, reset and unplug remove pending pad actions and require a fresh neutral', () => {
    const f = fixture(), p = pad(); f.arm(p);
    f.set(p, 2, true); f.poll(); assert.strictEqual(f.actions('talk').length, 1);
    f.key('KeyR'); f.input.resetGamepad();
    assert.strictEqual(f.actions('talk').length, 0);
    assert.strictEqual(f.actions('reset').length, 1, 'pad reset preserves queued keyboard commands');
    f.input.endFrame(); f.poll(); assert(!f.input.gamepadActive);
    f.set(p, 2, false); f.poll(); f.set(p, 0, true); f.poll(); assert(f.input.jumpPressed);
    f.window.dispatch('blur'); f.poll();
    assert(!f.input.gamepadActive && !f.input.jumpHeld && !f.input.jumpPressed);
    f.window.dispatch('focus'); f.poll(); assert(!f.input.gamepadActive);
    f.set(p, 0, false); f.poll(); assert(f.input.gamepadActive);
    f.set(p, 0, true); f.poll(); f.document.hidden = true; f.document.dispatch('visibilitychange');
    assert(!f.input.jumpHeld && !f.input.jumpPressed);
    f.document.hidden = false; f.document.dispatch('visibilitychange'); f.poll();
    assert(!f.input.gamepadActive && !f.input.jumpHeld);
    f.set(p, 0, false); f.poll(); assert(f.input.gamepadActive);
});

test('Space and Enter used to resume stay consumed until keyup despite later OS repeats', () => {
    for (const code of ['Space', 'Enter']) {
        const f = fixture(); f.paused = true;
        f.key(code);
        assert.strictEqual(f.actions('resume').length, 1);
        f.input.endFrame(); f.paused = false;
        for (let repeat = 0; repeat < 5; repeat++) f.key(code, true, { repeat: true });
        assert(!f.input.jumpHeld && !f.input.jumpPressed, `${code} repeat after resume must not jump`);
        assert.strictEqual(f.input.actions.length, 0);
        f.key('KeyZ');
        assert(f.input.jumpHeld && f.input.jumpPressed, 'a separate fresh gameplay key still works');
        f.key('KeyZ', false); f.input.endFrame();
        f.key(code, false); f.key(code);
        assert(f.input.jumpHeld && f.input.jumpPressed, 'keyup re-enables a fresh normal jump');
    }
    const f = fixture(); f.open = true;
    for (const code of ['Space', 'KeyZ', 'KeyX']) {
        f.key(code); assert(f.input.jumpHeld && f.input.jumpPressed, 'dialogue must preserve existing keyboard movement/jump');
        f.key(code, false); f.input.endFrame();
    }
});

test('seeded hotplug, focus, menu and mixed-source churn preserves finite bounded input state', () => {
    const f = fixture(); let p = pad(), seed = 0x1b0c5;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let frame = 0; frame < 12000; frame++) {
        if (random() < .03) { p = pad(frame % 4); f.pads = random() < .5 ? [] : [p]; }
        if (random() < .02) { f.open = !f.open; f.revision++; }
        if (random() < .02) f.paused = !f.paused;
        if (random() < .02) { f.window.dispatch('blur'); f.window.dispatch('focus'); }
        p.axes = [random() * 2 - 1, random() * 2 - 1];
        for (const index of [0, 1, 2, 9, 12, 13, 14, 15]) f.set(p, index, random() < .1);
        if (random() < .1) f.key('ArrowRight', random() < .5);
        f.time += random() * 100;
        assert.doesNotThrow(() => f.poll());
        assert.strictEqual(typeof f.input.gamepadConnected, 'boolean');
        assert.strictEqual(typeof f.input.gamepadActive, 'boolean');
        assert(f.input.heldSources.size <= 5);
        assert(f.input.actions.length <= 3);
        assert(Number.isFinite(f.input.gamepadNextRepeat));
        if (f.open || f.paused || !f.input.gamepadActive) {
            assert(!f.input.heldSources.get('jump').has('gamepad'));
            assert(!f.input.heldSources.get('left').has('gamepad'));
        }
        f.input.endFrame();
    }
});

console.log(`Gamepad input: ${passed} groups passed, including 12,000 adversarial polls.`);
