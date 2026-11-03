const platforms = ['x', 'instagram', 'chrome'];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function syncRetryRequest(job, platform) {
  if (!platforms.includes(platform) || !syncReport(job).some(report => report.platform === platform && report.warning)) return null;
  const accounts = [...new Set((job.results || []).filter(result => result.platform === platform).map(result => result.account).filter(Boolean))];
  const scope = job.instagramScope;
  const instagramAccount = scope?.account && scope.account !== 'current' ? scope.account : accounts.length === 1 ? accounts[0] : 'current';
  const selected = scope?.selections?.[instagramAccount.toLowerCase()];
  return {
    targets: [platform],
    xAccount: job.xAccount && job.xAccount !== 'current' ? job.xAccount : platform === 'x' && accounts.length ? accounts.length === 1 ? accounts[0] : accounts : 'current',
    instagramAccount,
    instagramCollectionId: platform === 'instagram' && selected?.length === 1 ? selected[0] : undefined
  };
}

export function syncReport(job) {
  const results = Array.isArray(job.results) ? job.results : [];
  const sources = platforms.filter(platform => job.targets?.includes(platform) || results.some(result => result.platform === platform));
  return sources.map(platform => {
    const name = platform === 'x' ? 'X' : platform === 'instagram' ? 'Instagram' : 'Chrome';
    const readableMessage = message => /No tab with id/i.test(message || '') ? `The background ${name} tab closed. Your saves are kept. Try syncing again.` : message || '';
    const entries = results.filter(result => result.platform === platform).map(result => ({ ...result, message: readableMessage(result.message) }));
    const issues = entries.filter(result => ['partial', 'failed'].includes(result.status));
    const missing = !entries.length;
    const warning = issues.length > 0 || missing && job.status !== 'completed';
    const messages = issues.map(result => result.message || '');
    if (missing && warning && sources.length === 1) messages.push(job.message || '');
    const notes = new Set();
    for (const message of messages) {
      if (/No tab with id|tab.*closed/i.test(message)) notes.add(`The background ${name} tab closed. Try syncing again.`);
      else if (/without more posts loading|stall|timed? out/i.test(message)) notes.add('Some posts did not finish loading. Try syncing again.');
      else if (/sign.?in|log.?in|logged.?in|reconnect|Connect @/i.test(message)) notes.add('Check that you’re signed in to this account, then retry.');
      else if (/permission|Allow .*access|Allow Chrome bookmarks/i.test(message)) notes.add('Chrome needs access before this source can sync.');
      else notes.add('Some saves could not be checked. See details below.');
    }
    if (missing && warning && !notes.size) notes.add('Sync ended before this source finished.');
    return {
      platform, entries, warning, notes: [...notes],
      imported: entries.reduce((sum, result) => sum + count(result.imported), 0),
      updated: entries.reduce((sum, result) => sum + count(result.updated), 0),
      enriched: entries.reduce((sum, result) => sum + count(result.enriched), 0),
      removed: entries.reduce((sum, result) => sum + count(result.message?.match(/(\d+) confirmed unsaves removed/i)?.[1]), 0),
      // Older helpers may have only a job-level message. Keep it available without
      // guessing counts or repeating a multi-platform paragraph on every card.
      fallback: missing && sources.length === 1 ? readableMessage(job.message) : '',
      missing
    };
  });
}
