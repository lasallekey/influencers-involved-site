// Local preview: serves site/ and the Worker API on one origin, backed by an in-memory SQLite
// database (synthetic data only). Outgoing "email" is captured at /__dev/mail instead of being sent.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';
import { createMigratedD1 } from '../worker/dev/d1-sqlite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT || 8787);
const base = `http://127.0.0.1:${PORT}`;
const mails = [];
const env = { DB: createMigratedD1(), SITE_URL: base, ALLOWED_ORIGINS: '', TOKEN_SECRET: 'dev-only-secret', EMAIL_API_KEY: 'dev', EMAIL_FROM: 'II Dev <grants@influencersinvolved.org>', EMAIL_API_URL: `${base}/__dev/mail` };
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    if (url.pathname === '/__dev/mail') {
      if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); mails.push(JSON.parse(Buffer.concat(chunks).toString())); res.writeHead(200).end('{}'); return; }
      await Promise.all(pending.splice(0));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(mails)); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await worker.fetch(new Request(url, { method: req.method, headers: { ...req.headers, 'CF-Connecting-IP': req.socket.remoteAddress }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, ctx);
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let f = join(root, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(await readFile(join(root, '404.html'))); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }).end(await readFile(f));
  } catch (e) { console.error(e); res.writeHead(500).end('dev server error'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Preview: ${base}  (in-memory database, synthetic data only; Ctrl+C to stop)`));
