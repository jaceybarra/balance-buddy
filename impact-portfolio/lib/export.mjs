// Build a single self-contained HTML file: the whole dashboard, with the dataset
// inlined, openable by double-clicking. No server, no network, no build step.
//
// The web app is written as ES modules that import each other. A standalone file
// cannot resolve relative module specifiers, so the modules are concatenated in
// dependency order with their local imports and `export` keywords stripped. They
// are authored to make that safe: no default exports, no duplicate top-level names,
// and no module-level side effects except app.mjs's entry call.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATASET_FILE, DEMO_FILE, readJSON } from './dataset.mjs';

const WEB = path.join(ROOT, 'web');
const MODULE_ORDER = ['model.mjs', 'ui.mjs', 'views.mjs', 'app.mjs'];

export function buildStandalone({ demo = false, out } = {}) {
  const file = demo ? DEMO_FILE : DATASET_FILE;
  if (!fs.existsSync(file)) {
    throw new Error(demo
      ? 'No demo dataset found. Run: node tools/make-demo.mjs'
      : 'No dataset yet. Import a PDF first - see MONTHLY_UPDATE.md.');
  }
  const ds = readJSON(file);

  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(WEB, 'css', 'styles.css'), 'utf8');
  const js = MODULE_ORDER.map((m) => stripModuleSyntax(
    fs.readFileSync(path.join(WEB, 'js', m), 'utf8'), m)).join('\n\n');

  const generated = new Date().toISOString();
  const page = html
    .replace('<link rel="stylesheet" href="css/styles.css">', `<style>\n${css}\n</style>`)
    .replace('<script type="module" src="js/app.mjs"></script>',
      `<script>window.__PIP_DATA__ = ${safeJson(ds)};</script>\n` +
      `<script type="module">\n${js}\n</script>`)
    .replace('</head>', `<meta name="generator" content="Professional Impact Portfolio standalone export ${generated}">\n</head>`)
    .replace('<div id="demo-band"', `${standaloneBanner(ds, generated)}\n<div id="demo-band"`);

  const target = out ?? path.join(ROOT, defaultName(ds, demo));
  fs.writeFileSync(target, page);
  return { file: target, bytes: Buffer.byteLength(page), ds };
}

function defaultName(ds, demo) {
  const span = `${ds.coverage?.sourceStart ?? 'start'}_to_${ds.coverage?.sourceEnd ?? 'end'}`;
  return `impact-portfolio${demo ? '-demo' : ''}-${span}.html`;
}

/**
 * A standalone file is a snapshot. Say so on the page itself, because the file can
 * outlive the dataset it was built from and there is no server to correct it.
 */
function standaloneBanner(ds, generated) {
  const when = generated.slice(0, 10);
  return `<div class="band band--standalone">
  <strong>Offline snapshot</strong>
  <span>Exported ${when} from dataset version ${ds.datasetVersion ?? 0}. The source document covers
  ${ds.coverage?.sourceStart ?? '—'} to ${ds.coverage?.sourceEnd ?? '—'}. This file does not update:
  re-export after the next refresh. It contains customer names — use the anonymise option in
  Review-ready summaries before sharing it.</span>
</div>`;
}

/** Remove local imports and `export` keywords so modules can be concatenated. */
function stripModuleSyntax(src, name) {
  const before = src;
  let out = src
    // import { a, b } from './x.mjs';  (including multi-line forms)
    .replace(/^import\s+[\s\S]*?\s+from\s+'\.\/[^']+';\s*$/gm, '')
    // import './x.mjs';
    .replace(/^import\s+'\.\/[^']+';\s*$/gm, '')
    // export function / const / class ...
    .replace(/^export\s+(?=(?:default\s+)?(?:function|const|let|class|async))/gm, '')
    // export { a, b };
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');

  if (/^\s*(import|export)\s/m.test(out)) {
    const leftover = out.split('\n').filter((l) => /^\s*(import|export)\s/.test(l));
    throw new Error(`${name}: module syntax left after stripping:\n  ${leftover.join('\n  ')}`);
  }
  if (out === before && /(^|\n)(import|export)\s/.test(before)) {
    throw new Error(`${name}: nothing was stripped, which means the patterns no longer match.`);
  }
  return `/* ===== ${name} ===== */\n${out.trim()}`;
}

/** JSON safe to embed inside a <script> element. */
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
