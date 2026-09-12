import { prisma } from '../db';
import { parseJson, stringify } from '../json';
import { zStatLine, type StatLine } from '../scoring/stats';
import { modelProjection, type GameContext } from './model';
import { modelDstProjection } from './dst';
import { GLOBAL_SCOPE, PROJECTION_SOURCES, ROS_WEEK, SOURCE_WEIGHT, USAGE_BASELINE_WEEK, enabledSources } from './sources';
import type { InjuryStatus, Position } from '../domain/enums';
import { kickoffSlot } from '../time';

/**
 * Generate weekly + rest-of-season projections for every player we know about.
 *
 * Reads the seeded per-game production profile (source = BASELINE_PROFILE),
 * applies matchup/game-script/injury context, and writes BASELINE rows. Then it
 * blends every enabled source into a CONSENSUS row, which is what the app shows.
 *
 * Projections are stored as STAT LINES, never as points — points are a
 * per-league question answered later by each league's scoring engine.
 */
export async function generateProjections(season: number, week: number): Promise<{ weekly: number; ros: number; consensus: number }> {
  const [players, profiles, usageRows, games] = await Promise.all([
    prisma.player.findMany(),
    prisma.projection.findMany({ where: { season, source: PROJECTION_SOURCES.PROFILE, week: ROS_WEEK } }),
    prisma.playerStatistic.findMany({ where: { season, week: USAGE_BASELINE_WEEK } }),
    prisma.nFLGame.findMany({ where: { season, week }, include: { homeTeam: true, awayTeam: true } }),
  ]);

  const profileByPlayer = new Map(profiles.map((p) => [p.playerId, p]));
  const usageByPlayer = new Map(usageRows.map((u) => [u.playerId, u]));
  const gameByTeam = new Map<string, (typeof games)[number]>();
  for (const g of games) {
    gameByTeam.set(g.homeTeam.abbr, g);
    gameByTeam.set(g.awayTeam.abbr, g);
  }

  const writes: Parameters<typeof prisma.projection.upsert>[0][] = [];
  let weekly = 0;
  let ros = 0;

  for (const player of players) {
    const profile = profileByPlayer.get(player.id);
    if (!profile) continue;
    const baseStatLine = parseJson<StatLine>(profile.statLineJson, zStatLine, {});
    const usage = usageByPlayer.get(player.id);
    const game = player.nflTeamAbbr ? gameByTeam.get(player.nflTeamAbbr) : undefined;
    const isHome = game ? game.homeTeam.abbr === player.nflTeamAbbr : false;

    const ctx: GameContext | null = game
      ? {
          opponentAbbr: isHome ? game.awayTeam.abbr : game.homeTeam.abbr,
          isHome,
          impliedPoints: isHome ? game.homeImplied : game.awayImplied,
          opponentImplied: isHome ? game.awayImplied : game.homeImplied,
          spread: game.spread === null ? null : isHome ? game.spread : -game.spread,
          overUnder: game.overUnder,
          isDome: game.isDome,
          kickoff: game.kickoff,
          windMph: null,
          precipChance: null,
        }
      : null;

    const position = player.position as Position;
    const injuryStatus = player.injuryStatus as InjuryStatus;

    let statLine: StatLine;
    let floorStatLine: StatLine;
    let ceilingStatLine: StatLine;
    let confidence: number;

    if (position === 'DST') {
      const dst = modelDstProjection(player.nflTeamAbbr ?? '', ctx);
      statLine = dst.statLine;
      floorStatLine = dst.floorStatLine;
      ceilingStatLine = dst.ceilingStatLine;
      confidence = ctx ? 0.62 : 0.95;
    } else {
      const modeled = modelProjection({
        position,
        baseStatLine,
        volatility: 5,
        roleStability: usage?.snapShare ? Math.min(0.97, 0.5 + usage.snapShare * 0.5) : 0.75,
        injuryStatus,
        game: ctx,
      });
      statLine = modeled.statLine;
      floorStatLine = modeled.floorStatLine;
      ceilingStatLine = modeled.ceilingStatLine;
      confidence = modeled.confidence;
    }

    writes.push({
      where: {
        playerId_season_week_source_leagueScope: {
          playerId: player.id,
          season,
          week,
          source: PROJECTION_SOURCES.BASELINE,
          leagueScope: GLOBAL_SCOPE,
        },
      },
      create: {
        playerId: player.id,
        season,
        week,
        source: PROJECTION_SOURCES.BASELINE,
        statLineJson: stringify(statLine),
        floorStatLineJson: stringify(floorStatLine),
        ceilingStatLineJson: stringify(ceilingStatLine),
        confidence,
      },
      update: {
        statLineJson: stringify(statLine),
        floorStatLineJson: stringify(floorStatLine),
        ceilingStatLineJson: stringify(ceilingStatLine),
        confidence,
      },
    });
    weekly++;

    // Rest-of-season row holds a PER-GAME expectation (matchup-neutral), so
    // yardage bonuses stay a per-game question when it is priced.
    writes.push({
      where: {
        playerId_season_week_source_leagueScope: {
          playerId: player.id,
          season,
          week: ROS_WEEK,
          source: PROJECTION_SOURCES.BASELINE,
          leagueScope: GLOBAL_SCOPE,
        },
      },
      create: {
        playerId: player.id,
        season,
        week: ROS_WEEK,
        source: PROJECTION_SOURCES.BASELINE,
        statLineJson: stringify(baseStatLine),
        confidence: 0.55,
      },
      update: { statLineJson: stringify(baseStatLine), confidence: 0.55 },
    });
    ros++;
  }

  // Prisma has no bulk upsert on SQLite; batch in chunks to stay responsive.
  for (let i = 0; i < writes.length; i += 50) {
    await prisma.$transaction(writes.slice(i, i + 50).map((w) => prisma.projection.upsert(w)));
  }

  const consensus = await buildConsensus(season, week);
  return { weekly, ros, consensus };
}

/**
 * Blend every enabled source into a CONSENSUS projection.
 *
 * Disagreement between sources is not averaged away — it lowers the confidence
 * attached to the consensus row, which then shows up as a lower confidence
 * percentage on any recommendation built from it.
 */
export async function buildConsensus(season: number, week: number): Promise<number> {
  const allowed = new Set(enabledSources());
  const rows = await prisma.projection.findMany({
    where: { season, week, source: { not: PROJECTION_SOURCES.CONSENSUS } },
  });

  const byPlayer = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.source === PROJECTION_SOURCES.PROFILE) continue;
    if (allowed.size > 0 && !allowed.has(row.source)) continue;
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }

  let count = 0;
  const ops: ReturnType<typeof prisma.projection.upsert>[] = [];

  for (const [playerId, sources] of byPlayer) {
    if (sources.length === 0) continue;
    const weights = sources.map((s) => (SOURCE_WEIGHT[s.source] ?? 0.7) * (s.confidence || 0.5));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

    const blended = blendStatLines(
      sources.map((s, i) => ({ line: parseJson<StatLine>(s.statLineJson, zStatLine, {}), weight: weights[i]! / totalWeight })),
    );
    const floor = blendStatLines(
      sources.map((s, i) => ({
        line: parseJson<StatLine>(s.floorStatLineJson ?? s.statLineJson, zStatLine, {}),
        weight: weights[i]! / totalWeight,
      })),
    );
    const ceiling = blendStatLines(
      sources.map((s, i) => ({
        line: parseJson<StatLine>(s.ceilingStatLineJson ?? s.statLineJson, zStatLine, {}),
        weight: weights[i]! / totalWeight,
      })),
    );

    const baseConfidence = sources.reduce((sum, s, i) => sum + s.confidence * (weights[i]! / totalWeight), 0);
    const disagreement = sourceDisagreement(sources.map((s) => parseJson<StatLine>(s.statLineJson, zStatLine, {})));
    const confidence = Math.max(0.2, Math.min(0.97, baseConfidence - disagreement * 0.35));

    ops.push(
      prisma.projection.upsert({
        where: {
          playerId_season_week_source_leagueScope: {
            playerId,
            season,
            week,
            source: PROJECTION_SOURCES.CONSENSUS,
            leagueScope: GLOBAL_SCOPE,
          },
        },
        create: {
          playerId,
          season,
          week,
          source: PROJECTION_SOURCES.CONSENSUS,
          statLineJson: stringify(blended),
          floorStatLineJson: stringify(floor),
          ceilingStatLineJson: stringify(ceiling),
          confidence,
        },
        update: {
          statLineJson: stringify(blended),
          floorStatLineJson: stringify(floor),
          ceilingStatLineJson: stringify(ceiling),
          confidence,
        },
      }),
    );
    count++;
  }

  for (let i = 0; i < ops.length; i += 50) {
    await prisma.$transaction(ops.slice(i, i + 50));
  }
  return count;
}

function blendStatLines(parts: { line: StatLine; weight: number }[]): StatLine {
  const out: Record<string, number> = {};
  for (const { line, weight } of parts) {
    for (const [key, value] of Object.entries(line)) {
      if (typeof value !== 'number') continue;
      out[key] = (out[key] ?? 0) + value * weight;
    }
  }
  for (const key of Object.keys(out)) out[key] = Math.round(out[key]! * 1000) / 1000;
  return out as StatLine;
}

/** 0 (perfect agreement) .. 1 (wild disagreement) on the volume stats. */
function sourceDisagreement(lines: StatLine[]): number {
  if (lines.length < 2) return 0;
  const keys: (keyof StatLine)[] = ['passYards', 'rushYards', 'recYards', 'rec', 'sacks'];
  let total = 0;
  let counted = 0;
  for (const key of keys) {
    const values = lines.map((l) => l[key]).filter((v): v is number => typeof v === 'number' && v > 0);
    if (values.length < 2) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    total += Math.min(1, sd / mean);
    counted++;
  }
  return counted ? total / counted : 0;
}

export { kickoffSlot };
