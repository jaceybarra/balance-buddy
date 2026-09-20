// Test helpers: an isolated PIP_HOME per test, plus a minimal PDF writer so the
// extraction path can be exercised end to end without any binary fixtures.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-test-'));
  process.env.PIP_HOME = dir;
  fs.mkdirSync(path.join(dir, 'data', 'versions'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'source-pdfs'), { recursive: true });
  return dir;
}

/**
 * Write a small, valid, uncompressed PDF with one content stream per page.
 * Enough to prove page-aware extraction; not a general-purpose PDF writer.
 *
 * `style: 'wordprocessor'` reproduces the layout a Google Docs / Word export
 * actually produces: one BT...ET block per glyph, the line position carried in the
 * CTM via `cm` rather than in the text matrix, and each glyph placed with its own
 * relative `Td`. Text extracted from that shape is only correct if the reader
 * tracks the full graphics and text state.
 */
export function writePdf(file, pages, { style = 'simple' } = {}) {
  const objects = [];
  const pageCount = pages.length;
  const fontObj = 3 + pageCount * 2;

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>`;

  pages.forEach((lines, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = pageNum + 1;
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentNum} 0 R >>`;
    const body = style === 'wordprocessor'
      ? wordProcessorStream(lines, esc)
      : ['BT', '/F1 11 Tf', '14 TL', '54 730 Td']
        .concat(lines.flatMap((l) => [`(${esc(l)}) Tj`, 'T*']))
        .concat(['ET']).join('\n');
    objects[contentNum] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });

  objects[fontObj] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = out.length;
  const maxObj = objects.length;
  out += `xref\n0 ${maxObj}\n0000000000 65535 f \n`;
  for (let i = 1; i < maxObj; i++) {
    out += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${maxObj} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out, 'latin1');
  return file;
}

/**
 * Every glyph in its own text block, positioned by an accumulating Td, with the
 * line's y coordinate coming from the CTM. Helvetica's widths are unknown to the
 * writer, so glyph advances use a fixed pitch and word gaps are made wide enough
 * to be unambiguous.
 */
function wordProcessorStream(lines, esc) {
  const out = [];
  const PITCH = 6.2;
  const SPACE = 9.5;
  lines.forEach((line, row) => {
    const y = 730 - row * 16;
    let x = 0;
    out.push('q', `1 0 0 1 54 ${y} cm`);
    for (const ch of line) {
      if (ch === ' ') { x += SPACE; continue; }
      out.push('BT', '/F1 11 Tf', '1 0 0 1 0 0 Tm', `${x.toFixed(3)} 0 Td`, `(${esc(ch)}) Tj`, 'ET');
      x += PITCH;
    }
    out.push('Q');
  });
  return out.join('\n');
}

/** A tiny weekly-summary document, as the real export would look. */
export function devDocPages({ extraWeek = false, shiftPages = 0 } = {}) {
  const filler = Array.from({ length: shiftPages }, (_, i) =>
    [`Professional development log - cover page ${i + 1}`, 'Inserted by a later export; shifts all following pages.']);

  const pages = [
    ['Professional Development Log', 'Technical Success Manager', 'Weekly AI-generated summaries'],
    ['Gemini summary - Week of 2026-05-08',
      'Ran the intake triage discovery session with Northwind Regional Health.',
      'Mapped the referral queue and identified three handoff points causing rework.'],
    ['Zoom AI summary - Week of 2026-05-08',
      'Northwind intake discovery. The TSM documented three handoff points',
      'causing rework and agreed to draft a proposed triage flow.'],
    ['Gemini summary - Week of 2026-05-15',
      'Drafted and shared the proposed triage flow with the operations lead.',
      'Discussed automating follow-up reminders; no decision was made.']
  ];
  if (extraWeek) {
    pages.push(['Gemini summary - Week of 2026-05-22',
      'Built and deployed the triage routing workflow in the customer sandbox.',
      'Operations estimated it saves about two hours per week per coordinator.']);
  }
  return [...filler, ...pages];
}
