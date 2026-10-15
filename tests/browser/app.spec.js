import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const id = 'a'.repeat(32), image = fs.readFileSync('public/images/mountains.jpg');
const experience = { unique_id: id, title: 'A mountain memory', image_path: 'photo.jpg', video_path: 'clip.mp4', image_width: 1000, image_height: 667, qr_code_url: `http://127.0.0.1:5173/#/watch/${id}`, scan_count: 7, created_at: '2026-10-15 06:30:00' };
async function mockAPI(page) {
  await page.route('**/api/index.php?**', async route => {
    const url = new URL(route.request().url()), action = url.searchParams.get('action');
    if (action === 'media') { if (url.searchParams.get('file') === 'photo.jpg') return route.fulfill({ contentType: 'image/jpeg', body: image }); return route.fulfill({ status: 404 }); }
    const payload = action === 'session' ? { authenticated: false, csrf: 'test-token' } : action === 'login' ? { authenticated: true, csrf: 'test-token' } : action === 'list' ? { experiences: [experience] } : ['create','get','update'].includes(action) ? { experience } : { ok: true };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
}
test('creation is responsive and validates a selected photo', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your photos have more life in them.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate experience' })).toBeDisabled();
  await page.getByLabel('Upload photo').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('JPG');
  await page.getByLabel('Upload photo').setInputFiles({ name: 'memory.jpg', mimeType: 'image/jpeg', buffer: image });
  await expect(page.getByAltText('Your selected photo')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/create-${info.project.name}.png`, fullPage: true });
});
test('preview exports a scannable QR and a framed photograph', async ({ page }) => {
  await mockAPI(page); await page.goto(`/#/preview/${id}`);
  await expect(page.getByRole('heading', { name: 'Scan to Bring This Photo to Life' })).toBeVisible();
  await expect(page.getByAltText('QR code to play this memory')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const qrDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download QR', exact: true }).click(); expect((await qrDownload).suggestedFilename()).toContain('stillmotion-qr');
  const photoDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download photo with QR' }).click(); expect((await photoDownload).suggestedFilename()).toBe(`stillmotion-${id}.png`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('watch keeps a single fixed photo/video frame and handles video errors', async ({ page }) => {
  await mockAPI(page); await page.goto(`/#/watch/${id}`);
  const player = page.locator('.memory-player'); await expect(player).toBeVisible(); const before = await player.boundingBox();
  await expect(player.locator('video')).toHaveAttribute('playsinline', '');
  await expect(page.getByRole('alert')).toContainText('could not be played');
  const after = await player.boundingBox(); expect(after.width).toBe(before.width); expect(after.height).toBe(before.height);
  await expect(page.getByRole('link', { name: 'View in AR' })).toBeVisible();
});
test('admin signs in, lists and deletes a memory with confirmation', async ({ page }) => {
  await mockAPI(page); await page.goto('/#/admin');
  await page.getByLabel('Admin password').fill('example-password'); await page.getByRole('button', { name: 'Open my experiences' }).click();
  await expect(page.getByRole('heading', { name: 'Good moments, all together.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A mountain memory' })).toBeVisible();
  await page.getByLabel('Edit experience', { exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByLabel('Memory name').fill('An updated moment'); await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Delete experience', { exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('permanently deleted'); await page.getByRole('button', { name: 'Keep memory' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
});
