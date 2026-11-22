#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function stageAndroidAssets(root = ROOT) {
    root = fs.realpathSync(root);
    const out = path.resolve(root, 'android/app/build/generated/gameAssets');
    const build = path.resolve(root, 'android/app/build') + path.sep;
    if (!out.startsWith(build) || out === build.slice(0, -1)) throw new Error('Android staging must stay in its generated build directory');
    let ancestor = root;
    for (const segment of ['android', 'app', 'build', 'generated', 'gameAssets']) {
        ancestor = path.join(ancestor, segment);
        if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Generated Android assets cannot traverse a linked directory');
    }
    const files = [];
    function walk(relative) {
        const source = path.join(root, 'public', relative), stat = fs.lstatSync(source);
        if (stat.isSymbolicLink()) throw new Error('Do not package linked game assets: ' + relative);
        if (stat.isDirectory()) for (const name of fs.readdirSync(source).sort()) walk(relative + '/' + name);
        else if (stat.isFile()) files.push(relative);
    }
    for (const name of ['index.html', 'sonic-engine.js', 'css', 'js', 'levels', 'assets']) walk(name);
    // Only this validated generated directory is replaced; source files are read-only.
    fs.rmSync(out, { recursive: true, force: true });
    const records = [];
    for (const file of files.sort()) {
        const bytes = fs.readFileSync(path.join(root, 'public', file)), target = path.join(out, 'game', file);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        records.push({ file, bytes: bytes.length, sha256: hash(bytes) });
    }
    const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
    const report = { schema: 1, version: release.version, applicationId: release.applicationId,
        sourceSha256: hash(Buffer.from(records.map(r => r.file + '\0' + r.sha256 + '\n').join(''))), files: records };
    fs.writeFileSync(path.join(out, 'game', 'apk-source.json'), JSON.stringify(report, null, 2) + '\n');
    return { out, report };
}
if (require.main === module) {
    const { report } = stageAndroidAssets(); console.log(`Android payload ${report.version}: ${report.files.length} files; SHA-256 ${report.sourceSha256}`);
}
module.exports = { stageAndroidAssets };
