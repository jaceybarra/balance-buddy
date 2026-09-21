// Moving your history between machines.
//
// The dataset, your corrections and the import log are deliberately kept out of
// version control, which means they live in exactly one place. This makes that
// place portable: one JSON file holding everything the dashboard needs to be
// rebuilt somewhere else. It carries no code, so restoring it cannot change
// behaviour - only data.

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, DATASET_FILE, OVERRIDES_FILE, IMPORTS_FILE,
  readJSON, writeJSONAtomic, commitDataset, ensureDirs
} from './dataset.mjs';
import { SCHEMA_VERSION } from './schema.mjs';
import { nowISO } from './util.mjs';

const BACKUP_KIND = 'professional-impact-portfolio-backup';

export function makeBackup({ out } = {}) {
  const dataset = readJSON(DATASET_FILE, null);
  if (!dataset) {
    throw new Error('No dataset to back up. Import a PDF first - see MONTHLY_UPDATE.md.');
  }
  const payload = {
    kind: BACKUP_KIND,
    backupVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowISO(),
    dataset,
    overrides: readJSON(OVERRIDES_FILE, { version: 1, entries: [] }),
    imports: readJSON(IMPORTS_FILE, { version: 1, imports: [] })
  };

  const span = `${dataset.coverage?.sourceStart ?? 'start'}_to_${dataset.coverage?.sourceEnd ?? 'end'}`;
  const file = out ?? path.join(ROOT, `impact-portfolio-backup-${span}.json`);
  writeJSONAtomic(file, payload);

  return {
    file,
    bytes: fs.statSync(file).size,
    summary: describe(payload)
  };
}

export function restoreBackup(file, { force = false } = {}) {
  const payload = readJSON(file, null);
  if (!payload) throw new Error(`Cannot read ${file}`);
  if (payload.kind !== BACKUP_KIND) {
    throw new Error(`${path.basename(file)} is not a Professional Impact Portfolio backup.`);
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Backup uses schema version ${payload.schemaVersion}, this install expects ` +
      `${SCHEMA_VERSION}. Restoring it could corrupt the dashboard.`);
  }
  if (!payload.dataset?.contributions) {
    throw new Error('Backup contains no dataset.');
  }

  ensureDirs();

  // An existing dataset is never overwritten without being snapshotted first.
  let snapshot = null;
  const existing = readJSON(DATASET_FILE, null);
  if (existing) {
    const sameSource = existing.coverage?.sourceEnd === payload.dataset.coverage?.sourceEnd;
    if (!sameSource && !force) {
      throw new Error(
        `data/portfolio.json already holds a dataset covering to ${existing.coverage?.sourceEnd ?? '?'}, ` +
        `while this backup covers to ${payload.dataset.coverage?.sourceEnd ?? '?'}.\n` +
        `  Pass --force to replace it. The current dataset will still be snapshotted first.`);
    }
    snapshot = commitDataset(existing, { label: 'before-restore' });
  }

  writeJSONAtomic(DATASET_FILE, payload.dataset);
  writeJSONAtomic(OVERRIDES_FILE, payload.overrides ?? { version: 1, entries: [] });
  writeJSONAtomic(IMPORTS_FILE, payload.imports ?? { version: 1, imports: [] });

  return { snapshot, summary: describe(payload) };
}

function describe(p) {
  const d = p.dataset;
  return `${d.contributions.length} contributions, ${d.metrics?.length ?? 0} metric observations, ` +
    `${d.excerpts?.length ?? 0} excerpts, ${(p.overrides?.entries ?? []).length} correction(s), ` +
    `covering ${d.coverage?.sourceStart ?? '?'} to ${d.coverage?.sourceEnd ?? '?'}`;
}
