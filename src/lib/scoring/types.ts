import type { StatKey, StatLine } from './stats';

/** Points awarded for every unit of a stat (0.1 per receiving yard, 6 per TD...). */
export interface PerUnitRule {
  kind: 'PER_UNIT';
  statKey: StatKey;
  points: number;
  category: RuleCategory;
}

/**
 * A flat award when a stat lands inside [min, max]. Bonuses sharing an
 * `exclusiveGroup` are mutually exclusive: only the highest qualifying one pays.
 * (Team 2's 300-399 / 400+ passing bonuses are one such group.)
 */
export interface BonusRule {
  kind: 'BONUS';
  statKey: StatKey;
  points: number;
  rangeMin: number;
  rangeMax: number | null;
  exclusiveGroup: string;
  category: RuleCategory;
}

/**
 * A bracket table (points allowed / yards allowed). Exactly one bracket applies.
 * Values outside every defined bracket score ZERO — we never invent a bracket
 * the league did not define.
 */
export interface TierRule {
  kind: 'TIER';
  statKey: StatKey;
  points: number;
  rangeMin: number;
  rangeMax: number | null;
  category: RuleCategory;
}

export type ScoringRule = PerUnitRule | BonusRule | TierRule;
export type RuleCategory = 'OFFENSE' | 'KICKING' | 'DST';

export interface ScoringConfig {
  leagueId: string;
  leagueName: string;
  /** 0.5 for both of this user's leagues; derived from the `rec` PER_UNIT rule. */
  ppr: number;
  rules: ScoringRule[];
  /** Where the rules came from, for the "manual vs synced" badge. */
  source: string;
}

export interface ScoreLineItem {
  statKey: StatKey;
  label: string;
  value: number;
  points: number;
  kind: ScoringRule['kind'];
  note?: string;
}

export interface ScoreResult {
  points: number;
  breakdown: ScoreLineItem[];
  /** Stats present in the line that this league has no rule for. */
  unscored: { statKey: StatKey; value: number }[];
}

export type { StatLine };
