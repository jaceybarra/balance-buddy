import 'server-only';
import { prisma } from '../db';
import { getNflProvider, getFallbackNflProvider } from '../providers/nfl';
import { EspnProvider } from '../providers/espn/provider';
import { redact } from '../providers/espn/config';
import { resolvePlayer, findPlayerIdByProvider } from '../identity/resolve';
import { recordInjuryChange } from './news';
import { finishSync, startSync } from '../data/freshness';
import { generateProjections } from '../projections/generate';
import { PROJECTION_SOURCES, ROS_WEEK } from '../projections/sources';
import { regenerateActions } from './actions';
import { getSeasonState, invalidateSeasonCache } from '../season';
import { canonicalTeamAbbr } from '../seed/nfl-teams';
import type { DataScope, InjuryStatus, Position, RosterSlot } from '../domain/enums';
import type { ScoringRule } from '../scoring/types';
import { stringify } from '../json';

export interface SyncStepResult {
  scope: DataScope;
  provider: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  itemCount: number;
  message: string;
}

/**
 * All synchronization goes through here.
 *
 * Contract: a step may FAIL, but it must never throw out of this module. A
 * failed step leaves the previously stored data in place, records why, and the
 * UI shows it as stale rather than empty. That is what keeps the app useful
 * when ESPN changes an endpoint on a Sunday morning.
 */
async function runStep(
  scope: DataScope,
  provider: string,
  fn: () => Promise<{ count: number; message?: string; partial?: boolean }>,
  scopeKey?: string,
): Promise<SyncStepResult> {
  const id = await startSync(scope, provider, scopeKey);
  try {
    const { count, message, partial } = await fn();
    const status = partial ? 'PARTIAL' : 'OK';
    await finishSync(id, status, count, message);
    return { scope, provider, status, itemCount: count, message: message ?? `${count} records` };
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err));
    await finishSync(id, 'FAILED', 0, message);
    return { scope, provider, status: 'FAILED', itemCount: 0, message };
  }
}

// ---------------------------------------------------------------- NFL data

export async function syncNflPlayers(): Promise<SyncStepResult> {
  const provider = getNflProvider();
  return runStep('NFL_PLAYERS', provider.name, async () => {
    let res;
    try {
      res = await provider.getPlayers();
    } catch (err) {
      // Degrade to the offline provider rather than leaving the app dataless.
      const fallback = getFallbackNflProvider();
      res = await fallback.getPlayers();
      const detail = err instanceof Error ? err.message : 'unknown error';
      const count = await upsertPlayers(res.data, fallback.name);
      return { count, message: `Live provider failed (${detail}); served seeded data.`, partial: true };
    }
    const count = await upsertPlayers(res.data, provider.name);
    return { count, message: `${count} players from ${provider.name}` };
  });
}

async function upsertPlayers(
  records: { providerPlayerId: string; fullName: string; position: Position | null; nflTeamAbbr: string | null; injuryStatus: InjuryStatus | null; injuryDetail: string | null; depthChartOrder: number | null; depthChartRole: string | null; age: number | null; jersey: string | null; espnId?: string | null }[],
  providerName: string,
): Promise<number> {
  // Only touch players we actually care about: anyone already in the database
  // (rosters + free-agent pool). Importing all ~11k NFL players would bloat
  // SQLite for no benefit in a personal app.
  const known = await prisma.player.findMany({ select: { id: true, normalizedName: true, position: true, injuryStatus: true, fullName: true } });
  const knownKeys = new Set(known.map((p) => `${p.normalizedName}:${p.position}`));
  const { identityKey } = await import('../identity/normalize');

  let count = 0;
  for (const record of records) {
    if (!record.position) continue;
    const key = `${identityKey(record.fullName, record.position, record.nflTeamAbbr)}:${record.position}`;
    if (!knownKeys.has(key)) continue;

    const before = known.find((p) => `${p.normalizedName}:${p.position}` === key);
    const playerId = await resolvePlayer({
      provider: providerName,
      providerId: record.providerPlayerId,
      fullName: record.fullName,
      position: record.position,
      nflTeamAbbr: record.nflTeamAbbr,
      injuryStatus: record.injuryStatus ?? 'HEALTHY',
      injuryDetail: record.injuryDetail,
      depthChartOrder: record.depthChartOrder,
      depthChartRole: record.depthChartRole,
      age: record.age,
      jersey: record.jersey,
      crossIds: record.espnId ? [{ provider: 'ESPN', providerId: record.espnId }] : [],
    });

    const newStatus = record.injuryStatus ?? 'HEALTHY';
    if (before && before.injuryStatus !== newStatus) {
      await recordInjuryChange({
        playerId,
        playerName: record.fullName,
        from: before.injuryStatus,
        to: newStatus,
        detail: record.injuryDetail,
        source: providerName,
      });
    }
    count++;
  }
  return count;
}

export async function syncNflState(): Promise<SyncStepResult> {
  const provider = getNflProvider();
  return runStep('NFL_SCHEDULE', provider.name, async () => {
    const res = await provider.getState();
    if (!res.data.week) return { count: 0, message: 'Provider reported no week; week derived from the schedule.', partial: true };
    await prisma.appSetting.upsert({
      where: { key: 'nfl.state' },
      create: { key: 'nfl.state', valueJson: stringify({ ...res.data, fetchedAt: new Date().toISOString() }) },
      update: { valueJson: stringify({ ...res.data, fetchedAt: new Date().toISOString() }) },
    });
    invalidateSeasonCache();
    return { count: 1, message: `Season ${res.data.season}, week ${res.data.week} per ${provider.name}` };
  });
}

export async function syncTrending(): Promise<SyncStepResult> {
  const provider = getNflProvider();
  return runStep('FREE_AGENTS', provider.name, async () => {
    const res = await provider.getTrending();
    let count = 0;
    for (const row of res.data) {
      const playerId = await findPlayerIdByProvider(provider.name, row.providerPlayerId);
      if (!playerId) continue;
      await prisma.freeAgentSnapshot.updateMany({ where: { playerId }, data: { trendingAdds: row.adds } });
      count++;
    }
    return { count, message: `${count} trending players matched to the pool` };
  });
}

// ------------------------------------------------------------- ESPN leagues

export async function syncEspnLeague(leagueId: string): Promise<SyncStepResult> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });
  const key = (league.credentialRefKey as 'league1' | 'league2' | null) ?? 'league1';
  const provider = new EspnProvider(key, league.season);

  return runStep(
    'ESPN_LEAGUE',
    'ESPN',
    async () => {
      if (!provider.isConfigured()) {
        return {
          count: 0,
          message: `Not configured. Set ${provider.missingConfig.join(', ')} in .env.local, then sync again. Seeded data is still in use.`,
          partial: true,
        };
      }

      const notes: string[] = [];
      let touched = 0;

      // --- league settings + size (this is how League 2's size gets filled in)
      const leagueRes = await provider.getLeague();
      await prisma.league.update({
        where: { id: leagueId },
        data: {
          name: leagueRes.data.name || league.name,
          size: leagueRes.data.size ?? league.size,
          format: leagueRes.data.format || league.format,
          regularSeasonWeeks: leagueRes.data.regularSeasonWeeks ?? league.regularSeasonWeeks,
          playoffStartWeek: leagueRes.data.playoffStartWeek ?? league.playoffStartWeek,
          providerLeagueId: leagueRes.data.providerLeagueId,
          isSeeded: false,
          lastSyncAt: new Date(),
        },
      });
      touched++;

      // --- roster configuration. ESPN counts IR outside roster size, so we
      //     store what ESPN reports and flag a mismatch instead of assuming.
      if (leagueRes.data.rosterSlots.length > 0) {
        for (const slot of leagueRes.data.rosterSlots) {
          await prisma.rosterSlotConfig.updateMany({
            where: { leagueId, slot: slot.slot },
            data: { starters: slot.starters, maxAtPosition: slot.maxAtPosition, source: 'ESPN' },
          });
        }
        notes.push(`roster configuration confirmed from ESPN (${leagueRes.data.rosterSlots.length} slots)`);
      }

      // --- scoring settings
      const scoring = await provider.getScoringSettings();
      if (scoring.data.rules.length > 0) {
        await applyScoringRules(leagueId, scoring.data.rules);
        notes.push(`${scoring.data.rules.length} scoring rules imported`);
      }
      if (scoring.data.unmapped.length > 0) {
        notes.push(
          `${scoring.data.unmapped.length} ESPN scoring items could not be mapped confidently and were NOT applied (ids ${scoring.data.unmapped
            .map((u) => u.id)
            .slice(0, 8)
            .join(', ')}). Confirm them in Settings.`,
        );
      }

      // --- teams
      const teams = await provider.getTeams();
      const myProviderTeamId = process.env[key === 'league1' ? 'ESPN_TEAM_1_ID' : 'ESPN_TEAM_2_ID'] ?? null;
      for (const team of teams.data) {
        const isMine = myProviderTeamId ? team.providerTeamId === myProviderTeamId : false;
        const existing = await prisma.fantasyTeam.findFirst({
          where: { leagueId, OR: [{ providerTeamId: team.providerTeamId }, ...(isMine ? [{ isMine: true }] : [])] },
        });
        const data = {
          name: team.name,
          abbrev: team.abbrev,
          ownerName: team.ownerName,
          providerTeamId: team.providerTeamId,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pointsFor: team.pointsFor,
          pointsAgainst: team.pointsAgainst,
          standing: team.standing,
          logoUrl: team.logoUrl,
          isSeeded: false,
          lastSyncAt: new Date(),
        };
        if (existing) {
          await prisma.fantasyTeam.update({ where: { id: existing.id }, data: { ...data, isMine: isMine || existing.isMine } });
        } else {
          await prisma.fantasyTeam.create({ data: { ...data, leagueId, isMine } });
        }
        touched++;
      }

      // --- my roster becomes authoritative
      const state = await getSeasonState();
      const mine = await prisma.fantasyTeam.findFirst({ where: { leagueId, isMine: true } });
      if (mine?.providerTeamId) {
        const roster = await provider.getRoster(mine.providerTeamId, state.week);
        if (roster.data.length > 0) {
          await applyRoster(mine.id, roster.data);
          notes.push(`${roster.data.length} roster spots synced`);
          touched += roster.data.length;

          // ESPN's own projections, already priced in THIS league's settings.
          // They outrank the app's internal model everywhere, which is what
          // keeps the numbers identical to what the user sees on ESPN.
          const projectionCount = await storeEspnProjections(
            leagueId,
            league.season,
            state.week,
            roster.data.map((r) => r.player),
          );
          if (projectionCount > 0) notes.push(`${projectionCount} ESPN projections`);
        }
      }

      // --- free agents
      try {
        const fas = await provider.getFreeAgents(state.week, 150);
        let faCount = 0;
        for (const fa of fas.data) {
          if (!fa.position) continue;
          const playerId = await resolvePlayer({
            provider: 'ESPN',
            providerId: fa.providerPlayerId,
            fullName: fa.fullName,
            position: fa.position,
            nflTeamAbbr: fa.nflTeamAbbr,
            injuryStatus: fa.injuryStatus ?? 'HEALTHY',
            eligiblePositions: fa.eligiblePositions,
          });
          if (fa.projectedPoints != null || fa.seasonProjectedPoints != null) {
            await storeEspnProjections(leagueId, league.season, state.week, [{ ...fa, providerPlayerId: fa.providerPlayerId }]);
          }
          await prisma.freeAgentSnapshot.upsert({
            where: { leagueId_playerId: { leagueId, playerId } },
            create: {
              leagueId,
              playerId,
              availability: fa.availability,
              percentOwned: fa.percentOwned ?? null,
              percentStarted: fa.percentStarted ?? null,
              waiverClearsAt: fa.waiverClearsAt,
              source: 'ESPN',
            },
            update: {
              availability: fa.availability,
              percentOwned: fa.percentOwned ?? null,
              percentStarted: fa.percentStarted ?? null,
              waiverClearsAt: fa.waiverClearsAt,
              capturedAt: new Date(),
              source: 'ESPN',
            },
          });
          faCount++;
        }
        // Anyone on my roster is by definition not a free agent here.
        const rosterIds = await prisma.rosterPlayer.findMany({ where: { team: { leagueId } }, select: { playerId: true } });
        await prisma.freeAgentSnapshot.updateMany({
          where: { leagueId, playerId: { in: rosterIds.map((r) => r.playerId) } },
          data: { availability: 'ROSTERED' },
        });
        notes.push(`${faCount} free agents`);
      } catch (err) {
        notes.push(`free-agent pool unavailable (${redact(err instanceof Error ? err.message : 'error')}); kept previous pool`);
      }

      // --- matchups
      try {
        const matchups = await provider.getMatchup(state.week);
        for (const m of matchups.data) {
          const home = await prisma.fantasyTeam.findFirst({ where: { leagueId, providerTeamId: m.homeProviderTeamId } });
          const away = m.awayProviderTeamId
            ? await prisma.fantasyTeam.findFirst({ where: { leagueId, providerTeamId: m.awayProviderTeamId } })
            : null;
          if (!home || !away) continue;
          await prisma.matchup.upsert({
            where: { leagueId_season_week_homeTeamId: { leagueId, season: league.season, week: m.week, homeTeamId: home.id } },
            create: {
              leagueId,
              season: league.season,
              week: m.week,
              homeTeamId: home.id,
              awayTeamId: away.id,
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              homeProjected: m.homeProjected,
              awayProjected: m.awayProjected,
              isPlayoff: m.isPlayoff,
              source: 'ESPN',
            },
            update: {
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              homeProjected: m.homeProjected,
              awayProjected: m.awayProjected,
              source: 'ESPN',
            },
          });
        }
        notes.push(`${matchups.data.length} matchups`);
      } catch (err) {
        notes.push(`matchups unavailable (${redact(err instanceof Error ? err.message : 'error')})`);
      }

      return { count: touched, message: notes.join('; ') };
    },
    leagueId,
  );
}

/**
 * Persist ESPN's projections as league-scoped rows.
 *
 * They are stored as POINTS rather than a stat line because ESPN has already
 * applied this league's scoring — reverse-engineering a stat line to match
 * would be inventing detail the provider never gave us. Floor and ceiling are
 * derived around that mean and labeled as modeled.
 */
async function storeEspnProjections(
  leagueId: string,
  season: number,
  week: number,
  players: { providerPlayerId: string; projectedPoints?: number | null; seasonProjectedPoints?: number | null }[],
): Promise<number> {
  let count = 0;
  for (const player of players) {
    const playerId = await findPlayerIdByProvider('ESPN', player.providerPlayerId);
    if (!playerId) continue;

    if (player.projectedPoints != null) {
      await prisma.projection.upsert({
        where: {
          playerId_season_week_source_leagueScope: { playerId, season, week, source: PROJECTION_SOURCES.ESPN, leagueScope: leagueId },
        },
        create: {
          playerId,
          season,
          week,
          source: PROJECTION_SOURCES.ESPN,
          leagueScope: leagueId,
          leagueId,
          statLineJson: '{}',
          providerPoints: player.projectedPoints,
          confidence: 0.8,
        },
        update: { providerPoints: player.projectedPoints, confidence: 0.8 },
      });
      count++;
    }

    // Season projection -> a real rest-of-season per-game number, which is what
    // drop and trade decisions are judged on.
    if (player.seasonProjectedPoints != null) {
      const gamesLeft = Math.max(1, 18 - week + 1);
      await prisma.projection.upsert({
        where: {
          playerId_season_week_source_leagueScope: {
            playerId,
            season,
            week: ROS_WEEK,
            source: PROJECTION_SOURCES.ESPN,
            leagueScope: leagueId,
          },
        },
        create: {
          playerId,
          season,
          week: ROS_WEEK,
          source: PROJECTION_SOURCES.ESPN,
          leagueScope: leagueId,
          leagueId,
          statLineJson: '{}',
          providerPoints: Math.round((player.seasonProjectedPoints / gamesLeft) * 100) / 100,
          confidence: 0.7,
        },
        update: {
          providerPoints: Math.round((player.seasonProjectedPoints / gamesLeft) * 100) / 100,
          confidence: 0.7,
        },
      });
    }
  }
  return count;
}

/** Replace a league's scoring rules with provider-supplied ones. */
async function applyScoringRules(leagueId: string, rules: ScoringRule[]): Promise<void> {
  // Manual overrides the user entered are preserved.
  await prisma.leagueScoringRule.deleteMany({ where: { leagueId, source: { not: 'MANUAL' } } });
  for (const rule of rules) {
    await prisma.leagueScoringRule.upsert({
      where: {
        leagueId_statKey_kind_rangeMin_rangeMax: {
          leagueId,
          statKey: rule.statKey,
          kind: rule.kind,
          rangeMin: 'rangeMin' in rule ? rule.rangeMin : (null as unknown as number),
          rangeMax: 'rangeMax' in rule ? (rule.rangeMax as number) : (null as unknown as number),
        },
      },
      create: {
        leagueId,
        statKey: rule.statKey,
        kind: rule.kind,
        points: rule.points,
        rangeMin: 'rangeMin' in rule ? rule.rangeMin : null,
        rangeMax: 'rangeMax' in rule ? rule.rangeMax : null,
        exclusiveGroup: 'exclusiveGroup' in rule ? rule.exclusiveGroup : null,
        category: rule.category,
        source: 'ESPN',
      },
      update: { points: rule.points, source: 'ESPN' },
    });
  }
}

/** The synced ESPN roster becomes authoritative. */
async function applyRoster(teamId: string, entries: { player: { providerPlayerId: string; fullName: string; position: Position | null; nflTeamAbbr: string | null; injuryStatus: InjuryStatus | null; eligiblePositions: Position[] }; slot: RosterSlot; acquisitionType?: string | null }[]): Promise<void> {
  const keepIds: string[] = [];
  const slotCounters = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.player.position) continue;
    const playerId = await resolvePlayer({
      provider: 'ESPN',
      providerId: entry.player.providerPlayerId,
      fullName: entry.player.fullName,
      position: entry.player.position,
      nflTeamAbbr: entry.player.nflTeamAbbr,
      injuryStatus: entry.player.injuryStatus ?? 'HEALTHY',
      eligiblePositions: entry.player.eligiblePositions,
    });
    const index = slotCounters.get(entry.slot) ?? 0;
    slotCounters.set(entry.slot, index + 1);

    await prisma.rosterPlayer.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      create: {
        teamId,
        playerId,
        slot: entry.slot,
        slotIndex: index,
        acquisitionType: entry.acquisitionType ?? 'SEED',
        source: 'ESPN',
        isManual: false,
      },
      update: { slot: entry.slot, slotIndex: index, source: 'ESPN', isManual: false },
    });
    keepIds.push(playerId);
  }

  // Players no longer on the ESPN roster are removed (unless manually pinned).
  await prisma.rosterPlayer.deleteMany({ where: { teamId, playerId: { notIn: keepIds }, isManual: false } });
}

// -------------------------------------------------------------- orchestration

export interface RefreshResult {
  steps: SyncStepResult[];
  season: number;
  week: number;
  actions: { created: number; updated: number; expired: number };
  projections: { weekly: number; ros: number; consensus: number };
  durationMs: number;
}

/**
 * "Refresh Everything" — the button on the dashboard and the target of the
 * cron jobs. Order matters: identity and schedule first, then league data,
 * then projections, then the recommendation engines that consume all of it.
 */
export async function refreshEverything(options: { skipEspn?: boolean } = {}): Promise<RefreshResult> {
  const startedAt = Date.now();
  const steps: SyncStepResult[] = [];

  steps.push(await syncNflState());
  steps.push(await syncNflPlayers());
  steps.push(await syncTrending());

  if (!options.skipEspn) {
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const league of leagues) {
      steps.push(await syncEspnLeague(league.id));
    }
  }

  invalidateSeasonCache();
  const state = await getSeasonState(new Date(), false);

  const projectionStep = await runStep('PROJECTIONS', 'BASELINE', async () => {
    const res = await generateProjections(state.season, state.week);
    return { count: res.weekly, message: `${res.weekly} weekly, ${res.ros} ROS, ${res.consensus} consensus` };
  });
  steps.push(projectionStep);

  let actions = { created: 0, updated: 0, expired: 0 };
  const engineStep = await runStep('ENGINE', 'INTERNAL', async () => {
    actions = await regenerateActions();
    return { count: actions.created + actions.updated, message: `${actions.created} new, ${actions.updated} updated, ${actions.expired} expired` };
  });
  steps.push(engineStep);

  return {
    steps,
    season: state.season,
    week: state.week,
    actions,
    projections: { weekly: 0, ros: 0, consensus: 0 },
    durationMs: Date.now() - startedAt,
  };
}

export { canonicalTeamAbbr };
