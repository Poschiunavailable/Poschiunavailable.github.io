// Third-party requests (CDN scripts, web fonts) are answered from a local
// cache instead of the network. The browser under test has no route to the
// internet at all: everything that is not the local server goes through
// `handleRoute`, so a flaky proxy can neither fail nor pass a run.
//
// A cache miss is filled once with curl (which honours HTTPS_PROXY and the
// sandbox CA bundle) and kept in tests/.cache/ (git-ignored). With
// `offline: true` a miss is an error instead — use that to prove a run
// depended on nothing live.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function createThirdPartyCache({ dir, offline = false }) {
    fs.mkdirSync(dir, { recursive: true });
    const inflight = new Map();
    const log = new Map();   // url -> { status, transferBytes, fromCache }

    const keyOf = url => crypto.createHash('sha1').update(url).digest('hex');

    async function fill(url, userAgent) {
        const key = keyOf(url);
        const bodyFile = path.join(dir, `${key}.body`);
        const metaFile = path.join(dir, `${key}.json`);
        if (fs.existsSync(metaFile)) {
            return { ...JSON.parse(fs.readFileSync(metaFile, 'utf8')), bodyFile, fromCache: true };
        }
        if (offline) throw new Error(`offline and not cached: ${url}`);

        const { stdout } = await run('curl', [
            '-sS', '-L', '--compressed',
            '--retry', '5', '--retry-all-errors', '--retry-delay', '2',
            '--max-time', '60',
            '-A', userAgent || 'Mozilla/5.0',
            '-o', bodyFile,
            '-w', '%{http_code} %{size_download} %{content_type}',
            url,
        ], { maxBuffer: 1 << 20 });
        const [code, size, ...type] = stdout.trim().split(' ');
        const meta = { url, status: Number(code), transferBytes: Number(size), contentType: type.join(' ') };
        if (meta.status >= 400 || meta.status === 0) {
            fs.rmSync(bodyFile, { force: true });
            throw new Error(`HTTP ${meta.status} filling ${url}`);
        }
        fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
        return { ...meta, bodyFile, fromCache: false };
    }

    async function handleRoute(route) {
        const req = route.request();
        const url = req.url();
        if (!inflight.has(url)) {
            inflight.set(url, fill(url, req.headers()['user-agent']).finally(() => inflight.delete(url)));
        }
        try {
            const entry = await inflight.get(url);
            log.set(url, { status: entry.status, transferBytes: entry.transferBytes, fromCache: entry.fromCache });
            await route.fulfill({
                status: entry.status,
                body: fs.readFileSync(entry.bodyFile),
                headers: {
                    'content-type': entry.contentType,
                    // Module scripts and fonts are CORS requests.
                    'access-control-allow-origin': '*',
                },
            });
        } catch (err) {
            log.set(url, { status: 0, error: String(err.message || err) });
            await route.abort('failed');
        }
    }

    return { handleRoute, log, transferBytesOf: url => log.get(url)?.transferBytes };
}
