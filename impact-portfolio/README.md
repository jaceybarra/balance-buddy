# Professional Impact Portfolio

A local, evidence-linked dashboard built from the monthly PDF export of a
professional development document. It answers *what did I do, what changed because
of it, what business value is supported, and how did I develop* — without inflating
any of those answers beyond what the source actually says.

It runs entirely on your machine. No network calls, no publishing, no connection to
email, Zoom or Drive, and no paid AI integration in the core workflow.

---

## Setup and launch

```bash
cd impact-portfolio
npm start
```

Then open <http://127.0.0.1:4178>. That is the whole install: Node 18.17+ and nothing
else. There are zero runtime dependencies.

With no PDF imported you get an honest empty state plus a clearly labelled
**synthetic demo** you can switch on to see how the dashboard behaves. The demo lives
in its own file and is never merged into your real history.

```bash
npm start -- --port 4200    # if 4178 is taken
npm test                    # the verification suite
```

---

## The monthly refresh

```
new PDF  →  extract  →  analyse in Claude Code  →  ingest (reconcile + validate)  →  refreshed dashboard
```

```bash
node bin/portfolio.mjs extract source-pdfs/dev-log-2026-10.pdf
#   ... open work/<importId>/ANALYSIS_TASK.md in Claude Code, work every section ...
node bin/portfolio.mjs ingest <importId>
```

Full instructions, including how to write a correction that survives future
refreshes, are in **[MONTHLY_UPDATE.md](MONTHLY_UPDATE.md)**.

If any step fails, **nothing is written**: the dashboard keeps showing the last
working dataset and the failure is written to `work/<importId>/FAILED_VALIDATION.txt`.

---

## The four views

| View | What it is for |
|---|---|
| **Overview** | A direct answer to "what did I accomplish, and why did it matter?", the best-evidenced contributions, reported outcomes, learning themes and the material gaps. Completed work is separated from work in progress. |
| **Impact & metrics** | Every contribution as a searchable record — problem, contribution, outcome, business relevance — expandable to the exact source excerpts and page numbers. Plus the metric evidence table, where achieved results, estimates, targets and customer context are kept apart. |
| **Customers, projects & development** | Work grouped into initiatives with dated milestones, latest documented status, my role, linked outcomes, and what is *not* documented. Learning themes with the concrete work they were applied to. |
| **Review-ready summaries** | Manager-update and performance-review bullets for the selected period, in action → contribution → result form, with uncertainty and attribution preserved. Copy, Markdown/plain-text export, print view, and an option to anonymise customer names. |

A fifth tab, **Data & refresh**, shows the last successful refresh and the dates the
source covers *as separate facts*, the import history with content hashes, open
contradictions, records that disappeared from a newer export, validation warnings,
your corrections, and the last refresh report.

---

## What the dashboard will not do

These are design constraints, enforced by the validator, not style preferences.

- **It will not invent** metrics, ROI, savings, revenue impact, promotion readiness,
  or causal relationships. A rule blocks derived financial claims outright.
- **It will not turn a proposal into an accomplishment.** "Discussed automating
  follow-up" stays a discussed proposal.
- **It will not claim you led work** the document only shows you participating.
- **It will not multiply a repeated benefit.** "Saves about two hours a week" quoted
  in four weekly summaries is one estimate, counted once — not eight hours, and not
  annualised.
- **It will not sum incompatible things.** Percentages, rates, averages, recurring
  snapshots and overlapping scopes are never aggregated.
- **It will not treat customer context as your achievement.** "The customer handles
  200,000 calls a month" is operating background.
- **It will not treat agreement between Gemini and Zoom as verification.** Both
  summaries are AI-generated; when they agree, that is recorded as agreement.
- **It will not narrow a week to a day**, or present a partial month as comparable
  with a complete one. Missing documentation is never shown as absence of work.
- **It will not score or rank your work.** There are no impact scores and no
  activity-volume leaderboards. Where records are ordered, the ordering is explicitly
  a measure of how completely the source documents them.

Every claim on screen carries a claim type — *stated in source*, *calculated from
source*, *interpretation*, or *needs clarification* — and "stated in source" never
means independently verified.

---

## Accessibility and design

Status, claim type and metric category are always carried by a **text label and an
icon**, never by colour alone. The chart palette is the validated colourblind-safe
reference set; a **Patterns** toggle adds hatch fills for print, forced-colours mode,
or simply preference. Every chart is directly labelled, answers a stated question,
and exposes the records behind it. Light and dark themes are both hand-checked, and
the layout works down to phone width. **Print** produces a clean document of the
current view.

---

## Project layout

```
impact-portfolio/
  bin/portfolio.mjs      the CLI: extract · ingest · validate · status · correct · rollback · serve
  lib/
    pdf/native.mjs       dependency-free, page-aware PDF text extraction
    pdf/extract.mjs      tiered extraction (native → pdftotext → pdfjs) and sectioning
    reconcile.mjs        matching, merging, repeats, conflicts, disappearances
    validate.mjs         the accuracy rules; errors block a refresh
    overrides.mjs        your corrections, re-applied after every import
    coverage.mjs         complete / partial / absent months
    gaps.mjs             what the source does not say
    dataset.mjs          versioned, atomic, crash-safe storage
    server.mjs           localhost-only static server
  web/                   the dashboard (vanilla ES modules, no build step)
  demo/                  synthetic demo dataset - committed, isolated, never merged
  test/                  the verification suite
  data/                  your dataset, corrections and version snapshots   (git-ignored)
  source-pdfs/           your PDF exports                                  (git-ignored)
  work/                  extraction intermediates                          (git-ignored)
```

`data/`, `source-pdfs/`, `work/` and any `*.pdf` are git-ignored by default, so
personal data and source documents stay out of version control.

---

## Why this sits beside the Next.js app rather than inside it

The repository's `app/` directory is deployed to GitHub Pages on every push to
`main`. This dashboard is supposed to run locally and never be published, and it
holds a dataset that must stay off the network. Putting it in `app/` would publish
it. It is therefore a self-contained subproject with its own entry point, sharing
the repository but not the deployment.

---

## Verification

`npm test` covers the failure cases that matter:

duplicate imports · overlapping Gemini/Zoom entries · repeated metric statements ·
aggregation safety (percentages, estimates, repeats, overlapping scopes, mixed units) ·
proposals not becoming outcomes · weeks not becoming days · interpretations without
supporting facts · corrections surviving later imports · revised pagination ·
records disappearing from a newer export · monthly-only exports adding to history ·
incomplete months · a failed refresh preserving the last working dashboard ·
every displayed record carrying an evidence reference · filters selecting the right
records · undated records held out of period totals · period presets bounded by
coverage · contradictions surfacing instead of overwriting · data surviving a restart.

---

## Known limitations

- **The source is two AI summaries and nothing here verifies them.** Every claim is
  traceable to a quote and a page; none of it is independently confirmed.
- **Which tool wrote which entry is inferred, not stated.** The document never names
  Gemini or Zoom. Entries are labelled by their layout: the
  `Week Ending / ACTIVITIES / TASKS / WINS` format is labelled `gemini`, and the
  `Executive Summary / Key Wins / Metrics & Data Points / Actions & Tasks` format is
  labelled `zoom`. If that is backwards, one correction fixes it - see
  MONTHLY_UPDATE.md.
- **Extraction is text-layer only.** Scanned pages are flagged as needing OCR, not
  read. Superscript citation markers in the source (Gemini-style reference numbers)
  come through glued to the preceding word, because a text layer carries no
  superscript flag.
- **The analysis step needs a Claude Code session.** Extraction, reconciliation and
  validation are automatic; turning prose into structured records is not.
- **Record matching across revised exports is a heuristic.** Strong matches merge;
  weak ones are flagged `possible_duplicate` for you to judge. A substantially
  rewritten entry may arrive as a new record with the old one flagged as absent.
- **Aggregation is deliberately near-silent.** Expect very few totals: most stated
  numbers are customer context, estimates or targets, none of which may be summed.
