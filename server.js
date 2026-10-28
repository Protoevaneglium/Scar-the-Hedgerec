const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
};

function createNativeStaticHandler(rootDir) {
    return (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.end('Method Not Allowed');
            return;
        }
        const rawUrl = (req.url || '/').split('?')[0];
        let safePath = decodeURIComponent(rawUrl);
        if (safePath === '/') safePath = '/index.html';

        const filePath = path.normalize(path.join(rootDir, safePath));
        if (!filePath.startsWith(rootDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        fs.stat(filePath, (err, stat) => {
            if (err || !stat.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const total = stat.size;
            const range = req.headers.range;

            // Support HTTP Range requests for seamless audio looping on Android/Termux, iOS, macOS, Linux & Windows
            if (range) {
                const match = /bytes=(\d*)-(\d*)/.exec(range);
                if (match) {
                    const start = match[1] ? parseInt(match[1], 10) : 0;
                    const end = match[2] ? parseInt(match[2], 10) : total - 1;
                    if (start >= 0 && start <= end && end < total) {
                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${total}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': (end - start) + 1,
                            'Content-Type': contentType,
                        });
                        if (req.method === 'HEAD') { res.end(); return; }
                        fs.createReadStream(filePath, { start, end }).pipe(res);
                        return;
                    }
                }
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': total,
                'Accept-Ranges': 'bytes',
            });
            if (req.method === 'HEAD') { res.end(); return; }
            fs.createReadStream(filePath).pipe(res);
        });
    };
}

let server;
try {
    // Use Express if installed, otherwise fall back to zero-dependency Node HTTP server (ideal for Termux/Android)
    const express = require('express');
    const app = express();
    app.use(express.static(PUBLIC_DIR));
    server = http.createServer(app);
} catch (_) {
    server = http.createServer(createNativeStaticHandler(PUBLIC_DIR));
}

function openBrowser(url) {
    const isTermux = Boolean(process.env.TERMUX_VERSION || (process.env.PREFIX && process.env.PREFIX.includes('com.termux')));
    if (isTermux) {
        exec(`termux-open-url "${url}" || am start -a android.intent.action.VIEW -d "${url}"`, () => {});
    } else if (process.platform === 'win32') {
        exec(`cmd /c start "" "${url}"`, () => {});
    } else if (process.platform === 'darwin') {
        exec(`open "${url}"`, () => {});
    } else {
        exec(`xdg-open "${url}"`, () => {});
    }
}

server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Scar the Hedgerec running at ${url}`);
    if (process.argv.includes('--open')) {
        openBrowser(url);
    }
});
