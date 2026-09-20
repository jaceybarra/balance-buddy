// Tiered, page-aware PDF extraction.
//
// Tier 1  native  - built in, zero dependencies (lib/pdf/native.mjs)
// Tier 2  pdftotext -layout  (poppler-utils), if present on PATH
// Tier 3  pdfjs-dist, if the user installed the optional dependency
//
// Whichever tier runs, the output shape is identical and every page keeps its
// physical PDF page number. Pages with implausibly little text are flagged
// `needsOcr` instead of being silently treated as empty.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import nativeExtract from './native.mjs';
import { sha256, contentHash, normalizeText } from '../util.mjs';

const MIN_CHARS_PER_PAGE = 60;

export function extractPdf(pdfPath, { engine = 'auto' } = {}) {
  const buf = fs.readFileSync(pdfPath);
  const fileHash = sha256(buf);
  const attempts = [];

  const order = engine === 'auto' ? ['native', 'pdftotext', 'pdfjs'] : [engine];
  let result = null;
  let used = null;

  for (const tier of order) {
    try {
      const r = runTier(tier, pdfPath, buf);
      if (!r) { attempts.push({ tier, ok: false, reason: 'not available' }); continue; }
      const yieldChars = r.pages.reduce((a, p) => a + p.text.length, 0);
      attempts.push({ tier, ok: true, pages: r.pages.length, chars: yieldChars });
      // Accept the first tier that produced a usable text layer; otherwise keep the
      // best result so far and try the next tier.
      if (!result || yieldChars > result.pages.reduce((a, p) => a + p.text.length, 0)) {
        result = r; used = tier;
      }
      if (yieldChars > r.pages.length * MIN_CHARS_PER_PAGE) break;
    } catch (err) {
      attempts.push({ tier, ok: false, reason: err.message });
    }
  }

  if (!result) {
    throw new Error(`No extraction engine could read ${path.basename(pdfPath)}.\n` +
      attempts.map((a) => `  - ${a.tier}: ${a.reason}`).join('\n') +
      `\nInstall poppler-utils (provides pdftotext) or run: npm i pdfjs-dist`);
  }

  const pages = result.pages.map((p) => {
    const text = p.text ?? '';
    const chars = text.replace(/\s/g, '').length;
    return {
      page: p.page,
      text,
      charCount: chars,
      needsOcr: chars < MIN_CHARS_PER_PAGE,
      readable: chars > 0
    };
  });

  return {
    pdfFileName: path.basename(pdfPath),
    pdfPath,
    fileHash,
    engine: used,
    attempts,
    extractedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages,
    engineWarnings: result.warnings ?? []
  };
}

function runTier(tier, pdfPath, buf) {
  if (tier === 'native') return nativeExtract(buf);
  if (tier === 'pdftotext') return viaPdftotext(pdfPath);
  if (tier === 'pdfjs') return viaPdfjs(pdfPath);
  throw new Error(`unknown engine "${tier}"`);
}

function viaPdftotext(pdfPath) {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  } catch {
    return null;
  }
  const out = path.join(os.tmpdir(), `pip-${Date.now()}.txt`);
  try {
    execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, out], { stdio: 'ignore' });
    const raw = fs.readFileSync(out, 'utf8');
    const pages = raw.split('\f').map((text, i) => ({ page: i + 1, text: text.trim() }));
    // pdftotext emits a trailing form feed.
    if (pages.length && pages[pages.length - 1].text === '') pages.pop();
    return { pages, warnings: [] };
  } finally {
    fs.rmSync(out, { force: true });
  }
}

function viaPdfjs(pdfPath) {
  // Synchronous tiers are the norm here; pdfjs is async, so it is only reachable
  // through extractPdfAsync(). Returning null keeps `auto` from failing.
  return null;
}

/** Optional async tier for users who installed pdfjs-dist. */
export async function extractWithPdfjs(pdfPath) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      lastY = y;
    }
    pages.push({ page: i, text: text.trim() });
  }
  return { pages, warnings: [] };
}

/* ------------------------------------------------------------- sectioning */

const SOURCE_PATTERNS = [
  { label: 'gemini', re: /\b(gemini|google\s+gemini|gemini\s+(?:ai|summary))\b/i },
  { label: 'zoom', re: /\b(zoom\s*(?:ai|iq|meeting\s+summary)?|zoom\s+ai\s+companion)\b/i }
];

const PERIOD_PATTERNS = [
  /week\s+(?:of|ending|beginning)\s+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
  /week\s+(?:of|ending|beginning)\s+(\d{4}-\d{2}-\d{2})/i,
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b([A-Z][a-z]+\s+\d{1,2},\s*\d{4})\b/
];

/**
 * Split extracted pages into analysis-sized sections that keep page anchors and
 * enough surrounding context to be interpreted safely.
 */
export function sectionize(extraction, { targetChars = 6000, overlapChars = 400 } = {}) {
  const sections = [];
  let buffer = [];        // [{ page, text, carried }]
  let bufChars = 0;
  let seq = 0;

  const flush = () => {
    // A buffer holding only carried-over context has no new content to analyse.
    const fresh = buffer.filter((b) => !b.carried);
    if (fresh.length === 0) { buffer = []; bufChars = 0; return; }

    const pagesIn = [...new Set(fresh.map((b) => b.page))].sort((a, b) => a - b);
    const text = buffer.map((b) => b.text).join('\n');
    seq += 1;
    const id = `s${String(seq).padStart(3, '0')}`;
    sections.push({
      sectionId: id,
      pageStart: pagesIn[0],
      pageEnd: pagesIn[pagesIn.length - 1],
      pages: pagesIn,
      sourceLabel: detectSource(text),
      reportingPeriodHint: detectPeriod(text),
      charCount: text.replace(/\s/g, '').length,
      text,
      contentHash: contentHash(text)
    });

    // Carry a tail of context into the next section so an entry split across a
    // boundary can still be read in context. It is marked so it is never counted
    // as new content.
    const tail = text.slice(-overlapChars);
    buffer = tail
      ? [{ page: pagesIn[pagesIn.length - 1], carried: true,
           text: `[...context carried from ${id}...]\n${tail}` }]
      : [];
    bufChars = buffer.length ? tail.length : 0;
  };

  for (const p of extraction.pages) {
    if (!p.readable) continue;
    // Split on blank-line boundaries so a section rarely cuts through an entry.
    const blocks = p.text.split(/\n{2,}/).filter((b) => b.trim());
    for (const block of blocks) {
      if (bufChars + block.length > targetChars && buffer.some((b) => !b.carried)) flush();
      buffer.push({ page: p.page, text: block, carried: false });
      bufChars += block.length;
    }
  }
  flush();

  return sections;
}

export function detectSource(text) {
  const head = text.slice(0, 600);
  for (const { label, re } of SOURCE_PATTERNS) if (re.test(head)) return label;
  for (const { label, re } of SOURCE_PATTERNS) if (re.test(text)) return label;
  return 'unknown';
}

export function detectPeriod(text) {
  for (const re of PERIOD_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/** Coverage accounting the caller can report verbatim. */
export function coverageReport(extraction, sections) {
  const unreadable = extraction.pages.filter((p) => !p.readable).map((p) => p.page);
  const needsOcr = extraction.pages.filter((p) => p.needsOcr && p.readable).map((p) => p.page);
  const covered = new Set(sections.flatMap((s) => s.pages));
  const notSectioned = extraction.pages.filter((p) => p.readable && !covered.has(p.page)).map((p) => p.page);
  return {
    pageCount: extraction.pageCount,
    sectionCount: sections.length,
    pagesReadable: extraction.pageCount - unreadable.length,
    pagesUnreadable: unreadable,
    pagesNeedingOcr: needsOcr,
    pagesNotSectioned: notSectioned,
    totalChars: extraction.pages.reduce((a, p) => a + p.charCount, 0)
  };
}
