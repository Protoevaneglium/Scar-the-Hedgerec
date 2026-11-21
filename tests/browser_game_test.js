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
        if (key === 'getImageData') return (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height });
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
load('public/levels/zone2_act1.js');
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

assert.strictEqual(game.getNextCampaignStage(), 'z2_act1', 'the Zone 1 rescue must lead to Zone 2');
game.player.score = 83000; game.player.lives = 5; game.player.shield = true;
game.actClear.phase = 'fadeOut'; game.fadeAlpha = .99;
assert(game.updateActClear(1, false), 'the completed Zone 1 tally must load the next zone');
assert.strictEqual(game.stageName, 'z2_act1');
game.titleCard = null; game.fadeAlpha = 0;
assert.strictEqual(game.player.score, 83000);
assert.strictEqual(game.player.lives, 5);
assert(game.player.shield && game.player.rings === 0 && game.stageTime === 0,
    'Zone 2 must carry campaign rewards and reset stage counters');
const canopy = game.terrain;
assert(game.getCampaignStages().includes('z2_act1'));
assert.notDeepStrictEqual(canopy.levelDef.skyColors(0, 0), canopy.levelDef.skyColors(.8, 0),
    'the sky must change while progressing through Zone 2');
assert.notDeepStrictEqual(canopy.levelDef.skyColors(0, 0), canopy.levelDef.skyColors(0, 1800),
    'the sky must also animate while exploring');
for (const checkpoint of canopy.checkpoints) {
    game.player.place(checkpoint.x, 0, checkpoint.y);
    for (const era of ['good_future', 'present', 'past']) {
        canopy.timeEra = era; canopy.clock += 180;
        game.snapCamera(); game.render();
    }
}
const canopyShaft = canopy.z2.shafts[0];
game.player.x = canopyShaft.x0 + 12; game.player.y = canopyShaft.top + 90;
game.player.state = sandbox.SonicEngine.STATE.AIRBORNE; game.player.curled = false;
game.player.xsp = 0; game.player.ysp = 2;
game.player.update({ left: true, jumpHeld: true, jumpPressed: true }, 1 / 60);
assert(game.player.wallKickTimer > 0 && game.player.xsp > 0);
game.snapCamera(); game.render();
game.resetCurrentStage();
assert.strictEqual(game.terrain.rings.filter(r => r.collected).length, 0);
assert.strictEqual(game.terrain.stage, 'z2_act1');
console.log('  ✓ Zone 2 campaign carryover, changing skies, wall-kick callbacks, scenery, and reset render correctly');

for (const stage of game.getCampaignStages()) {
    game.loadStage(stage, { skipTitleCard: true, skipFade: true });
    const terrain = game.terrain, p = game.player;
    const enemy = terrain.enemies.find(en => en.kind === 'crab');
    assert(enemy, `${stage} must offer a badnik rescue`);
    p.x = enemy.x; p.y = enemy.y - 14;
    p.state = sandbox.SonicEngine.STATE.AIRBORNE; p.curled = true;
    p.xsp = p.gsp = 0; p.ysp = 2;
    terrain.updateObjects(p, 1);
    assert(!enemy.alive && terrain.animals.length > 0, `${stage} must release a real animal`);
    const calls = [];
    ctx.drawImage = (source, ...args) => {
        if (source === game.animalSheet) calls.push(args);
        return canvasDrawImage(source, ...args);
    };
    for (let i = 0; i < 120; i++) {
        terrain.updateAnimals(p, 1);
        if (i % 5 === 0) { game.snapCamera(); game.render(); }
    }
    ctx.drawImage = canvasDrawImage;
    assert(calls.length > 0 && calls.every(args => args[2] === 32 && args[3] === 32),
        `${stage} must draw the animal atlas in the real renderer`);
    assert(calls.some(args => args[0] === 32) && calls.some(args => args[0] === 64),
        `${stage} must animate both moving animal poses`);
}
console.log('  ✓ Every campaign act frees and renders animated animals from the shared atlas');

for(const stage of ['palmtree','z1_act2','z2_act1']) {
    game.loadStage(stage,{skipTitleCard:true,skipFade:true});
    const terrain=game.terrain, goal=terrain.goalPost, p=game.player;
    terrain.rings=[];p.rings=7;p.score=1234;game.stageTime=50;
    p.place(goal.x+1,0,goal.y);p.update({},1/60);
    assert(goal.spinning && p.score===2234,'the sign must award its base score without pre-awarding the ring tally');
    game.frame(game.last+1000/60);
    assert.strictEqual(game.stageTime,50,'the clock must freeze as soon as the sign spins');
    goal.spinTimer=1;p.update({},1/60);
    game.updateActClear(1,true);game.updateActClear(1,true);
    assert.strictEqual(p.score,1234+1000+5000+700,`${stage}: the complete ring bonus must be awarded exactly once`);
    game.updateActClear(1,false);
    assert.strictEqual(p.score,7934);
}
console.log('  ✓ finish animation freezes the clock and the results tally awards each bonus exactly once');

for (const stage of game.getCampaignStages()) {
    game.loadStage(stage, { skipTitleCard: true, skipFade: true });
    const terrain=game.terrain, post=terrain.starPosts.at(-1);
    game.player.place(post.x,0,post.y); game.player.update({},1/60);
    assert(game.cpIndex>0,`${stage}: checkpoint HUD must follow a real star post`);
    game.player.respawn();
    assert(game.cpIndex>0,`${stage}: a copied respawn coordinate must not reset the HUD to checkpoint 1`);
    game.gotoCheckpoint(0);
    game.player.x+=300; game.player.respawn();
    assert(Math.abs(game.player.x-terrain.checkpoints[0].x)<1,`${stage}: manual checkpoint must replace the old respawn location`);
    terrain.timeWarpTarget='past';terrain.timeWarpCharge=89;terrain.timeWarpFlash=18;
    game.resetCurrentStage();
    assert(terrain.timeWarpTarget===null && terrain.timeWarpCharge===0 && terrain.timeWarpFlash===0,
        `${stage}: reset must cancel a pending time warp`);
}
game.loadStage('z1_act3',{skipTitleCard:true,skipFade:true});
game.player.place(8150,0,560);game.player.update({},1/60);
assert(game.terrain.boss.active);
game.gotoCheckpoint(0);game.player.update({},1/60);
assert(!game.terrain.boss.active && game.player.x<500,'leaving the arena via a checkpoint must release its lock');
const oldStorage={...sandbox.localStorage};
try {
    for (const corrupted of ['{broken','{}','null','[5,null,"palmtree"]']) {
        let stored=corrupted;
        sandbox.localStorage.getItem=()=>stored;sandbox.localStorage.setItem=(_key,value)=>{stored=value;};
        game.loadStage('z2_act1',{skipTitleCard:true,skipFade:true});
        const progress=JSON.parse(stored);
        assert(Array.isArray(progress) && progress.includes('z2_act1') && progress.every(id=>typeof id==='string'));
    }
} finally { Object.assign(sandbox.localStorage,oldStorage); }
console.log('  ✓ checkpoint warps, respawn HUD, arena exits, time-warp resets and corrupt saved progress recover correctly');

for (const stage of ['palmtree', 'z1_act2', 'z2_act1']) {
    for (const phase of ['spinning', 'tally', 'fadeOut']) {
        game.loadStage(stage, { skipTitleCard: true, skipFade: true });
        const goal = game.terrain.goalPost;
        if (phase === 'spinning') {
            goal.spinning = true; goal.spinTimer = 100;
        } else {
            goal.cleared = true;
            game.updateActClear(1, false);
            game.actClear.phase = phase;
            game.fadeAlpha = .9;
        }
        game.gotoCheckpoint(0);
        assert(!game.actClear && !game.terrain.goalPost.spinning && !game.terrain.goalPost.cleared,
            `${stage}: checkpoint during ${phase} must cancel completion and release movement`);
        assert.strictEqual(game.fadeAlpha, 0, 'a checkpoint must not retain the results fade');
        const x = game.player.x;
        game.input.press('right', true);
        for (let i = 0; i < 20; i++) game.frame(game.last + 1000 / 60);
        game.input.press('right', false);
        assert(game.player.x > x + 1 && game.stageTime > 0,
            `${stage}: controls and stage clock must work after leaving ${phase}`);
    }
}
game.loadStage('z1_act3', { skipTitleCard: true, skipFade: true });
game.terrain.boss.defeated = true;
game.terrain.capsule.opened = true;
game.gotoCheckpoint(0);
assert(!game.terrain.capsule.opened && !game.actClear && !game.terrain.boss.active,
    'leaving a rescue must cancel the sequence and restore a playable boss act');
console.log('  ✓ checkpoint warps during sign animations, tallies, fades and rescues restore gameplay');

for (const stage of game.getCampaignStages()) {
    game.loadStage(stage, { skipTitleCard: true, skipFade: true });
    const p = game.player;
    p.shield = true; p.invincTimer = 900; p.shoesTimer = 900; p.invulnTimer = 120;
    p.score = 1234; p.lives = 5;
    p.die();
    // Exercise a restart with temporary item state and a pending death camera cutoff.
    p.shield = true; p.invincTimer = 900; p.shoesTimer = 900; p.invulnTimer = 120;
    game.resetCurrentStage();
    assert(!p.shield && !p.invincTimer && !p.shoesTimer && !p.invulnTimer,
        `${stage}: resetting must clear shields, power-ups and damage flicker`);
    assert(!p.deathOffscreenY && p.state !== sandbox.SonicEngine.STATE.DYING,
        `${stage}: resetting during death must cancel the old death sequence`);
    assert(p.score === 1234 && p.lives === 5 && !p.rings,
        'a stage reset must preserve score and lives while resetting rings');
}
console.log('  ✓ resets during death clear temporary item and camera state while preserving rewards');

// A one-off renderer failure must not cancel the only animation callback forever.
const scheduleFrame = sandbox.requestAnimationFrame;
const renderFrame = game.render;
const scheduled = [];
try {
    sandbox.requestAnimationFrame = callback => scheduled.push(callback);
    game.render = () => { throw new Error('transient rendering failure'); };
    assert.throws(() => game.frame(game.last + 1000 / 60), /transient rendering failure/);
    assert.strictEqual(scheduled.length, 1, 'a failed frame must leave the next frame scheduled');
    game.render = renderFrame;
    scheduled.shift()(game.last + 1000 / 60);
    assert.strictEqual(scheduled.length, 1, 'recovery must schedule exactly one animation callback');
    game.input.actions.push({ type: 'reset' });
    scheduled.shift()(game.last + 1000 / 60);
    assert.strictEqual(scheduled.length, 1, 'reset must keep a single active frame loop');
} finally {
    sandbox.requestAnimationFrame = scheduleFrame;
    game.render = renderFrame;
}
console.log('  ✓ a transient frame error cannot permanently stop rendering or disable Reset');

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
