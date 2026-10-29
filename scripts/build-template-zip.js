#!/usr/bin/env node
'use strict';

/**
 * Builds the standalone downloadable Level Core Starter Kit:
 *   public/downloads/scar-level-core-template.zip
 *
 * Uses pure Node.js built-ins (`fs`, `path`, `zlib`) — zero external dependencies,
 * 100% cross-platform (Windows, Linux, macOS, Termux/Android).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'downloads');
const OUT_ZIP = path.join(OUT_DIR, 'scar-level-core-template.zip');

// CRC32 lookup table for standard PKZIP format
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
        const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
        const compressed = zlib.deflateRawSync(raw, { level: 9 });
        const useDeflate = compressed.length < raw.length;
        const payload = useDeflate ? compressed : raw;
        const method = useDeflate ? 8 : 0;
        const crc = crc32(raw);

        // Local file header (30 bytes + filename)
        const local = Buffer.alloc(30 + nameBuf.length);
        local.writeUInt32LE(0x04034b50, 0); // signature
        local.writeUInt16LE(20, 4);         // version needed (2.0)
        local.writeUInt16LE(0, 6);          // flags
        local.writeUInt16LE(method, 8);     // compression method
        local.writeUInt16LE(0, 10);         // mod time
        local.writeUInt16LE(0x595c, 12);    // mod date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        nameBuf.copy(local, 30);

        // Central directory header (46 bytes + filename)
        const central = Buffer.alloc(46 + nameBuf.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0x595c, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(entry.executable ? ((0o100755 << 16) >>> 0) : 0, 38);
        central.writeUInt32LE(offset, 42);
        nameBuf.copy(central, 46);

        localParts.push(local, payload);
        centralParts.push(central);
        offset += local.length + payload.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralBuf, eocd]);
}

// Transform `public/index.html` into the clean Blank Starter index.html
let indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
indexHtml = indexHtml.replace(
    '<title>Scar the Hedgerec</title>',
    '<title>Scar the Hedgerec — Level Core Starter</title>'
);
indexHtml = indexHtml.replace(
    '<audio id="bgm" src="assets/level1.mp3" loop autoplay preload="auto"></audio>',
    '<audio id="bgm" loop autoplay preload="auto"></audio>'
);
indexHtml = indexHtml.replace(
    /<script src="sonic-engine\.js"><\/script>[\s\S]*?<script>/,
    [
        '<script src="sonic-engine.js"></script>',
        '<script src="levels/level_template.js"></script>',
        '<script src="levels/boss_act_template.js"></script>',
        '<script>window.DEFAULT_STAGE = "template"; window.CAMPAIGN_STAGES = ["template", "boss_template"]; window.STAGE_ORDER = ["template", "boss_template", "test"];</script>',
        '<script>',
    ].join('\n')
);

const starterPkg = JSON.stringify({
    name: 'scar-level-core-starter',
    version: '1.1.0',
    description: 'Scar the Hedgerec — Standalone 3-Act Level Core Foundation Starter Kit (with Title Cards & Classic Lives)',
    main: 'server.js',
    scripts: {
        start: 'node server.js',
        'start:open': 'node server.js --open',
        termux: 'node server.js --open',
    },
    license: 'ISC',
}, null, 2) + '\n';

const prefix = 'scar-level-core-template/';
const entries = [
    { name: prefix + 'LEVEL_CORE_BLUEPRINT.md', data: fs.readFileSync(path.join(ROOT, 'templates', 'LEVEL_CORE_BLUEPRINT.md')) },
    { name: prefix + 'README.md',               data: fs.readFileSync(path.join(ROOT, 'templates', 'LEVEL_CORE_BLUEPRINT.md')) },
    { name: prefix + 'package.json',            data: starterPkg },
    { name: prefix + 'server.js',               data: fs.readFileSync(path.join(ROOT, 'server.js')) },
    { name: prefix + 'scar.bat',                data: fs.readFileSync(path.join(ROOT, 'scar.bat')) },
    { name: prefix + 'start-windows.bat',       data: fs.readFileSync(path.join(ROOT, 'start-windows.bat')) },
    { name: prefix + 'start-linux-mac.sh',      data: fs.readFileSync(path.join(ROOT, 'start-linux-mac.sh')), executable: true },
    { name: prefix + 'start-termux.sh',         data: fs.readFileSync(path.join(ROOT, 'start-termux.sh')), executable: true },
    { name: prefix + 'public/index.html',       data: indexHtml },
    { name: prefix + 'public/sonic-engine.js',  data: fs.readFileSync(path.join(ROOT, 'public', 'sonic-engine.js')) },
    { name: prefix + 'public/levels/level_template.js',    data: fs.readFileSync(path.join(ROOT, 'templates', 'level_template.js')) },
    { name: prefix + 'public/levels/boss_act_template.js', data: fs.readFileSync(path.join(ROOT, 'templates', 'boss_act_template.js')) },
    { name: prefix + 'public/assets/scar_sheet.png',       data: fs.readFileSync(path.join(ROOT, 'public', 'assets', 'scar_sheet.png')) },
    { name: prefix + 'public/assets/common_objects.png',   data: fs.readFileSync(path.join(ROOT, 'public', 'assets', 'common_objects.png')) },
    { name: prefix + 'public/assets/jump.wav',             data: fs.readFileSync(path.join(ROOT, 'public', 'assets', 'jump.wav')) },
    { name: prefix + 'public/assets/rings.wav',            data: fs.readFileSync(path.join(ROOT, 'public', 'assets', 'rings.wav')) },
    { name: prefix + 'public/assets/goalpost.wav',         data: fs.readFileSync(path.join(ROOT, 'public', 'assets', 'goalpost.wav')) },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
const zipBuf = buildZipBuffer(entries);
fs.writeFileSync(OUT_ZIP, zipBuf);

// Also copy individual template files into `public/downloads/` for single-file download
fs.copyFileSync(
    path.join(ROOT, 'templates', 'level_template.js'),
    path.join(OUT_DIR, 'level_template.js')
);
fs.copyFileSync(
    path.join(ROOT, 'templates', 'boss_act_template.js'),
    path.join(OUT_DIR, 'boss_act_template.js')
);
fs.copyFileSync(
    path.join(ROOT, 'templates', 'LEVEL_CORE_BLUEPRINT.md'),
    path.join(OUT_DIR, 'LEVEL_CORE_BLUEPRINT.md')
);

console.log(`Built ${OUT_ZIP} (${(zipBuf.length / 1024).toFixed(1)} KB, ${entries.length} files)`);
