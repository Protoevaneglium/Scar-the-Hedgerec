/** Regular campaign badniks must render the verified source-sheet frames. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createGameHarness } = require('./helpers/game_harness');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/enemy_sources/manifest.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/assets/models/manifest.json'), 'utf8'));
let passed = 0;
function test(name, run) { run(); passed++; console.log(`  PASS ${name}`); }
function recorder(h) {
    const calls = [];
    const ctx = new Proxy(h.ctx, {
        get(target, key) {
            const value = target[key];
            if (typeof value !== 'function') return value;
            return (...args) => { calls.push({ method: key, args, smoothing: target.imageSmoothingEnabled }); return value.apply(target, args); };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    return { ctx, calls, clear() { calls.length = 0; } };
}
function expectedFrames(atlas) {
    return Object.fromEntries(Object.entries(atlas.frames).map(([key, frame]) => [key, {
        sx: frame.atlasRect.x, sy: frame.atlasRect.y, w: frame.atlasRect.w, h: frame.atlasRect.h,
        dw: frame.display.w, dh: frame.display.h, ax: frame.display.ax, ay: frame.display.ay,
    }]));
}
function checkDraw(record, atlas, en) {
    const images = record.calls.filter(call => call.method === 'drawImage');
    assert.strictEqual(images.length, 1, `${en.type || en.kind} must render exactly one source-sheet sprite`);
    assert.strictEqual(record.calls.filter(call => ['ellipse', 'fillRect', 'strokeRect', 'fillText'].includes(call.method)).length, 0,
        'normally loaded enemy bodies must not be replaced or augmented with invented shapes');
    const draw = images[0];
    let [image, sx, sy, w, h, dx, dy, dw, dh] = draw.args;
    if (image.src === 'assets/models/sprite_models.png') {
        // The owner's 2.5D presentation permits verified derivatives, retaining the same
        // species, animation selection and source-crop anchors. Validate the inverse mapping.
        const entry = Object.entries(models.frames).find(([, f]) => f.x === sx && f.y === sy && f.w === w && f.h === h);
        assert(entry, 'the rendered model must have a recorded source crop');
        const [file, crop] = entry[0].split(':');
        assert.strictEqual('assets/' + file, atlas.file);
        [sx, sy, w, h] = crop.split(',').map(Number);
        const scaleX = dw / (w + 2 * models.padding), scaleY = dh / (h + 2 * models.padding);
        dx += models.padding * scaleX; dy += models.padding * scaleY;
        dw = w * scaleX; dh = h * scaleY;
        [dx,dy,dw,dh] = [dx,dy,dw,dh].map(v => Math.round(v * 1e9) / 1e9);
    } else assert.strictEqual(image.src, atlas.file);
    assert.strictEqual(draw.smoothing, false, 'native crop pixels must use nearest-neighbor display scaling');
    const entry = Object.entries(atlas.frames).find(([, frame]) => {
        const r = frame.atlasRect;
        return r.x === sx && r.y === sy && r.w === w && r.h === h;
    });
    assert(entry, `unverified crop: ${sx},${sy},${w},${h}`);
    const [key, frame] = entry;
    assert.deepStrictEqual([dx, dy, dw, dh], [-frame.display.ax, -frame.display.ay, frame.display.w, frame.display.h],
        `${key} must retain its established display size and ground anchor`);
    assert(sx >= 0 && sy >= 0 && sx + w <= image.naturalWidth && sy + h <= image.naturalHeight);
    return key;
}
function checkMarker(record) {
    assert.strictEqual(record.calls.filter(call => call.method === 'drawImage').length, 0);
    assert.strictEqual(record.calls.filter(call => call.method === 'ellipse').length, 0, 'an unavailable sprite must not invent an enemy body');
    assert.strictEqual(record.calls.filter(call => call.method === 'strokeRect').length, 1);
    assert.strictEqual(record.calls.filter(call => call.method === 'fillText' && call.args[0] === '!').length, 1,
        'a missing asset must keep the live hazard visible as a clear UI marker');
}

console.log('\nVerified enemy sprite rendering');

test('both runtime frame tables exactly match manifest native crops and preserved display geometry', () => {
    const h = createGameHarness({ stage: 'z1_act2' });
    try {
        assert.deepStrictEqual(JSON.parse(JSON.stringify(h.evaluate('ENEMY_FRAMES'))), expectedFrames(manifest.atlases.base));
        assert.deepStrictEqual(JSON.parse(JSON.stringify(h.game.terrain.levelDef.enemyFrames)), expectedFrames(manifest.atlases.act2));
        for (const atlas of Object.values(manifest.atlases)) for (const frame of Object.values(atlas.frames)) {
            assert.strictEqual(frame.atlasRect.w, frame.sourceRect.w);
            assert.strictEqual(frame.atlasRect.h, frame.sourceRect.h);
            assert(frame.display.w > 0 && frame.display.h > 0);
        }
    } finally { h.dispose(); }
});

test('every normally loaded campaign enemy uses its verified atlas instead of procedural bodies', () => {
    const h = createGameHarness(), r = recorder(h);
    try {
        for (const stage of h.game.getCampaignStages()) {
            h.game.loadStage(stage, { skipTitleCard: true, skipFade: true });
            const g = h.game, atlas = stage === 'z1_act2' ? manifest.atlases.act2 : manifest.atlases.base;
            assert(g.terrain.enemies.length > 0, `${stage} must exercise a real roster`);
            for (const clock of [0, 13, 37, 79, 121]) for (let index = 0; index < g.terrain.enemies.length; index++) {
                const enemy = g.terrain.enemies[index], before = JSON.stringify(enemy);
                g.terrain.clock = clock; r.clear(); g.drawEnemy(r.ctx, enemy, index);
                checkDraw(r, atlas, enemy);
                assert.strictEqual(JSON.stringify(enemy), before, 'drawing cannot change an enemy or its collision state');
            }
            assert.strictEqual(h.ctx.depth, 0, `${stage}: drawing state must balance`);
        }
    } finally { h.dispose(); }
});

test('every imported frame is reachable through species animation and facing states', () => {
    const base = { crab: 'crab_', buzz: 'buzz_', motobug: 'moto_', chopper: 'chopper_', spikes: 'spikes_',
        caterkiller: 'cater_', batbrain: 'bat_', burrobot: 'burro_' };
    const act2 = { buzzer: 'buzzer_', masher: 'masher_', coconuts: 'coconuts_', sping: 'sping_', grounder: 'grounder_',
        crawl: 'crawl_', shell: 'shell_', slicer: 'slicer_', octus: 'octus_', balkiry: 'balkiry_', nebula: 'nebula_', chop: 'chop_',
        asteron: 'asteron_', turtloid: 'turtloid_' };
    for (const [stage, species, atlas] of [['palmtree', base, manifest.atlases.base], ['z1_act2', act2, manifest.atlases.act2]]) {
        const h = createGameHarness({ stage }), r = recorder(h), seen = new Set();
        try {
            const g = h.game;
            for (const [type, prefix] of Object.entries(species)) for (const near of [false, true]) for (const facing of [-1, 1]) {
                const enemy = { type, kind: ['crab', 'motobug', 'spikes', 'caterkiller', 'burrobot', 'coconuts', 'sping', 'grounder', 'crawl', 'shell', 'slicer', 'octus', 'turtloid'].includes(type) ? 'crab' : 'buzz',
                    x: 1000, y: 500, vx: facing, minX: near ? 1000 : 500, maxX: 1500, phase: 0 };
                g.player.x = enemy.x + facing * (near ? 40 : 400); g.player.y = enemy.y + 40;
                for (let clock = 0; clock < 150; clock++) {
                    g.terrain.clock = clock; r.clear(); g.drawEnemy(r.ctx, enemy, 0);
                    const key = checkDraw(r, atlas, enemy);
                    assert(key.startsWith(prefix), `${type} was rendered as ${key}`);
                    seen.add(key);
                }
            }
            assert.deepStrictEqual([...seen].sort(), Object.keys(atlas.frames).sort(), `${stage}: an imported frame is unreachable or an undeclared frame is used`);
        } finally { h.dispose(); }
    }
});

test('untyped ground and flying defaults retain their species regardless of list position', () => {
    const h = createGameHarness(), r = recorder(h);
    try {
        for (const kind of ['crab', 'buzz']) for (let index = 0; index < 14; index++) {
            const enemy = { kind, x: 900, y: 500, vx: 1, minX: 500, maxX: 1500, phase: 0 };
            r.clear(); h.game.drawEnemy(r.ctx, enemy, index);
            const key = checkDraw(r, manifest.atlases.base, enemy);
            assert(key.startsWith(kind + '_'), `list position ${index} changed default ${kind} into ${key}`);
        }
    } finally { h.dispose(); }
});

test('deferred or failed regular enemy images show a UI hazard marker until the correct atlas loads', () => {
    for (const failed of [false, true]) {
        const h = createGameHarness({ deferImages: !failed, failImages: failed ? ['assets/enemies.png', 'assets/enemies_act2.png'] : [] });
        const r = recorder(h);
        try {
            for (const stage of h.game.getCampaignStages()) {
                h.game.loadStage(stage, { skipTitleCard: true, skipFade: true });
                for (let index = 0; index < h.game.terrain.enemies.length; index++) {
                    const enemy = h.game.terrain.enemies[index], before = JSON.stringify(enemy);
                    r.clear(); h.game.drawEnemy(r.ctx, enemy, index); checkMarker(r);
                    assert.strictEqual(JSON.stringify(enemy), before);
                }
            }
        } finally { h.dispose(); }
    }
    const h = createGameHarness({ stage: 'z1_act2', deferImages: true }), r = recorder(h);
    try {
        const enemy = h.game.terrain.enemies[0];
        h.game.drawEnemy(r.ctx, enemy); checkMarker(r);
        h.flushImages(image => image.src === 'assets/enemies_act2.png');
        r.clear(); h.game.drawEnemy(r.ctx, enemy); checkDraw(r, manifest.atlases.act2, enemy);
        assert.strictEqual(h.game.enemySheetLoaded, false, 'the custom atlas does not depend on the shared sheet finishing first');
        h.game.loadStage('palmtree', { skipTitleCard: true, skipFade: true });
        h.flushImages(image => image.src === 'assets/enemies_act2.png');
        assert.strictEqual(h.game.customEnemySheetLoaded, false, 'a late custom image cannot mark another stage ready');
        h.flushImages(image => image.src === 'assets/enemies.png');
        r.clear(); h.game.drawEnemy(r.ctx, h.game.terrain.enemies[0]); checkDraw(r, manifest.atlases.base, h.game.terrain.enemies[0]);
    } finally { h.dispose(); }
});

test('the common custom-frame path also separates native crops from display size and uses the same unavailable marker', () => {
    const h = createGameHarness(), r = recorder(h);
    try {
        const key = Object.keys(manifest.atlases.base.frames)[0], frames = expectedFrames(manifest.atlases.base);
        h.game.terrain.levelDef = { enemyFrames: frames };
        h.game.customEnemySheet = h.game.enemySheet; h.game.customEnemySheetLoaded = true;
        const enemy = { kind: 'crab', x: 500, y: 600, vx: 1, frames: [key] };
        h.game.drawEnemy(r.ctx, enemy); assert.strictEqual(checkDraw(r, manifest.atlases.base, enemy), key);
        h.game.customEnemySheetLoaded = false;
        r.clear(); h.game.drawEnemy(r.ctx, enemy); checkMarker(r);
        h.game.customEnemySheetLoaded = true; enemy.frames = ['not_in_the_verified_table'];
        r.clear(); h.game.drawEnemy(r.ctx, enemy); checkMarker(r);
    } finally { h.dispose(); }
});

console.log(`Enemy sprite rendering: ${passed} groups passed.`);
