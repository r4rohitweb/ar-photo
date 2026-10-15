import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestRuntime } from './helpers/netlify-runtime.mjs';
import { CHUNK_SIZE, RESPONSE_LIMIT, byteRange } from '../server/netlify/media.mjs';
import { cleanupExpired } from '../server/netlify/storage.mjs';

test('byte ranges support seeking and cap each video response below platform limits', () => {
  assert.deepEqual(byteRange('bytes=0-', 100000000), { start: 0, end: RESPONSE_LIMIT - 1 });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19 });
  for (const range of ['bytes=-0', 'bytes=100-', 'bytes=9-2', 'bytes=0-1,3-4', 'bytes=-', 'bad']) assert.equal(byteRange(range, 100), null);
});

test('Netlify API persists validated chunk uploads, sessions, QR links, edits, scans and deletes through the real Blobs SDK', { timeout: 120000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stillmotion-netlify-'));
  const runtime = await createTestRuntime({ directory });
  let cookie = '', csrf = '';
  async function request(action, { method = 'GET', body, params = {}, headers = {}, raw = false } = {}) {
    const url = new URL('/api/index.php', runtime.origin); url.search = new URLSearchParams({ action, ...params });
    const response = await fetch(url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && !raw ? JSON.stringify(body) : body });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  }
  async function json(action, options) { const response = await request(action, options); const data = await response.json(); assert.ok(response.ok, `${action}: ${response.status} ${JSON.stringify(data)}`); return data; }
  async function start(files, operation = 'create', id) {
    return json('upload-init', { method: 'POST', params: id ? { id } : {}, body: { operation, title: 'Netlify verified memory', ...Object.fromEntries(Object.entries(files).map(([kind, bytes]) => [kind, { size: bytes.length, type: kind === 'image' ? 'image/jpeg' : 'video/mp4' }])) } });
  }
  async function part(upload, kind, index, bytes) { return request('upload-chunk', { method: 'PUT', params: { upload_id: upload.upload_id, kind, index }, body: bytes, raw: true, headers: { 'X-Upload-Token': upload.token, 'Content-Type': 'application/octet-stream' } }); }
  async function send(upload, files) { for (const [kind, bytes] of Object.entries(files)) for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) assert.equal((await part(upload, kind, offset / CHUNK_SIZE, bytes.subarray(offset, offset + CHUNK_SIZE))).status, 200); }
  const finish = upload => json('upload-complete', { method: 'POST', params: { upload_id: upload.upload_id }, headers: { 'X-Upload-Token': upload.token } });
  try {
    assert.equal((await json('health')).backend, 'netlify');
    assert.equal((await request('list')).status, 401);
    assert.equal((await request('upload-init', { method: 'POST', headers: { Origin: 'https://unrelated.example' }, body: { operation: 'create' } })).status, 403);
    const image = await readFile('public/images/mountains.jpg');
    // A real ISO BMFF signature plus padding exercises several chunks without checking in a large video.
    const video = Buffer.alloc(CHUNK_SIZE * 3 + 117); Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431', 'hex').copy(video);
    const files = { image, video }, upload = await start(files);
    assert.equal((await request('upload-complete', { method: 'POST', params: { upload_id: upload.upload_id }, headers: { 'X-Upload-Token': 'wrong' } })).status, 404);
    await send(upload, files);
    // The same chunk may safely be retried, but its bytes cannot be changed after upload.
    assert.equal((await part(upload, 'image', 0, image)).status, 200);
    const changed = Buffer.from(image); changed[100] ^= 1; assert.equal((await part(upload, 'image', 0, changed)).status, 409);
    const { experience } = await finish(upload), id = experience.unique_id;
    assert.match(experience.qr_code_url, new RegExp(`/#/ar/${id}$`)); assert.ok(experience.image_width > 0);
    assert.equal((await finish(upload)).experience.unique_id, id);
    const media = await request('media', { params: { file: experience.video_path }, headers: { Range: `bytes=${CHUNK_SIZE - 10}-${CHUNK_SIZE + 10}` } });
    assert.equal(media.status, 206); assert.deepEqual(Buffer.from(await media.arrayBuffer()), video.subarray(CHUNK_SIZE - 10, CHUNK_SIZE + 11));
    const wide = await request('media', { params: { file: experience.video_path }, headers: { Range: 'bytes=0-' } }); assert.equal(Number(wide.headers.get('content-length')), RESPONSE_LIMIT); await wide.arrayBuffer();
    assert.equal((await request('media', { method: 'HEAD', params: { file: experience.video_path } })).headers.get('content-length'), String(video.length));
    assert.equal((await request('media', { params: { file: '../config.local.php' } })).status, 404);
    await json('scan', { method: 'POST', params: { id } }); await json('scan', { method: 'POST', params: { id } }); assert.equal((await json('get', { params: { id } })).experience.scan_count, 1);
    const login = await json('login', { method: 'POST', body: { password: 'netlify-test-password' } }); csrf = login.csrf;
    assert.equal((await json('list')).experiences.length, 1);
    const other = createHandlerFromSameStores(runtime);
    const persisted = await other(new Request(`${runtime.origin}/api/index.php?action=get&id=${id}`)); assert.equal((await persisted.json()).experience.unique_id, id);
    assert.equal((await request('delete', { method: 'DELETE', params: { id }, headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
    const edit = await start({}, 'update', id); const edited = (await finish(edit)).experience; assert.equal(edited.qr_code_url, experience.qr_code_url); assert.equal(edited.scan_count, 1);
    await json('delete', { method: 'DELETE', params: { id } }); assert.equal((await request('get', { params: { id } })).status, 404); assert.equal((await request('media', { params: { file: experience.image_path } })).status, 404);
    const invalid = await start({ image, video: Buffer.from('not a movie') }); await send(invalid, { image, video: Buffer.from('not a movie') }); assert.equal((await request('upload-complete', { method: 'POST', params: { upload_id: invalid.upload_id }, headers: { 'X-Upload-Token': invalid.token } })).status, 400);
    await json('logout', { method: 'POST' }); assert.equal((await request('list')).status, 401);
    await cleanupExpired(runtime.stores, { now: Date.now() + 3 * 86400000, limit: 200 });
    assert.equal(await runtime.stores.media.get(`${invalid.files.image.name}/chunk/0`), null);
  } finally { await runtime.close(); }
});

import { createHandler } from '../server/netlify/api.mjs';
function createHandlerFromSameStores(runtime) { return createHandler({ stores: runtime.stores, env: { URL: runtime.origin, CONTEXT: 'production' } }); }
