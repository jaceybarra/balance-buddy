// Builds candidates.json for the real professional development log.
//
// Excerpts are never retyped: `q(page, needle)` pulls the verbatim bullet out of
// the extracted page text, so every quote and page number in the dataset is exactly
// what the PDF says. If a needle stops matching, the build fails loudly rather than
// producing a citation that does not exist.

import fs from 'node:fs';
import path from 'node:path';

const IMPORT_ID = process.argv[2];
if (!IMPORT_ID) throw new Error('usage: node tools/build-import.mjs <importId>');
const DIR = path.join('work', IMPORT_ID);
const pages = JSON.parse(fs.readFileSync(path.join(DIR, 'pages.json'), 'utf8'));

const norm = (s) => s.replace(/­/g, '').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();

// Section headings ("🏆 WINS") sit on their own line but end up glued to the
// neighbouring bullet once newlines are folded. Strip them from both ends so a
// quote is the bullet and nothing else.
const HEADER = '(?:\\p{Extended_Pictographic}|\\uFE0F|\\u200d)+\\s*[A-Z][A-Za-z&\' ]*';
const TRAIL = new RegExp(`\\s*${HEADER}\\s*$`, 'u');
const LEAD = new RegExp(`^\\s*${HEADER}\\s+`, 'u');

const pageChunks = new Map();
for (const p of pages) {
  const joined = p.text.replace(/\n(?![●○\d]|\s*$)/g, ' ');
  const chunks = joined.split(/\n?\s*[●○]\s*/)
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .map((c) => c.replace(TRAIL, '').replace(LEAD, '').trim())
    .filter(Boolean);
  pageChunks.set(p.page, chunks);
}

/** A bullet cut off by a page break continues at the top of the next page. */
function stitch(page, index, text) {
  if (/[.!?:)\]"'\u201d]$/.test(text)) return text;
  const chunks = pageChunks.get(page) ?? [];
  if (index !== chunks.length - 1) return text;
  const next = (pageChunks.get(page + 1) ?? [])[0];
  if (!next || /^[A-Z\u25cf\u25cb]/.test(next) === false) return `${text} ${next ?? ''}`.trim();
  return `${text} ${next}`.trim();
}

const used = new Set();

/** Verbatim bullet on `page` containing `needle`. */
export function q(page, needle) {
  const n = norm(needle);
  for (const off of [0, 1, -1]) {
    const chunks = pageChunks.get(page + off);
    if (!chunks) continue;
    for (let i = 0; i < chunks.length; i++) {
      if (norm(chunks[i]).includes(n)) {
        used.add(`${page}|${n}`);
        return { page: page + off, text: stitch(page + off, i, chunks[i]) };
      }
    }
  }
  throw new Error(`No excerpt on page ${page} contains: "${needle}"`);
}

const excerpts = [];
const seenExcerpt = new Map();

/**
 * Register an excerpt and return its local id.
 * @param page  physical PDF page
 * @param src   'gemini' | 'zoom' | 'unknown'
 * @param period reporting period stated by the entry (ISO)
 */
export function E(page, src, period, needle) {
  const hit = q(page, needle);
  const key = `${hit.page}|${norm(hit.text)}`;
  if (seenExcerpt.has(key)) return seenExcerpt.get(key);
  const id = `e${excerpts.length + 1}`;
  excerpts.push({
    id, page: hit.page, sourceLabel: src, sectionId: sectionFor(hit.page),
    reportingPeriod: period, text: hit.text
  });
  seenExcerpt.set(key, id);
  return id;
}

let sections = [];
try { sections = JSON.parse(fs.readFileSync(path.join(DIR, 'sections.json'), 'utf8')); } catch { /* optional */ }
function sectionFor(page) {
  const s = sections.find((x) => page >= x.pageStart && page <= x.pageEnd);
  return s ? s.sectionId : null;
}

export function emit(payload) {
  const out = { ...payload, excerpts };
  fs.writeFileSync(path.join(DIR, 'candidates.json'), JSON.stringify(out, null, 2));
  console.log(`✔ candidates.json written`);
  console.log(`  ${payload.contributions.length} contributions · ${payload.metrics.length} metrics · ` +
    `${excerpts.length} excerpts · ${payload.learnings.length} learnings`);
  const byPage = new Set(excerpts.map((e) => e.page));
  console.log(`  excerpts cite ${byPage.size} distinct pages of ${pages.length}`);
}
