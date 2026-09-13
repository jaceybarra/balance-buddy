import { prisma } from '../db';
import { getSeasonState } from '../season';
import { loadScoringConfigCached } from './scoring';
import { priceProjection, bonusUpside, type PricedProjection } from '../projections/price';
import { GLOBAL_SCOPE, PROJECTION_SOURCES, ROS_WEEK, USAGE_BASELINE_WEEK, isRealSource, sourceRank } from '../projections/sources';
import { parseJson, zStringArray } from '../json';
import { zStatLine, type StatLine } from '../scoring/stats';
import { lockState, DEFAULT_LOCK_WARNING_MINUTES, kickoffSlot } from '../time';
import type { InjuryStatus, LockState, Position, RosterSlot } from '../domain/enums';
import type { ScoringConfig } from '../scoring/types';
import { REGULAR_SEASON_WEEKS } from '../seed/schedule';

export interface GameInfo {
  id: string;
  kickoff: Date;
  opponentAbbr: string;
  isHome: boolean;
  status: string;
  spread: number | null;
  overUnder: number | null;
  impliedPoints: number | null;
  opponentImplied: number | null;
  slotLabel: string;
  isInternational: boolean;
}

export interface UsageInfo {
  snapShare: number | null;
  targets: number | null;
  carries: number | null;
  redZoneTouches: number | null;
}

export interface PlayerCard {
  id: string;
  rosterPlayerId: string | null;
  name: string;
  position: Position;
  eligiblePositions: Position[];
  nflTeamAbbr: string | null;
  injuryStatus: InjuryStatus;
  injuryDetail: string | null;
  injuryUpdatedAt: Date | null;
  byeWeek: number | null;
  depthChartOrder: number | null;
  depthChartRole: string | null;
  isManual: boolean;
  source: string;
  slot: RosterSlot | null;
  slotIndex: number;
  game: GameInfo | null;
  onBye: boolean;
  lock: LockState;
  projection: PricedProjection | null;
  /** Rest-of-season points in THIS league (per-game price x games left). */
  rosPoints: number | null;
  rosPerGame: number | null;
  usage: UsageInfo | null;
  /** Extra points this league's bonuses add in a ceiling outcome. */
  bonusUpside: number;
  /**
   * False when the projection is the app's own model rather than a provider's.
   * Drives the "estimate" badge and caps recommendation confidence.
   */
  projectionIsReal: boolean;
  /** Same question for the rest-of-season number, which drives drop decisions. */
  rosIsReal: boolean;
  percentOwned: number | null;
  trendingAdds: number | null;
}

export interface MatchupInfo {
  id: string | null;
  week: number;
  opponentName: string;
  opponentId: string | null;
  myProjected: number;
  opponentProjected: number;
  myScore: number;
  opponentScore: number;
  winProbability: number;
  opponentIsEstimated: boolean;
}

export interface LeagueContext {
  league: {
    id: string;
    name: string;
    season: number;
    size: number | null;
    ppr: number;
    isSeeded: boolean;
    lastSyncAt: Date | null;
    provider: string;
  };
  team: {
    id: string;
    name: string;
    record: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    isSeeded: boolean;
  };
  config: ScoringConfig;
  season: number;
  week: number;
  weekSource: string;
  slots: { slot: RosterSlot; starters: number; maxAtPosition: number | null; eligible: Position[]; sortOrder: number }[];
  starters: PlayerCard[];
  bench: PlayerCard[];
  ir: PlayerCard[];
  all: PlayerCard[];
  openBenchSlots: number;
  openIrSlots: number;
  matchup: MatchupInfo | null;
}

const zStat = zStatLine;

/** Build everything one league's pages and engines need, in a few queries. */
export async function buildLeagueContext(leagueId: string, now: Date = new Date()): Promise<LeagueContext> {
  const state = await getSeasonState(now);
  const [league, config] = await Promise.all([
    prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      include: {
        rosterSlots: { orderBy: { sortOrder: 'asc' } },
        teams: { where: { isMine: true }, include: { roster: { include: { player: true } } } },
      },
    }),
    loadScoringConfigCached(leagueId),
  ]);

  const team = league.teams[0];
  if (!team) throw new Error(`League ${league.name} has no team flagged as mine`);

  const playerIds = team.roster.map((r) => r.playerId);
  const cards = await buildPlayerCards(playerIds, config, state.season, state.week, now, {
    slotByPlayerId: new Map(team.roster.map((r) => [r.playerId, { slot: r.slot as RosterSlot, slotIndex: r.slotIndex, id: r.id }])),
  });

  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered = team.roster
    .map((r) => byId.get(r.playerId))
    .filter((c): c is PlayerCard => Boolean(c));

  const starters = ordered.filter((c) => c.slot && !['BENCH', 'IR'].includes(c.slot));
  const bench = ordered.filter((c) => c.slot === 'BENCH');
  const ir = ordered.filter((c) => c.slot === 'IR');

  const slots = league.rosterSlots.map((s) => ({
    slot: s.slot as RosterSlot,
    starters: s.starters,
    maxAtPosition: s.maxAtPosition,
    eligible: parseJson<string[]>(s.eligiblePositionsJson, zStringArray, []) as Position[],
    sortOrder: s.sortOrder,
  }));

  const benchCap = league.rosterSlots.find((s) => s.slot === 'BENCH')?.starters ?? 0;
  const irCap = league.rosterSlots.find((s) => s.slot === 'IR')?.starters ?? 0;

  const matchup = await buildMatchup(leagueId, team.id, state.season, state.week, starters);

  return {
    league: {
      id: league.id,
      name: league.name,
      season: league.season,
      size: league.size,
      ppr: league.ppr,
      isSeeded: league.isSeeded,
      lastSyncAt: league.lastSyncAt,
      provider: league.provider,
    },
    team: {
      id: team.id,
      name: team.name,
      record: `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.pointsFor,
      isSeeded: team.isSeeded,
    },
    config,
    season: state.season,
    week: state.week,
    weekSource: state.source,
    slots,
    starters,
    bench,
    ir,
    all: ordered,
    openBenchSlots: Math.max(0, benchCap - bench.length),
    openIrSlots: Math.max(0, irCap - ir.length),
    matchup,
  };
}

/**
 * Build player cards (identity + game + league-priced projection) for any set
 * of players. Shared by rosters, the waiver wire and player pages so a number
 * shown in one place always matches the number shown in another.
 */
export async function buildPlayerCards(
  playerIds: string[],
  config: ScoringConfig,
  season: number,
  week: number,
  now: Date = new Date(),
  opts: {
    slotByPlayerId?: Map<string, { slot: RosterSlot; slotIndex: number; id: string }>;
    leagueId?: string;
  } = {},
): Promise<PlayerCard[]> {
  if (playerIds.length === 0) return [];

  const [players, projections, usageRows, games, faRows] = await Promise.all([
    prisma.player.findMany({ where: { id: { in: playerIds } } }),
    prisma.projection.findMany({
      where: {
        playerId: { in: playerIds },
        season,
        week: { in: [week, ROS_WEEK] },
        // ESPN prices a projection with each league's own settings, so those
        // rows are league-scoped. Global rows apply everywhere.
        leagueScope: { in: opts.leagueId ? [GLOBAL_SCOPE, opts.leagueId] : [GLOBAL_SCOPE, config.leagueId] },
      },
    }),
    prisma.playerStatistic.findMany({ where: { playerId: { in: playerIds }, season, week: USAGE_BASELINE_WEEK } }),
    prisma.nFLGame.findMany({
      where: { season, week },
      include: { homeTeam: true, awayTeam: true },
    }),
    opts.leagueId
      ? prisma.freeAgentSnapshot.findMany({ where: { leagueId: opts.leagueId, playerId: { in: playerIds } } })
      : Promise.resolve([]),
  ]);

  const gameByTeam = new Map<string, (typeof games)[number]>();
  for (const g of games) {
    gameByTeam.set(g.homeTeam.abbr, g);
    gameByTeam.set(g.awayTeam.abbr, g);
  }

  const weekProjByPlayer = new Map<string, (typeof projections)[number]>();
  const rosProjByPlayer = new Map<string, (typeof projections)[number]>();
  for (const p of projections) {
    const bucket = p.week === ROS_WEEK ? rosProjByPlayer : weekProjByPlayer;
    const current = bucket.get(p.playerId);
    // Consensus wins; otherwise keep the most recently updated source.
    if (!current || preferProjection(p, current)) bucket.set(p.playerId, p);
  }

  const usageByPlayer = new Map(usageRows.map((u) => [u.playerId, u]));
  const faByPlayer = new Map(faRows.map((f) => [f.playerId, f]));
  const gamesRemaining = Math.max(0, REGULAR_SEASON_WEEKS - week + 1);

  return players.map((player) => {
    const abbr = player.nflTeamAbbr;
    const game = abbr ? gameByTeam.get(abbr) : undefined;
    const onBye = Boolean(abbr) && !game;
    const isHome = game ? game.homeTeam.abbr === abbr : false;

    const gameInfo: GameInfo | null = game
      ? {
          id: game.id,
          kickoff: game.kickoff,
          opponentAbbr: isHome ? game.awayTeam.abbr : game.homeTeam.abbr,
          isHome,
          status: game.status,
          spread: game.spread === null ? null : isHome ? game.spread : -game.spread,
          overUnder: game.overUnder,
          impliedPoints: isHome ? game.homeImplied : game.awayImplied,
          opponentImplied: isHome ? game.awayImplied : game.homeImplied,
          slotLabel: kickoffSlot(game.kickoff),
          isInternational: game.isInternational,
        }
      : null;

    const weekRow = weekProjByPlayer.get(player.id);
    const statLine = weekRow ? parseJson<StatLine>(weekRow.statLineJson, zStat, {}) : null;
    const floorLine = weekRow?.floorStatLineJson ? parseJson<StatLine>(weekRow.floorStatLineJson, zStat, {}) : null;
    const ceilLine = weekRow?.ceilingStatLineJson ? parseJson<StatLine>(weekRow.ceilingStatLineJson, zStat, {}) : null;

    const injuryStatus = player.injuryStatus as InjuryStatus;
    const projection =
      statLine && !onBye
        ? priceProjection({
            statLine,
            floorStatLine: floorLine,
            ceilingStatLine: ceilLine,
            config,
            injuryStatus,
            confidence: weekRow?.confidence ?? 0.5,
            source: weekRow?.source ?? 'UNKNOWN',
            updatedAt: weekRow?.updatedAt ?? null,
            providerPoints: weekRow?.providerPoints ?? null,
          })
        : null;

    // ROS rows hold a PER-GAME stat line: pricing per game keeps yardage
    // bonuses correct, then we multiply by the games left.
    const rosRow = rosProjByPlayer.get(player.id);
    const rosLine = rosRow ? parseJson<StatLine>(rosRow.statLineJson, zStat, {}) : null;
    const rosPerGame = rosRow
      ? priceProjection({
          statLine: rosLine ?? {},
          config,
          injuryStatus,
          confidence: rosRow.confidence,
          source: rosRow.source,
          // A provider's rest-of-season number arrives as points, not a stat line.
          providerPoints: rosRow.providerPoints,
        }).points
      : null;

    const usage = usageByPlayer.get(player.id);
    const slotInfo = opts.slotByPlayerId?.get(player.id);
    const fa = faByPlayer.get(player.id);

    return {
      id: player.id,
      rosterPlayerId: slotInfo?.id ?? null,
      name: player.fullName,
      position: player.position as Position,
      eligiblePositions: parseJson<string[]>(player.eligiblePositionsJson, zStringArray, []) as Position[],
      nflTeamAbbr: abbr,
      injuryStatus,
      injuryDetail: player.injuryDetail,
      injuryUpdatedAt: player.injuryUpdatedAt,
      byeWeek: player.byeWeek,
      depthChartOrder: player.depthChartOrder,
      depthChartRole: player.depthChartRole,
      isManual: player.isManual,
      source: player.source,
      slot: slotInfo?.slot ?? null,
      slotIndex: slotInfo?.slotIndex ?? 0,
      game: gameInfo,
      onBye,
      lock: lockState(gameInfo?.kickoff ?? null, now, DEFAULT_LOCK_WARNING_MINUTES),
      projection,
      rosPerGame,
      rosPoints: rosPerGame === null ? null : Math.round(rosPerGame * gamesRemaining * 10) / 10,
      usage: usage
        ? {
            snapShare: usage.snapShare,
            targets: usage.targets,
            carries: usage.carries,
            redZoneTouches: usage.redZoneTouches,
          }
        : null,
      bonusUpside: statLine ? bonusUpside(statLine, ceilLine, config) : 0,
      projectionIsReal: weekRow ? isRealSource(weekRow.source) : false,
      rosIsReal: rosRow ? isRealSource(rosRow.source) : false,
      percentOwned: fa?.percentOwned ?? null,
      trendingAdds: fa?.trendingAdds ?? null,
    };
  });
}

/**
 * Pick the best projection when several exist for one player.
 * A real provider number always beats the app's own estimate — see SOURCE_RANK.
 */
function preferProjection(candidate: { source: string; updatedAt: Date }, current: { source: string; updatedAt: Date }): boolean {
  const rank = sourceRank(candidate.source) - sourceRank(current.source);
  if (rank !== 0) return rank > 0;
  return candidate.updatedAt > current.updatedAt;
}

async function buildMatchup(
  leagueId: string,
  teamId: string,
  season: number,
  week: number,
  starters: PlayerCard[],
): Promise<MatchupInfo | null> {
  const matchup = await prisma.matchup.findFirst({
    where: { leagueId, season, week, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    include: { homeTeam: true, awayTeam: true },
  });

  const myProjected = Math.round(starters.reduce((sum, c) => sum + (c.projection?.expected ?? 0), 0) * 10) / 10;

  if (!matchup) {
    return {
      id: null,
      week,
      opponentName: 'Opponent unknown',
      opponentId: null,
      myProjected,
      opponentProjected: 0,
      myScore: 0,
      opponentScore: 0,
      winProbability: 0.5,
      opponentIsEstimated: true,
    };
  }

  const isHome = matchup.homeTeamId === teamId;
  const opponent = isHome ? matchup.awayTeam : matchup.homeTeam;
  const storedOpponentProjection = isHome ? matchup.awayProjected : matchup.homeProjected;
  const opponentProjected = storedOpponentProjection ?? 0;

  return {
    id: matchup.id,
    week,
    opponentName: opponent.name,
    opponentId: opponent.id,
    myProjected,
    opponentProjected,
    myScore: isHome ? matchup.homeScore : matchup.awayScore,
    opponentScore: isHome ? matchup.awayScore : matchup.homeScore,
    winProbability: winProbability(myProjected, opponentProjected),
    // True when we're estimating the other roster instead of reading it from ESPN.
    opponentIsEstimated: matchup.source !== 'ESPN',
  };
}

/**
 * Win probability from projected margin.
 * Weekly fantasy scores have a standard deviation around 24-28 points per team,
 * so the margin's sigma is ~ sqrt(2) * 26. Deliberately blunt, and labeled as
 * an estimate in the UI rather than dressed up as precision.
 */
export function winProbability(myProjected: number, oppProjected: number, sigma = 36): number {
  if (oppProjected <= 0) return 0.5;
  const z = (myProjected - oppProjected) / sigma;
  return Math.round(normalCdf(z) * 1000) / 1000;
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export { PROJECTION_SOURCES };
