import { prisma } from '@/lib/db';
import { getFreshness } from '@/lib/data/freshness';
import { getLeagueOptions } from '@/lib/data/leagues';
import { loadScoringConfig } from '@/lib/data/scoring';
import { getEspnConfigStatus } from '@/lib/providers/espn/config';
import { KNOWN_SCORING_GAPS } from '@/lib/scoring/seed-configs';
import { describeRule } from '@/lib/scoring/engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CsvUpload } from '@/components/csv-upload';
import { ManualPlayerEditor } from '@/components/manual-player-editor';
import { RefreshButton } from '@/components/refresh-button';
import { LeagueSettingsForm } from '@/components/league-settings-form';
import { relativeTime, DEFAULT_TIMEZONE, DEFAULT_LOCK_WARNING_MINUTES } from '@/lib/time';
import { getSeasonState } from '@/lib/season';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · Fantasy GM' };

/**
 * Configuration + synchronization status.
 * Credentials are never displayed — only whether each env var is present.
 */
export default async function SettingsPage() {
  const [freshness, options, state, leagues, rosterPlayers] = await Promise.all([
    getFreshness(),
    getLeagueOptions(),
    getSeasonState(),
    prisma.league.findMany({ orderBy: { createdAt: 'asc' }, include: { rosterSlots: { orderBy: { sortOrder: 'asc' } } } }),
    prisma.rosterPlayer.findMany({ include: { player: true }, orderBy: { slot: 'asc' } }),
  ]);

  const configs = await Promise.all(leagues.map((l) => loadScoringConfig(l.id)));
  const espnStatuses = [getEspnConfigStatus('league1'), getEspnConfigStatus('league2')];

  const uniquePlayers = Array.from(
    new Map(rosterPlayers.map((r) => [r.playerId, r.player])).values(),
  ).map((p) => ({ id: p.id, name: p.fullName, injuryStatus: p.injuryStatus, nflTeamAbbr: p.nflTeamAbbr, isManual: p.isManual }));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Season {state.season}, week {state.week} (source: {state.source.toLowerCase()})
          </p>
        </div>
        <RefreshButton label="Refresh everything" />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Synchronization status</h2>
        <Card className="divide-y divide-border">
          {freshness.map((f) => (
            <div key={f.scope} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {f.provider ?? 'no provider'} · {f.lastSuccessAt ? `updated ${relativeTime(f.lastSuccessAt)}` : 'never synced'}
                  {f.itemCount ? ` · ${f.itemCount} records` : ''}
                </p>
                {f.message ? <p className="mt-0.5 text-[11px] text-muted-foreground">{f.message}</p> : null}
              </div>
              <Badge variant={f.status === 'OK' && !f.isStale ? 'good' : f.status === 'FAILED' ? 'critical' : 'watch'}>
                {f.status === 'OK' && f.isStale ? 'STALE' : f.status}
              </Badge>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">ESPN connection</h2>
        {espnStatuses.map((status, idx) => (
          <Card key={status.key} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{options[idx]?.name ?? `League ${idx + 1}`}</h3>
              <Badge variant={status.hasLeagueId && status.hasCookies ? 'good' : 'watch'}>
                {status.hasLeagueId && status.hasCookies ? 'configured' : 'incomplete'}
              </Badge>
            </div>
            <ul className="mt-2 space-y-1 text-[13px]">
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs">{status.envVarMap.leagueId}</code>
                <Badge variant={status.hasLeagueId ? 'good' : 'muted'} size="sm">
                  {status.hasLeagueId ? 'set' : 'missing'}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs">{status.envVarMap.teamId}</code>
                <Badge variant={status.hasTeamId ? 'good' : 'muted'} size="sm">
                  {status.hasTeamId ? 'set' : 'missing'}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs">{status.envVarMap.swid}</code>
                <Badge variant={status.hasCookies ? 'good' : 'muted'} size="sm">
                  {status.hasCookies ? 'set' : 'missing'}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <code className="text-xs">{status.envVarMap.s2}</code>
                <Badge variant={status.hasCookies ? 'good' : 'muted'} size="sm">
                  {status.hasCookies ? 'set' : 'missing'}
                </Badge>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Values live only in the environment and are never stored, logged, or sent to the browser. See README for
              where to find them.
            </p>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Leagues</h2>
        {leagues.map((league, idx) => {
          const config = configs[idx]!;
          const gapKey = league.name.toLowerCase().includes('gibbs') ? 'gibbs' : 'sgih';
          return (
            <Card key={league.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{league.name}</h3>
                <Badge variant={league.isSeeded ? 'watch' : 'good'}>{league.isSeeded ? 'seed data' : 'synced'}</Badge>
                <Badge variant="outline">{config.source} scoring</Badge>
                {league.size === null ? <Badge variant="watch">size unknown</Badge> : <Badge variant="outline">{league.size} teams</Badge>}
              </div>

              <LeagueSettingsForm
                league={{ id: league.id, name: league.name, size: league.size, ppr: league.ppr }}
              />

              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roster slots</h4>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {league.rosterSlots.map((s) => (
                    <Badge key={s.id} variant="outline">
                      {s.slot} ×{s.starters}
                      {s.maxAtPosition ? ` (max ${s.maxAtPosition})` : ''}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ESPN counts IR outside the roster limit in most leagues. These values are confirmed against ESPN on
                  sync; until then they are the seeded settings.
                </p>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Scoring rules ({config.rules.length})
                </summary>
                <ul className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
                  {config.rules.map((rule, i) => (
                    <li key={`${rule.statKey}-${rule.kind}-${i}`} className="text-muted-foreground">
                      {describeRule(rule)}
                    </li>
                  ))}
                </ul>
              </details>

              <div className="mt-3 rounded-lg bg-watch/10 p-3">
                <p className="text-[11px] font-medium text-watch">Not defined by this league — scored as zero</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {(KNOWN_SCORING_GAPS[gapKey] ?? []).map((gap) => (
                    <li key={gap}>• {gap}</li>
                  ))}
                </ul>
              </div>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Manual fallback</h2>
        <ManualPlayerEditor players={uniquePlayers} />
        <CsvUpload />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">App</h2>
        <Card className="p-4 text-[13px]">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-medium">{DEFAULT_TIMEZONE}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">&ldquo;Locking soon&rdquo; threshold</dt>
              <dd className="font-medium">{DEFAULT_LOCK_WARNING_MINUTES} minutes before kickoff</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">NFL data provider</dt>
              <dd className="font-medium">{process.env.NFL_PROVIDER === 'mock' ? 'offline mock' : 'Sleeper'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ask My GM</dt>
              <dd className="font-medium">
                {process.env.ANTHROPIC_API_KEY ? 'AI phrasing enabled' : 'engine phrasing (no API key)'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            These come from environment variables (APP_TIMEZONE, LOCK_WARNING_MINUTES, NFL_PROVIDER, ANTHROPIC_API_KEY).
            Change them in <code className="text-xs">.env.local</code> and restart.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Transactions</h2>
        <Card className="p-4 text-[13px] text-muted-foreground">
          This app never submits waiver claims, trades, drops or lineup changes on your behalf. It tells you exactly
          what to do and you make the move in ESPN. That is deliberate: ESPN&apos;s write endpoints are undocumented,
          and you should stay the final approver of every roster transaction.
        </Card>
      </section>
    </div>
  );
}
