'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
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
        const timer = setTimeout(() => reject(new Error('Server startup hung')), 5000);
        server.once(event, () => { clearTimeout(timer); resolve(server); });
    });
}
(async () => {
    console.log('\nHTTP server and launcher');
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
    }
    console.log('  ✓ native and optional Express serving support full, suffix, open-ended, clipped and HEAD media ranges');
    const port = await listen(createStaticServer({ rootDir: root, nativeOnly: true }));
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
    let junction = false;
    try { fs.symlinkSync(privateDir, path.join(root,'escape'), process.platform === 'win32' ? 'junction' : 'dir'); junction = true; }
    catch (error) { if (!['EPERM','EACCES'].includes(error.code)) throw error; }
    if (junction) assert.strictEqual((await request(port, '/escape/private.txt')).status, 403);
    for (const invalid of ['bad', -1, 70000, Infinity]) assert.throws(() => startServer({ port:invalid }), RangeError);
    const ephemeral = startServer({port:0, host:'127.0.0.1', open:false, log:()=>{}});
    await started(ephemeral); assert(ephemeral.address().port > 0);
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
