import Link from 'next/link';
import { resolveLeague } from '@/lib/data/leagues';
import { optimizeLineup, strategyForMatchup, lineupShuffles, type SlotDefinition } from '@/lib/optimizer/lineup';
import { LeagueSwitcher } from '@/components/league-switcher';
import { StartSitCompare } from '@/components/start-sit-compare';
import { PlayerRow } from '@/components/player-row';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from '@/components/confidence';
import { NoActionBadge } from '@/components/priority';
import { pts, signedPts } from '@/lib/utils';
import { gameTimeLabel } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lineup · Fantasy GM' };

/** Current lineup vs the optimizer's, with the exact moves to close the gap. */
export default async function LineupPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const { options, ctx } = await resolveLeague(league);

  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const { strategy, rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
  const result = optimizeLineup({ roster: ctx.all, slots, strategy });
  const shuffles = lineupShuffles(result);
  const comparable = ctx.all.filter((p) => p.slot !== 'IR');

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Lineup optimizer</h1>
        <LeagueSwitcher leagues={options} active={ctx.league.id} />
      </header>

      <Card className="p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current lineup</p>
            <p className="tabular text-2xl font-bold leading-none">{pts(result.currentProjected)}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Available</p>
            <p className={`tabular text-xl font-semibold ${result.improvement > 0.1 ? 'text-good' : 'text-muted-foreground'}`}>
              {signedPts(result.improvement)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Optimal</p>
            <p className="tabular text-2xl font-bold leading-none text-primary">{pts(result.optimalProjected)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{rationale}</p>
        <Badge variant="outline" className="mt-2">
          strategy: {strategy.toLowerCase()}
        </Badge>
      </Card>

      {result.swaps.length === 0 ? (
        <Card className="border-l-4 border-l-good p-4">
          <NoActionBadge />
          <p className="mt-2 text-sm">
            {ctx.team.name} is already starting its best legal lineup for week {ctx.week}.
          </p>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recommended changes</h2>
          {result.swaps.map((swap) => (
            <Card key={`${swap.in.id}-${swap.out?.id ?? 'none'}`} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={swap.tooClose ? 'watch' : 'action'}>
                  {swap.tooClose ? 'Coin flip' : `Start ${swap.in.name}`}
                </Badge>
                <span className="text-xs text-muted-foreground">{swap.slot}</span>
                <span className="tabular ml-auto text-sm font-semibold text-good">{signedPts(swap.gain)}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-good/10 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended</p>
                  <p className="font-medium">{swap.in.name}</p>
                  <p className="tabular text-sm">{pts(swap.in.projection?.expected)} projected</p>
                  <p className="text-[11px] text-muted-foreground">
                    {swap.in.game ? `${swap.in.game.isHome ? 'vs' : '@'} ${swap.in.game.opponentAbbr} · ${gameTimeLabel(swap.in.game.kickoff)}` : 'no game'}
                  </p>
                </div>
                {swap.out ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current</p>
                    <p className="font-medium">{swap.out.name}</p>
                    <p className="tabular text-sm">{pts(swap.out.projection?.expected)} projected</p>
                    <p className="text-[11px] text-muted-foreground">
                      {swap.out.game ? `${swap.out.game.isHome ? 'vs' : '@'} ${swap.out.game.opponentAbbr} · ${gameTimeLabel(swap.out.game.kickoff)}` : 'no game'}
                    </p>
                  </div>
                ) : null}
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">{swap.reason}.</p>
              <ConfidenceMeter value={swap.confidence} className="mt-3" />
            </Card>
          ))}
        </section>
      )}

      <Card>
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold">Optimal lineup</h2>
          <span className="tabular text-xs text-muted-foreground">{pts(result.optimalProjected)}</span>
        </div>
        <div className="px-4 pb-3">
          {result.assignments.map((a) =>
            a.player ? (
              <PlayerRow
                key={`${a.slot}-${a.slotIndex}`}
                player={a.player}
                slotLabel={a.slot}
                highlight={a.current && a.current.id !== a.player.id ? 'in' : null}
              />
            ) : (
              <div key={`${a.slot}-${a.slotIndex}`} className="flex items-center gap-3 border-b border-border/50 py-2.5">
                <span className="w-10 text-[11px] font-semibold uppercase text-muted-foreground">{a.slot}</span>
                <span className="text-sm text-critical">No legal option available</span>
              </div>
            ),
          )}
        </div>
        {shuffles.length > 0 ? (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            Slot shuffles (same players): {shuffles.map((s) => `${s.player.name} ${s.from}→${s.to}`).join(', ')}
          </p>
        ) : null}
        {result.notes.length > 0 ? (
          <p className="px-4 pb-3 text-[11px] text-watch">{result.notes.join(' ')}</p>
        ) : null}
        {result.lockedPlayers.length > 0 ? (
          <p className="px-4 pb-4 text-[11px] text-muted-foreground">
            Locked (game started, cannot be moved): {result.lockedPlayers.join(', ')}
          </p>
        ) : null}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Start/sit assistant</h2>
        <p className="text-xs text-muted-foreground">
          Tap any players to compare them in {ctx.league.name} scoring.
        </p>
        <StartSitCompare players={comparable} strategy={strategy} />
      </section>

      <Link href={`/team/${ctx.team.id}`} className="inline-block text-xs text-primary hover:underline">
        ← Back to {ctx.team.name}
      </Link>
    </div>
  );
}
