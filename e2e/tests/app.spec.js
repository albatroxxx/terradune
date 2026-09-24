import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#meta')).toContainText('35 resources');
});

async function graphReady(page) {
  await expect(page.locator('#graph')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.graph-node').first()).toBeVisible();
  const edge = page.locator('.edge').first();
  await expect(edge).toBeAttached();
  expect(await edge.evaluate(el => el.getTotalLength())).toBeGreaterThan(0);
  await expect(edge).toHaveCSS('visibility', 'visible');
  await expect(edge).not.toHaveCSS('stroke', 'none');
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
  await page.locator('#service-nav').getByRole('button', { name: /^RDS subnet group/ }).click();
  await expect(page.locator('#review-count')).toHaveText('1 of 35 resources');
});

test('plan resource types remain separate and map endpoints are circles', async ({ page }, testInfo) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await page.locator('#service-nav [data-service="aws_instance"]').click();
  await expect(page.locator('#review-count')).toHaveText('3 of 35 resources');
  await expect(page.locator('.service-cell')).toHaveText(['EC2 instance', 'EC2 instance', 'EC2 instance']);
  await page.locator('#service-nav [data-service="aws_vpc"]').click();
  await expect(page.locator('#review-count')).toHaveText('1 of 35 resources');
  await expect(page.locator('.service-cell')).toHaveText('VPC');
  await page.locator('#service-nav [data-service=""]').click();
  await page.screenshot({ path: testInfo.outputPath('plan-resource-types.png') });
  await page.getByRole('tab', { name: 'Resource Map', exact: true }).click();
  await page.getByRole('button', { name: 'Pin path: platform-public-us-east-1a, Subnet, existing', exact: true }).click();
  const direct = page.locator('#ribbons path[data-from="aws_vpc.main"][data-to="aws_subnet.public[0]"]');
  const indirect = page.locator('#ribbons path[data-from="aws_subnet.public[0]"][data-to="aws_route_table.public"]');
  await expect(direct).toHaveAttribute('marker-end', 'url(#map-direct)');
  await expect(indirect).toHaveAttribute('marker-end', 'url(#map-indirect)');
  await expect(direct).toHaveCSS('stroke', 'rgb(22, 128, 120)');
  await expect(indirect).toHaveCSS('stroke', 'rgb(83, 122, 176)');
  await expect(direct).toHaveAttribute('opacity', '1');
  await expect(indirect).toHaveAttribute('opacity', '1');
  await expect(page.locator('#ribbons marker polygon')).toHaveCount(0);
  await expect(page.locator('#map-direct circle')).toHaveCSS('fill', 'rgb(22, 128, 120)');
  await expect(page.locator('#map-indirect circle')).toHaveCSS('fill', 'rgb(246, 248, 248)');
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('map-circle-connections.png') });
});

test('legend and pinned map path unwind one layer per Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
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
  test(`live updates preserve ${target} keyboard focus`, async ({ page, request }, testInfo) => {
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
    await page.screenshot({ path: testInfo.outputPath(`focus-${target}.png`) });
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
  await page.screenshot({ path: testInfo.outputPath('resource-dialog.png') });
  expect(result.violations).toEqual([]);
});

test('pinned resource map and legend retain readable contrast', async ({ page }, testInfo) => {
  await page.locator('[data-id="aws_instance.api"] > .card-main').first().click();
  await page.getByRole('button', { name: 'Legend', exact: true }).click();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach('axe-results', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('pinned-map-legend.png') });
  expect(result.violations).toEqual([]);
});

test('dialog returns to its resource after a live update replaces the opener', async ({ page, request }) => {
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  const opener = page.locator('.resource-open').first();
  await opener.evaluate(el => el.setAttribute('data-e2e-before-refresh', 'true'));
  await opener.click();
  await request.post('/__test/refresh');
  await expect(page.locator('[data-e2e-before-refresh]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('a pending graph layout never steals focus from the search field', async ({ page, request }) => {
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await graphReady(page);
  await page.locator('.graph-node').first().focus();
  await request.post('/__test/refresh');
  await page.getByRole('searchbox').focus();
  await graphReady(page);
  await expect(page.getByRole('searchbox')).toBeFocused();
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

test('route and attachment changes retain map context and inspectable diffs', async ({ page, request }, testInfo) => {
  try {
    await request.post('/__test/connection-changes');
    await expect(page.locator('#meta')).toContainText('20 resources');
    const table = page.locator('.card[data-id="aws_route_table.main"]');
    await expect(table).toContainText('5 attached changes');
    await expect(table).toHaveClass('card existing');
    await page.getByRole('checkbox', { name: 'Changes only' }).check();
    await expect(page.locator('#shown')).toHaveText('9 changes · 11 context');
    await expect(table).toBeVisible();
    await page.getByRole('button', { name: 'Expand view', exact: true }).click();
    await expect(table).toBeVisible();
    await expect(page.locator('#shown')).toHaveText('9 changes · 11 context');
    await page.getByRole('button', { name: 'Restore view', exact: true }).click();
    await expect(page.locator('.card[data-id="aws_lb_target_group.api"]').first()).toContainText('1 attached change');
    await page.locator('.connection-changes > summary').click();
    await expect(page.locator('.connection-open')).toHaveCount(8);
    const removed = page.locator('.connection-open[data-connection="aws_route.removed"]');
    await expect(removed).toContainText('::/0');
    await removed.click();
    await expect(page.getByRole('dialog')).toContainText('igw-synthetic');
    await expect(page.getByRole('dialog')).toContainText('::/0');
    await page.keyboard.press('Escape');
    await expect(removed).toBeFocused();

    await removed.evaluate(el => el.setAttribute('data-e2e-before-refresh', 'true'));
    await request.post('/__test/connection-changes');
    await expect(page.locator('[data-e2e-before-refresh]')).toHaveCount(0);
    await expect(removed).toBeFocused();
    await expect(page.locator('.connection-changes')).toHaveAttribute('open', '');
    await table.locator('.card-detail').click();
    const changedRoute = page.locator('.rel').filter({ hasText: 'aws_route.updated' });
    await changedRoute.locator('summary').click();
    await expect(changedRoute.locator('.was').filter({ hasText: 'nat-synthetic' })).toBeVisible();
    await expect(changedRoute).toContainText('igw-synthetic');
    await page.keyboard.press('Escape');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('connection-changes.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(table).toBeVisible();
    await expect(page.locator('#shown')).toHaveText('9 changes · 11 context');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('connection-changes-mobile.png') });
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await expect(page.locator('#review-count')).toHaveText('9 of 20 resources');
    await expect(page.locator('.resource-open').filter({ hasText: 'aws_route_table.main' })).toHaveCount(0);
  } finally {
    await request.post('/__test/refresh');
  }
});

test('dense subnet previews stay compact and expose all resources in natural order', async ({ page, request }, testInfo) => {
  try {
    await request.post('/__test/dense-vpc');
    await expect(page.locator('.subnet-more')).toHaveText('View all 30 resources');
    await expect(page.locator('[data-compact]')).toHaveCount(5);
    const rows = page.locator('[data-inventory][data-id^="aws_instance."]');
    await expect(rows).toHaveCount(30);
    await expect(rows.locator('.n')).toHaveText(Array.from({length: 30}, (_, i) => `server-${String(i + 1).padStart(2, '0')}`));
    expect((await page.locator('.subnet-group').boundingBox()).height).toBeLessThan(400);
    await page.screenshot({path: testInfo.outputPath('dense-vpc.png')});
    await page.getByRole('button', {name: 'View all 30 resources', exact: true}).click();
    const subnet = page.getByRole('combobox', {name: 'Subnet filter for Demo VPC'});
    await expect(subnet).toHaveValue('aws_subnet.servers');
    await expect(subnet).toBeFocused();
    const last = rows.filter({hasText: 'server-30'});
    await last.locator('.card-main').click();
    await expect(last.locator('.card-main')).toBeFocused();
    await expect(page.locator('[data-compact][data-id="aws_instance.servers[29]"]')).toBeAttached();
    await expect(last).toHaveClass(/pinned/);
    await last.locator('.card-detail').click();
    await expect(page.getByRole('dialog')).toContainText('t3.small');
    await page.keyboard.press('Escape');
    await expect(last.locator('.card-detail')).toBeFocused();
    await last.locator('.card-detail').evaluate(el => el.dataset.beforeRefresh = 'true');
    await request.post('/__test/dense-vpc');
    await expect(page.locator('[data-before-refresh]')).toHaveCount(0);
    await expect(last.locator('.card-detail')).toBeFocused();
    await expect(subnet).toHaveValue('aws_subnet.servers');
    const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.setViewportSize({width: 390, height: 844});
    await expect(rows).toHaveCount(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path: testInfo.outputPath('dense-vpc-mobile.png')});
    await page.getByRole('checkbox', {name: 'Changes only'}).check();
    await expect(page.locator('[data-inventory]')).toHaveCount(30);
    await page.getByRole('tab', {name: 'Plan', exact: true}).click();
    await expect(page.locator('#review-count')).toHaveText('30 of 35 resources');
  } finally {
    await request.post('/__test/refresh');
  }
});

test('mixed VPC inventory includes shared databases and container services only once', async ({ page, request }, testInfo) => {
  try {
    await request.post('/__test/mixed-vpc');
    await expect(page.locator('#meta')).toContainText('22 resources');
    const main = page.locator('.vpc-inventory').filter({has: page.getByRole('combobox', {name: 'Subnet filter for Demo VPC'})});
    for (const id of ['aws_db_instance.orders', 'aws_rds_cluster_instance.analytics', 'aws_ecs_service.api', 'aws_eks_fargate_profile.workers', 'aws_elasticache_cluster.cache']) {
      const row = main.locator(`[data-inventory][data-id="${id}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('secondary, servers');
    }
    await expect(main.locator('[data-id="aws_ecs_service.api"]')).toContainText('FARGATE');
    await expect(main.locator('[data-id="aws_db_instance.orders"]')).toContainText('db.t4g.small');
    await expect(main.locator('[data-id="aws_instance.other"]')).toHaveCount(0);
    await expect(main.locator('[data-id="aws_lambda_function.outside"]')).toHaveCount(0);
    await page.getByRole('combobox', {name: 'Subnet filter for Demo VPC'}).selectOption('aws_subnet.secondary');
    await expect(main.locator('[data-id="aws_instance.app"]')).toHaveCount(0);
    await expect(main.locator('[data-id="aws_db_instance.orders"]')).toHaveCount(1);
    await page.screenshot({path: testInfo.outputPath('mixed-vpc.png')});
    const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  } finally {
    await request.post('/__test/refresh');
  }
});
