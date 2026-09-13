/** Canonical projection source names used in the Projection.source column. */
export const PROJECTION_SOURCES = {
  /** Per-game baseline production profile seeded for each player (model input). */
  PROFILE: 'BASELINE_PROFILE',
  /** Weekly projection produced by the in-app model from the profile. */
  BASELINE: 'BASELINE',
  /** A CSV the user uploaded. */
  CSV: 'CSV',
  /** ESPN's own projection, when a sync provides one. */
  ESPN: 'ESPN',
  /** Blend of every available source. This is what the app shows by default. */
  CONSENSUS: 'CONSENSUS',
  MANUAL: 'MANUAL',
} as const;

export type ProjectionSource = (typeof PROJECTION_SOURCES)[keyof typeof PROJECTION_SOURCES];

/** Projection.week sentinel for a rest-of-season (per-game) row. */
export const ROS_WEEK = 0;
/** Projection.leagueScope value for a league-agnostic projection. */
export const GLOBAL_SCOPE = 'GLOBAL';

/** Usage row marker: week 0 holds the seeded baseline usage profile. */
export const USAGE_BASELINE_WEEK = 0;
export const USAGE_SOURCE = 'SEED_USAGE';

/** Relative trust when blending sources into a consensus. */
export const SOURCE_WEIGHT: Record<string, number> = {
  [PROJECTION_SOURCES.ESPN]: 1.0,
  [PROJECTION_SOURCES.CSV]: 1.1,
  [PROJECTION_SOURCES.BASELINE]: 0.8,
  [PROJECTION_SOURCES.MANUAL]: 1.5,
};

/**
 * Sources that carry REAL numbers — a provider's projection or one a human
 * typed in. The baseline model is not one of them: it is an estimate the app
 * computes when nothing better exists.
 *
 * This distinction is the difference between a recommendation you can act on
 * and a guess dressed up as one, so it is enforced in two places: the consensus
 * never blends an estimate into real data, and the optimizer caps its
 * confidence when only estimates are available.
 */
export const REAL_SOURCES: string[] = [
  PROJECTION_SOURCES.ESPN,
  PROJECTION_SOURCES.CSV,
  PROJECTION_SOURCES.MANUAL,
];

export function isRealSource(source: string): boolean {
  return REAL_SOURCES.includes(source) || source.startsWith(PROJECTION_SOURCES.ESPN);
}

/**
 * Which projection wins when several exist for the same player and week.
 * Higher wins; ties break on recency.
 */
export const SOURCE_RANK: Record<string, number> = {
  [PROJECTION_SOURCES.ESPN]: 100,
  [PROJECTION_SOURCES.MANUAL]: 90,
  [PROJECTION_SOURCES.CSV]: 80,
  [PROJECTION_SOURCES.CONSENSUS]: 70,
  [PROJECTION_SOURCES.BASELINE]: 10,
  [PROJECTION_SOURCES.PROFILE]: 0,
};

export function sourceRank(source: string): number {
  return SOURCE_RANK[source] ?? 50;
}

export function enabledSources(): string[] {
  const raw = process.env.PROJECTION_SOURCES ?? 'baseline,csv,espn';
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
