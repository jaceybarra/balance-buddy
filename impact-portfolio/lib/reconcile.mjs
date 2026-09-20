// Reconciling a new import against the existing dataset.
//
// Design rules this file enforces:
//  * The same PDF imported twice changes nothing (content hash).
//  * A revised cumulative PDF is matched by CONTENT, not by page number, because
//    pagination shifts when earlier pages are edited.
//  * Records that vanish from a new export are flagged, never deleted.
//  * Gemini and Zoom descriptions of the same event merge into one contribution
//    that keeps both sources - agreement between two AI summaries is recorded as
//    agreement, not as verification.
//  * A metric restated in a later summary becomes a repeat, not a new result.

import { contentHash, similarity, normalizeText, slugId, uniq, nowISO } from './util.mjs';
import { normalizeContribution, normalizeMetric, normalizeExcerpt } from './schema.mjs';

const MATCH_STRONG = 0.62;
const MATCH_WEAK = 0.50;

export function reconcile(existing, incoming, importMeta) {
  const report = {
    importId: importMeta.importId,
    pdfFileName: importMeta.pdfFileName,
    importVersion: importMeta.importVersion,
    datesCovered: incoming.datesCovered ?? null,
    newContributions: [],
    updatedContributions: [],
    mergedDuplicates: [],
    changedMetrics: [],
    newMetrics: [],
    repeatedMetrics: [],
    unresolvedConflicts: [],
    missingFromExport: [],
    repaginated: [],
    unreadableSections: incoming.unreadableSections ?? [],
    unresolvedSections: incoming.unresolvedSections ?? []
  };

  const ds = existing;

  /* ------------------------------------------------------------- 1. excerpts */
  const byHash = new Map(ds.excerpts.map((e) => [e.contentHash, e]));
  const excerptIdMap = new Map(); // incoming local id -> canonical dataset id

  for (const raw of incoming.excerpts ?? []) {
    const text = raw.text ?? '';
    const h = raw.contentHash ?? contentHash(text);
    const existingEx = byHash.get(h);
    if (existingEx) {
      // Same words, possibly a different page in the revised export.
      if (existingEx.page !== raw.page && raw.page != null) {
        existingEx.pageHistory = uniq([
          ...(existingEx.pageHistory ?? []),
          JSON.stringify({ importVersion: existingEx.importVersion, page: existingEx.page })
        ]).map((s) => (typeof s === 'string' && s.startsWith('{') ? JSON.parse(s) : s));
        report.repaginated.push({
          excerptId: existingEx.id, from: existingEx.page, to: raw.page
        });
        existingEx.page = raw.page;
      }
      existingEx.importVersion = importMeta.importVersion;
      existingEx.pdfFileName = importMeta.pdfFileName;
      existingEx.lastSeenImport = importMeta.importId;
      excerptIdMap.set(raw.id, existingEx.id);
      continue;
    }
    const id = slugId('ex', text, raw.sourceLabel ?? 'unknown');
    const rec = normalizeExcerpt({
      ...raw,
      id,
      contentHash: h,
      importId: importMeta.importId,
      importVersion: importMeta.importVersion,
      pdfFileName: importMeta.pdfFileName
    });
    rec.lastSeenImport = importMeta.importId;
    ds.excerpts.push(rec);
    byHash.set(h, rec);
    excerptIdMap.set(raw.id, id);
  }

  const mapEvidence = (ids) => uniq((ids ?? []).map((i) => excerptIdMap.get(i) ?? i));

  /* ---------------------------------------------- 2. customers and projects */
  const customerIdMap = upsertNamed(ds.customers, incoming.customers ?? [], 'cust', importMeta);
  const projectIdMap = upsertNamed(ds.projects, incoming.projects ?? [], 'proj', importMeta, {
    remap: (p) => ({ ...p, customerId: customerIdMap.get(p.customerId) ?? p.customerId })
  });

  /* ------------------------------------------------------- 3. contributions */
  const seenThisImport = new Set();

  for (const raw of incoming.contributions ?? []) {
    const cand = normalizeContribution({
      ...raw,
      id: raw.id ?? null,
      customerId: customerIdMap.get(raw.customerId) ?? raw.customerId ?? null,
      projectId: projectIdMap.get(raw.projectId) ?? raw.projectId ?? null,
      milestoneOf: projectIdMap.get(raw.milestoneOf) ?? raw.milestoneOf ?? null,
      evidence: mapEvidence(raw.evidence)
    });

    const match = findContributionMatch(ds.contributions, cand);

    if (!match) {
      cand.id = cand.id || slugId('con', cand.title, cand.customerId ?? '', periodKey(cand), cand.action ?? '');
      // Guard against an id collision with a genuinely different record.
      if (ds.contributions.some((c) => c.id === cand.id)) {
        cand.id = slugId('con', cand.title, cand.action ?? '', JSON.stringify(cand.evidence));
      }
      cand.firstSeenImport = importMeta.importId;
      cand.lastSeenImport = importMeta.importId;
      cand.history = [{ importId: importMeta.importId, at: nowISO(), change: 'created' }];
      applyMultiSourceFlag(cand);
      ds.contributions.push(cand);
      seenThisImport.add(cand.id);
      report.newContributions.push({ id: cand.id, title: cand.title, status: cand.status });
      if (cand.sources.length > 1) {
        report.mergedDuplicates.push({
          id: cand.id, title: cand.title, sources: cand.sources, matchScore: 1,
          reason: 'analysis merged overlapping summaries of the same event',
          note: 'Gemini and Zoom describe the same event. Both excerpts are kept; agreement between two AI summaries is not independent verification.'
        });
      }
      continue;
    }

    const { record, score, reason } = match;
    const before = JSON.stringify(record);
    const crossSource = record.sources.length > 0 && cand.sources.length > 0 &&
      cand.sources.some((s) => !record.sources.includes(s));

    const changes = mergeContribution(record, cand, importMeta, report);
    record.lastSeenImport = importMeta.importId;
    seenThisImport.add(record.id);

    if (crossSource) {
      report.mergedDuplicates.push({
        id: record.id,
        title: record.title,
        sources: record.sources,
        matchScore: Number(score.toFixed(2)),
        reason,
        note: 'Gemini and Zoom describe the same event. Both excerpts are kept; agreement between two AI summaries is not independent verification.'
      });
    } else if (changes.length && before !== JSON.stringify(record)) {
      report.updatedContributions.push({ id: record.id, title: record.title, fields: changes });
    }
  }

  /* -------------------------------------------------------------- 4. metrics */
  for (const raw of incoming.metrics ?? []) {
    const cand = normalizeMetric({
      ...raw,
      customerId: customerIdMap.get(raw.customerId) ?? raw.customerId ?? null,
      projectId: projectIdMap.get(raw.projectId) ?? raw.projectId ?? null,
      evidence: mapEvidence(raw.evidence)
    });
    cand.contributionId = resolveContributionRef(ds, raw.contributionId, cand);

    const twin = findMetricTwin(ds.metrics, cand);
    if (!twin) {
      cand.id = cand.id || slugId('met', cand.label, String(cand.value ?? cand.valueText ?? ''), cand.unit ?? '', cand.scope ?? '', cand.period ?? '');
      cand.firstSeenImport = importMeta.importId;
      cand.lastSeenImport = importMeta.importId;
      ds.metrics.push(cand);
      report.newMetrics.push({ id: cand.id, label: cand.label, kind: cand.kind, value: cand.value ?? cand.valueText });
      continue;
    }

    if (sameValue(twin, cand)) {
      const freshEvidence = cand.evidence.filter((e) => !twin.evidence.includes(e));
      twin.sources = uniq([...twin.sources, ...cand.sources]);
      twin.lastSeenImport = importMeta.importId;

      if (freshEvidence.length === 0) {
        // The very same words in the very same place: a cumulative export re-stating
        // its own earlier page, not a new observation. Nothing changes.
        continue;
      }

      // A genuine restatement elsewhere in the document. Keep it for provenance,
      // but never let it add to any total.
      const repeatId = slugId('met', twin.id, 'repeat', JSON.stringify(freshEvidence));
      if (!ds.metrics.some((m) => m.id === repeatId)) {
        const repeat = normalizeMetric({
          ...cand,
          id: repeatId,
          repeatOf: twin.id,
          aggregatable: false,
          aggregationGroup: null,
          evidence: freshEvidence,
          flags: [...cand.flags, 'restatement']
        });
        repeat.firstSeenImport = importMeta.importId;
        repeat.lastSeenImport = importMeta.importId;
        ds.metrics.push(repeat);
        report.repeatedMetrics.push({
          id: twin.id, label: twin.label, repeatId,
          note: 'Restated elsewhere in the document. Counted once; the restatement adds nothing to any total.'
        });
      }
      twin.evidence = uniq([...twin.evidence, ...freshEvidence]);
      continue;
    }

    // Same metric identity, different value -> a contradiction to review.
    const conflict = {
      type: 'metric_value_conflict',
      metricId: twin.id,
      label: twin.label,
      existing: { value: twin.value, valueText: twin.valueText, unit: twin.unit, period: twin.period, evidence: twin.evidence },
      incoming: { value: cand.value, valueText: cand.valueText, unit: cand.unit, period: cand.period, evidence: cand.evidence },
      detectedAt: nowISO(),
      importId: importMeta.importId,
      resolution: 'unresolved'
    };
    const conflictKey = (c) => [c.type, c.metricId, JSON.stringify(c.incoming?.value ?? c.incoming?.valueText), JSON.stringify(c.incoming?.evidence)].join('|');
    const alreadyKnown = ds.conflicts.some((c) => conflictKey(c) === conflictKey(conflict));
    if (alreadyKnown) continue;

    if (!twin.overridden) {
      twin.flags = uniq([...twin.flags, 'conflict']);
      ds.conflicts.push(conflict);
      report.unresolvedConflicts.push(conflict);
      report.changedMetrics.push({ id: twin.id, label: twin.label, from: twin.value ?? twin.valueText, to: cand.value ?? cand.valueText });
    } else {
      ds.conflicts.push({ ...conflict, resolution: 'override_kept' });
    }
  }

  /* -------------------------------------------- 5. learnings (theme records) */
  for (const raw of incoming.learnings ?? []) {
    const id = raw.id ?? slugId('lrn', raw.theme ?? '', raw.example ?? '');
    const ex = ds.learnings.find((l) => l.id === id || normalizeText(l.theme) === normalizeText(raw.theme ?? ''));
    const evidence = mapEvidence(raw.evidence);
    if (ex) {
      ex.evidence = uniq([...(ex.evidence ?? []), ...evidence]);
      ex.examples = uniq([...(ex.examples ?? []), ...(raw.examples ?? [])]);
      ex.appliedIn = uniq([...(ex.appliedIn ?? []), ...(raw.appliedIn ?? []).map((p) => projectIdMap.get(p) ?? p)]);
      ex.lastSeenImport = importMeta.importId;
    } else {
      ds.learnings.push({
        id,
        theme: raw.theme ?? '',
        summary: raw.summary ?? null,
        examples: raw.examples ?? [],
        appliedIn: (raw.appliedIn ?? []).map((p) => projectIdMap.get(p) ?? p),
        claim: raw.claim ?? 'stated_in_source',
        evidence,
        sources: raw.sources ?? [],
        firstSeenImport: importMeta.importId,
        lastSeenImport: importMeta.importId
      });
    }
  }

  /* ------------------------------ 6. content that disappeared from the export */
  if (incoming.isCumulative !== false) {
    for (const c of ds.contributions) {
      if (c.lastSeenImport === importMeta.importId) continue;
      if (c.flags.includes('missing_in_latest_export')) continue;
      if (c.overridden) continue; // a corrected record is the user's, not the export's
      c.flags = uniq([...c.flags, 'missing_in_latest_export']);
      c.history.push({ importId: importMeta.importId, at: nowISO(), change: 'not present in this cumulative export' });
      report.missingFromExport.push({
        id: c.id, title: c.title, lastSeenImport: c.lastSeenImport,
        note: 'Flagged, not deleted. Confirm whether it was edited out of the document on purpose.'
      });
    }
  }

  return report;
}

/* ----------------------------------------------------------------- helpers */

function upsertNamed(list, incomingList, prefix, importMeta, { remap } = {}) {
  const idMap = new Map();
  for (const raw of incomingList) {
    const name = (raw.name ?? '').trim();
    if (!name) continue;
    const mapped = remap ? remap(raw) : raw;
    let ex = list.find((x) => normalizeText(x.name) === normalizeText(name));
    if (!ex) {
      ex = {
        id: slugId(prefix, name),
        name,
        ...('customerId' in mapped ? { customerId: mapped.customerId ?? null } : {}),
        description: mapped.description ?? null,
        firstSeenImport: importMeta.importId,
        lastSeenImport: importMeta.importId
      };
      list.push(ex);
    } else {
      ex.lastSeenImport = importMeta.importId;
      if (!ex.description && mapped.description) ex.description = mapped.description;
      if ('customerId' in mapped && !ex.customerId && mapped.customerId) ex.customerId = mapped.customerId;
    }
    idMap.set(raw.id ?? name, ex.id);
  }
  return idMap;
}

function periodKey(c) {
  if (c.workDate) return c.workDate;
  if (c.workWeek?.start) return c.workWeek.start;
  return c.reportingPeriod ?? '';
}

/**
 * Match by content and context, never by page number.
 * A candidate matches an existing record when it describes the same action for the
 * same customer in the same reporting period, OR shares a source excerpt.
 */
export function findContributionMatch(existingList, cand) {
  let best = null;

  for (const rec of existingList) {
    if (cand.matchId && rec.id === cand.matchId) return { record: rec, score: 1, reason: 'explicit matchId' };

    // A shared excerpt is a strong signal, but NOT proof: one weekly paragraph often
    // describes several distinct pieces of work ("drafted the flow; also discussed
    // automating reminders"). Evidence boosts the score; content still has to agree.
    const sharedEvidence = cand.evidence.filter((e) => rec.evidence.includes(e));

    if (sharedEvidence.length === 0) {
      // Context gates: a different customer or a different period is a different record.
      if (rec.customerId && cand.customerId && rec.customerId !== cand.customerId) continue;
      if (!periodsCompatible(rec, cand)) continue;
    }

    const titleSim = similarity(rec.title, cand.title);
    const actionSim = similarity(
      [rec.action, rec.deliverable, rec.problem].filter(Boolean).join(' '),
      [cand.action, cand.deliverable, cand.problem].filter(Boolean).join(' ')
    );
    const content = titleSim * 0.55 + actionSim * 0.45;
    const score = sharedEvidence.length > 0 ? 0.35 + 0.65 * content : content;
    const reason = sharedEvidence.length > 0
      ? `shares excerpt ${sharedEvidence[0]} and describes the same work (content ${content.toFixed(2)})`
      : `content similarity ${content.toFixed(2)} within the same period`;
    if (!best || score > best.score) best = { record: rec, score, reason };
  }

  if (best && best.score >= MATCH_STRONG) return best;
  // A weak match is reported but not merged - merging on a guess loses distinct work.
  if (best && best.score >= MATCH_WEAK) {
    best.record.flags = uniq([...(best.record.flags ?? []), 'possible_duplicate']);
  }
  return null;
}

function periodsCompatible(a, b) {
  const ka = periodKey(a);
  const kb = periodKey(b);
  if (!ka || !kb) return true;             // unknown period cannot disqualify a match
  if (ka === kb) return true;
  // Same ISO week counts as the same period.
  const wa = a.workWeek?.start ?? (a.workDate ?? '').slice(0, 10);
  const wb = b.workWeek?.start ?? (b.workDate ?? '').slice(0, 10);
  if (wa && wb && Math.abs(Date.parse(wa) - Date.parse(wb)) <= 7 * 864e5) return true;
  return normalizeText(a.reportingPeriod ?? '') === normalizeText(b.reportingPeriod ?? '') &&
    !!a.reportingPeriod;
}

/** Fields the import may fill in, and what it may never silently downgrade. */
function mergeContribution(rec, cand, importMeta, report) {
  const changed = [];
  const fill = (key) => {
    if ((rec[key] === null || rec[key] === undefined || rec[key] === '') &&
        cand[key] !== null && cand[key] !== undefined && cand[key] !== '') {
      rec[key] = cand[key];
      changed.push(key);
    }
  };

  if (rec.overridden) {
    // Corrections are authoritative. Record what the source now says, change nothing.
    rec.sourceSaysNow = {
      status: cand.status, role: cand.role, outcome: cand.outcome, at: nowISO()
    };
    rec.evidence = uniq([...rec.evidence, ...cand.evidence]);
    rec.sources = uniq([...rec.sources, ...cand.sources]);
    applyMultiSourceFlag(rec);
    return ['evidence'];
  }

  for (const k of ['problem', 'action', 'deliverable', 'businessRelevance', 'reportingPeriod', 'customerId', 'projectId', 'milestoneOf']) fill(k);

  // Status may advance (proposed -> in_progress -> completed) but never regress
  // silently; a regression is a contradiction worth reviewing.
  const rank = { unclear: -1, proposed: 0, in_progress: 1, completed: 2 };
  if (rank[cand.status] > rank[rec.status]) {
    rec.history.push({ importId: importMeta.importId, at: nowISO(), change: `status ${rec.status} -> ${cand.status}` });
    rec.status = cand.status;
    changed.push('status');
  } else if (rank[cand.status] >= 0 && rank[rec.status] >= 0 && rank[cand.status] < rank[rec.status]) {
    const conflict = {
      type: 'status_regression', contributionId: rec.id, title: rec.title,
      existing: rec.status, incoming: cand.status, importId: importMeta.importId,
      detectedAt: nowISO(), resolution: 'unresolved',
      note: 'A later export describes this as less complete than an earlier one.'
    };
    rec.flags = uniq([...rec.flags, 'conflict']);
    report.unresolvedConflicts.push(conflict);
  }

  // A stronger claim about outcome only wins if it is better evidenced.
  const claimRank = { needs_clarification: 0, interpretation: 1, calculated: 2, stated_in_source: 3 };
  if (cand.outcome && (!rec.outcome || (claimRank[cand.outcomeClaim] ?? 0) > (claimRank[rec.outcomeClaim] ?? 0))) {
    if (rec.outcome && normalizeText(rec.outcome) !== normalizeText(cand.outcome)) {
      changed.push('outcome');
      rec.history.push({ importId: importMeta.importId, at: nowISO(), change: `outcome updated` });
    }
    rec.outcome = cand.outcome;
    rec.outcomeClaim = cand.outcomeClaim;
    if (!changed.includes('outcome')) changed.push('outcome');
  }

  // Role: only a source-stated role may strengthen the claim.
  const roleRank = { unclear: 0, contributed: 1, co_owned: 2, led: 3 };
  if (cand.roleClaim === 'stated_in_source' && (roleRank[cand.role] ?? 0) > (roleRank[rec.role] ?? 0)) {
    rec.history.push({ importId: importMeta.importId, at: nowISO(), change: `role ${rec.role} -> ${cand.role}` });
    rec.role = cand.role;
    rec.roleClaim = cand.roleClaim;
    changed.push('role');
  }

  for (const k of ['skills', 'lessons', 'nextSteps', 'supportingFacts', 'evidence', 'sources', 'flags']) {
    const before = rec[k].length;
    rec[k] = uniq([...rec[k], ...cand[k]]);
    if (rec[k].length !== before) changed.push(k);
  }
  rec.mergedFrom = uniq([...rec.mergedFrom, ...(cand.id ? [cand.id] : []), ...cand.mergedFrom]);
  applyMultiSourceFlag(rec);

  // Confidence rises only when more than one summary describes the same work.
  if (rec.sources.length > 1 && rec.confidence === 'low') rec.confidence = 'medium';

  return uniq(changed);
}

function applyMultiSourceFlag(rec) {
  if (rec.sources.length > 1) {
    rec.flags = uniq([...rec.flags, 'multi_source_not_verified']);
  }
}

/**
 * Attach a metric to the contribution it belongs to.
 *
 * An explicit reference wins. Otherwise the metric is linked by SHARED EVIDENCE -
 * the number and the contribution were quoted from the same excerpt - but only when
 * exactly one contribution matches. One excerpt can describe several pieces of work,
 * and guessing which one a number belongs to would attribute it wrongly.
 */
function resolveContributionRef(ds, ref, cand) {
  if (ref && ds.contributions.some((c) => c.id === ref)) return ref;

  // Customer operating context is background by definition. Never attach it to a
  // contribution by inference - that is exactly how context starts reading as a result.
  if (cand.kind === 'context') return null;

  const sharing = ds.contributions.filter((c) => cand.evidence.some((e) => c.evidence.includes(e)));
  if (sharing.length === 1) return sharing[0].id;

  if (sharing.length > 1) {
    // Prefer the one whose outcome the number plainly belongs to, if only one has an outcome.
    const withOutcome = sharing.filter((c) => c.outcome);
    if (withOutcome.length === 1) return withOutcome[0].id;
  }
  return null;
}

/** Same metric identity = same label + unit + scope + period (normalised). */
export function findMetricTwin(list, cand) {
  const key = (m) => [normalizeText(m.label), normalizeText(m.unit ?? ''), normalizeText(m.scope ?? ''), normalizeText(m.period ?? '')].join('|');
  const k = key(cand);
  let loose = null;
  for (const m of list) {
    if (m.repeatOf) continue;
    if (key(m) === k) return m;
    if (normalizeText(m.label) === normalizeText(cand.label) &&
        normalizeText(m.scope ?? '') === normalizeText(cand.scope ?? '')) loose = loose ?? m;
  }
  return loose;
}

function sameValue(a, b) {
  if (a.value !== null && b.value !== null && a.value !== undefined && b.value !== undefined) {
    return String(a.value) === String(b.value) && normalizeText(a.unit ?? '') === normalizeText(b.unit ?? '');
  }
  return normalizeText(a.valueText ?? '') === normalizeText(b.valueText ?? '');
}
