'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { EventEmitter } = require('events');
const { createStaticServer, startServer } = require('../server');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-http-'));
const root = path.join(temp, 'public'), privateDir = path.join(temp, 'public-private');
fs.mkdirSync(root); fs.mkdirSync(privateDir);
fs.writeFileSync(path.join(root, 'index.html'), 'game');
fs.writeFileSync(path.join(root, 'media.wav'), '0123456789');
fs.writeFileSync(path.join(root, 'empty.txt'), '');
fs.writeFileSync(path.join(root, '.hidden'), 'hidden');
fs.writeFileSync(path.join(root, 'vanishing.bin'), 'data');
fs.writeFileSync(path.join(privateDir, 'private.txt'), 'private');
let junction = false;
try { fs.symlinkSync(privateDir, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); junction = true; }
catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
const servers = [], sockets = new Set();
async function listen(server) {
    servers.push(server);
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return server.address().port;
}
function request(port, url, headers = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: url, headers, method }, res => {
            const chunks = [];
            res.on('data', data => chunks.push(data));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
            res.on('error', reject);
        });
        req.on('error', reject); req.setTimeout(3000, () => req.destroy(new Error('Request hung'))); req.end();
    });
}
function started(server, event = 'listening') {
    servers.push(server);
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            server.removeListener(event, ready);
            server.removeListener('error', failed);
        };
        const ready = () => { cleanup(); resolve(server); };
        const failed = error => {
            // An occupied port is part of the launcher's normal retry/reuse path.
            if (error.code === 'EADDRINUSE') return;
            cleanup(); reject(error);
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Server startup hung waiting for ${event}`)); }, 5000);
        server.once(event, ready);
        server.on('error', failed);
    });
}
function deadline(promise, message) {
    let timer;
    return Promise.race([promise, new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 3000);
    })]).finally(() => clearTimeout(timer));
}
(async () => {
    console.log('\nHTTP server and launcher');
    const failedStartup = new EventEmitter();
    const startupFailure = started(failedStartup);
    failedStartup.emit('error', Object.assign(new Error('Controlled startup failure'), { code:'EADDRNOTAVAIL' }));
    await assert.rejects(startupFailure, /Controlled startup failure/);
    assert.strictEqual(failedStartup.listenerCount('listening'), 0);
    assert.strictEqual(failedStartup.listenerCount('error'), 0);
    for (const nativeOnly of [true, false]) {
        const port = await listen(createStaticServer({ rootDir: root, nativeOnly }));
        assert.strictEqual((await request(port, '/')).body, 'game');
        assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=2-5'})).body, '2345');
        assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=-3'})).body, '789');
        assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=7-999'})).body, '789');
        assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=7-'})).body, '789');
        const head = await request(port, '/media.wav', {Range:'bytes=2-5'}, 'HEAD');
        assert.strictEqual(head.status, 206); assert.strictEqual(head.body, '');
        assert.strictEqual(head.headers['content-length'], '4');
        assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=99-100'})).status, 416);
        assert.strictEqual((await request(port, '/empty.txt')).status, 200);
        assert.strictEqual((await request(port, '/missing')).status, 404);
        if (junction) assert.strictEqual((await request(port, '/escape/private.txt')).status, 403,
            `${nativeOnly ? 'native' : 'optional Express'} serving must not expose files outside public through a symlink`);
        const parallel = await Promise.all(Array.from({ length: 32 }, (_, index) =>
            request(port, '/media.wav', { Range: `bytes=${index % 8}-${index % 8 + 2}` }, index % 4 ? 'GET' : 'HEAD')));
        parallel.forEach((result, index) => {
            assert.strictEqual(result.status, 206);
            assert.strictEqual(result.headers['content-length'], '3');
            assert.strictEqual(result.body, index % 4 ? '0123456789'.slice(index % 8, index % 8 + 3) : '');
        });
    }
    console.log('  ✓ native and optional Express serving support full, suffix, open-ended, clipped and HEAD media ranges');
    const nativeServer = createStaticServer({ rootDir: root, nativeOnly: true });
    const port = await listen(nativeServer);
    for (const url of ['/%', '/%E0%A4%A', '/%00']) assert.strictEqual((await request(port, url)).status, 400);
    assert.strictEqual((await request(port, '/../public-private/private.txt')).status, 403);
    assert.strictEqual((await request(port, '/..%5cpublic-private%5cprivate.txt')).status, process.platform === 'win32' ? 403 : 404);
    assert.strictEqual((await request(port, '/.hidden')).status, 404);
    assert.strictEqual((await request(port, '/', {}, 'POST')).status, 405);
    for (const range of ['bytes=-0','bytes=-','bytes=5-3','bytes=999999999999999999999-','bytes=1-2junk']) {
        assert.strictEqual((await request(port, '/media.wav', {Range:range})).status, 416);
    }
    assert.strictEqual((await request(port, '/media.wav', {Range:'bytes=2-5','If-Range':'old-validator'})).status, 200);
    const originalRead = fs.createReadStream;
    try {
        fs.createReadStream = (file, options) => originalRead(file.endsWith('vanishing.bin') ? file + '.gone' : file, options);
        assert.strictEqual((await request(port, '/vanishing.bin')).status, 500);
    } finally { fs.createReadStream = originalRead; }
    assert.strictEqual((await request(port, '/')).status, 200, 'bad requests must not kill the server');
    console.log('  ✓ malformed URLs, path escapes, invalid ranges and read failures are handled without crashing');
    if (junction) assert.strictEqual((await request(port, '/escape/private.txt')).status, 403);
    const originalStat = fs.stat, originalStream = fs.createReadStream, abortedStreams = [];
    let resumeStat, statReached;
    const reachedStat = new Promise(resolve => { statReached = resolve; });
    try {
        fs.stat = (file, callback) => originalStat(file, (error, stat) => {
            if (file.endsWith('media.wav')) { resumeStat = () => callback(error, stat); statReached(); }
            else callback(error, stat);
        });
        fs.createReadStream = (...args) => { const stream = originalStream(...args); abortedStreams.push(stream); return stream; };
        const serverDisconnected = new Promise(resolve => nativeServer.once('request', (_req, res) => res.once('close', resolve)));
        const aborted = http.get({ host: '127.0.0.1', port, path: '/media.wav' }, res => res.resume());
        aborted.on('error', () => {});
        await deadline(reachedStat, 'The controlled media request never reached its disk callback');
        const disconnected = new Promise(resolve => aborted.once('close', resolve));
        aborted.destroy();
        await deadline(Promise.all([disconnected, serverDisconnected]), 'The cancelled media request did not disconnect');
        // The server has observed close before its pending disk callback completes.
        resumeStat();
        await new Promise(resolve => setTimeout(resolve, 30));
        assert(abortedStreams.every(stream => stream.destroyed),
            'disconnecting during stat must not leave a later-created media stream open forever');
    } finally {
        fs.stat = originalStat; fs.createReadStream = originalStream;
        await Promise.all(abortedStreams.filter(stream => !stream.closed).map(stream => new Promise(resolve => {
            stream.once('close', resolve); stream.destroy();
        })));
    }
    console.log('  ✓ cancelled media requests do not leak file streams across asynchronous disk callbacks');
    for (const invalid of ['bad', -1, 70000, Infinity]) assert.throws(() => startServer({ port:invalid }), RangeError);
    const ephemeral = startServer({port:0, host:'127.0.0.1', open:false, log:()=>{}});
    await started(ephemeral); assert(ephemeral.address().port > 0);
    const explicitUrls = [];
    // macOS only configures 127.0.0.1 by default; a second 127/8 alias is not
    // portable. A literal host still detects an incorrect hardcoded localhost URL.
    const explicit = startServer({ port: 0, host: '127.0.0.1', open: true, openUrl: url => explicitUrls.push(url), log: () => {} });
    await started(explicit);
    assert.strictEqual(new URL(explicitUrls[0]).hostname, '127.0.0.1',
        'the browser URL must target the interface on which the game actually listens');
    const explicitReusedUrls = [];
    const explicitReused = startServer({ port: explicit.address().port, host: '127.0.0.1', open: true,
        openUrl: url => explicitReusedUrls.push(url), log: () => {} });
    await started(explicitReused, 'reused');
    assert.deepStrictEqual(explicitReusedUrls, explicitUrls,
        'a second launcher must probe and reuse the configured interface rather than a different localhost server');
    const reused = [];
    const already = startServer({port:ephemeral.address().port,host:'127.0.0.1',open:true,openUrl:url=>reused.push(url),log:()=>{}});
    await started(already, 'reused'); assert.strictEqual(reused.length, 1);
    const hung = await listen(http.createServer(() => {}));
    const opened = [];
    const fallback = startServer({port:hung,host:'127.0.0.1',open:true,openUrl:url=>opened.push(url),log:()=>{}});
    let starts = 0; fallback.on('listening', () => starts++);
    await started(fallback);
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.strictEqual(starts,1); assert.strictEqual(opened.length,1);
    assert(fallback.address().port > hung);
    console.log('  ✓ valid game reuse and a hung occupied port produce exactly one browser launch and retry');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.filter(server=>server.listening).map(server=>new Promise(resolve=>server.close(resolve))));
    const absolute = path.resolve(temp), parent = path.resolve(os.tmpdir()) + path.sep;
    assert(absolute.startsWith(parent) && path.basename(absolute).startsWith('scar-http-'));
    fs.rmSync(absolute, { recursive:true, force:true });
});
