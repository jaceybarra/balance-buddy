# Fantasy GM

A personal fantasy football general manager for two teams. It does not show you
statistics — it tells you **what you need to do right now**, why, how confident it
is, and by when.

```
FANTASY GM
Here's what needs your attention.

ACTION NEEDED   Start Jayden Reed over Christian Watson at FLEX
                Move Jayden Reed into FLEX and bench Christian Watson.
                Projected 11.4 vs 7.2 (+4.2) in Gibbs Me The Trophy's scoring.
                7 targets/gm vs 4. You project to lose by 9.6 — favor ceiling.
                77% confident · act by Mon 6:15 PM MDT

WATCH           Malik Nabers is questionable
                Monitor his status. If he sits: Tony Pollard → RB.
                Plan A  if he is active without a restriction: start him at WR
                Plan B  if he is ruled out: Tony Pollard → RB (bench Nabers)
                Plan C  if news is unclear at kickoff: Rachaad White plays later
                70% confident · act by Sun 1:45 PM MDT
```

Two teams, two **independent** scoring engines:

| Same game: 100 receiving yards, 6 receptions, 1 TD | Gibbs Me The Trophy | So Good It Hurts |
|---|---|---|
| | **19.0** | **23.0** (100-yard bonus) |

That difference propagates into every recommendation: lineups, waivers, streamers
and trades are all priced with the rules of the league they apply to.

---

## Quick start

Requires **Node 18.18 or newer** (`node -v`).

```bash
npm install
npm run db:reset     # create the SQLite database + seed both teams
npm run dev          # http://localhost:3000
```

That's the whole setup. **No configuration file is needed to start** — the
database defaults to `prisma/dev.db` and the app runs entirely on seeded data.

`db:reset` loads the **2026-09-11** snapshot of both real rosters, a full 18-week
NFL schedule, a free-agent pool per league, baseline projections and the action
queue. ESPN and Sleeper are optional upgrades, not requirements.

When you *do* want ESPN data, create an env file and fill it in:

```bash
cp .env.example .env      # or .env.local — both are read, and both are git-ignored
```

> Windows PowerShell: `Copy-Item .env.example .env`

`.env` and `.env.local` are equivalent here: Next.js reads both, and
`prisma.config.ts` loads both for the Prisma CLI. Everything in them is optional
except `DATABASE_URL`, which already has a working local default.

Other scripts:

```bash
npm test            # 107 business-logic tests (scoring, optimizer, identity, …)
npm run typecheck   # tsc --noEmit
npm run lint
npm run db:studio   # browse the database
npm run db:seed     # reseed without dropping the file
npm run build       # production build
```

---

## Finding your ESPN values

Everything below is optional. Without it the app runs on seeded data and tells you
so on every card.

### League and team ids

**Already filled in** in `.env.example`, taken from the league URLs:

```
ESPN_LEAGUE_1_ID=423473861     # Gibbs Me The Trophy
ESPN_TEAM_1_ID=12
ESPN_LEAGUE_2_ID=81193741      # So Good It Hurts
ESPN_TEAM_2_ID=7
SEASON=2026
```

If you need to find them again — or the ids change next season — open your team
on <https://fantasy.espn.com> and read them out of the address bar:

```
https://fantasy.espn.com/football/team?leagueId=423473861&seasonId=2026&teamId=12
                                                ^^^^^^^^^                      ^^
                                                league id                 team id
```

### Cookies (private leagues only)

Public leagues need nothing further. Private leagues need two cookies:

1. Log in at <https://fantasy.espn.com>.
2. Open DevTools (`F12` / `Cmd-Option-I`) → **Application** (Chrome) or **Storage**
   (Firefox) → **Cookies** → `https://fantasy.espn.com`.
3. Copy two values:
   * `SWID` — looks like `{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}`. **Keep the braces.**
   * `espn_s2` — a long URL-encoded string. Copy the whole thing.

```
ESPN_SWID={AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}
ESPN_S2=AEB...very long...%3D%3D
```

If the two leagues are under different ESPN logins, set them per league instead —
the per-league values win and the shared pair is the fallback:

```
ESPN_LEAGUE_1_SWID=...
ESPN_LEAGUE_1_S2=...
ESPN_LEAGUE_2_SWID=...
ESPN_LEAGUE_2_S2=...
```

Then go to **Settings → Test ESPN connection**. It is read-only and tells you
exactly what happened: whether each league was reachable, whether your team id
matched (and lists the league's teams if it didn't), how many scoring rules were
imported, which ESPN `statId`s could not be mapped, and every difference between
ESPN's settings and the ones currently stored.

Once that comes back green, hit **Refresh** in the app header to make the synced
ESPN data authoritative.

> ESPN cookies expire every few weeks. When they do, the app keeps working on the
> last synced data, marks it stale, and the sync status names the variable to
> refresh.

### Other environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite locally; swap for Postgres later |
| `APP_TIMEZONE` | `America/Denver` | All deadlines and kickoffs are shown in this zone |
| `LOCK_WARNING_MINUTES` | `60` | How early a player is flagged "locking soon" |
| `NFL_PROVIDER` | `sleeper` | `sleeper` or `mock` (fully offline) |
| `PROJECTION_SOURCES` | `baseline,csv,espn` | Which sources feed the consensus |
| `ANTHROPIC_API_KEY` | — | Optional. Enables AI *phrasing* in Ask my GM |
| `ASK_MODEL` | `claude-sonnet-5` | Model used for phrasing |
| `CRON_SECRET` | — | Bearer token protecting `/api/cron/refresh` |

**Nothing secret is ever stored in the database, logged, or sent to the browser.**
The credential config module imports `server-only`, so importing it from a client
component is a build error, and secrets are scrubbed from error messages.

---

## What's in the app

| Page | What it's for |
|---|---|
| `/dashboard` | GM command center: the action queue, both teams, exposure |
| `/actions` | Every open recommendation, grouped by severity |
| `/lineup` | Current vs optimal lineup, the exact moves, and the start/sit comparison tool |
| `/waivers` | Ranked targets with add/drop/why, roster-improvement scan, streamers |
| `/matchups` | Week matchup, win probability, advantages, risks, who's left to play |
| `/trades` | Trade analyzer — measures your *starting lineup*, not point totals |
| `/exposure` | Players on both teams, bye and injury concentration |
| `/players/[id]` | One player, with his value in **each** league side by side |
| `/team/[id]` | Roster, starters, bench, IR, roster analytics |
| `/ask` | Ask my GM + the weekly 60-second brief |
| `/settings` | Sync status, ESPN config, scoring rules, manual fallback, CSV import |

### Recommendation quality rules

* Confidence is capped below 100% — weekly variance is real.
* Two players within 0.75 points are reported as a **coin flip**, not a winner.
* A locked player is never moved, and a locked bench player is never promoted.
* Stats a league has no rule for are reported, never guessed (Settings lists them).
* Opponent projections are labelled as **estimates** until ESPN provides rosters.

---

## When ESPN breaks

The app is built to stay useful without it:

* the last synced (or seeded) data stays in place and is marked stale
* Settings → *Manual fallback* edits a player's status or NFL team, and pins him so
  future syncs don't overwrite you
* `POST /api/manual/roster` moves, adds and removes players by hand
* CSV projection import replaces the projection feed (Settings → Import projections)
* `NFL_PROVIDER=mock` runs the whole app with no network at all

---

## Importing projections by CSV

Include a `name` column plus **stat columns** — they let each league price the same
projection with its own rules:

```csv
name,position,team,recYards,rec,recTD,rushYards,rushTD
Jayden Reed,WR,GB,78,5.4,0.5,4,0.02
Nico Collins,WR,HOU,88,6.1,0.55,0,0
```

Common aliases (`Rec Yds`, `Receptions`, `Pass TD`, …) are recognized; unrecognized
columns are reported rather than silently dropped. A bare `points` column is
accepted but flagged — those points were computed in someone else's scoring system
and cannot be re-priced for two different leagues.

---

## Deploying to Vercel

1. Push the repo and import it in Vercel.
2. Add the environment variables above (plus `CRON_SECRET`).
3. **Move off SQLite** — a serverless filesystem is not durable. Point
   `DATABASE_URL` at Postgres/Supabase and change `provider` in
   `prisma/schema.prisma` to `postgresql`, then `npx prisma migrate dev --name init`.
   Nothing in the application code needs to change (see ARCHITECTURE.md §12).
4. `vercel.json` already registers the cron schedule. The endpoint reads real
   kickoff times to decide how much work to do, so no NFL calendar is hardcoded.

---

## Transactions: you stay the approver

This app never submits a waiver claim, trade, drop or lineup change. ESPN's write
endpoints are undocumented, and roster moves should stay your decision. Every
recommendation tells you exactly what to do; you make the move in ESPN and mark the
action done.

---

## Further reading

* [`ARCHITECTURE.md`](./ARCHITECTURE.md) — provider strategy, database design,
  scoring and recommendation engines, sync architecture
* [`TODO.md`](./TODO.md) — the phase plan and the honest list of remaining gaps
