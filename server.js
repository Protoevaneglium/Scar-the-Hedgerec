'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.zip': 'application/zip', '.md': 'text/markdown; charset=utf-8',
};
function inside(root, target) {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function createNativeStaticHandler(rootDir) {
    const root = path.resolve(rootDir), realRoot = fs.realpathSync(root);
    return (req, res) => {
        res.setHeader('X-Scar-Game', '1');
        const fail = (status, message, headers = {}) => {
            res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
            res.end(req.method === 'HEAD' ? undefined : message);
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fail(405, 'Method Not Allowed', { Allow: 'GET, HEAD' }); return;
        }
        let requested;
        try { requested = decodeURIComponent((req.url || '/').split('?')[0]); }
        catch (_) { fail(400, 'Bad Request'); return; }
        if (requested.includes('\0')) { fail(400, 'Bad Request'); return; }
        if (requested === '/') requested = '/index.html';
        const file = path.normalize(path.join(root, requested));
        if (!inside(root, file)) { fail(403, 'Forbidden'); return; }
        if (path.relative(root, file).split(path.sep).some(part => part.startsWith('.'))) {
            fail(404, 'Not Found'); return;
        }
        fs.realpath(file, (realError, realFile) => {
            if (realError) { fail(realError.code === 'EACCES' ? 403 : 404, 'Not Found'); return; }
            if (!inside(realRoot, realFile)) { fail(403, 'Forbidden'); return; }
            fs.stat(realFile, (error, stat) => {
                if (error || !stat.isFile()) { fail(404, 'Not Found'); return; }
                const total = stat.size;
                const headers = {
                    'Content-Type': MIME_TYPES[path.extname(realFile).toLowerCase()] || 'application/octet-stream',
                    'Accept-Ranges': 'bytes', 'Content-Length': total,
                };
                let start = 0, end = total - 1, status = 200;
                // Without a validator, If-Range must receive the complete file.
                if (req.headers.range && !req.headers['if-range']) {
                    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
                    const a = match && match[1] ? Number(match[1]) : null;
                    const b = match && match[2] ? Number(match[2]) : null;
                    if (!match || (a === null && b === null) || !total
                        || (a !== null && !Number.isSafeInteger(a)) || (b !== null && !Number.isSafeInteger(b))
                        || (a === null && b <= 0) || (a !== null && (a >= total || (b !== null && a > b)))) {
                        fail(416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${total}` }); return;
                    }
                    start = a === null ? Math.max(0, total - b) : a;
                    end = a === null || b === null ? total - 1 : Math.min(b, total - 1);
                    status = 206;
                    headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
                    headers['Content-Length'] = end - start + 1;
                }
                if (req.method === 'HEAD' || !total) { res.writeHead(status, headers); res.end(); return; }
                const stream = fs.createReadStream(realFile, { start, end });
                stream.on('error', () => {
                    if (res.headersSent) res.destroy(); else fail(500, 'Unable to read asset');
                });
                stream.on('open', () => { res.writeHead(status, headers); stream.pipe(res); });
                res.on('close', () => stream.destroy());
            });
        });
    };
}
function createStaticServer({ rootDir = PUBLIC_DIR, nativeOnly = false } = {}) {
    if (!nativeOnly) {
        try {
            const express = require('express'), app = express();
            app.use((_req, res, next) => { res.setHeader('X-Scar-Game', '1'); next(); });
            app.use(express.static(rootDir));
            app.use((error, _req, res, _next) => {
                if (res.headersSent) { res.destroy(); return; }
                const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
                res.status(status).set(error.headers || {}).type('text').send(http.STATUS_CODES[status]);
            });
            return http.createServer(app);
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') throw error;
        }
    }
    return http.createServer(createNativeStaticHandler(rootDir));
}
function openBrowser(url) {
    const isTermux = process.platform === 'android' || process.env.TERMUX_VERSION
        || (process.env.PREFIX && process.env.PREFIX.includes('com.termux'));
    if (isTermux) {
        exec(`termux-open-url "${url}" >/dev/null 2>&1 || am start --user 0 -a android.intent.action.VIEW -d "${url}" >/dev/null 2>&1 || am start -a android.intent.action.VIEW -d "${url}" >/dev/null 2>&1 || xdg-open "${url}" >/dev/null 2>&1`, () => {});
    } else if (process.platform === 'win32') exec(`cmd /c start "" "${url}"`, () => {});
    else if (process.platform === 'darwin') exec(`open "${url}"`, () => {});
    else exec(`xdg-open "${url}"`, () => {});
}
function startServer({ port = process.env.PORT ?? 3000, host = process.env.HOST || '0.0.0.0',
    open = process.argv.includes('--open'), openUrl = openBrowser, nativeOnly = false, log = console.log } = {}) {
    const firstPort = Number(port);
    if (!Number.isInteger(firstPort) || firstPort < 0 || firstPort > 65535) {
        throw new RangeError('PORT must be an integer from 0 through 65535.');
    }
    const server = createStaticServer({ nativeOnly });
    let activePort = firstPort;
    const listen = p => { activePort = p; server.listen(p, host); };
    const fail = error => { console.error(`Unable to start Scar: ${error.message}`); process.exitCode = 1; };
    const next = () => {
        if (activePort < Math.min(firstPort + 15, 65535)) listen(activePort + 1);
        else fail(new Error('No available game port.'));
    };
    server.on('listening', () => {
        activePort = server.address().port;
        const url = `http://localhost:${activePort}`;
        log(`Scar the Hedgerec running at ${url}`);
        log('(Press Ctrl+C in this window anytime to stop the server)');
        if (open) openUrl(url);
    });
    server.on('error', error => {
        if (error.code !== 'EADDRINUSE') { fail(error); return; }
        if (!open) { next(); return; }
        let settled = false;
        const retry = () => {
            if (settled) return;
            settled = true;
            request.destroy();
            next();
        };
        const request = http.get(`http://localhost:${activePort}/sonic-engine.js`, response => {
            response.resume();
            if (!settled && response.statusCode === 200 && response.headers['x-scar-game'] === '1') {
                settled = true;
                response.destroy();
                request.destroy();
                log(`Scar the Hedgerec is already running at http://localhost:${activePort} — launching browser...`);
                openUrl(`http://localhost:${activePort}`);
                server.emit('reused');
            } else retry();
        });
        request.on('error', retry);
        request.setTimeout(600, retry);
    });
    listen(firstPort);
    return server;
}
module.exports = { createNativeStaticHandler, createStaticServer, startServer };
if (require.main === module) {
    try { startServer(); }
    catch (error) { console.error(`Unable to start Scar: ${error.message}`); process.exitCode = 1; }
}
