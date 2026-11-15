// Deleting a Chrome bookmark the person confirmed in the library. Only this Chrome profile's
// bookmarks are reachable, only exact matches of the saved address are touched, and the
// library hears it worked only after two fresh reads of the tree no longer contain it.
const normal = value => { try { return new URL(value).href; } catch { return null; } };
export function matchingBookmarks(tree, url) {
  const found = [];
  const walk = nodes => { for (const node of nodes || []) { if (node.url) { if (normal(node.url) === url) found.push(node); } else walk(node.children); } };
  walk(tree); return found;
}
export async function deleteBookmark(job, { request, instance, sleep }) {
  let acted = false;
  const finish = body => request(`/unsaves/${job.id}/finish`, { instance, ...body });
  try {
    if (normal(job.url) !== job.url) throw new Error('This bookmark’s address couldn’t be read. Nothing was deleted.');
    const matches = matchingBookmarks(await chrome.bookmarks.getTree(), job.url);
    // Bookmarks set by an organization can't be removed, so none are, rather than some.
    if (matches.some(node => node.unmodifiable)) throw new Error('Your organization set this bookmark in Chrome, so it can’t be deleted here. Nothing was deleted.');
    await request(`/unsaves/${job.id}/act`, { instance, found: matches.length });
    acted = matches.length > 0;
    for (const node of matches) await chrome.bookmarks.remove(node.id);
    const gone = [];
    for (let i = 0; i < 2; i++) {
      await sleep(400);
      if (matchingBookmarks(await chrome.bookmarks.getTree(), job.url).length) throw new Error('This bookmark is still in Chrome. Check Chrome before trying again.');
      gone.push({ state: 'unsaved', account: job.account, externalId: job.external_id, checkedAt: Date.now() });
    }
    await finish({ status: 'succeeded', removed: matches.length, observations: gone });
  } catch (error) { await finish({ status: acted ? 'uncertain' : 'failed', message: error.message }).catch(() => {}); }
}
