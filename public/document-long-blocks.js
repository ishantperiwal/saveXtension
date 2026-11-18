// Long code blocks in a document, usually prompts, are folded to a few lines so the page stays easy to skim (user's decision).
// "Show all" opens one, "Show less" folds it again, and putting the cursor in one opens it while it's being edited.
// Only the page changes: the Markdown is never touched, and every block starts folded each time a document opens.
const LONG_LINES = 8, LONG_CHARS = 500;
const isLong = text => text.length > LONG_CHARS || text.split('\n').length > LONG_LINES;

export function longBlocks(m) {
  const key = new m.PluginKey('long-blocks');
  function toggle(view, pos, open) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'long-block-toggle'; button.contentEditable = 'false';
    button.textContent = open ? 'Show less' : 'Show all';
    button.setAttribute('aria-expanded', String(open));
    // Keep the editor's cursor where it was, so a click here doesn't also open the block for editing.
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.preventDefault();
      view.dispatch(view.state.tr.setMeta(key, pos));
      // Folding a long block can leave its button far above, so the block's top comes back into view.
      if (open) requestAnimationFrame(() => { const block = view.nodeDOM(pos); if (block?.getBoundingClientRect().top < 0) block.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    });
    return button;
  }
  return m.$prose(() => new m.Plugin({
    key,
    state: {
      init: () => new Set(),
      apply(tr, open) {
        let next = tr.docChanged ? new Set([...open].map(pos => tr.mapping.map(pos))) : open;
        const pos = tr.getMeta(key);
        if (typeof pos === 'number') { next = new Set(next); if (next.has(pos)) next.delete(pos); else next.add(pos); }
        return next;
      },
    },
    props: {
      decorations(state) {
        const opened = key.getState(state), { from, to } = state.selection, found = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'code_block') return !node.isTextblock;
          if (!isLong(node.textContent)) return false;
          const editing = from > pos && to < pos + node.nodeSize, open = editing || opened.has(pos);
          found.push(m.Decoration.node(pos, pos + node.nodeSize, { class: open ? 'long-block is-open' : 'long-block is-folded' }));
          if (!editing) found.push(m.Decoration.widget(pos + node.nodeSize, view => toggle(view, pos, open), { side: -1, key: `long-block-${pos}-${open}`, ignoreSelection: true, stopEvent: () => true }));
          return false;
        });
        return m.DecorationSet.create(state.doc, found);
      },
    },
  }));
}
