#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib'), assert = require('assert');
const root = path.resolve(__dirname, '..'), release = require('../release.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function zipEntries(bytes) {
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
    assert(end >= 0, 'APK ZIP end record');
    const entries = new Map(), count = bytes.readUInt16LE(end + 10);
    let cursor = bytes.readUInt32LE(end + 16);
    for (let i = 0; i < count; i++) {
        assert.strictEqual(bytes.readUInt32LE(cursor), 0x02014b50);
        const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
        const name = bytes.toString('utf8', cursor + 46, cursor + 46 + length), at = bytes.readUInt32LE(cursor + 42);
        assert(!entries.has(name), 'duplicate APK entry ' + name);
        assert.strictEqual(bytes.readUInt32LE(at), 0x04034b50);
        const start = at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28), compressed = bytes.readUInt32LE(cursor + 20);
        entries.set(name, { method: bytes.readUInt16LE(cursor + 10), data: bytes.subarray(start, start + compressed) });
        cursor += 46 + length + extra + comment;
    }
    return entries;
}
function verifyApk(filename) {
    const bytes = fs.readFileSync(filename), entries = zipEntries(bytes);
    const read = name => {
        const item = entries.get(name); assert(item, 'APK missing ' + name);
        assert(item.method === 0 || item.method === 8, 'supported APK compression');
        return item.method === 8 ? zlib.inflateRawSync(item.data) : item.data;
    };
    const manifest = JSON.parse(read('assets/game/apk-source.json'));
    assert.strictEqual(manifest.version, release.version); assert.strictEqual(manifest.applicationId, release.applicationId);
    const seen = new Set();
    for (const record of manifest.files) {
        assert(!seen.has(record.file) && !record.file.split('/').includes('..') && !path.isAbsolute(record.file), 'bounded unique source path'); seen.add(record.file);
        const source = fs.readFileSync(path.join(root, 'public', record.file)), packed = read('assets/game/' + record.file);
        assert(source.equals(packed), record.file + ': APK must contain the exact tested source bytes');
        assert.strictEqual(hash(source), record.sha256); assert.strictEqual(source.length, record.bytes);
        if (/\.(?:mp4|mp3|wav)$/.test(record.file)) assert.strictEqual(entries.get('assets/game/' + record.file).method, 0, 'media must permit seekable asset file descriptors');
    }
    for (const name of entries.keys()) {
        assert(!/(?:\.jks|\.keystore|credentials\.json|(?:^|\/)\.env)$/.test(name), 'private signing/configuration file in APK');
        if (name.startsWith('assets/game/') && name !== 'assets/game/apk-source.json') assert(seen.has(name.slice('assets/game/'.length)), 'unrecorded game asset');
    }
    assert.strictEqual(hash(Buffer.from(manifest.files.map(r => r.file + '\0' + r.sha256 + '\n').join(''))), manifest.sourceSha256);
    return { schema: 1, version: release.version, applicationId: release.applicationId, apk: path.basename(filename),
        bytes: bytes.length, sha256: hash(bytes), payloadSha256: manifest.sourceSha256, checkedFiles: manifest.files.length };
}
if (require.main === module) {
    const filename = path.resolve(process.argv[2] || 'android/app/build/outputs/apk/release/app-release.apk');
    const report = verifyApk(filename);
    fs.mkdirSync(path.join(root, 'output/qa'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/qa/android-apk.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
module.exports = { verifyApk, zipEntries };
