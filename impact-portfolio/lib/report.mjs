// Human-readable refresh report. Printed to the terminal and stored in the dataset
// so the dashboard can show "what changed in the last refresh".

export function formatReport(report, { validation, coverage, datasetVersion } = {}) {
  const L = [];
  const h = (s) => L.push('', `── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`);
  const li = (s) => L.push(`   ${s}`);
  const none = () => li('(none)');

  L.push(`Refresh report - ${report.pdfFileName}`);
  L.push(`Import ${report.importId} · dataset version ${datasetVersion ?? '?'}`);

  h('Dates covered by this source');
  if (coverage?.sourceStart) {
    li(`${coverage.sourceStart} → ${coverage.sourceEnd}  (${coverage.documentedWeekCount} weekly entries found)`);
    const partial = coverage.months.filter((m) => m.status === 'partial');
    const gaps = coverage.months.filter((m) => m.status === 'no_documentation');
    if (partial.length) li(`Partial months: ${partial.map((m) => `${m.month} (${m.weeksDocumented}/${m.weeksExpected})`).join(', ')}`);
    if (gaps.length) li(`No entries found: ${gaps.map((m) => m.month).join(', ')}`);
  } else {
    li('No dated weekly entries were identified.');
  }

  h(`New contributions (${report.newContributions.length})`);
  report.newContributions.length ? report.newContributions.forEach((c) => li(`+ ${c.title}  [${c.status}]`)) : none();

  h(`Updated contributions (${report.updatedContributions.length})`);
  report.updatedContributions.length
    ? report.updatedContributions.forEach((c) => li(`~ ${c.title}  (${c.fields.join(', ')})`)) : none();

  h(`Merged duplicates (${report.mergedDuplicates.length})`);
  report.mergedDuplicates.length
    ? report.mergedDuplicates.forEach((m) => li(`= ${m.title}  [${m.sources.join(' + ')}] ${m.reason}`)) : none();

  h(`Changed metrics (${report.changedMetrics.length})`);
  report.changedMetrics.length
    ? report.changedMetrics.forEach((m) => li(`! ${m.label}: ${m.from} → ${m.to}`)) : none();

  h(`Repeated metrics counted once (${report.repeatedMetrics.length})`);
  report.repeatedMetrics.length
    ? report.repeatedMetrics.forEach((m) => li(`· ${m.label}`)) : none();

  h(`Unresolved conflicts (${report.unresolvedConflicts.length})`);
  report.unresolvedConflicts.length
    ? report.unresolvedConflicts.forEach((c) => li(`? ${c.type}: ${c.label ?? c.title}`)) : none();

  h(`Previously recorded, absent from this export (${report.missingFromExport.length})`);
  report.missingFromExport.length
    ? report.missingFromExport.forEach((c) => li(`… ${c.title} (last seen ${c.lastSeenImport})`)) : none();

  h(`Re-paginated excerpts (${report.repaginated.length})`);
  report.repaginated.length
    ? report.repaginated.slice(0, 10).forEach((r) => li(`p${r.from} → p${r.to}  ${r.excerptId}`)) : none();
  if (report.repaginated.length > 10) li(`… and ${report.repaginated.length - 10} more`);

  h(`Unreadable / OCR-needed sections (${report.unreadableSections.length})`);
  report.unreadableSections.length
    ? report.unreadableSections.forEach((s) => li(`× ${s}`)) : none();

  h(`Sections left unresolved by analysis (${report.unresolvedSections.length})`);
  report.unresolvedSections.length
    ? report.unresolvedSections.forEach((s) => li(`? ${s}`)) : none();

  if (validation) {
    h(`Validation`);
    li(validation.ok ? 'All blocking rules passed.' : `${validation.errors.length} blocking error(s).`);
    validation.errors.slice(0, 20).forEach((e) => li(`  ERROR ${e.code}: ${e.message}`));
    if (validation.errors.length > 20) li(`  … ${validation.errors.length - 20} more`);
    li(`${validation.warnings.length} warning(s) recorded for review.`);
    validation.warnings.slice(0, 10).forEach((w) => li(`  warn  ${w.code}: ${w.message}`));
    if (validation.warnings.length > 10) li(`  … ${validation.warnings.length - 10} more`);
  }

  L.push('');
  return L.join('\n');
}
