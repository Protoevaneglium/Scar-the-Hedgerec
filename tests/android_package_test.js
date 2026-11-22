'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), cp = require('child_process');
const { stageAndroidAssets } = require('../scripts/stage-android-assets');
const release = require('../release.json'), pkg = require('../package.json'), lock = require('../package-lock.json');
assert.strictEqual(pkg.version, release.version); assert.strictEqual(lock.version, release.version);
assert.strictEqual(lock.packages[''].version, release.version);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-android-payload-'));
try {
    fs.mkdirSync(path.join(temp, 'public'), { recursive: true });
    const fixture = ['index.html', 'sonic-engine.js', 'css/game-ui.css', 'js/android-host.js', 'levels/example.js', 'assets/clip.mp4'];
    for (const name of fixture) { const target = path.join(temp, 'public', name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, name.endsWith('.mp4') ? Buffer.from([0, 13, 255, 10, 0]) : name + '\r\n'); }
    fs.mkdirSync(path.join(temp, 'public/downloads')); fs.writeFileSync(path.join(temp, 'public/downloads/unused.zip'), 'do not package');
    fs.writeFileSync(path.join(temp, 'credentials.json'), 'private fixture'); fs.copyFileSync(path.join(__dirname, '../release.json'), path.join(temp, 'release.json'));
    const result = stageAndroidAssets(temp), first = JSON.stringify(result.report);
    for (const file of fixture) assert(fs.readFileSync(path.join(temp, 'public', file)).equals(fs.readFileSync(path.join(result.out, 'game', file))));
    assert.deepStrictEqual(result.report.files.map(r => r.file).sort(), [...fixture].sort());
    fs.writeFileSync(path.join(result.out, 'game/stale-file.txt'), 'stale');
    assert.strictEqual(JSON.stringify(stageAndroidAssets(temp).report), first);
    assert(!fs.existsSync(path.join(result.out, 'game/stale-file.txt')) && fs.existsSync(path.join(temp, 'credentials.json')));
    assert.strictEqual(cp.spawnSync('git', ['check-ignore', '--quiet', 'output/android-signing/credentials.json'], { cwd: path.join(__dirname, '..') }).status, 0);
    console.log('\nAndroid packaging: exact text/binary payloads, deterministic manifest, stale-file cleanup, excluded downloads and private-key confinement passed.');
} finally {
    const target = fs.realpathSync(temp), allowed = fs.realpathSync(os.tmpdir()) + path.sep;
    assert(target.startsWith(allowed) && path.basename(target).startsWith('scar-android-payload-'));
    fs.rmSync(target, { recursive: true, force: true });
}
