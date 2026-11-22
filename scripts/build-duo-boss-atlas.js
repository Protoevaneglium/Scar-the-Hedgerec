#!/usr/bin/env node
'use strict';
// Development-only packing: preserve supplied source RGBA, removing background keys.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function buildDuoBossAtlas(root = path.resolve(__dirname, '..')) {
    const sharp = require('sharp');
    const file = path.join(root, 'public/assets/duo_boss_sources/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')), sources = {};
    for (const [id, source] of Object.entries(manifest.sources)) {
        const bytes = fs.readFileSync(path.join(root, 'public', source.file));
        if (hash(bytes) !== source.sha256) throw new Error(`Supplied original changed: ${id}`);
        const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (info.width !== source.width || info.height !== source.height) throw new Error(`Source dimensions changed: ${id}`);
        sources[id] = { data, width: info.width, height: info.height,
            keys: new Set(source.transparentColors.map(rgb => rgb.join(','))) };
    }
    const atlas = manifest.atlases.duo, pieces = [];
    let cursor = 2, height = 0;
    for (const [key, frame] of Object.entries(atlas.frames)) {
        const source = sources[frame.source], r = frame.sourceRect;
        if (!source || !['x', 'y', 'w', 'h'].every(k => Number.isSafeInteger(r[k])) || r.x < 0 || r.y < 0
            || r.w <= 0 || r.h <= 0 || r.x + r.w > source.width || r.y + r.h > source.height) throw new Error(`Invalid source crop: ${key}`);
        const data = Buffer.alloc(r.w * r.h * 4);
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
            const i = ((r.y + y) * source.width + r.x + x) * 4;
            if (source.data[i + 3] && !source.keys.has(`${source.data[i]},${source.data[i + 1]},${source.data[i + 2]}`)) {
                source.data.copy(data, (y * r.w + x) * 4, i, i + 4);
            }
        }
        frame.atlasRect = { x: cursor, y: 2, w: r.w, h: r.h };
        frame.pixelSha256 = hash(data); pieces.push({ frame, data });
        cursor += r.w + 4; height = Math.max(height, r.h + 4);
    }
    const width = cursor - 2, pixels = Buffer.alloc(width * height * 4);
    for (const { frame, data } of pieces) {
        const r = frame.atlasRect;
        for (let y = 0; y < r.h; y++) data.copy(pixels, ((r.y + y) * width + r.x) * 4, y * r.w * 4, (y + 1) * r.w * 4);
    }
    atlas.width = width; atlas.height = height;
    await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ palette: false, compressionLevel: 9 })
        .toFile(path.join(root, 'public', atlas.file));
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Built ${atlas.file}: ${width}x${height}, ${pieces.length} native supplied crops`);
    return manifest;
}
if (require.main === module) buildDuoBossAtlas().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildDuoBossAtlas };
