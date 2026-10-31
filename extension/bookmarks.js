// Reading the tree never navigates a tab or changes a Chrome bookmark.
export function bookmarkPosts(tree) {
  const found = new Map(); let skipped = 0;
  function walk(nodes, folders = []) {
    for (const node of nodes || []) {
      if (node.url) {
        let url;
        try { url = new URL(node.url); } catch { skipped++; continue; }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 12000) { skipped++; continue; }
        const previous = found.get(url.href), path = folders.join(' / ');
        const savedAt = Number.isFinite(node.dateAdded) ? new Date(node.dateAdded).toISOString() : null;
        if (previous) {
          if (path && !previous.folders.includes(path)) previous.folders.push(path);
          if (savedAt && (!previous.savedAt || savedAt < previous.savedAt)) previous.savedAt = savedAt;
        } else found.set(url.href, { platform: 'chrome', url: url.href, bookmarkTitle: node.title || url.hostname, folders: path ? [path] : [], savedAt });
      } else walk(node.children, node.title ? [...folders, node.title] : folders);
    }
  }
  walk(tree); return { posts: [...found.values()], skipped };
}
