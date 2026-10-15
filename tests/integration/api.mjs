import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = process.env.STILLMOTION_TEST_API || 'http://127.0.0.1:8089/api/index.php';
let cookie = '', csrf = '';
async function request(action, { method = 'GET', params = {}, body, headers = {} } = {}) {
  const url = new URL(base); url.search = new URLSearchParams({ action, ...params });
  const response = await fetch(url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers }, body });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return response;
}
function form(video = true) { const data = new FormData(); data.append('title', 'Integration memory'); data.append('image', new Blob([fs.readFileSync('public/images/mountains.jpg')], { type: 'image/jpeg' }), 'photo.jpg'); if (video) data.append('video', new Blob([fs.readFileSync('test-results/flower.mp4')], { type: 'video/mp4' }), 'clip.mp4'); return data; }
test('real PHP/MySQL lifecycle, authentication, validation, media ranges and scan deduplication', async () => {
  assert.equal((await request('health')).status, 200);
  assert.equal((await request('list')).status, 401);
  assert.equal((await request('get', { params: { id: '../secret' } })).status, 404);
  assert.equal((await request('create', { method: 'POST', body: form(false) })).status, 400);
  const fake = form(); fake.set('image', new Blob(['<?php echo "unsafe";'], { type: 'image/jpeg' }), 'fake.jpg'); assert.equal((await request('create', { method: 'POST', body: fake })).status, 400);
  const create = await request('create', { method: 'POST', body: form() }); assert.equal(create.status, 201); const { experience: item } = await create.json();
  try {
    assert.match(item.unique_id, /^[a-f0-9]{32}$/); assert.match(item.qr_code_url, new RegExp(`/#/ar/${item.unique_id}`));
    assert.equal((await request('get', { params: { id: item.unique_id } })).status, 200);
    const media = await request('media', { params: { file: item.video_path }, headers: { Range: 'bytes=0-99' } }); assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 100);
    assert.equal((await request('media', { params: { file: '../config.local.php' } })).status, 404);
    const badRange = await request('media', { params: { file: item.video_path }, headers: { Range: 'bytes=999999999-' } }); assert.equal(badRange.status, 416);
    await request('scan', { method: 'POST', params: { id: item.unique_id } }); await request('scan', { method: 'POST', params: { id: item.unique_id } });
    const scanned = await (await request('get', { params: { id: item.unique_id } })).json(); assert.equal(Number(scanned.experience.scan_count), 1);
    const login = await request('login', { method: 'POST', body: JSON.stringify({ password: 'integration-test-password' }), headers: { 'Content-Type': 'application/json' } }); assert.equal(login.status, 200); csrf = (await login.json()).csrf;
    assert.equal((await request('list')).status, 200);
    const badCsrf = await request('update', { method: 'POST', params: { id: item.unique_id }, body: new FormData(), headers: { 'X-CSRF-Token': 'incorrect' } }); assert.equal(badCsrf.status, 403);
    const edit = new FormData(); edit.append('title', 'Updated memory'); const update = await request('update', { method: 'POST', params: { id: item.unique_id }, body: edit }); assert.equal(update.status, 200); assert.equal((await update.json()).experience.qr_code_url, item.qr_code_url);
  } finally {
    if (!csrf) { const login = await request('login', { method: 'POST', body: JSON.stringify({ password: 'integration-test-password' }), headers: { 'Content-Type': 'application/json' } }); csrf = (await login.json()).csrf; }
    assert.equal((await request('delete', { method: 'DELETE', params: { id: item.unique_id } })).status, 200);
    assert.equal((await request('get', { params: { id: item.unique_id } })).status, 404);
    assert.equal((await request('media', { params: { file: item.video_path } })).status, 404);
  }
});
