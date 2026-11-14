// Font names in a document, written [Satoshi](font:Satoshi), are drawn in that font: one installed on the Mac, or one an AI
// added with add_document_font, which the server keeps at /api/documents/fonts. The page allows no inline styles, so each
// family gets a class in a stylesheet built here, and the editor marks the name with it through a decoration.
const sheet = new CSSStyleSheet(), classes = new Map(), checked = new Map();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
const quoted = family => `"${family.replace(/["\\]/g, '')}"`;
export const fontFamilyOf = href => { try { return /^font:/i.test(href) ? decodeURIComponent(href.slice(5)).trim() : ''; } catch { return ''; } };
export function fontClass(family) {
  if (!classes.has(family)) {
    const name = `doc-font-${classes.size}`;
    sheet.insertRule(`.${name} { font-family: ${quoted(family)}, var(--crepe-font-default, sans-serif); }`, sheet.cssRules.length);
    classes.set(family, name);
  }
  return classes.get(family);
}
// Whether the browser can draw it: text in the font measures differently from the fallbacks unless it's missing.
const probe = document.createElement('canvas').getContext('2d');
export function fontAvailable(family) {
  if (!checked.has(family)) {
    const width = fallback => { probe.font = `72px ${fallback}`; const plain = probe.measureText('mmmmmmmmmlli WQ@').width; probe.font = `72px ${quoted(family)}, ${fallback}`; return probe.measureText('mmmmmmmmmlli WQ@').width !== plain; };
    checked.set(family, width('monospace') || width('serif'));
  }
  return checked.get(family);
}
let stored = null;
// Loads the fonts added for documents once; resolves when they're ready to measure and draw.
export function loadStoredFonts() {
  return stored ||= fetch('/api/documents/fonts', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { fonts: [] }).then(async ({ fonts = [] }) => {
    await Promise.all(fonts.map(({ family, url }) => {
      const face = new FontFace(family, `url(${url})`);
      document.fonts.add(face);
      return face.load().catch(() => {});
    }));
    checked.clear();
    return fonts;
  }).catch(() => { stored = null; return []; });
}
// The editor plugin: a class on every font-link's text, and a note on hover when the font isn't on this Mac.
export function fontDecorations(m) {
  return m.$prose(() => new m.Plugin({
    key: new m.PluginKey('document-fonts'),
    props: {
      decorations(state) {
        const link = state.schema.marks.link, found = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const family = fontFamilyOf(node.marks.find(mark => mark.type === link)?.attrs.href || '');
          if (!family) return;
          const ok = fontAvailable(family);
          found.push(m.Decoration.inline(pos, pos + node.nodeSize, { class: `doc-font ${ok ? fontClass(family) : 'doc-font-missing'}`, title: ok ? family : `${family} isn’t on this Mac` }));
        });
        return m.DecorationSet.create(state.doc, found);
      },
    },
  }));
}
