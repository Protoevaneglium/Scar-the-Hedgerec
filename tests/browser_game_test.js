/** Exercise the real browser game callbacks with the engine and a lightweight canvas. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const noop = () => {};
const gradient = { addColorStop: noop };
const ctx = new Proxy({}, {
    get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'createPattern') return () => ({});
        if (key === 'measureText') return text => ({ width: String(text).length * 8 });
        return noop;
    },
});
const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, {
        style: {}, classList: { add: noop, remove: noop, toggle: noop }, dataset: {},
        clientWidth: 960, clientHeight: 540, paused: true,
        addEventListener: noop, removeEventListener: noop, blur: noop,
        getContext: () => ctx, getAttribute: () => null, setAttribute: noop,
        play: () => Promise.resolve(), pause: noop, load: noop,
    });
    return elements.get(id);
}
class ImageStub { set src(value) { this._src = value; if (this.onload) this.onload(); } }
const sandbox = {
    console, URLSearchParams, Math, Image: ImageStub, Audio: function () { return element('audio'); },
    document: { getElementById: element, createElement: () => element('canvas'), querySelectorAll: () => [] },
    navigator: { maxTouchPoints: 0 }, location: { search: '?nointro&stage=z1_act2' },
    performance: { now: () => 0 }, requestAnimationFrame: noop, setTimeout: noop,
    localStorage: { getItem: () => null, setItem: noop }, fetch: () => Promise.reject(new Error('offline')),
    addEventListener: noop, removeEventListener: noop,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }); }
load('public/sonic-engine.js');
load('public/levels/zone1_act2.js');
load('public/levels/zone1_act3.js');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const script = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/);
assert(script, 'main game script exists');
vm.runInContext("'use strict';" + script[1] + '\nwindow.testGame = new Game();', sandbox, { filename: 'public/index.html' });
const game = sandbox.testGame;

function drive(label, prepare, input, maxFrames) {
    game.loadStage('z1_act2', { skipTitleCard: true, skipFade: true });
    const player = game.player;
    const seen = new Set();
    for (const [name, callback] of Object.entries(player.events)) {
        player.events[name] = (...args) => { seen.add(name); return callback(...args); };
    }
    if (prepare) prepare(player, game.terrain);
    let previousJump = false;
    for (let frame = 0; frame < maxFrames; frame++) {
        const controls = input(frame);
        const jump = !!controls.jump;
        player.update({ ...controls, jumpHeld: jump, jumpPressed: jump && !previousJump }, 1 / 60);
        previousJump = jump;
        if (frame % 12 === 0) { game.snapCamera(); game.render(); }
        if (game.terrain.goalPost.spinning || game.terrain.goalPost.cleared) {
            console.log(`  ✓ ${label} reached the goal with browser handlers and rendering`);
            return seen;
        }
    }
    throw new Error(`${label} did not reach the goal`);
}

const lower = drive('Act 2 lower route', null, frame => {
    if (frame < 10) return { down: true };
    if (frame < 45) return { down: true, jump: [12, 20, 28, 36].some(n => frame >= n && frame < n + 2) };
    return { right: true };
}, 2100);
assert(lower.has('coasterRail') && lower.has('boost') && lower.has('enemyPop'), 'lower route must exercise rail, boost, and enemies');
const upper = drive('Act 2 upper route', player => player.place(4880, 0, 582), () => ({ right: true }), 1500);
assert(upper.has('coasterRail') && upper.has('bouncePole'), 'upper route must exercise rail and spring');

game.loadStage('z1_act2', { skipTitleCard: true, skipFade: true });
let ready = false;
const player = game.player;
const onReady = player.events.dropDashReady;
player.events.dropDashReady = (...args) => { ready = true; onReady(...args); };
let previousJump = false;
for (let frame = 0; frame < 90; frame++) {
    const jump = (frame >= 1 && frame < 4) || frame >= 8;
    player.update({ right: true, jumpHeld: jump, jumpPressed: jump && !previousJump }, 1 / 60);
    previousJump = jump;
    if (frame % 6 === 0) { game.snapCamera(); game.render(); }
    if (ready && player.grounded) break;
}
assert(ready, 'drop dash must invoke the actual browser callback');
console.log('  ✓ Drop dash invokes the browser callback without freezing');
