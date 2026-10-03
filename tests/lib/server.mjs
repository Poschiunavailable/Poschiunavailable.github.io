// Static file server that behaves like GitHub Pages where it matters to the
// tests: gzip for text, Range requests for video, and an unknown path answered
// with 404.html (status 404) when that file exists.
//
// `transform(urlPath, buffer) -> buffer` lets the self-test inject faults into
// served files without touching the working tree.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.md': 'text/markdown; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

export function startServer({ root, port = 0, transform = null } = {}) {
    const rootAbs = path.resolve(root);

    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let file = path.join(rootAbs, urlPath);
        // Never serve outside the site root.
        if (!file.startsWith(rootAbs)) { res.writeHead(403).end(); return; }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

        let status = 200;
        if (!fs.existsSync(file)) {
            const notFound = path.join(rootAbs, '404.html');
            if (!fs.existsSync(notFound)) {
                res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
                return;
            }
            file = notFound;
            status = 404;
        }

        let body = fs.readFileSync(file);
        // Transform by the file actually served, so `/` and `/index.html` match alike.
        if (transform) body = transform('/' + path.relative(rootAbs, file).split(path.sep).join('/'), body) ?? body;
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        const headers = { 'content-type': type, 'cache-control': 'no-store' };

        // Range support: Chromium requests video with Range and seeks with it.
        const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (range && status === 200) {
            const size = body.length;
            const start = range[1] ? Number(range[1]) : size - Number(range[2]);
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            if (start >= size || start > end) {
                res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
                return;
            }
            res.writeHead(206, {
                ...headers,
                'accept-ranges': 'bytes',
                'content-range': `bytes ${start}-${end}/${size}`,
                'content-length': end - start + 1,
            });
            res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
            return;
        }

        if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
            body = zlib.gzipSync(body);
            headers['content-encoding'] = 'gzip';
        }
        headers['content-length'] = body.length;
        if (type.startsWith('video/')) headers['accept-ranges'] = 'bytes';
        res.writeHead(status, headers);
        res.end(req.method === 'HEAD' ? undefined : body);
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const { port: actual } = server.address();
            resolve({ server, base: `http://127.0.0.1:${actual}/`, close: () => new Promise(r => server.close(r)) });
        });
    });
}
