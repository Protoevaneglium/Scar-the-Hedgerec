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
const TEXT_EXTENSIONS = new Set(['.bat', '.cmd', '.ps1', '.sh', '.js', '.css', '.html', '.json', '.md', '.txt', '.svg', '.xml', '.csv', '.yaml', '.yml']);
const WINDOWS_EXTENSIONS = new Set(['.bat', '.cmd', '.ps1']);

// Git checkout settings must not affect the downloadable archive. Do not decode
// binary assets: their bytes (including any CR/LF sequences) must stay intact.
function canonicalEntryData(name, data) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const extension = path.extname(name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) return raw;
    let text = raw.toString('utf8').replace(/\r\n?/g, '\n');
    if (WINDOWS_EXTENSIONS.has(extension)) text = text.replace(/\n/g, '\r\n');
    return Buffer.from(text, 'utf8');
}

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
        const raw = canonicalEntryData(entry.name, entry.data);
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
        central.writeUInt16LE((3 << 8) | 20, 4); // Unix creator: honor executable mode on shell launchers.
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
        central.writeUInt32LE(((entry.executable ? 0o100755 : 0o100644) << 16) >>> 0, 38);
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

function buildStarter(rootDir = ROOT) {
const OUT_DIR = path.join(rootDir, 'public', 'downloads');
const OUT_ZIP = path.join(OUT_DIR, 'scar-level-core-template.zip');

// Transform `public/index.html` into the clean Blank Starter index.html
let indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
indexHtml = indexHtml.replace(
    '<title>Scar the Hedgerec</title>',
    '<title>Scar the Hedgerec — Level Core Starter</title>'
);
indexHtml = indexHtml.replace(
    /<audio id="bgm"[^>]*><\/audio>/,
    '<audio id="bgm" loop preload="auto"></audio>'
);
// The reusable starter boots directly into its blank act. Its package does not
// ship the campaign's cinematic, title art, or soundtrack.
indexHtml = indexHtml.replace(/<div id="intro">[\s\S]*?<\/div>\s*/, '');
indexHtml = indexHtml.replace(
    /<script src="sonic-engine\.js"><\/script>[\s\S]*?<script>/,
    [
        '<script src="sonic-engine.js"></script>',
        '<script src="js/modern-hud.js"></script>',
        '<script src="js/android-host.js"></script>',
        '<script src="js/sprite-model-data.js"></script>',
        '<script src="js/sprite-models.js"></script>',
        '<script src="js/rosie-art.js"></script>',
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
    { name: prefix + 'LEVEL_CORE_BLUEPRINT.md', data: fs.readFileSync(path.join(rootDir, 'templates', 'LEVEL_CORE_BLUEPRINT.md')) },
    { name: prefix + 'README.md',               data: fs.readFileSync(path.join(rootDir, 'templates', 'LEVEL_CORE_BLUEPRINT.md')) },
    { name: prefix + 'package.json',            data: starterPkg },
    { name: prefix + 'server.js',               data: fs.readFileSync(path.join(rootDir, 'server.js')) },
    { name: prefix + 'install-windows.bat',     data: fs.readFileSync(path.join(rootDir, 'install-windows.bat')) },
    { name: prefix + 'install-windows.ps1',     data: fs.readFileSync(path.join(rootDir, 'install-windows.ps1')) },
    { name: prefix + 'scar.bat',                data: fs.readFileSync(path.join(rootDir, 'scar.bat')) },
    { name: prefix + 'start-windows.bat',       data: fs.readFileSync(path.join(rootDir, 'start-windows.bat')) },
    { name: prefix + 'install-linux.sh',        data: fs.readFileSync(path.join(rootDir, 'install-linux.sh')), executable: true },
    { name: prefix + 'scar.sh',                 data: fs.readFileSync(path.join(rootDir, 'scar.sh')), executable: true },
    { name: prefix + 'start-linux-mac.sh',      data: fs.readFileSync(path.join(rootDir, 'start-linux-mac.sh')), executable: true },
    { name: prefix + 'install-termux.sh',       data: fs.readFileSync(path.join(rootDir, 'install-termux.sh')), executable: true },
    { name: prefix + 'start-termux.sh',         data: fs.readFileSync(path.join(rootDir, 'start-termux.sh')), executable: true },
    { name: prefix + 'public/index.html',       data: indexHtml },
    { name: prefix + 'public/sonic-engine.js',  data: fs.readFileSync(path.join(rootDir, 'public', 'sonic-engine.js')) },
    { name: prefix + 'public/css/game-ui.css',  data: fs.readFileSync(path.join(rootDir, 'public', 'css', 'game-ui.css')) },
    { name: prefix + 'public/js/modern-hud.js',  data: fs.readFileSync(path.join(rootDir, 'public', 'js', 'modern-hud.js')) },
    { name: prefix + 'public/js/android-host.js', data: fs.readFileSync(path.join(rootDir, 'public', 'js', 'android-host.js')) },
    { name: prefix + 'public/js/sprite-model-data.js', data: fs.readFileSync(path.join(rootDir, 'public', 'js', 'sprite-model-data.js')) },
    { name: prefix + 'public/js/sprite-models.js', data: fs.readFileSync(path.join(rootDir, 'public', 'js', 'sprite-models.js')) },
    { name: prefix + 'public/levels/level_template.js',    data: fs.readFileSync(path.join(rootDir, 'templates', 'level_template.js')) },
    { name: prefix + 'public/levels/boss_act_template.js', data: fs.readFileSync(path.join(rootDir, 'templates', 'boss_act_template.js')) },
    { name: prefix + 'public/js/rosie-art.js',             data: fs.readFileSync(path.join(rootDir, 'public', 'levels', 'rosie.js')) },
    { name: prefix + 'public/assets/rosie.png',             data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'rosie.png')) },
    { name: prefix + 'public/assets/scar_sheet.png',       data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'scar_sheet.png')) },
    { name: prefix + 'public/assets/common_objects.png',   data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'common_objects.png')) },
    { name: prefix + 'public/assets/animals.png',          data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'animals.png')) },
    { name: prefix + 'public/assets/animals.txt',          data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'animals.txt')) },
    { name: prefix + 'public/assets/palmtree_objects.png', data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'palmtree_objects.png')) },
    { name: prefix + 'public/assets/palmtree_map.png',     data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'palmtree_map.png')) },
    { name: prefix + 'public/assets/enemies.png',          data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'enemies.png')) },
    { name: prefix + 'public/assets/enemies_act2.png',      data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'enemies_act2.png')) },
    { name: prefix + 'public/assets/jump.wav',             data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'jump.wav')) },
    { name: prefix + 'public/assets/rings.wav',            data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'rings.wav')) },
    { name: prefix + 'public/assets/goalpost.wav',         data: fs.readFileSync(path.join(rootDir, 'public', 'assets', 'goalpost.wav')) },
];

function includeAssets(relativeDir) {
    const files = fs.readdirSync(path.join(rootDir, 'public', relativeDir), { withFileTypes: true });
    files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of files) {
        const relative = relativeDir + '/' + entry.name;
        if (entry.isDirectory()) includeAssets(relative);
        else entries.push({ name: prefix + 'public/' + relative, data: fs.readFileSync(path.join(rootDir, 'public', relative)) });
    }
}
includeAssets('assets/ui');
includeAssets('assets/sfx');
includeAssets('assets/enemy_sources');
includeAssets('assets/models');

fs.mkdirSync(OUT_DIR, { recursive: true });
const zipBuf = buildZipBuffer(entries);
fs.writeFileSync(OUT_ZIP, zipBuf);

// Single-file downloads use the same canonical bytes as their ZIP entries.
for (const name of ['level_template.js', 'boss_act_template.js', 'LEVEL_CORE_BLUEPRINT.md']) {
    fs.writeFileSync(path.join(OUT_DIR, name), canonicalEntryData(name,
        fs.readFileSync(path.join(rootDir, 'templates', name))));
}

return { zipPath: OUT_ZIP, zipBuffer: zipBuf, entryCount: entries.length };
}

if (require.main === module) {
    const result = buildStarter();
    console.log(`Built ${result.zipPath} (${(result.zipBuffer.length / 1024).toFixed(1)} KB, ${result.entryCount} files)`);
}

module.exports = { buildStarter };
