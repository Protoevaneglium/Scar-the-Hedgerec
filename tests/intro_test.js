/** Exercise the actual startup controller with cold-browser media policies. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const start = html.indexOf('function runIntro(onDone) {');
const end = html.indexOf("window.addEventListener('DOMContentLoaded'", start);
assert(start >= 0 && end > start);
const source = html.slice(start, end);
function events(target = {}) {
    const listeners = new Map();
    target.addEventListener = (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
    };
    target.removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
    target.dispatch = (name, event = {}) => [...(listeners.get(name) || [])].forEach(fn => fn(event));
    return target;
}
function fixture(policy, search = '') {
    let boots = 0, serial = 0;
    const timers = new Map(), plays = [];
    const video = events({ paused: true, currentTime: 0,
        play() {
            plays.push({ muted: this.muted });
            const result = policy(this, plays.length);
            if (result === 'pending') return new Promise(() => {});
            if (result === 'block') return Promise.reject(new Error('Autoplay blocked'));
            this.paused = false;
            return Promise.resolve();
        },
        pause() { this.paused = true; },
    });
    const classes = new Set();
    const wrap = { classList: { add(name) { classes.add(name); } }, remove() {} };
    const sandbox = events({ URLSearchParams, location: { search }, INTRO_ACTIVE: true,
        document: { getElementById: id => id === 'intro-video' ? video : wrap },
        audio: { unlock() {}, playBGM() {} },
        setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
    });
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    sandbox.runIntro(() => boots++);
    return { video, sandbox, plays, timers, classes, get boots() { return boots; } };
}
function startKey(f) {
    let consumed = false;
    f.sandbox.dispatch('keydown', { code: 'Enter', preventDefault() { consumed = true; }, stopImmediatePropagation() {} });
    assert(consumed, 'Start must be consumed before gameplay sees it');
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
(async () => {
    console.log('\nAutomatic opening and manual title-screen Start');
    const cold = fixture(video => video.muted ? 'allow' : 'block');
    await settle();
    assert.deepStrictEqual(cold.plays, [{ muted: false }, { muted: true }]);
    assert(!cold.video.paused && cold.boots === 0, 'intro must start without any input');
    cold.video.currentTime = 1; cold.video.dispatch('timeupdate');
    assert(![...cold.timers.values()].some(t => t.delay === 8000), 'playing video must cancel the startup deadline');
    cold.video.currentTime = 28; cold.video.dispatch('timeupdate'); cold.video.dispatch('ended');
    assert.strictEqual(cold.boots, 0, 'finishing the clip must hold the title instead of launching gameplay');
    assert(cold.video.paused && cold.sandbox.INTRO_ACTIVE);
    cold.sandbox.dispatch('keydown', { code: 'ArrowRight' });
    assert.strictEqual(cold.boots, 0, 'movement keys must leave the title waiting for Start');
    assert.strictEqual(cold.plays.length, 2, 'a held title must not restart the opening on movement keys');
    startKey(cold);
    cold.video.dispatch('ended');
    assert.strictEqual(cold.boots, 1, 'Start must launch exactly once');
    assert.strictEqual(cold.sandbox.INTRO_ACTIVE, false);
    console.log('  ✓ the opening plays without a click, then holds the title until Enter');

    const allowed = fixture(() => 'allow');
    await settle();
    assert.deepStrictEqual(allowed.plays, [{ muted: false }]);
    allowed.video.dispatch('ended');
    assert.strictEqual(allowed.boots, 0);
    allowed.sandbox.dispatch('pointerdown', { preventDefault() {} });
    assert.strictEqual(allowed.boots, 1, 'a title-screen tap must still start the game');
    console.log('  ✓ the audible intro also waits at the title, and a title-screen tap starts gameplay');

    const blocked = fixture(() => 'block');
    await settle();
    assert.strictEqual(blocked.boots, 0, 'media failure must not bypass Start');
    assert(blocked.classes.has('title-fallback'), 'unplayable media must show the original title art');
    startKey(blocked);
    assert.strictEqual(blocked.boots, 1);
    const stalled = fixture(() => 'pending');
    [...stalled.timers.values()].find(t => t.delay === 8000).fn();
    assert(stalled.classes.has('title-fallback') && stalled.boots === 0,
        'a stalled load must show the title and keep waiting for Start');
    startKey(stalled);
    assert.strictEqual(stalled.boots, 1);
    console.log('  ✓ media errors and timeouts show the title and never automatically launch a level');

    const skip = fixture(video => video.muted ? 'allow' : 'block');
    await settle();
    skip.video.currentTime = 2;
    startKey(skip);
    assert.strictEqual(skip.boots, 1, 'Start during the opening must still skip directly into the game');
    console.log('  ✓ pressing Start during the opening still works immediately');
})().catch(error => { console.error(error); process.exitCode = 1; });
