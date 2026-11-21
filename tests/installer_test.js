/** Run only extracted Git-update blocks against disposable local repositories. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const names = ['install-windows.ps1', 'install-windows.bat', 'install-linux.sh', 'install-termux.sh'];
const sources = new Map(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-installer-policy-'));
const config = path.join(temp, 'empty-gitconfig');
fs.writeFileSync(config, '');
const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Scar regression', GIT_AUTHOR_EMAIL: 'scar-tests@example.invalid',
    GIT_COMMITTER_NAME: 'Scar regression', GIT_COMMITTER_EMAIL: 'scar-tests@example.invalid', GIT_TERMINAL_PROMPT: '0' };
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, env, ...options });
    if (result.error) throw result.error;
    return result;
}
function git(args, cwd = temp, allowFailure = false) {
    const result = run('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd });
    if (!allowFailure) assert.strictEqual(result.status, 0, `git ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result;
}
function available(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5000 });
    return !result.error && result.status === 0;
}
function block(name) {
    const match = /^[^\r\n]*BEGIN SAFE EXISTING UPDATE[^\r\n]*\r?\n([\s\S]*?)^[^\r\n]*END SAFE EXISTING UPDATE/m.exec(sources.get(name));
    assert(match, `${name}: Git update logic needs independently testable boundaries`);
    return match[1];
}
function commit(cwd, filename, contents) {
    fs.writeFileSync(path.join(cwd, filename), contents);
    git(['add', '--', filename], cwd);
    git(['commit', '-m', `Fixture change ${filename}`], cwd);
    return git(['rev-parse', 'HEAD'], cwd).stdout.trim();
}
const head = cwd => git(['rev-parse', 'HEAD'], cwd).stdout.trim();

try {
    console.log('\nInstaller update preservation');
    for (const [name, source] of sources) {
        const code = source.split(/\r?\n/).filter(line => !/^\s*(?:#|REM(?:\s|$))/i.test(line)).join('\n');
        assert(!/\bgit\b[^\r\n]*(?:\bcheckout\b|\breset\b|\brebase\b|\bstash\b|\bmerge\b)/i.test(code),
            `${name}: installers must not discard, rewrite, stash or merge local work`);
        for (const line of code.split('\n').filter(line => /\bgit\b.*\bpull\b/.test(line))) {
            assert(/\bpull\s+--ff-only\b/.test(line), `${name}: every pull must be fast-forward-only`);
            assert(!/\|\|[^\r\n]*\bgit\b/.test(line), `${name}: no unsafe fallback pull`);
        }
        assert(/status\s+--porcelain/.test(code) && /symbolic-ref\s+--quiet\s+--short\s+HEAD/.test(code),
            `${name}: dirty and detached checkouts must be inspected before updating`);
        assert(/Skipping update:/.test(code) && /preserved/i.test(code));
        block(name);
    }
    for (const name of ['install-linux.sh', 'install-termux.sh']) {
        assert(/\[\s+-e\s+"\$GAME_DIR\/\.git"\s+\]/.test(sources.get(name)),
            `${name}: an existing worktree's .git file must not fall through to archive installation`);
    }
    console.log('  ✓ all four installers forbid destructive Git updates and explicitly preserve dirty/detached checkouts');

    const runners = [];
    const powershell = ['powershell.exe', 'pwsh'].find(command => available(command, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']));
    if (powershell) runners.push({ name: 'PowerShell', source: 'install-windows.ps1', invoke(gameDir) {
        return run(powershell, ['-NoProfile', '-NonInteractive', '-Command',
            "$ErrorActionPreference = 'Continue'\n$GameDir = $env:SCAR_TEST_GAME_DIR\n" + block('install-windows.ps1')],
        { env: { ...env, SCAR_TEST_GAME_DIR: gameDir } });
    } });
    if (process.platform === 'win32') {
        const helper = path.join(temp, 'update-block.cmd');
        fs.writeFileSync(helper, '@echo off\r\nsetlocal\r\nset "GAME_DIR=%SCAR_TEST_GAME_DIR%"\r\ncall :UpdateExisting\r\nexit /b 0\r\n'
            + block('install-windows.bat').replace(/\r?\n/g, '\r\n'));
        runners.push({ name: 'Windows batch', source: 'install-windows.bat', invoke(gameDir) {
            return run(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'update-block.cmd'],
                { cwd: temp, env: { ...env, SCAR_TEST_GAME_DIR: gameDir } });
        } });
    }
    if (available('sh', ['-c', 'exit 0'])) for (const name of ['install-linux.sh', 'install-termux.sh']) {
        runners.push({ name, source: name, invoke(gameDir) {
            return run('sh', ['-c', 'set -e\nGAME_DIR="$SCAR_TEST_GAME_DIR"\nlog() { printf "%s\\n" "$*"; }\n' + block(name)],
                { env: { ...env, SCAR_TEST_GAME_DIR: gameDir } });
        } });
    }
    assert(runners.length > 0, 'a native shell is needed to execute the isolated update regression');

    const origin = path.join(temp, 'origin with spaces.git'), seed = path.join(temp, 'seed repo');
    git(['init', '--bare', '--initial-branch=master', origin]);
    git(['init', '--initial-branch=master', seed]);
    commit(seed, 'server.js', 'original game\n');
    commit(seed, 'scar.bat', 'original tracked launcher\n');
    git(['remote', 'add', 'origin', origin], seed); git(['push', '-u', 'origin', 'master'], seed);
    let counter = 0;
    function advanceRemote() {
        const id = ++counter;
        const result = commit(seed, `remote-${id}.txt`, `remote change ${id}\n`);
        git(['push', 'origin', 'master'], seed); return result;
    }
    function clone(label) {
        const location = path.join(temp, `${++counter} ${label} game folder`);
        git(['clone', '--no-hardlinks', origin, location]); return location;
    }
    function invoke(runner, cwd) {
        const result = runner.invoke(cwd);
        assert.strictEqual(result.status, 0, `${runner.name} updater failed\n${result.stdout}\n${result.stderr}`);
        return result.stdout + result.stderr;
    }
    for (const runner of runners) {
        const behind = clone('behind'), beforeBehind = head(behind), remote = advanceRemote();
        invoke(runner, behind);
        assert.notStrictEqual(remote, beforeBehind);
        assert.strictEqual(head(behind), remote, `${runner.name}: clean behind checkout should fast-forward`);

        const ahead = clone('ahead'), aheadHead = commit(ahead, 'local.txt', 'local committed work\n');
        invoke(runner, ahead);
        assert.strictEqual(head(ahead), aheadHead, `${runner.name}: local commits ahead of the remote must survive`);
        assert.strictEqual(fs.readFileSync(path.join(ahead, 'local.txt'), 'utf8'), 'local committed work\n');

        const diverged = clone('diverged'), divergedHead = commit(diverged, 'local.txt', 'diverged committed work\n');
        advanceRemote();
        assert(/preserv/i.test(invoke(runner, diverged)), `${runner.name}: divergence must be reported`);
        assert.strictEqual(head(diverged), divergedHead, `${runner.name}: divergence must never rewrite local commits`);
        assert.strictEqual(git(['status', '--porcelain'], diverged).stdout, '', 'a skipped divergence must leave no merge/rebase state');

        const dirty = clone('dirty'), dirtyHead = head(dirty);
        fs.writeFileSync(path.join(dirty, 'scar.bat'), 'custom launcher work\n');
        git(['add', '--', 'scar.bat'], dirty);
        fs.writeFileSync(path.join(dirty, 'untracked.txt'), 'new level notes\n');
        const dirtyStatus = git(['status', '--porcelain'], dirty).stdout;
        advanceRemote();
        assert(/Skipping update:/.test(invoke(runner, dirty)));
        assert.strictEqual(head(dirty), dirtyHead);
        assert.strictEqual(fs.readFileSync(path.join(dirty, 'scar.bat'), 'utf8'), 'custom launcher work\n',
            `${runner.name}: custom tracked launchers must never be restored over local edits`);
        assert.strictEqual(git(['status', '--porcelain'], dirty).stdout, dirtyStatus,
            `${runner.name}: both staged and untracked work must survive untouched`);

        const detached = clone('detached');
        git(['checkout', '--detach', remote], detached);
        const detachedHead = head(detached);
        advanceRemote();
        assert(/detached/i.test(invoke(runner, detached)));
        assert.strictEqual(head(detached), detachedHead);
        assert.notStrictEqual(git(['symbolic-ref', '--quiet', 'HEAD'], detached, true).status, 0,
            `${runner.name}: installation must not attach a detached checkout to another branch`);
        console.log(`  ✓ ${runner.name}: real extracted block preserves ahead/diverged/dirty/detached work and fast-forwards clean checkouts`);
    }
    console.log('  Only Git update blocks ran; package installation, downloads, launchers, and user PATH were not executed.');
} finally {
    const absolute = path.resolve(temp), parent = path.resolve(os.tmpdir()) + path.sep;
    assert(absolute.startsWith(parent) && path.basename(absolute).startsWith('scar-installer-policy-'));
    fs.rmSync(absolute, { recursive: true, force: true });
}
