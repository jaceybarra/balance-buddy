// Presentation-side model: vocabularies, labels, date logic and filtering.
// Deliberately free of DOM code so the rules stay readable.

export const STATUS_META = {
  completed:   { label: 'Completed',   icon: '✓', series: 1, pat: 'pat-1' },
  in_progress: { label: 'In progress', icon: '◐', series: 2, pat: 'pat-2' },
  proposed:    { label: 'Proposed',    icon: '○', series: 3, pat: 'pat-3' },
  unclear:     { label: 'Unclear',     icon: '?',      series: 4, pat: 'pat-4' }
};

export const KIND_META = {
  activity:    { label: 'Activity',    icon: '○', hint: 'Something I did - a meeting, a review, a session.' },
  deliverable: { label: 'Deliverable', icon: '▣', hint: 'Something that exists because of the work.' },
  outcome:     { label: 'Outcome',     icon: '△', hint: 'Something that changed, where the source says it changed.' }
};

export const ROLE_META = {
  led:         { label: 'Led',         icon: '★' },
  co_owned:    { label: 'Co-owned',    icon: '◑' },
  contributed: { label: 'Contributed', icon: '○' },
  unclear:     { label: 'Role unclear', icon: '?' }
};

export const CLAIM_META = {
  stated_in_source:   { label: 'Stated in source', icon: '❝', hint: 'The document says this. It has not been independently verified.' },
  calculated:         { label: 'Calculated from source', icon: '=', hint: 'Arithmetic on values stated in the document.' },
  interpretation:     { label: 'Interpretation', icon: '~', hint: 'A reading of the evidence, not a reported fact.' },
  needs_clarification:{ label: 'Needs clarification', icon: '!', hint: 'Ambiguous, incomplete or contradictory in the source.' }
};

export const METRIC_KIND_META = {
  achieved: { label: 'Achieved result',  icon: '●', series: 1, pat: 'pat-1', hint: 'The source says this happened.' },
  estimate: { label: 'Reported estimate',icon: '≈', series: 2, pat: 'pat-2', hint: 'Someone’s estimate, reported in the source.' },
  target:   { label: 'Target',           icon: '◎', series: 3, pat: 'pat-3', hint: 'A goal, not a result.' },
  context:  { label: 'Customer context', icon: '▤', series: 4, pat: 'pat-4', hint: 'The customer’s operating environment. Not my achievement.' }
};

export const OWNER_META = {
  me: 'Mine', team: 'My team', customer: 'The customer’s', unknown: 'Owner not stated'
};

export const FLAG_META = {
  multi_source_not_verified: 'Gemini and Zoom both describe this. Agreement between two AI summaries is not independent verification.',
  missing_in_latest_export: 'Recorded earlier but absent from the most recent export. Kept for review, not deleted.',
  possible_duplicate: 'Looks similar to another record. Not merged automatically.',
  conflict: 'The sources disagree about this. See the conflicts list.',
  user_corrected: 'You corrected this record. Corrections survive every future refresh.',
  suppressed_by_correction: 'You suppressed this record.',
  restatement: 'A restatement of a value already recorded. It adds nothing to any total.',
  proposal_only: 'Discussed, not implemented.',
  ownership_customer_side: 'The source places ownership of the change with the customer.',
  estimate_not_measured: 'A reported estimate, not a measured result.',
  unspecified_measure: 'The source does not say what this number measures.'
};

/* ------------------------------------------------------------------- dates */

export function effectiveRange(c) {
  if (c.workDate) return { start: c.workDate, end: c.workDate, precision: 'day' };
  if (c.workWeek?.start && c.workWeek?.end) return { start: c.workWeek.start, end: c.workWeek.end, precision: 'week' };
  const p = parsePeriod(c.reportingPeriod);
  if (p) return { start: p, end: p, precision: 'period' };
  return null;
}

export function parsePeriod(s) {
  if (!s) return null;
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(s);
  return iso ? iso[1] : null;
}

export function dateLabel(c) {
  const r = effectiveRange(c);
  if (!r) return 'Date not documented';
  if (r.precision === 'day') return fmt(r.start);
  if (r.precision === 'week') return `Week of ${fmt(r.start)}`;
  return c.reportingPeriod ?? fmt(r.start);
}

export function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function monthLabel(ym) {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Resolve the UI period selector into an ISO range, bounded by actual coverage. */
export function resolveRange(kind, ds, custom) {
  const end = ds.coverage?.sourceEnd ?? null;
  const start = ds.coverage?.sourceStart ?? null;
  if (kind === 'all' || !end) return { from: start, to: end, label: 'All documented time' };
  if (kind === 'custom') {
    return {
      from: custom?.from || start, to: custom?.to || end,
      label: `${custom?.from || start} to ${custom?.to || end}`
    };
  }
  const e = new Date(`${end}T00:00:00Z`);
  if (kind === 'month') {
    const from = `${end.slice(0, 7)}-01`;
    return { from, to: end, label: `${monthLabel(end.slice(0, 7))} (latest documented month)` };
  }
  if (kind === 'quarter') {
    const m = Number(end.slice(5, 7));
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const from = `${end.slice(0, 4)}-${String(qStartMonth).padStart(2, '0')}-01`;
    return { from, to: end, label: `${end.slice(0, 4)} Q${Math.floor((m - 1) / 3) + 1} to date` };
  }
  if (kind === 'ytd') {
    return { from: `${end.slice(0, 4)}-01-01`, to: end, label: `${end.slice(0, 4)} year to date` };
  }
  return { from: start, to: end, label: 'All documented time' };
}

export function monthsBetween(from, to) {
  const out = [];
  if (!from || !to) return out;
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ey, em] = to.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* ---------------------------------------------------------------- filtering */

export function filterContributions(ds, f) {
  const undated = [];
  const kept = ds.contributions.filter((c) => {
    if (c.overridden === 'suppressed') return false;
    if (f.customerId && c.customerId !== f.customerId) return false;
    if (f.projectId && c.projectId !== f.projectId && c.milestoneOf !== f.projectId) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.q && !matchesQuery(ds, c, f.q)) return false;

    const r = effectiveRange(c);
    if (!r) { undated.push(c); return false; }
    if (f.from && r.end < f.from) return false;
    if (f.to && r.start > f.to) return false;
    return true;
  });
  return { kept, undated };
}

function matchesQuery(ds, c, q) {
  const needle = q.toLowerCase();
  const customer = ds.customers.find((x) => x.id === c.customerId)?.name ?? '';
  const project = ds.projects.find((x) => x.id === (c.projectId ?? c.milestoneOf))?.name ?? '';
  const hay = [
    c.title, c.problem, c.action, c.deliverable, c.outcome, c.businessRelevance,
    customer, project, ...(c.skills ?? []), ...(c.lessons ?? []), ...(c.nextSteps ?? [])
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle);
}

/** Metric observations that belong to the contributions currently in view. */
export function metricsFor(ds, contributions, f = {}) {
  const ids = new Set(contributions.map((c) => c.id));
  const projectIds = new Set(contributions.map((c) => c.projectId ?? c.milestoneOf).filter(Boolean));
  return ds.metrics.filter((m) => {
    if (f.customerId && m.customerId && m.customerId !== f.customerId) return false;
    if (f.projectId && m.projectId !== f.projectId) return false;
    if (m.contributionId) return ids.has(m.contributionId);
    if (m.projectId) return projectIds.has(m.projectId);
    // Unattached observations follow the customer filter only.
    return !f.projectId;
  });
}

/**
 * Records eligible for definitive totals.
 * Anything uncertain stays visible in the lists but is excluded from headline counts.
 */
export function isDefinitive(c) {
  if (c.overridden === 'suppressed') return false;
  if (c.status === 'unclear') return false;
  if (c.confidence === 'low') return false;
  if ((c.flags ?? []).includes('conflict')) return false;
  if ((c.flags ?? []).includes('missing_in_latest_export')) return false;
  return true;
}

export function excludedReason(c) {
  if (c.overridden === 'suppressed') return 'You suppressed this record';
  if ((c.flags ?? []).includes('conflict')) return 'The sources disagree about this record';
  if ((c.flags ?? []).includes('missing_in_latest_export')) return 'Absent from the most recent export';
  if (c.status === 'unclear') return 'Status is unclear in the source';
  if (c.confidence === 'low') return 'Low confidence in the reading of the source';
  return null;
}

/** Only achieved, non-repeat observations with compatible scope may be summed. */
export function aggregatableGroups(metrics) {
  const groups = new Map();
  for (const m of metrics) {
    if (!m.aggregatable || m.repeatOf) continue;
    const g = m.aggregationGroup;
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  return [...groups.entries()].map(([group, members]) => ({
    group,
    // Members are often labelled "... (first batch)" / "... (second batch)"; the
    // total belongs to the shared subject, not to one member's label.
    label: members[0].label.replace(/\s*\([^)]*\)\s*$/, ''),
    unit: members[0].unit,
    total: members.reduce((a, m) => a + (Number(m.value) || 0), 0),
    members
  }));
}

export function lookup(list, id) {
  return list.find((x) => x.id === id) ?? null;
}
