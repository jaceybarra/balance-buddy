import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getAllContexts } from '@/lib/data/leagues';
import { buildPlayerCards, type PlayerCard as PlayerCardType } from '@/lib/data/context';
import { buildExposureReport } from '@/lib/engine/exposure';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InjuryBadge, LockBadge } from '@/components/player-row';
import { Freshness } from '@/components/freshness';
import { pts } from '@/lib/utils';
import { gameTimeLabel, relativeTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Everything about one player, INCLUDING what he is worth in each of my
 * leagues — the two numbers differ whenever the scoring rules differ.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      providerIds: true,
      injuries: { orderBy: { reportedAt: 'desc' }, take: 6 },
      news: { orderBy: { publishedAt: 'desc' }, take: 6 },
      stats: { orderBy: { week: 'desc' }, take: 6 },
    },
  });
  if (!player) notFound();

  const contexts = await getAllContexts();
  const perLeague: { leagueName: string; leagueId: string; teamName: string | null; card: PlayerCardType | null; owned: boolean; available: boolean }[] = [];

  for (const ctx of contexts) {
    const owned = ctx.all.find((p) => p.id === id) ?? null;
    let card = owned;
    if (!card) {
      const built = await buildPlayerCards([id], ctx.config, ctx.season, ctx.week, new Date(), { leagueId: ctx.league.id });
      card = built[0] ?? null;
    }
    const fa = await prisma.freeAgentSnapshot.findUnique({
      where: { leagueId_playerId: { leagueId: ctx.league.id, playerId: id } },
    });
    perLeague.push({
      leagueName: ctx.league.name,
      leagueId: ctx.league.id,
      teamName: owned ? ctx.team.name : null,
      card,
      owned: Boolean(owned),
      available: fa?.availability === 'FREE_AGENT' || fa?.availability === 'WAIVERS',
    });
  }

  const exposure = buildExposureReport(contexts).entries.find((e) => e.playerId === id) ?? null;
  const primary = perLeague.find((l) => l.card)?.card ?? null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-xs text-primary hover:underline">
          ← Command center
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{player.fullName}</h1>
          <InjuryBadge status={player.injuryStatus as never} />
          {primary ? <LockBadge lock={primary.lock} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {player.position}
          {player.nflTeamAbbr ? ` · ${player.nflTeamAbbr}` : ' · NFL team unknown'}
          {player.depthChartRole ? ` · ${player.depthChartRole}` : ''}
          {player.byeWeek ? ` · bye week ${player.byeWeek}` : ''}
        </p>
        {player.isManual ? <Badge variant="outline">manually entered</Badge> : null}
      </header>

      {primary?.game ? (
        <Card className="p-4">
          <p className="text-sm font-medium">
            {primary.game.isHome ? 'vs' : '@'} {primary.game.opponentAbbr} · {gameTimeLabel(primary.game.kickoff)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {primary.game.slotLabel}
            {primary.game.impliedPoints ? ` · implied team total ${primary.game.impliedPoints.toFixed(1)}` : ''}
            {primary.game.spread !== null ? ` · spread ${primary.game.spread > 0 ? `-${primary.game.spread}` : `+${Math.abs(primary.game.spread)}`}` : ''}
            {primary.game.isInternational ? ' · international game' : ''}
          </p>
        </Card>
      ) : (
        <Card className="border-l-4 border-l-watch p-4 text-sm">
          {player.nflTeamAbbr ? 'On bye this week — projects zero.' : 'No NFL team on file, so no game can be found. Sync ESPN or set his team manually.'}
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projection by league
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {perLeague.map((entry) => (
            <Card key={entry.leagueId} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold">{entry.leagueName}</h3>
                <Badge variant={entry.owned ? 'primary' : entry.available ? 'good' : 'muted'}>
                  {entry.owned ? `on ${entry.teamName}` : entry.available ? 'available' : 'rostered elsewhere'}
                </Badge>
              </div>
              <p className="tabular mt-2 text-3xl font-bold leading-none">{pts(entry.card?.projection?.points)}</p>
              <p className="tabular mt-1 text-xs text-muted-foreground">
                floor {pts(entry.card?.projection?.floor)} · ceiling {pts(entry.card?.projection?.ceiling)} · after injury
                risk {pts(entry.card?.projection?.expected)}
              </p>
              <p className="tabular mt-2 text-xs text-muted-foreground">
                Rest of season: {pts(entry.card?.rosPerGame)}/wk ({pts(entry.card?.rosPoints)} total)
              </p>
              {entry.card && entry.card.bonusUpside > 0 ? (
                <p className="mt-2 text-xs text-primary">
                  This league&apos;s yardage bonus adds {entry.card.bonusUpside} points in his ceiling game.
                </p>
              ) : null}
              {entry.card?.projection ? (
                <Freshness
                  className="mt-2"
                  at={entry.card.projection.updatedAt}
                  source={entry.card.projection.source}
                  prefix="Projection"
                />
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      {primary?.projection?.breakdown?.length ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">How that number is built</h2>
          <p className="text-[11px] text-muted-foreground">
            Projected stat line priced with {perLeague.find((l) => l.card)?.leagueName} scoring.
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {primary.projection.breakdown.map((item) => (
                <tr key={`${item.statKey}-${item.kind}`} className="border-b border-border/40 last:border-0">
                  <td className="py-1 text-muted-foreground">
                    {item.label}
                    {item.note ? <span className="text-[11px]"> ({item.note})</span> : null}
                  </td>
                  <td className="tabular py-1 text-right">{item.value.toFixed(1)}</td>
                  <td className="tabular py-1 text-right font-medium">{item.points.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {primary.projection.unscored.length > 0 ? (
            <p className="mt-2 text-[11px] text-watch">
              Not scored by this league: {primary.projection.unscored.map((u) => u.statKey).join(', ')}. Import the ESPN
              settings to confirm.
            </p>
          ) : null}
        </Card>
      ) : null}

      {primary?.usage ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Usage</h2>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Snap share</dt>
              <dd className="tabular font-medium">
                {primary.usage.snapShare !== null ? `${Math.min(100, Math.round(primary.usage.snapShare * 100))}%` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Targets/gm</dt>
              <dd className="tabular font-medium">{primary.usage.targets ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Carries/gm</dt>
              <dd className="tabular font-medium">{primary.usage.carries ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Red-zone touches</dt>
              <dd className="tabular font-medium">{primary.usage.redZoneTouches ?? '—'}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {exposure ? (
        <Card className="border-l-4 border-l-primary p-4">
          <h2 className="text-sm font-semibold">You own him twice</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{exposure.note}</p>
        </Card>
      ) : null}

      {player.injuries.length > 0 ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Injury history</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {player.injuries.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span>
                  {i.status}
                  {i.detail ? ` — ${i.detail}` : ''}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(i.reportedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {player.news.length > 0 ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">News</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {player.news.map((n) => (
              <li key={n.id}>
                <p className="font-medium">{n.headline}</p>
                {n.interpretation ? <p className="text-[13px] text-muted-foreground">{n.interpretation}</p> : null}
                <p className="text-[11px] text-muted-foreground">
                  {n.source} · {relativeTime(n.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Identity</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Canonical id <code className="text-xs">{player.id}</code> · normalized key{' '}
          <code className="text-xs">{player.normalizedName}</code> · source {player.source}
        </p>
        {player.providerIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {player.providerIds.map((p) => (
              <Badge key={p.id} variant="outline">
                {p.provider}: {p.providerId}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No provider ids linked yet — sync to connect him to ESPN and Sleeper.
          </p>
        )}
      </Card>
    </div>
  );
}
