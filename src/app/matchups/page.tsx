import Link from 'next/link';
import { getAllContexts } from '@/lib/data/leagues';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '@/lib/optimizer/lineup';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PlayerRow } from '@/components/player-row';
import { pts } from '@/lib/utils';
import { gameTimeLabel } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matchups · Fantasy GM' };

/** This week's matchup for each team, with the strategy it implies. */
export default async function MatchupsPage() {
  const contexts = await getAllContexts();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Matchups</h1>
        <p className="text-sm text-muted-foreground">Week {contexts[0]?.week ?? '-'} · both teams</p>
      </header>

      {contexts.map((ctx) => {
        const slots: SlotDefinition[] = ctx.slots.map((s) => ({
          slot: s.slot,
          starters: s.starters,
          eligible: s.eligible,
          sortOrder: s.sortOrder,
        }));
        const { rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
        const lineup = optimizeLineup({ roster: ctx.all, slots });

        const byUpside = [...ctx.starters].sort(
          (a, b) => (b.projection?.ceiling ?? 0) - (b.projection?.points ?? 0) - ((a.projection?.ceiling ?? 0) - (a.projection?.points ?? 0)),
        );
        const risks = ctx.starters
          .filter((p) => p.onBye || !['HEALTHY', 'UNKNOWN'].includes(p.injuryStatus) || (p.projection?.floor ?? 0) < 3)
          .slice(0, 3);
        const remaining = ctx.starters.filter((p) => p.lock === 'AVAILABLE' || p.lock === 'LOCKING_SOON');

        return (
          <Card key={ctx.league.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{ctx.team.name}</h2>
                <p className="text-xs text-muted-foreground">{ctx.league.name}</p>
              </div>
              <Link href={`/team/${ctx.team.id}`} className="shrink-0 text-xs text-primary hover:underline">
                Team →
              </Link>
            </div>

            {ctx.matchup ? (
              <>
                <div className="mt-4 grid grid-cols-3 items-end gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">You</p>
                    <p className="tabular text-3xl font-bold leading-none">{pts(ctx.matchup.myProjected)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Win prob</p>
                    <p className="tabular text-lg font-semibold">{Math.round(ctx.matchup.winProbability * 100)}%</p>
                    <Progress
                      value={ctx.matchup.winProbability}
                      tone={ctx.matchup.winProbability >= 0.6 ? 'good' : ctx.matchup.winProbability >= 0.4 ? 'watch' : 'critical'}
                      className="mt-1"
                    />
                  </div>
                  <div className="text-right">
                    <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                      {ctx.matchup.opponentName}
                    </p>
                    <p className="tabular text-3xl font-bold leading-none text-muted-foreground">
                      {pts(ctx.matchup.opponentProjected)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium">Strategy</p>
                  <p className="text-sm text-muted-foreground">{rationale}</p>
                  {lineup.improvement > 0.1 ? (
                    <p className="mt-1 text-sm text-good">
                      Optimizing your lineup adds {pts(lineup.improvement)} points —{' '}
                      <Link href={`/lineup?league=${ctx.league.id}`} className="underline">
                        see the moves
                      </Link>
                      .
                    </p>
                  ) : null}
                  {ctx.matchup.opponentIsEstimated ? (
                    <p className="mt-1 text-[11px] text-watch">
                      ⚠ Opponent total is an estimate until ESPN sync provides their roster.
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Biggest advantages
                    </h3>
                    <div className="mt-1">
                      {byUpside.slice(0, 3).map((p) => (
                        <PlayerRow key={p.id} player={p} slotLabel={p.slot ?? ''} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Biggest risks</h3>
                    <div className="mt-1">
                      {risks.length === 0 ? (
                        <p className="py-3 text-sm text-muted-foreground">No obvious risk in this lineup.</p>
                      ) : (
                        risks.map((p) => <PlayerRow key={p.id} player={p} slotLabel={p.slot ?? ''} />)
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {remaining.length} starter{remaining.length === 1 ? '' : 's'} yet to play
                  </h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {remaining.map((p) => (
                      <Badge key={p.id} variant={p.lock === 'LOCKING_SOON' ? 'watch' : 'outline'}>
                        {p.name} · {p.game ? gameTimeLabel(p.game.kickoff) : 'bye'}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No matchup found for this week.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
