import { z } from 'zod';

/**
 * Canonical stat keys. Every provider's stat line is normalized into this shape
 * BEFORE it touches a scoring engine, so a league's rules only ever reference
 * keys from this list.
 */
export const STAT_KEYS = [
  // passing
  'passYards',
  'passTD',
  'passInt',
  'pass2pt',
  // rushing
  'rushYards',
  'rushTD',
  'rush2pt',
  // receiving
  'rec',
  'recYards',
  'recTD',
  'rec2pt',
  // misc offense
  'fumblesLost',
  'fumbleRecTD',
  // returns (can be credited to a skill player or a D/ST depending on league)
  'kickReturnYards',
  'puntReturnYards',
  'kickReturnTD',
  'puntReturnTD',
  // kicking
  'pat',
  'patMissed',
  'fgMade0_39',
  'fgMade40_49',
  'fgMade50_59',
  'fgMade60Plus',
  'fgMissed',
  // team defense / special teams
  'sacks',
  'defInt',
  'fumRec',
  'safety',
  'onePtSafety',
  'blockedKick',
  'intReturnTD',
  'fumbleReturnTD',
  'blockedKickReturnTD',
  'twoPtReturn',
  'pointsAllowed',
  'yardsAllowed',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type StatLine = Partial<Record<StatKey, number>>;

export const zStatLine = z
  .object(Object.fromEntries(STAT_KEYS.map((k) => [k, z.number().optional()])) as Record<StatKey, z.ZodOptional<z.ZodNumber>>)
  .partial()
  .strip();

/** Human labels used in score explanations. */
export const STAT_LABEL: Record<StatKey, string> = {
  passYards: 'Passing yards',
  passTD: 'Passing TD',
  passInt: 'Interception thrown',
  pass2pt: '2-pt pass',
  rushYards: 'Rushing yards',
  rushTD: 'Rushing TD',
  rush2pt: '2-pt rush',
  rec: 'Receptions',
  recYards: 'Receiving yards',
  recTD: 'Receiving TD',
  rec2pt: '2-pt reception',
  fumblesLost: 'Fumbles lost',
  fumbleRecTD: 'Fumble recovery TD',
  kickReturnYards: 'Kick return yards',
  puntReturnYards: 'Punt return yards',
  kickReturnTD: 'Kick return TD',
  puntReturnTD: 'Punt return TD',
  pat: 'PAT made',
  patMissed: 'PAT missed',
  fgMade0_39: 'FG 0-39',
  fgMade40_49: 'FG 40-49',
  fgMade50_59: 'FG 50-59',
  fgMade60Plus: 'FG 60+',
  fgMissed: 'FG missed',
  sacks: 'Sacks',
  defInt: 'Defensive INT',
  fumRec: 'Fumble recovery',
  safety: 'Safety',
  onePtSafety: '1-pt safety',
  blockedKick: 'Blocked kick',
  intReturnTD: 'INT return TD',
  fumbleReturnTD: 'Fumble return TD',
  blockedKickReturnTD: 'Blocked kick return TD',
  twoPtReturn: '2-pt return',
  pointsAllowed: 'Points allowed',
  yardsAllowed: 'Yards allowed',
};

/**
 * "Tier" stats are not scored per unit — they select exactly one bracket
 * (e.g. 13 points allowed -> the 7-13 bracket). Never multiply these.
 */
export const TIER_STATS: StatKey[] = ['pointsAllowed', 'yardsAllowed'];

export function emptyStatLine(): StatLine {
  return {};
}

export function addStatLines(a: StatLine, b: StatLine): StatLine {
  const out: StatLine = { ...a };
  for (const key of STAT_KEYS) {
    const bv = b[key];
    if (bv === undefined) continue;
    // Tier stats are per-game facts, not counters — the later value wins.
    out[key] = TIER_STATS.includes(key) ? bv : (out[key] ?? 0) + bv;
  }
  return out;
}

export function scaleStatLine(line: StatLine, factor: number): StatLine {
  const out: StatLine = {};
  for (const key of STAT_KEYS) {
    const v = line[key];
    if (v === undefined) continue;
    // Scaling a tier stat linearly is meaningful (a worse game script allows
    // more points), so tier stats scale too — just never accumulate.
    out[key] = v * factor;
  }
  return out;
}
