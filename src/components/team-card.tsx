import Link from 'next/link';
import { ChevronRight, Activity, CalendarX, ShieldAlert, Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NoActionBadge } from '@/components/priority';
import { Freshness } from '@/components/freshness';
import { pts } from '@/lib/utils';
import type { TeamSummary } from '@/lib/data/dashboard';

/**
 * One of my teams, summarized for a three-second read.
 * The number that matters most — how many things need me — is the biggest thing
 * on the card.
 */
export function TeamCard({ summary }: { summary: TeamSummary }) {
  const { ctx } = summary;
  const matchup = ctx.matchup;
  const waiverCount = summary.actions.filter((a) => a.type === 'WAIVER').length;
  const lineupCount = summary.actions.filter((a) => a.type === 'LINEUP').length;

  return (
    <Card className="overflow-hidden">
      <Link href={`/team/${ctx.team.id}`} className="block p-4 transition-colors hover:bg-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{ctx.team.name}</h3>
            <p className="text-xs text-muted-foreground">
              {ctx.team.record} · {ctx.league.size ? `${ctx.league.size}-team` : 'league size unknown'} · {ctx.league.ppr} PPR
              {ctx.league.isSeeded ? ' · seeded' : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {summary.actionCount > 0 ? (
              <Badge variant={summary.criticalCount > 0 ? 'critical' : 'action'}>
                {summary.actionCount} action{summary.actionCount === 1 ? '' : 's'}
              </Badge>
            ) : (
              <NoActionBadge />
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
        </div>

        {matchup ? (
          <div className="mt-4 grid grid-cols-3 items-end gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projected</p>
              <p className="tabular text-2xl font-semibold leading-none">{pts(matchup.myProjected)}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Win prob</p>
              <p className="tabular text-lg font-medium leading-none">{Math.round(matchup.winProbability * 100)}%</p>
            </div>
            <div className="text-right">
              <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{matchup.opponentName}</p>
              <p className="tabular text-2xl font-semibold leading-none text-muted-foreground">
                {pts(matchup.opponentProjected)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
          <Stat icon={Activity} label={`${summary.lockedCount} locked`} />
          {summary.injuredStarters > 0 ? (
            <Stat icon={ShieldAlert} label={`${summary.injuredStarters} injury flag${summary.injuredStarters === 1 ? '' : 's'}`} tone="watch" />
          ) : null}
          {summary.byeStarters > 0 ? (
            <Stat icon={CalendarX} label={`${summary.byeStarters} on bye in your lineup`} tone="critical" />
          ) : null}
          {ctx.openBenchSlots > 0 ? <Stat icon={Inbox} label={`${ctx.openBenchSlots} open roster spot`} /> : null}
          {lineupCount > 0 ? <Stat label={`${lineupCount} lineup change${lineupCount === 1 ? '' : 's'}`} tone="action" /> : null}
          {waiverCount > 0 ? <Stat label={`${waiverCount} waiver target${waiverCount === 1 ? '' : 's'}`} /> : null}
        </div>

        <Freshness
          className="mt-3"
          at={ctx.league.lastSyncAt}
          source={ctx.league.isSeeded ? 'seed snapshot' : ctx.league.provider}
          prefix="League data"
          stale={ctx.league.isSeeded}
        />
      </Link>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  tone,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: 'watch' | 'critical' | 'action';
}) {
  const toneClass = tone === 'critical' ? 'text-critical' : tone === 'watch' ? 'text-watch' : tone === 'action' ? 'text-action' : '';
  return (
    <span className={`inline-flex items-center gap-1 ${toneClass}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </span>
  );
}
