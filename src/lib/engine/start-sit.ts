import type { PlayerCard } from '../data/context';
import type { StartSitVerdict } from '../domain/enums';
import { START_SIT_LABEL, NON_PLAYING_STATUSES } from '../domain/enums';
import { round1, round2 } from '../scoring/engine';
import type { LineupStrategy } from '../optimizer/lineup';

export interface StartSitRow {
  player: PlayerCard;
  verdict: StartSitVerdict;
  verdictLabel: string;
  /** Rank within the comparison, 1 = best. */
  rank: number;
  score: number;
  gapToBest: number;
  factors: { label: string; value: string; edge: 'up' | 'down' | 'flat' }[];
}

export interface StartSitResult {
  rows: StartSitRow[];
  recommendation: string;
  confidence: number;
  /** True when the top two are effectively tied. */
  tooClose: boolean;
  strategy: LineupStrategy;
}

/** Points within which two players are a coin flip. */
const TIE_WINDOW = 0.75;

/**
 * Compare any two or more players in ONE league's scoring.
 *
 * Pure function — the same code backs the comparison UI, the optimizer's
 * explanations, and "Ask My GM", so the three can never disagree.
 */
export function compareStartSit(players: PlayerCard[], strategy: LineupStrategy = 'BALANCED'): StartSitResult {
  const scored = players
    .map((player) => ({ player, score: scoreFor(player, strategy) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const gap = best && second ? round2(best.score - second.score) : 0;
  const tooClose = Boolean(second) && Math.abs(gap) < TIE_WINDOW;

  const rows: StartSitRow[] = scored.map((entry, idx) => {
    const gapToBest = round2((best?.score ?? 0) - entry.score);
    return {
      player: entry.player,
      score: round2(entry.score),
      rank: idx + 1,
      gapToBest,
      verdict: verdictFor(idx, gapToBest, entry.player, tooClose),
      verdictLabel: START_SIT_LABEL[verdictFor(idx, gapToBest, entry.player, tooClose)],
      factors: factorsFor(entry.player, best?.player ?? null),
    };
  });

  const confidence = computeConfidence(scored.map((s) => s.player), gap);

  return {
    rows,
    tooClose,
    confidence,
    strategy,
    recommendation: buildRecommendation(rows, gap, tooClose, strategy),
  };
}

function scoreFor(player: PlayerCard, strategy: LineupStrategy): number {
  const proj = player.projection;
  if (!proj || player.onBye) return -1;
  const weight = strategy === 'BALANCED' ? 0 : 0.3;
  const tilt = strategy === 'CEILING' ? proj.ceiling : proj.floor;
  return (proj.points * (1 - weight) + tilt * weight) * proj.playProbability;
}

function verdictFor(index: number, gapToBest: number, player: PlayerCard, tooClose: boolean): StartSitVerdict {
  if (player.onBye || NON_PLAYING_STATUSES.includes(player.injuryStatus)) return 'AVOID';
  if (index === 0) return tooClose ? 'COIN_FLIP' : gapToBest === 0 ? 'STRONG_START' : 'LEAN_START';
  if (tooClose && index === 1) return 'COIN_FLIP';
  if (gapToBest < 2) return 'LEAN_START';
  if (gapToBest < 5) return 'COIN_FLIP';
  return 'AVOID';
}

function factorsFor(player: PlayerCard, best: PlayerCard | null): StartSitRow['factors'] {
  const factors: StartSitRow['factors'] = [];
  const proj = player.projection;

  factors.push({
    label: 'Projection',
    value: proj ? `${round1(proj.points)} pts` : '—',
    edge: best && proj && best.projection ? compare(proj.points, best.projection.points) : 'flat',
  });
  factors.push({
    label: 'Floor / ceiling',
    value: proj ? `${round1(proj.floor)} – ${round1(proj.ceiling)}` : '—',
    edge: best && proj && best.projection ? compare(proj.ceiling, best.projection.ceiling) : 'flat',
  });
  factors.push({
    label: 'Opponent',
    value: player.onBye ? 'BYE' : player.game ? `${player.game.isHome ? 'vs' : '@'} ${player.game.opponentAbbr}` : 'no game',
    edge: 'flat',
  });
  factors.push({
    label: 'Status',
    value: player.injuryStatus === 'HEALTHY' ? 'Healthy' : player.injuryStatus.toLowerCase(),
    edge: player.injuryStatus === 'HEALTHY' ? 'flat' : 'down',
  });
  if (player.usage?.targets) {
    factors.push({
      label: 'Targets/gm',
      value: String(player.usage.targets),
      edge: best?.usage?.targets ? compare(player.usage.targets, best.usage.targets) : 'flat',
    });
  }
  if (player.usage?.carries) {
    factors.push({
      label: 'Carries/gm',
      value: String(player.usage.carries),
      edge: best?.usage?.carries ? compare(player.usage.carries, best.usage.carries) : 'flat',
    });
  }
  if (player.usage?.redZoneTouches) {
    factors.push({ label: 'Red-zone touches/gm', value: String(player.usage.redZoneTouches), edge: 'flat' });
  }
  if (player.game?.impliedPoints) {
    factors.push({
      label: 'Implied team total',
      value: player.game.impliedPoints.toFixed(1),
      edge: best?.game?.impliedPoints ? compare(player.game.impliedPoints, best.game.impliedPoints) : 'flat',
    });
  }
  if (player.bonusUpside > 0) {
    factors.push({ label: 'League bonus upside', value: `+${player.bonusUpside} in a ceiling game`, edge: 'up' });
  }
  factors.push({ label: 'Game time', value: player.game ? `${player.game.slotLabel}` : '—', edge: 'flat' });
  return factors;
}

function compare(a: number, b: number): 'up' | 'down' | 'flat' {
  if (Math.abs(a - b) < 0.05) return 'flat';
  return a > b ? 'up' : 'down';
}

function computeConfidence(players: PlayerCard[], gap: number): number {
  const trust = players.reduce((sum, p) => sum + (p.projection?.confidence ?? 0.5), 0) / Math.max(1, players.length);
  const injuryDrag = players.some((p) => p.injuryStatus === 'QUESTIONABLE') ? 0.1 : 0;
  const raw = 0.45 + Math.min(1, Math.abs(gap) / 6) * 0.33 + (trust - 0.6) * 0.3 - injuryDrag;
  return Math.round(Math.min(0.93, Math.max(0.35, raw)) * 100) / 100;
}

function buildRecommendation(rows: StartSitRow[], gap: number, tooClose: boolean, strategy: LineupStrategy): string {
  const best = rows[0];
  if (!best) return 'Pick at least two players to compare.';
  if (rows.length === 1) return `${best.player.name} projects ${round1(best.score)} in this league's scoring.`;

  const second = rows[1]!;
  if (tooClose) {
    const tiebreak =
      strategy === 'CEILING'
        ? `You need points this week, so the higher ceiling (${
            (best.player.projection?.ceiling ?? 0) >= (second.player.projection?.ceiling ?? 0) ? best.player.name : second.player.name
          }) is the tiebreak.`
        : strategy === 'FLOOR'
          ? `You are comfortably ahead, so the safer floor (${
              (best.player.projection?.floor ?? 0) >= (second.player.projection?.floor ?? 0) ? best.player.name : second.player.name
            }) is the tiebreak.`
          : 'There is no meaningful edge either way — go with the one you believe in.';
    return `${best.player.name} and ${second.player.name} are within ${Math.abs(gap)} points. This is a coin flip. ${tiebreak}`;
  }

  return `Start ${best.player.name} over ${second.player.name} — ${Math.abs(gap)} projected points in this league's scoring.`;
}
