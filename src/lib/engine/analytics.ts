import type { LeagueContext, PlayerCard } from '../data/context';
import { optimizeLineup, type SlotDefinition } from '../optimizer/lineup';
import { round1 } from '../scoring/engine';
import type { Position } from '../domain/enums';

export interface RosterMetric {
  key: string;
  label: string;
  value: number;
  /** Formatted for display, e.g. "112.4 pts" or "83%". */
  display: string;
  /** One plain sentence explaining exactly what was measured. */
  explanation: string;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
}

/**
 * Derived roster metrics.
 *
 * Every one of these is a simple, stated calculation — no black-box "power
 * score". If a number cannot be explained in one sentence it does not belong here.
 */
export function buildRosterMetrics(ctx: LeagueContext): RosterMetric[] {
  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const optimal = optimizeLineup({ roster: ctx.all, slots });
  const starterPoints = optimal.assignments.reduce((sum, a) => sum + (a.player?.projection?.expected ?? 0), 0);
  const startingIds = new Set(optimal.assignments.map((a) => a.player?.id).filter(Boolean) as string[]);
  const benchCards = ctx.all.filter((p) => !startingIds.has(p.id) && p.slot !== 'IR');

  const benchDepth = benchCards
    .map((p) => p.rosPerGame ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((s, v) => s + v, 0);

  // injuryFactor, not playProbability — the projection may already price the injury in.
  const floor = optimal.assignments.reduce((sum, a) => sum + (a.player?.projection?.floor ?? 0) * (a.player?.projection?.injuryFactor ?? 1), 0);
  const ceiling = optimal.assignments.reduce((sum, a) => sum + (a.player?.projection?.ceiling ?? 0) * (a.player?.projection?.injuryFactor ?? 1), 0);

  const efficiency = optimal.optimalProjected > 0 ? ctx.starters.reduce((s, p) => s + (p.projection?.expected ?? 0), 0) / optimal.optimalProjected : 1;

  const risky = ctx.starters.filter((p) => ['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR'].includes(p.injuryStatus));
  const injuryRisk = ctx.starters.length
    ? risky.reduce((s, p) => s + (1 - (p.projection?.playProbability ?? 1)) * (p.projection?.points ?? 0), 0)
    : 0;

  const byeCounts = new Map<number, number>();
  for (const p of ctx.all) if (p.byeWeek) byeCounts.set(p.byeWeek, (byeCounts.get(p.byeWeek) ?? 0) + 1);
  const worstBye = [...byeCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return [
    {
      key: 'starterStrength',
      label: 'Starter strength',
      value: round1(starterPoints),
      display: `${round1(starterPoints)} pts`,
      explanation: `Projected points of your best legal lineup this week, in ${ctx.league.name}'s scoring.`,
      tone: starterPoints >= 115 ? 'good' : starterPoints >= 95 ? 'neutral' : 'warn',
    },
    {
      key: 'benchDepth',
      label: 'Bench depth',
      value: round1(benchDepth),
      display: `${round1(benchDepth)} pts/wk`,
      explanation: 'Rest-of-season per-week value of your four best non-starters — what you fall back on after an injury.',
      tone: benchDepth >= 32 ? 'good' : benchDepth >= 20 ? 'neutral' : 'warn',
    },
    {
      key: 'lineupEfficiency',
      label: 'Lineup efficiency',
      value: Math.round(efficiency * 100),
      display: `${Math.round(efficiency * 100)}%`,
      explanation: 'Your current lineup as a share of your optimal lineup. 100% means nothing left on the bench.',
      tone: efficiency >= 0.995 ? 'good' : efficiency >= 0.97 ? 'neutral' : 'bad',
    },
    {
      key: 'weeklyFloor',
      label: 'Weekly floor',
      value: round1(floor),
      display: `${round1(floor)} pts`,
      explanation: 'Sum of each starter’s floor outcome — roughly a bad-but-not-disastrous week.',
      tone: 'neutral',
    },
    {
      key: 'weeklyUpside',
      label: 'Weekly ceiling',
      value: round1(ceiling),
      display: `${round1(ceiling)} pts`,
      explanation: 'Sum of each starter’s ceiling outcome — what a great week looks like.',
      tone: 'neutral',
    },
    {
      key: 'injuryRisk',
      label: 'Injury risk',
      value: round1(injuryRisk),
      display: `${round1(injuryRisk)} pts at risk`,
      explanation: `Projected points held by starters who might not play (${risky.map((p) => p.name).join(', ') || 'none'}).`,
      tone: injuryRisk >= 12 ? 'bad' : injuryRisk >= 5 ? 'warn' : 'good',
    },
    {
      key: 'byeConcentration',
      label: 'Bye concentration',
      value: worstBye?.[1] ?? 0,
      display: worstBye ? `${worstBye[1]} in week ${worstBye[0]}` : 'none',
      explanation: 'The single week where the most of your players are on bye.',
      tone: (worstBye?.[1] ?? 0) >= 5 ? 'warn' : 'good',
    },
  ];
}

/**
 * Expected points above replacement for one player, in this league.
 * Replacement level = the best freely available player at that position,
 * approximated by the weakest current starter league-wide if unknown.
 */
export function pointsAboveReplacement(player: PlayerCard, replacementByPosition: Record<Position, number>): number {
  const replacement = replacementByPosition[player.position] ?? 0;
  return round1((player.projection?.expected ?? 0) - replacement);
}

/** Rough replacement levels by position, used for EPAR and trade math. */
export const DEFAULT_REPLACEMENT_LEVEL: Record<Position, number> = {
  QB: 13,
  RB: 7.5,
  WR: 7,
  TE: 5.5,
  K: 7,
  DST: 6,
};
