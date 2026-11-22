#!/usr/bin/env node
/** Rebuild distributables, run every independent suite, and fingerprint the tested source. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const stress = process.argv.includes('--stress');
const output = path.join(root, 'output', 'qa', stress ? 'baseline-stress.json' : 'baseline.json');
const results = [];
const started = new Date();
function fingerprint() {
    const files = [];
    function walk(relative) {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            if (entry.isDirectory() && ['build', '.gradle'].includes(entry.name)) continue;
            if (entry.isFile() && (entry.name === 'local.properties' || /\.(?:jks|keystore)$/.test(entry.name))) continue;
            const child = relative + '/' + entry.name;
            if (entry.isDirectory()) walk(child);
            else if (entry.isFile()) files.push(child);
        }
    }
    for (const dir of ['public', 'scripts', 'templates', 'tests', 'bin', '.github', 'android']) walk(dir);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name !== 'HANDOFF.md'
            && (/\.(?:js|json|md|bat|cmd|ps1|sh)$/i.test(entry.name) || ['.gitattributes', '.gitignore'].includes(entry.name))) {
            files.push(entry.name);
        }
    }
    files.sort();
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const content = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
        hash.update(file + '\0' + content + '\n');
    }
    return { sha256: hash.digest('hex'), files: files.length };
}
function run(file, args = []) {
    const label = [file, ...args].join(' ');
    console.log(`\n[baseline] ${label}`);
    const before = Date.now();
    const processResult = spawnSync(process.execPath, [path.join(root, file), ...args], {
        cwd: root, encoding: 'utf8', timeout: stress ? 600000 : 300000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0' }, windowsHide: true,
    });
    if (processResult.stdout) process.stdout.write(processResult.stdout);
    if (processResult.stderr) process.stderr.write(processResult.stderr);
    const item = { command: label, passed: processResult.status === 0 && !processResult.error,
        exitCode: processResult.status, signal: processResult.signal, durationMs: Date.now() - before };
    if (processResult.error) item.error = processResult.error.message;
    results.push(item);
    return item.passed;
}
fs.mkdirSync(path.dirname(output), { recursive: true });
const built = run('scripts/build-template-zip.js');
const before = fingerprint();
if (built) {
    const suites = fs.readdirSync(path.join(root, 'tests')).filter(name => /_test\.js$/.test(name)).sort();
    for (const suite of suites) run('tests/' + suite);
    if (stress) run('tests/render_adversarial_test.js', ['--stress']);
}
const after = fingerprint();
const sameSource = before.sha256 === after.sha256;
const passed = built && sameSource && results.every(item => item.passed);
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
const report = { schema: 1, startedAt: started.toISOString(), completedAt: new Date().toISOString(),
    node: process.version, platform: process.platform, architecture: process.arch, stress,
    gitHeadAtVerification: git.status === 0 ? git.stdout.trim() : null,
    testedInput: after, sourceUnchangedDuringTests: sameSource, passed,
    suitesPassed: results.filter(item => item.passed).length, suitesRun: results.length,
    results, limitations: ['Seeded simulation and fault injection cover the recorded cases, not every possible play sequence.',
        'This run validates the recorded host platform; the CI workflow defines other platform checks.'] };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`\n[baseline] ${passed ? 'PASS' : 'FAIL'}: ${report.suitesPassed}/${report.suitesRun} checks; `
    + `source ${after.sha256}; report ${path.relative(root, output)}`);
if (!sameSource) console.error('[baseline] Source changed during verification. Run again after edits finish.');
process.exitCode = passed ? 0 : 1;
