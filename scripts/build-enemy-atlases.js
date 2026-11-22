#!/usr/bin/env node
'use strict';
/** Pack the supplied sprite pixels without resampling, recoloring or drawing.
 * Source rectangles and display geometry live in the checked-in manifest.
 * Requires the development dependency `sharp` only when rebuilding assets.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

async function buildEnemyAtlases(rootDir = ROOT) {
    const sharp = require('sharp');
    const manifestPath = path.join(rootDir, 'public/assets/enemy_sources/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const decoded = {};
    for (const [name, source] of Object.entries(manifest.sources)) {
        const bytes = fs.readFileSync(path.join(rootDir, 'public', source.file));
        if (sha256(bytes) !== source.sha256) throw new Error(`Supplied source changed: ${name}`);
        const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (info.width !== source.width || info.height !== source.height) throw new Error(`Source dimensions changed: ${name}`);
        decoded[name] = { data, width: info.width, height: info.height,
            keys: new Set(source.transparentColors.map(rgb => rgb.join(','))) };
    }
    for (const atlas of Object.values(manifest.atlases)) {
        let cursor = 2, height = 0;
        const pieces = [];
        for (const [name, frame] of Object.entries(atlas.frames)) {
            const source = decoded[frame.source], rect = frame.sourceRect;
            if (!source || !Object.values(rect).every(Number.isSafeInteger) || rect.x < 0 || rect.y < 0
                || rect.w <= 0 || rect.h <= 0 || rect.x + rect.w > source.width || rect.y + rect.h > source.height) {
                throw new Error(`Invalid supplied sprite rectangle: ${name}`);
            }
            const data = Buffer.alloc(rect.w * rect.h * 4);
            for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
                const i = ((rect.y + y) * source.width + rect.x + x) * 4;
                const j = (y * rect.w + x) * 4;
                if (source.data[i + 3] && !source.keys.has(`${source.data[i]},${source.data[i + 1]},${source.data[i + 2]}`)) {
                    source.data.copy(data, j, i, i + 4);
                }
            }
            frame.atlasRect = { x: cursor, y: 2, w: rect.w, h: rect.h };
            frame.pixelSha256 = sha256(data);
            pieces.push({ frame, data });
            cursor += rect.w + 4; height = Math.max(height, rect.h + 4);
        }
        const width = cursor - 2, pixels = Buffer.alloc(width * height * 4);
        for (const { frame, data } of pieces) {
            const rect = frame.atlasRect;
            for (let y = 0; y < rect.h; y++) {
                data.copy(pixels, ((rect.y + y) * width + rect.x) * 4, y * rect.w * 4, (y + 1) * rect.w * 4);
            }
        }
        atlas.width = width; atlas.height = height;
        const filename = path.join(rootDir, 'public', atlas.file);
        await sharp(pixels, { raw: { width, height, channels: 4 } }).png({ palette: false, compressionLevel: 9 }).toFile(filename);
        console.log(`Built ${atlas.file}: ${width}x${height}, ${pieces.length} native crops`);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}
if (require.main === module) buildEnemyAtlases().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildEnemyAtlases };
