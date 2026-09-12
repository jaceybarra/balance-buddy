import { prisma } from '@/lib/db';
import { resolveLeague } from '@/lib/data/leagues';
import { buildPlayerCards } from '@/lib/data/context';
import { LeagueSwitcher } from '@/components/league-switcher';
import { TradeAnalyzer } from '@/components/trade-analyzer';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trades · Fantasy GM' };

/** Propose a trade and see what it does to the STARTING LINEUP, not the point totals. */
export default async function TradesPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const { options, ctx } = await resolveLeague(league);

  const rosterIds = new Set(ctx.all.map((p) => p.id));
  const poolRows = await prisma.freeAgentSnapshot.findMany({
    where: { leagueId: ctx.league.id },
    select: { playerId: true },
    take: 220,
  });
  const poolCards = await buildPlayerCards(
    poolRows.map((r) => r.playerId).filter((id) => !rosterIds.has(id)),
    ctx.config,
    ctx.season,
    ctx.week,
    new Date(),
    { leagueId: ctx.league.id },
  );

  const slim = (p: (typeof ctx.all)[number]) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.nflTeamAbbr,
    projected: p.projection?.expected ?? null,
    rosPerGame: p.rosPerGame,
  });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Trade analyzer</h1>
        <LeagueSwitcher leagues={options} active={ctx.league.id} />
      </header>

      <Card className="p-4">
        <p className="text-[13px] text-muted-foreground">
          The verdict is based on how much your <strong>starting lineup</strong> changes — this week and per week for the
          rest of the season — plus what happens to your bench depth. Adding up the traded players&apos; projections is
          not the same question: only one of two RB2s can start.
        </p>
      </Card>

      <TradeAnalyzer
        leagueId={ctx.league.id}
        roster={ctx.all.map(slim)}
        available={poolCards.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          team: p.nflTeamAbbr,
          projected: p.projection?.expected ?? null,
          rosPerGame: p.rosPerGame,
        }))}
      />
    </div>
  );
}
