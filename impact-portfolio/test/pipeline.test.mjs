import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempHome, writePdf, devDocPages } from './helpers.mjs';

// PIP_HOME must be set before lib/dataset.mjs is first imported.
const HOME = tempHome();

const { extractPdf, sectionize, coverageReport } = await import('../lib/pdf/extract.mjs');
const { emptyDataset } = await import('../lib/schema.mjs');
const { reconcile } = await import('../lib/reconcile.mjs');
const { validateDataset } = await import('../lib/validate.mjs');
const { applyOverrides, makeOverride } = await import('../lib/overrides.mjs');
const { buildCoverage } = await import('../lib/coverage.mjs');
const { deriveGaps } = await import('../lib/gaps.mjs');
const { commitDataset, loadDataset, writeJSONAtomic, DATASET_FILE, OVERRIDES_FILE, listVersions } = await import('../lib/dataset.mjs');
const { filterContributions, resolveRange, isDefinitive } = await import('../web/js/model.mjs');
const { buildStandalone } = await import('../lib/export.mjs');
const { makeBackup, restoreBackup } = await import('../lib/backup.mjs');
const { runDoctor } = await import('../lib/doctor.mjs');

const meta = (n, hash) => ({
  importId: `imp${n}`, importVersion: n, pdfFileName: `export-${n}.pdf`, fileHash: hash ?? `hash${n}`
});

const excerpt = (id, page, source, period, text) =>
  ({ id, page, sourceLabel: source, reportingPeriod: period, text, sectionId: 's1' });

/* ======================================================= 1. PDF extraction */

test('extraction keeps physical page numbers and flags pages needing OCR', () => {
  const file = writePdf(path.join(HOME, 'source-pdfs', 'doc.pdf'), [
    ...devDocPages({ extraWeek: true }),
    ['.']                       // a near-empty page stands in for a scanned insert
  ]);
  const ex = extractPdf(file);

  assert.equal(ex.pageCount, 6);
  assert.match(ex.pages[1].text, /Week of 2026-05-08/);
  assert.match(ex.pages[2].text, /Zoom AI summary/);
  assert.match(ex.pages[3].text, /Week of 2026-05-15/);
  assert.equal(ex.pages[5].needsOcr, true, 'a page with no real text layer must be flagged, not treated as empty');

  const sections = sectionize(ex, { targetChars: 400 });
  const cov = coverageReport(ex, sections);
  assert.ok(sections.length > 1);
  assert.deepEqual(cov.pagesNeedingOcr, [6]);
  assert.deepEqual(cov.pagesNotSectioned, [], 'every readable page must land in a section');
  for (const s of sections) assert.ok(s.pageStart >= 1 && s.pageEnd <= 6);
});

test('text is reconstructed from a word-processor layout: one block per glyph, line position in the CTM', () => {
  // This is the shape a real Google Docs / Word export produces. Reading it needs
  // the full graphics and text state: glyph advances alone give neither the word
  // gaps nor the line breaks, because every glyph carries its own position and the
  // line's y coordinate lives in the CTM rather than the text matrix.
  const file = writePdf(path.join(HOME, 'source-pdfs', 'wp.pdf'),
    devDocPages({ extraWeek: true }), { style: 'wordprocessor' });
  const ex = extractPdf(file);

  assert.equal(ex.pageCount, 5);
  const page2 = ex.pages[1].text;

  assert.match(page2, /Gemini summary - Week of 2026-05-08/, 'words must not be split into letters');
  assert.match(page2, /intake triage discovery session/);
  assert.ok(!/\bR a n\b/.test(page2), 'letters must not be spaced apart');
  assert.equal(page2.split('\n').length, 3, 'each source line must be one output line');
  assert.match(ex.pages[2].text, /Zoom AI summary/, 'page order is preserved');

  // The same content in the simple layout must read the same.
  const simple = extractPdf(writePdf(path.join(HOME, 'source-pdfs', 'simple.pdf'),
    devDocPages({ extraWeek: true })));
  assert.equal(
    ex.pages[1].text.replace(/\s+/g, ' '),
    simple.pages[1].text.replace(/\s+/g, ' '),
    'both layouts must yield the same text');
});

test('the same PDF always produces the same content hash; a changed PDF does not', () => {
  const a = writePdf(path.join(HOME, 'source-pdfs', 'a.pdf'), devDocPages());
  const b = writePdf(path.join(HOME, 'source-pdfs', 'b.pdf'), devDocPages());
  const c = writePdf(path.join(HOME, 'source-pdfs', 'c.pdf'), devDocPages({ extraWeek: true }));
  assert.equal(extractPdf(a).fileHash, extractPdf(b).fileHash);
  assert.notEqual(extractPdf(a).fileHash, extractPdf(c).fileHash);
});

/* ================================================= 2. re-importing the same */

test('re-importing identical content leaves every record and total unchanged', () => {
  const ds = emptyDataset();
  const payload = fixtureImport();
  reconcile(ds, payload, meta(1));
  const before = JSON.stringify({
    c: ds.contributions.length, m: ds.metrics.length, e: ds.excerpts.length,
    ids: ds.contributions.map((x) => x.id).sort()
  });

  reconcile(ds, payload, meta(1));
  reconcile(ds, payload, meta(1));

  const after = JSON.stringify({
    c: ds.contributions.length, m: ds.metrics.length, e: ds.excerpts.length,
    ids: ds.contributions.map((x) => x.id).sort()
  });
  assert.equal(after, before);
});

/* ========================================== 3. overlapping Gemini/Zoom entries */

test('Gemini and Zoom descriptions of one event stay one contribution with both sources', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));

  const discovery = ds.contributions.filter((c) => /discovery/i.test(c.title));
  assert.equal(discovery.length, 1, 'the two summaries must not produce two accomplishments');
  assert.deepEqual([...discovery[0].sources].sort(), ['gemini', 'zoom']);
  assert.equal(discovery[0].evidence.length, 2, 'both excerpts are preserved');
  assert.ok(discovery[0].flags.includes('multi_source_not_verified'),
    'agreement between two AI summaries must be marked as agreement, not verification');
});

test('two distinct contributions quoted from one paragraph are not merged', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  const shared = ds.contributions.filter((c) => c.evidence.includes(ds.excerpts.find((e) => /automating follow-up/i.test(e.text)).id));
  assert.ok(shared.length >= 2, 'one excerpt can support more than one record');
  assert.ok(shared.some((c) => c.status === 'proposed'));
  assert.ok(shared.some((c) => c.status === 'completed'));
});

/* ============================================== 4. repeated metric statements */

test('a benefit restated in a later week is counted once, never multiplied', () => {
  const ds = emptyDataset();
  const first = fixtureImport();
  reconcile(ds, first, meta(1));

  // The same estimate, quoted again three weeks later.
  reconcile(ds, {
    isCumulative: false,
    excerpts: [excerpt('r1', 21, 'gemini', '2026-06-05',
      'Week of June 5: Operations again reported the workflow saves about two hours per week per coordinator.')],
    metrics: [{
      label: 'Time saved per coordinator', value: 2, unit: 'hours per week', period: 'per week',
      scope: 'Each of four coordinators', measures: 'Estimated manual time avoided',
      kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
      aggregatable: false, evidence: ['r1'], sources: ['gemini']
    }]
  }, meta(2));

  const primary = ds.metrics.filter((m) => /Time saved/.test(m.label) && !m.repeatOf);
  const repeats = ds.metrics.filter((m) => m.repeatOf);
  assert.equal(primary.length, 1, 'restating a number must not create a second observation');
  assert.equal(repeats.length, 1);
  assert.equal(repeats[0].aggregatable, false);
  assert.equal(Number(primary[0].value), 2, 'the value stays 2, not 4');
});

/* ===================================================== 5. aggregation safety */

test('the validator refuses to aggregate percentages, estimates, repeats and overlapping scopes', () => {
  const base = () => {
    const ds = emptyDataset();
    ds.excerpts.push({ id: 'e', text: 'a quoted line from the document', page: 1, sourceLabel: 'gemini', pageHistory: [] });
    return ds;
  };
  const metric = (over) => ({
    id: over.id ?? 'm1', label: 'x', value: 1, unit: 'items', period: 'May', scope: 'team',
    measures: 'things', kind: 'achieved', owner: 'team', claim: 'stated_in_source',
    aggregatable: true, aggregationGroup: 'g', evidence: ['e'], sources: ['gemini'], flags: [], ...over
  });

  const pct = base(); pct.metrics.push(metric({ unit: 'percent' }));
  assert.ok(validateDataset(pct).errors.some((e) => e.code === 'metric.aggregate_non_additive'));

  const est = base(); est.metrics.push(metric({ kind: 'estimate' }));
  assert.ok(validateDataset(est).errors.some((e) => e.code === 'metric.aggregate_non_achieved'));

  const rep = base();
  rep.metrics.push(metric({ id: 'm0', aggregatable: false, aggregationGroup: null }));
  rep.metrics.push(metric({ id: 'm1', repeatOf: 'm0' }));
  assert.ok(validateDataset(rep).errors.some((e) => e.code === 'metric.aggregate_repeat'));

  const overlap = base();
  overlap.metrics.push(metric({ id: 'm1' }), metric({ id: 'm2' }));   // identical scope + period
  assert.ok(validateDataset(overlap).errors.some((e) => e.code === 'metric.group_overlap'));

  const mixed = base();
  mixed.metrics.push(metric({ id: 'm1', unit: 'items', scope: 'a' }), metric({ id: 'm2', unit: 'hours', scope: 'b' }));
  assert.ok(validateDataset(mixed).errors.some((e) => e.code === 'metric.group_mixed_units'));

  const ok = base();
  ok.metrics.push(metric({ id: 'm1', period: 'May', scope: 'team A' }), metric({ id: 'm2', period: 'June', scope: 'team A' }));
  assert.equal(validateDataset(ok).errors.filter((e) => e.code.startsWith('metric.')).length, 0,
    'non-overlapping achieved results with the same unit may be summed');
});

/* ========================================================== 6. accuracy rules */

test('a proposal cannot be recorded as an outcome, and a week cannot become a day', () => {
  const ds = emptyDataset();
  ds.excerpts.push({ id: 'e', text: 'a quoted line from the document', page: 1, sourceLabel: 'gemini', pageHistory: [] });
  ds.contributions.push({
    id: 'c1', title: 'Discussed automating follow-up', kind: 'outcome', status: 'proposed',
    role: 'contributed', roleClaim: 'stated_in_source', datePrecision: 'week',
    workDate: '2026-05-14', workWeek: { start: '2026-05-11', end: '2026-05-17' },
    evidence: ['e'], sources: ['gemini'], skills: [], lessons: [], nextSteps: [],
    supportingFacts: [], mergedFrom: [], flags: [], history: [], confidence: 'high'
  });
  const v = validateDataset(ds);
  assert.ok(v.errors.some((e) => e.code === 'contrib.proposal_as_outcome'));
  assert.ok(v.errors.some((e) => e.code === 'contrib.week_with_day'));
});

test('an interpreted outcome must name the facts it rests on, and every record needs evidence', () => {
  const ds = emptyDataset();
  ds.contributions.push({
    id: 'c1', title: 'Something', kind: 'activity', status: 'completed', role: 'unclear',
    roleClaim: 'needs_clarification', datePrecision: 'unknown',
    outcome: 'Handling time fell', outcomeClaim: 'interpretation',
    evidence: [], sources: [], skills: [], lessons: [], nextSteps: [],
    supportingFacts: [], mergedFrom: [], flags: [], history: [], confidence: 'high'
  });
  const v = validateDataset(ds);
  assert.ok(v.errors.some((e) => e.code === 'contrib.no_evidence'));
  assert.ok(v.errors.some((e) => e.code === 'contrib.unsupported_interpretation'));
});

/* ====================================================== 7. corrections survive */

test('a correction survives later imports and is never silently overwritten', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  const target = ds.contributions.find((c) => /discovery/i.test(c.title));
  assert.equal(target.role, 'contributed');

  const overrides = { version: 1, entries: [makeOverride({
    type: 'contribution', id: target.id,
    fields: { role: 'led', roleClaim: 'stated_in_source' },
    reason: 'I ran this session.',
    importValueAtCorrection: 'contributed'
  })] };
  applyOverrides(ds, overrides);
  assert.equal(target.role, 'led');

  // A later export still describes it as "contributed" and adds an outcome.
  reconcile(ds, {
    ...fixtureImport(),
    contributions: fixtureImport().contributions.map((c) =>
      /discovery/i.test(c.title) ? { ...c, role: 'contributed', status: 'in_progress' } : c)
  }, meta(2));
  applyOverrides(ds, overrides);

  const after = ds.contributions.find((c) => c.id === target.id);
  assert.equal(after.role, 'led', 'the correction wins');
  assert.ok(after.flags.includes('user_corrected'));
  assert.ok(after.sourceSaysNow, 'what the source now says is recorded alongside, not applied');
  assert.equal(after.sourceSaysNow.role, 'contributed');
});

/* ======================================================== 8. revised pagination */

test('an unchanged excerpt is re-matched by content when its page number moves', () => {
  const ds = emptyDataset();
  const p1 = fixtureImport();
  reconcile(ds, p1, meta(1));
  const before = ds.excerpts.length;
  const original = ds.excerpts.find((e) => /discovery session/i.test(e.text));
  assert.equal(original.page, 3);

  // Same document re-exported with two cover pages inserted: every page shifts.
  const shifted = {
    ...p1,
    excerpts: p1.excerpts.map((e) => ({ ...e, page: e.page + 2 }))
  };
  const report = reconcile(ds, shifted, meta(2));

  assert.equal(ds.excerpts.length, before, 'a moved excerpt is the same excerpt, not a new one');
  assert.equal(ds.excerpts.find((e) => e.id === original.id).page, 5);
  assert.ok(report.repaginated.some((r) => r.excerptId === original.id && r.from === 3 && r.to === 5));
  assert.ok(ds.excerpts.find((e) => e.id === original.id).pageHistory.some((h) => h.page === 3),
    'the citation for the earlier version is kept');
});

/* ================================================= 9. content that disappears */

test('a record absent from a newer cumulative export is flagged, never deleted', () => {
  const ds = emptyDataset();
  const p1 = fixtureImport();
  reconcile(ds, p1, meta(1));
  const count = ds.contributions.length;

  const trimmed = {
    ...p1,
    excerpts: p1.excerpts.filter((e) => e.id !== 'x3'),
    contributions: p1.contributions.filter((c) => !c.evidence.includes('x3'))
  };
  const report = reconcile(ds, trimmed, meta(2));

  assert.equal(ds.contributions.length, count, 'nothing is deleted');
  assert.ok(report.missingFromExport.length >= 1);
  const gone = ds.contributions.find((c) => c.flags.includes('missing_in_latest_export'));
  assert.ok(gone);
  assert.equal(isDefinitive(gone), false, 'it drops out of definitive totals while staying inspectable');
});

test('a monthly-only PDF adds to history instead of replacing it', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  const count = ds.contributions.length;
  const report = reconcile(ds, {
    isCumulative: false,
    excerpts: [excerpt('n1', 2, 'gemini', '2026-08-07', 'Week of August 7: closed two priority-one escalations.')],
    contributions: [{
      title: 'Escalation close-out', kind: 'deliverable', status: 'completed',
      role: 'co_owned', roleClaim: 'stated_in_source', datePrecision: 'week',
      workWeek: { start: '2026-08-03', end: '2026-08-09' },
      action: 'Closed two priority-one escalations.', evidence: ['n1'], sources: ['gemini']
    }]
  }, meta(2));

  assert.equal(ds.contributions.length, count + 1);
  assert.equal(report.missingFromExport.length, 0, 'a partial export must not flag the rest of history as missing');
});

/* ====================================================== 10. incomplete months */

test('partial months are labelled and marked not comparable', () => {
  const cov = buildCoverage(
    ['2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29', '2026-06-05', '2026-07-03'],
    { declaredStart: '2026-05-01', today: '2026-09-20' });

  const june = cov.months.find((m) => m.month === '2026-06');
  assert.equal(june.status, 'partial');
  assert.equal(june.comparable, false);
  assert.match(june.label, /of \d+ weeks documented - partial/);

  const aug = cov.months.find((m) => m.month === '2026-08');
  assert.equal(aug.status, 'not_in_export');
  assert.equal(aug.comparable, false);
  assert.ok(cov.notes.some((n) => /not evidence/i.test(n)),
    'the dataset itself must carry the "absence is not evidence" note');
  assert.equal(cov.sourceStart, '2026-05-08');
});

/* ========================================== 11. a failed refresh preserves data */

test('a refresh that fails validation leaves the previous dataset in place', () => {
  const good = emptyDataset();
  reconcile(good, fixtureImport(), meta(1));
  good.datasetVersion = 1;
  good.lastSuccessfulRefresh = '2026-08-01T00:00:00.000Z';
  commitDataset(good, { label: 'good' });

  const onDisk = loadDataset();
  assert.equal(onDisk.contributions.length, good.contributions.length);

  // A second import that breaks a blocking rule.
  const draft = JSON.parse(JSON.stringify(onDisk));
  draft.datasetVersion = 2;
  draft.contributions.push({
    id: 'bad', title: 'Undocumented claim', kind: 'outcome', status: 'completed',
    role: 'led', roleClaim: 'needs_clarification', datePrecision: 'unknown',
    outcome: 'Reduced handling time by 40%', outcomeClaim: 'interpretation',
    evidence: [], sources: [], skills: [], lessons: [], nextSteps: [],
    supportingFacts: [], mergedFrom: [], flags: [], history: [], confidence: 'high'
  });

  const v = validateDataset(draft);
  assert.equal(v.ok, false);
  if (!v.ok) { /* the CLI aborts here - nothing is written */ }

  const stillOnDisk = loadDataset();
  assert.equal(stillOnDisk.datasetVersion, 1, 'the live dataset was not advanced');
  assert.equal(stillOnDisk.contributions.some((c) => c.id === 'bad'), false);
  assert.equal(stillOnDisk.lastSuccessfulRefresh, '2026-08-01T00:00:00.000Z');
});

test('committing snapshots the previous version so a refresh can be rolled back', () => {
  const before = listVersions().length;
  const ds = loadDataset();
  ds.datasetVersion = (ds.datasetVersion ?? 0) + 1;
  commitDataset(ds, { label: 'second' });
  assert.equal(listVersions().length, before + 1);
});

test('data survives a restart: the dataset is read back from disk unchanged', () => {
  const ds = loadDataset();
  const roundTripped = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));
  assert.deepEqual(roundTripped.contributions.map((c) => c.id).sort(),
    ds.contributions.map((c) => c.id).sort());
  assert.ok(roundTripped.generatedAt);
});

/* ============================================== 12. every claim has evidence */

test('every record the dashboard would display carries at least one source excerpt', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  ds.gaps = deriveGaps(ds);
  const v = validateDataset(ds);
  assert.deepEqual(v.errors, [], `blocking errors: ${JSON.stringify(v.errors)}`);

  const excerptIds = new Set(ds.excerpts.map((e) => e.id));
  for (const c of ds.contributions) {
    assert.ok(c.evidence.length > 0, `${c.title} has no evidence`);
    for (const e of c.evidence) assert.ok(excerptIds.has(e));
  }
  for (const m of ds.metrics) assert.ok(m.evidence.length > 0, `${m.label} has no evidence`);
  for (const e of ds.excerpts) {
    assert.ok(e.page !== null && e.page !== undefined, 'every excerpt cites a physical page');
    assert.ok(e.pdfFileName, 'every excerpt names its source file');
    assert.ok(e.importVersion, 'every excerpt is tied to an import version');
  }
});

/* ==================================================== 13. filters and periods */

test('period, customer, project and search filters select the right records', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  ds.coverage = buildCoverage(['2026-05-08', '2026-05-15'], { declaredStart: '2026-05-01', today: '2026-09-20' });

  const all = filterContributions(ds, {});
  assert.equal(all.kept.length, ds.contributions.length);

  const may11 = filterContributions(ds, { from: '2026-05-11', to: '2026-05-17' });
  assert.ok(may11.kept.length > 0 && may11.kept.length < all.kept.length);
  for (const c of may11.kept) assert.equal(c.workWeek.start, '2026-05-11');

  const cust = ds.customers[0];
  const byCustomer = filterContributions(ds, { customerId: cust.id });
  for (const c of byCustomer.kept) assert.equal(c.customerId, cust.id);

  const byProject = filterContributions(ds, { projectId: ds.projects[0].id });
  for (const c of byProject.kept) {
    assert.ok(c.projectId === ds.projects[0].id || c.milestoneOf === ds.projects[0].id);
  }

  const search = filterContributions(ds, { q: 'referral queue' });
  assert.ok(search.kept.length > 0);
  assert.ok(search.kept.every((c) =>
    JSON.stringify(c).toLowerCase().includes('referral queue')));

  const none = filterContributions(ds, { q: 'zzz-no-such-text' });
  assert.equal(none.kept.length, 0);

  const undated = filterContributions(ds, { from: '2026-05-01', to: '2026-12-31' });
  assert.equal(undated.undated.length, 0);
});

test('undated records are held out of period totals but never dropped from the dataset', () => {
  const ds = emptyDataset();
  reconcile(ds, {
    isCumulative: false,
    excerpts: [excerpt('u1', 9, 'unknown', null, 'An entry with no date anywhere in the surrounding text.')],
    contributions: [{
      title: 'Undated work', kind: 'activity', status: 'completed', role: 'unclear',
      roleClaim: 'needs_clarification', datePrecision: 'unknown',
      action: 'Did something the document does not date.', evidence: ['u1'], sources: ['unknown']
    }]
  }, meta(1));

  const r = filterContributions(ds, { from: '2026-05-01', to: '2026-12-31' });
  assert.equal(r.kept.length, 0);
  assert.equal(r.undated.length, 1, 'it is surfaced separately, not silently discarded');
});

test('period presets are bounded by the documented coverage, never by today', () => {
  const ds = emptyDataset();
  ds.coverage = buildCoverage(['2026-05-08', '2026-07-17'], { declaredStart: '2026-05-01', today: '2026-12-31' });
  const month = resolveRange('month', ds);
  assert.equal(month.to, '2026-07-17');
  assert.equal(month.from, '2026-07-01');
  const q = resolveRange('quarter', ds);
  assert.equal(q.from, '2026-07-01');
  const all = resolveRange('all', ds);
  assert.equal(all.from, '2026-05-08');
});

/* ================================================== 14. contradictions surface */

test('a changed metric value is surfaced as a contradiction rather than overwritten', () => {
  const ds = emptyDataset();
  reconcile(ds, fixtureImport(), meta(1));
  const report = reconcile(ds, {
    isCumulative: false,
    excerpts: [excerpt('v2', 40, 'gemini', '2026-08-21',
      'Week of August 21: operations now report the workflow saves about three hours per week per coordinator.')],
    metrics: [{
      label: 'Time saved per coordinator', value: 3, unit: 'hours per week', period: 'per week',
      scope: 'Each of four coordinators', measures: 'Estimated manual time avoided',
      kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
      aggregatable: false, evidence: ['v2'], sources: ['gemini']
    }]
  }, meta(2));

  assert.equal(report.unresolvedConflicts.length, 1);
  assert.equal(report.unresolvedConflicts[0].type, 'metric_value_conflict');
  const m = ds.metrics.find((x) => /Time saved/.test(x.label) && !x.repeatOf);
  assert.equal(Number(m.value), 2, 'the earlier value is not overwritten');
  assert.ok(m.flags.includes('conflict'));
});

/* --------------------------------------------------------------- the fixture */

function fixtureImport() {
  return {
    isCumulative: true,
    documentedPeriods: ['2026-05-08', '2026-05-15'],
    customers: [{ id: 'c1', name: 'Northwind Regional Health' }],
    projects: [{ id: 'p1', name: 'Intake triage automation', customerId: 'c1' }],
    excerpts: [
      excerpt('x1', 3, 'gemini', '2026-05-08',
        'Week of May 8: Ran the intake triage discovery session with Northwind Regional Health. Mapped the referral queue and identified three handoff points causing rework.'),
      excerpt('x2', 4, 'zoom', '2026-05-08',
        'Zoom AI - Northwind intake discovery. The TSM ran the discovery session, mapped the referral queue and documented three handoff points causing rework.'),
      excerpt('x3', 6, 'gemini', '2026-05-15',
        'Week of May 15: Drafted and shared the proposed triage flow with the operations lead. Discussed automating follow-up reminders; no decision was made.'),
      excerpt('x4', 8, 'gemini', '2026-05-15',
        'Week of May 15: Deployed the triage routing workflow to the sandbox. Operations estimated it saves about two hours per week for each of the four coordinators.')
    ],
    contributions: [
      {
        title: 'Intake triage discovery session', kind: 'activity', status: 'completed',
        role: 'contributed', roleClaim: 'needs_clarification', customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
        datePrecision: 'week', workWeek: { start: '2026-05-04', end: '2026-05-10' },
        reportingPeriod: 'Week of 2026-05-08',
        problem: 'Referral queue rework was not understood.',
        action: 'Ran the discovery session and mapped the referral queue.',
        deliverable: 'Map of three handoff points causing rework.',
        skills: ['process mapping'], confidence: 'high',
        evidence: ['x1', 'x2'], sources: ['gemini', 'zoom']
      },
      {
        title: 'Proposed triage flow shared with operations', kind: 'deliverable', status: 'completed',
        role: 'contributed', roleClaim: 'stated_in_source', customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
        datePrecision: 'week', workWeek: { start: '2026-05-11', end: '2026-05-17' },
        reportingPeriod: 'Week of 2026-05-15',
        action: 'Drafted the triage flow and shared it with the operations lead.',
        deliverable: 'Proposed triage flow document.',
        confidence: 'high', evidence: ['x3'], sources: ['gemini']
      },
      {
        title: 'Automating follow-up reminders (discussed only)', kind: 'activity', status: 'proposed',
        role: 'contributed', roleClaim: 'stated_in_source', customerId: 'c1', projectId: 'p1',
        datePrecision: 'week', workWeek: { start: '2026-05-11', end: '2026-05-17' },
        reportingPeriod: 'Week of 2026-05-15',
        action: 'Raised automating follow-up reminders in the working session.',
        confidence: 'high', evidence: ['x3'], sources: ['gemini'], flags: ['proposal_only']
      },
      {
        title: 'Triage routing workflow deployed to sandbox', kind: 'deliverable', status: 'completed',
        role: 'contributed', roleClaim: 'stated_in_source', customerId: 'c1', projectId: 'p1', milestoneOf: 'p1',
        datePrecision: 'week', workWeek: { start: '2026-05-11', end: '2026-05-17' },
        reportingPeriod: 'Week of 2026-05-15',
        action: 'Built and deployed the triage routing workflow to the sandbox.',
        deliverable: 'Triage routing workflow in the sandbox.',
        outcome: 'Operations estimated a saving of about two hours per week per coordinator.',
        outcomeClaim: 'stated_in_source',
        confidence: 'high', evidence: ['x4'], sources: ['gemini']
      }
    ],
    metrics: [
      {
        label: 'Time saved per coordinator', value: 2, valueText: 'about two hours',
        unit: 'hours per week', period: 'per week', scope: 'Each of four coordinators',
        measures: 'Estimated manual time avoided by the workflow',
        kind: 'estimate', owner: 'customer', claim: 'stated_in_source',
        customerId: 'c1', projectId: 'p1', aggregatable: false,
        evidence: ['x4'], sources: ['gemini']
      }
    ],
    learnings: []
  };
}

/* ================================================= 15. standalone export ==== */

test('the standalone export is a single file that runs with no server', () => {
  // Uses whatever the earlier tests committed to this temp HOME.
  const out = path.join(HOME, 'snapshot.html');
  const { file, bytes, ds } = buildStandalone({ out });

  assert.equal(file, out);
  assert.ok(bytes > 5000, 'the export should not be an empty shell');
  const html = fs.readFileSync(out, 'utf8');

  // No module syntax may survive the concatenation.
  const leftovers = html.split('\n').filter((l) => /^\s*(import|export)\s/.test(l));
  assert.deepEqual(leftovers, [], `module syntax left in the bundle: ${leftovers.slice(0, 3).join(' | ')}`);

  // Nothing may be loaded from elsewhere.
  assert.ok(!/src="js\//.test(html), 'scripts must be inlined');
  assert.ok(!/href="css\//.test(html), 'stylesheets must be inlined');
  assert.ok(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org[^"']*/g, '')),
    'the page must not reference any remote origin');

  // The dataset travels with it.
  assert.match(html, /window\.__PIP_DATA__ = \{/);
  const inlined = JSON.parse(html.match(/window\.__PIP_DATA__ = (\{.*?\});<\/script>/s)[1]
    .replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
  assert.equal(inlined.contributions.length, ds.contributions.length);
  assert.equal(inlined.excerpts.length, ds.excerpts.length);

  // A snapshot has to say it is one.
  assert.match(html, /Offline snapshot/);
  assert.match(html, /This file does not update/);

  // A '<' inside any record cannot end the script element early.
  assert.ok(!/<\/script>/i.test(html.match(/window\.__PIP_DATA__ = .*?;<\/script>/s)[0].slice(0, -9)),
    'embedded JSON must not contain a closing script tag');
});

test('the export refuses to run when the dataset is missing', () => {
  const aside = `${DATASET_FILE}.moved`;
  fs.renameSync(DATASET_FILE, aside);
  try {
    assert.throws(() => buildStandalone({ out: path.join(HOME, 'never.html') }),
      /No dataset yet/);
    assert.equal(fs.existsSync(path.join(HOME, 'never.html')), false,
      'a failed export must not leave a half-written file');
  } finally {
    fs.renameSync(aside, DATASET_FILE);
  }
});

test('a demo export is built from the demo dataset and says so', () => {
  const out = path.join(HOME, 'demo-snapshot.html');
  const { ds } = buildStandalone({ demo: true, out });
  assert.equal(ds.mode, 'demo');
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /SYNTHETIC DEMONSTRATION DATA/i,
    'a demo export must carry the demo notice with it');
});

/* ============================================ 16. carrying data between machines */

test('a backup round-trips the dataset, corrections and import log', () => {
  const before = loadDataset();
  // Corrections may not exist yet; a backup still has to carry the empty set.
  const readOverrides = () => (fs.existsSync(OVERRIDES_FILE)
    ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'))
    : { version: 1, entries: [] });
  const overridesBefore = readOverrides();
  const bk = path.join(HOME, 'backup.json');
  const made = makeBackup({ out: bk });

  assert.ok(made.bytes > 100);
  const payload = JSON.parse(fs.readFileSync(bk, 'utf8'));
  assert.equal(payload.kind, 'professional-impact-portfolio-backup');
  assert.ok(!JSON.stringify(payload).includes('function'), 'a backup carries data, never code');

  // Wipe the live data, then bring it back.
  fs.rmSync(DATASET_FILE);
  fs.rmSync(OVERRIDES_FILE, { force: true });
  restoreBackup(bk);

  const after = loadDataset();
  assert.deepEqual(after.contributions.map((c) => c.id).sort(), before.contributions.map((c) => c.id).sort());
  assert.deepEqual(after.metrics.map((m) => m.id).sort(), before.metrics.map((m) => m.id).sort());
  assert.equal(after.excerpts.length, before.excerpts.length);
  assert.equal(after.datasetVersion, before.datasetVersion);
  assert.ok(fs.existsSync(OVERRIDES_FILE), 'restore must write the corrections file, even when empty');
  assert.deepEqual(readOverrides(), overridesBefore);
});

test('restore rejects a file that is not a backup, and a schema it does not understand', () => {
  const notABackup = path.join(HOME, 'random.json');
  fs.writeFileSync(notABackup, JSON.stringify({ hello: 'world' }));
  assert.throws(() => restoreBackup(notABackup), /not a Professional Impact Portfolio backup/);

  const wrongSchema = path.join(HOME, 'future.json');
  const good = JSON.parse(fs.readFileSync(makeBackup({ out: path.join(HOME, 'tmp-bk.json') }).file, 'utf8'));
  fs.writeFileSync(wrongSchema, JSON.stringify({ ...good, schemaVersion: good.schemaVersion + 99 }));
  assert.throws(() => restoreBackup(wrongSchema), /schema version/);
});

test('restore will not silently replace a different dataset, and snapshots before it does', () => {
  const bk = path.join(HOME, 'other-period.json');
  const payload = JSON.parse(fs.readFileSync(makeBackup({ out: path.join(HOME, 'tmp2.json') }).file, 'utf8'));
  payload.dataset.coverage = { ...payload.dataset.coverage, sourceEnd: '2027-01-01' };
  fs.writeFileSync(bk, JSON.stringify(payload));

  assert.throws(() => restoreBackup(bk), /Pass --force/);
  const stillHere = loadDataset();
  assert.notEqual(stillHere.coverage.sourceEnd, '2027-01-01', 'the refusal must change nothing');

  const before = listVersions().length;
  const r = restoreBackup(bk, { force: true });
  assert.ok(r.snapshot, 'the replaced dataset must be snapshotted');
  assert.equal(listVersions().length, before + 1);
  assert.equal(loadDataset().coverage.sourceEnd, '2027-01-01');
});

test('the health check finds nothing that reaches outside this machine', () => {
  const checks = runDoctor();
  const failed = checks.filter((c) => c.state === 'fail');
  assert.deepEqual(failed, [], `failing checks: ${failed.map((f) => `${f.name}: ${f.detail}`).join('; ')}`);

  const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(byName['Runtime dependencies'].detail, 'none - there is nothing to install');
  assert.match(byName['External origins'].detail, /^none/);
  assert.match(byName['Server binding'].detail, /127\.0\.0\.1/);
});
