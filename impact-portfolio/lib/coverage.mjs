// Coverage accounting.
//
// The point of this file: a month with few records may simply be a month that was
// documented less. Absence of documentation is never presented as absence of work,
// and a partial month is never silently compared against a complete one.

import { monthRange, isISODate, uniq, todayISO, weekOf } from './util.mjs';

/** All Monday-start weeks that overlap a given YYYY-MM. */
export function weeksInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const out = [];
  let cur = new Date(first);
  while (cur <= last) {
    const w = weekOf(cur.toISOString().slice(0, 10));
    if (!out.some((x) => x.start === w.start)) out.push(w);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  const lastWeek = weekOf(last.toISOString().slice(0, 10));
  if (!out.some((x) => x.start === lastWeek.start)) out.push(lastWeek);
  return out;
}

/**
 * @param documentedPeriods array of ISO dates: one per weekly entry found in the PDF
 */
export function buildCoverage(documentedPeriods, { declaredStart = '2026-05-01', today = todayISO() } = {}) {
  const dates = uniq(documentedPeriods.filter(isISODate)).sort();
  const sourceStart = dates[0] ?? null;
  const sourceEnd = dates[dates.length - 1] ?? null;

  const rangeStart = sourceStart && sourceStart < declaredStart ? sourceStart : declaredStart;
  const rangeEnd = sourceEnd ?? declaredStart;
  const months = monthRange(rangeStart.slice(0, 10), rangeEnd.slice(0, 10)).map((ym) => {
    const weeks = weeksInMonth(ym);
    const documented = weeks.filter((w) => dates.some((d) => d >= w.start && d <= w.end));
    const expected = weeks.length;
    const count = documented.length;
    let status;
    if (count === 0) status = 'no_documentation';
    else if (count >= expected) status = 'complete';
    else status = 'partial';
    return {
      month: ym,
      weeksExpected: expected,
      weeksDocumented: count,
      status,
      comparable: status === 'complete',
      label: count === 0
        ? 'No entries found in the source for this month'
        : `${count} of ${expected} weeks documented${status === 'partial' ? ' - partial' : ''}`
    };
  });

  // Months between the end of the source and today are simply not exported yet.
  const notYetExported = sourceEnd
    ? monthRange(sourceEnd, today).slice(1).map((ym) => ({
        month: ym,
        weeksExpected: weeksInMonth(ym).length,
        weeksDocumented: 0,
        status: 'not_in_export',
        comparable: false,
        label: 'After the end of the latest export - not yet provided'
      }))
    : [];

  return {
    declaredStart,
    sourceStart,
    sourceEnd,
    documentedWeekCount: dates.length,
    months: [...months, ...notYetExported],
    notes: [
      'Coverage is measured from weekly entries found in the source document.',
      'A month marked "partial" is not directly comparable with a complete month.',
      'Missing documentation is not evidence that no work happened.'
    ]
  };
}

/** Which months in a selected range are safe to compare. */
export function comparabilityWarning(coverage, monthsInView) {
  const rows = coverage.months.filter((m) => monthsInView.includes(m.month));
  const partial = rows.filter((m) => m.status === 'partial').map((m) => m.month);
  const empty = rows.filter((m) => m.status === 'no_documentation' || m.status === 'not_in_export').map((m) => m.month);
  if (!partial.length && !empty.length) return null;
  return {
    partial,
    empty,
    message: [
      partial.length ? `${partial.join(', ')} ${partial.length === 1 ? 'is' : 'are'} only partially documented.` : null,
      empty.length ? `${empty.join(', ')} ${empty.length === 1 ? 'has' : 'have'} no entries in the source.` : null,
      'Treat totals across this range as a floor, not a complete count.'
    ].filter(Boolean).join(' ')
  };
}
