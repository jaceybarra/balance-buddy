import type { StatLine } from '../scoring/stats';
import { ratingFor } from '../seed/team-strength';
import type { GameContext } from './model';

/**
 * Dedicated D/ST model.
 *
 * A defense's fantasy output is almost entirely a function of WHO it plays, so
 * modeling it off the opponent (implied points, giveaway rate, offensive
 * quality) is far more accurate than scaling a generic archetype. The output is
 * a stat line, which each league then prices with its own brackets — which
 * matters because a shutout is worth 5 in one of these leagues and 6 in the other.
 */
export function modelDstProjection(teamAbbr: string, game: GameContext | null): {
  statLine: StatLine;
  floorStatLine: StatLine;
  ceilingStatLine: StatLine;
  drivers: string[];
} {
  if (!game) {
    return { statLine: {}, floorStatLine: {}, ceilingStatLine: {}, drivers: ['No game scheduled (bye week).'] };
  }
  const self = ratingFor(teamAbbr);
  const opp = ratingFor(game.opponentAbbr);
  const drivers: string[] = [];

  const impliedAgainst = game.opponentImplied ?? 22.5;
  drivers.push(`${game.opponentAbbr ?? 'Opponent'} implied for ${impliedAgainst.toFixed(1)} points`);

  // Pressure: our pass rush vs their offense, nudged by game script (trailing
  // offenses drop back more, which creates sacks).
  const scriptBoost = game.spread !== null && game.spread > 0 ? 1 + Math.min(game.spread, 10) * 0.012 : 1;
  const sacks = clamp((self.passRush / 55) * 2.4 * (110 - opp.offense) / 52 * scriptBoost, 0.8, 4.6);
  if (self.passRush >= 65) drivers.push('Top-tier pass rush');
  if (game.spread !== null && game.spread > 3) drivers.push(`Favored by ${game.spread} — positive game script for sacks`);

  const giveawayFactor = opp.giveaways / 49;
  const defInt = clamp(0.75 * giveawayFactor * (self.passDefense / 55), 0.25, 1.9);
  const fumRec = clamp(0.52 * giveawayFactor, 0.2, 1.2);
  if (opp.giveaways >= 55) drivers.push('Opponent among the most turnover-prone offenses');

  const defTdRate = clamp((defInt + fumRec) * 0.075, 0.02, 0.22);

  const yardsAllowed = clamp(300 + (opp.offense - 57) * 4.2 - (self.defense - 56) * 3.4, 190, 470);
  const pointsAllowed = clamp(impliedAgainst, 6, 38);

  const statLine: StatLine = {
    sacks: round(sacks, 2),
    defInt: round(defInt, 2),
    fumRec: round(fumRec, 2),
    safety: 0.04,
    blockedKick: 0.06,
    intReturnTD: round(defTdRate * 0.6, 3),
    fumbleReturnTD: round(defTdRate * 0.4, 3),
    kickReturnTD: 0.015,
    puntReturnTD: 0.02,
    kickReturnYards: 40,
    puntReturnYards: 16,
    pointsAllowed: round(pointsAllowed, 1),
    yardsAllowed: round(yardsAllowed, 0),
  };

  // Floor: they score their implied total plus a touchdown, no takeaways.
  const floorStatLine: StatLine = {
    ...statLine,
    sacks: round(sacks * 0.55, 2),
    defInt: round(defInt * 0.3, 2),
    fumRec: round(fumRec * 0.3, 2),
    intReturnTD: 0,
    fumbleReturnTD: 0,
    kickReturnTD: 0,
    puntReturnTD: 0,
    pointsAllowed: round(pointsAllowed + 7.5, 1),
    yardsAllowed: round(yardsAllowed + 55, 0),
  };

  // Ceiling: a takeaway-heavy, low-scoring game.
  const ceilingStatLine: StatLine = {
    ...statLine,
    sacks: round(sacks * 1.6, 2),
    defInt: round(defInt * 2.1, 2),
    fumRec: round(fumRec * 1.9, 2),
    intReturnTD: round(defTdRate * 2.4, 3),
    fumbleReturnTD: round(defTdRate * 1.4, 3),
    pointsAllowed: round(Math.max(0, pointsAllowed - 11), 1),
    yardsAllowed: round(Math.max(90, yardsAllowed - 95), 0),
  };

  return { statLine, floorStatLine, ceilingStatLine, drivers };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round(v: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}
