// User corrections live in data/overrides.json and are applied AFTER every import.
// An import can never silently overwrite a correction: if new source material
// disagrees with an override, the override wins and the disagreement is recorded
// as a conflict for review.

import { nowISO } from './util.mjs';

/**
 * Override entry shape:
 * {
 *   id, target: { type: 'contribution'|'metric'|'project'|'customer', id },
 *   op: 'set' | 'suppress' | 'note',
 *   fields: { ...partial record... },   // for op:'set'
 *   note: 'free text',                  // for op:'note'
 *   reason: 'why I corrected this',
 *   createdAt, lastAppliedAt
 * }
 */
export function applyOverrides(ds, overrides) {
  const applied = [];
  const conflicts = [];
  const orphans = [];

  const collections = {
    contribution: ds.contributions,
    metric: ds.metrics,
    project: ds.projects,
    customer: ds.customers
  };

  for (const entry of overrides.entries ?? []) {
    const list = collections[entry.target?.type];
    if (!list) { orphans.push({ entry, reason: `unknown target type "${entry.target?.type}"` }); continue; }
    const rec = list.find((r) => r.id === entry.target.id);
    if (!rec) {
      orphans.push({ entry, reason: `no ${entry.target.type} with id ${entry.target.id} in the current dataset` });
      continue;
    }

    if (entry.op === 'suppress') {
      rec.overridden = 'suppressed';
      rec.flags = [...new Set([...(rec.flags ?? []), 'suppressed_by_correction'])];
      applied.push({ id: entry.id, target: entry.target, op: 'suppress' });
      continue;
    }

    if (entry.op === 'note') {
      rec.correctionNote = entry.note ?? null;
      rec.overridden = rec.overridden || true;
      applied.push({ id: entry.id, target: entry.target, op: 'note' });
      continue;
    }

    // op: 'set'
    const changed = [];
    for (const [k, v] of Object.entries(entry.fields ?? {})) {
      const before = rec[k];
      if (JSON.stringify(before) !== JSON.stringify(v)) {
        // The import brought a different value than the correction expects.
        if (entry.importValueAtCorrection !== undefined &&
            JSON.stringify(before) !== JSON.stringify(entry.importValueAtCorrection)) {
          conflicts.push({
            type: 'override_vs_source',
            target: entry.target,
            field: k,
            overrideValue: v,
            sourceValueNow: before,
            sourceValueWhenCorrected: entry.importValueAtCorrection,
            reason: entry.reason ?? null,
            note: 'The correction was kept. The newer source text differs - review which is right.'
          });
        }
        changed.push(k);
      }
      rec[k] = v;
    }
    rec.overridden = true;
    rec.correctionReason = entry.reason ?? null;
    rec.flags = [...new Set([...(rec.flags ?? []), 'user_corrected'])];
    applied.push({ id: entry.id, target: entry.target, op: 'set', fields: changed });
  }

  ds.conflicts.push(...conflicts);
  return { applied, conflicts, orphans };
}

export function makeOverride({ type, id, op = 'set', fields, note, reason, importValueAtCorrection }) {
  return {
    id: `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    target: { type, id },
    op,
    ...(fields ? { fields } : {}),
    ...(note ? { note } : {}),
    ...(importValueAtCorrection !== undefined ? { importValueAtCorrection } : {}),
    reason: reason ?? null,
    createdAt: nowISO()
  };
}
