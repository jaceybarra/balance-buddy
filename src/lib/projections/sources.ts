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

export function enabledSources(): string[] {
  const raw = process.env.PROJECTION_SOURCES ?? 'baseline,csv,espn';
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
