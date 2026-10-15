import { test, expect } from '@playwright/test';
import fs from 'node:fs';
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test('AR compiles the photo and starts a real image-tracking engine', async ({ page, context }, info) => {
  test.skip(!process.env.STILLMOTION_TEST_AR || info.project.name !== 'desktop', 'Opt-in HTTPS/CDN/WebGL smoke check using a simulated camera.');
  test.setTimeout(120000);
  const id = 'b'.repeat(32);
  const experience = { unique_id: id, title: 'AR smoke test', image_path: 'photo.jpg', video_path: 'clip.mp4', image_width: 1000, image_height: 667 };
  await page.route('**/api/index.php?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('action') === 'media') {
      const photo = params.get('file') === 'photo.jpg';
      return route.fulfill({ contentType: photo ? 'image/jpeg' : 'video/mp4', body: fs.readFileSync(photo ? 'public/images/mountains.jpg' : 'test-results/flower.mp4') });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(params.get('action') === 'get' ? { experience } : { ok: true }) });
  });
    await context.grantPermissions(['camera']);
    await page.goto(`/#/watch/${id}`);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('button', { name: 'Start WebAR camera' }).click();
    await expect(frame.locator('#status')).toHaveText('Point your camera at the original printed photo.', { timeout: 100000 });
    await expect(frame.locator('#camera canvas').first()).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
    await page.screenshot({ path: 'test-results/ar-first-engine.png', fullPage: true });
    await page.goto('/'); // Camera cleanup on iframe destruction.
});
