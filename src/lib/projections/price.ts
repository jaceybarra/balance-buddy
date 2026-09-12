import { scoreStatLine, round2 } from '../scoring/engine';
import type { ScoringConfig } from '../scoring/types';
import type { StatLine } from '../scoring/stats';
import type { InjuryStatus } from '../domain/enums';
import { PLAY_PROBABILITY } from '../domain/enums';

export interface PricedProjection {
  /** Points if the player is active. */
  points: number;
  floor: number;
  ceiling: number;
  /** points x probability he actually plays — what the optimizer sorts on. */
  expected: number;
  playProbability: number;
  /** 0..1 */
  confidence: number;
  source: string;
  updatedAt: Date | null;
  /** Per-stat contribution, for the "why this number" panel. */
  breakdown: ReturnType<typeof scoreStatLine>['breakdown'];
  /** Stats this league has no rule for (surfaced, never silently dropped). */
  unscored: ReturnType<typeof scoreStatLine>['unscored'];
}

/**
 * Convert a projected stat line into LEAGUE-SPECIFIC points.
 *
 * This is the step that makes the same player worth different amounts in the
 * two leagues: the yardage bonuses in "So Good It Hurts" only fire when the
 * projected (or ceiling) stat line crosses 100 yards.
 */
export function priceProjection(args: {
  statLine: StatLine;
  floorStatLine?: StatLine | null;
  ceilingStatLine?: StatLine | null;
  config: ScoringConfig;
  injuryStatus: InjuryStatus;
  confidence: number;
  source: string;
  updatedAt?: Date | null;
  /** Points a provider computed in THEIR scoring. Used only as a last resort. */
  providerPoints?: number | null;
}): PricedProjection {
  const main = scoreStatLine(args.statLine, args.config);

  // A points-only source (e.g. a CSV with no stat columns) cannot be re-priced
  // for this league. We use the number as given and say so, rather than
  // pretending the league's scoring was applied.
  if (main.points === 0 && main.breakdown.length === 0 && args.providerPoints != null) {
    const playProb = PLAY_PROBABILITY[args.injuryStatus] ?? 0.9;
    return {
      points: round2(args.providerPoints),
      floor: round2(args.providerPoints * 0.62),
      ceiling: round2(args.providerPoints * 1.45),
      expected: round2(args.providerPoints * playProb),
      playProbability: playProb,
      // Lower confidence: these points were not computed in this league's rules.
      confidence: Math.min(args.confidence, 0.45),
      source: `${args.source} (points as provided)`,
      updatedAt: args.updatedAt ?? null,
      breakdown: [],
      unscored: [],
    };
  }
  const floor = args.floorStatLine ? scoreStatLine(args.floorStatLine, args.config).points : round2(main.points * 0.6);
  const ceiling = args.ceilingStatLine ? scoreStatLine(args.ceilingStatLine, args.config).points : round2(main.points * 1.45);
  const playProbability = PLAY_PROBABILITY[args.injuryStatus] ?? 0.9;

  return {
    points: main.points,
    floor: round2(floor),
    ceiling: round2(ceiling),
    expected: round2(main.points * playProbability),
    playProbability,
    confidence: args.confidence,
    source: args.source,
    updatedAt: args.updatedAt ?? null,
    breakdown: main.breakdown,
    unscored: main.unscored,
  };
}

/**
 * Does a league's bonus structure meaningfully change this player's value?
 * Used for copy like "he's the better start in So Good It Hurts".
 */
export function bonusUpside(statLine: StatLine, ceilingStatLine: StatLine | null, config: ScoringConfig): number {
  if (!ceilingStatLine) return 0;
  const base = scoreStatLine(statLine, config);
  const ceil = scoreStatLine(ceilingStatLine, config);
  const baseBonus = base.breakdown.filter((b) => b.kind === 'BONUS').reduce((s, b) => s + b.points, 0);
  const ceilBonus = ceil.breakdown.filter((b) => b.kind === 'BONUS').reduce((s, b) => s + b.points, 0);
  return round2(ceilBonus - baseBonus);
}
