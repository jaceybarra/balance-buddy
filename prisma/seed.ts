/**
 * Seed the local database with the user's two real fantasy teams.
 *
 * Snapshot label: 2026-09-11 (see SEED_SNAPSHOT_LABEL).
 * Everything written here carries source = "SEED" and isSeeded = true, so the
 * UI can show what has not yet been confirmed by a provider sync. A successful
 * ESPN sync overwrites it.
 *
 * Run: npm run db:reset
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Works standalone: Next reads .env.local and .env, the Prisma CLI reads .env,
// and running this file directly reads neither unless we ask.
loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });
loadEnv({ path: path.join(process.cwd(), '.env'), quiet: true });
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  process.env.DATABASE_URL = 'file:./dev.db';
}
import { NFL_TEAMS } from '../src/lib/seed/nfl-teams';
import { buildSeedSchedule, SEASON } from '../src/lib/seed/schedule';
import { ARCHETYPE_PROFILES } from '../src/lib/seed/archetypes';
import {
  FREE_AGENT_POOL,
  GIBBS_ROSTER,
  SEED_SNAPSHOT_LABEL,
  SGIH_ROSTER,
  type SeedPlayer,
} from '../src/lib/seed/players';
import { GIBBS_SCORING_RULES, SGIH_SCORING_RULES } from '../src/lib/scoring/seed-configs';
import { identityKey } from '../src/lib/identity/normalize';
import { PROJECTION_SOURCES, ROS_WEEK, USAGE_BASELINE_WEEK, USAGE_SOURCE, GLOBAL_SCOPE } from '../src/lib/projections/sources';
import type { ScoringRule } from '../src/lib/scoring/types';
import type { StatLine } from '../src/lib/scoring/stats';

const prisma = new PrismaClient();

const SLOT_CONFIG_GIBBS = [
  { slot: 'QB', starters: 1, maxAtPosition: 4, eligible: ['QB'], sortOrder: 0 },
  { slot: 'RB', starters: 2, maxAtPosition: 8, eligible: ['RB'], sortOrder: 1 },
  { slot: 'WR', starters: 2, maxAtPosition: 8, eligible: ['WR'], sortOrder: 2 },
  { slot: 'TE', starters: 1, maxAtPosition: 3, eligible: ['TE'], sortOrder: 3 },
  { slot: 'FLEX', starters: 1, maxAtPosition: null, eligible: ['RB', 'WR', 'TE'], sortOrder: 4 },
  { slot: 'DST', starters: 1, maxAtPosition: 3, eligible: ['DST'], sortOrder: 5 },
  { slot: 'K', starters: 1, maxAtPosition: 3, eligible: ['K'], sortOrder: 6 },
  { slot: 'BENCH', starters: 5, maxAtPosition: null, eligible: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], sortOrder: 7 },
  { slot: 'IR', starters: 1, maxAtPosition: null, eligible: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], sortOrder: 8 },
];

const SLOT_CONFIG_SGIH = SLOT_CONFIG_GIBBS.map((s) =>
  s.slot === 'FLEX' ? { ...s, starters: 2 } : s.slot === 'BENCH' ? { ...s, starters: 8 } : s,
);

const GIBBS_OPPONENTS = [
  'Pitts and Giggles', 'The Lamar Mafia', 'Chubb Rock', 'Kelce Grammer', 'Nacua Matata', 'Hurts So Good',
  'Purdy Good Team', 'Bijan Mustard', 'McCaffrey Cats', 'Diggs in a Blanket', 'Waddle Waddle',
];
const SGIH_OPPONENTS = ['Tua Legit Quit', 'Saquon the Barbarian', 'Njoku Time', 'Etienne Doo Dah', 'Brock and Roll'];

async function main() {
  console.log(`Seeding Fantasy GM — snapshot ${SEED_SNAPSHOT_LABEL}, season ${SEASON}`);

  await wipe();

  const user = await prisma.user.create({
    data: { name: 'GM', timezone: process.env.APP_TIMEZONE ?? 'America/Denver' },
  });

  // ---------------------------------------------------------------- NFL data
  const teamIdByAbbr = new Map<string, string>();
  for (const team of NFL_TEAMS) {
    const row = await prisma.nFLTeam.create({
      data: {
        abbr: team.abbr,
        location: team.location,
        nickname: team.nickname,
        conference: team.conference,
        division: team.division,
        byeWeek: team.byeWeek,
      },
    });
    teamIdByAbbr.set(team.abbr, row.id);
  }
  console.log(`  ${NFL_TEAMS.length} NFL teams`);

  const games = buildSeedSchedule(SEASON);
  for (const chunk of chunked(games, 100)) {
    await prisma.$transaction(
      chunk.map((g) =>
        prisma.nFLGame.create({
          data: {
            providerGameId: `${g.season}-W${g.week}-${g.awayAbbr}@${g.homeAbbr}`,
            season: g.season,
            week: g.week,
            homeTeamId: teamIdByAbbr.get(g.homeAbbr)!,
            awayTeamId: teamIdByAbbr.get(g.awayAbbr)!,
            kickoff: g.kickoff,
            status: 'SCHEDULED',
            spread: g.spread,
            overUnder: g.overUnder,
            homeImplied: g.homeImplied,
            awayImplied: g.awayImplied,
            isDome: NFL_TEAMS.find((t) => t.abbr === g.homeAbbr)?.isDome ?? false,
            isInternational: g.isInternational,
            source: 'SEED',
          },
        }),
      ),
    );
  }
  console.log(`  ${games.length} scheduled games across 18 weeks`);

  // ----------------------------------------------------------------- leagues
  const gibbs = await createLeague({
    userId: user.id,
    name: 'Gibbs Me The Trophy',
    size: 12,
    credentialRefKey: 'league1',
    slotConfig: SLOT_CONFIG_GIBBS,
    rules: GIBBS_SCORING_RULES,
    envVarMap: { leagueId: 'ESPN_LEAGUE_1_ID', teamId: 'ESPN_TEAM_1_ID', swid: 'ESPN_LEAGUE_1_SWID or ESPN_SWID', s2: 'ESPN_LEAGUE_1_S2 or ESPN_S2' },
  });

  const sgih = await createLeague({
    userId: user.id,
    // League size is genuinely unknown until ESPN sync — we do not guess one.
    name: 'So Good It Hurts',
    size: null,
    credentialRefKey: 'league2',
    slotConfig: SLOT_CONFIG_SGIH,
    rules: SGIH_SCORING_RULES,
    envVarMap: { leagueId: 'ESPN_LEAGUE_2_ID', teamId: 'ESPN_TEAM_2_ID', swid: 'ESPN_LEAGUE_2_SWID or ESPN_SWID', s2: 'ESPN_LEAGUE_2_S2 or ESPN_S2' },
  });

  // ------------------------------------------------------------------- teams
  const gibbsTeam = await prisma.fantasyTeam.create({
    data: {
      leagueId: gibbs.id,
      name: 'Gibbs Me The Trophy',
      providerTeamId: 'seed-mine-1',
      isMine: true,
      wins: 0,
      losses: 0,
      abbrev: 'GIBB',
    },
  });
  const sgihTeam = await prisma.fantasyTeam.create({
    data: {
      leagueId: sgih.id,
      name: 'So Good It Hurts',
      providerTeamId: 'seed-mine-2',
      isMine: true,
      wins: 0,
      losses: 0,
      abbrev: 'SGIH',
    },
  });

  const gibbsOpponents = await createOpponents(gibbs.id, GIBBS_OPPONENTS);
  const sgihOpponents = await createOpponents(sgih.id, SGIH_OPPONENTS);

  // ----------------------------------------------------------------- players
  const playerIdCache = new Map<string, string>();

  async function upsertSeedPlayer(seed: SeedPlayer): Promise<string> {
    const key = identityKey(seed.name, seed.position, seed.team);
    const cached = playerIdCache.get(key);
    if (cached) return cached;

    const existing = await prisma.player.findFirst({ where: { normalizedName: key, position: seed.position } });
    if (existing) {
      playerIdCache.set(key, existing.id);
      return existing.id;
    }

    const profile = ARCHETYPE_PROFILES[seed.archetype];
    const mod = seed.usageMod ?? 1;
    const nflTeamId = seed.team ? teamIdByAbbr.get(seed.team) ?? null : null;

    const player = await prisma.player.create({
      data: {
        fullName: seed.name,
        firstName: seed.name.split(' ')[0],
        lastName: seed.name.split(' ').slice(1).join(' ') || null,
        normalizedName: key,
        position: seed.position,
        nflTeamId,
        nflTeamAbbr: seed.team,
        injuryStatus: seed.injuryStatus ?? 'HEALTHY',
        injuryDetail: seed.injuryDetail ?? null,
        injuryUpdatedAt: seed.injuryStatus ? new Date() : null,
        depthChartOrder: seed.depthChartOrder ?? null,
        depthChartRole: seed.depthChartRole ?? null,
        eligiblePositionsJson: JSON.stringify(seed.eligible ?? []),
        isDst: seed.position === 'DST',
        byeWeek: seed.team ? NFL_TEAMS.find((t) => t.abbr === seed.team)?.byeWeek ?? null : null,
        source: 'SEED',
      },
    });

    // Per-game production profile: the input to the projection model.
    const scaled = scaleStatLine(profile.statLine, mod, seed.position === 'DST');
    await prisma.projection.create({
      data: {
        playerId: player.id,
        season: SEASON,
        week: ROS_WEEK,
        leagueScope: GLOBAL_SCOPE,
        source: PROJECTION_SOURCES.PROFILE,
        statLineJson: JSON.stringify(scaled),
        confidence: 0.6,
      },
    });

    // Usage profile (snap share, targets, carries, red zone).
    await prisma.playerStatistic.create({
      data: {
        playerId: player.id,
        season: SEASON,
        week: USAGE_BASELINE_WEEK,
        statLineJson: JSON.stringify(scaled),
        snapShare: round(profile.usage.snapShare * Math.min(mod, 1.15), 2),
        targets: Math.round(profile.usage.targets * mod),
        carries: Math.round(profile.usage.carries * mod),
        redZoneTouches: Math.round(profile.usage.redZoneTouches * mod * 10) / 10,
        source: USAGE_SOURCE,
      },
    });

    if (seed.injuryStatus && seed.injuryStatus !== 'HEALTHY') {
      await prisma.injuryReport.create({
        data: {
          playerId: player.id,
          status: seed.injuryStatus,
          detail: seed.injuryDetail ?? null,
          reportedAt: new Date(`${SEED_SNAPSHOT_LABEL}T12:00:00Z`),
          source: 'SEED',
        },
      });
      await prisma.playerNews.create({
        data: {
          playerId: player.id,
          headline: `${seed.name} listed ${seed.injuryStatus.toLowerCase()}`,
          body: seed.injuryDetail ?? null,
          source: 'SEED',
          publishedAt: new Date(`${SEED_SNAPSHOT_LABEL}T12:00:00Z`),
          category: seed.injuryStatus === 'OUT' ? 'GAME_STATUS' : 'INJURY',
          impactScore: seed.injuryStatus === 'OUT' ? 70 : 60,
          interpretation:
            seed.injuryStatus === 'QUESTIONABLE'
              ? `${seed.name} is a game-time decision. Have a replacement ready and check inactives about 90 minutes before his kickoff.`
              : `${seed.name} is ${seed.injuryStatus.toLowerCase()} — plan the week without him.`,
        },
      });
    }

    playerIdCache.set(key, player.id);
    return player.id;
  }

  for (const entry of GIBBS_ROSTER) {
    const playerId = await upsertSeedPlayer(entry.player);
    await prisma.rosterPlayer.create({
      data: { teamId: gibbsTeam.id, playerId, slot: entry.slot, slotIndex: entry.slotIndex, source: 'SEED', acquisitionType: 'SEED' },
    });
  }
  for (const entry of SGIH_ROSTER) {
    const playerId = await upsertSeedPlayer(entry.player);
    await prisma.rosterPlayer.create({
      data: { teamId: sgihTeam.id, playerId, slot: entry.slot, slotIndex: entry.slotIndex, source: 'SEED', acquisitionType: 'SEED' },
    });
  }
  console.log(`  ${GIBBS_ROSTER.length} + ${SGIH_ROSTER.length} roster spots`);

  // ------------------------------------------------------------ free agents
  for (const fa of FREE_AGENT_POOL) {
    const playerId = await upsertSeedPlayer(fa);
    if (fa.gibbsAvailable) {
      await prisma.freeAgentSnapshot.create({
        data: {
          leagueId: gibbs.id,
          playerId,
          availability: 'FREE_AGENT',
          percentOwned: fa.percentOwned,
          trendingAdds: fa.trendingAdds ?? null,
          source: 'SEED',
        },
      });
    }
    if (fa.sgihAvailable) {
      await prisma.freeAgentSnapshot.create({
        data: {
          leagueId: sgih.id,
          playerId,
          availability: 'FREE_AGENT',
          percentOwned: fa.percentOwned,
          trendingAdds: fa.trendingAdds ?? null,
          source: 'SEED',
        },
      });
    }
  }
  console.log(`  ${FREE_AGENT_POOL.length} free agents distributed per league`);

  // -------------------------------------------------------------- matchups
  const currentWeek = await deriveCurrentWeek();
  await seedMatchups(gibbs.id, gibbsTeam.id, gibbsOpponents, currentWeek, 118.4);
  await seedMatchups(sgih.id, sgihTeam.id, sgihOpponents, currentWeek, 134.5);

  // ------------------------------------------------------ seeded news items
  await prisma.playerNews.create({
    data: {
      headline: 'Seed snapshot loaded',
      body: `Rosters, scoring and roster rules were transcribed from the ESPN screenshots taken ${SEED_SNAPSHOT_LABEL}. Sync ESPN to make the live league authoritative.`,
      source: 'SEED',
      publishedAt: new Date(`${SEED_SNAPSHOT_LABEL}T12:00:00Z`),
      category: 'GENERAL',
      impactScore: 5,
      interpretation: 'Nothing to do — this is a note about where the current data came from.',
    },
  });

  await prisma.appSetting.createMany({
    data: [
      { key: 'app.timezone', valueJson: JSON.stringify(process.env.APP_TIMEZONE ?? 'America/Denver') },
      { key: 'app.lockWarningMinutes', valueJson: JSON.stringify(Number(process.env.LOCK_WARNING_MINUTES ?? 60)) },
      { key: 'app.seedSnapshot', valueJson: JSON.stringify(SEED_SNAPSHOT_LABEL) },
      { key: 'notifications.prefs', valueJson: JSON.stringify({ inApp: true, push: false, email: false, sms: false, minSeverity: 'HIGH' }) },
    ],
  });

  // ---------------------------------------------- projections + action queue
  const { generateProjections } = await import('../src/lib/projections/generate');
  const projections = await generateProjections(SEASON, currentWeek);
  console.log(`  projections: ${projections.weekly} weekly, ${projections.ros} ROS, ${projections.consensus} consensus`);

  await backfillOpponentProjections(currentWeek);

  const { regenerateActions } = await import('../src/lib/engine/actions');
  const actions = await regenerateActions();
  console.log(`  action queue: ${actions.created} actions generated`);

  await prisma.dataSync.createMany({
    data: [
      { scope: 'ESPN_LEAGUE', provider: 'SEED', status: 'OK', itemCount: 2, message: `Seed snapshot ${SEED_SNAPSHOT_LABEL}`, finishedAt: new Date(), staleAfterMinutes: 180 },
      { scope: 'NFL_SCHEDULE', provider: 'SEED', status: 'OK', itemCount: games.length, message: 'Seeded 18-week schedule', finishedAt: new Date(), staleAfterMinutes: 1440 },
      { scope: 'PROJECTIONS', provider: 'BASELINE', status: 'OK', itemCount: projections.weekly, message: 'Baseline model', finishedAt: new Date(), staleAfterMinutes: 360 },
      { scope: 'ENGINE', provider: 'INTERNAL', status: 'OK', itemCount: actions.created, message: 'Action queue built', finishedAt: new Date(), staleAfterMinutes: 60 },
      // These scopes really were populated — by the seed snapshot rather than a
      // live provider. Recording them keeps the freshness panel honest instead
      // of claiming data is missing when it is merely seeded.
      { scope: 'NFL_PLAYERS', provider: 'SEED', status: 'OK', itemCount: playerIdCache.size, message: `Seed snapshot ${SEED_SNAPSHOT_LABEL}`, finishedAt: new Date(), staleAfterMinutes: 1440 },
      { scope: 'INJURIES', provider: 'SEED', status: 'PARTIAL', itemCount: 2, message: 'Injury designations transcribed from the ESPN screenshots; sync for live reports.', finishedAt: new Date(), staleAfterMinutes: 120 },
      { scope: 'FREE_AGENTS', provider: 'SEED', status: 'PARTIAL', itemCount: FREE_AGENT_POOL.length, message: 'Seeded free-agent pool; sync ESPN for the real wire.', finishedAt: new Date(), staleAfterMinutes: 360 },
      { scope: 'NEWS', provider: 'SEED', status: 'PARTIAL', itemCount: 3, message: 'No licensed news feed configured; items are derived from injury changes.', finishedAt: new Date(), staleAfterMinutes: 120 },
      { scope: 'STATS', provider: 'SEED', status: 'PARTIAL', itemCount: playerIdCache.size, message: 'Seeded usage profiles (snap share, targets, carries, red zone). A stats feed would replace these with real weekly numbers.', finishedAt: new Date(), staleAfterMinutes: 720 },
    ],
  });

  console.log(`\nDone. Week ${currentWeek} of the ${SEASON} season.`);
  console.log('Run `npm run dev` and open http://localhost:3000');
}

async function createLeague(args: {
  userId: string;
  name: string;
  size: number | null;
  credentialRefKey: string;
  slotConfig: typeof SLOT_CONFIG_GIBBS;
  rules: ScoringRule[];
  envVarMap: Record<string, string>;
}) {
  const league = await prisma.league.create({
    data: {
      userId: args.userId,
      name: args.name,
      season: SEASON,
      provider: 'ESPN',
      size: args.size,
      format: 'H2H_POINTS',
      ppr: 0.5,
      credentialRefKey: args.credentialRefKey,
      isSeeded: true,
    },
  });

  await prisma.rosterSlotConfig.createMany({
    data: args.slotConfig.map((s) => ({
      leagueId: league.id,
      slot: s.slot,
      starters: s.starters,
      maxAtPosition: s.maxAtPosition,
      eligiblePositionsJson: JSON.stringify(s.eligible),
      sortOrder: s.sortOrder,
      source: 'SEED',
    })),
  });

  await prisma.leagueScoringRule.createMany({
    data: args.rules.map((r) => ({
      leagueId: league.id,
      statKey: r.statKey,
      kind: r.kind,
      points: r.points,
      rangeMin: 'rangeMin' in r ? r.rangeMin : null,
      rangeMax: 'rangeMax' in r ? r.rangeMax : null,
      exclusiveGroup: 'exclusiveGroup' in r ? r.exclusiveGroup : null,
      category: r.category,
      source: 'SEED',
    })),
  });

  // Reference only — the secret itself lives in the environment.
  await prisma.providerCredentialRef.create({
    data: { leagueId: league.id, provider: 'ESPN', envVarMapJson: JSON.stringify(args.envVarMap), note: 'Values are read from the environment at request time and never stored.' },
  });

  return league;
}

async function createOpponents(leagueId: string, names: string[]) {
  const created = [];
  for (let i = 0; i < names.length; i++) {
    created.push(
      await prisma.fantasyTeam.create({
        data: { leagueId, name: names[i]!, providerTeamId: `seed-opp-${i}`, isMine: false, abbrev: names[i]!.slice(0, 4).toUpperCase() },
      }),
    );
  }
  return created;
}

async function seedMatchups(
  leagueId: string,
  myTeamId: string,
  opponents: { id: string }[],
  week: number,
  opponentProjection: number,
) {
  const opponent = opponents[week % opponents.length] ?? opponents[0];
  if (!opponent) return;
  await prisma.matchup.create({
    data: {
      leagueId,
      season: SEASON,
      week,
      homeTeamId: myTeamId,
      awayTeamId: opponent.id,
      homeProjected: null, // computed live from my roster
      awayProjected: opponentProjection,
      source: 'SEED',
    },
  });
}

/**
 * Opponent projections are seeded estimates until ESPN gives us their roster.
 * The UI labels them as estimated so nobody mistakes them for real data.
 */
async function backfillOpponentProjections(week: number) {
  const matchups = await prisma.matchup.findMany({ where: { week, season: SEASON } });
  for (const m of matchups) {
    if (m.awayProjected === null) {
      await prisma.matchup.update({ where: { id: m.id }, data: { awayProjected: 115 } });
    }
  }
}

/** Derive the week from the seeded schedule — never hardcoded. */
async function deriveCurrentWeek(): Promise<number> {
  const now = new Date();
  const pending = await prisma.nFLGame.findFirst({
    where: { season: SEASON, kickoff: { gt: new Date(now.getTime() - 4.5 * 3600_000) } },
    orderBy: [{ week: 'asc' }, { kickoff: 'asc' }],
  });
  return pending?.week ?? 1;
}

function scaleStatLine(line: StatLine, factor: number, isDst: boolean): StatLine {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(line)) {
    if (typeof value !== 'number') continue;
    if (isDst && (key === 'pointsAllowed' || key === 'yardsAllowed')) {
      out[key] = round(value / Math.max(factor, 0.5), 1);
    } else {
      out[key] = round(value * factor, 3);
    }
  }
  return out as StatLine;
}

function round(v: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Wipe in FK-safe order so reseeding is repeatable. */
async function wipe() {
  await prisma.notification.deleteMany();
  await prisma.action.deleteMany();
  await prisma.waiverTarget.deleteMany();
  await prisma.tradeAnalysis.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.freeAgentSnapshot.deleteMany();
  await prisma.playerNews.deleteMany();
  await prisma.injuryReport.deleteMany();
  await prisma.playerStatistic.deleteMany();
  await prisma.projection.deleteMany();
  await prisma.matchup.deleteMany();
  await prisma.rosterPlayer.deleteMany();
  await prisma.fantasyTeam.deleteMany();
  await prisma.leagueScoringRule.deleteMany();
  await prisma.rosterSlotConfig.deleteMany();
  await prisma.providerCredentialRef.deleteMany();
  await prisma.league.deleteMany();
  await prisma.playerProviderId.deleteMany();
  await prisma.player.deleteMany();
  await prisma.nFLGame.deleteMany();
  await prisma.nFLTeam.deleteMany();
  await prisma.dataSync.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
