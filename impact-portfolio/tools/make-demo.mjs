// Builds demo/portfolio.demo.json by running the SYNTHETIC content in
// tools/demo-source.mjs through the real reconcile → overrides → coverage →
// validate pipeline. If the demo builds, the pipeline works.
//
// The output is marked `mode: "demo"` and is never written into data/.

import fs from 'node:fs';
import path from 'node:path';
import { emptyDataset } from '../lib/schema.mjs';
import { reconcile } from '../lib/reconcile.mjs';
import { applyOverrides } from '../lib/overrides.mjs';
import { buildCoverage } from '../lib/coverage.mjs';
import { validateDataset } from '../lib/validate.mjs';
import { deriveGaps } from '../lib/gaps.mjs';
import { formatReport } from '../lib/report.mjs';
import { ROOT, DEMO_FILE, writeJSONAtomic } from '../lib/dataset.mjs';
import { nowISO, uniq } from '../lib/util.mjs';
import { import1, import2, DEMO_CORRECTIONS } from './demo-source.mjs';

const ds = emptyDataset();
ds.mode = 'demo';
const overrides = { version: 1, entries: [] };
const reports = [];

runImport(import1, {
  importId: 'imp001-demo0001', importVersion: 1,
  pdfFileName: 'DEMO_professional_development_2026-07.pdf', fileHash: 'demo-hash-1'
});

// A correction the user made after the first import, which must survive import 2.
for (const c of DEMO_CORRECTIONS) {
  const rec = ds.contributions.find((x) => x.title === c.target.byTitle);
  if (!rec) throw new Error(`demo correction target not found: ${c.target.byTitle}`);
  overrides.entries.push({
    id: `ovr_demo_${overrides.entries.length}`,
    createdAt: nowISO(),
    target: { type: c.target.type, id: rec.id },
    op: c.op, fields: c.fields, reason: c.reason
  });
}

runImport(import2, {
  importId: 'imp002-demo0002', importVersion: 2,
  pdfFileName: 'DEMO_professional_development_2026-09.pdf', fileHash: 'demo-hash-2'
});

// Re-importing an identical PDF must be a no-op. Prove it here.
const before = JSON.stringify({ c: ds.contributions.length, m: ds.metrics.length, e: ds.excerpts.length });
runImport(import2, {
  importId: 'imp002-demo0002', importVersion: 2,
  pdfFileName: 'DEMO_professional_development_2026-09.pdf', fileHash: 'demo-hash-2'
}, { silent: true });
const after = JSON.stringify({ c: ds.contributions.length, m: ds.metrics.length, e: ds.excerpts.length });
if (before !== after) throw new Error(`Re-import changed the dataset: ${before} -> ${after}`);
console.log(`✔ Re-importing the same content changed nothing (${after}).`);

const validation = validateDataset(ds);
if (!validation.ok) {
  console.error('\n✖ The demo dataset does not satisfy the validator:');
  validation.errors.forEach((e) => console.error(`   ${e.code}: ${e.message}`));
  process.exit(1);
}

ds.lastSuccessfulRefresh = nowISO();
ds.validation = { errors: validation.errors, warnings: validation.warnings, checkedAt: nowISO() };
ds.gaps = deriveGaps(ds);
ds.demoNotice =
  'SYNTHETIC DEMONSTRATION DATA. Every customer, project, date, quote and number below was ' +
  'invented to show how the dashboard behaves. It is stored separately from your real history ' +
  'and is never merged into it.';
ds.refreshReports = reports;
ds.datasetVersion = 2;

fs.mkdirSync(path.dirname(DEMO_FILE), { recursive: true });
writeJSONAtomic(DEMO_FILE, ds);

console.log(`✔ Demo written to ${path.relative(ROOT, DEMO_FILE)}`);
console.log(`  ${ds.contributions.length} contributions · ${ds.metrics.length} metric observations ` +
  `(${ds.metrics.filter((m) => m.repeatOf).length} restatements) · ${ds.excerpts.length} excerpts`);
console.log(`  ${validation.warnings.length} warnings · ${ds.conflicts.length} conflicts · ${ds.gaps.length} gaps`);

function runImport(payload, meta, { silent = false } = {}) {
  const report = reconcile(ds, payload, meta);
  applyOverrides(ds, overrides);
  const periods = uniq([
    ...(payload.documentedPeriods ?? []),
    ...ds.excerpts.map((e) => e.reportingPeriod).filter(Boolean)
  ]);
  ds.coverage = buildCoverage(periods, { declaredStart: '2026-05-01', today: '2026-09-20' });
  if (!silent) {
    const text = formatReport(report, { coverage: ds.coverage, datasetVersion: meta.importVersion });
    reports.unshift({ ...report, at: nowISO(), text });
    console.log(text);
  }
}
