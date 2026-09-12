import Link from 'next/link';
import { resolveLeague } from '@/lib/data/leagues';
import { buildWaiverReport, rosterUpgrades, droppablePlayers } from '@/lib/engine/waivers';
import { buildStreamerReports } from '@/lib/engine/streamers';
import { LeagueSwitcher } from '@/components/league-switcher';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerRow } from '@/components/player-row';
import { pts, signedPts } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Waivers · Fantasy GM' };

const PRIORITY_VARIANT = { HIGH: 'critical', MEDIUM: 'action', LOW: 'muted', SPECULATIVE: 'watch' } as const;

/** Waiver targets, roster upgrades and streamers for one league. */
export default async function WaiversPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const { options, ctx } = await resolveLeague(league);

  const report = await buildWaiverReport(ctx, 10);
  const upgrades = rosterUpgrades(ctx, report);
  const streamers = await buildStreamerReports(ctx);
  const droppable = droppablePlayers(ctx).slice(0, 3);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Waiver wire</h1>
        <LeagueSwitcher leagues={options} active={ctx.league.id} />
        <p className="text-sm text-muted-foreground">
          Week {ctx.week} · only players actually available in {ctx.league.name}
          {ctx.openBenchSlots > 0 ? ` · ${ctx.openBenchSlots} open roster spot${ctx.openBenchSlots === 1 ? '' : 's'}` : ''}
        </p>
      </header>

      {report.weaknesses.length > 0 ? (
        <Card className="border-l-4 border-l-watch p-4">
          <h2 className="text-sm font-semibold">Where this roster is thin</h2>
          <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {report.weaknesses.map((w) => (
              <li key={w.position}>• {w.note}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ranked targets</h2>
        {report.candidates.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Nothing available in this league beats what you already roster.
          </Card>
        ) : (
          report.candidates.map((candidate, idx) => (
            <Card key={candidate.player.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-xs text-muted-foreground">#{idx + 1}</span>
                <Badge variant={PRIORITY_VARIANT[candidate.priority]}>{candidate.priority}</Badge>
                <Link href={`/players/${candidate.player.id}`} className="text-sm font-semibold hover:underline">
                  {candidate.player.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {candidate.player.position}
                  {candidate.player.nflTeamAbbr ? ` · ${candidate.player.nflTeamAbbr}` : ''}
                  {candidate.player.percentOwned !== null ? ` · ${Math.round(candidate.player.percentOwned)}% rostered` : ''}
                </span>
                <span className="tabular ml-auto text-sm font-semibold">{pts(candidate.player.projection?.expected)}</span>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-good/10 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Add</p>
                  <p className="font-medium">{candidate.player.name}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Drop</p>
                  <p className="font-medium">
                    {candidate.dropCandidate?.name ?? 'Nobody — you have an open spot'}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[13px] text-muted-foreground">{candidate.reason}</p>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">This week</dt>
                  <dd className="tabular font-medium">{signedPts(candidate.lineupGain)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rest of season</dt>
                  <dd className="tabular font-medium">{signedPts(candidate.rosGain)}/wk</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ceiling</dt>
                  <dd className="tabular font-medium">{pts(candidate.player.projection?.ceiling)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Score</dt>
                  <dd className="tabular font-medium">{candidate.score}</dd>
                </div>
              </dl>
            </Card>
          ))
        )}
      </section>

      {upgrades.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Roster improvement scan</h2>
          {upgrades.map((upgrade) => (
            <Card key={upgrade.drop.id} className="p-4">
              <p className="text-sm">{upgrade.note}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {upgrade.betterOptions.map((o) => (
                  <Badge key={o.player.id} variant="outline">
                    {o.player.name} {signedPts(o.rosGain)}/wk
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Streamers</h2>
        {streamers.map((report) => (
          <Card key={report.position} className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{report.position}</h3>
              <Badge variant={report.holdSteady ? 'good' : 'action'}>{report.holdSteady ? 'HOLD' : 'STREAM'}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{report.recommendation ?? 'No option available.'}</p>
            {report.options.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {report.options.slice(0, 3).map((o) => (
                  <li key={o.player.id} className="flex items-center justify-between gap-2">
                    <span>{o.player.name}</span>
                    <span className="tabular text-muted-foreground">
                      {pts(o.projected)} ({signedPts(o.gain)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </section>

      <Card>
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold">Easiest drops</h2>
          <p className="text-[11px] text-muted-foreground">
            Ranked by rest-of-season value, with ceiling and handcuff value protected.
          </p>
        </div>
        <div className="px-4 pb-3">
          {droppable.map((player) => (
            <PlayerRow key={player.id} player={player} slotLabel="BN" />
          ))}
        </div>
      </Card>
    </div>
  );
}
