# Fantasy GM — Architecture

The product question is **"what do I need to do right now?"** Every architectural
decision below exists to answer that question quickly, correctly, and honestly.

---

## 1. The shape of the system

```
                 ┌──────────────────────────────────────────┐
  ESPN Fantasy ──┤  FantasyProvider  (league, rosters,      │
                 │                    scoring, matchups,    │
                 │                    free agents)          │
  Sleeper ───────┤  NflDataProvider  (identity, injuries,   │──┐
                 │                    state, trends)        │  │
  CSV upload ────┤  ProjectionProvider (stat lines)         │  │
                 └──────────────────────────────────────────┘  │
                                                               ▼
                                              ┌──────────────────────────┐
                                              │  Identity resolution     │
                                              │  provider id → canonical │
                                              └──────────────────────────┘
                                                               │
                                                               ▼
                                              ┌──────────────────────────┐
                                              │  SQLite via Prisma       │
                                              │  (stat lines, not points)│
                                              └──────────────────────────┘
                                                               │
   ┌───────────────────────────────────────────────────────────┴────────┐
   ▼                                                                    ▼
┌────────────────────┐                                    ┌────────────────────────┐
│ Scoring engine     │  one per league, never shared      │ Projection model       │
│ statline → points  │                                    │ matchup / script /     │
└────────────────────┘                                    │ injury adjustments     │
   │                                                      └────────────────────────┘
   └──────────────┬───────────────────────────────────────────────┘
                  ▼
      ┌──────────────────────────────┐
      │ Lineup optimizer (exact      │
      │ max-weight assignment)       │
      └──────────────────────────────┘
                  │
                  ▼
      ┌──────────────────────────────┐        ┌───────────────────────────┐
      │ Decision engines             │        │ LLM ("Ask my GM")         │
      │ injury/contingency, waivers, │───────▶│ EXPLANATION LAYER ONLY.   │
      │ streamers, trades, exposure, │        │ Rewrites the engine's     │
      │ news impact, analytics       │        │ conclusions. Never decides│
      └──────────────────────────────┘        └───────────────────────────┘
                  │
                  ▼
      ┌──────────────────────────────┐
      │ Action queue (the product)   │
      └──────────────────────────────┘
```

**The separation that matters most:** deterministic engines decide; the language
model only phrases. `src/lib/ai/retrieval.ts` gathers real, sourced facts and
`src/lib/ai/ask.ts` produces a complete answer *without* an LLM. If an API key is
present the model rewrites that answer under a system prompt that forbids adding
any fact not in the evidence block. Pull the key and the app still answers.

---

## 2. Directory map

```
prisma/
  schema.prisma          domain model (see §4)
  seed.ts                the 2026-09-11 snapshot of both real teams
src/
  app/                   Next.js App Router pages + API routes
  components/            UI. No business logic lives here.
  lib/
    scoring/             stat keys, per-league rule sets, the scoring engine
    projections/         model, D/ST model, consensus blending, pricing
    optimizer/           exact assignment algorithm + lineup rules
    engine/              contingency, waivers, streamers, trades, exposure,
                         news, analytics, actions, brief, sync
    providers/
      espn/              ALL ESPN-specific code (client, id maps, config)
      nfl/               Sleeper + offline mock
      projection/        CSV import
    identity/            canonical player model + resolution
    data/                read models shared by pages and engines
tests/                   business-logic tests (scoring, optimizer, identity, …)
```

---

## 3. Provider strategy

### The contract
`src/lib/providers/types.ts` defines three interfaces:

| Interface | Responsibility | Implementations |
|---|---|---|
| `FantasyProvider` | league, teams, rosters, matchups, free agents, transactions, scoring settings | `EspnProvider` |
| `NflDataProvider` | player identity, state (season/week), injuries, schedule, trends, news | `SleeperNflProvider`, `MockNflProvider` |
| `ProjectionProvider` | weekly + rest-of-season projections | baseline model, CSV import |

### ESPN containment
ESPN's fantasy API is **undocumented and unstable**. Three rules keep that from
infecting the app:

1. **One file talks to ESPN.** `providers/espn/client.ts` is the only place that
   issues a request. It translates every failure mode (401/403 expired cookies,
   404 wrong league, HTML-instead-of-JSON, timeout) into an `EspnError` carrying a
   human-readable hint.
2. **One file knows ESPN's vocabulary.** `providers/espn/scoring-map.ts` holds the
   `statId`, `lineupSlotId`, `proTeamId` and injury-string tables. Nothing outside
   `providers/espn/` has ever heard of `lineupSlotId`.
3. **Unknown means unknown.** A `statId` we cannot map with confidence is returned
   in `unmapped` and shown in Settings for manual confirmation. It is never
   guessed into a scoring rule.

### Degradation, not failure
`engine/sync.ts` wraps every step in `runStep`, which records a `DataSync` row and
**never throws**. A failed ESPN sync leaves the previous data in place, marks the
scope stale, and the UI says so. The app is designed to be useful on a Sunday
morning when ESPN changes an endpoint.

### Credentials
`providers/espn/config.ts` imports `server-only`, so a client component that tries
to import it fails at build time. Cookies are read from the environment at request
time, assembled into a `Cookie` header inside the client, and never logged, never
stored, and never serialized into props. The database stores only the *name* of the
env var (`ProviderCredentialRef`). `redact()` scrubs any secret from error text
before it reaches a log or the screen.

---

## 4. Database design

SQLite locally, written so the move to Postgres/Supabase is a one-line provider
change plus a migration:

* **no enums** — string columns validated by zod in `domain/enums.ts`
* **no JSON columns** — `*Json` string columns parsed through `lib/json.ts`
* **no nullable columns inside unique indexes** — SQL treats `NULL`s as distinct,
  which silently defeats `upsert`. `Projection` therefore uses `week = 0` for
  rest-of-season and `leagueScope = "GLOBAL"` instead of nulls.

### Key models

| Model | Note |
|---|---|
| `League` | scoring + roster rules hang off it; `size` is nullable because League 2's size is genuinely unknown until sync |
| `LeagueScoringRule` | one row per rule, per league. Two leagues can never share a value by accident |
| `RosterSlotConfig` | starters, position maximums, and which positions may fill each slot |
| `Player` | canonical identity; `PlayerProviderId` maps ESPN/Sleeper ids onto it |
| `Projection` | stores a **stat line**, never points — points are a per-league question |
| `PlayerStatistic` | week 0 holds the seeded usage profile (snap share, targets, carries, red zone) |
| `NFLGame` | kickoff, status, spread, implied totals — the source of lock state and of the current week |
| `Action` | the unit the whole product sorts around, with a `dedupeKey` so re-runs update instead of duplicating |
| `DataSync` | one row per refresh attempt, per scope: powers "updated X ago" and stale warnings |
| `ProviderCredentialRef` | points at env var *names*. Never a secret value |

---

## 5. Scoring engine

`scoreStatLine(statLine, config)` is a pure function. Three rule kinds:

* **PER_UNIT** — points per unit (0.1/receiving yard, 6/TD, 0.5/reception)
* **TIER** — bracket tables (points allowed, yards allowed). Exactly one bracket
  applies; a value in a range the league never defined scores **zero** and is
  labelled as such rather than interpolated.
* **BONUS** — yardage milestones. Bonuses sharing an `exclusiveGroup` are mutually
  exclusive: a 410-yard passing game pays the 400+ bonus only.

Anything the league has no rule for is returned in `unscored` and surfaced in the
UI — the app never invents scoring.

**Why this matters for these two leagues.** The engines are genuinely independent:

| Same game: 100 rec yds, 6 rec, 1 TD | Gibbs Me The Trophy | So Good It Hurts |
|---|---|---|
| Receiving yards | 10.0 | 10.0 |
| Receptions (0.5 PPR) | 3.0 | 3.0 |
| Receiving TD | 6.0 | 6.0 |
| 100-yard bonus | — | 4.0 |
| **Total** | **19.0** | **23.0** |

That 4-point gap propagates into every downstream decision: the optimizer, the
waiver ranking, the streaming model, and the trade analyzer all price players with
their own league's rules. A shutout is worth 5 in one league and 6 in the other,
and return yardage scores in one league and not the other.

---

## 6. Projections

Projections are **stat lines**, so each league prices them separately.

`projections/model.ts` starts from a per-game production profile and applies
labelled, explainable factors:

1. role/usage multiplier
2. matchup (graded against the right side of the defense: RBs vs run, pass-catchers vs pass)
3. game environment (implied team total)
4. game script (favored → more rushing; trailing → more passing)
5. home/away
6. weather (only when a weather source is attached, and only for passing/kicking)

Negative events (interceptions, fumbles, misses) never scale up with a good
matchup. Floor and ceiling are produced as **stat lines too**, which is what lets a
ceiling game cross a 100-yard bonus threshold in one league and not the other.

`projections/dst.ts` models defenses off the **opponent** (implied points, giveaway
rate, offensive quality, game script) rather than scaling a generic archetype,
because that is what actually drives D/ST scoring.

Injury designations produce a `playProbability`, kept *separate* from the "if he
plays" projection. The optimizer sorts on `points × playProbability`; the player
page shows both numbers.

`buildConsensus` blends every enabled source by trust weight and **lowers
confidence when sources disagree** rather than averaging the disagreement away.

---

## 7. Lineup optimizer

An exact **max-weight bipartite assignment** (Hungarian/JV, `optimizer/hungarian.ts`)
over slots × players, rather than "sort by projection and fill slots". Greedy gets
FLEX, multi-position eligibility and locked players wrong; rosters are small enough
that the exact algorithm is instant.

Hard constraints:

* a **LOCKED** player (his game kicked off) stays exactly where he is
* a locked bench player can never be promoted
* IR-slot players are never startable
* slot eligibility (including ESPN multi-position eligibility) is always respected
* a ruled-out player carries a heavy penalty but is not hard-banned, so a slot can
  still be filled when there is genuinely nothing else

The objective tilts toward floor or ceiling based on the week's matchup
(`strategyForMatchup`): chase ceiling when projected to lose, protect the floor
when comfortably ahead.

Differences are reported as **who enters and who leaves the lineup**, not slot by
slot — a player sliding from RB to FLEX is a shuffle, not a decision the user has
to make.

---

## 8. Recommendation pipeline

```
data → league scoring → projections → roster constraints → optimization
     → decision rules → Action rows → (optional) AI phrasing
```

`engine/actions.ts` runs every engine per league and writes `Action` rows with a
stable `dedupeKey`, so a re-run updates a card instead of spamming a new one, and
`SNOOZED`/`DONE` states survive.

Noise control is a product feature, not an afterthought:

* an INJURY card owns the whole Plan A/B/C ladder, so the equivalent LINEUP swap is
  suppressed
* D/ST and K are streaming decisions, so they never also appear as waiver cards
* one waiver claim per position, two per league (the full ranked list lives on the
  waivers page)
* a waiver claim only reaches HIGH severity when it measurably improves *this
  week's* starting lineup

### Confidence
Every recommendation carries a confidence built from the projected gap, how much
each projection is trusted, source disagreement, and injury ambiguity. It is capped
below 100% — weekly fantasy variance is large and pretending otherwise is false
precision. When two options are within 0.75 points the app says "coin flip" instead
of picking a winner.

---

## 9. Sync architecture and scheduling

`refreshEverything()` runs: NFL state → player identity/injuries → trends → ESPN
league sync (per league) → projections → recommendation engines. Each step records
its own `DataSync` row, so freshness is tracked **per scope** — ESPN rosters can be
an hour stale while the injury feed is fine.

Scheduling deliberately contains **no hardcoded NFL calendar**. `vercel.json`
triggers `/api/cron/refresh` on a coarse schedule; the endpoint reads actual kickoff
times out of `NFLGame` and classifies urgency as `IMMINENT` (a kickoff within two
hours, or games in progress), `ACTIVE` (games today) or `IDLE`, then decides how
much work to do. The manual "Refresh" button in the header runs the same code path.

---

## 10. Identity resolution

Matching order, strongest first:

1. a stored provider-id mapping
2. a cross-provider id the source supplied (Sleeper publishes ESPN ids)
3. normalized name + position
4. create a new canonical player

Name matching is last on purpose — leading with it is what creates
"Hollywood Brown" / "Marquise Brown" duplicates. `normalizeName` strips punctuation
and suffixes so "Chris Godwin Jr." and "Chris Godwin" collapse, and a nickname table
handles the rest. Defenses get a `dst:<team>` key so a defense can never collide
with a skill player. Manually-pinned players are never overwritten by a sync.

---

## 11. Transactions: read-only by design

The app does not submit waiver claims, trades, drops or lineup changes. ESPN's
write endpoints are undocumented, and the user should remain the final approver of
every roster transaction. Recommendations state exactly what to do; you make the
move in ESPN and mark the action done.

---

## 12. Migrating to Postgres

1. `provider = "postgresql"` in `prisma/schema.prisma`
2. point `DATABASE_URL` at Supabase/Neon
3. `npx prisma migrate dev --name init`
4. `npm run db:seed` (or run a sync)

No application code changes: the schema already avoids every SQLite-only shape, and
all data access goes through Prisma.
