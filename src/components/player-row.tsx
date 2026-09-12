import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn, pts } from '@/lib/utils';
import { gameTimeLabel } from '@/lib/time';
import type { PlayerCard } from '@/lib/data/context';
import type { InjuryStatus, LockState } from '@/lib/domain/enums';

const INJURY_VARIANT: Record<InjuryStatus, 'good' | 'watch' | 'critical' | 'muted'> = {
  HEALTHY: 'good',
  UNKNOWN: 'muted',
  QUESTIONABLE: 'watch',
  DOUBTFUL: 'watch',
  OUT: 'critical',
  IR: 'critical',
  PUP: 'critical',
  SUSPENDED: 'critical',
};

const INJURY_SHORT: Record<InjuryStatus, string> = {
  HEALTHY: '',
  UNKNOWN: '?',
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  OUT: 'OUT',
  IR: 'IR',
  PUP: 'PUP',
  SUSPENDED: 'SUS',
};

export function InjuryBadge({ status }: { status: InjuryStatus }) {
  if (status === 'HEALTHY' || status === 'UNKNOWN') return null;
  return (
    <Badge variant={INJURY_VARIANT[status]} size="sm">
      {INJURY_SHORT[status]}
    </Badge>
  );
}

export function LockBadge({ lock }: { lock: LockState }) {
  if (lock === 'AVAILABLE') return null;
  return (
    <Badge variant={lock === 'LOCKED' ? 'muted' : 'watch'} size="sm">
      {lock === 'LOCKED' ? 'Locked' : 'Locks soon'}
    </Badge>
  );
}

/**
 * One roster line. Dense enough to scan a whole lineup on a phone, with the
 * projection, the game, and any status flag visible without tapping.
 */
export function PlayerRow({
  player,
  slotLabel,
  highlight,
  trailing,
}: {
  player: PlayerCard;
  slotLabel?: string;
  highlight?: 'in' | 'out' | null;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0',
        highlight === 'in' && 'bg-good/10',
        highlight === 'out' && 'bg-critical/10',
      )}
    >
      {slotLabel ? (
        <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {slotLabel}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <Link href={`/players/${player.id}`} className="flex flex-wrap items-center gap-1.5 hover:underline">
          <span className="truncate text-sm font-medium">{player.name}</span>
          <InjuryBadge status={player.injuryStatus} />
          <LockBadge lock={player.lock} />
          {player.isManual ? (
            <Badge variant="outline" size="sm">
              manual
            </Badge>
          ) : null}
        </Link>
        <p className="truncate text-[11px] text-muted-foreground">
          {player.position}
          {player.nflTeamAbbr ? ` · ${player.nflTeamAbbr}` : ' · team unknown'}
          {player.onBye ? ' · BYE' : player.game ? ` · ${player.game.isHome ? 'vs' : '@'} ${player.game.opponentAbbr} ${gameTimeLabel(player.game.kickoff)}` : ''}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="tabular text-sm font-semibold">{pts(player.projection?.expected)}</p>
        {player.projection ? (
          <p className="tabular text-[10px] text-muted-foreground">
            {pts(player.projection.floor)}–{pts(player.projection.ceiling)}
          </p>
        ) : null}
      </div>

      {trailing}
    </div>
  );
}
