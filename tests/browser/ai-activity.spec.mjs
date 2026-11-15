import { test, expect } from '@playwright/test';

test.use({
  storageState: {
    cookies: [],
    origins: [{
      origin: 'http://localhost:3211',
      localStorage: [
        { name: 'savex-live-previews', value: 'false' },
        { name: 'savex-card-view', value: 'grid' },
      ],
    }],
  },
});

function makePost(id, overrides = {}) {
  return {
    id,
    platform: 'x',
    url: `https://x.com/tester/status/${id}`,
    title: '',
    text: `Saved thought #${id}`,
    author: '@tester',
    authorName: 'Tester',
    thumbnail: '',
    media: [{ type: 'image', url: '/favicon.ico', width: 64, height: 64 }],
    kind: 'text',
    tags: [],
    topics: ['Design'],
    accounts: ['x:@tester'],
    notes: '',
    savedAt: `2026-11-10T10:${String(id % 60).padStart(2, '0')}:00Z`,
    archived: false,
    ...overrides,
  };
}

async function setupAiFixture(page, { posts, doc, docJobState, noteJobsState, scanHandler }) {
  await page.route('**/api/ai-search', route => route.fulfill({
    json: {
      selected: 'deepseek',
      name: 'DeepSeek',
      model: 'DeepSeek-V3',
      localReady: false,
      vision: { model: 'vision-1' },
      tools: [],
    },
  }));
  await page.route('**/api/note-ai/models', route => route.fulfill({
    json: { models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
  }));
  await page.route('**/api/posts?scope=all', route => route.fulfill({
    json: { posts, runs: [], topics: [{ name: 'Design', count: posts.length }], instagramCollections: [], instagramSaveLists: {} },
  }));
  await page.route('**/api/posts/*/notes', route => route.fulfill({
    json: { ok: true, updatedAt: '2026-11-15T10:00:00Z' },
  }));
  await page.route('**/api/documents', route => route.fulfill({ json: { documents: [doc] } }));
  await page.route(`**/api/documents/${doc.id}`, route => route.fulfill({ json: doc }));

  await page.route('**/api/document-ai', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      docJobState.current = {
        id: docJobState.nextId++,
        post: Number(body.post),
        documentId: doc.id,
        documentTitle: doc.title,
        request: body.request || '',
        state: 'running',
        step: 'Reading this save',
      };
      return route.fulfill({ json: { job: docJobState.current } });
    }
    if (req.method() === 'DELETE') {
      if (docJobState.current) docJobState.current = { ...docJobState.current, state: 'cancelled' };
      return route.fulfill({ json: { job: docJobState.current } });
    }
    if (docJobState.current && docJobState.pollAdvance) {
      docJobState.pollCount += 1;
      if (docJobState.pollCount >= docJobState.pollAdvance) {
        docJobState.current = {
          ...docJobState.current,
          state: 'done',
          summary: `Added notes from post #${docJobState.current.post} to ${doc.title}.`,
          changeId: 'chg-doc-1',
        };
      }
    }
    return route.fulfill({ json: { job: docJobState.current } });
  });

  await page.route('**/api/document-ai/undo', route => route.fulfill({ json: { ok: true } }));

  await page.route('**/api/note-ai', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      const job = {
        id: noteJobsState.nextId++,
        post: Number(body.post),
        request: body.request,
        state: 'running',
        step: 'Drafting note',
        before: '',
        notes: '',
        updatedAt: '2026-11-15T10:00:00Z',
      };
      noteJobsState.jobs.set(job.id, job);
      return route.fulfill({ json: { job } });
    }
    if (req.method() === 'DELETE') {
      const body = req.postDataJSON();
      for (const [id, job] of noteJobsState.jobs) {
        if (job.post === Number(body.post)) noteJobsState.jobs.set(id, { ...job, state: 'cancelled' });
      }
      const cancelled = [...noteJobsState.jobs.values()].find(j => j.post === Number(body.post));
      return route.fulfill({ json: { job: cancelled } });
    }
    for (const [id, job] of noteJobsState.jobs) {
      if (job.state === 'running') {
        noteJobsState.jobs.set(id, {
          ...job,
          state: 'done',
          notes: 'Concise AI summary of post.',
          before: '',
          updatedAt: '2026-11-15T10:01:00Z',
        });
      }
    }
    return route.fulfill({ json: { jobs: [...noteJobsState.jobs.values()] } });
  });

  await page.route('**/api/ai-search/scan', scanHandler);
}

test('tracks multiple AI jobs in one bottom-right list, shows Open document + Show post, persists across reload, and moves focus on dismiss', async ({ page }) => {
  const posts = [
    makePost(101, { text: 'First architecture insight' }),
    makePost(102, { text: 'Second visual design breakdown', thumbnail: '/favicon.ico', localImage: '/favicon.ico' }),
  ];
  const doc = {
    id: 'doc-design',
    title: 'Design Notes',
    description: 'Visual notes',
    body: 'Existing line\n\nNew distilled note.',
    updatedAt: '2026-11-15T10:00:00Z',
  };
  const docJobState = { nextId: 500, pollCount: 0, pollAdvance: 1, current: null };
  const noteJobsState = { nextId: 700, jobs: new Map() };
  let finishScan;
  const scanPromise = new Promise(resolve => { finishScan = resolve; });

  await setupAiFixture(page, {
    posts,
    doc,
    docJobState,
    noteJobsState,
    scanHandler: async route => {
      await scanPromise;
      await route.fulfill({ json: { description: 'Clean geometric layout', model: 'vision-1' } });
    },
  });

  await page.goto('/');
  await expect(page.locator('#ai-status')).toBeHidden();

  // 1. Start image scan on post 102 (held open until we finish it).
  const card102 = page.locator('.save-card[data-post-id="102"]');
  await card102.locator('[data-scan-post]').click();

  // 2. Start Note AI on post 101 while scan is still running.
  const card101 = page.locator('.save-card[data-post-id="101"]');
  await card101.locator('[data-open="101"]').click();
  await card101.locator('[data-note-ai="101"]').click();
  const noteInput = card101.locator('.note-ai-input');
  await noteInput.fill('Summarize the core idea');
  await noteInput.press('Enter');

  // Starts collapsed by default in a compact bottom-right pill with 2 running items.
  await expect(page.locator('#ai-status')).toBeVisible();
  await expect(page.locator('#ai-status')).toHaveAttribute('data-expanded', 'false');
  await expect(page.locator('#ai-toast-panel')).toBeHidden();
  await expect(page.locator('#ai-status .ai-toast-summary')).toContainText('2 running');

  // Positioned at bottom right of viewport.
  const box = await page.locator('#ai-status').boundingBox();
  const viewport = page.viewportSize();
  expect(box.x + box.width).toBeGreaterThan(viewport.width - 60);
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 60);

  // Expanding on click reveals both tasks as <li> items, keeping the chevron beside the text.
  await page.locator('#ai-status [data-ai-toggle]').click();
  await expect(page.locator('#ai-status')).toHaveAttribute('data-expanded', 'true');
  await expect(page.locator('#ai-toast-panel')).toBeVisible();
  const chevronGap = await page.locator('#ai-status').evaluate(el => {
    const summary = el.querySelector('.ai-toast-summary').getBoundingClientRect();
    const chevron = el.querySelector('.ai-toast-chevron').getBoundingClientRect();
    return chevron.left - summary.right;
  });
  expect(chevronGap).toBeGreaterThanOrEqual(4);
  expect(chevronGap).toBeLessThanOrEqual(14);
  const listItems = page.locator('#ai-status .ai-toast-list > li.ai-toast-item');
  await expect(listItems).toHaveCount(2);

  // Let the image scan complete too.
  finishScan();

  // 3. Send post 101 to document -> finishes and keeps Open document + Show post + Undo in the list.
  await card101.locator('[data-action="send-to-document"]').click();
  await expect(page.locator('#send-document-form')).toBeVisible();
  await page.locator('#send-document-form button[type="submit"]').click();

  const docRow = page.locator('#ai-status li.ai-toast-item', { hasText: 'Updated “Design Notes”' });
  await expect(docRow).toBeVisible();
  await expect(docRow.getByRole('button', { name: 'Open document' })).toBeVisible();
  await expect(docRow.getByRole('button', { name: 'Show post' })).toBeVisible();
  await expect(docRow.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.locator('#ai-status [data-ai-clear]')).toBeVisible();
  await expect(listItems).toHaveCount(3);

  // Clicking Open document opens the document view without removing the nudge item.
  await docRow.getByRole('button', { name: 'Open document' }).click();
  await expect(page.locator('#document-view')).toBeVisible();
  await expect(docRow).toBeAttached();

  // Navigate to a view that hides post 101, then click Show post.
  await page.locator('#document-view [data-doc-action="close"]').click();
  await expect(page.locator('#document-view')).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search saves' }).fill('nonexistent-xyz');
  await expect(card101).toHaveCount(0);

  await docRow.getByRole('button', { name: 'Show post' }).click();
  await expect(card101).toBeVisible();
  await expect(card101).toHaveClass(/is-ai-located/);
  // Still persistent after using action buttons.
  await expect(listItems).toHaveCount(3);

  // 4. Reload restores collapsed pill; expanding reveals persisted items; explicit dismiss removes one cleanly.
  await page.reload();
  await expect(page.locator('#ai-status')).toHaveAttribute('data-expanded', 'false');
  await page.locator('#ai-status [data-ai-toggle]').click();
  await expect(listItems).toHaveCount(3);
  await expect(docRow.getByRole('button', { name: 'Open document' })).toBeVisible();
  await expect(docRow.getByRole('button', { name: 'Show post' })).toBeVisible();

  // Focus keyboard test: dismiss button moves focus cleanly to a remaining control in #ai-status.
  const dismissDoc = docRow.locator('[data-ai-dismiss]');
  await dismissDoc.focus();
  await dismissDoc.press('Enter');
  await expect(listItems).toHaveCount(2);
  await expect(docRow).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#ai-status')))).toBe(true);

  await page.reload();
  await page.locator('#ai-status [data-ai-toggle]').click();
  await expect(listItems).toHaveCount(2);
  await expect(docRow).toHaveCount(0);

  // Clicking toggle collapses back to the pill cleanly; re-toggling re-expands with animation.
  await page.locator('#ai-status [data-ai-toggle]').click();
  await expect(page.locator('#ai-status')).toHaveAttribute('data-expanded', 'false');
  await expect(page.locator('#ai-toast-panel')).toBeHidden();
  await page.locator('#ai-status [data-ai-toggle]').click();
  await expect(page.locator('#ai-status')).toHaveAttribute('data-expanded', 'true');
  await expect(page.locator('#ai-toast-panel')).toBeVisible();
  await expect(listItems).toHaveCount(2);

  // Clear done in top bar clears all remaining finished items cleanly.
  await page.locator('#ai-status [data-ai-clear]').click();
  await expect(page.locator('#ai-status')).toBeHidden();
});

test('Show post scrolls to a distant X post in one click when switching out of an Instagram Saved Posts view', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('savex-card-view', 'feed');
    localStorage.setItem('savex-live-previews', 'false');
    localStorage.setItem('savex-ai-activity', JSON.stringify([{
      key: 'doc:901',
      serverRef: 'doc:901',
      kind: 'document',
      state: 'done',
      loaderKind: 'write',
      title: 'Updated “Design Notes”',
      detail: 'Added X thread notes.',
      postId: 230,
      documentId: 'doc-design',
      documentTitle: 'Design Notes',
      canUndo: false,
      undone: false,
      createdAt: Date.now(),
    }]));
  });

  // Build 32 posts: Instagram Saved Posts + distant X post #230 beyond CARD_BATCH_SIZE (24).
  const posts = [];
  for (let i = 1; i <= 32; i++) {
    const id = 200 + i;
    const isTarget = id === 230;
    posts.push(makePost(id, isTarget
      ? {
          platform: 'x',
          accounts: ['x:@author'],
          author: '@author',
          text: 'Target X post far down the feed',
          localImage: '/favicon.ico',
          thumbnail: '/favicon.ico',
          savedAt: '2026-11-10T09:00:00Z',
        }
      : {
          platform: 'instagram',
          accounts: ['instagram:@designer'],
          author: '@designer',
          collections: [{ id: 'ig-saved', name: 'Saved posts', platform: 'instagram' }],
          text: `Instagram saved item #${id}`,
          localImage: '/favicon.ico',
          thumbnail: '/favicon.ico',
          savedAt: `2026-11-10T10:${String(60 - i).padStart(2, '0')}:00Z`,
        }));
  }

  await page.route('**/api/ai-search', route => route.fulfill({
    json: { selected: 'deepseek', name: 'DeepSeek', model: 'DeepSeek-V3', localReady: false, vision: { model: 'vision-1' }, tools: [] },
  }));
  await page.route('**/api/note-ai/models', route => route.fulfill({ json: { models: [] } }));
  await page.route('**/api/note-ai', route => route.fulfill({ json: { jobs: [] } }));
  await page.route('**/api/document-ai', route => route.fulfill({ json: { job: null } }));
  await page.route('**/api/documents', route => route.fulfill({ json: { documents: [{ id: 'doc-design', title: 'Design Notes' }] } }));
  await page.route('**/api/posts?scope=all', route => route.fulfill({
    json: {
      posts,
      runs: [],
      topics: [],
      instagramCollections: [{ id: 'ig-saved', name: 'Saved posts', account: '@designer', platform: 'instagram', count: 31 }],
      instagramSaveLists: {},
    },
  }));

  await page.goto('/');

  // Navigate to the Instagram account's Saved posts collection.
  await page.locator('[data-instagram-collection="ig-saved"]').click();

  // Target X post 230 should NOT be in the Instagram Saved Posts view.
  const targetCard = page.locator('.save-card[data-post-id="230"]');
  await expect(targetCard).toHaveCount(0);

  // Expand AI status and click Show post ONCE.
  await page.locator('#ai-status [data-ai-toggle]').click();
  await page.locator('#ai-status').getByRole('button', { name: 'Show post' }).click();

  // Wait for smooth scroll + view switch + locate highlight in ONE click.
  await expect(targetCard).toBeVisible();
  await expect(targetCard).toHaveClass(/is-ai-located/);
  await expect(async () => {
    const rect = await targetCard.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
    });
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeLessThan(rect.vh - 60);
  }).toPass({ timeout: 4000 });
});
