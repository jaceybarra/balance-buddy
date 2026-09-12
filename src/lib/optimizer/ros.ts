import type { PlayerCard } from '../data/context';
import { optimizeLineup, type SlotDefinition } from './lineup';

/**
 * Value of the best legal lineup using REST-OF-SEASON per-game projections.
 *
 * Used to answer "does this move improve my team over the rest of the season",
 * which is not the same question as "is this player better than the guy he
 * replaces": a great QB behind an already-great QB adds nothing, because only
 * one of them can start.
 */
export function rosLineupValue(roster: PlayerCard[], slots: SlotDefinition[]): number {
  const asRos = roster.map((p) => ({
    ...p,
    // Rest-of-season value is matchup- and bye-neutral by construction.
    onBye: false,
    lock: 'AVAILABLE' as const,
    projection: p.rosPerGame
      ? {
          points: p.rosPerGame,
          floor: p.rosPerGame * 0.7,
          ceiling: p.rosPerGame * 1.4,
          expected: p.rosPerGame,
          playProbability: 1,
          confidence: p.projection?.confidence ?? 0.5,
          source: 'ROS',
          updatedAt: p.projection?.updatedAt ?? null,
          breakdown: [],
          unscored: [],
        }
      : null,
  }));
  return optimizeLineup({ roster: asRos, slots, strategy: 'BALANCED' }).optimalProjected;
}
