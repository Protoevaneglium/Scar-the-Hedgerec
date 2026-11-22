/** Every packed enemy pixel must come directly from an owner-provided sheet.
 * Uses only Node built-ins, independently of Sharp used by the asset builder.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decodePng } = require('./helpers/png_pixels');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/enemy_sources/manifest.json'), 'utf8'));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
// These identify the supplied originals, including their complete credit headers.
const supplied = {
    sonic1: { bytes: 151310, width: 1430, height: 1087,
        sha256: '65c58b678821393d54f8fba867527abb180db3e4057604a548fa5d6d2dcb6324',
        colors: [[37, 102, 26], [13, 72, 7]] },
    sonic2: { bytes: 99718, width: 1036, height: 1240,
        sha256: '19dd81211d64a041e573667c48cd0468ae8a803241e6ff47a11642984f708ae7',
        colors: [[65, 169, 184], [16, 112, 132], [153, 217, 234]] },
};
assert.strictEqual(manifest.schema, 1);
// Slicer's fourth pose includes its detached blade to the left of the torso.
// Pin the audited bounds independently so a rebuild cannot approve a partial crop.
assert.deepStrictEqual(manifest.atlases.act2.frames.slicer_4.sourceRect,
    { x: 534, y: 633, w: 47, h: 32 }, 'Slicer attack crop must retain the complete blade and body');
assert.deepStrictEqual(Object.keys(manifest.sources).sort(), Object.keys(supplied).sort());
const sources = {};
for (const [name, expected] of Object.entries(supplied)) {
    const entry = manifest.sources[name], buffer = fs.readFileSync(path.join(root, 'public', entry.file));
    assert.strictEqual(buffer.length, expected.bytes, `${name}: original file bytes`);
    assert.strictEqual(sha256(buffer), expected.sha256, `${name}: preserve the entire supplied sheet verbatim`);
    assert.strictEqual(entry.sha256, expected.sha256);
    assert.deepStrictEqual(entry.transparentColors, expected.colors, `${name}: only documented sheet colors may be keyed`);
    const image = decodePng(buffer);
    assert.strictEqual(image.width, expected.width); assert.strictEqual(image.height, expected.height);
    assert.strictEqual(entry.width, image.width); assert.strictEqual(entry.height, image.height);
    sources[name] = { ...image, keys: new Set(expected.colors.map(rgb => rgb.join(','))) };
}
function rectangle(rect, image, label) {
    for (const key of ['x', 'y', 'w', 'h']) assert(Number.isSafeInteger(rect[key]), `${label}: integer ${key}`);
    assert(rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
        && rect.x + rect.w <= image.width && rect.y + rect.h <= image.height, `${label}: in bounds`);
}
console.log('\nSupplied enemy sprite pixel provenance');
let frames = 0, visiblePixels = 0;
for (const [kind, atlas] of Object.entries(manifest.atlases)) {
    const image = decodePng(fs.readFileSync(path.join(root, 'public', atlas.file)));
    assert.strictEqual(image.width, atlas.width); assert.strictEqual(image.height, atlas.height);
    assert.strictEqual(Object.keys(atlas.frames).length, kind === 'base' ? 31 : 46);
    const covered = new Uint8Array(image.width * image.height);
    for (const [name, frame] of Object.entries(atlas.frames)) {
        const source = sources[frame.source], src = frame.sourceRect, dst = frame.atlasRect;
        assert(source, `${name}: known supplied source`);
        rectangle(src, source, `${name} source`); rectangle(dst, image, `${name} atlas`);
        assert.strictEqual(dst.w, src.w, `${name}: native width may not be resampled`);
        assert.strictEqual(dst.h, src.h, `${name}: native height may not be resampled`);
        assert(frame.display.w > 0 && frame.display.h > 0 && frame.display.ax > 0 && frame.display.ax <= frame.display.w
            && frame.display.ay > 0 && frame.display.ay <= frame.display.h, `${name}: valid legacy display geometry`);
        const expected = Buffer.alloc(src.w * src.h * 4), actual = Buffer.alloc(src.w * src.h * 4);
        let visible = 0;
        for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
            const si = ((src.y + y) * source.width + src.x + x) * 4;
            const at = (dst.y + y) * image.width + dst.x + x, ai = at * 4, local = (y * src.w + x) * 4;
            assert.strictEqual(covered[at], 0, `${name}: atlas rectangles may not overlap`); covered[at] = 1;
            const key = `${source.data[si]},${source.data[si + 1]},${source.data[si + 2]}`;
            const opaque = source.data[si + 3] && !source.keys.has(key);
            if (opaque) {
                source.data.copy(expected, local, si, si + 4);
                assert(image.data.subarray(ai, ai + 4).equals(source.data.subarray(si, si + 4)),
                    `${name}: native pixel (${x},${y}) changed color, opacity or position`);
                image.data.copy(actual, local, ai, ai + 4); visible++;
            } else {
                assert.strictEqual(image.data[ai + 3], 0, `${name}: source background must be transparent`);
            }
        }
        assert(visible >= 100, `${name}: a real supplied body must remain visible`);
        assert.strictEqual(sha256(expected), frame.pixelSha256, `${name}: recorded native pixel hash`);
        assert.strictEqual(sha256(actual), frame.pixelSha256, `${name}: packed visible pixels match the native source`);
        frames++; visiblePixels += visible;
    }
    for (let i = 0; i < covered.length; i++) if (!covered[i]) {
        assert.strictEqual(image.data[i * 4 + 3], 0, 'atlas packing gutters must stay transparent');
    }
    console.log(`  PASS ${kind}: ${Object.keys(atlas.frames).length} native frames, exact source RGBA with background key only`);
}
assert.strictEqual(frames, 77);
console.log(`Enemy provenance: ${frames} frames / ${visiblePixels.toLocaleString()} visible pixels verified without image dependencies.`);
