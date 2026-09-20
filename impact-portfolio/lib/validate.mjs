// Validation rules. Errors block a refresh (the previous dataset is preserved);
// warnings are surfaced in the refresh report and in the dashboard.
//
// Every rule here exists to stop a specific way of overstating the evidence.

import {
  CLAIM_TYPES, WORK_KINDS, STATUSES, ROLES, METRIC_KINDS, METRIC_OWNERS,
  DATE_PRECISION, NON_ADDITIVE_UNITS, SOURCE_LABELS
} from './schema.mjs';
import { isISODate, groupBy, normalizeText } from './util.mjs';

export function validateDataset(ds) {
  const errors = [];
  const warnings = [];
  const E = (code, message, ref) => errors.push({ code, message, ref });
  const W = (code, message, ref) => warnings.push({ code, message, ref });

  const excerptIds = new Set(ds.excerpts.map((e) => e.id));
  const contribIds = new Set(ds.contributions.map((c) => c.id));
  const projectIds = new Set(ds.projects.map((p) => p.id));
  const customerIds = new Set(ds.customers.map((c) => c.id));
  const metricIds = new Set(ds.metrics.map((m) => m.id));

  /* ----------------------------------------------------- referential integrity */
  for (const e of ds.excerpts) {
    if (!e.id) E('excerpt.no_id', 'Excerpt without an id', e);
    if (!e.pdfFileName) W('excerpt.no_file', `Excerpt ${e.id} has no source filename`, e.id);
    if (e.page === null || e.page === undefined) {
      W('excerpt.no_page', `Excerpt ${e.id} has no physical page number`, e.id);
    }
    if (!SOURCE_LABELS.includes(e.sourceLabel)) {
      E('excerpt.bad_source', `Excerpt ${e.id} source "${e.sourceLabel}" is not gemini/zoom/unknown`, e.id);
    }
    if (!e.text || e.text.trim().length < 10) {
      W('excerpt.thin', `Excerpt ${e.id} quotes fewer than 10 characters`, e.id);
    }
  }

  /* --------------------------------------------------------------- vocabularies */
  for (const c of ds.contributions) {
    if (!contribIds.has(c.id)) continue;
    if (!WORK_KINDS.includes(c.kind)) E('contrib.kind', `${c.id}: kind "${c.kind}" invalid`, c.id);
    if (!STATUSES.includes(c.status)) E('contrib.status', `${c.id}: status "${c.status}" invalid`, c.id);
    if (!ROLES.includes(c.role)) E('contrib.role', `${c.id}: role "${c.role}" invalid`, c.id);
    if (!DATE_PRECISION.includes(c.datePrecision)) E('contrib.date_precision', `${c.id}: datePrecision invalid`, c.id);

    /* -------- Rule: every displayed claim must carry evidence */
    if (c.evidence.length === 0) {
      E('contrib.no_evidence', `${c.id} "${c.title}" has no source excerpt. ` +
        `Records without evidence cannot be displayed.`, c.id);
    }
    for (const ref of c.evidence) {
      if (!excerptIds.has(ref)) E('contrib.dangling_evidence', `${c.id} cites unknown excerpt ${ref}`, c.id);
    }
    if (c.customerId && !customerIds.has(c.customerId)) E('contrib.bad_customer', `${c.id} cites unknown customer`, c.id);
    if (c.projectId && !projectIds.has(c.projectId)) E('contrib.bad_project', `${c.id} cites unknown project`, c.id);
    if (c.milestoneOf && !projectIds.has(c.milestoneOf)) E('contrib.bad_milestone_parent', `${c.id} milestoneOf unknown project`, c.id);

    /* -------- Rule: a proposal is never a completed accomplishment */
    if (c.status === 'proposed' && c.kind === 'outcome') {
      E('contrib.proposal_as_outcome',
        `${c.id} is marked "proposed" but classified as an outcome. A discussed idea is an activity.`, c.id);
    }
    if (c.status === 'proposed' && c.outcome && c.outcomeClaim === 'stated_in_source') {
      W('contrib.proposal_with_outcome',
        `${c.id} is "proposed" yet reports an outcome as stated. Check the source wording.`, c.id);
    }

    /* -------- Rule: an interpretation must name the facts it rests on */
    if (c.outcomeClaim === 'interpretation' && c.supportingFacts.length === 0) {
      E('contrib.unsupported_interpretation',
        `${c.id} states an interpreted outcome without listing supportingFacts.`, c.id);
    }
    if (c.businessRelevanceClaim === 'interpretation' && c.supportingFacts.length === 0) {
      W('contrib.unsupported_relevance',
        `${c.id} interprets business relevance without listing supportingFacts.`, c.id);
    }

    /* -------- Rule: "led" needs more than participation */
    if (c.role === 'led' && c.roleClaim !== 'stated_in_source') {
      W('contrib.led_not_stated',
        `${c.id} claims "led" but the role is not stated in the source (claim: ${c.roleClaim}). ` +
        `Downgrade to contributed/unclear unless the document says so.`, c.id);
    }

    /* -------- Rule: no day-precision dates invented from weekly summaries */
    if (c.datePrecision === 'day' && !isISODate(c.workDate)) {
      E('contrib.date_precision_mismatch', `${c.id} claims day precision without a valid workDate`, c.id);
    }
    if (c.datePrecision === 'week' && c.workDate) {
      E('contrib.week_with_day',
        `${c.id} is sourced from a weekly summary but carries a specific workDate. ` +
        `Use workWeek instead - a week cannot be narrowed to a day.`, c.id);
    }
    if (c.workDate && !isISODate(c.workDate)) E('contrib.bad_date', `${c.id} workDate "${c.workDate}" is not YYYY-MM-DD`, c.id);
    if (c.workWeek && (!isISODate(c.workWeek.start) || !isISODate(c.workWeek.end))) {
      E('contrib.bad_week', `${c.id} workWeek is not a valid ISO range`, c.id);
    }

    /* -------- Rule: unknowns are preserved, never papered over */
    for (const [field, value] of Object.entries(c)) {
      if (typeof value === 'string' && /^(n\/a|na|none|tbd|unknown|-)$/i.test(value.trim()) && value.trim() !== '') {
        W('contrib.placeholder', `${c.id}.${field} uses a placeholder ("${value}"); use null to preserve the gap.`, c.id);
      }
    }

    /* -------- Rule: agreement between two AI summaries is not verification */
    if (c.sources.length > 1 && !c.flags.includes('multi_source_not_verified')) {
      W('contrib.multi_source_flag',
        `${c.id} merges ${c.sources.join('+')} but is missing the "multi_source_not_verified" flag.`, c.id);
    }
  }

  /* -------------------------------------------------------------------- metrics */
  for (const m of ds.metrics) {
    if (!METRIC_KINDS.includes(m.kind)) E('metric.kind', `${m.id}: kind "${m.kind}" invalid`, m.id);
    if (!METRIC_OWNERS.includes(m.owner)) E('metric.owner', `${m.id}: owner "${m.owner}" invalid`, m.id);
    if (!CLAIM_TYPES.includes(m.claim)) E('metric.claim', `${m.id}: claim "${m.claim}" invalid`, m.id);
    if (m.evidence.length === 0) E('metric.no_evidence', `${m.id} "${m.label}" has no source excerpt`, m.id);
    for (const ref of m.evidence) {
      if (!excerptIds.has(ref)) E('metric.dangling_evidence', `${m.id} cites unknown excerpt ${ref}`, m.id);
    }
    if (m.contributionId && !contribIds.has(m.contributionId)) E('metric.bad_contrib', `${m.id} cites unknown contribution`, m.id);
    if (m.repeatOf && !metricIds.has(m.repeatOf)) E('metric.bad_repeat', `${m.id} repeatOf unknown metric`, m.id);
    if (!m.measures) W('metric.no_measures', `${m.id} does not say what the number measures`, m.id);
    if (m.owner === 'unknown') W('metric.owner_unknown', `${m.id} does not say whose metric this is`, m.id);

    /* -------- Rule: customer operating context is never my achievement */
    if (m.kind === 'context' && m.contributionId) {
      W('metric.context_attached',
        `${m.id} is customer context but is attached to contribution ${m.contributionId}. ` +
        `Keep it as background, not as a result.`, m.id);
    }
    /* -------- Rule: an estimate is not an achieved result */
    if (m.kind === 'achieved' && m.claim === 'interpretation') {
      E('metric.interpreted_achievement',
        `${m.id} is marked achieved but the claim type is interpretation. An interpreted number is not a result.`, m.id);
    }
    /* -------- Rule: repeats and non-additive units are never aggregated */
    if (m.aggregatable) {
      if (m.repeatOf) {
        E('metric.aggregate_repeat',
          `${m.id} restates ${m.repeatOf} and must not be aggregatable - repeating a benefit does not multiply it.`, m.id);
      }
      if (m.unit && NON_ADDITIVE_UNITS.has(normalizeText(m.unit))) {
        E('metric.aggregate_non_additive',
          `${m.id} has unit "${m.unit}", which cannot be summed (percentages, rates and averages are not additive).`, m.id);
      }
      if (m.kind !== 'achieved') {
        E('metric.aggregate_non_achieved',
          `${m.id} is a ${m.kind}; only achieved results may be aggregated.`, m.id);
      }
      if (!m.aggregationGroup) {
        E('metric.aggregate_no_group', `${m.id} is aggregatable without an aggregationGroup`, m.id);
      }
      if (!m.period || !m.scope) {
        E('metric.aggregate_no_bounds',
          `${m.id} is aggregatable without a stated period and scope; overlap cannot be ruled out.`, m.id);
      }
    }
  }

  /* -------- Rule: an aggregation group must be internally compatible */
  const groups = groupBy(ds.metrics.filter((m) => m.aggregatable && m.aggregationGroup), (m) => m.aggregationGroup);
  for (const [group, members] of groups) {
    const units = new Set(members.map((m) => normalizeText(m.unit ?? '')));
    if (units.size > 1) {
      E('metric.group_mixed_units',
        `Aggregation group "${group}" mixes units (${[...units].join(', ')}). Only compatible units may be combined.`, group);
    }
    const seenScopePeriod = new Map();
    for (const m of members) {
      const key = `${normalizeText(m.scope ?? '')}|${normalizeText(m.period ?? '')}`;
      if (seenScopePeriod.has(key)) {
        E('metric.group_overlap',
          `Aggregation group "${group}" contains overlapping observations (${seenScopePeriod.get(key)} and ${m.id}) ` +
          `with the same scope and period. Overlapping scopes may not be summed.`, group);
      }
      seenScopePeriod.set(key, m.id);
    }
  }

  /* ------------------------------------------------------------------ learnings */
  for (const l of ds.learnings) {
    if (!l.evidence || l.evidence.length === 0) {
      E('learning.no_evidence', `Learning "${l.theme ?? l.id}" has no source excerpt`, l.id);
    }
  }

  /* ---------------------------------------------------------------- forbidden AI */
  const FORBIDDEN = /\b(roi|return on investment|promotion[- ]ready|promotion readiness|annualized|annualised|revenue impact|cost savings of|saved \$)/i;
  for (const c of ds.contributions) {
    for (const field of ['outcome', 'businessRelevance']) {
      const v = c[field];
      if (v && FORBIDDEN.test(v) && c[`${field}Claim`] !== 'stated_in_source') {
        E('contrib.derived_financial_claim',
          `${c.id}.${field} asserts a financial/readiness claim ("${v.match(FORBIDDEN)[0]}") that is not stated in the source.`, c.id);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Records that must be excluded from definitive outcome totals. */
export function isDefinitive(record) {
  if (record.overridden === 'suppressed') return false;
  if (record.flags?.includes('conflict')) return false;
  if (record.flags?.includes('missing_in_latest_export')) return false;
  if (record.confidence === 'low') return false;
  if (record.status === 'unclear') return false;
  return true;
}
