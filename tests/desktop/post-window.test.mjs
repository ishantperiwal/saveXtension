import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function fixtureSetup(ses) {
  if (ses.__fixtureInstalled) return;
  ses.__fixtureInstalled = true;
  ses.protocol.handle('https', async () => new Response('<!doctype html><title>Fixture post</title><p>Post', { headers: { 'Content-Type': 'text/html' } }));
}

test('Instagram, X and Pinterest posts slide in as a panel that must be dismissed, and other links go to the browser', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-post-window-')), appPath = join(dir, 'application');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json')); await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manager = join(appPath, 'desktop/social.mjs');
  await writeFile(manager, (await readFile(manager, 'utf8')).replace('const ses = session.fromPartition(partition);', `const ses = session.fromPartition(partition); (${fixtureSetup})(ses);`));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: join(dir, 'library'), SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await _electron.launch({ executablePath: require('electron'), args: [appPath], env });
  try {
    const page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    await desktop.evaluate(({ shell }) => { globalThis.opened = []; shell.openExternal = async url => { globalThis.opened.push(url); }; });
    const click = href => page.evaluate(href => { const link = Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener noreferrer' }); document.body.append(link); link.click(); link.remove(); }, href);
    const panel = page.locator('#post-panel');
    // What is open, seen from the app itself: only the library's window, with the post as a view inside it.
    const open = () => desktop.evaluate(({ BrowserWindow, webContents }) => ({
      windows: BrowserWindow.getAllWindows().length,
      posts: BrowserWindow.getAllWindows()[0].contentView.children.map(view => view.webContents?.getURL()).filter(url => url?.startsWith('https:')),
      bounds: BrowserWindow.getAllWindows()[0].contentView.children.at(-1)?.getBounds(),
      content: BrowserWindow.getAllWindows()[0].getContentBounds()
    }));
    const posts = async () => (await open()).posts;
    for (const [link, canonical, site] of [['https://www.instagram.com/reel/AbC123/?igsh=1', 'https://www.instagram.com/reel/AbC123/', 'Instagram'], ['https://x.com/writer/status/123?s=20', 'https://x.com/i/status/123', 'X'], ['https://www.pinterest.com/pin/456/', 'https://www.pinterest.com/pin/456/', 'Pinterest']]) {
      await click(link);
      await expect.poll(posts, { timeout: 15000 }).toEqual([canonical]);
      await expect(panel).toBeVisible(); await expect(panel.locator('.post-panel-header')).not.toContainText(site);
      await expect.poll(() => panel.evaluate(el => el.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
      assert.equal((await open()).windows, 1, 'no separate pop-up window');
      const body = await panel.locator('.post-panel-view').evaluate(el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height }; });
      await expect.poll(async () => (await open()).bounds, { message: 'the view follows the panel into place' }).toEqual({ x: Math.round(body.x), y: Math.round(body.y), width: Math.round(body.width), height: Math.round(body.height) });
      const { content } = await open();
      // The panel leaves room on its left for the note box, so on a small screen it's narrower than it would choose.
      const room = content.width - (content.width <= 860 ? 232 : 372) - 16;
      assert.equal(body.width, Math.min(site === 'Pinterest' ? 860 : 640, room), 'reels and X get a wide column, and Pinterest a wider one');
      assert(body.x + body.width <= content.width && body.x + body.width >= content.width - 40, `sits against the right edge: ${JSON.stringify({ body, content })}`);
      // Everything behind the panel is unreachable until it is dismissed.
      assert.equal(await page.evaluate(() => { const sidebar = document.querySelector('[data-action="settings"]'); const { x, y, width, height } = sidebar.getBoundingClientRect(); return document.elementFromPoint(x + width / 2, y + height / 2)?.id; }), 'post-panel');
      if (site === 'Instagram') await page.screenshot({ path: 'test-results/post-panel.png' });
      if (site === 'Instagram') await panel.locator('.post-panel-close').click();
      else if (site === 'X') await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.at(-1).webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }));
      else await page.mouse.click(40, 300);
      await expect(panel, `${site} is dismissed`).toBeHidden();
      await expect.poll(posts, { message: 'dismissing closes the post' }).toEqual([]);
    }
    // An Instagram post page fits a tall post by being narrow.
    await click('https://www.instagram.com/p/Post1/');
    await expect.poll(posts, { timeout: 15000 }).toEqual(['https://www.instagram.com/p/Post1/']);
    await expect(panel).toHaveAttribute('data-layout', 'instagram-post');
    const viewBox = () => panel.locator('.post-panel-view').evaluate(el => { const { x, y, width, height } = el.getBoundingClientRect(); return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }; });
    await expect.poll(() => panel.evaluate(el => el.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
    const narrow = await viewBox(), { height: windowHeight } = (await open()).content;
    assert(Math.abs(narrow.width - Math.max(360, (windowHeight - 179) * 9 / 16)) <= 2, `a 9:16 post fits the panel's height: ${JSON.stringify({ narrow, windowHeight })}`);
    // Either side edge resizes it, the post follows, and the width is remembered for this layout only.
    const drag = async (edge, by) => { const box = await panel.locator(`.post-panel-edge[data-edge="${edge}"]`).boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + by, y, { steps: 4 }); await page.mouse.up(); };
    await drag('left', -100);
    await expect(panel).toBeVisible();
    assert.equal((await viewBox()).width, narrow.width + 100, 'dragging the left edge outward widens it');
    await expect.poll(async () => (await open()).bounds, { message: 'the post follows the edge' }).toEqual(await viewBox());
    await drag('right', -40);
    assert.equal((await viewBox()).width, narrow.width + 60, 'dragging the right edge inward narrows it');
    await expect.poll(async () => (await open()).bounds).toEqual(await viewBox());
    await panel.locator('.post-panel-close').click(); await expect(panel).toBeHidden();
    await click('https://www.instagram.com/p/Post2/');
    await expect.poll(posts, { timeout: 15000 }).toEqual(['https://www.instagram.com/p/Post2/']);
    await expect.poll(async () => (await viewBox()).width, { message: 'remembered for the next post' }).toBe(narrow.width + 60);
    await panel.locator('.post-panel-edge[data-edge="left"]').dblclick();
    await expect.poll(async () => (await viewBox()).width, { message: 'a double-click restores the default' }).toBe(narrow.width);
    await panel.locator('.post-panel-close').click(); await expect(panel).toBeHidden();
    await click('https://x.com/writer/status/456');
    await expect.poll(posts, { timeout: 15000 }).toEqual(['https://x.com/i/status/456']);
    await panel.getByRole('button', { name: 'Open in browser', exact: true }).click();
    await expect(panel, 'sending the post to the browser dismisses it here').toBeHidden();
    await expect.poll(posts).toEqual([]);
    await expect.poll(() => desktop.evaluate(() => globalThis.opened)).toEqual(['https://x.com/i/status/456']);
    await click('https://example.org/bookmark');
    await click('https://x.com/writer');
    await expect.poll(() => desktop.evaluate(() => globalThis.opened)).toEqual(['https://x.com/i/status/456', 'https://example.org/bookmark', 'https://x.com/writer']);
    await expect(panel).toBeHidden();
    await click('https://x.com/i/status/789');
    await expect.poll(posts, { timeout: 15000 }).toEqual(['https://x.com/i/status/789']);
    await page.reload(); await page.waitForSelector('[data-action="settings"]');
    await expect.poll(posts, { message: 'a reload does not leave the post over the library' }).toEqual([]);
  } finally { await desktop.close(); await rm(dir, { recursive: true, force: true }); }
});
