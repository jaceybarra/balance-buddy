// Versioned, crash-safe dataset store.
//
// Guarantee: the live dataset file is only ever replaced by an atomic rename of a
// fully-written temp file, and only after validation has passed. Any failure earlier
// in the pipeline leaves data/portfolio.json exactly as it was.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyDataset, SCHEMA_VERSION } from './schema.mjs';
import { stableStringify, nowISO } from './util.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// PIP_HOME redirects every writable path. It exists so the test suite (and a dry
// run) can exercise the real pipeline without ever touching your real dataset.
const HOME = process.env.PIP_HOME ? path.resolve(process.env.PIP_HOME) : ROOT;

export const DATA_DIR = path.join(HOME, 'data');
export const VERSIONS_DIR = path.join(DATA_DIR, 'versions');
export const WORK_DIR = path.join(HOME, 'work');
export const PDF_DIR = path.join(HOME, 'source-pdfs');
export const DEMO_FILE = path.join(ROOT, 'demo', 'portfolio.demo.json');

export const DATASET_FILE = path.join(DATA_DIR, 'portfolio.json');
export const OVERRIDES_FILE = path.join(DATA_DIR, 'overrides.json');
export const IMPORTS_FILE = path.join(DATA_DIR, 'imports.json');

export function ensureDirs() {
  for (const d of [DATA_DIR, VERSIONS_DIR, WORK_DIR, PDF_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`${path.basename(file)} is present but unreadable (${err.message}). ` +
      `Refusing to continue so the existing data is not lost.`);
  }
}

/** Atomic write: temp file in the same directory, fsync, rename. */
export function writeJSONAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, stableStringify(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

export function loadDataset() {
  const ds = readJSON(DATASET_FILE, null);
  if (!ds) return emptyDataset();
  if (ds.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Dataset schemaVersion ${ds.schemaVersion} != expected ${SCHEMA_VERSION}. ` +
      `Existing data left untouched; migrate before refreshing.`);
  }
  return ds;
}

export function loadOverrides() {
  return readJSON(OVERRIDES_FILE, { version: 1, entries: [] });
}

export function saveOverrides(o) {
  writeJSONAtomic(OVERRIDES_FILE, o);
}

export function loadImports() {
  return readJSON(IMPORTS_FILE, { version: 1, imports: [] });
}

/**
 * Snapshot the current live dataset before replacing it, then swap in the new one.
 * Returns the snapshot path (or null when there was nothing to snapshot).
 */
export function commitDataset(next, { label = 'refresh' } = {}) {
  ensureDirs();
  let snapshot = null;
  if (fs.existsSync(DATASET_FILE)) {
    const prev = readJSON(DATASET_FILE);
    const stamp = nowISO().replace(/[:.]/g, '-');
    snapshot = path.join(VERSIONS_DIR, `v${String(prev.datasetVersion ?? 0).padStart(4, '0')}-${stamp}-${label}.json`);
    writeJSONAtomic(snapshot, prev);
  }
  next.generatedAt = nowISO();
  writeJSONAtomic(DATASET_FILE, next);
  return snapshot;
}

/** Restore the most recent snapshot. Used by `portfolio rollback`. */
export function listVersions() {
  if (!fs.existsSync(VERSIONS_DIR)) return [];
  return fs.readdirSync(VERSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(VERSIONS_DIR, f));
}

export function rollback() {
  const versions = listVersions();
  if (versions.length === 0) throw new Error('No version snapshots to roll back to.');
  const latest = versions[versions.length - 1];
  const prev = readJSON(latest);
  writeJSONAtomic(DATASET_FILE, prev);
  return latest;
}
