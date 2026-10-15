import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
test('Netlify accepts a 100 MB MP4 through bounded chunks and plays it using HTTP ranges', async ({ page, request }, info) => {
  test.skip(!process.env.STILLMOTION_NATIVE_NETLIFY || info.project.name !== 'desktop', 'Opt-in check against the native Netlify backend/emulator.');
  test.setTimeout(120000);
  const video = await readFile('test-results/flower.mp4');
  const padding = Buffer.alloc(100 * 1024 * 1024 - video.length);
  // ISO BMFF free-space box: a valid, playable MP4 at the supported maximum size.
  padding.writeUInt32BE(padding.length, 0); padding.write('free', 4);
  await writeFile('test-results/netlify-large.mp4', Buffer.concat([video, padding]));
  let largest = 0, parts = 0;
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.searchParams.get('action') === 'upload-chunk') { parts++; largest = Math.max(largest, Number(req.headers()['content-length'] || 0)); }
  });
  let id;
  try {
    await page.goto('/');
    await page.getByLabel('Upload photo').setInputFiles('public/images/mountains.jpg');
    await page.getByLabel('Upload video').setInputFiles('test-results/netlify-large.mp4');
    await page.getByLabel('Give your memory a name').fill('100 MB Netlify verification');
    await page.getByRole('button', { name: 'Generate experience' }).click();
    await expect(page).toHaveURL(/#\/preview\/[a-f0-9]{32}/, { timeout: 90000 });
    id = page.url().split('/').pop();
    expect(parts).toBe(51); expect(largest).toBeLessThanOrEqual(2 * 1024 * 1024);
    await page.getByRole('link', { name: 'Preview the experience' }).click();
    await expect(page.locator('.memory-player video')).toHaveJSProperty('paused', false, { timeout: 20000 });
    await expect(page.locator('.memory-player video')).toHaveCSS('opacity', '1');
  } finally {
    if (id) {
      const login = await request.post('/api/index.php?action=login', { data: { password: process.env.STILLMOTION_TEST_ADMIN_PASSWORD || 'netlify-test-password' } });
      const { csrf } = await login.json();
      const deleted = await request.delete(`/api/index.php?action=delete&id=${id}`, { headers: { 'X-CSRF-Token': csrf } }); expect(deleted.ok()).toBe(true);
    }
  }
});
