/** Real intro controller polling and a held-button handoff into the shipped Game. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { eventTarget, createGameHarness } = require('./helpers/game_harness');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const start = html.indexOf('function runIntro(onDone) {');
const end = html.indexOf("window.addEventListener('DOMContentLoaded'", start);
assert(start >= 0 && end > start);
const source = html.slice(start, end);
let failures = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); }
    catch (error) { failures++; console.error(`  ✗ ${name}\n      ${error.stack}`); }
}
function pad(index = 0, button = -1) {
    return { index, id: 'Xbox controller ' + index, mapping: 'standard', connected: true,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === button, value: i === button ? 1 : 0 })) };
}
function setButton(controller, index, down) {
    controller.buttons[index] = { pressed: down, value: down ? 1 : 0 };
}
function fixture(options = {}) {
    let serial = 0, boots = 0, removed = 0, unlocks = 0, focused = true;
    const frames = new Map(), timers = new Map(), classes = new Set();
    const wrap = { classList: { add: value => classes.add(value) }, remove: () => removed++ };
    const video = eventTarget({ paused: true, currentTime: 0,
        pause() { this.paused = true; },
        play() {
            if (options.blockVideo) return Promise.reject(new Error('Media denied'));
            this.paused = false; return Promise.resolve();
        },
    });
    const state = { pads: [], denied: false };
    const document = eventTarget({ hidden: false, hasFocus: () => focused,
        getElementById: id => id === 'intro-video' ? (options.noVideo ? null : video) : (options.noWrap ? null : wrap) });
    const sandbox = eventTarget({ URLSearchParams, location: { search: options.search || '' }, INTRO_ACTIVE: true, document,
        navigator: options.noAPI ? {} : { getGamepads() { if (state.denied) throw new Error('Gamepad access denied'); return state.pads; } },
        requestAnimationFrame(fn) { const id = ++serial; frames.set(id, fn); return id; },
        cancelAnimationFrame: id => frames.delete(id),
        setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        audio: { unlock() { unlocks++; if (options.deniedAudio) throw new Error('Audio requires a gesture'); },
            playBGM() { if (options.deniedAudio) throw new Error('Media playback denied'); } },
    });
    sandbox.window = sandbox;
    vm.createContext(sandbox); vm.runInContext(source, sandbox);
    sandbox.runIntro(() => boots++);
    return { sandbox, state, frames, timers, video, classes, document,
        get boots() { return boots; }, get removed() { return removed; }, get unlocks() { return unlocks; },
        frame() {
            assert.strictEqual(frames.size, 1, 'the live intro must own exactly one controller callback');
            const [id, fn] = frames.entries().next().value;
            frames.delete(id); fn(0);
        },
        focus(value) { focused = value; sandbox.dispatch(value ? 'focus' : 'blur'); },
    };
}
function startKey(f) { f.sandbox.dispatch('keydown', { code: 'Enter' }); }
function listenerCount(target) { return [...target.listeners.values()].reduce((sum, listeners) => sum + listeners.length, 0); }
console.log('\nXbox intro and title-screen Start');

test('A and Menu skip the opening or held title only after an observed neutral controller sample', () => {
    for (const button of [0, 9]) for (const title of [false, true]) {
        const f = fixture(), controller = pad(0, button);
        f.state.pads = [controller];
        if (title) f.video.dispatch('ended');
        f.frame(); f.frame();
        assert.strictEqual(f.boots, 0, 'plugging in a held button cannot skip the movie');
        setButton(controller, button, false); f.frame();
        setButton(controller, button, true); f.frame();
        assert.strictEqual(f.boots, 1);
        assert.strictEqual(f.sandbox.INTRO_ACTIVE, false);
        assert.strictEqual(f.frames.size, 0, 'intro polling must stop before gameplay owns RAF');
        assert.strictEqual(f.unlocks, 1);
    }
});

test('disconnected, nonstandard, and replaced controllers cannot inherit another controller neutral state', () => {
    const f = fixture(), first = pad();
    f.state.pads = [first]; f.frame();
    first.connected = false; setButton(first, 0, true); f.frame();
    assert.strictEqual(f.boots, 0);
    const replacement = pad(0, 9); replacement.id = 'Replacement Xbox'; replacement.mapping = '';
    f.state.pads = [replacement]; f.frame();
    replacement.mapping = 'standard'; f.frame();
    assert.strictEqual(f.boots, 0);
    setButton(replacement, 9, false); f.frame();
    setButton(replacement, 9, true); f.frame();
    assert.strictEqual(f.boots, 1);
    const multiple = fixture(), held = pad(0, 0), other = pad(2);
    multiple.state.pads = [held, null, other]; multiple.frame();
    setButton(other, 9, true); multiple.frame();
    assert.strictEqual(multiple.boots, 1, 'another neutral standard pad can start despite a held first controller');
    const fastReconnect = fixture(), original = pad();
    fastReconnect.state.pads = [original]; fastReconnect.frame();
    fastReconnect.sandbox.dispatch('gamepaddisconnected', { gamepad: original });
    fastReconnect.state.pads = [pad(0, 0)]; fastReconnect.frame();
    assert.strictEqual(fastReconnect.boots, 0, 'a same-ID reconnect between polls must lose old neutral arming');
});

test('hidden pages and focus loss pause polling and require a fresh release before return presses', () => {
    for (const mode of ['hidden', 'blur']) {
        const f = fixture(), controller = pad();
        f.state.pads = [controller]; f.frame();
        if (mode === 'hidden') { f.document.hidden = true; f.document.dispatch('visibilitychange'); }
        else f.focus(false);
        assert.strictEqual(f.frames.size, 0, 'background intro controller polling must pause');
        setButton(controller, 0, true);
        if (mode === 'hidden') { f.document.hidden = false; f.document.dispatch('visibilitychange'); }
        else f.focus(true);
        f.frame(); assert.strictEqual(f.boots, 0, 'held input on return must be disarmed');
        setButton(controller, 0, false); f.frame();
        setButton(controller, 0, true); f.frame(); assert.strictEqual(f.boots, 1);
    }
});

test('missing or denied APIs and denied audio leave controller and keyboard startup recoverable', () => {
    const f = fixture({ deniedAudio: true }), controller = pad();
    f.state.pads = [controller]; f.frame();
    f.state.denied = true; assert.doesNotThrow(() => f.frame());
    f.state.denied = false; setButton(controller, 0, true); f.frame();
    assert.strictEqual(f.boots, 0, 'a failed read must clear stale neutral arming');
    setButton(controller, 0, false); f.frame(); setButton(controller, 0, true);
    assert.doesNotThrow(() => f.frame()); assert.strictEqual(f.boots, 1);
    for (const options of [{ noAPI: true }, { deniedAudio: true }]) {
        const keyboard = fixture(options); keyboard.frame(); startKey(keyboard);
        assert.strictEqual(keyboard.boots, 1, 'Enter remains usable without the Gamepad API or unlocked audio');
    }
});

test('finishing clears intro RAF, media/listener hooks, and the startup deadline exactly once', () => {
    const f = fixture(), controller = pad();
    f.state.pads = [controller]; f.frame();
    const stale = [...f.frames.values()][0];
    setButton(controller, 9, true); f.frame();
    assert.strictEqual(f.frames.size, 0);
    assert.strictEqual(listenerCount(f.sandbox), 0);
    assert.strictEqual(listenerCount(f.document), 0);
    assert.strictEqual(listenerCount(f.video), 0);
    assert(![...f.timers.values()].some(timer => timer.delay === 8000));
    assert.strictEqual(f.timers.size, 1, 'only the existing half-second visual fade may remain');
    stale(1000); f.video.dispatch('ended'); f.video.dispatch('error');
    assert.strictEqual(f.boots, 1); assert.strictEqual(f.frames.size, 0);
    const fade = [...f.timers.values()][0]; fade.fn(); assert.strictEqual(f.removed, 1);
    for (const options of [{ search: '?nointro' }, { noVideo: true }, { noWrap: true }]) {
        const skipped = fixture(options);
        assert.strictEqual(skipped.boots, 1);
        assert.strictEqual(skipped.frames.size, 0);
        assert.strictEqual(listenerCount(skipped.sandbox), 0);
        assert.strictEqual(listenerCount(skipped.document), 0);
    }
});

test('the actual Game takes over RAF without consuming held intro A/Menu as a jump or pause', () => {
    for (const button of [0, 9]) {
        const h = createGameHarness({ stage: 'z2_act2' });
        try {
            h.scheduledFrames.clear(); // Stop the harness's pre-created game before exercising real startup.
            h.sandbox.location.search = '?stage=z2_act2'; // The ordinary harness deliberately bypasses the intro.
            const controller = pad();
            h.sandbox.navigator.getGamepads = () => [controller];
            h.evaluate('window.INTRO_ACTIVE = true; runIntro(() => { window.introBoots = (window.introBoots || 0) + 1; window.introGame = new Game(); });');
            h.frame(); setButton(controller, button, true); h.frame();
            assert.strictEqual(h.sandbox.introBoots, 1);
            assert.strictEqual(h.scheduledFrames.size, 1, 'the intro RAF must hand off to exactly one game RAF');
            const g = h.sandbox.introGame;
            for (let i = 0; i < 3; i++) h.frame();
            assert(g.player.grounded && !g.input.jumpPressed && !g.input.jumpHeld,
                'held title A/Menu must not become a gameplay jump');
            assert(!g.paused, 'held title Menu must not pause the newly started game');
            setButton(controller, button, false); h.frame();
            setButton(controller, button, true); h.frame();
            if (button === 0) assert(!g.player.grounded && g.player.ysp < 0, 'a fresh A press after release must jump');
            else assert(g.paused, 'a fresh Menu press after release must pause');
            assert.strictEqual(h.scheduledFrames.size, 1);
        } finally { h.dispose(); }
    }
});

if (failures) process.exitCode = 1;
else console.log('  All Xbox intro regressions passed.');
