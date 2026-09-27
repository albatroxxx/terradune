import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [390, 1440]) {
  for (const route of ['./', 'docs/', 'releases/', '404.html']) {
    test(`${route} loads and is accessible at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('main h1')).toHaveCount(1);
      // Scroll lazy images into view before checking that every asset decoded.
      for (const image of await page.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(accessibility.violations).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
    });
  }
}

for (const width of [320, 720, 721, 1440, 1920]) {
  test(`home keeps the approved layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    const bounds = selector => page.locator(selector).boundingBox();
    const brand = await bounds('.brand');
    const navigation = await bounds('.site-header nav');
    const media = await bounds('.hero-media');
    expect(Math.abs(media.x - brand.x)).toBeLessThan(2);
    expect(Math.abs(media.x + media.width - navigation.x - navigation.width)).toBeLessThan(2);
    const [details, map, graph] = await Promise.all(
      ['.hero-details', '.hero-map', '.hero-graph'].map(bounds),
    );
    if (width > 720) {
      expect(details.x + details.width).toBeLessThan(map.x);
      expect(map.x + map.width).toBeLessThan(graph.x);
      expect(Math.abs(details.height - map.height)).toBeLessThan(2);
      expect(Math.abs(graph.height - map.height)).toBeLessThan(2);
      expect(Math.abs(details.y - graph.y)).toBeLessThan(2);
    } else {
      expect(map.y + map.height).toBeLessThanOrEqual(details.y);
      expect(Math.abs(details.y - graph.y)).toBeLessThan(2);
      expect(details.x + details.width).toBeLessThan(graph.x);
    }
    const intro = await bounds('.intro');
    expect(intro.y).toBeGreaterThanOrEqual(media.y + media.height);
    await expect(page.getByRole('heading', { name: 'Three views. One plan.' })).toBeVisible();
    await expect(page.locator('.product-gallery figure')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Install with Go', exact: true })).toHaveAttribute('href', 'docs/#go');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  });
}

test('keyboard skip link reaches the main content', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('documentation command blocks can be scrolled with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('docs/');
  const command = page.getByRole('region', { name: 'Windows PATH setup' });
  await command.focus();
  await expect(command).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => command.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});
