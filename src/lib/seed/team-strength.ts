/**
 * Seeded team ratings (0-100, 50 = league average).
 *
 * These drive three things: Vegas-style implied totals in the seeded schedule,
 * the matchup adjustment applied to projections, and the D/ST streaming model.
 * They are a starting point, clearly labeled SEED, and are meant to be replaced
 * by real market data (or a provider's DVOA-style numbers) later.
 */
export interface TeamRating {
  offense: number;
  defense: number;
  /** Defensive strength split — higher = harder to throw/run on. */
  passDefense: number;
  rushDefense: number;
  /** Pass-rush pressure, feeds the D/ST sack model. */
  passRush: number;
  /** How often the offense turns it over (higher = more giveaways). */
  giveaways: number;
  /** Pace/plays per game proxy. */
  pace: number;
}

export const TEAM_RATINGS: Record<string, TeamRating> = {
  ARI: { offense: 51, defense: 45, passDefense: 44, rushDefense: 47, passRush: 46, giveaways: 52, pace: 53 },
  ATL: { offense: 57, defense: 47, passDefense: 46, rushDefense: 50, passRush: 44, giveaways: 50, pace: 49 },
  BAL: { offense: 71, defense: 68, passDefense: 66, rushDefense: 71, passRush: 70, giveaways: 41, pace: 55 },
  BUF: { offense: 72, defense: 58, passDefense: 57, rushDefense: 59, passRush: 60, giveaways: 40, pace: 58 },
  CAR: { offense: 43, defense: 41, passDefense: 42, rushDefense: 39, passRush: 43, giveaways: 58, pace: 48 },
  CHI: { offense: 54, defense: 55, passDefense: 56, rushDefense: 53, passRush: 54, giveaways: 51, pace: 52 },
  CIN: { offense: 66, defense: 44, passDefense: 43, rushDefense: 45, passRush: 47, giveaways: 46, pace: 57 },
  CLE: { offense: 42, defense: 62, passDefense: 61, rushDefense: 62, passRush: 68, giveaways: 57, pace: 47 },
  DAL: { offense: 58, defense: 48, passDefense: 49, rushDefense: 46, passRush: 55, giveaways: 49, pace: 54 },
  DEN: { offense: 56, defense: 73, passDefense: 74, rushDefense: 68, passRush: 76, giveaways: 48, pace: 51 },
  DET: { offense: 74, defense: 54, passDefense: 52, rushDefense: 57, passRush: 56, giveaways: 43, pace: 60 },
  GB: { offense: 65, defense: 61, passDefense: 60, rushDefense: 62, passRush: 62, giveaways: 45, pace: 53 },
  HOU: { offense: 59, defense: 69, passDefense: 70, rushDefense: 65, passRush: 72, giveaways: 47, pace: 52 },
  IND: { offense: 57, defense: 49, passDefense: 47, rushDefense: 53, passRush: 50, giveaways: 52, pace: 55 },
  JAX: { offense: 52, defense: 52, passDefense: 55, rushDefense: 48, passRush: 51, giveaways: 55, pace: 53 },
  KC: { offense: 68, defense: 64, passDefense: 65, rushDefense: 61, passRush: 63, giveaways: 42, pace: 54 },
  LAC: { offense: 58, defense: 66, passDefense: 68, rushDefense: 60, passRush: 58, giveaways: 44, pace: 47 },
  LAR: { offense: 64, defense: 56, passDefense: 54, rushDefense: 58, passRush: 66, giveaways: 46, pace: 52 },
  LV: { offense: 47, defense: 46, passDefense: 45, rushDefense: 44, passRush: 57, giveaways: 54, pace: 50 },
  MIA: { offense: 53, defense: 50, passDefense: 52, rushDefense: 45, passRush: 52, giveaways: 51, pace: 56 },
  MIN: { offense: 60, defense: 63, passDefense: 62, rushDefense: 63, passRush: 67, giveaways: 50, pace: 54 },
  NE: { offense: 55, defense: 57, passDefense: 58, rushDefense: 55, passRush: 53, giveaways: 49, pace: 51 },
  NO: { offense: 46, defense: 48, passDefense: 47, rushDefense: 50, passRush: 48, giveaways: 53, pace: 50 },
  NYG: { offense: 49, defense: 53, passDefense: 51, rushDefense: 56, passRush: 65, giveaways: 56, pace: 51 },
  NYJ: { offense: 48, defense: 58, passDefense: 60, rushDefense: 54, passRush: 56, giveaways: 55, pace: 50 },
  PHI: { offense: 70, defense: 67, passDefense: 66, rushDefense: 69, passRush: 69, giveaways: 42, pace: 53 },
  PIT: { offense: 51, defense: 65, passDefense: 63, rushDefense: 67, passRush: 71, giveaways: 47, pace: 46 },
  SEA: { offense: 58, defense: 60, passDefense: 61, rushDefense: 57, passRush: 61, giveaways: 48, pace: 55 },
  SF: { offense: 67, defense: 59, passDefense: 58, rushDefense: 60, passRush: 59, giveaways: 44, pace: 56 },
  TB: { offense: 63, defense: 51, passDefense: 50, rushDefense: 52, passRush: 54, giveaways: 47, pace: 55 },
  TEN: { offense: 45, defense: 47, passDefense: 48, rushDefense: 43, passRush: 49, giveaways: 57, pace: 49 },
  WSH: { offense: 62, defense: 49, passDefense: 48, rushDefense: 51, passRush: 50, giveaways: 45, pace: 57 },
};

export const LEAGUE_AVERAGE_RATING: TeamRating = {
  offense: 57, defense: 56, passDefense: 55, rushDefense: 55, passRush: 57, giveaways: 49, pace: 52,
};

export function ratingFor(abbr: string | null | undefined): TeamRating {
  if (!abbr) return LEAGUE_AVERAGE_RATING;
  return TEAM_RATINGS[abbr] ?? LEAGUE_AVERAGE_RATING;
}
