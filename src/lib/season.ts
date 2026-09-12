import { prisma } from './db';

export interface SeasonState {
  season: number;
  week: number;
  /** Where the answer came from: never a hardcoded constant in a component. */
  source: 'PROVIDER' | 'SCHEDULE' | 'FALLBACK';
  /** First kickoff of the current week, if known. */
  weekStart: Date | null;
  /** Last kickoff of the current week, if known. */
  weekEnd: Date | null;
  seasonType: 'REGULAR' | 'POST' | 'OFF';
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; value: SeasonState } | null = null;

/**
 * Determine the current NFL season + week from DATA, never from a constant.
 *
 * Priority:
 *   1. A provider-reported state cached in AppSetting ("nfl.state"), e.g. Sleeper.
 *   2. Derivation from the NFLGame table: the earliest week that still has a
 *      game which has not finished. (Handles Tuesday rollover naturally.)
 *   3. A conservative fallback so pages still render on an empty database.
 */
export async function getSeasonState(now: Date = new Date(), useCache = true): Promise<SeasonState> {
  if (useCache && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const providerState = await readProviderState(now);
  if (providerState) {
    const withWindow = await attachWindow(providerState);
    cache = { at: Date.now(), value: withWindow };
    return withWindow;
  }

  const derived = await deriveFromSchedule(now);
  if (derived) {
    cache = { at: Date.now(), value: derived };
    return derived;
  }

  const fallback: SeasonState = {
    season: Number(process.env.SEASON ?? new Date().getUTCFullYear()),
    week: 1,
    source: 'FALLBACK',
    weekStart: null,
    weekEnd: null,
    seasonType: 'REGULAR',
  };
  cache = { at: Date.now(), value: fallback };
  return fallback;
}

export function invalidateSeasonCache(): void {
  cache = null;
}

async function readProviderState(now: Date): Promise<SeasonState | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'nfl.state' } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.valueJson) as { season?: number; week?: number; seasonType?: string; fetchedAt?: string };
    if (!parsed.season || !parsed.week) return null;
    // Provider state older than 24h is not trusted over the schedule.
    if (parsed.fetchedAt && now.getTime() - new Date(parsed.fetchedAt).getTime() > 86_400_000) return null;
    return {
      season: parsed.season,
      week: parsed.week,
      source: 'PROVIDER',
      weekStart: null,
      weekEnd: null,
      seasonType: parsed.seasonType === 'post' ? 'POST' : 'REGULAR',
    };
  } catch {
    return null;
  }
}

async function attachWindow(state: SeasonState): Promise<SeasonState> {
  const agg = await prisma.nFLGame.aggregate({
    where: { season: state.season, week: state.week },
    _min: { kickoff: true },
    _max: { kickoff: true },
  });
  return { ...state, weekStart: agg._min.kickoff ?? null, weekEnd: agg._max.kickoff ?? null };
}

async function deriveFromSchedule(now: Date): Promise<SeasonState | null> {
  const latestSeason = await prisma.nFLGame.aggregate({ _max: { season: true } });
  const season = latestSeason._max.season;
  if (!season) return null;

  // The current week is the earliest week with a game that has not finished.
  // A game is "not finished" if its status says so, or if kickoff is still
  // within the last ~4.5 hours (it is probably in progress).
  const liveCutoff = new Date(now.getTime() - 4.5 * 3600_000);
  const pending = await prisma.nFLGame.findFirst({
    where: {
      season,
      OR: [{ status: { in: ['SCHEDULED', 'IN_PROGRESS', 'POSTPONED'] } }, { kickoff: { gt: liveCutoff } }],
    },
    orderBy: [{ week: 'asc' }, { kickoff: 'asc' }],
  });

  const week = pending?.week ?? (await prisma.nFLGame.aggregate({ where: { season }, _max: { week: true } }))._max.week ?? 1;

  const agg = await prisma.nFLGame.aggregate({
    where: { season, week },
    _min: { kickoff: true },
    _max: { kickoff: true },
  });

  return {
    season,
    week,
    source: 'SCHEDULE',
    weekStart: agg._min.kickoff ?? null,
    weekEnd: agg._max.kickoff ?? null,
    seasonType: week > 18 ? 'POST' : 'REGULAR',
  };
}
