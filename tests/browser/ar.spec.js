import { test, expect } from '@playwright/test';
import fs from 'node:fs';
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test('AR compiles the photo and starts a real image-tracking engine', async ({ page, context, request }, info) => {
  test.skip(!process.env.STILLMOTION_TEST_AR || info.project.name !== 'desktop', 'Opt-in HTTPS/CDN/WebGL smoke check using a simulated camera.');
  test.setTimeout(120000);
  const api = process.env.STILLMOTION_LIVE_API;
  const url = action => { const value = new URL(api); value.search = new URLSearchParams({ action }); return value.href; };
  const created = await request.post(url('create'), { multipart: { title: 'AR smoke test', image: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync('public/images/mountains.jpg') }, video: { name: 'clip.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync('test-results/flower.mp4') } } });
  expect(created.ok()).toBe(true); const { experience } = await created.json();
  try {
    await context.grantPermissions(['camera']);
    await page.route('**/api/index.php?**', async route => { const target = new URL(api); target.search = new URL(route.request().url()).search; await route.fulfill({ response: await route.fetch({ url: target.href }) }); });
    await page.goto(`/#/ar/${experience.unique_id}`);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: 'Start camera experience' }).click();
    await expect(frame.locator('#status')).toHaveText('Point your camera at the original printed photo.', { timeout: 100000 });
    await expect(frame.locator('#camera canvas').first()).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
    await page.goto('/'); // Camera cleanup on iframe destruction.
  } finally {
    const signedIn = await request.post(url('login'), { data: { password: 'integration-test-password' } }); const { csrf } = await signedIn.json();
    const remove = new URL(url('delete')); remove.searchParams.set('id', experience.unique_id);
    await request.delete(remove.href, { headers: { 'X-CSRF-Token': csrf } });
  }
});
