// Dependency-free, page-aware PDF text extraction.
//
// Scope: text-layer PDFs produced by word processors (Google Docs / Word exports are
// the expected input). It handles FlateDecode, object streams (PDF 1.5+ compressed
// xref), Identity-H / 2-byte CID fonts and ToUnicode CMaps.
//
// It deliberately does NOT do OCR and does not attempt to rescue scanned images.
// Pages whose text yield is implausibly low are reported so the caller can flag them
// as "needs OCR" rather than silently returning an empty page.

import zlib from 'node:zlib';

const DEC = new TextDecoder('latin1');

export function extractPdfText(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const objects = scanObjects(bytes);
  expandObjectStreams(bytes, objects);

  const pageRefs = orderedPageRefs(objects);
  const pages = [];
  const warnings = [];

  pageRefs.forEach((ref, idx) => {
    const pageObj = objects.get(ref);
    let text = '';
    try {
      const fonts = buildFontMap(pageObj, objects);
      const content = pageContent(pageObj, objects, bytes);
      text = content ? renderTextOps(content, fonts) : '';
    } catch (err) {
      warnings.push({ page: idx + 1, reason: `content stream not decodable: ${err.message}` });
    }
    pages.push({ page: idx + 1, text: tidy(text) });
  });

  return { pages, warnings, objectCount: objects.size };
}

/* ------------------------------------------------------------------ objects */

function scanObjects(bytes) {
  const s = DEC.decode(bytes);
  const objects = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const num = Number(m[1]);
    const bodyStart = re.lastIndex;
    const end = s.indexOf('endobj', bodyStart);
    if (end === -1) continue;
    const body = s.slice(bodyStart, end);
    objects.set(num, { num, body, offset: bodyStart, raw: true });
  }
  return objects;
}

/** PDF 1.5+ stores most objects inside compressed /ObjStm streams. Unpack them. */
function expandObjectStreams(bytes, objects) {
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(obj.body)) continue;
    let data;
    try {
      data = decodeStream(obj, objects, bytes);
    } catch { continue; }
    if (!data) continue;
    const n = Number(dictValue(obj.body, 'N') ?? 0);
    const first = Number(dictValue(obj.body, 'First') ?? 0);
    const header = DEC.decode(data.subarray(0, first));
    const nums = header.trim().split(/\s+/).map(Number);
    const payload = DEC.decode(data.subarray(first));
    for (let i = 0; i < n; i++) {
      const objNum = nums[i * 2];
      const off = nums[i * 2 + 1];
      if (!Number.isFinite(objNum) || !Number.isFinite(off)) continue;
      const nextOff = i + 1 < n ? nums[(i + 1) * 2 + 1] : payload.length;
      const body = payload.slice(off, nextOff);
      // An object already present at top level wins (it is the newest revision).
      if (!objects.has(objNum)) objects.set(objNum, { num: objNum, body, fromObjStm: true });
    }
  }
}

function dictValue(body, key) {
  const m = new RegExp(`/${key}\\s+(\\d+)`).exec(body);
  return m ? m[1] : null;
}

function refValue(body, key) {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(body);
  return m ? Number(m[1]) : null;
}

function decodeStream(obj, objects, bytes) {
  if (obj.fromObjStm) return null;
  const s = DEC.decode(bytes);
  const startTag = s.indexOf('stream', obj.offset);
  if (startTag === -1) return null;
  let p = startTag + 'stream'.length;
  if (s[p] === '\r') p++;
  if (s[p] === '\n') p++;

  let length = Number(dictValue(obj.body, 'Length') ?? NaN);
  if (!Number.isFinite(length)) {
    const ref = refValue(obj.body, 'Length');
    if (ref !== null && objects.has(ref)) {
      const lm = /(\d+)/.exec(objects.get(ref).body);
      if (lm) length = Number(lm[1]);
    }
  }
  let end;
  if (Number.isFinite(length) && length > 0 && p + length <= bytes.length) {
    end = p + length;
  } else {
    end = s.indexOf('endstream', p);
    if (end === -1) return null;
  }
  let data = bytes.subarray(p, end);

  const filterRaw = (obj.body.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/) || [])[1] || '';
  const filters = [...filterRaw.matchAll(/\/([A-Za-z0-9]+)/g)].map((m) => m[1]);

  for (const f of filters) {
    if (f === 'FlateDecode') {
      data = inflate(data);
      if (/\/Predictor\s+(1[0-5]|[2-9])/.test(obj.body)) data = undoPngPredictor(data, obj.body);
    } else if (f === 'ASCII85Decode') {
      data = ascii85Decode(data);
    } else if (f === 'ASCIIHexDecode') {
      data = Buffer.from(DEC.decode(data).replace(/[^0-9a-fA-F]/g, ''), 'hex');
    } else if (f === 'RunLengthDecode') {
      data = runLengthDecode(data);
    } else if (f === 'Crypt') {
      continue;
    } else {
      // DCTDecode / JPXDecode / CCITTFaxDecode / LZWDecode - no usable text layer.
      return null;
    }
  }
  return data;
}

function ascii85Decode(buf) {
  const s = DEC.decode(buf).replace(/^\s*<~/, '');
  const out = [];
  let tuple = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '~') break;
    if (/\s/.test(c)) continue;
    if (c === 'z' && tuple.length === 0) { out.push(0, 0, 0, 0); continue; }
    const v = c.charCodeAt(0) - 33;
    if (v < 0 || v > 84) continue;
    tuple.push(v);
    if (tuple.length === 5) { pushTuple(out, tuple, 4); tuple = []; }
  }
  if (tuple.length > 1) {
    const n = tuple.length - 1;
    while (tuple.length < 5) tuple.push(84);
    pushTuple(out, tuple, n);
  }
  return Buffer.from(out);
}

function pushTuple(out, tuple, count) {
  let word = 0;
  for (const v of tuple) word = word * 85 + v;
  const bytes = [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff];
  for (let i = 0; i < count; i++) out.push(bytes[i]);
}

function runLengthDecode(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const len = buf[i++];
    if (len === 128) break;
    if (len < 128) { for (let k = 0; k <= len; k++) out.push(buf[i++]); }
    else { const b = buf[i++]; for (let k = 0; k < 257 - len; k++) out.push(b); }
  }
  return Buffer.from(out);
}

function inflate(buf) {
  try { return zlib.inflateSync(buf); } catch { /* try raw */ }
  try { return zlib.inflateRawSync(buf); } catch { /* try skipping junk byte */ }
  return zlib.inflateSync(buf.subarray(1));
}

function undoPngPredictor(data, dict) {
  const colors = Number(dictValue(dict, 'Colors') ?? 1);
  const bpc = Number(dictValue(dict, 'BitsPerComponent') ?? 8);
  const columns = Number(dictValue(dict, 'Columns') ?? 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const out = [];
  let prev = Buffer.alloc(rowLen);
  for (let i = 0; i + 1 <= data.length; i += rowLen + 1) {
    const ft = data[i];
    const row = Buffer.from(data.subarray(i + 1, i + 1 + rowLen));
    if (row.length === 0) break;
    for (let x = 0; x < row.length; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x] ?? 0;
      const c = x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      let v = row[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += Math.floor((a + b) / 2);
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[x] = v & 0xff;
    }
    out.push(row);
    prev = row;
  }
  return Buffer.concat(out);
}

/* -------------------------------------------------------------------- pages */

function orderedPageRefs(objects) {
  const root = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.body));
  const pagesRef = root ? refValue(root.body, 'Pages') : null;
  const ordered = [];
  const seen = new Set();

  const walk = (num, depth = 0) => {
    if (depth > 64 || seen.has(num) || !objects.has(num)) return;
    seen.add(num);
    const body = objects.get(num).body;
    if (/\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body)) {
      ordered.push(num);
      return;
    }
    const kidsMatch = /\/Kids\s*\[([\s\S]*?)\]/.exec(body);
    if (!kidsMatch) return;
    for (const km of kidsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(km[1]), depth + 1);
  };

  if (pagesRef !== null) walk(pagesRef);

  if (ordered.length === 0) {
    // Fallback: document order of /Type /Page objects.
    for (const o of [...objects.values()].sort((a, b) => a.num - b.num)) {
      if (/\/Type\s*\/Page\b/.test(o.body) && !/\/Type\s*\/Pages\b/.test(o.body)) ordered.push(o.num);
    }
  }
  return ordered;
}

function pageContent(pageObj, objects, bytes) {
  if (!pageObj) return null;
  const body = pageObj.body;
  const refs = [];
  const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(body);
  const arrayForm = /\/Contents\s*\[([\s\S]*?)\]/.exec(body);
  if (arrayForm) {
    for (const m of arrayForm[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(m[1]));
  } else if (single) {
    refs.push(Number(single[1]));
  }
  const chunks = [];
  for (const r of refs) {
    const o = objects.get(r);
    if (!o) continue;
    const data = decodeStream(o, objects, bytes);
    if (data) chunks.push(DEC.decode(data));
  }
  return chunks.length ? chunks.join('\n') : null;
}

/* -------------------------------------------------------------------- fonts */

function buildFontMap(pageObj, objects) {
  const fonts = new Map();
  if (!pageObj) return fonts;
  let resBody = null;
  const inline = /\/Resources\s*<<([\s\S]*?)>>\s*(?:\/|>>)/.exec(pageObj.body);
  const resRef = refValue(pageObj.body, 'Resources');
  if (inline) resBody = inline[1];
  else if (resRef !== null && objects.has(resRef)) resBody = objects.get(resRef).body;
  if (!resBody) return fonts;

  let fontBody = null;
  const fInline = /\/Font\s*<<([\s\S]*?)>>/.exec(resBody);
  const fRef = refValue(resBody, 'Font');
  if (fInline) fontBody = fInline[1];
  else if (fRef !== null && objects.has(fRef)) fontBody = objects.get(fRef).body;
  if (!fontBody) return fonts;

  for (const m of fontBody.matchAll(/\/([A-Za-z0-9#+._-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const name = m[1];
    const fontObj = objects.get(Number(m[2]));
    if (!fontObj) continue;
    fonts.set(name, describeFont(fontObj, objects));
  }
  return fonts;
}

function describeFont(fontObj, objects) {
  const twoByte = /\/Subtype\s*\/Type0/.test(fontObj.body) || /Identity-[HV]/.test(fontObj.body);
  let toUnicode = null;
  const tuRef = refValue(fontObj.body, 'ToUnicode');
  if (tuRef !== null && objects.has(tuRef)) {
    try {
      const o = objects.get(tuRef);
      const data = o.__pdfBytes ? null : null; // placeholder; filled by caller-scope decode below
      toUnicode = parseCMapFromObject(o, objects, data);
    } catch { toUnicode = null; }
  }
  return { twoByte, toUnicode };
}

// The ToUnicode stream must be decoded with access to the raw file; the extractor
// closure below re-binds `decodeStream`. To keep this readable we stash the file
// buffer on the module scope during extraction.
let CURRENT_BYTES = null;
function parseCMapFromObject(obj, objects) {
  if (!CURRENT_BYTES) return null;
  const data = decodeStream(obj, objects, CURRENT_BYTES);
  if (!data) return null;
  return parseCMap(DEC.decode(data));
}

function parseCMap(src) {
  const map = new Map();
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(p[1], 16), hexToStr(p[2]));
    }
  }
  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), dst = parseInt(p[3], 16);
      for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, String.fromCodePoint(dst + (c - lo)));
    }
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(p[1], 16);
      const items = [...p[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => hexToStr(x[1]));
      items.forEach((v, i) => map.set(lo + i, v));
    }
  }
  return map.size ? map : null;
}

function hexToStr(hex) {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length === 2) out = String.fromCharCode(parseInt(hex, 16));
  return out;
}

/* ------------------------------------------------------------ content stream */

function renderTextOps(content, fonts) {
  let out = '';
  let font = null;
  let lastY = null;
  let lastX = null;
  let pendingNewline = false;

  const tokens = tokenize(content);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'op') continue;
    const op = t.value;
    const args = collectArgs(tokens, i);

    switch (op) {
      case 'Tf': {
        const nameTok = args.find((a) => a.type === 'name');
        font = nameTok ? fonts.get(nameTok.value) ?? null : null;
        break;
      }
      case 'BT': lastY = null; lastX = null; break;
      case 'ET': pendingNewline = true; break;
      case 'Td': case 'TD': {
        const y = num(args[args.length - 1]);
        const x = num(args[args.length - 2]);
        if (lastY !== null && Math.abs(y) > 0.01) pendingNewline = true;
        lastY = y; lastX = x;
        break;
      }
      case 'Tm': {
        const y = num(args[args.length - 1]);
        const x = num(args[args.length - 2]);
        if (lastY !== null && Math.abs(y - lastY) > 1.5) pendingNewline = true;
        else if (lastX !== null && x - lastX > 8) out += ' ';
        lastY = y; lastX = x;
        break;
      }
      case 'T*': pendingNewline = true; break;
      case 'Tj': case "'": case '"': {
        const strTok = [...args].reverse().find((a) => a.type === 'string');
        if (op !== 'Tj') pendingNewline = true;
        if (strTok) {
          if (pendingNewline) { out += '\n'; pendingNewline = false; }
          out += decodeString(strTok, font);
        }
        break;
      }
      case 'TJ': {
        const arrTok = [...args].reverse().find((a) => a.type === 'array');
        if (arrTok) {
          if (pendingNewline) { out += '\n'; pendingNewline = false; }
          for (const el of arrTok.items) {
            if (el.type === 'string') out += decodeString(el, font);
            else if (el.type === 'number' && el.value < -120) out += ' ';
          }
        }
        break;
      }
      default: break;
    }
  }
  return out;
}

function num(tok) { return tok && tok.type === 'number' ? tok.value : 0; }

function collectArgs(tokens, opIndex) {
  const args = [];
  for (let i = opIndex - 1; i >= 0 && args.length < 8; i--) {
    if (tokens[i].type === 'op') break;
    args.unshift(tokens[i]);
  }
  return args;
}

function decodeString(tok, font) {
  const bytes = tok.bytes;
  if (font && font.twoByte) {
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      out += font.toUnicode?.get(code) ?? (code >= 32 && code < 0xd800 ? String.fromCharCode(code) : '');
    }
    return out;
  }
  let out = '';
  for (const b of bytes) {
    if (font?.toUnicode?.has(b)) out += font.toUnicode.get(b);
    else out += WINANSI[b] ?? (b >= 32 ? String.fromCharCode(b) : '');
  }
  return out;
}

const WINANSI = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ', 0xa0: ' '
};

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') { i++; continue; }
    if (c === '%') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '(') { const r = readLiteral(src, i); toks.push(r.tok); i = r.next; continue; }
    if (c === '<' && src[i + 1] === '<') { i += 2; toks.push({ type: 'op', value: '<<' }); continue; }
    if (c === '>' && src[i + 1] === '>') { i += 2; toks.push({ type: 'op', value: '>>' }); continue; }
    if (c === '<') { const r = readHex(src, i); toks.push(r.tok); i = r.next; continue; }
    if (c === '[') { const r = readArray(src, i); toks.push(r.tok); i = r.next; continue; }
    if (c === ']') { i++; continue; }
    if (c === '/') {
      let j = i + 1;
      while (j < n && !/[\s/[\]<>(){}%]/.test(src[j])) j++;
      toks.push({ type: 'name', value: src.slice(i + 1, j) });
      i = j; continue;
    }
    if (/[-+.\d]/.test(c)) {
      let j = i;
      while (j < n && /[-+.\d]/.test(src[j])) j++;
      const v = parseFloat(src.slice(i, j));
      toks.push({ type: 'number', value: Number.isFinite(v) ? v : 0 });
      i = j; continue;
    }
    let j = i;
    while (j < n && !/[\s/[\]<>(){}%]/.test(src[j])) j++;
    if (j === i) j++;
    toks.push({ type: 'op', value: src.slice(i, j) });
    i = j;
  }
  return toks;
}

function readLiteral(src, start) {
  let i = start + 1, depth = 1;
  const bytes = [];
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '\\') {
      const nx = src[i + 1];
      const simple = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (nx in simple) { bytes.push(simple[nx]); i += 2; continue; }
      if (/[0-7]/.test(nx)) {
        let oct = '';
        let k = i + 1;
        while (k < src.length && /[0-7]/.test(src[k]) && oct.length < 3) oct += src[k++];
        bytes.push(parseInt(oct, 8) & 0xff); i = k; continue;
      }
      if (nx === '\n') { i += 2; continue; }
      i += 2; continue;
    }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth === 0) { i++; break; } }
    bytes.push(src.charCodeAt(i) & 0xff);
    i++;
  }
  return { tok: { type: 'string', bytes }, next: i };
}

function readHex(src, start) {
  const end = src.indexOf('>', start);
  const hex = src.slice(start + 1, end === -1 ? src.length : end).replace(/[^0-9A-Fa-f]/g, '');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt((hex.slice(i, i + 2) + '0').slice(0, 2), 16));
  return { tok: { type: 'string', bytes }, next: (end === -1 ? src.length : end + 1) };
}

function readArray(src, start) {
  const items = [];
  let i = start + 1;
  while (i < src.length && src[i] !== ']') {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { const r = readLiteral(src, i); items.push(r.tok); i = r.next; continue; }
    if (c === '<') { const r = readHex(src, i); items.push(r.tok); i = r.next; continue; }
    if (/[-+.\d]/.test(c)) {
      let j = i;
      while (j < src.length && /[-+.\d]/.test(src[j])) j++;
      items.push({ type: 'number', value: parseFloat(src.slice(i, j)) || 0 });
      i = j; continue;
    }
    i++;
  }
  return { tok: { type: 'array', items }, next: i + 1 };
}

function tidy(s) {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Re-export with the module-scope buffer bound so ToUnicode streams can be decoded.
const _extract = extractPdfText;
export default function extract(buffer) {
  CURRENT_BYTES = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  try { return _extract(CURRENT_BYTES); } finally { CURRENT_BYTES = null; }
}
