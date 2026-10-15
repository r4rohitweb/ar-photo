import { test, expect } from '@playwright/test';
test('local development server accepts real photo and video uploads', async ({ page }) => {
  test.skip(!process.env.STILLMOTION_LOCAL_SMOKE, 'Opt-in check against the configured development database.');
  await page.goto('/');
  await page.getByLabel('Upload photo').setInputFiles('public/images/mountains.jpg');
  await page.getByLabel('Upload video').setInputFiles('test-results/flower.mp4');
  await page.getByLabel('Give your memory a name').fill('Local upload verification');
  await page.getByRole('button', { name: 'Generate experience' }).click();
  await expect(page).toHaveURL(/#\/preview\/[a-f0-9]{32}/);
  await expect(page.getByAltText('QR code to play this memory')).toBeVisible();
  const id = page.url().split('/').pop();
  console.log(`Created verification experience: ${id}`);
  await page.getByRole('link', { name: 'Watch without camera' }).click();
  await expect(page.locator('.memory-player video')).toHaveJSProperty('paused', false, { timeout: 15000 });
  await expect(page.locator('.memory-player video')).toHaveCSS('opacity', '1');
});
