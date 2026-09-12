import type { StatKey } from '../../scoring/stats';

/**
 * ESPN statId -> canonical stat key.
 *
 * ESPN's fantasy API is UNDOCUMENTED. This table is community-derived and is
 * treated as best-effort: ids we cannot map are reported back in the sync
 * result (`unmapped`) and surfaced in Settings for manual confirmation. We
 * never guess a value for an id we don't recognize, and we never overwrite a
 * confirmed manual rule with a low-confidence mapping.
 */
export const ESPN_STAT_MAP: Record<number, StatKey> = {
  3: 'passYards',
  4: 'passTD',
  19: 'pass2pt',
  20: 'passInt',
  24: 'rushYards',
  25: 'rushTD',
  26: 'rush2pt',
  42: 'recYards',
  43: 'recTD',
  44: 'rec2pt',
  53: 'rec',
  68: 'fumblesLost',
  72: 'fumbleRecTD',
  // kicking
  74: 'fgMade0_39',
  77: 'fgMade40_49',
  80: 'fgMade50_59',
  81: 'fgMade60Plus',
  85: 'fgMissed',
  86: 'pat',
  88: 'patMissed',
  // team defense / special teams
  93: 'blockedKickReturnTD',
  95: 'defInt',
  96: 'fumRec',
  97: 'blockedKick',
  98: 'safety',
  99: 'sacks',
  101: 'kickReturnTD',
  102: 'puntReturnTD',
  103: 'intReturnTD',
  104: 'fumbleReturnTD',
  105: 'twoPtReturn',
  201: 'kickReturnYards',
  202: 'puntReturnYards',
};

/** ESPN statId -> a points-allowed bracket (min/max inclusive). */
export const ESPN_POINTS_ALLOWED_TIERS: Record<number, { min: number; max: number | null }> = {
  89: { min: 0, max: 0 },
  90: { min: 1, max: 6 },
  91: { min: 7, max: 13 },
  92: { min: 14, max: 17 },
  123: { min: 18, max: 21 },
  124: { min: 22, max: 27 },
  125: { min: 28, max: 34 },
  126: { min: 35, max: 45 },
  127: { min: 46, max: null },
};

/** ESPN statId -> a yards-allowed bracket. */
export const ESPN_YARDS_ALLOWED_TIERS: Record<number, { min: number; max: number | null }> = {
  128: { min: 0, max: 99 },
  129: { min: 100, max: 199 },
  130: { min: 200, max: 299 },
  131: { min: 300, max: 349 },
  132: { min: 350, max: 399 },
  133: { min: 400, max: 449 },
  134: { min: 450, max: 499 },
  135: { min: 500, max: 549 },
  136: { min: 550, max: null },
};

/** ESPN lineupSlotId -> our roster slot. Undefined ids are treated as BENCH. */
export const ESPN_SLOT_MAP: Record<number, string> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'DST',
  17: 'K',
  20: 'BENCH',
  21: 'IR',
  23: 'FLEX',
};

/** ESPN defaultPositionId -> our position. */
export const ESPN_POSITION_MAP: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
};

/** ESPN injuryStatus strings -> our canonical status. */
export const ESPN_INJURY_MAP: Record<string, string> = {
  ACTIVE: 'HEALTHY',
  NORMAL: 'HEALTHY',
  QUESTIONABLE: 'QUESTIONABLE',
  DOUBTFUL: 'DOUBTFUL',
  OUT: 'OUT',
  INJURY_RESERVE: 'IR',
  IR: 'IR',
  PHYSICALLY_UNABLE_TO_PERFORM: 'PUP',
  SUSPENSION: 'SUSPENDED',
  DAY_TO_DAY: 'QUESTIONABLE',
};
