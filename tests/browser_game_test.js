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
class ImageStub {
    set src(value) {
        this._src = value;
        // Exercise the generated boss atlas path as well as the fallback rendering.
        if (value.includes('kitt_boss_poses')) {
            this.complete = true; this.naturalWidth = 1536; this.naturalHeight = 1024;
        }
        if (this.onload) this.onload();
    }
}
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
load('public/js/modern-hud.js');
load('public/levels/zone1_act2.js');
load('public/levels/kitt_boss.js');
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

game.loadStage('z1_act3', { skipTitleCard: true, skipFade: true });
const act3 = game.terrain;
const firstShaft = act3.z3.shafts[0];
game.player.x = firstShaft.x0 + 12;
game.player.y = firstShaft.bottom - 40;
game.player.state = sandbox.SonicEngine.STATE.AIRBORNE;
game.player.curled = false;
game.player.xsp = 0; game.player.ysp = 2;
game.player.update({ left: true, jumpHeld: true, jumpPressed: true }, 1 / 60);
assert(game.player.wallKickTimer > 0 && game.player.xsp > 0, 'the real wall-kick callback must launch Scar');
game.snapCamera(); game.render();
let bossAtlasDraws = 0;
const canvasDrawImage = ctx.drawImage;
ctx.drawImage = (source, ...args) => {
    if (source && String(source._src).includes('kitt_boss_poses')) bossAtlasDraws++;
    return canvasDrawImage(source, ...args);
};
// Each checkpoint samples a different height or route, including the fortress arena.
for (const checkpoint of act3.checkpoints) {
    game.player.place(checkpoint.x, 0, checkpoint.y);
    for (const era of ['good_future', 'present', 'past']) {
        act3.timeEra = era;
        game.snapCamera(); game.render();
    }
}
game.player.place(act3.boss.left + 22, 0, act3.boss.floorY);
game.player.invulnTimer = 100000;
const seenBossStates = new Set();
for (let frame = 0; frame < 1800; frame++) {
    game.player.update({}, 1 / 60);
    seenBossStates.add(act3.boss.state);
    if (frame % 12 === 0) { game.snapCamera(); game.render(); }
}
assert(seenBossStates.has('clawWarn') && seenBossStates.has('rocketWarn') && seenBossStates.has('rush'),
    'the actual game must advance through both weapon attacks and the rush');
assert(bossAtlasDraws > 0, 'the generated Kitt atlas must be drawn by the real renderer');
assert(game.camX >= act3.boss.left && game.camX + game.W <= act3.boss.right,
    'the active battle camera must stay inside the fortress arena');
assert(Math.abs(act3.boss.floorY - game.camY - (game.H - 125)) < 1,
    'the battle camera must leave room above Kitt for his bazooka and HUD');
ctx.drawImage = canvasDrawImage;
console.log('  ✓ Act 3 routes, sky eras, animated boss atlas, and battle render with real browser callbacks');

game.loadStage('z1_act3', { skipTitleCard: true, skipFade: true });
const rescueTerrain = game.terrain;
rescueTerrain.boss.defeated = true;
game.player.x = rescueTerrain.capsule.x;
game.player.y = rescueTerrain.capsule.y - 130;
game.player.state = sandbox.SonicEngine.STATE.AIRBORNE;
game.player.curled = true;
game.player.xsp = game.player.gsp = 0; game.player.ysp = 2;
let atlasCalls = [], capsuleCalls = [];
ctx.drawImage = (source, ...args) => {
    if (source === game.animalSheet) atlasCalls.push(args);
    if (source === game.commonSheet && [678, 763, 840].includes(args[1])) capsuleCalls.push(args);
    return canvasDrawImage(source, ...args);
};
game.snapCamera(); game.render();
assert(capsuleCalls.some(args => args[1] === 678), 'the intact capsule must draw its blinking idle sprite');
for (let frame = 0; frame < 240 && !rescueTerrain.capsule.cleared; frame++) {
    game.last = frame * 1000 / 60;
    game.frame((frame + 1) * 1000 / 60);
    assert(!game.actClear, 'results must wait for the physical rescue to finish');
}
assert(rescueTerrain.capsule.cleared && rescueTerrain.capsule.releasedCount === 12);
assert(capsuleCalls.some(args => args[1] === 763), 'the button must draw the depressed switch sprite');
assert(capsuleCalls.some(args => args[1] === 840), 'the destroyed capsule must draw its broken base');
assert(atlasCalls.length > 0, 'the real object renderer must draw the extracted animal atlas');
assert(atlasCalls.some(args => args[0] === 32) && atlasCalls.some(args => args[0] === 64),
    'both moving animal poses must reach the real renderer');
assert(atlasCalls.every(args => args[2] === 32 && args[3] === 32 && [32, 288].includes(args[1])),
    'Citadel animals must draw the Cucky and Micky atlas rows at native resolution');
const frozenStageTime = game.stageTime;
game.frame(game.last + 1000 / 60);
assert(game.actClear && game.stageTime === frozenStageTime, 'the tally must begin with the clock frozen');
ctx.drawImage = canvasDrawImage;
console.log('  ✓ Capsule switch, explosion, broken base, animal atlas animation, and delayed tally render correctly');

game.loadStage('palmtree', { skipTitleCard: true, skipFade: true });
const loop = game.terrain.loops[1];
const shelf = game.terrain.corkscrewFloor;
game.view = { x0: loop.cx - 500, x1: loop.cx + 500, y0: loop.cy - 400, y1: loop.cy + 400 };
let clips = 0;
ctx.clip = () => { clips++; };
game.player.x = loop.cx;
game.player.y = loop.cy - loop.r + 19;
game.drawFloor(ctx, shelf);
assert.strictEqual(clips, 0, 'the shelf must not be cut out when Scar is on the loop');
game.player.y = shelf.f(loop.cx) - 19;
game.drawFloor(ctx, shelf);
assert.strictEqual(clips, 0, 'the shelf must remain intact on the upper route');

const order = [];
for (const name of ['drawBackground', 'drawWaterfallsBack', 'drawTunnelsBack', 'drawSceneryProps',
    'drawTunnelsRock', 'drawWaterSurface', 'drawPalmtreeObjects', 'drawParticles', 'drawSonicCDHUD',
    'drawZoneMapRadar', 'drawControlsHint', 'drawActClearOverlay', 'drawGameOverOverlay', 'drawTitleCard']) {
    game[name] = noop;
}
game.drawFloor = (_, surface) => { if (surface === shelf) order.push('shelf'); };
game.drawLoops = (_, loops) => { if (loops && loops.includes(loop)) order.push('loop'); };
game.drawPlayer = () => order.push('player');
game.render();
assert(order.indexOf('shelf') >= 0 && order.indexOf('shelf') < order.indexOf('loop')
    && order.indexOf('loop') < order.indexOf('player'), `expected shelf, loop, player; got ${order}`);
console.log('  ✓ Act 1 draws the intact shelf behind the loop and Scar');
