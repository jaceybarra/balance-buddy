// The four views. Each one renders from the same structured evidence; none of them
// invents a number, a ranking or a causal claim that the dataset does not carry.

import {
  STATUS_META, KIND_META, ROLE_META, CLAIM_META, METRIC_KIND_META, OWNER_META,
  effectiveRange, dateLabel, fmt, monthLabel, monthsBetween, isDefinitive, excludedReason,
  aggregatableGroups, lookup, metricsFor
} from './model.mjs';
import {
  el, clear, section, statTile, notice, statusBadge, kindBadge, roleBadge, claimBadge,
  metricKindBadge, flagBadges, contributionRecord, excerptBlock, coverageChart, stackChart,
  metricValue, copyToClipboard, downloadText, anonText, anonList
} from './ui.mjs';

/* ============================================================== A. OVERVIEW */

export function renderOverview(root, ctx) {
  const { ds, view, range, anonymise, setFilter } = ctx;
  clear(root);

  const { kept, undated } = view;
  const definitive = kept.filter(isDefinitive);
  const completed = definitive.filter((c) => c.status === 'completed');
  const ongoing = kept.filter((c) => c.status === 'in_progress');
  const proposals = kept.filter((c) => c.status === 'proposed');
  const deliverables = completed.filter((c) => c.kind === 'deliverable');
  const reportedOutcomes = kept.filter((c) => c.outcome && c.outcomeClaim === 'stated_in_source');
  const viewMetrics = metricsFor(ds, kept, ctx.filter);
  const achieved = viewMetrics.filter((m) => m.kind === 'achieved' && !m.repeatOf);

  /* ---- the answer, first */
  root.append(section(null,
    el('p', { class: 'muted', style: 'margin-bottom:6px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;font-weight:680',
      text: 'What did I accomplish in this period, and why did it matter?' }),
    el('p', { class: 'lede' }, ...ledeText({ ds, kept, completed, deliverables, ongoing, proposals, reportedOutcomes, achieved, range, anonymise })),
    coverageWarning(ds, range),
    el('div', { class: 'stat-row', style: 'margin-top:16px' },
      statTile(deliverables.length, 'Completed deliverables', 'Things that exist because of the work'),
      statTile(reportedOutcomes.length, 'Outcomes reported in the source', 'Stated, not independently verified'),
      statTile(ongoing.length, 'Initiatives still in progress', 'Latest documented status'),
      statTile(ds.coverage?.documentedWeekCount ?? 0, 'Weekly entries in the source', `${ds.coverage?.sourceStart ?? '—'} → ${ds.coverage?.sourceEnd ?? '—'}`))));

  /* ---- charts */
  const statusSegs = ['completed', 'in_progress', 'proposed', 'unclear'].map((s) => ({
    key: s, label: STATUS_META[s].label, icon: STATUS_META[s].icon,
    series: STATUS_META[s].series, pat: STATUS_META[s].pat,
    count: kept.filter((c) => c.status === s).length
  }));

  root.append(el('div', { class: 'grid grid--2' },
    section('Documentation coverage',
      coverageChart(ds.coverage ?? { months: [] }, (m) => setFilter({ period: 'custom', from: `${m.month}-01`, to: lastDayOf(m.month) }))),
    section('Where the recorded work stands',
      stackChart({
        caption: 'Every record in view, by its latest documented status. Click a segment to see those records.',
        segments: statusSegs,
        onPick: (s) => setFilter({ status: s.key, tab: 'impact' })
      }),
      el('p', { class: 'card-note', style: 'margin-top:12px' },
        'A proposal is work that was discussed. It is shown separately from work that was delivered.'),
      recordTableToggle(kept, ds, anonymise))));

  /* ---- best-supported contributions (not a ranking of importance) */
  const bestSupported = [...definitive]
    .filter((c) => c.evidence.length > 0)
    .sort((a, b) => scoreSupport(b) - scoreSupport(a))
    .slice(0, 6);

  root.append(section('Most fully evidenced contributions',
    el('p', { class: 'card-note' },
      'Ordered by how completely the source documents them - an outcome, a named role and more than one ' +
      'supporting excerpt rank higher. This is a measure of documentation, not of importance.'),
    bestSupported.length
      ? el('div', {}, ...bestSupported.map((c) => contributionRecord(ds, c, { anonymise })))
      : el('p', { class: 'muted', text: 'No contributions in this period carry supporting excerpts.' })));

  /* ---- reported outcomes */
  root.append(section('Outcomes reported in the source',
    reportedOutcomes.length
      ? el('div', { class: 'table-scroll' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', { text: 'Contribution' }), el('th', { text: 'Reported outcome' }),
            el('th', { text: 'Claim' }), el('th', { text: 'My role' }))),
          el('tbody', {}, ...reportedOutcomes.map((c) => el('tr', {},
            el('td', {}, el('strong', { text: anonText(c.title, anonymise) }), el('div', { class: 'muted', text: dateLabel(c) })),
            el('td', { text: anonText(c.outcome, anonymise) }),
            el('td', {}, claimBadge(c.outcomeClaim)),
            el('td', {}, roleBadge(c.role)))))))
      : el('p', { class: 'muted', text: 'No outcomes are stated in the source for this period.' }),
    el('p', { class: 'card-note', style: 'margin-top:10px' },
      '"Stated in source" means the document reports it. These are AI-generated summaries of meetings and email, ' +
      'not independently verified records.')));

  /* ---- learning themes */
  const themes = learningThemes(ds, kept);
  root.append(section('Learning themes',
    themes.length
      ? el('ul', { class: 'clean' }, ...themes.map((t) => el('li', {},
          el('strong', { text: anonText(t.theme, anonymise) }),
          t.summary ? ` — ${anonText(t.summary, anonymise)}` : '',
          t.examples?.length ? el('div', { class: 'muted', text: `Applied: ${anonList(t.examples, anonymise).join(' · ')}` }) : null)))
      : el('p', { class: 'muted', text: 'No learning themes are recorded for this period.' })));

  /* ---- gaps */
  const gaps = (ds.gaps ?? []).filter((g) => kept.some((c) => c.id === g.contributionId));
  root.append(section('Material evidence gaps',
    el('p', { class: 'card-note' }, 'What the source does not say. An absent update is not evidence that the work stalled.'),
    gaps.length
      ? el('ul', { class: 'clean' }, ...gaps.slice(0, 12).map((g) => el('li', {},
          el('strong', { text: anonText(g.title, anonymise) }), ' — ', anonText(g.message, anonymise))))
      : el('p', { class: 'muted', text: 'No gaps recorded for the contributions in view.' }),
    gaps.length > 12 ? el('p', { class: 'muted', text: `…and ${gaps.length - 12} more. See Customers, projects & development.` }) : null));

  /* ---- what is excluded */
  const excluded = kept.filter((c) => !isDefinitive(c));
  if (excluded.length || undated.length) {
    root.append(section('Records held out of the headline counts',
      el('p', { class: 'card-note' }, 'These stay available for inspection but are not counted as definitive outcomes.'),
      el('ul', { class: 'clean' },
        ...excluded.map((c) => el('li', {}, el('strong', { text: anonText(c.title, anonymise) }), ' — ', excludedReason(c))),
        ...undated.map((c) => el('li', {}, el('strong', { text: anonText(c.title, anonymise) }),
          ' — no date is documented, so it cannot be placed in a period')))));
  }
}

function scoreSupport(c) {
  let s = c.evidence.length;
  if (c.outcome && c.outcomeClaim === 'stated_in_source') s += 3;
  if (c.roleClaim === 'stated_in_source') s += 1;
  if (c.sources.length > 1) s += 1;
  if (c.kind === 'deliverable') s += 1;
  if (c.confidence === 'high') s += 1;
  return s;
}

function ledeText({ ds, kept, completed, deliverables, ongoing, proposals, reportedOutcomes, achieved, range, anonymise }) {
  if (kept.length === 0) {
    return [el('span', {}, 'No documented work falls inside this selection. '),
      el('span', { class: 'qualifier', text: 'That is a statement about the documentation, not about the work.' })];
  }
  const customers = new Set(kept.map((c) => c.customerId).filter(Boolean));
  const projects = new Set(kept.map((c) => c.projectId ?? c.milestoneOf).filter(Boolean));
  const parts = [];
  parts.push(el('span', {}, 'Across '), el('strong', { text: `${range.label}` }), el('span', {}, ', the document records '));
  parts.push(el('strong', { text: `${kept.length} distinct contribution${kept.length === 1 ? '' : 's'}` }));
  parts.push(el('span', {}, ` spanning ${projects.size} initiative${projects.size === 1 ? '' : 's'} for ${customers.size} customer${customers.size === 1 ? '' : 's'}. `));
  parts.push(el('strong', { text: `${deliverables.length} deliverable${deliverables.length === 1 ? '' : 's'}` }));
  parts.push(el('span', {}, ` completed, ${ongoing.length} initiative${ongoing.length === 1 ? '' : 's'} still in progress`));
  if (proposals.length) parts.push(el('span', {}, `, and ${proposals.length} idea${proposals.length === 1 ? '' : 's'} discussed but not implemented`));
  parts.push(el('span', {}, '. '));
  if (reportedOutcomes.length) {
    const one = reportedOutcomes.length === 1;
    parts.push(el('span', { class: 'qualifier' },
      `${one ? 'One' : reportedOutcomes.length} of these ${one ? 'carries' : 'carry'} an outcome stated in the source` +
      (achieved.length
        ? `, and ${achieved.length === 1 ? 'one carries' : `${achieved.length} carry`} a measured value.`
        : ', though none carries a measured value.')));
  } else {
    parts.push(el('span', { class: 'qualifier' },
      'None of them carries an outcome stated in the source, so the value of the work is described qualitatively rather than measured.'));
  }
  return parts;
}

function coverageWarning(ds, range) {
  const months = monthsBetween(range.from, range.to);
  const rows = (ds.coverage?.months ?? []).filter((m) => months.includes(m.month));
  const partial = rows.filter((m) => m.status === 'partial').map((m) => monthLabel(m.month));
  const empty = rows.filter((m) => m.status === 'no_documentation' || m.status === 'not_in_export').map((m) => monthLabel(m.month));
  if (!partial.length && !empty.length) return null;
  return notice('warn',
    el('strong', { text: 'Partial coverage. ' }),
    partial.length ? `${partial.join(', ')} ${partial.length === 1 ? 'is' : 'are'} only partly documented. ` : '',
    empty.length ? `${empty.join(', ')} ${empty.length === 1 ? 'has' : 'have'} no entries in the source. ` : '',
    'Treat totals across this range as a floor. Missing documentation is not evidence that no work happened, ' +
    'and a partial month is not comparable with a complete one.');
}

function lastDayOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function learningThemes(ds, kept) {
  const ids = new Set(kept.flatMap((c) => c.evidence));
  return (ds.learnings ?? []).filter((l) => (l.evidence ?? []).some((e) => ids.has(e)) || kept.length === ds.contributions.length);
}

function recordTableToggle(records, ds, anonymise) {
  const d = el('details', { style: 'margin-top:12px' },
    el('summary', { class: 'muted', style: 'cursor:pointer;font-size:.82rem', text: 'Show the records behind this chart' }));
  const body = el('div', { class: 'table-scroll', style: 'margin-top:8px' },
    el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Contribution' }), el('th', { text: 'Status' }),
        el('th', { text: 'Kind' }), el('th', { text: 'When' }))),
      el('tbody', {}, ...records.map((c) => el('tr', {},
        el('td', { text: anonText(c.title, anonymise) }),
        el('td', {}, statusBadge(c.status)),
        el('td', {}, kindBadge(c.kind)),
        el('td', { text: dateLabel(c) }))))));
  d.append(body);
  return d;
}

/* ====================================================== B. IMPACT & METRICS */

export function renderImpact(root, ctx) {
  const { ds, view, anonymise, filter, setFilter } = ctx;
  clear(root);
  const { kept, undated } = view;
  const viewMetrics = metricsFor(ds, kept, filter);

  root.append(section(null,
    el('div', { class: 'toggle-row' },
      el('span', { class: 'muted', text: `${kept.length} contribution${kept.length === 1 ? '' : 's'} in view` }),
      ...['', 'completed', 'in_progress', 'proposed', 'unclear'].map((s) =>
        el('button', {
          class: `btn ${filter.status === s || (!filter.status && s === '') ? 'btn--primary' : ''}`,
          type: 'button', onclick: () => setFilter({ status: s })
        }, s === '' ? 'All statuses' : STATUS_META[s].label))),
    el('p', { class: 'card-note' },
      'Each record separates the problem, what I did, what was produced, and what changed. ' +
      'Expand a record to read the exact source excerpts and their page numbers.')));

  if (kept.length === 0) {
    root.append(section(null, el('p', { class: 'muted', text: 'No contributions match the current filters.' })));
  } else {
    const wrap = el('div');
    for (const c of kept) wrap.append(contributionRecord(ds, c, { anonymise }));
    root.append(wrap);
  }

  if (undated.length) {
    root.append(section('Undated records',
      el('p', { class: 'card-note' }, 'The source does not date these, so they cannot be placed in a period. They are shown here rather than dropped.'),
      ...undated.map((c) => contributionRecord(ds, c, { anonymise }))));
  }

  /* ---- metric evidence table */
  const kinds = ['achieved', 'estimate', 'target', 'context'];
  const segs = kinds.map((k) => ({
    key: k, label: METRIC_KIND_META[k].label, icon: METRIC_KIND_META[k].icon,
    series: METRIC_KIND_META[k].series, pat: METRIC_KIND_META[k].pat,
    count: viewMetrics.filter((m) => m.kind === k && !m.repeatOf).length
  }));

  root.append(section('Metric evidence',
    el('p', { class: 'card-note' },
      'Every number the source states, with what it measures, whose it is, and which category it belongs to. ' +
      'A customer’s operating volume is context. An estimate is not a measured result. A target is not an outcome.'),
    stackChart({
      caption: 'Metric observations in view, by category (restatements excluded).',
      segments: segs,
      onPick: (s) => { const t = document.getElementById('metric-kind-filter'); if (t) { t.value = s.key; t.dispatchEvent(new Event('change')); } }
    }),
    metricTable(ds, viewMetrics, anonymise),
    aggregationPanel(viewMetrics)));
}

function metricTable(ds, metrics, anonymise) {
  const A = (t) => anonText(t, anonymise);
  const select = el('select', { id: 'metric-kind-filter' },
    el('option', { value: '', text: 'All categories' }),
    ...['achieved', 'estimate', 'target', 'context'].map((k) =>
      el('option', { value: k, text: METRIC_KIND_META[k].label })),
    el('option', { value: 'repeat', text: 'Restatements only' }));

  const tbody = el('tbody');
  const draw = () => {
    clear(tbody);
    const v = select.value;
    const rows = metrics.filter((m) => {
      if (v === '') return true;
      if (v === 'repeat') return !!m.repeatOf;
      return m.kind === v && !m.repeatOf;
    });
    if (!rows.length) {
      tbody.append(el('tr', {}, el('td', { colspan: '8', class: 'muted', text: 'No metric observations in this category.' })));
      return;
    }
    for (const m of rows) {
      const contrib = m.contributionId ? lookup(ds.contributions, m.contributionId) : null;
      const conflict = (ds.conflicts ?? []).find((x) => x.metricId === m.id && x.resolution === 'unresolved');
      const detail = el('tr', { hidden: true }, el('td', { colspan: '8' },
        conflict ? el('div', { class: 'notice notice--warn' },
          el('strong', { text: 'The sources disagree. ' }),
          `An earlier entry records ${describeSide(conflict.existing)}; a later one records ` +
          `${describeSide(conflict.incoming)}. Both are kept; neither is treated as settled.`) : null,
        el('div', { class: 'field-block' },
          el('span', { class: 'k', text: 'What it measures' }),
          el('div', { class: m.measures ? 'v' : 'v empty', text: A(m.measures) ?? 'The source does not say what this number measures' })),
        m.baseline ? el('div', { class: 'field-block' },
          el('span', { class: 'k', text: 'Baseline stated' }), el('div', { class: 'v', text: A(m.baseline) })) : null,
        contrib ? el('div', { class: 'field-block' },
          el('span', { class: 'k', text: 'Attached to' }), el('div', { class: 'v', text: A(contrib.title) })) : null,
        el('div', { class: 'field-block' },
          el('span', { class: 'k', text: 'Evidence' }),
          ...m.evidence.map((id) => excerptBlock(lookup(ds.excerpts, id), anonymise)))));

      const row = el('tr', { style: 'cursor:pointer', onclick: () => { detail.hidden = !detail.hidden; } },
        el('td', {}, el('strong', { text: A(m.label) }),
          m.repeatOf ? el('div', { class: 'chip-row', style: 'margin-top:4px' }, ...flagBadges(['restatement'])) : null,
          (m.flags ?? []).includes('conflict') ? el('div', { class: 'chip-row', style: 'margin-top:4px' }, ...flagBadges(['conflict'])) : null),
        el('td', { class: 'num', text: metricValue(m) }),
        el('td', {}, metricKindBadge(m.kind)),
        el('td', { text: OWNER_META[m.owner] }),
        el('td', { text: m.period ?? '—' }),
        el('td', { text: A(m.scope) ?? '—' }),
        el('td', {}, claimBadge(m.claim)),
        el('td', { class: 'muted', text: m.aggregatable ? 'may be summed' : 'not summable' }));
      tbody.append(row, detail);
    }
  };
  select.addEventListener('change', draw);
  draw();

  return el('div', {},
    el('div', { class: 'toggle-row', style: 'margin-top:14px' },
      el('label', { class: 'switch', for: 'metric-kind-filter' }, 'Category'), select,
      el('span', { class: 'muted', text: 'Click a row to see the excerpt behind it.' })),
    el('div', { class: 'table-scroll' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Observation' }), el('th', { text: 'Value' }), el('th', { text: 'Category' }),
          el('th', { text: 'Whose metric' }), el('th', { text: 'Period' }), el('th', { text: 'Scope' }),
          el('th', { text: 'Claim' }), el('th', { text: 'Aggregation' }))),
        tbody)));
}

function aggregationPanel(metrics) {
  const groups = aggregatableGroups(metrics);
  const blocked = metrics.filter((m) => !m.aggregatable && !m.repeatOf);
  const repeats = metrics.filter((m) => m.repeatOf);

  return el('div', { style: 'margin-top:18px' },
    el('h3', { text: 'What may and may not be added up' }),
    groups.length
      ? el('ul', { class: 'clean' }, ...groups.map((g) => el('li', {},
          el('strong', { text: `${g.total}${g.unit ? ` ${g.unit}` : ''} — ${g.label}` }),
          ` across ${g.members.length} non-overlapping observation${g.members.length === 1 ? '' : 's'} `,
          el('span', { class: 'muted', text: `(${g.members.map((m) => m.period).join('; ')})` }))))
      : el('p', { class: 'muted', text: 'Nothing in view may be aggregated: no two achieved results share a unit with non-overlapping periods and scopes.' }),
    el('p', { class: 'card-note', style: 'margin-top:10px' },
      `${blocked.length} observation${blocked.length === 1 ? ' is' : 's are'} deliberately not summed ` +
      '(estimates, targets, customer context, percentages, rates and recurring snapshots). ' +
      (repeats.length
        ? `${repeats.length} restatement${repeats.length === 1 ? '' : 's'} of a value already recorded ${repeats.length === 1 ? 'is' : 'are'} counted once. `
        : '') +
      'Repeating a benefit in four weekly summaries does not multiply it.'));
}

/* ======================================= C. CUSTOMERS, PROJECTS, DEVELOPMENT */

export function renderInitiatives(root, ctx) {
  const { ds, view, anonymise, setFilter } = ctx;
  clear(root);
  const { kept } = view;

  const byProject = new Map();
  for (const c of kept) {
    const pid = c.projectId ?? c.milestoneOf ?? '__none';
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(c);
  }

  root.append(section(null,
    el('p', { class: 'card-note' },
      'Work grouped into initiatives, each with its dated milestones, the latest status the source documents, ' +
      'my role, and the outcomes linked to it. An initiative without a recent entry is not shown as stalled - ' +
      'the source simply has not said anything more about it.')));

  if (byProject.size === 0) {
    root.append(section(null, el('p', { class: 'muted', text: 'No initiatives match the current filters.' })));
  }

  for (const [pid, records] of [...byProject.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const project = pid === '__none' ? null : lookup(ds.projects, pid);
    const customer = project?.customerId ? lookup(ds.customers, project.customerId) : null;
    const A = (t) => anonText(t, anonymise);
    const custName = customer ? (anonymise ? anonymise.name(customer.name) : customer.name) : null;

    const sorted = [...records].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const latest = sorted[sorted.length - 1];
    const roles = [...new Set(records.map((c) => c.role))];
    const outcomes = records.filter((c) => c.outcome);
    const projMetrics = ds.metrics.filter((m) => m.projectId === pid && !m.repeatOf);
    const projGaps = (ds.gaps ?? []).filter((g) => records.some((c) => c.id === g.contributionId));

    const card = section(A(project?.name) ?? 'Work not linked to a named initiative');
    card.append(
      el('div', { class: 'chip-row', style: 'margin-bottom:10px' },
        custName ? el('span', { class: 'badge', text: custName }) : null,
        statusBadge(latest.status),
        ...roles.map((r) => roleBadge(r)),
        el('span', { class: 'badge', text: `${records.length} dated entr${records.length === 1 ? 'y' : 'ies'}` })),
      el('p', { class: 'card-note' },
        `Latest documented status: ${STATUS_META[latest.status].label.toLowerCase()}, as at ${dateLabel(latest)}.` +
        (roles.length > 1 ? ' My role is documented differently across entries - see each milestone.' : '')),
      el('h3', { text: 'Milestones' }),
      el('div', { class: 'table-scroll' },
        el('table', {},
          el('thead', {}, el('tr', {},
            el('th', { text: 'When' }), el('th', { text: 'Milestone' }),
            el('th', { text: 'Status' }), el('th', { text: 'Kind' }), el('th', { text: 'My role' }),
            el('th', { text: 'Outcome documented' }))),
          el('tbody', {}, ...sorted.map((c) => el('tr', {},
            el('td', { text: dateLabel(c) }),
            el('td', { text: A(c.title) }),
            el('td', {}, statusBadge(c.status)),
            el('td', {}, kindBadge(c.kind)),
            el('td', {}, roleBadge(c.role)),
            el('td', {}, c.outcome
              ? el('span', {}, A(c.outcome), ' ', claimBadge(c.outcomeClaim))
              : el('span', { class: 'muted', text: 'Not documented' }))))))));

    if (projMetrics.length) {
      card.append(el('h3', { style: 'margin-top:16px', text: 'Metrics linked to this initiative' }),
        el('ul', { class: 'clean' }, ...projMetrics.map((m) => el('li', {},
          el('strong', { text: metricValue(m) }), ' — ', A(m.label), ' ',
          metricKindBadge(m.kind), ' ',
          el('span', { class: 'muted', text: OWNER_META[m.owner] })))));
    }

    if (projGaps.length) {
      card.append(el('h3', { style: 'margin-top:16px', text: 'What is not documented' }),
        el('ul', { class: 'clean' }, ...projGaps.map((g) => el('li', {}, el('strong', { text: A(g.title) }), ' — ', A(g.message)))));
    }

    card.append(el('details', { style: 'margin-top:12px' },
      el('summary', { class: 'muted', style: 'cursor:pointer;font-size:.84rem', text: 'Full records with source excerpts' }),
      el('div', { style: 'margin-top:10px' }, ...sorted.map((c) => contributionRecord(ds, c, { anonymise })))));

    root.append(card);
  }

  /* ---- development */
  root.append(section('How I developed',
    el('p', { class: 'card-note' }, 'Learning themes recorded in the source, with the concrete work each one was applied to.'),
    (ds.learnings ?? []).length
      ? el('div', {}, ...(ds.learnings ?? []).map((l) => el('div', { class: 'field-block' },
          el('span', { class: 'k', text: anonText(l.theme, anonymise) }),
          el('div', { class: 'v', text: anonText(l.summary ?? '', anonymise) }),
          l.examples?.length ? el('ul', { class: 'clean' }, ...anonList(l.examples, anonymise).map((e) => el('li', { text: e }))) : null,
          el('div', { class: 'chip-row', style: 'margin-top:6px' },
            claimBadge(l.claim ?? 'stated_in_source'),
            ...(l.appliedIn ?? []).map((pid) => {
              const p = lookup(ds.projects, pid);
              return p ? el('span', { class: 'badge', text: anonText(p.name, anonymise) }) : null;
            }).filter(Boolean)),
          el('div', { style: 'margin-top:8px' },
            ...(l.evidence ?? []).map((id) => excerptBlock(lookup(ds.excerpts, id), anonymise))))))
      : el('p', { class: 'muted', text: 'No learning themes recorded.' })));

  const skillCounts = new Map();
  for (const c of kept) for (const s of c.skills ?? []) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
  if (skillCounts.size) {
    root.append(section('Skills named in the source',
      el('p', { class: 'card-note' }, 'The number is how many records mention the skill - a count of documentation, not of proficiency.'),
      el('div', { class: 'chip-row' }, ...[...skillCounts.entries()].sort((a, b) => b[1] - a[1])
        .map(([s, n]) => el('span', { class: 'badge', text: `${s} · ${n}` })))));
  }
}

function sortKey(c) {
  const r = effectiveRange(c);
  return r ? r.start : '9999';
}

/* ================================================ D. REVIEW-READY SUMMARIES */

export function renderReview(root, ctx) {
  const { ds, view, range, anonymise, setAnonymise } = ctx;
  clear(root);
  const { kept } = view;

  const state = {
    style: 'manager',
    includeSources: true,
    includeUncertainty: true
  };

  const output = el('pre', { class: 'review-output', id: 'review-output' });

  const rebuild = () => {
    output.textContent = buildSummary(ds, kept, range, {
      ...state, anonymise
    });
  };

  const controls = el('div', { class: 'toggle-row no-print' },
    el('label', { class: 'switch' },
      el('input', { type: 'radio', name: 'style', checked: true, onchange: () => { state.style = 'manager'; rebuild(); } }),
      'Manager update'),
    el('label', { class: 'switch' },
      el('input', { type: 'radio', name: 'style', onchange: () => { state.style = 'review'; rebuild(); } }),
      'Performance review'),
    el('label', { class: 'switch' },
      el('input', { type: 'checkbox', checked: true, onchange: (e) => { state.includeSources = e.target.checked; rebuild(); } }),
      'Include source references (internal version)'),
    el('label', { class: 'switch' },
      el('input', { type: 'checkbox', checked: true, onchange: (e) => { state.includeUncertainty = e.target.checked; rebuild(); } }),
      'Preserve uncertainty and attribution'),
    el('label', { class: 'switch' },
      el('input', { type: 'checkbox', checked: !!anonymise, onchange: (e) => setAnonymise(e.target.checked) }),
      'Anonymise customer names'));

  const actions = el('div', { class: 'btn-group no-print', style: 'margin-top:12px' },
    el('button', { class: 'btn btn--primary', type: 'button', onclick: (e) => copyToClipboard(output.textContent, e.target) }, 'Copy'),
    el('button', { class: 'btn', type: 'button', onclick: () => downloadText(`impact-summary-${range.from ?? 'all'}-to-${range.to ?? 'all'}.md`, output.textContent, 'text/markdown') }, 'Download Markdown'),
    el('button', { class: 'btn', type: 'button', onclick: () => downloadText(`impact-summary-${range.from ?? 'all'}-to-${range.to ?? 'all'}.txt`, stripMarkdown(output.textContent)) }, 'Download plain text'),
    el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print / PDF'));

  root.append(section('Review-ready summary',
    el('p', { class: 'card-note' },
      'Generated from the same structured evidence as every other view - action → contribution → result, ' +
      'with uncertainty and attribution preserved. Nothing here is stronger than the record it came from.'),
    controls, actions, output));

  rebuild();
}

function buildSummary(ds, records, range, opts) {
  const L = [];
  const anon = opts.anonymise;
  const A = (t) => anonText(t, anon);
  const nameOf = (id, list) => {
    const e = lookup(list, id);
    if (!e) return null;
    return anon ? anon.name(e.name) : e.name;
  };

  const heading = opts.style === 'manager' ? 'Manager update' : 'Performance review notes';
  L.push(`# ${heading} — ${range.label}`);
  L.push('');
  L.push(`Source: professional development document, ${ds.coverage?.sourceStart ?? '—'} to ${ds.coverage?.sourceEnd ?? '—'}.`);
  if (opts.includeUncertainty) {
    L.push('These bullets summarise AI-generated weekly summaries of meetings and email. ' +
      '"Stated in source" means the document reports it; it does not mean it was independently verified.');
  }
  L.push('');

  const delivered = records.filter((c) => c.status === 'completed' && isDefinitive(c));
  const ongoing = records.filter((c) => c.status === 'in_progress');
  const proposed = records.filter((c) => c.status === 'proposed');
  const held = records.filter((c) => !isDefinitive(c) && c.status !== 'in_progress' && c.status !== 'proposed');

  L.push('## Delivered');
  L.push('');
  if (!delivered.length) L.push('- Nothing in this period is recorded as completed.');
  for (const c of delivered) L.push(bullet(ds, c, opts, nameOf, A));
  L.push('');

  if (ongoing.length) {
    L.push('## In progress');
    L.push('');
    for (const c of ongoing) L.push(bullet(ds, c, opts, nameOf, A));
    L.push('');
  }

  if (proposed.length && opts.includeUncertainty) {
    L.push('## Discussed, not implemented');
    L.push('');
    for (const c of proposed) {
      const cust = nameOf(c.customerId, ds.customers);
      L.push(`- ${cust ? `${cust}: ` : ''}${A(c.action ?? c.title)}. No implementation is recorded.` + cite(ds, c, opts));
    }
    L.push('');
  }

  const metrics = metricsFor(ds, records, {}).filter((m) => !m.repeatOf);
  const achieved = metrics.filter((m) => m.kind === 'achieved');
  const estimates = metrics.filter((m) => m.kind === 'estimate');
  const context = metrics.filter((m) => m.kind === 'context');

  if (achieved.length || estimates.length) {
    L.push('## Numbers, and what they are');
    L.push('');
    for (const m of achieved) {
      L.push(`- **${metricValue(m)}** — ${A(m.label)}. Achieved result${m.period ? `, ${m.period}` : ''}${m.scope ? `, scope: ${A(m.scope)}` : ''}. ` +
        `${OWNER_META[m.owner]}.` + citeMetric(ds, m, opts));
    }
    for (const m of estimates) {
      L.push(`- **${metricValue(m)}** — ${A(m.label)}. Reported estimate, not a measured result${m.period ? `, ${m.period}` : ''}.` + citeMetric(ds, m, opts));
    }
    if (context.length && opts.includeUncertainty) {
      L.push(`- Operating context (the customer's environment, not my result): ` +
        context.map((m) => `${metricValue(m)} ${A(m.label).toLowerCase()}`).join('; ') + '.');
    }
    L.push('');
  }

  const themes = ds.learnings ?? [];
  if (themes.length) {
    L.push('## Development');
    L.push('');
    for (const t of themes) {
      L.push(`- ${A(t.theme)}${t.summary ? ` — ${A(t.summary)}` : ''}${t.examples?.length ? ` Applied: ${anonList(t.examples, anon).join('; ')}` : ''}`);
    }
    L.push('');
  }

  if (opts.includeUncertainty) {
    const gaps = (ds.gaps ?? []).filter((g) => records.some((c) => c.id === g.contributionId));
    const months = monthsBetween(range.from, range.to);
    const partial = (ds.coverage?.months ?? []).filter((m) => months.includes(m.month) && m.status !== 'complete');
    if (gaps.length || partial.length || held.length) {
      L.push('## Caveats to raise before this is quoted');
      L.push('');
      if (partial.length) {
        L.push(`- Coverage is incomplete for ${partial.map((m) => `${monthLabel(m.month)} (${m.weeksDocumented}/${m.weeksExpected} weeks)`).join(', ')}. Counts here are a floor.`);
      }
      for (const g of gaps.slice(0, 6)) L.push(`- ${A(g.title)}: ${A(g.message)}`);
      for (const c of held) L.push(`- ${A(c.title)}: held out of totals — ${excludedReason(c)}.`);
      L.push('');
    }
  }

  return L.join('\n');
}

function bullet(ds, c, opts, nameOf, A = (x) => x) {
  const cust = nameOf(c.customerId, ds.customers);
  const parts = [];
  parts.push(`- ${cust ? `${cust}: ` : ''}${A(c.action ?? c.title)}`);
  if (c.deliverable) parts.push(` Produced: ${A(c.deliverable)}`);
  if (c.outcome) {
    const claim = CLAIM_META[c.outcomeClaim]?.label ?? '';
    parts.push(` Result: ${A(c.outcome)}${opts.includeUncertainty && claim ? ` [${claim}]` : ''}`);
  } else if (opts.includeUncertainty) {
    parts.push(' Result: not documented in the source');
  }
  if (opts.includeUncertainty) {
    const role = ROLE_META[c.role]?.label ?? 'Role unclear';
    parts.push(` (${role.toLowerCase()}${c.roleClaim !== 'stated_in_source' ? ', role not explicitly stated' : ''})`);
  }
  return parts.join('.').replace(/\.\./g, '.') + '.' + cite(ds, c, opts);
}

function cite(ds, c, opts) {
  if (!opts.includeSources) return '';
  const refs = c.evidence.map((id) => lookup(ds.excerpts, id)).filter(Boolean)
    .map((e) => `${e.pdfFileName ?? 'source'} p.${e.page ?? '?'} (${e.sourceLabel})`);
  return refs.length ? ` [${refs.join('; ')}]` : '';
}

function citeMetric(ds, m, opts) {
  if (!opts.includeSources) return '';
  const refs = m.evidence.map((id) => lookup(ds.excerpts, id)).filter(Boolean)
    .map((e) => `${e.pdfFileName ?? 'source'} p.${e.page ?? '?'} (${e.sourceLabel})`);
  return refs.length ? ` [${refs.join('; ')}]` : '';
}

function stripMarkdown(md) {
  return md.replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
}

/* ========================================================= E. DATA & REFRESH */

export function renderData(root, ctx) {
  const { ds, anonymise } = ctx;
  clear(root);

  root.append(section('Refresh and source coverage',
    el('div', { class: 'stat-row' },
      statTile(ds.lastSuccessfulRefresh ? new Date(ds.lastSuccessfulRefresh).toLocaleDateString() : '—',
        'Last successful refresh', 'When this dashboard was last rebuilt'),
      statTile(`${ds.coverage?.sourceStart ?? '—'}`, 'Source begins', 'First dated entry in the document'),
      statTile(`${ds.coverage?.sourceEnd ?? '—'}`, 'Source ends', 'Last dated entry in the document'),
      statTile(ds.datasetVersion ?? 0, 'Dataset version', `${ds.imports?.length ?? 0} import(s) on record`)),
    el('p', { class: 'card-note', style: 'margin-top:12px' },
      'The refresh date and the dates the source covers are different things. This is a manual monthly refresh ' +
      'from a PDF you export yourself - nothing here connects to email, Zoom or Drive.')));

  root.append(section('Import history',
    el('div', { class: 'table-scroll' }, el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Import' }), el('th', { text: 'File' }), el('th', { text: 'Imported' }),
        el('th', { text: 'Pages' }), el('th', { text: 'Engine' }), el('th', { text: 'Content hash' }))),
      el('tbody', {}, ...(ds.imports ?? []).map((i) => el('tr', {},
        el('td', { text: `v${i.importVersion}` }),
        el('td', { text: i.pdfFileName }),
        el('td', { text: (i.importedAt ?? '').slice(0, 10) }),
        el('td', { class: 'num', text: String(i.pageCount ?? '—') }),
        el('td', { text: i.engine ?? '—' }),
        el('td', { class: 'mono', text: (i.fileHash ?? '').slice(0, 12) })))))),
    el('p', { class: 'card-note', style: 'margin-top:10px' },
      'Imports are identified by content hash. Re-importing the same PDF leaves every record and total unchanged.')));

  const conflicts = (ds.conflicts ?? []).filter((c) => c.resolution === 'unresolved');
  root.append(section(`Contradictions to review (${conflicts.length})`,
    conflicts.length
      ? el('div', { class: 'table-scroll' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', { text: 'Type' }), el('th', { text: 'Record' }),
            el('th', { text: 'Earlier' }), el('th', { text: 'Later' }), el('th', { text: 'Note' }))),
          el('tbody', {}, ...conflicts.map((c) => el('tr', {},
            el('td', { text: c.type.replace(/_/g, ' ') }),
            el('td', { text: anonText(c.label ?? c.title ?? c.metricId ?? c.contributionId ?? '—', anonymise) }),
            el('td', { text: describeSide(c.existing) }),
            el('td', { text: describeSide(c.incoming) }),
            el('td', { class: 'muted', text: c.note ?? '' }))))))
      : el('p', { class: 'muted', text: 'No unresolved contradictions.' })));

  const missing = (ds.contributions ?? []).filter((c) => (c.flags ?? []).includes('missing_in_latest_export'));
  root.append(section(`Recorded earlier, absent from the latest export (${missing.length})`,
    el('p', { class: 'card-note' }, 'Flagged, never deleted. Confirm whether the entry was edited out of the document on purpose.'),
    missing.length
      ? el('ul', { class: 'clean' }, ...missing.map((c) => el('li', {},
          el('strong', { text: anonText(c.title, anonymise) }), ` — last seen in import ${c.lastSeenImport ?? '?'}`)))
      : el('p', { class: 'muted', text: 'Nothing has disappeared between exports.' })));

  const warnings = ds.validation?.warnings ?? [];
  root.append(section(`Validation warnings (${warnings.length})`,
    el('p', { class: 'card-note' }, 'Non-blocking. They mark places where the source is thin or ambiguous.'),
    warnings.length
      ? el('ul', { class: 'clean' }, ...warnings.map((w) => el('li', {}, el('span', { class: 'mono', text: w.code }), ' — ', w.message)))
      : el('p', { class: 'muted', text: 'No warnings.' })));

  const corrected = (ds.contributions ?? []).filter((c) => c.overridden);
  root.append(section(`Your corrections (${corrected.length})`,
    el('p', { class: 'card-note' },
      'Corrections live in data/overrides.json and are re-applied after every import. ' +
      'An import can never silently overwrite them. See MONTHLY_UPDATE.md for how to add one.'),
    corrected.length
      ? el('ul', { class: 'clean' }, ...corrected.map((c) => el('li', {},
          el('strong', { text: anonText(c.title, anonymise) }), c.correctionReason ? ` — ${anonText(c.correctionReason, anonymise)}` : '')))
      : el('p', { class: 'muted', text: 'No corrections on file.' })));

  const latest = (ds.refreshReports ?? [])[0];
  if (latest) {
    root.append(section('Last refresh report',
      el('pre', { class: 'review-output', text: anonText(latest.text ?? '', anonymise) })));
  }
}

function describeSide(s) {
  if (!s) return '—';
  const v = s.value ?? s.valueText ?? '—';
  return `${v}${s.unit ? ` ${s.unit}` : ''}${s.period ? ` (${s.period})` : ''}`;
}
