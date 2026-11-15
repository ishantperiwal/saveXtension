// One line for AI jobs that may open a post on its site: filling a note and sending a post to a document.
// Only one holds it at a time, so the site only ever sees one visit; the rest wait their turn, first come first served
// (user's decision). take() resolves with a release function once it's the caller's turn.
export function aiLine() {
  let holder = null;
  const waiting = [];
  function release() {
    let released = false;
    return () => {
      if (released) return;
      released = true; holder = null;
      const next = waiting.shift();
      if (next) { holder = next.kind; next.resolve(release()); }
    };
  }
  return {
    // What holds the line now: 'note', 'document' or null.
    holder: () => holder,
    // A free line is taken at once, with no pause, so a job with nothing ahead starts straight away.
    now(kind) { if (holder) return null; holder = kind; return release(); },
    take(kind) {
      const free = this.now(kind);
      return free ? Promise.resolve(free) : new Promise(resolve => { waiting.push({ kind, resolve }); });
    },
  };
}
