// `portfolio doctor` - prove, on this machine, that the app is local.
//
// The point is not to reassure: every check reads the files that will actually run
// and reports what it found, so a future change that reaches the network shows up
// here rather than in a packet capture.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, DATA_DIR, DATASET_FILE, OVERRIDES_FILE, PDF_DIR, readJSON, listVersions } from './dataset.mjs';

const RUNTIME_DIRS = ['web', 'lib', 'bin'];

// Relative specifiers can only ever reach the local server; an absolute URL cannot.
const ABSOLUTE_URL = /(?:https?:)?\/\/[a-zA-Z0-9.-]+/g;
const ALLOWED_ORIGINS = [/127\.0\.0\.1/, /localhost/, /www\.w3\.org/];

export function runDoctor() {
  const checks = [];
  const ok = (name, detail) => checks.push({ state: 'pass', name, detail });
  const warn = (name, detail) => checks.push({ state: 'warn', name, detail });
  const bad = (name, detail) => checks.push({ state: 'fail', name, detail });

  /* ---------------------------------------------------------------- runtime */

  // Verified against Node 18.0.0: every command and the dashboard itself work.
  // `npm test` is the one exception - node --test was only unflagged in 18.13.
  const [major, minor] = process.versions.node.split('.').map(Number);
  const canTest = major > 18 || (major === 18 && minor >= 13);
  if (major >= 18) {
    ok('Node version', `${process.versions.node}${canTest ? '' : ' - fine to use; npm test needs 18.13+'}`);
  } else {
    bad('Node version', `${process.versions.node} - this project needs Node 18 or newer`);
  }

  const pkg = readJSON(path.join(ROOT, 'package.json'), {});
  const deps = Object.keys(pkg.dependencies ?? {});
  const opt = Object.keys(pkg.optionalDependencies ?? {});
  if (deps.length === 0) ok('Runtime dependencies', 'none - there is nothing to install');
  else bad('Runtime dependencies', `${deps.join(', ')} - this app is meant to have none`);
  if (opt.length) warn('Optional dependencies', `${opt.join(', ')} (only used as PDF fallbacks)`);

  const hasModules = fs.existsSync(path.join(ROOT, 'node_modules'));
  ok('node_modules', hasModules ? 'present but not required' : 'absent, and not needed');

  /* -------------------------------------------------------------- isolation */

  const offenders = [];
  for (const dir of RUNTIME_DIRS) walk(path.join(ROOT, dir), (file) => {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.match(ABSOLUTE_URL) ?? []) {
      if (!ALLOWED_ORIGINS.some((re) => re.test(m))) {
        offenders.push(`${path.relative(ROOT, file)}: ${m}`);
      }
    }
  });
  if (offenders.length === 0) {
    ok('External origins', `none referenced in ${RUNTIME_DIRS.join('/, ')}/`);
  } else {
    bad('External origins', offenders.slice(0, 5).join('; '));
  }

  const server = fs.readFileSync(path.join(ROOT, 'lib', 'server.mjs'), 'utf8');
  const listen = /server\.listen\(\s*[^,]+,\s*'([^']+)'/.exec(server);
  if (listen && (listen[1] === '127.0.0.1' || listen[1] === '::1')) {
    ok('Server binding', `${listen[1]} only - not reachable from your network`);
  } else {
    bad('Server binding', `listens on ${listen ? listen[1] : 'an unknown address'}`);
  }

  /* -------------------------------------------------------------- your data */

  if (fs.existsSync(DATASET_FILE)) {
    const ds = readJSON(DATASET_FILE);
    ok('Dataset', `${ds.contributions?.length ?? 0} contributions, ${ds.excerpts?.length ?? 0} excerpts, ` +
      `version ${ds.datasetVersion ?? 0}, covering ${ds.coverage?.sourceStart ?? '?'} to ${ds.coverage?.sourceEnd ?? '?'}`);
  } else {
    warn('Dataset', `not present at ${path.relative(process.cwd(), DATASET_FILE)} - import a PDF, or restore a backup`);
  }

  const ovr = readJSON(OVERRIDES_FILE, null);
  ok('Corrections', ovr ? `${(ovr.entries ?? []).length} on file` : 'none yet');
  ok('Version snapshots', `${listVersions().length} in ${path.relative(ROOT, path.join(DATA_DIR, 'versions'))}/`);

  const pdfs = fs.existsSync(PDF_DIR)
    ? fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith('.pdf')) : [];
  ok('Source PDFs held locally', pdfs.length ? `${pdfs.length} in source-pdfs/` : 'none stored');

  /* ------------------------------------------------------- git containment */

  const gitignore = fs.existsSync(path.join(ROOT, '.gitignore'))
    ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
  const mustIgnore = ['data/', 'source-pdfs/', 'work/', '*.pdf'];
  const missing = mustIgnore.filter((p) => !gitignore.includes(p.replace(/\/$/, '')));
  if (missing.length === 0) ok('Kept out of version control', mustIgnore.join(', '));
  else bad('Kept out of version control', `.gitignore does not cover ${missing.join(', ')}`);

  try {
    const tracked = execFileSync('git', ['ls-files', '--', 'data', 'source-pdfs', 'work'],
      { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((l) => l && !l.endsWith('.gitkeep'));
    if (tracked.length === 0) ok('Nothing personal is tracked by git', 'verified with git ls-files');
    else bad('Nothing personal is tracked by git', `${tracked.length} file(s) tracked: ${tracked.slice(0, 3).join(', ')}`);
  } catch {
    warn('Git check', 'not a git repository here, or git is unavailable - skipped');
  }

  /* --------------------------------------------------------- pdf extraction */

  let poppler = false;
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); poppler = true; } catch { /* absent */ }
  ok('PDF extraction', `built-in extractor always available${poppler ? '; pdftotext also present as a fallback' : ''}`);

  return checks;
}

function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fn);
    else if (/\.(mjs|js|html|css)$/.test(entry.name)) fn(full);
  }
}
