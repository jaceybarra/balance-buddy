import { prisma } from '../db';
import type { ScoringConfig, ScoringRule, RuleCategory } from '../scoring/types';
import type { StatKey } from '../scoring/stats';

/**
 * Load a league's scoring rules from the database into the engine's config.
 * Rules are per-league rows, so the two leagues can never share a value by
 * accident — which is the whole point of independent scoring engines.
 */
export async function loadScoringConfig(leagueId: string): Promise<ScoringConfig> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { scoringRules: true },
  });

  const rules: ScoringRule[] = league.scoringRules.map((r) => {
    const category = r.category as RuleCategory;
    const statKey = r.statKey as StatKey;
    if (r.kind === 'BONUS') {
      return {
        kind: 'BONUS',
        statKey,
        points: r.points,
        rangeMin: r.rangeMin ?? 0,
        rangeMax: r.rangeMax,
        exclusiveGroup: r.exclusiveGroup ?? `${statKey}Bonus`,
        category,
      };
    }
    if (r.kind === 'TIER') {
      return { kind: 'TIER', statKey, points: r.points, rangeMin: r.rangeMin ?? 0, rangeMax: r.rangeMax, category };
    }
    return { kind: 'PER_UNIT', statKey, points: r.points, category };
  });

  const sources = new Set(league.scoringRules.map((r) => r.source));
  return {
    leagueId: league.id,
    leagueName: league.name,
    ppr: league.ppr,
    rules,
    source: sources.has('ESPN') ? 'ESPN' : sources.has('MANUAL') ? 'MANUAL' : 'SEED',
  };
}

/** Cache per request — a page renders many players against the same config. */
const requestCache = new Map<string, Promise<ScoringConfig>>();

export function loadScoringConfigCached(leagueId: string): Promise<ScoringConfig> {
  const existing = requestCache.get(leagueId);
  if (existing) return existing;
  const promise = loadScoringConfig(leagueId);
  requestCache.set(leagueId, promise);
  // Short TTL so a settings change is picked up quickly in dev.
  setTimeout(() => requestCache.delete(leagueId), 5_000).unref?.();
  return promise;
}
