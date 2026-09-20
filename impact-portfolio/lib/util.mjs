// Small shared helpers. No dependencies, no network.
import crypto from 'node:crypto';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Hash of normalised text - used to re-identify an excerpt after pagination changes. */
export function contentHash(text) {
  return sha256(normalizeText(text)).slice(0, 16);
}

/** Aggressive normalisation for matching only. Never used for display. */
export function normalizeText(s) {
  return String(s ?? '')
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const STOP = new Set(('a an the and or of to for with on in at by from as is are was were be been ' +
  'this that these those it its i my me we our they their he she them his her would could should ' +
  'will can may might do did does have has had not no yes about into over under after before during ' +
  'week weekly summary update session meeting call discussed also then than there here so such via')
  .split(' '));

/** Content fingerprint tokens, used for fuzzy record matching. */
export function tokens(s) {
  return normalizeText(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Jaccard similarity over token sets. 0..1 */
export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Deterministic, human-readable, stable id. */
export function slugId(prefix, ...parts) {
  const base = parts.filter(Boolean).map(normalizeText).join('|');
  return `${prefix}_${sha256(base).slice(0, 12)}`;
}

export function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function monthKey(iso) {
  return isISODate(iso) ? iso.slice(0, 7) : null;
}

export function quarterOf(iso) {
  if (!isISODate(iso)) return null;
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Inclusive list of YYYY-MM between two ISO dates. */
export function monthRange(startISO, endISO) {
  const out = [];
  if (!isISODate(startISO) || !isISODate(endISO)) return out;
  let [y, m] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** ISO week boundaries (Mon..Sun) containing `iso`. */
export function weekOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  const start = new Date(d); start.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

/** Deep clone that works on plain JSON data. */
export function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Stable stringify so version snapshots diff cleanly. */
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

export function uniq(arr) {
  return [...new Set(arr.filter((x) => x !== undefined && x !== null))];
}

export function groupBy(arr, fn) {
  const m = new Map();
  for (const item of arr) {
    const k = fn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}
