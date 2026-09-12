import type { StatLine } from '../scoring/stats';
import { STAT_KEYS } from '../scoring/stats';
import type { Position } from '../domain/enums';
import { PLAY_PROBABILITY, type InjuryStatus } from '../domain/enums';
import { ratingFor, LEAGUE_AVERAGE_RATING } from '../seed/team-strength';

export interface GameContext {
  opponentAbbr: string | null;
  isHome: boolean;
  /** Vegas implied team total for the player's own team. */
  impliedPoints: number | null;
  opponentImplied: number | null;
  /** Positive when the player's team is favored. */
  spread: number | null;
  overUnder: number | null;
  isDome: boolean;
  kickoff: Date | null;
  /** m/s wind + precipitation probability, when a weather source is wired up. */
  windMph?: number | null;
  precipChance?: number | null;
}

export interface ProjectionAdjustment {
  label: string;
  /** Multiplier applied (1.08 = +8%). */
  factor: number;
  detail: string;
}

export interface ModeledProjection {
  /** Expected stat line ASSUMING the player is active. */
  statLine: StatLine;
  floorStatLine: StatLine;
  ceilingStatLine: StatLine;
  adjustments: ProjectionAdjustment[];
  /** 0..1 confidence in the projection itself (role + matchup certainty). */
  confidence: number;
  /** 0..1 probability the player actually suits up. */
  playProbability: number;
}

const LEAGUE_AVERAGE_IMPLIED = 22.5;

/** Position-specific floor/ceiling spread, as a fraction of the mean. */
const SPREAD_BY_POSITION: Record<Position, { floor: number; ceiling: number }> = {
  QB: { floor: 0.32, ceiling: 0.4 },
  RB: { floor: 0.42, ceiling: 0.58 },
  WR: { floor: 0.48, ceiling: 0.66 },
  TE: { floor: 0.46, ceiling: 0.62 },
  K: { floor: 0.42, ceiling: 0.52 },
  DST: { floor: 0.55, ceiling: 0.75 },
};

/** Which side of the opposing defense each position is graded against. */
function defenseKeyFor(position: Position): 'passDefense' | 'rushDefense' | 'defense' {
  if (position === 'RB') return 'rushDefense';
  if (position === 'QB' || position === 'WR' || position === 'TE') return 'passDefense';
  return 'defense';
}

/**
 * Turn a baseline per-game stat line into a week-specific projection.
 *
 * Deliberately simple and explainable — every factor is returned with a label
 * so the UI (and "Ask My GM") can state *why* a number moved, and none of it is
 * league-specific. League scoring is applied afterwards, once per league.
 */
export function modelProjection(args: {
  position: Position;
  baseStatLine: StatLine;
  volatility: number;
  roleStability: number;
  injuryStatus: InjuryStatus;
  game: GameContext | null;
  /** Player-specific volume multiplier from the seed/usage data. */
  usageMod?: number;
}): ModeledProjection {
  const { position, baseStatLine, roleStability, injuryStatus, game } = args;
  const adjustments: ProjectionAdjustment[] = [];
  let factor = args.usageMod ?? 1;
  if (args.usageMod && Math.abs(args.usageMod - 1) > 0.001) {
    adjustments.push({
      label: 'Role/usage',
      factor: args.usageMod,
      detail: args.usageMod > 1 ? 'Usage trending above the archetype baseline' : 'Usage below the archetype baseline',
    });
  }

  if (!game || !game.kickoff) {
    // No game this week: bye, unscheduled, or unknown NFL team.
    return {
      statLine: {},
      floorStatLine: {},
      ceilingStatLine: {},
      adjustments: [{ label: 'No game', factor: 0, detail: 'Bye week or no scheduled opponent — projects zero.' }],
      confidence: 0.99,
      playProbability: 0,
    };
  }

  // --- matchup ---------------------------------------------------------
  const opp = ratingFor(game.opponentAbbr);
  const key = defenseKeyFor(position);
  const oppDefenseRating = opp[key];
  const leagueAvg = LEAGUE_AVERAGE_RATING[key];
  // A 10-point rating edge is worth roughly 4% of production.
  const matchupFactor = clamp(1 + (leagueAvg - oppDefenseRating) * 0.004, 0.82, 1.18);
  if (Math.abs(matchupFactor - 1) > 0.01) {
    factor *= matchupFactor;
    adjustments.push({
      label: 'Matchup',
      factor: matchupFactor,
      detail: `${game.opponentAbbr ?? 'Opponent'} ranks ${describeRating(oppDefenseRating)} against the ${key === 'rushDefense' ? 'run' : 'pass'}`,
    });
  }

  // --- game environment ------------------------------------------------
  if (game.impliedPoints) {
    const envFactor = clamp(Math.pow(game.impliedPoints / LEAGUE_AVERAGE_IMPLIED, 0.45), 0.85, 1.2);
    if (Math.abs(envFactor - 1) > 0.01) {
      factor *= envFactor;
      adjustments.push({
        label: 'Team total',
        factor: envFactor,
        detail: `Implied team total ${game.impliedPoints.toFixed(1)} vs ${LEAGUE_AVERAGE_IMPLIED} league average`,
      });
    }
  }

  // --- game script -----------------------------------------------------
  if (game.spread !== null && game.spread !== undefined) {
    // spread > 0 means this player's team is favored: more rushing, less passing volume.
    const scriptFactor =
      position === 'RB'
        ? clamp(1 + game.spread * 0.012, 0.9, 1.12)
        : position === 'WR' || position === 'TE'
          ? clamp(1 - game.spread * 0.006, 0.92, 1.08)
          : 1;
    if (Math.abs(scriptFactor - 1) > 0.01) {
      factor *= scriptFactor;
      adjustments.push({
        label: 'Game script',
        factor: scriptFactor,
        detail: game.spread > 0 ? `Favored by ${game.spread}` : `Underdog by ${Math.abs(game.spread)}`,
      });
    }
  }

  // --- home / away -----------------------------------------------------
  const homeFactor = game.isHome ? 1.02 : 0.985;
  factor *= homeFactor;
  adjustments.push({ label: game.isHome ? 'Home' : 'Away', factor: homeFactor, detail: game.isHome ? 'At home' : 'On the road' });

  // --- weather ---------------------------------------------------------
  if (!game.isDome && (game.windMph || game.precipChance)) {
    const wind = game.windMph ?? 0;
    const precip = game.precipChance ?? 0;
    const passHit = clamp(1 - Math.max(0, wind - 12) * 0.012 - precip * 0.0008, 0.8, 1);
    if (passHit < 0.995) {
      const applies = position === 'QB' || position === 'WR' || position === 'TE' || position === 'K';
      if (applies) {
        factor *= passHit;
        adjustments.push({ label: 'Weather', factor: passHit, detail: `${wind} mph wind, ${precip}% precipitation` });
      }
    }
  }

  const statLine = scaleFor(position, baseStatLine, factor);

  // --- distribution ----------------------------------------------------
  const spreadCfg = SPREAD_BY_POSITION[position];
  const stability = clamp(roleStability, 0.3, 1);
  // A shakier role widens the distribution.
  const widen = 1 + (1 - stability) * 0.6;
  const floorStatLine = scaleFor(position, statLine, clamp(1 - spreadCfg.floor * widen, 0.15, 1));
  const ceilingStatLine = scaleFor(position, statLine, 1 + spreadCfg.ceiling * widen);

  const playProbability = PLAY_PROBABILITY[injuryStatus] ?? 0.9;
  const confidence = clamp(
    0.45 + stability * 0.4 + (injuryStatus === 'HEALTHY' ? 0.12 : injuryStatus === 'UNKNOWN' ? 0.04 : -0.08),
    0.2,
    0.97,
  );

  return { statLine, floorStatLine, ceilingStatLine, adjustments, confidence, playProbability };
}

/**
 * Scale a stat line. D/ST "points allowed" and "yards allowed" move INVERSELY
 * to production, so a better outlook means fewer points allowed.
 */
function scaleFor(position: Position, line: StatLine, factor: number): StatLine {
  const out: StatLine = {};
  for (const key of STAT_KEYS) {
    const v = line[key];
    if (v === undefined) continue;
    if (key === 'pointsAllowed' || key === 'yardsAllowed') {
      // Invert: factor 1.10 (10% better defense) -> ~10% fewer allowed.
      out[key] = round(v / Math.max(factor, 0.2), 1);
    } else if (key === 'passInt' || key === 'fumblesLost' || key === 'fgMissed' || key === 'patMissed') {
      // Negative events don't scale up with a good matchup.
      out[key] = round(v, 3);
    } else {
      out[key] = round(v * factor, 3);
    }
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

function describeRating(rating: number): string {
  if (rating >= 68) return 'among the toughest';
  if (rating >= 60) return 'above average';
  if (rating >= 52) return 'about average';
  if (rating >= 45) return 'below average';
  return 'among the most generous';
}
