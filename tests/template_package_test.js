'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { buildStarter } = require('../scripts/build-template-zip');
const root = path.join(__dirname, '..');

function readEntries(zip) {
    const entries = new Map();
    let cursor = zip.readUInt32LE(zip.length - 6);
    const count = zip.readUInt16LE(zip.length - 12);
    for (let i = 0; i < count; i++) {
        assert.strictEqual(zip.readUInt32LE(cursor), 0x02014b50);
        const nameLength = zip.readUInt16LE(cursor + 28);
        const extraLength = zip.readUInt16LE(cursor + 30);
        const commentLength = zip.readUInt16LE(cursor + 32);
        const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength).replace('scar-level-core-template/', '');
        const offset = zip.readUInt32LE(cursor + 42), size = zip.readUInt32LE(cursor + 20);
        const dataStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
        const payload = zip.subarray(dataStart, dataStart + size);
        assert(!entries.has(name), `duplicate starter entry ${name}`);
        entries.set(name, {
            data: zip.readUInt16LE(cursor + 10) === 8 ? zlib.inflateRawSync(payload) : payload,
            host: zip.readUInt16LE(cursor + 4) >> 8, mode: zip.readUInt32LE(cursor + 38) >>> 16,
        });
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

const isText = name => /\.(?:bat|cmd|ps1|sh|js|css|html|json|md|txt|svg|xml|csv|yaml|yml)$/i.test(name);
const isWindows = name => /\.(?:bat|cmd|ps1)$/i.test(name);
function sourceBytes(name, data) {
    if (!isText(name)) return data;
    const lf = data.toString('utf8').replace(/\r\n?/g, '\n');
    return Buffer.from(isWindows(name) ? lf.replace(/\n/g, '\r\n') : lf);
}
function assertCanonical(name, data) {
    if (!isText(name)) return;
    const text = data.toString('utf8');
    if (isWindows(name)) {
        assert(!/(^|[^\r])\n|\r(?!\n)/.test(text), `${name} must use CRLF exclusively`);
    } else {
        assert(!text.includes('\r'), `${name} must use LF exclusively`);
    }
}

const entries = readEntries(fs.readFileSync(path.join(root, 'public/downloads/scar-level-core-template.zip')));
console.log('\nDownloadable starter integrity');
for (const required of ['server.js', 'public/sonic-engine.js', 'public/css/game-ui.css', 'public/js/modern-hud.js',
    'public/assets/palmtree_objects.png', 'public/assets/animals.png', 'public/assets/enemies.png']) {
    assert(entries.has(required), `starter must include ${required}`);
}
// Compare every copied payload to current source, allowing only its intended EOL
// transformation. A content edit still requires rebuilding the checked-in ZIP.
for (const [name, file] of entries) {
    assertCanonical(name, file.data);
    if (name === 'public/index.html' || name === 'package.json') continue;
    let source = name;
    if (name === 'README.md' || name === 'LEVEL_CORE_BLUEPRINT.md') source = 'templates/LEVEL_CORE_BLUEPRINT.md';
    if (name.startsWith('public/levels/')) source = 'templates/' + path.basename(name);
    assert(file.data.equals(sourceBytes(name, fs.readFileSync(path.join(root, source)))),
        `rebuild the starter after changing ${source}`);
}
for (const name of ['scar.sh', 'start-termux.sh', 'start-linux-mac.sh', 'install-linux.sh', 'install-termux.sh']) {
    const file = entries.get(name);
    assert(file && file.host === 3 && (file.mode & 0o111) === 0o111, `${name} must be executable when unzipped on Unix`);
}
for (const name of ['level_template.js', 'boss_act_template.js', 'LEVEL_CORE_BLUEPRINT.md']) {
    const downloaded = fs.readFileSync(path.join(root, 'public/downloads', name));
    const archived = entries.get(name.endsWith('.js') ? 'public/levels/' + name : name).data;
    assert(downloaded.equals(archived), `${name} single-file download must match the ZIP`);
    assertCanonical(name, downloaded);
}
const html = entries.get('public/index.html').data.toString();
for (const match of html.matchAll(/<script src="([^"]+)"/g)) assert(entries.has('public/' + match[1]), `missing starter script ${match[1]}`);
for (const match of html.matchAll(/\w+: '(assets\/(?:sfx\/)?[^']+\.wav)'/g)) {
    assert(entries.has('public/' + match[1]), `missing starter sound ${match[1]}`);
}
assert(!html.includes('<div id="intro">'), 'the blank starter must not depend on the campaign cinematic');
assert(html.includes('window.DEFAULT_STAGE = "template"'));

// Exercise the real complete builder with isolated checkouts. File creation
// order and all text line endings differ; binary inputs stay byte-for-byte equal.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-template-eol-'));
const inputs = ['templates/LEVEL_CORE_BLUEPRINT.md', 'templates/level_template.js', 'templates/boss_act_template.js',
    'server.js', 'install-windows.bat', 'install-windows.ps1', 'scar.bat', 'start-windows.bat',
    'install-linux.sh', 'scar.sh', 'start-linux-mac.sh', 'install-termux.sh', 'start-termux.sh',
    'public/index.html', 'public/sonic-engine.js', 'public/css/game-ui.css', 'public/js/modern-hud.js',
    'public/assets/scar_sheet.png', 'public/assets/common_objects.png', 'public/assets/animals.png',
    'public/assets/animals.txt', 'public/assets/palmtree_objects.png', 'public/assets/palmtree_map.png',
    'public/assets/enemies.png', 'public/assets/jump.wav', 'public/assets/rings.wav', 'public/assets/goalpost.wav',
    'public/assets/ui', 'public/assets/sfx'];
const binary = Buffer.from([0, 13, 10, 255, 128, 10, 13, 0]);
const extras = ['public/assets/ui/eol-fixture.cmd', 'public/assets/ui/eol-fixture.bin'];
function copyInput(relative, destination, crlf) {
    const source = path.join(root, relative), target = path.join(destination, relative);
    if (fs.statSync(source).isDirectory()) {
        const names = fs.readdirSync(source).sort();
        if (crlf) names.reverse();
        for (const name of names) copyInput(relative + '/' + name, destination, crlf);
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let data = fs.readFileSync(source);
    if (isText(relative)) {
        const text = data.toString('utf8').replace(/\r\n?/g, '\n');
        data = Buffer.from(crlf ? text.replace(/\n/g, '\r\n') : text);
    }
    fs.writeFileSync(target, data);
}
try {
    const builds = [];
    for (const crlf of [false, true]) {
        const destination = path.join(fixtureDir, crlf ? 'crlf checkout' : 'lf checkout');
        for (const relative of crlf ? inputs.slice().reverse() : inputs) copyInput(relative, destination, crlf);
        fs.writeFileSync(path.join(destination, extras[0]), crlf ? 'echo first\r\necho second\r\n' : 'echo first\necho second\n');
        fs.writeFileSync(path.join(destination, extras[1]), binary);
        builds.push(buildStarter(destination));
    }
    assert(builds[0].zipBuffer.equals(builds[1].zipBuffer), 'LF and CRLF checkouts must build identical ZIP bytes in the same runtime');
    const rebuilt = readEntries(builds[0].zipBuffer);
    assert.deepStrictEqual([...rebuilt.keys()].filter(name => !extras.includes(name)), [...entries.keys()],
        'the checked-in starter must contain the complete current entry set');
    for (const [name, file] of rebuilt) {
        assertCanonical(name, file.data);
        if (!extras.includes(name)) {
            const current = entries.get(name);
            // Compare decoded payloads rather than compressed ZIP bytes: zlib
            // versions may encode identical source bytes differently across Node.
            assert(file.data.equals(current.data), `rebuild the starter: generated ${name} is stale`);
            assert.strictEqual(file.host, current.host);
            assert.strictEqual(file.mode, current.mode);
        }
    }
    assert(rebuilt.get(extras[1]).data.equals(binary), 'binary CR/LF and non-UTF8 bytes must remain untouched');
    for (const name of ['level_template.js', 'boss_act_template.js', 'LEVEL_CORE_BLUEPRINT.md']) {
        const outputs = [false, true].map(crlf => fs.readFileSync(path.join(fixtureDir, crlf ? 'crlf checkout' : 'lf checkout', 'public/downloads', name)));
        assert(outputs[0].equals(outputs[1]), `${name} loose downloads must be checkout-independent`);
        assertCanonical(name, outputs[0]);
    }
} finally {
    const target = path.resolve(fixtureDir), tempRoot = path.resolve(os.tmpdir()) + path.sep;
    assert(target.startsWith(tempRoot) && path.basename(target).startsWith('scar-template-eol-'));
    fs.rmSync(target, { recursive: true, force: true });
}
console.log('  ✓ current source payloads, canonical text endings, untouched binaries, bootstrap scripts, and executable shell launchers');
console.log('  ✓ isolated LF/CRLF checkouts build identical archives and single-file downloads');
