// DOM helpers, evidence-aware record rendering and the two chart forms.
// Every chart is directly labelled and exposes the records behind it.

import {
  STATUS_META, KIND_META, ROLE_META, CLAIM_META, METRIC_KIND_META, OWNER_META, FLAG_META,
  dateLabel, fmt, monthLabel, lookup
} from './model.mjs';

/* -------------------------------------------------------------- DOM helpers */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style') node.setAttribute('style', v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/* -------------------------------------------------------------------- badges */

export function badge(kind, meta, extraClass = '') {
  if (!meta) return null;
  return el('span', { class: `badge badge--${kind} ${extraClass}`.trim(), title: meta.hint ?? meta.label },
    el('span', { class: 'ico', 'aria-hidden': 'true', text: meta.icon }),
    meta.label);
}

export const statusBadge = (s) => badge(s, STATUS_META[s] ?? STATUS_META.unclear);
export const kindBadge = (k) => badge(k, KIND_META[k] ?? KIND_META.activity);
export const roleBadge = (r) => badge('role', ROLE_META[r] ?? ROLE_META.unclear);
export const claimBadge = (c) => (c ? badge(c, CLAIM_META[c]) : null);
export const metricKindBadge = (k) => badge(k, METRIC_KIND_META[k] ?? METRIC_KIND_META.context);

export function flagBadges(flags = []) {
  return flags
    .filter((f) => FLAG_META[f])
    .map((f) => el('span', {
      class: `badge ${f === 'user_corrected' ? 'badge--corrected' : 'badge--flag'}`,
      title: FLAG_META[f]
    }, el('span', { class: 'ico', 'aria-hidden': 'true', text: f === 'user_corrected' ? '✎' : '⚠' }),
      flagLabel(f)));
}

function flagLabel(f) {
  return {
    multi_source_not_verified: 'Two AI summaries agree',
    missing_in_latest_export: 'Absent from latest export',
    possible_duplicate: 'Possible duplicate',
    conflict: 'Sources disagree',
    user_corrected: 'Corrected by you',
    suppressed_by_correction: 'Suppressed',
    restatement: 'Restatement',
    proposal_only: 'Discussed only',
    ownership_customer_side: 'Customer-owned change',
    estimate_not_measured: 'Estimate, not measured',
    unspecified_measure: 'Measure not specified'
  }[f] ?? f;
}

/* ------------------------------------------------------------------ excerpts */

export function excerptBlock(ex, anonymise) {
  if (!ex) return el('p', { class: 'muted', text: 'Source excerpt is missing from the dataset.' });
  const src = { gemini: 'Gemini summary', zoom: 'Zoom AI summary', unknown: 'Source not identified' }[ex.sourceLabel];
  const moved = (ex.pageHistory ?? []).length
    ? ` · previously p${ex.pageHistory.map((h) => h.page).join(', p')}`
    : '';
  return el('blockquote', { class: 'excerpt' },
    el('div', { text: anonText(ex.text, anonymise) }),
    el('span', { class: 'cite' },
      `${ex.pdfFileName ?? 'source PDF'} · page ${ex.page ?? '?'}${moved} · ${src}` +
      (ex.reportingPeriod ? ` · ${ex.reportingPeriod}` : '') +
      ` · import v${ex.importVersion ?? '?'}`));
}

/**
 * Replace every recognisable form of a customer name with its alias.
 * Patterns are applied longest-first so "Cedar Valley Clinics" is replaced before
 * "Cedar Valley", which is replaced before "Cedar" - otherwise a partial hit would
 * leave a fragment of the real name behind.
 */
export function anonText(text, anon) {
  if (!anon || typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [pattern, alias] of anon.patterns) out = out.split(pattern).join(alias);
  return out;
}

export function anonList(list, anon) {
  return (list ?? []).map((t) => anonText(t, anon));
}

/** Ordered alias table built once per render. */
export function buildAnon(ds) {
  const aliases = new Map();
  const patterns = [];
  (ds.customers ?? []).forEach((c, i) => {
    const alias = `Customer ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? i : ''}`;
    aliases.set(c.name, alias);
    const bare = c.name.replace(/\s*\((demo|synthetic)\)\s*$/i, '').trim();
    const forms = new Set([c.name, bare]);
    const words = bare.split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) {
      const form = words.slice(0, n).join(' ');
      if (form.length >= 4) forms.add(form);
    }
    for (const f of forms) if (f) patterns.push([f, alias]);
  });
  patterns.sort((a, b) => b[0].length - a[0].length);
  return { aliases, patterns, name: (n) => aliases.get(n) ?? anonTextStatic(n, patterns) };
}

function anonTextStatic(text, patterns) {
  let out = text ?? '';
  for (const [p, alias] of patterns) out = out.split(p).join(alias);
  return out;
}

/* ---------------------------------------------------------- record rendering */

export function contributionRecord(ds, c, { anonymise = null, open = false } = {}) {
  const customer = lookup(ds.customers, c.customerId);
  const project = lookup(ds.projects, c.projectId ?? c.milestoneOf);
  const custName = customer ? nameOf(customer, anonymise) : null;
  const A = (t) => anonText(t, anonymise);

  const metrics = ds.metrics.filter((m) => m.contributionId === c.id);

  const details = el('details', { class: 'record', open: open || undefined });
  details.append(
    el('summary', {},
      el('div', { class: 'record-title' },
        el('span', { class: 'disclosure', 'aria-hidden': 'true', text: '▸' }),
        el('span', { text: A(c.title) })),
      el('div', { class: 'record-meta' },
        [dateLabel(c), custName, A(project?.name)].filter(Boolean).join('  ·  ')),
      el('div', { class: 'chip-row', style: 'margin-top:7px' },
        statusBadge(c.status), kindBadge(c.kind), roleBadge(c.role),
        ...flagBadges(c.flags))),
    el('div', { class: 'record-body' },
      fieldBlock('Problem or objective', A(c.problem)),
      fieldBlock('What I did', A(c.action)),
      fieldBlock('Deliverable', A(c.deliverable)),
      outcomeBlock(c, A),
      relevanceBlock(c, A),
      c.supportingFacts?.length ? fieldList('Facts this interpretation rests on', c.supportingFacts.map(A)) : null,
      metrics.length ? metricMiniTable(metrics, A) : null,
      c.skills?.length ? chipList('Skills', c.skills) : null,
      c.lessons?.length ? fieldList('Lessons recorded', c.lessons.map(A)) : null,
      c.nextSteps?.length ? fieldList('Next steps documented', c.nextSteps.map(A)) : null,
      c.correctionReason ? el('div', { class: 'notice notice--info' },
        el('strong', { text: 'Your correction: ' }), c.correctionReason) : null,
      c.sourceSaysNow ? el('div', { class: 'notice notice--warn' },
        el('strong', { text: 'A later export disagrees with your correction. ' }),
        `It describes this as "${c.sourceSaysNow.status}"${c.sourceSaysNow.role ? `, role "${c.sourceSaysNow.role}"` : ''}. Your correction was kept.`) : null,
      el('div', { class: 'field-block' },
        el('span', { class: 'k', text: `Evidence (${c.evidence.length} excerpt${c.evidence.length === 1 ? '' : 's'})` }),
        ...c.evidence.map((id) => excerptBlock(lookup(ds.excerpts, id), anonymise))),
      c.history?.length > 1 ? el('details', {},
        el('summary', { class: 'mono muted', text: 'Record history' }),
        el('ul', { class: 'clean mono muted' },
          ...c.history.map((h) => el('li', { text: `${h.at?.slice(0, 10) ?? ''} · ${h.importId} · ${h.change}` })))) : null));
  return details;
}

function nameOf(entity, anonymise) {
  if (!anonymise || !entity) return entity?.name ?? null;
  return anonymise.name(entity.name);
}

function fieldBlock(label, value) {
  return el('div', { class: 'field-block' },
    el('span', { class: 'k', text: label }),
    value
      ? el('div', { class: 'v', text: value })
      : el('div', { class: 'v empty', text: 'Not documented in the source' }));
}

function outcomeBlock(c, A = (x) => x) {
  const block = el('div', { class: 'field-block' },
    el('span', { class: 'k', text: 'Outcome' }));
  if (!c.outcome) {
    block.append(el('div', { class: 'v empty', text: 'No outcome documented in the source' }));
    return block;
  }
  block.append(el('div', { class: 'v', text: A(c.outcome) }));
  block.append(el('div', { class: 'chip-row', style: 'margin-top:5px' }, claimBadge(c.outcomeClaim)));
  return block;
}

function relevanceBlock(c, A = (x) => x) {
  const block = el('div', { class: 'field-block' },
    el('span', { class: 'k', text: 'Business relevance' }));
  if (!c.businessRelevance) {
    block.append(el('div', { class: 'v empty', text: 'Not documented in the source' }));
    return block;
  }
  block.append(el('div', { class: 'v', text: A(c.businessRelevance) }));
  block.append(el('div', { class: 'chip-row', style: 'margin-top:5px' }, claimBadge(c.businessRelevanceClaim)));
  return block;
}

function fieldList(label, items) {
  return el('div', { class: 'field-block' },
    el('span', { class: 'k', text: label }),
    el('ul', { class: 'clean' }, ...items.map((i) => el('li', { text: i }))));
}

function chipList(label, items) {
  return el('div', { class: 'field-block' },
    el('span', { class: 'k', text: label }),
    el('div', { class: 'chip-row' }, ...items.map((i) => el('span', { class: 'badge', text: i }))));
}

export function metricValue(m) {
  if (m.value !== null && m.value !== undefined) {
    return `${m.value}${m.unit ? ` ${m.unit}` : ''}`;
  }
  return m.valueText ?? 'no value stated';
}

function metricMiniTable(metrics, A = (x) => x) {
  return el('div', { class: 'field-block' },
    el('span', { class: 'k', text: 'Metric observations attached to this record' }),
    el('div', { class: 'table-scroll' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Observation' }), el('th', { text: 'Value' }),
          el('th', { text: 'Kind' }), el('th', { text: 'Whose' }))),
        el('tbody', {}, ...metrics.map((m) => el('tr', {},
          el('td', {}, A(m.label), m.repeatOf ? el('div', { class: 'chip-row', style: 'margin-top:4px' }, ...flagBadges(['restatement'])) : null),
          el('td', { class: 'num', text: metricValue(m) }),
          el('td', {}, metricKindBadge(m.kind)),
          el('td', { text: OWNER_META[m.owner] })))))));
}

/* -------------------------------------------------------------------- charts */

/**
 * Coverage chart: one row per month, documented weeks against weeks in the month.
 * Answers "how completely is each month documented?" - the question that decides
 * whether two months can be compared at all.
 */
export function coverageChart(coverage, onPick) {
  const fig = el('figure', { class: 'chart' });
  fig.append(el('figcaption', { text: 'Weeks with entries in the source document, by month. A month with fewer entries is a month that was documented less - not necessarily a month with less work.' }));
  const rows = el('div', { class: 'chart-rows' });

  const statusText = {
    complete: { icon: '✓', word: 'complete' },
    partial: { icon: '◐', word: 'partial' },
    no_documentation: { icon: '—', word: 'no entries' },
    not_in_export: { icon: '·', word: 'not exported yet' }
  };

  for (const m of coverage.months ?? []) {
    const pct = m.weeksExpected ? (m.weeksDocumented / m.weeksExpected) * 100 : 0;
    const st = statusText[m.status] ?? statusText.no_documentation;
    const btn = el('button', {
      class: 'chart-row-btn', type: 'button',
      title: `${monthLabel(m.month)} — ${m.label}`,
      'aria-label': `${monthLabel(m.month)}: ${m.label}. Filter to this month.`,
      onclick: () => onPick?.(m)
    },
      el('div', { class: 'chart-row' },
        el('span', { class: 'rl', text: monthLabel(m.month) }),
        el('div', {},
          el('div', { class: 'bar-track' },
            el('div', {
              class: `bar-fill ${m.status === 'complete' ? 'pat-1' : 'pat-2'}`,
              style: `width:${Math.max(pct, m.weeksDocumented ? 3 : 0)}%;background:${m.status === 'complete' ? 'var(--series-1)' : 'var(--series-2)'}`
            })),
          el('div', { class: 'bar-caption' },
            el('span', { 'aria-hidden': 'true', text: `${st.icon} ` }),
            `${m.weeksDocumented} of ${m.weeksExpected} weeks — ${st.word}`))));
    rows.append(btn);
  }
  fig.append(rows);
  fig.append(el('p', { class: 'card-note', style: 'margin-top:10px',
    text: 'Only months marked complete are directly comparable with each other.' }));
  return fig;
}

/**
 * Directly-labelled stacked bar. Never the only carrier of meaning: each segment
 * has a label row with icon, count and name, and a table view sits beside it.
 */
export function stackChart({ caption, segments, onPick, emptyText = 'Nothing to show for this selection.' }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const fig = el('figure', { class: 'chart' });
  if (caption) fig.append(el('figcaption', { text: caption }));
  if (total === 0) {
    fig.append(el('p', { class: 'muted', text: emptyText }));
    return fig;
  }
  const stack = el('div', { class: 'stack', role: 'img', 'aria-label':
    segments.filter((s) => s.count).map((s) => `${s.label}: ${s.count}`).join(', ') });
  for (const s of segments) {
    if (!s.count) continue;
    stack.append(el('button', {
      class: `stack-seg ${s.pat ?? ''}`, type: 'button',
      style: `flex:${s.count} 0 0;background:var(--series-${s.series})`,
      title: `${s.label}: ${s.count} of ${total}`,
      'aria-label': `${s.label}: ${s.count} of ${total}. Filter to these records.`,
      onclick: () => onPick?.(s)
    }));
  }
  fig.append(stack);
  const labels = el('div', { class: 'stack-labels' });
  for (const s of segments) {
    labels.append(el('span', { class: 'sl' },
      el('span', { class: 'swatch', 'aria-hidden': 'true',
        style: `display:inline-block;width:11px;height:11px;border-radius:3px;background:var(--series-${s.series})` }),
      el('span', { 'aria-hidden': 'true', text: s.icon ?? '' }),
      el('b', { text: String(s.count) }), s.label));
  }
  fig.append(labels);
  return fig;
}

/* -------------------------------------------------------------------- misc */

export function notice(kind, ...children) {
  return el('div', { class: `notice notice--${kind}` }, ...children);
}

export function section(title, ...children) {
  return el('section', { class: 'card' }, title ? el('h2', { text: title }) : null, ...children);
}

export function statTile(value, label, sub) {
  return el('div', { class: 'stat' },
    el('span', { class: 'value', text: String(value) }),
    el('span', { class: 'label', text: label }),
    sub ? el('span', { class: 'sub', text: sub }) : null);
}

export function copyToClipboard(text, button) {
  const done = () => {
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = old; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
  } else fallback(text, done);
}

function fallback(text, done) {
  const ta = el('textarea', { style: 'position:fixed;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } finally { ta.remove(); }
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
