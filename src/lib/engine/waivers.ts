import { prisma } from '../db';
import { buildPlayerCards, type LeagueContext, type PlayerCard } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { rosLineupValue } from '../optimizer/ros';
import { NON_PLAYING_STATUSES, type Position, type WaiverPriority } from '../domain/enums';
import { round1, round2 } from '../scoring/engine';

export interface WaiverCandidate {
  player: PlayerCard;
  /** Overall ranking score (0-100). */
  score: number;
  priority: WaiverPriority;
  /** Points this add would put into THIS WEEK's starting lineup. */
  lineupGain: number;
  /** Per-week rest-of-season gain over the player he would replace. */
  rosGain: number;
  dropCandidate: PlayerCard | null;
  reason: string;
  evidence: string[];
  /** True for "get him before the league notices" adds. */
  speculative: boolean;
  /**
   * False when this compares an app ESTIMATE against a real provider number.
   * Such a comparison cannot be trusted to a tenth of a point, and the UI says so.
   */
  comparisonIsReliable: boolean;
}

export interface WaiverReport {
  leagueId: string;
  leagueName: string;
  week: number;
  candidates: WaiverCandidate[];
  /** Roster holes this report is trying to fill. */
  weaknesses: { position: Position; replacementPoints: number; note: string }[];
  openRosterSpots: number;
}

/**
 * Rank the free agents actually available IN THIS LEAGUE.
 *
 * The ranking is not "who is best" — it is "who most improves MY team",
 * measured by re-running the lineup optimizer with the player added and the
 * weakest droppable player removed. That is what makes the recommendation
 * roster-specific and league-scoring-specific.
 */
export async function buildWaiverReport(ctx: LeagueContext, limit = 8, now: Date = new Date()): Promise<WaiverReport> {
  const snapshots = await prisma.freeAgentSnapshot.findMany({
    where: { leagueId: ctx.league.id, availability: { in: ['FREE_AGENT', 'WAIVERS'] } },
    orderBy: { percentOwned: 'desc' },
    take: 220,
  });

  const rosteredIds = new Set(ctx.all.map((p) => p.id));
  // Never recommend a player already on my roster in THIS league.
  const candidateIds = snapshots.map((s) => s.playerId).filter((id) => !rosteredIds.has(id));

  const candidates = await buildPlayerCards(candidateIds, ctx.config, ctx.season, ctx.week, now, {
    leagueId: ctx.league.id,
  });

  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const { strategy } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
  const baseline = optimizeLineup({ roster: ctx.all, slots, strategy });
  const rosBaseline = rosLineupValue(ctx.all, slots);

  const weaknesses = findWeaknesses(ctx, slots);
  const dropPool = droppablePlayers(ctx);

  const scored: WaiverCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.projection && !candidate.rosPerGame) continue;

    // Prefer dropping someone whose position we are deep at.
    const dropCandidate = ctx.openBenchSlots > 0 ? null : pickDropTarget(dropPool, candidate);
    const simulatedRoster = simulateRoster(ctx.all, candidate, dropCandidate);
    const simulated = optimizeLineup({ roster: simulatedRoster, slots, strategy });
    const lineupGain = round2(simulated.optimalProjected - baseline.optimalProjected);

    // Rest-of-season gain is measured the same way as the weekly gain: how much
    // the OPTIMAL LINEUP improves, not how good the player is in isolation. A
    // strong QB behind a strong QB adds nothing, and this is what says so.
    const rosGain = round2(rosLineupValue(simulatedRoster, slots) - rosBaseline);
    const evidence = buildEvidence(candidate);
    const opportunity = opportunityScore(candidate);
    const scarcity = weaknesses.find((w) => w.position === candidate.position) ? 8 : 0;

    const score = round1(
      Math.max(0, lineupGain) * 6 +
        Math.max(0, rosGain) * 3.5 +
        opportunity * 0.35 +
        scarcity +
        Math.min(8, (candidate.trendingAdds ?? 0) / 2500) +
        (candidate.projection ? candidate.projection.ceiling * 0.12 : 0),
    );

    // A "speculative" add is a BACKUP whose usage is trending up — not a
    // starter who simply isn't better than what I already have.
    const isBackup = (candidate.depthChartOrder ?? 1) >= 2;
    const speculative = lineupGain <= 0.5 && opportunity >= 30 && (isBackup || (candidate.trendingAdds ?? 0) > 5000);

    // Comparing an estimated free-agent projection against ESPN's real number
    // for a rostered player is apples to oranges. Flag it rather than quietly
    // presenting the difference as fact.
    const rosterHasRealProjections = ctx.all.some((pl) => pl.projectionIsReal);
    const comparisonIsReliable = candidate.projectionIsReal || !rosterHasRealProjections;
    scored.push({
      player: candidate,
      score,
      priority: priorityFor(score, lineupGain, speculative),
      lineupGain,
      rosGain,
      dropCandidate,
      reason: buildReason(candidate, lineupGain, rosGain, evidence, speculative, comparisonIsReliable),
      evidence,
      speculative,
      comparisonIsReliable,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    leagueId: ctx.league.id,
    leagueName: ctx.league.name,
    week: ctx.week,
    candidates: scored.slice(0, limit),
    weaknesses,
    openRosterSpots: ctx.openBenchSlots,
  };
}

/** Swap a candidate in (and optionally a player out) without mutating context. */
function simulateRoster(roster: PlayerCard[], addition: PlayerCard, drop: PlayerCard | null): PlayerCard[] {
  const next = roster.filter((p) => p.id !== drop?.id);
  next.push({ ...addition, slot: 'BENCH', slotIndex: 99 });
  return next;
}

/**
 * Who can be dropped. Deliberately protective of high-upside depth: a
 * handcuff's value is contingent, so it is not judged on this week's projection.
 */
export function droppablePlayers(ctx: LeagueContext): PlayerCard[] {
  return ctx.bench
    .filter((p) => p.lock !== 'LOCKED')
    .map((p) => ({ player: p, value: dropValue(p) }))
    .sort((a, b) => a.value - b.value)
    .map((x) => x.player);
}

/**
 * Value used ONLY for deciding who to drop.
 * Ceiling is weighted heavily so we don't cut a league-winning handcuff for a
 * 0.4-point weekly upgrade.
 */
export function dropValue(p: PlayerCard): number {
  const ros = p.rosPerGame ?? 0;
  const ceiling = p.projection?.ceiling ?? 0;
  const contingentUpside = isLikelyHandcuff(p) ? 3.5 : 0;
  return round2(ros * 0.65 + ceiling * 0.25 + contingentUpside);
}

export function isLikelyHandcuff(p: PlayerCard): boolean {
  if (p.position !== 'RB') return false;
  if ((p.depthChartOrder ?? 9) <= 1) return false;
  // A backup with a real snap share on a good offense is the classic
  // one-injury-away asset.
  return (p.usage?.snapShare ?? 0) >= 0.15 || (p.projection?.ceiling ?? 0) >= 9;
}

function pickDropTarget(pool: PlayerCard[], candidate: PlayerCard): PlayerCard | null {
  const target = pool[0] ?? null;
  if (!target) return null;
  // Don't propose dropping someone clearly better than the add.
  if (dropValue(target) > dropValue(candidate) + 1.5) return null;
  return target;
}

function opportunityScore(p: PlayerCard): number {
  const snap = p.position === 'DST' || p.position === 'K' ? 0 : (p.usage?.snapShare ?? 0) * 40;
  const targets = Math.min(12, p.usage?.targets ?? 0) * 2.2;
  const carries = Math.min(18, p.usage?.carries ?? 0) * 1.5;
  const rz = Math.min(4, p.usage?.redZoneTouches ?? 0) * 3;
  const depth = p.depthChartOrder === 1 ? 10 : p.depthChartOrder === 2 ? 4 : 0;
  return round1(snap + targets + carries + rz + depth);
}

function buildEvidence(p: PlayerCard): string[] {
  const out: string[] = [];
  // Snap share is meaningless for a team defense or a kicker.
  if (p.usage?.snapShare && p.position !== 'DST' && p.position !== 'K') {
    out.push(`${Math.min(100, Math.round(p.usage.snapShare * 100))}% snap share`);
  }
  if (p.usage?.targets) out.push(`${p.usage.targets} targets/gm`);
  if (p.usage?.carries) out.push(`${p.usage.carries} carries/gm`);
  if (p.usage?.redZoneTouches) out.push(`${p.usage.redZoneTouches} red-zone touches/gm`);
  if (p.depthChartOrder === 1) out.push('listed first on the depth chart');
  if (p.trendingAdds) out.push(`${p.trendingAdds.toLocaleString()} adds across fantasy in the last 48h`);
  if (p.percentOwned !== null) out.push(`${Math.round(p.percentOwned)}% rostered`);
  if (p.projection && p.bonusUpside > 0.5) {
    out.push(`this league's yardage bonus is worth an extra ${p.bonusUpside} in his ceiling game`);
  }
  if (p.game?.impliedPoints) out.push(`${p.game.impliedPoints.toFixed(1)} implied team total vs ${p.game.opponentAbbr}`);
  return out;
}

function buildReason(
  p: PlayerCard,
  lineupGain: number,
  rosGain: number,
  evidence: string[],
  speculative: boolean,
  comparisonIsReliable = true,
): string {
  const caveat = comparisonIsReliable
    ? ''
    : ` Note: ${p.name}'s projection is this app's own estimate, while your rostered players are on ESPN's real numbers — so treat the point difference as a lead to check, not a fact. Sync ESPN for a like-for-like comparison.`;

  if (speculative) {
    return `Speculative add: ${evidence.slice(0, 2).join(', ') || 'rising role'}. He does not start for you today, but he is one injury or one usage bump away from mattering.${caveat}`;
  }
  const pieces: string[] = [];
  if (lineupGain > 0.3) pieces.push(`starts for you immediately (+${lineupGain} to this week's lineup)`);
  if (rosGain > 0.3) pieces.push(`+${rosGain} pts/week rest-of-season over the player he replaces`);
  if (pieces.length === 0) pieces.push('bench depth — he does not beat anyone in your lineup this week');
  return `${pieces.join('; ')}. ${evidence.slice(0, 3).join(', ')}.${caveat}`;
}

function priorityFor(score: number, lineupGain: number, speculative: boolean): WaiverPriority {
  if (speculative) return 'SPECULATIVE';
  if (score >= 28 || lineupGain >= 2.5) return 'HIGH';
  if (score >= 14 || lineupGain >= 0.8) return 'MEDIUM';
  return 'LOW';
}

/** Positions where my current starter/bench quality is weakest. */
export function findWeaknesses(ctx: LeagueContext, slots: SlotDefinition[]): WaiverReport['weaknesses'] {
  const out: WaiverReport['weaknesses'] = [];
  const startingPositions = new Set<Position>();
  for (const s of slots) for (const p of s.eligible) startingPositions.add(p);

  for (const position of startingPositions) {
    const owned = ctx.all
      .filter((p) => p.position === position && p.slot !== 'IR')
      .map((p) => p.rosPerGame ?? 0)
      .sort((a, b) => b - a);
    const needed = slots.filter((s) => s.slot === position).reduce((sum, s) => sum + s.starters, 0);
    const marginal = owned[needed] ?? 0; // the first player past the starters
    if (owned.length <= needed) {
      out.push({ position, replacementPoints: marginal, note: `No usable backup at ${position}.` });
    } else if (marginal < 5 && ['RB', 'WR', 'TE'].includes(position)) {
      out.push({ position, replacementPoints: round1(marginal), note: `Thin behind your ${position} starters (${round1(marginal)} pts/wk).` });
    }
  }
  return out;
}

/**
 * Continuous roster-improvement scan: which rostered players are beaten by
 * available ones, without waiting to be asked.
 */
export function rosterUpgrades(ctx: LeagueContext, report: WaiverReport): {
  drop: PlayerCard;
  betterOptions: WaiverCandidate[];
  note: string;
}[] {
  const results: { drop: PlayerCard; betterOptions: WaiverCandidate[]; note: string }[] = [];
  const worst = droppablePlayers(ctx).slice(0, 2);
  for (const player of worst) {
    const better = report.candidates.filter((c) => (c.player.rosPerGame ?? 0) > (player.rosPerGame ?? 0) + 0.6);
    if (better.length === 0) continue;
    const protectedNote = isLikelyHandcuff(player)
      ? ` Keep in mind ${player.name} is a handcuff — his value is contingent, not weekly.`
      : '';
    results.push({
      drop: player,
      betterOptions: better.slice(0, 3),
      note: `${player.name} is your lowest-value bench asset (${round1(player.rosPerGame ?? 0)} pts/wk rest-of-season). ${better.length} available player${
        better.length === 1 ? '' : 's'
      } project higher.${protectedNote}`,
    });
  }
  return results;
}

export { NON_PLAYING_STATUSES };
