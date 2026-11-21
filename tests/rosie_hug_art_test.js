/** The supplied arms-forward pose must stay planted and layer over Scar correctly. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../public/levels/rosie.js'), 'utf8');
const png = fs.readFileSync(path.join(__dirname, '../public/assets/rosie.png'));
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);

function context() {
    const calls = [], stack = [];
    let state = { sx: 1, sy: 1, tx: 0, ty: 0, smoothing: true, fill: '#000' };
    const ctx = {
        calls, throwDraw: false,
        get depth() { return stack.length; },
        get transform() { return { ...state }; },
        get imageSmoothingEnabled() { return state.smoothing; },
        set imageSmoothingEnabled(value) { state.smoothing = value; },
        get fillStyle() { return state.fill; },
        set fillStyle(value) { state.fill = value; },
        save() { stack.push({ ...state }); },
        restore() { assert(stack.length, 'restore may not underflow'); state = stack.pop(); },
        translate(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); state.tx += state.sx * x; state.ty += state.sy * y; },
        scale(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); state.sx *= x; state.sy *= y; },
        fillRect(...args) { assert(args.every(Number.isFinite)); calls.push({ type: 'fill', args, state: { ...state } }); },
        drawImage(image, ...args) {
            if (ctx.throwDraw) throw new Error('fixture draw failure');
            assert(args.every(Number.isFinite));
            if (args.length === 8) {
                const [x, y, w, h] = args;
                assert(x >= 0 && y >= 0 && w > 0 && h > 0);
                assert(x + w <= image.width && y + h <= image.height, 'sprite crop must stay inside the supplied atlas');
            }
            calls.push({ type: 'image', image, args, state: { ...state } });
        },
    };
    return ctx;
}

function fixture(mode = 'loaded') {
    const pixels = { data: new Uint8ClampedArray([4, 20, 83, 255, 6, 44, 128, 255, 240, 100, 180, 255]) };
    const atlasCtx = context();
    atlasCtx.getImageData = () => { if (mode === 'tainted') throw new Error('fixture inaccessible pixels'); return pixels; };
    atlasCtx.putImageData = () => {};
    const atlas = { width, height, getContext: () => atlasCtx };
    class ImageStub {
        set src(value) {
            assert.strictEqual(value, 'assets/rosie.png');
            this.naturalWidth = width; this.naturalHeight = height;
            if (mode === 'missing') this.onerror();
            else if (mode !== 'pending') this.onload();
        }
    }
    const sandbox = { document: { createElement: name => { assert.strictEqual(name, 'canvas'); return atlas; } } };
    if (mode !== 'headless') sandbox.Image = ImageStub;
    sandbox.window = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'rosie.js' });
    return { art: sandbox.RosieArt, pixels, atlas };
}

console.log('\nRosie hug sprite and foreground arm');
const { art, pixels, atlas } = fixture();
assert(art.loaded && !art.failed);
assert.deepStrictEqual([...pixels.data], [4, 20, 83, 0, 6, 44, 128, 0, 240, 100, 180, 255],
    'the existing navy key must preserve the supplied character colors');
const hug = art.frames.hug[0];
assert.deepStrictEqual(JSON.parse(JSON.stringify(hug)), { x: 293, y: 149, w: 25, h: 37, anchorX: 13, anchorY: 37 });
assert(Object.isFrozen(hug) && Object.isFrozen(art.frames.hug));
for (const clock of [0, 7, 14, 234, 240, 10000, NaN, Infinity, -1]) {
    assert.strictEqual(art.getFrame('hug', clock), hug, 'an embrace must hold its pose rather than play a walk or idle blink');
}
assert.strictEqual(art.getFrame('idle', 0), art.frames.idle[0]);
assert.strictEqual(art.getFrame('idle', 234), art.frames.blink[0]);
assert.strictEqual(new Set([0, 7, 14].map(clock => art.getFrame('walk', clock))).size, 3);
for (const frames of Object.values(art.frames)) for (const frame of frames) {
    assert(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= width && frame.y + frame.h <= height);
    assert(frame.anchorX >= 0 && frame.anchorX <= frame.w && frame.anchorY === frame.h,
        'body and sole anchors must stay inside each supplied sprite');
}

for (const facing of [-1, 1]) {
    const ctx = context(), before = ctx.transform;
    const pose = { state: 'hug', facing, animationClock: 234 };
    assert(art.draw(ctx, 100.4, 560.4, 900, pose));
    assert.strictEqual(ctx.depth, 0); assert.deepStrictEqual(ctx.transform, before);
    const body = ctx.calls[0];
    assert.strictEqual(body.image, atlas);
    assert.deepStrictEqual(body.args, [293, 149, 25, 37, -13, -37, 25, 37]);
    assert.deepStrictEqual(body.state, { sx: facing * 1.2, sy: 1.2, tx: 100, ty: 560, smoothing: false, fill: '#000' });
    ctx.calls.length = 0;
    assert(art.drawHugArm(ctx, 100.4, 560.4, pose));
    assert.strictEqual(ctx.depth, 0); assert.deepStrictEqual(ctx.transform, before);
    assert.strictEqual(ctx.calls.length, 1, 'the foreground pass must not redraw the body or any extra decoration');
    const arm = ctx.calls[0];
    assert.strictEqual(arm.image, body.image);
    assert.deepStrictEqual(arm.args, [311, 166, 7, 6, 5, -20, 7, 6]);
    assert.deepStrictEqual(arm.state, body.state, 'both layers must share their rounded position, scale and facing');
    assert.strictEqual(arm.args[4] - body.args[4], arm.args[0] - body.args[0]);
    assert.strictEqual(arm.args[5] - body.args[5], arm.args[1] - body.args[1]);
    assert.strictEqual(body.args[5] + body.args[7], 0, 'the held frame must stay on its sole plane');
    ctx.throwDraw = true;
    assert.throws(() => art.drawHugArm(ctx, 100, 560, pose), /fixture draw failure/);
    assert.strictEqual(ctx.depth, 0); assert.deepStrictEqual(ctx.transform, before,
        'a failed foreground draw may not leak transforms into later layers');
}

for (const mode of ['loaded', 'pending', 'missing', 'tainted', 'headless']) {
    const { art: current } = fixture(mode);
    for (const pose of [{ state: 'idle' }, { state: 'walk' }, { state: 'hop' }, null, true, undefined]) {
        const ctx = context(), before = ctx.transform;
        assert.strictEqual(current.drawHugArm(ctx, 100, 560, pose), false);
        assert.strictEqual(ctx.calls.length, 0, 'the arm overlay must disappear immediately outside a hug');
        assert.strictEqual(ctx.depth, 0); assert.deepStrictEqual(ctx.transform, before);
    }
    if (mode === 'loaded') continue;
    assert(!current.loaded);
    assert.strictEqual(current.failed, mode === 'missing' || mode === 'tainted');
    for (const facing of [-1, 1]) {
        const ctx = context(), before = ctx.transform;
        const pose = { state: 'hug', facing };
        assert.strictEqual(current.draw(ctx, 100, 560, 0, pose), false);
        const bodyFills = ctx.calls.slice();
        assert(bodyFills.some(call => call.args.join(',') === '0,-21,8,4'), 'fallback arms must reach forward during a hug');
        ctx.calls.length = 0;
        assert.strictEqual(current.drawHugArm(ctx, 100, 560, pose), false);
        assert.strictEqual(ctx.calls.length, 2, 'an unavailable atlas must draw only the fallback glove in front');
        for (const glove of ctx.calls) {
            assert.strictEqual(glove.type, 'fill');
            assert(glove.args[0] > 0, 'the right-facing source glove must extend forward');
            assert.strictEqual(glove.state.sx, facing);
            assert(bodyFills.some(call => JSON.stringify(call) === JSON.stringify(glove)),
                'the fallback foreground glove must exactly align with its body layer');
        }
        assert.strictEqual(ctx.depth, 0); assert.deepStrictEqual(ctx.transform, before);
    }
}
console.log('  ✓ held original pose, planted anchors, mirrored glove alignment, safe layering, and missing-atlas fallbacks');
