# Fantasy GM — implementation plan

Status key: `[x]` done and running · `[~]` partial, noted why · `[ ]` not started

---

## Phase 1 — Application shell, database, seeded reality ✅

- [x] Next.js 15 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind app shell
- [x] Prisma schema — Postgres-compatible on purpose (no enums, no JSON columns, no nullable unique columns)
- [x] Both leagues seeded with independent scoring rule sets and roster configurations
- [x] Both real rosters seeded from the **2026-09-11** snapshot, including the empty
      bench slot, Brock Bowers on IR, and Malik Nabers questionable
- [x] 32 NFL teams + a full deterministic 18-week schedule with TNF / Sunday
      early / Sunday late / SNF / MNF / Saturday / international windows
- [x] Scoring engines (per league) with per-unit, tier and mutually-exclusive bonus rules
- [x] Command center dashboard, team pages, player pages
- [x] Action model and action queue

## Phase 2 — Provider abstraction and freshness ✅

- [x] `FantasyProvider` / `NflDataProvider` / `ProjectionProvider` interfaces
- [x] `EspnProvider` — league, teams, rosters, matchups, free agents, transactions, scoring settings
- [x] ESPN failure handling: expired cookies, wrong league, HTML responses, timeouts, rate limits
- [x] Sleeper NFL provider + offline mock, with automatic degradation between them
- [x] Season/week derived from data (provider state → schedule → fallback). Never hardcoded
- [x] Per-scope freshness tracking (`DataSync`) and stale warnings in the UI
- [x] Synchronization status page with per-env-var configuration status (never values)
- [~] ESPN `statId` map is community-derived. Unmapped ids are reported in Settings
      rather than guessed — verify against a real league on first sync

## Phase 3 — Projections, optimizer, start/sit ✅

- [x] Baseline projection model: role, matchup, implied total, game script, home/away, weather hook
- [x] Dedicated D/ST model driven by the opponent
- [x] Floor/ceiling as stat lines, so a league's yardage bonus can fire in the ceiling case
- [x] Consensus blending with disagreement → lower confidence
- [x] Exact max-weight assignment optimizer (locks, IR, byes, multi-position eligibility)
- [x] Start/sit assistant with Strong Start / Lean Start / Coin Flip / Avoid
- [x] Confidence model, with an explicit "effectively tied" state

## Phase 4 — Waivers, free agents, streaming ✅

- [x] Waiver ranking measured as *improvement to my optimal lineup*, per league
- [x] Never recommends a player already rostered in that league
- [x] Add / drop / why / priority / short-term value / rest-of-season value
- [x] Speculative adds identified separately from immediate starters
- [x] Continuous roster-improvement scan (lowest-value bench asset vs the wire)
- [x] Handcuff and ceiling protection in drop selection
- [x] D/ST, K, QB and TE streamers — league-specific, because the defensive brackets differ

## Phase 5 — Injuries, news, contingencies, locks ✅

- [x] Full status ladder: Healthy / Questionable / Doubtful / Out / IR / PUP / Suspended / Unknown
- [x] Plan A / Plan B / Plan C contingency ladder with a decision deadline
- [x] Plan C only proposes slot-eligible players in later game windows
- [x] Lock states (Available / Locking soon / Locked), configurable warning window
- [x] News ranked by impact on *my* decisions, with a derived "so what"
- [x] Injury *changes* recorded as news ("designation dropped — your contingency is no longer needed")
- [~] News currently derives from injury/depth-chart changes. No licensed news feed
      is wired up; the adapter is in place for one

## Phase 6 — Trades, matchup strategy, exposure ✅

- [x] Trade analyzer that rebuilds the roster and re-runs the optimizer (WAR-style, not point totals)
- [x] Accept / Lean accept / Even / Lean decline / Decline with an explanation and risks
- [x] Roster-legality check after the trade
- [x] Matchup page: projections, win probability, advantages, risks, players left to play
- [x] Strategy feeds close start/sit calls (chase ceiling when losing, protect floor when ahead)
- [x] Cross-team exposure page that surfaces concentration without lecturing about diversification

## Phase 7 — Ask my GM, brief, automated queue ✅

- [x] Retrieval layer that gathers real, sourced facts from the database and engines
- [x] Deterministic answer built first; the LLM only rewrites it
- [x] System prompt forbids inventing injuries, rosters, projections, free agents, news, stats, schedules
- [x] Works with no API key at all (engine phrasing), and shows which layer wrote the answer
- [x] Citations and explicit data-gap reporting on every answer
- [x] Weekly GM brief — the 60-second read
- [x] Automated action generation with dedupe, expiry, and severity rules

## Phase 8 — PWA, notifications, cron, deployment ✅

- [x] PWA manifest, icons, standalone display, app shortcuts
- [x] Service worker that caches **static assets only** — never pages or API
      responses, because stale lineup advice is worse than none
- [x] In-app notification model with dedupe and a "meaningful decisions only" policy
- [x] `/api/cron/refresh` with urgency derived from real kickoff times
- [x] `vercel.json` cron schedule + `CRON_SECRET` protection
- [x] Manual "Refresh everything" button for local use

## Testing ✅

- [x] 107 tests over the logic that must not be wrong
- [x] Team 1 vs Team 2 scoring, including the 19 / 23 worked example from the spec
- [x] Yardage bonus exclusivity, undefined-range handling, D/ST brackets, kicker buckets
- [x] Legal roster optimization: one-FLEX and two-FLEX, locks, IR, byes, eligibility
- [x] Identity resolution: suffixes, nicknames, D/ST identity, provider abbreviations
- [x] Schedule integrity: byes, no double-booking, correct Eastern calendar days
- [x] Trade analysis, drop protection, CSV import parsing

---

## Known gaps and next steps

These are real, and none of them block daily use:

1. **Live provider calls are unverified.** The build environment blocks outbound
   calls to `fantasy.espn.com` and `api.sleeper.app` (both return 403 from its
   proxy), so the ESPN and Sleeper adapters have only been exercised against their
   failure paths. Those paths were verified end to end: every provider failing at
   once still produced projections and a full action queue from seeded data, with
   an honest per-scope status. What remains unconfirmed is the happy path —
   especially a few ESPN `statId` mappings, which Settings will list for manual
   confirmation on your first real sync. *(Add the env vars and hit Refresh.)*
2. **Baseline projections are a model, not a market.** They are deterministic and
   explainable, but a real projection feed (or a weekly CSV) will beat them. The
   adapter and consensus blending are already in place.
3. **Opponent scores are estimated** until an ESPN sync provides their rosters. The
   UI labels them as estimates.
4. **No live weather source.** The model has the hook; nothing feeds it yet.
5. **Push / email / SMS notifications** are modeled but only the in-app channel is
   implemented.
6. **Real usage statistics** (actual snap share, targets, red-zone touches) come
   from the seeded profile today. A stats provider would replace `PlayerStatistic`
   week-0 rows with real weekly data.
7. **Single user.** The schema has a `User` model but there is no auth. Add one
   before this is ever exposed beyond localhost or a private deployment.
8. **`Jonah Coleman` has no NFL team in the seed** — the snapshot genuinely did not
   establish it. The app raises a roster action about it instead of guessing.
