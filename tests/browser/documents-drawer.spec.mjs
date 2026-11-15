import { test, expect } from '@playwright/test';

test('documents drawer renders as a floating dark glass panel on the right edge', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/documents', route => route.fulfill({
    json: {
      documents: [
        { id: 'doc-1', title: 'Website Bookmarks', updatedAt: new Date().toISOString() },
        { id: 'doc-2', title: 'Repo and Tools', updatedAt: new Date().toISOString() },
      ],
    },
  }));

  await page.route('**/api/documents/doc-1', route => route.fulfill({
    json: {
      id: 'doc-1',
      title: 'Website Bookmarks',
      description: 'Bookmarks collected across the web.',
      body: 'Hello world',
      updatedAt: new Date().toISOString(),
    },
  }));
  await page.route('**/api/document-ai', route => route.fulfill({ json: { job: null } }));

  await page.goto('/');
  const edge = page.locator('.documents-edge');
  const notch = page.locator('.documents-notch');
  await expect(edge).toHaveAttribute('data-open', 'false');

  const closed = await page.evaluate(() => {
    const e = document.querySelector('.documents-edge').getBoundingClientRect();
    const n = document.querySelector('.documents-notch').getBoundingClientRect();
    return { edgeLeft: e.left, notchLeft: n.left, notchRight: n.right, width: window.innerWidth };
  });
  expect(closed.edgeLeft).toBeGreaterThanOrEqual(closed.width - 0.5);
  expect(closed.notchLeft).toBeLessThan(closed.width);
  expect(closed.notchRight).toBeGreaterThan(closed.width - 10);

  await notch.click();
  await expect(edge).toHaveAttribute('data-open', 'true');
  await expect(page.locator('.documents-item')).toHaveCount(2);

  const openStyle = await edge.evaluate(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      top: r.top,
      rightGap: window.innerWidth - r.right,
      bottomGap: window.innerHeight - r.bottom,
      borderRadius: s.borderRadius,
      backdropFilter: s.backdropFilter,
      backgroundImage: s.backgroundImage,
    };
  });
  expect(openStyle.top).toBeCloseTo(16, 0);
  expect(openStyle.rightGap).toBeCloseTo(16, 0);
  expect(openStyle.bottomGap).toBeCloseTo(16, 0);
  expect(openStyle.borderRadius).toBe('28px');
  expect(openStyle.backdropFilter).toContain('blur(24px)');
  expect(openStyle.backgroundImage).toContain('rgba(14, 17, 14');

  await page.keyboard.press('Escape');
  await expect(edge).toHaveAttribute('data-open', 'false');

  // Opening a document places the Saved status in the bottom-right footer instead of the title row.
  await notch.click();
  await page.locator('[data-doc-id="doc-1"]').click();
  await expect(page.locator('#document-view')).toBeVisible();
  const dialogOutline = await page.locator('#document-view').evaluate(el => {
    el.focus();
    return getComputedStyle(el).outlineStyle;
  });
  expect(dialogOutline).toBe('none');
  await expect(page.locator('#document-view .document-head .document-status')).toHaveCount(0);
  const footStatus = await page.locator('#document-view .document-foot').evaluate(el => {
    const status = el.querySelector('.document-status');
    const hint = el.querySelector('.document-foot-hint');
    const fr = el.getBoundingClientRect();
    const sr = status.getBoundingClientRect();
    const hr = hint.getBoundingClientRect();
    return { text: status.textContent, rightGap: fr.right - sr.right, afterHint: sr.left > hr.right };
  });
  expect(footStatus.text).toBe('Saved');
  expect(footStatus.afterHint).toBe(true);
  expect(footStatus.rightGap).toBeCloseTo(28, 0);
});
