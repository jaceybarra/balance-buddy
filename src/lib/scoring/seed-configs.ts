import type { BonusRule, PerUnitRule, RuleCategory, ScoringRule, TierRule } from './types';
import type { StatKey } from './stats';

/**
 * SEED scoring definitions, transcribed from each league's ESPN settings page.
 *
 * These are the fallback/bootstrap values. A successful ESPN sync REPLACES them
 * (rule rows are written with source = "ESPN"). Ranges the league does not
 * define are simply absent — the engine then scores them as zero and reports
 * them as "unscored" rather than guessing.
 */

const perUnit = (statKey: StatKey, points: number, category: RuleCategory = 'OFFENSE'): PerUnitRule => ({
  kind: 'PER_UNIT',
  statKey,
  points,
  category,
});

const bonus = (
  statKey: StatKey,
  rangeMin: number,
  rangeMax: number | null,
  points: number,
  exclusiveGroup: string,
  category: RuleCategory = 'OFFENSE',
): BonusRule => ({ kind: 'BONUS', statKey, points, rangeMin, rangeMax, exclusiveGroup, category });

const tier = (statKey: StatKey, rangeMin: number, rangeMax: number | null, points: number): TierRule => ({
  kind: 'TIER',
  statKey,
  points,
  rangeMin,
  rangeMax,
  category: 'DST',
});

/** Rules both leagues share verbatim. */
const SHARED_OFFENSE: ScoringRule[] = [
  perUnit('passYards', 0.04),
  perUnit('passTD', 4),
  perUnit('passInt', -2),
  perUnit('pass2pt', 2),
  perUnit('rushYards', 0.1),
  perUnit('rushTD', 6),
  perUnit('rush2pt', 2),
  perUnit('recYards', 0.1),
  perUnit('rec', 0.5), // 0.5 PPR in both leagues
  perUnit('recTD', 6),
  perUnit('rec2pt', 2),
];

const SHARED_KICKING: ScoringRule[] = [
  perUnit('pat', 1, 'KICKING'),
  perUnit('fgMissed', -1, 'KICKING'),
  perUnit('fgMade0_39', 3, 'KICKING'),
  perUnit('fgMade40_49', 4, 'KICKING'),
  perUnit('fgMade50_59', 5, 'KICKING'),
  perUnit('fgMade60Plus', 6, 'KICKING'),
];

const SHARED_DST: ScoringRule[] = [
  perUnit('kickReturnTD', 6, 'DST'),
  perUnit('puntReturnTD', 6, 'DST'),
  perUnit('intReturnTD', 6, 'DST'),
  perUnit('fumbleReturnTD', 6, 'DST'),
  perUnit('blockedKickReturnTD', 6, 'DST'),
  perUnit('twoPtReturn', 2, 'DST'),
  perUnit('onePtSafety', 1, 'DST'),
  perUnit('sacks', 1, 'DST'),
  perUnit('blockedKick', 2, 'DST'),
  perUnit('defInt', 2, 'DST'),
  perUnit('fumRec', 2, 'DST'),
  perUnit('safety', 2, 'DST'),
];

/**
 * Yards-allowed brackets are identical in both leagues.
 * NOTE the intentional gap at 300-349 — the league defines no value there, so
 * it scores 0. Same idea for points allowed 18-27.
 */
const SHARED_YARDS_ALLOWED: ScoringRule[] = [
  tier('yardsAllowed', 0, 99, 5),
  tier('yardsAllowed', 100, 199, 3),
  tier('yardsAllowed', 200, 299, 2),
  tier('yardsAllowed', 350, 399, -1),
  tier('yardsAllowed', 400, 449, -3),
  tier('yardsAllowed', 450, 499, -5),
  tier('yardsAllowed', 500, 549, -6),
  tier('yardsAllowed', 550, null, -7),
];

const SHARED_POINTS_ALLOWED_TAIL: ScoringRule[] = [
  tier('pointsAllowed', 1, 6, 4),
  tier('pointsAllowed', 7, 13, 3),
  tier('pointsAllowed', 14, 17, 1),
  tier('pointsAllowed', 28, 34, -1),
  tier('pointsAllowed', 35, 45, -3),
  tier('pointsAllowed', 46, null, -5),
];

/** Team 1 — "Gibbs Me The Trophy" (12-team, 0.5 PPR, no yardage bonuses). */
export const GIBBS_SCORING_RULES: ScoringRule[] = [
  ...SHARED_OFFENSE,
  ...SHARED_KICKING,
  ...SHARED_DST,
  tier('pointsAllowed', 0, 0, 5), // shutout = 5 here, 6 in the other league
  ...SHARED_POINTS_ALLOWED_TAIL,
  ...SHARED_YARDS_ALLOWED,
];

/**
 * Team 2 — "So Good It Hurts".
 * Big differences: yardage milestone bonuses, missed PAT, fumbles lost,
 * return yardage, and a 6-point shutout.
 */
export const SGIH_SCORING_RULES: ScoringRule[] = [
  ...SHARED_OFFENSE,
  // Milestone bonuses. Each stat forms one exclusive group: a 410-yard passing
  // game pays the 400+ bonus only, never 300-399 as well.
  bonus('passYards', 300, 399, 4, 'passYardsBonus'),
  bonus('passYards', 400, null, 6, 'passYardsBonus'),
  bonus('rushYards', 100, 199, 4, 'rushYardsBonus'),
  bonus('rushYards', 200, null, 6, 'rushYardsBonus'),
  bonus('recYards', 100, 199, 4, 'recYardsBonus'),
  bonus('recYards', 200, null, 6, 'recYardsBonus'),
  // Misc offense that Gibbs does not define.
  perUnit('fumblesLost', -2),
  perUnit('fumbleRecTD', 6),
  perUnit('kickReturnYards', 0.04),
  perUnit('puntReturnYards', 0.04),
  ...SHARED_KICKING,
  perUnit('patMissed', -1, 'KICKING'),
  ...SHARED_DST,
  tier('pointsAllowed', 0, 0, 6),
  ...SHARED_POINTS_ALLOWED_TAIL,
  ...SHARED_YARDS_ALLOWED,
];

/**
 * Stats a league has NO rule for. Surfaced in Settings so the user knows what
 * an ESPN sync still needs to confirm instead of us inventing a value.
 */
export const KNOWN_SCORING_GAPS: Record<string, string[]> = {
  gibbs: [
    'Fumbles lost — not listed on the settings screenshot (ESPN default is -2). Confirm on sync.',
    'Missed PAT — not listed. Confirm on sync.',
    'Points allowed 18-27 and yards allowed 300-349 — no bracket defined, scores 0.',
    'Return yardage — not listed; only return touchdowns score.',
  ],
  sgih: [
    'Points allowed 18-27 and yards allowed 300-349 — no bracket defined, scores 0.',
    'Return-yardage and return-TD rules appear in both the D/ST and Misc sections; they are stored once per stat so nothing double-counts.',
  ],
};
