import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { buildLeagueContext } from '@/lib/data/context';
import { toActionView } from '@/lib/data/dashboard';
import { buildRosterMetrics } from '@/lib/engine/analytics';
import { optimizeLineup, strategyForMatchup, lineupShuffles, type SlotDefinition } from '@/lib/optimizer/lineup';
import { ActionCard } from '@/components/action-card';
import { PlayerRow } from '@/components/player-row';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NoActionBadge } from '@/components/priority';
import { Freshness } from '@/components/freshness';
import { pts, signedPts } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await prisma.fantasyTeam.findUnique({ where: { id }, select: { leagueId: true, name: true } });
  if (!team) notFound();

  const ctx = await buildLeagueContext(team.leagueId);
  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const { strategy, rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
  const lineup = optimizeLineup({ roster: ctx.all, slots, strategy });
  const shuffles = lineupShuffles(lineup);
  const metrics = buildRosterMetrics(ctx);

  const actions = (
    await prisma.action.findMany({
      where: { leagueId: ctx.league.id, status: 'OPEN' },
      include: { league: { select: { name: true } } },
      orderBy: [{ severity: 'asc' }, { deadline: 'asc' }],
    })
  ).map(toActionView);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-xs text-primary hover:underline">
          ← Command center
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.team.name}</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.league.name} · {ctx.team.record} · {ctx.league.size ? `${ctx.league.size} teams` : 'size unknown'} ·{' '}
          {ctx.league.ppr} PPR · Week {ctx.week}
        </p>
      </header>

      {ctx.matchup ? (
        <Card className="p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">You</p>
              <p className="tabular text-3xl font-bold leading-none">{pts(ctx.matchup.myProjected)}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Win probability</p>
              <p className="tabular text-xl font-semibold">{Math.round(ctx.matchup.winProbability * 100)}%</p>
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
          <p className="mt-3 text-sm text-muted-foreground">{rationale}</p>
          {ctx.matchup.opponentIsEstimated ? (
            <p className="mt-1 text-[11px] text-watch">
              ⚠ The opponent total is an estimate. Sync ESPN to score their actual roster.
            </p>
          ) : null}
          <Link href="/matchups" className="mt-2 inline-block text-xs text-primary hover:underline">
            Full matchup analysis →
          </Link>
        </Card>
      ) : null}

      {actions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {actions.length} thing{actions.length === 1 ? '' : 's'} to handle
          </h2>
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </section>
      ) : (
        <Card className="border-l-4 border-l-good p-4">
          <NoActionBadge />
          <p className="mt-2 text-sm">This lineup looks optimized. Nothing to do here.</p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold">Starters</h2>
          <span className="tabular text-xs text-muted-foreground">
            {pts(lineup.currentProjected)} projected
            {lineup.improvement > 0.1 ? ` · ${signedPts(lineup.improvement)} available` : ' · optimal'}
          </span>
        </div>
        <div className="px-4 pb-3">
          {ctx.starters.map((player) => (
            <PlayerRow key={player.id} player={player} slotLabel={player.slot ?? ''} />
          ))}
        </div>
        {shuffles.length > 0 ? (
          <p className="px-4 pb-3 text-[11px] text-muted-foreground">
            Optimal lineup also shifts {shuffles.map((s) => `${s.player.name} ${s.from}→${s.to}`).join(', ')} — same
            players, different slots.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold">Bench</h2>
          <span className="text-xs text-muted-foreground">
            {ctx.bench.length} player{ctx.bench.length === 1 ? '' : 's'}
            {ctx.openBenchSlots > 0 ? ` · ${ctx.openBenchSlots} open` : ''}
          </span>
        </div>
        <div className="px-4 pb-3">
          {ctx.bench.map((player) => (
            <PlayerRow key={player.id} player={player} slotLabel="BN" />
          ))}
          {ctx.openBenchSlots > 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              {ctx.openBenchSlots} empty bench slot{ctx.openBenchSlots === 1 ? '' : 's'} —{' '}
              <Link href="/waivers" className="text-primary hover:underline">
                find someone
              </Link>
            </p>
          ) : null}
        </div>
      </Card>

      {ctx.ir.length > 0 ? (
        <Card>
          <div className="p-4 pb-2">
            <h2 className="text-sm font-semibold">Injured reserve</h2>
          </div>
          <div className="px-4 pb-3">
            {ctx.ir.map((player) => (
              <PlayerRow key={player.id} player={player} slotLabel="IR" />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Roster analytics</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {metrics.map((m) => (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span
                  className={`tabular text-sm font-semibold ${
                    m.tone === 'good' ? 'text-good' : m.tone === 'warn' ? 'text-watch' : m.tone === 'bad' ? 'text-critical' : ''
                  }`}
                >
                  {m.display}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">{m.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">League scoring</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">{ctx.league.ppr} PPR</Badge>
          {ctx.config.rules
            .filter((r) => r.kind === 'BONUS')
            .map((r) => (
              <Badge key={`${r.statKey}-${r.rangeMin}`} variant="primary">
                {r.statKey} {r.rangeMin}+ = {r.points}
              </Badge>
            ))}
          <Badge variant={ctx.config.source === 'ESPN' ? 'good' : 'watch'}>
            {ctx.config.source === 'ESPN' ? 'synced from ESPN' : `${ctx.config.source.toLowerCase()} settings`}
          </Badge>
        </div>
        <Link href="/settings" className="mt-2 inline-block text-xs text-primary hover:underline">
          Review scoring settings →
        </Link>
      </Card>

      <Freshness at={ctx.league.lastSyncAt} source={ctx.league.isSeeded ? 'seed snapshot' : 'ESPN'} stale={ctx.league.isSeeded} />
    </div>
  );
}
