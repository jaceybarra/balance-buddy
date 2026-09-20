// Application shell: load data, own the filter state, route between views.

import { el, clear, notice, section, buildAnon } from './ui.mjs';
import { filterContributions, resolveRange, monthsBetween } from './model.mjs';
import { renderOverview, renderImpact, renderInitiatives, renderReview, renderData } from './views.mjs';

const state = {
  ds: null,
  mode: 'none',             // 'real' | 'demo' | 'none'
  tab: 'overview',
  filter: { period: 'all', from: null, to: null, customerId: '', projectId: '', status: '', q: '' },
  anonymise: null
};

const VIEWS = {
  overview: { node: () => document.getElementById('view-overview'), render: renderOverview },
  impact: { node: () => document.getElementById('view-impact'), render: renderImpact },
  initiatives: { node: () => document.getElementById('view-initiatives'), render: renderInitiatives },
  review: { node: () => document.getElementById('view-review'), render: renderReview },
  data: { node: () => document.getElementById('view-data'), render: renderData }
};

init();

async function init() {
  restorePrefs();
  wireChrome();

  let serverState = null;
  try {
    serverState = await (await fetch('api/state')).json();
  } catch {
    serverState = null;
  }

  if (!serverState) {
    renderEmpty({
      title: 'The dashboard could not reach its local data service.',
      body: 'Open the dashboard through the local server rather than the file system.',
      cmd: 'cd impact-portfolio\nnpm start'
    });
    return;
  }

  if (serverState.hasRealData) {
    await loadReal();
  } else {
    renderEmpty({
      title: 'No professional development PDF has been imported yet.',
      body: serverState.datasetPresent
        ? 'A dataset file exists but holds no contributions. Run an import to populate it.'
        : 'This is an honest empty state, not an error. Nothing is shown because nothing has been imported. ' +
          'Drop your monthly PDF export into impact-portfolio/source-pdfs/ and run the two commands below.',
      cmd: 'cd impact-portfolio\nnode bin/portfolio.mjs extract source-pdfs/your-export.pdf\n' +
        '# then open the printed ANALYSIS_TASK.md in Claude Code, and finally:\nnode bin/portfolio.mjs ingest <importId>',
      demo: serverState.demoAvailable
    });
  }
}

/* ------------------------------------------------------------------ loading */

async function loadReal() {
  const ds = await (await fetch('api/portfolio')).json();
  state.ds = ds;
  state.mode = 'real';
  document.getElementById('demo-band').hidden = true;
  boot();
}

async function loadDemo() {
  const ds = await (await fetch('api/demo')).json();
  state.ds = ds;
  state.mode = 'demo';
  const band = document.getElementById('demo-band');
  band.hidden = false;
  document.getElementById('demo-band-text').textContent =
    'Every customer, project, date, quote and number below is invented. ' +
    'It is stored separately from your real history and is never merged into it.';
  document.getElementById('demo-band').title = ds.demoNotice ?? '';
  boot();
}

function boot() {
  document.getElementById('view-empty').classList.remove('is-active');
  document.getElementById('filters').hidden = false;
  populateFilterOptions();
  refreshLine();
  render();
}

/* ------------------------------------------------------------------- chrome */

function wireChrome() {
  for (const btn of document.querySelectorAll('nav.tabs button')) {
    btn.addEventListener('click', () => {
      if (!state.ds) return;
      state.tab = btn.dataset.view;
      render();
    });
  }

  document.getElementById('print-btn').addEventListener('click', () => window.print());

  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    savePrefs();
  });

  const patBtn = document.getElementById('pattern-toggle');
  patBtn.addEventListener('click', () => {
    const on = document.documentElement.dataset.patterns === 'on';
    document.documentElement.dataset.patterns = on ? 'off' : 'on';
    patBtn.textContent = on ? 'Patterns off' : 'Patterns on';
    patBtn.setAttribute('aria-pressed', String(!on));
    savePrefs();
  });

  document.getElementById('exit-demo').addEventListener('click', () => location.reload());

  const f = state.filter;
  const period = document.getElementById('f-period');
  period.addEventListener('change', () => {
    f.period = period.value;
    const custom = f.period === 'custom';
    document.getElementById('custom-range').hidden = !custom;
    document.getElementById('custom-range-to').hidden = !custom;
    render();
  });
  document.getElementById('f-from').addEventListener('change', (e) => { f.from = e.target.value || null; render(); });
  document.getElementById('f-to').addEventListener('change', (e) => { f.to = e.target.value || null; render(); });
  document.getElementById('f-customer').addEventListener('change', (e) => { f.customerId = e.target.value; render(); });
  document.getElementById('f-project').addEventListener('change', (e) => { f.projectId = e.target.value; render(); });

  let t;
  document.getElementById('f-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { f.q = e.target.value.trim(); render(); }, 180);
  });

  document.getElementById('f-reset').addEventListener('click', () => {
    Object.assign(f, { period: 'all', from: null, to: null, customerId: '', projectId: '', status: '', q: '' });
    period.value = 'all';
    document.getElementById('f-customer').value = '';
    document.getElementById('f-project').value = '';
    document.getElementById('f-search').value = '';
    document.getElementById('custom-range').hidden = true;
    document.getElementById('custom-range-to').hidden = true;
    render();
  });
}

function populateFilterOptions() {
  const { ds } = state;
  const cSel = document.getElementById('f-customer');
  const pSel = document.getElementById('f-project');
  clear(cSel); clear(pSel);
  cSel.append(el('option', { value: '', text: 'All customers' }));
  for (const c of ds.customers ?? []) cSel.append(el('option', { value: c.id, text: c.name }));
  pSel.append(el('option', { value: '', text: 'All projects' }));
  for (const p of ds.projects ?? []) pSel.append(el('option', { value: p.id, text: p.name }));

  const from = document.getElementById('f-from');
  const to = document.getElementById('f-to');
  if (ds.coverage?.sourceStart) { from.min = ds.coverage.sourceStart; to.min = ds.coverage.sourceStart; }
  if (ds.coverage?.sourceEnd) { from.max = ds.coverage.sourceEnd; to.max = ds.coverage.sourceEnd; }
}

function refreshLine() {
  const { ds } = state;
  const refreshed = ds.lastSuccessfulRefresh
    ? new Date(ds.lastSuccessfulRefresh).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'never';
  document.getElementById('refresh-line').textContent =
    `Last refresh ${refreshed}  ·  source covers ${ds.coverage?.sourceStart ?? '—'} to ${ds.coverage?.sourceEnd ?? '—'}`;
}

/* ------------------------------------------------------------------- render */

function setFilter(patch) {
  if (patch.tab) { state.tab = patch.tab; delete patch.tab; }
  Object.assign(state.filter, patch);
  const period = document.getElementById('f-period');
  if (patch.period) {
    period.value = patch.period;
    const custom = patch.period === 'custom';
    document.getElementById('custom-range').hidden = !custom;
    document.getElementById('custom-range-to').hidden = !custom;
    if (patch.from) document.getElementById('f-from').value = patch.from;
    if (patch.to) document.getElementById('f-to').value = patch.to;
  }
  render();
}

function setAnonymise(on) {
  state.anonymise = on ? buildAnon(state.ds) : null;
  render();
}

function render() {
  const { ds } = state;
  if (!ds) return;

  const range = resolveRange(state.filter.period, ds, { from: state.filter.from, to: state.filter.to });
  const view = filterContributions(ds, { ...state.filter, from: range.from, to: range.to });

  document.getElementById('filter-summary').textContent =
    `${view.kept.length} contribution${view.kept.length === 1 ? '' : 's'} in view · ${range.label}` +
    (state.filter.status ? ` · status: ${state.filter.status.replace('_', ' ')}` : '') +
    (view.undated.length ? ` · ${view.undated.length} undated record${view.undated.length === 1 ? '' : 's'} excluded from period totals` : '');

  for (const btn of document.querySelectorAll('nav.tabs button')) {
    if (btn.dataset.view === state.tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }

  const notices = document.getElementById('global-notices');
  clear(notices);
  const blocking = ds.validation?.errors ?? [];
  if (blocking.length) {
    notices.append(notice('critical',
      el('strong', { text: 'This dataset has unresolved validation errors. ' }),
      `${blocking.length} record(s) may be displayed with incomplete evidence. Run: node bin/portfolio.mjs validate`));
  }

  for (const [key, v] of Object.entries(VIEWS)) {
    const node = v.node();
    node.classList.toggle('is-active', key === state.tab);
  }

  const active = VIEWS[state.tab];
  active.render(active.node(), {
    ds, view, range,
    filter: state.filter,
    anonymise: state.anonymise,
    setFilter, setAnonymise
  });

  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* -------------------------------------------------------------- empty state */

function renderEmpty({ title, body, cmd, demo }) {
  const node = document.getElementById('view-empty');
  clear(node);
  node.classList.add('is-active');
  node.append(el('div', { class: 'card empty-state' },
    el('h2', { text: title }),
    el('p', { text: body }),
    cmd ? el('pre', { text: cmd }) : null,
    demo
      ? el('div', { class: 'btn-group', style: 'justify-content:center' },
          el('button', { class: 'btn btn--primary', type: 'button', onclick: loadDemo },
            'Explore the synthetic demo'))
      : null,
    demo
      ? el('p', { class: 'muted', style: 'margin-top:14px' },
          'The demo is invented data kept in a separate file. It is never merged into your real history, ' +
          'and leaving the demo returns you to this screen.')
      : null));
}

/* -------------------------------------------------------------------- prefs */

function savePrefs() {
  try {
    localStorage.setItem('pip-prefs', JSON.stringify({
      theme: document.documentElement.dataset.theme ?? '',
      patterns: document.documentElement.dataset.patterns ?? 'off'
    }));
  } catch { /* private mode - preferences simply do not persist */ }
}

function restorePrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('pip-prefs') ?? '{}'); } catch { p = {}; }
  if (p.theme) document.documentElement.dataset.theme = p.theme;
  document.documentElement.dataset.patterns = p.patterns === 'on' ? 'on' : 'off';
  const btn = document.getElementById('pattern-toggle');
  if (btn && p.patterns === 'on') { btn.textContent = 'Patterns on'; btn.setAttribute('aria-pressed', 'true'); }
}
