/** Exact supplied-source pixels for Sanctuary Duet's bosses and projectiles. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decodePng } = require('./helpers/png_pixels');
const { createGameHarness } = require('./helpers/game_harness');
const root = path.resolve(__dirname, '..');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/duo_boss_sources/manifest.json'), 'utf8'));
const supplied = {
    crocodile: { bytes: 55152, width: 747, height: 454,
        sha256: '7ca962a5d5eea0344b5a071c2fc725adc6968d92d9b2884097d53b4cf2dc8c59',
        transparentColors: [[149, 177, 200]] },
    crawfish: { bytes: 26036, width: 331, height: 549,
        sha256: '54106f515f4e4fe7abe56d75e6c4ec3f2574b9bada332855f4dd8399b964ceba',
        transparentColors: [[0, 128, 128]] },
};
// Independently audited complete bodies, singing poses, music note and detached claws.
const crops = {
    croc_idle1: ['crocodile', 25, 17, 58, 70], croc_idle2: ['crocodile', 93, 17, 61, 70],
    croc_warn: ['crocodile', 170, 98, 59, 69], croc_sing1: ['crocodile', 238, 93, 57, 74],
    croc_sing2: ['crocodile', 305, 85, 57, 82], note: ['crocodile', 326, 88, 8, 7],
    craw_idle1: ['crawfish', 2, 63, 66, 64], craw_idle2: ['crawfish', 70, 64, 66, 63],
    craw_warn1: ['crawfish', 2, 210, 66, 64], craw_warn2: ['crawfish', 70, 206, 66, 68],
    craw_attack: ['crawfish', 70, 305, 67, 43], claw1: ['crawfish', 81, 366, 49, 28],
    claw2: ['crawfish', 132, 365, 51, 30],
};
function rectangle(rect, image, label) {
    for (const key of ['x', 'y', 'w', 'h']) assert(Number.isSafeInteger(rect[key]), `${label}: integer ${key}`);
    assert(rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
        && rect.x + rect.w <= image.width && rect.y + rect.h <= image.height, `${label}: complete bounded rectangle`);
}
let groups = 0;
function test(name, check) { check(); groups++; console.log('  PASS ' + name); }
const sources = {}, atlas = manifest.atlases.duo;
console.log('\nSanctuary Duet supplied sprite provenance and rendering');

test('both original sheets retain exact file bytes, credit headers, dimensions and background keys', () => {
    assert.strictEqual(manifest.schema, 1);
    assert.deepStrictEqual(Object.keys(manifest.sources).sort(), Object.keys(supplied).sort());
    for (const [name, expected] of Object.entries(supplied)) {
        const entry = manifest.sources[name], bytes = fs.readFileSync(path.join(root, 'public', entry.file));
        assert.strictEqual(bytes.length, expected.bytes, `${name}: complete supplied source`);
        assert.strictEqual(sha256(bytes), expected.sha256, `${name}: exact original including credits`);
        assert.strictEqual(entry.sha256, expected.sha256);
        assert.deepStrictEqual(entry.transparentColors, expected.transparentColors);
        const image = decodePng(bytes);
        assert.deepStrictEqual([image.width, image.height], [expected.width, expected.height]);
        assert.deepStrictEqual([entry.width, entry.height], [image.width, image.height]);
        sources[name] = { ...image, keys: new Set(expected.transparentColors.map(rgb => rgb.join(','))) };
    }
});

test('all thirteen native boss, music-note and claw crops match exact supplied pixels without resampling', () => {
    assert.deepStrictEqual(Object.keys(atlas.frames).sort(), Object.keys(crops).sort());
    const image = decodePng(fs.readFileSync(path.join(root, 'public', atlas.file)));
    assert.deepStrictEqual([image.width, image.height], [atlas.width, atlas.height]);
    const covered = new Uint8Array(image.width * image.height);
    let visiblePixels = 0;
    for (const [name, [sourceId, x0, y0, w0, h0]] of Object.entries(crops)) {
        const frame = atlas.frames[name], src = frame.sourceRect, dst = frame.atlasRect, source = sources[sourceId];
        assert.strictEqual(frame.source, sourceId);
        assert.deepStrictEqual(src, { x: x0, y: y0, w: w0, h: h0 }, `${name}: independently audited complete pose`);
        rectangle(src, source, `${name} source`); rectangle(dst, image, `${name} atlas`);
        assert.deepStrictEqual([dst.w, dst.h], [src.w, src.h], `${name}: native dimensions`);
        const expected = Buffer.alloc(src.w * src.h * 4), actual = Buffer.alloc(src.w * src.h * 4);
        let visible = 0;
        for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
            const si = ((src.y + y) * source.width + src.x + x) * 4;
            const at = (dst.y + y) * image.width + dst.x + x, ai = at * 4, local = (y * src.w + x) * 4;
            assert.strictEqual(covered[at], 0, `${name}: atlas crops cannot overlap`); covered[at] = 1;
            const opaque = source.data[si + 3] && !source.keys.has(source.data.subarray(si, si + 3).join(','));
            if (opaque) {
                source.data.copy(expected, local, si, si + 4); image.data.copy(actual, local, ai, ai + 4);
                assert(image.data.subarray(ai, ai + 4).equals(source.data.subarray(si, si + 4)),
                    `${name}: native pixel ${x},${y} changed color, opacity or position`);
                visible++;
            } else assert.strictEqual(image.data[ai + 3], 0, `${name}: only the documented sheet background becomes transparent`);
        }
        assert(visible >= (name === 'note' ? 5 : 100), `${name}: supplied sprite must remain visible`);
        assert.strictEqual(sha256(expected), frame.pixelSha256, `${name}: recorded native pixel hash`);
        assert.strictEqual(sha256(actual), frame.pixelSha256, `${name}: atlas native pixel hash`);
        visiblePixels += visible;
    }
    for (let i = 0; i < covered.length; i++) if (!covered[i]) assert.strictEqual(image.data[i * 4 + 3], 0, 'packing gutters stay transparent');
    console.log(`    13 source frames / ${visiblePixels.toLocaleString()} visible native pixels`);
});

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
function sourceDraws(record) { return record.calls.filter(call => call.method === 'drawImage' && call.args[0]?.src === atlas.file); }
function checkSourceDraw(call) {
    const [image, sx, sy, w, h, dx, dy, dw, dh] = call.args;
    const entry = Object.entries(atlas.frames).find(([, frame]) => {
        const rect = frame.atlasRect;
        return rect.x === sx && rect.y === sy && rect.w === w && rect.h === h;
    });
    assert(entry, 'every boss/projectile image must use a verified complete crop');
    assert(sx >= 0 && sy >= 0 && sx + w <= image.naturalWidth && sy + h <= image.naturalHeight);
    assert([dx, dy, dw, dh].every(Number.isFinite) && dw > 0 && dh > 0);
    assert.strictEqual(call.smoothing, false, 'native sprites must use nearest-neighbor display scaling');
    return entry[0];
}

test('runtime tables exactly match the native atlas and every boss/projectile animation is reachable', () => {
    const h = createGameHarness({ stage: 'z2_act3' }), g = h.game, art = h.sandbox.SanctuaryDuetArt, r = recorder(h);
    try {
        assert.strictEqual(art.source, atlas.file); assert(art.loaded && !art.failed);
        const expectedFrames = Object.fromEntries(Object.entries(atlas.frames).map(([name, frame]) => [name,
            { sx: frame.atlasRect.x, sy: frame.atlasRect.y, w: frame.atlasRect.w, h: frame.atlasRect.h }]));
        assert.deepStrictEqual(JSON.parse(JSON.stringify(art.frames)), expectedFrames);
        const b = g.terrain.boss, seen = new Set(), originalMembers = b.members.slice();
        b.active = true; b.state = 'battle'; b.effects.length = 0; b.projectiles.length = 0;
        for (const original of originalMembers) {
            const m = { ...original, flashTimer: 0, hp: 6 };
            b.members = [m];
            for (const state of ['guard', 'warn', 'attack', 'recover', 'open', 'hurt', 'defeated']) {
                m.state = state; m.hp = state === 'defeated' ? 0 : 6; m.defeatAge = 0;
                for (let clock = 0; clock < 150; clock += 3) {
                    b.age = g.terrain.clock = m.stateAge = clock;
                    const key = art.getBossFrame(m, clock);
                    assert(atlas.frames[key] && key.startsWith(m.id === 'crocodile' ? 'croc_' : 'craw_'));
                    r.clear(); const before = JSON.stringify(b); g.drawBossObj(r.ctx, b);
                    assert.strictEqual(JSON.stringify(b), before, 'rendering must not change the combat state');
                    for (const draw of sourceDraws(r)) seen.add(checkSourceDraw(draw));
                    if (state !== 'defeated') assert.strictEqual(sourceDraws(r).length, 1, 'each live boss must retain its source-sheet body');
                    assert.strictEqual(h.ctx.depth, 0);
                }
            }
        }
        b.members = originalMembers;
        for (const m of b.members) { m.state = 'guard'; m.hp = 6; m.flashTimer = 0; }
        for (const kind of ['note', 'claw']) for (let clock = 0; clock < 100; clock += 3) {
            const p = { kind, x: 1550, y: 500, age: clock, life: 100, spin: 1, vx: -4, vy: 0, returning: false };
            b.projectiles = [p]; b.age = g.terrain.clock = clock;
            const key = art.getProjectileFrame(p, clock);
            assert(atlas.frames[key] && key.startsWith(kind === 'note' ? 'note' : 'claw'));
            r.clear(); g.drawBossObj(r.ctx, b);
            const draws = sourceDraws(r);
            assert(draws.some(call => checkSourceDraw(call) === key), `${kind} must render from its supplied projectile sprite`);
            for (const draw of draws) seen.add(checkSourceDraw(draw));
            assert.strictEqual(h.ctx.depth, 0);
        }
        assert.deepStrictEqual([...seen].sort(), Object.keys(atlas.frames).sort(), 'every imported frame must be reachable in the real renderer');
    } finally { h.dispose(); }
});

test('missing and deferred boss images keep both hazards visible and recover to supplied sprites', () => {
    for (const mode of ['missing', 'deferred']) {
        const h = createGameHarness({ stage: 'z2_act3', deferImages: mode === 'deferred',
            failImages: mode === 'missing' ? [atlas.file] : [] }), g = h.game, r = recorder(h);
        try {
            const b = g.terrain.boss;
            b.active = true; b.state = 'battle';
            r.clear(); const before = JSON.stringify(b); g.drawBossObj(r.ctx, b);
            assert.strictEqual(JSON.stringify(b), before);
            assert.strictEqual(sourceDraws(r).length, 0);
            assert(r.calls.filter(call => call.method === 'fillText' && call.args[0] === '!').length >= 2,
                'both living bosses must remain visible as clear hazard markers until their supplied image loads');
            assert.strictEqual(h.ctx.depth, 0);
            if (mode === 'deferred') {
                h.flushImages(image => image.src === atlas.file);
                r.clear(); g.drawBossObj(r.ctx, b);
                assert.strictEqual(sourceDraws(r).length, 2);
                for (const draw of sourceDraws(r)) checkSourceDraw(draw);
                assert.strictEqual(h.ctx.depth, 0);
            }
        } finally { h.dispose(); }
    }
});

console.log(`Sanctuary Duet art: ${groups} groups passed without optional image dependencies.`);
