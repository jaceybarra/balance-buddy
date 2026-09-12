import { prisma } from '../db';
import { buildPlayerCards, type LeagueContext, type PlayerCard } from '../data/context';
import { modelDstProjection } from '../projections/dst';
import type { Position } from '../domain/enums';
import { round1, round2 } from '../scoring/engine';

export interface StreamerOption {
  player: PlayerCard;
  projected: number;
  gain: number;
  drivers: string[];
  confidence: number;
}

export interface StreamerReport {
  position: Position;
  incumbent: PlayerCard | null;
  incumbentProjected: number;
  options: StreamerOption[];
  recommendation: string | null;
  /** True when the incumbent is fine and we should say "no action". */
  holdSteady: boolean;
}

/**
 * Streaming recommendations for the positions where week-to-week matchup
 * dominates talent: D/ST first, then K, and QB/TE only when the roster
 * actually has a hole there.
 *
 * The model is league-specific because the defensive brackets differ between
 * these two leagues (a shutout is 5 points in one and 6 in the other), so the
 * same defense can rank differently in each.
 */
export async function buildStreamerReports(ctx: LeagueContext, now: Date = new Date()): Promise<StreamerReport[]> {
  const positions: Position[] = ['DST', 'K'];
  const qbStarters = ctx.slots.find((s) => s.slot === 'QB')?.starters ?? 1;
  const teStarters = ctx.slots.find((s) => s.slot === 'TE')?.starters ?? 1;

  const startingQbs = ctx.starters.filter((p) => p.position === 'QB');
  const startingTes = ctx.starters.filter((p) => p.position === 'TE');
  // Only stream QB/TE when the position is genuinely weak or unfilled.
  if (startingQbs.length < qbStarters || (startingQbs[0]?.projection?.expected ?? 0) < 13) positions.push('QB');
  if (startingTes.length < teStarters || (startingTes[0]?.projection?.expected ?? 0) < 6.5) positions.push('TE');

  const snapshots = await prisma.freeAgentSnapshot.findMany({
    where: { leagueId: ctx.league.id, availability: { in: ['FREE_AGENT', 'WAIVERS'] } },
    select: { playerId: true },
    take: 250,
  });
  const rosteredIds = new Set(ctx.all.map((p) => p.id));
  const availableIds = snapshots.map((s) => s.playerId).filter((id) => !rosteredIds.has(id));
  const available = await buildPlayerCards(availableIds, ctx.config, ctx.season, ctx.week, now, { leagueId: ctx.league.id });

  const reports: StreamerReport[] = [];
  for (const position of positions) {
    const incumbent = ctx.starters.find((p) => p.position === position) ?? null;
    const incumbentProjected = incumbent?.projection?.expected ?? 0;

    const options = available
      .filter((p) => p.position === position && !p.onBye && p.projection)
      .map<StreamerOption>((p) => ({
        player: p,
        projected: p.projection!.expected,
        gain: round2(p.projection!.expected - incumbentProjected),
        drivers: streamDrivers(p),
        confidence: streamConfidence(p, incumbent),
      }))
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 4);

    const best = options[0];
    // Streaming churn costs a roster spot and a waiver claim, so require a
    // meaningful edge before recommending a change.
    const threshold = position === 'DST' ? 2.0 : position === 'K' ? 1.5 : 2.5;
    const holdSteady = !best || best.gain < threshold || incumbent?.lock === 'LOCKED';

    reports.push({
      position,
      incumbent,
      incumbentProjected: round1(incumbentProjected),
      options,
      holdSteady,
      recommendation:
        holdSteady || !best
          ? incumbent
            ? `Hold ${incumbent.name}. Nothing available clears him by enough to be worth the roster move.`
            : null
          : `Stream ${best.player.name} (${round1(best.projected)} projected, +${best.gain} over ${incumbent?.name ?? 'an empty slot'}). ${best.drivers.slice(0, 2).join('; ')}.`,
    });
  }

  return reports;
}

function streamDrivers(p: PlayerCard): string[] {
  const drivers: string[] = [];
  if (p.position === 'DST' && p.nflTeamAbbr && p.game) {
    const model = modelDstProjection(p.nflTeamAbbr, {
      opponentAbbr: p.game.opponentAbbr,
      isHome: p.game.isHome,
      impliedPoints: p.game.impliedPoints,
      opponentImplied: p.game.opponentImplied,
      spread: p.game.spread,
      overUnder: p.game.overUnder,
      isDome: false,
      kickoff: p.game.kickoff,
    });
    drivers.push(...model.drivers);
  }
  if (p.game?.opponentImplied) drivers.push(`opponent implied ${p.game.opponentImplied.toFixed(1)}`);
  if (p.game?.isHome) drivers.push('at home');
  if (p.projection?.ceiling) drivers.push(`ceiling ${round1(p.projection.ceiling)}`);
  return drivers;
}

function streamConfidence(option: PlayerCard, incumbent: PlayerCard | null): number {
  const gap = (option.projection?.expected ?? 0) - (incumbent?.projection?.expected ?? 0);
  const base = 0.5 + Math.min(0.35, Math.abs(gap) / 8);
  // Defenses are inherently volatile — cap how confident we let ourselves sound.
  const cap = option.position === 'DST' ? 0.78 : 0.88;
  return Math.round(Math.min(cap, base) * 100) / 100;
}
