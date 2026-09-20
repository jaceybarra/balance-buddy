// Canonical vocabularies and record shapes for the Professional Impact Portfolio.
// The vocabularies are deliberately small and closed: "unclear"/"unknown" is always
// a legal value so that gaps are preserved rather than filled in.

export const SCHEMA_VERSION = 1;

/** How far a claim is from the source document. Drives every badge in the UI. */
export const CLAIM_TYPES = /** @type {const} */ ([
  'stated_in_source',   // the document says this (NOT independently verified)
  'calculated',         // arithmetic performed on values stated in the source
  'interpretation',     // analyst reading; must list supportingFacts
  'needs_clarification' // ambiguous / contradictory / incomplete in the source
]);

export const CLAIM_LABEL = {
  stated_in_source: 'Stated in source',
  calculated: 'Calculated from source',
  interpretation: 'Interpretation',
  needs_clarification: 'Needs clarification'
};

/** Activity vs deliverable vs outcome - never collapsed into "impact". */
export const WORK_KINDS = /** @type {const} */ (['activity', 'deliverable', 'outcome']);

export const STATUSES = /** @type {const} */ (['proposed', 'in_progress', 'completed', 'unclear']);

export const ROLES = /** @type {const} */ (['led', 'co_owned', 'contributed', 'unclear']);

/** Metric taxonomy. `context` = the customer's operating environment, not an achievement. */
export const METRIC_KINDS = /** @type {const} */ (['achieved', 'estimate', 'target', 'context']);

export const METRIC_KIND_LABEL = {
  achieved: 'Achieved result',
  estimate: 'Reported estimate',
  target: 'Target / goal',
  context: 'Customer context'
};

/** Whose number is it. */
export const METRIC_OWNERS = /** @type {const} */ (['me', 'team', 'customer', 'unknown']);

export const SOURCE_LABELS = /** @type {const} */ (['gemini', 'zoom', 'unknown']);

export const DATE_PRECISION = /** @type {const} */ (['day', 'week', 'period', 'unknown']);

/** Units that must never be summed across observations. */
export const NON_ADDITIVE_UNITS = new Set([
  'percent', '%', 'percentage', 'ratio', 'score', 'rating', 'nps', 'csat',
  'per_week', 'per week', 'per_month', 'per month', 'per_day', 'per day',
  'hours_per_week', 'hours/week', 'minutes_per_call', 'avg', 'average', 'median'
]);

export const CONFIDENCE = /** @type {const} */ (['high', 'medium', 'low']);

export function emptyDataset(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetVersion: 0,
    generatedAt: now,
    lastSuccessfulRefresh: null,
    mode: 'real',
    coverage: {
      sourceStart: null,
      sourceEnd: null,
      declaredStart: '2026-05-01',
      months: [],
      notes: []
    },
    customers: [],
    projects: [],
    contributions: [],
    metrics: [],
    excerpts: [],
    learnings: [],
    conflicts: [],
    gaps: [],
    imports: [],
    refreshReports: []
  };
}

/** Fill in defaults without inventing content. Unknown stays unknown. */
export function normalizeContribution(raw) {
  return {
    id: raw.id,
    title: str(raw.title),
    kind: pick(raw.kind, WORK_KINDS, 'activity'),
    status: pick(raw.status, STATUSES, 'unclear'),
    role: pick(raw.role, ROLES, 'unclear'),
    customerId: raw.customerId ?? null,
    projectId: raw.projectId ?? null,
    workDate: raw.workDate ?? null,
    workWeek: raw.workWeek ?? null,               // {start,end}
    datePrecision: pick(raw.datePrecision, DATE_PRECISION, 'unknown'),
    reportingPeriod: raw.reportingPeriod ?? null, // e.g. "Week ending 2026-05-15"
    problem: raw.problem ?? null,
    action: raw.action ?? null,
    deliverable: raw.deliverable ?? null,
    outcome: raw.outcome ?? null,
    outcomeClaim: raw.outcome ? pick(raw.outcomeClaim, CLAIM_TYPES, 'needs_clarification') : null,
    businessRelevance: raw.businessRelevance ?? null,
    businessRelevanceClaim: raw.businessRelevance
      ? pick(raw.businessRelevanceClaim, CLAIM_TYPES, 'interpretation') : null,
    roleClaim: pick(raw.roleClaim, CLAIM_TYPES, 'needs_clarification'),
    supportingFacts: arr(raw.supportingFacts),
    skills: arr(raw.skills),
    lessons: arr(raw.lessons),
    nextSteps: arr(raw.nextSteps),
    milestoneOf: raw.milestoneOf ?? null,
    confidence: pick(raw.confidence, CONFIDENCE, 'low'),
    evidence: arr(raw.evidence),                  // excerpt ids
    sources: arr(raw.sources).filter((s) => SOURCE_LABELS.includes(s)),
    mergedFrom: arr(raw.mergedFrom),
    flags: arr(raw.flags),
    firstSeenImport: raw.firstSeenImport ?? null,
    lastSeenImport: raw.lastSeenImport ?? null,
    overridden: raw.overridden ?? false,
    history: arr(raw.history)
  };
}

export function normalizeMetric(raw) {
  const unit = raw.unit ?? null;
  return {
    id: raw.id,
    label: str(raw.label),
    value: raw.value ?? null,                // keep the exact stated value (number or string)
    valueText: raw.valueText ?? null,        // verbatim, e.g. "about two hours"
    unit,
    period: raw.period ?? null,              // "per week", "May 2026", "Q2"
    scope: raw.scope ?? null,                // what population / system it covers
    baseline: raw.baseline ?? null,
    measures: raw.measures ?? null,          // what the number actually counts
    kind: pick(raw.kind, METRIC_KINDS, 'context'),
    owner: pick(raw.owner, METRIC_OWNERS, 'unknown'),
    claim: pick(raw.claim, CLAIM_TYPES, 'stated_in_source'),
    contributionId: raw.contributionId ?? null,
    projectId: raw.projectId ?? null,
    customerId: raw.customerId ?? null,
    aggregatable: raw.aggregatable === true,
    aggregationGroup: raw.aggregationGroup ?? null,
    repeatOf: raw.repeatOf ?? null,          // set when this restates an earlier observation
    evidence: arr(raw.evidence),
    sources: arr(raw.sources).filter((s) => SOURCE_LABELS.includes(s)),
    flags: arr(raw.flags),
    firstSeenImport: raw.firstSeenImport ?? null,
    lastSeenImport: raw.lastSeenImport ?? null,
    overridden: raw.overridden ?? false
  };
}

export function normalizeExcerpt(raw) {
  return {
    id: raw.id,
    importId: raw.importId ?? null,
    importVersion: raw.importVersion ?? null,
    pdfFileName: raw.pdfFileName ?? null,
    page: raw.page ?? null,
    pageHistory: arr(raw.pageHistory),       // [{importVersion, page}] - pagination moves
    sourceLabel: pick(raw.sourceLabel, SOURCE_LABELS, 'unknown'),
    sectionId: raw.sectionId ?? null,
    reportingPeriod: raw.reportingPeriod ?? null,
    text: str(raw.text),
    contentHash: raw.contentHash ?? null
  };
}

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
function arr(v) { return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []; }
function pick(v, allowed, fallback) { return allowed.includes(v) ? v : fallback; }
