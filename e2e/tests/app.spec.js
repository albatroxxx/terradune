import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#meta')).toContainText('35 resources');
});

async function graphReady(page) {
  await expect(page.locator('#graph')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.graph-node').first()).toBeVisible();
  await expect(page.locator('.edge').first()).toBeVisible();
}

test('tabs follow keyboard order and expand without losing the current view', async ({ page }) => {
  const map = page.getByRole('tab', { name: 'Resource Map', exact: true });
  await expect(map).toHaveAttribute('aria-selected', 'true');
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toBeFocused();
  await expect(page.locator('#review-count')).toHaveText('35 of 35 resources');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toBeFocused();
  await graphReady(page);
  const before = await page.locator('#graph').boundingBox();
  await page.getByRole('button', { name: 'Expand view', exact: true }).click();
  await expect(page.locator('header')).toBeHidden();
  const after = await page.locator('#graph').boundingBox();
  expect(after.height).toBeGreaterThan(before.height + 100);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Expand view', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('plan filters and resource details work with the keyboard', async ({ page }) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search resources' }).fill('aws_instance.api');
  await expect(page.locator('#review-count')).toHaveText('1 of 35 resources');
  const resource = page.locator('.resource-open');
  await resource.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configuration', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(resource).toBeFocused();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('#review-count')).toHaveText('35 of 35 resources');
  await page.locator('#service-nav').getByRole('button', { name: /^Databases/ }).click();
  await expect(page.locator('#review-count')).toHaveText('1 of 35 resources');
});

test('legend and pinned map path unwind one layer per Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Legend', exact: true })).toBeFocused();
  const pin = page.locator('[data-id="aws_instance.api"] > .card-main').first();
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pinned')).toBeVisible();
  await expect(page.locator('#ribbons path').first()).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pinned')).toBeHidden();
});

test('focused graph has real edges and keyboard-operable resources', async ({ page }) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Show relationships for aws_instance.api in platform', exact: true }).click();
  await graphReady(page);
  await expect(page.locator('#graph-context')).toHaveText('aws_instance.api');
  const node = page.locator('.graph-node').filter({ hasText: 'api' }).first();
  await node.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(node).toBeFocused();
});

for (const target of ['resource', 'service', 'action', 'map', 'graph']) {
  test(`live updates preserve ${target} keyboard focus`, async ({ page, request }) => {
    let control;
    if (target === 'map') control = page.locator('[data-id="aws_instance.api"] > .card-main').first();
    else if (target === 'graph') {
      await page.getByRole('tab', { name: 'Graph', exact: true }).click();
      await graphReady(page);
      control = page.locator('.graph-node').first();
    } else {
      await page.getByRole('tab', { name: 'Plan', exact: true }).click();
      control = target === 'service' ? page.locator('#service-nav button').first()
        : target === 'action' ? page.locator('#chips button').first() : page.locator('.resource-open').first();
    }
    await control.focus();
    await control.evaluate(el => el.setAttribute('data-e2e-before-refresh', 'true'));
    await request.post('/__test/refresh');
    // A fresh node proves that the SSE-triggered paint, not just the HTTP call, completed.
    await expect(page.locator('[data-e2e-before-refresh]')).toHaveCount(0);
    await expect(control).toBeFocused();
  });
}

for (const view of ['Resource Map', 'Plan', 'Graph']) {
  test(`${view} has no automated WCAG A/AA violations`, async ({ page }, testInfo) => {
    await page.getByRole('tab', { name: view, exact: true }).click();
    if (view === 'Graph') await graphReady(page);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    await testInfo.attach('axe-results', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`${view.replaceAll(' ', '-')}.png`) });
    expect(result.violations).toEqual([]);
  });
}

test('resource dialog has no automated WCAG A/AA violations', async ({ page }, testInfo) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.locator('.resource-open').first().click();
  await expect(page.getByRole('heading', { name: 'Configuration', exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach('axe-results', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
  expect(result.violations).toEqual([]);
});

for (const width of [320, 390]) {
  test(`all views fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const view of ['Resource Map', 'Plan', 'Graph']) {
      await page.getByRole('tab', { name: view, exact: true }).click();
      if (view === 'Graph') await graphReady(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const box = await page.getByRole('tabpanel', { name: view, exact: true }).boundingBox();
      expect(box.height).toBeGreaterThan(150);
      await page.screenshot({ path: testInfo.outputPath(`${view.replaceAll(' ', '-')}-${width}.png`) });
    }
  });
}
