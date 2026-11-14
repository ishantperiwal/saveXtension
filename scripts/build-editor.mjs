// Bundles the document editor (Milkdown Crepe, MIT) into plain files the app serves itself, since the UI has no build step.
// Run after changing scripts/editor/ or the @milkdown/crepe version: npm run build:editor. The output is committed.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = 'public/vendor/editor';
await rm(outdir, { recursive: true, force: true });
await build({ entryPoints: { editor: 'scripts/editor/entry.js', 'editor-style': 'scripts/editor/entry.css' }, outdir, bundle: true, format: 'esm', splitting: true, minify: true, legalComments: 'linked', target: 'chrome130', chunkNames: 'chunks/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' }, logLevel: 'warning' });
