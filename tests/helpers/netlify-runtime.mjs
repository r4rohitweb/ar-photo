import { BlobsServer } from '@netlify/blobs/server';
import { getStore } from '@netlify/blobs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { openStores } from '../../server/netlify/storage.mjs';
import { createHandler } from '../../server/netlify/api.mjs';

export async function createTestRuntime({ directory, port = 0, staticDirectory, password = 'netlify-test-password' }) {
  await mkdir(directory, { recursive: true });
  const token = 'local-emulator-token-only';
  const blobs = new BlobsServer({ directory, token, logger: () => {} });
  const address = await blobs.start();
  const stores = openStores(options => getStore({ ...options, siteID: 'stillmotion-local-emulator', token, apiURL: `http://127.0.0.1:${address.port}` }), { CONTEXT: 'production' });
  let origin;
  const env = { CONTEXT: 'production', STILLMOTION_ADMIN_PASSWORD: password };
  const handler = createHandler({ stores, env, logger: console });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === '/api/index.php' || url.pathname === '/.netlify/functions/api') {
        const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await handler(request, { ip: '127.0.0.1' });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
        else res.end();
        return;
      }
      if (!staticDirectory) { res.writeHead(404); res.end(); return; }
      const root = resolve(staticDirectory), path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const content = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(content);
    } catch (error) { if (!res.headersSent) res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  env.URL = origin;
  return { origin, stores, handler, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await blobs.stop(); } };
}
