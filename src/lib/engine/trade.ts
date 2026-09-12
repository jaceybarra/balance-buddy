import { buildPlayerCards, type LeagueContext, type PlayerCard } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { rosLineupValue } from '../optimizer/ros';
import { REGULAR_SEASON_WEEKS } from '../seed/schedule';
import { round1, round2 } from '../scoring/engine';
import type { TradeVerdict } from '../domain/enums';

export interface TradeInput {
  /** Players leaving my roster. */
  give: string[];
  /** Players joining my roster (may not be in my league's roster set). */
  get: string[];
}

export interface TradeResult {
  verdict: TradeVerdict;
  verdictLabel: string;
  /** Change in this week's optimal starting lineup. */
  lineupDelta: number;
  /** Change in rest-of-season starting-lineup points per week. */
  rosDelta: number;
  /** Change in bench quality (depth). */
  depthDelta: number;
  /** Roster-size legality after the trade. */
  legal: boolean;
  legalityNote: string | null;
  explanation: string;
  details: {
    label: string;
    before: number;
    after: number;
    delta: number;
    note: string;
  }[];
  give: PlayerCard[];
  get: PlayerCard[];
  risks: string[];
}

const VERDICT_LABEL: Record<TradeVerdict, string> = {
  ACCEPT: 'Accept',
  LEAN_ACCEPT: 'Lean accept',
  EVEN: 'Even',
  LEAN_DECLINE: 'Lean decline',
  DECLINE: 'Decline',
};

/**
 * Evaluate a proposed trade by REBUILDING THE ROSTER, not by adding up points.
 *
 * The question the model answers is "how many points does my actual starting
 * lineup gain, this week and per week for the rest of the season" — a WAR-style
 * view. Two RB2s for an RB1 can be a clear win even when the raw point totals
 * favor the other side, because only one of them starts.
 */
export async function analyzeTrade(ctx: LeagueContext, input: TradeInput, now: Date = new Date()): Promise<TradeResult> {
  const giveSet = new Set(input.give);
  const give = ctx.all.filter((p) => giveSet.has(p.id));
  const get = await buildPlayerCards(input.get, ctx.config, ctx.season, ctx.week, now, { leagueId: ctx.league.id });

  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const { strategy } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);

  const before = optimizeLineup({ roster: ctx.all, slots, strategy });
  const afterRoster: PlayerCard[] = [
    ...ctx.all.filter((p) => !giveSet.has(p.id)),
    ...get.map((p) => ({ ...p, slot: 'BENCH' as const, slotIndex: 90 })),
  ];
  const after = optimizeLineup({ roster: afterRoster, slots, strategy });

  const lineupDelta = round2(after.optimalProjected - before.optimalProjected);

  // Rest-of-season: run the same optimizer on per-game ROS values by
  // substituting the ROS number in as the weekly projection.
  const rosBefore = rosLineupValue(ctx.all, slots);
  const rosAfter = rosLineupValue(afterRoster, slots);
  const rosDelta = round2(rosAfter - rosBefore);

  const depthBefore = depthValue(ctx.all, slots);
  const depthAfter = depthValue(afterRoster, slots);
  const depthDelta = round2(depthAfter - depthBefore);

  const rosterMax = rosterCapacity(ctx);
  const sizeAfter = afterRoster.filter((p) => p.slot !== 'IR').length;
  const legal = sizeAfter <= rosterMax;

  const weeksLeft = Math.max(1, REGULAR_SEASON_WEEKS - ctx.week + 1);
  // Weight: rest-of-season matters far more than a single week.
  const composite = rosDelta * 0.62 + lineupDelta * 0.23 + depthDelta * 0.15;

  const verdict = verdictFor(composite);
  const risks = collectRisks(give, get);

  return {
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    lineupDelta,
    rosDelta,
    depthDelta,
    legal,
    legalityNote: legal
      ? null
      : `This trade leaves you with ${sizeAfter} players and your roster holds ${rosterMax}. You would have to drop ${sizeAfter - rosterMax}.`,
    explanation: buildExplanation({ ctx, give, get, lineupDelta, rosDelta, depthDelta, weeksLeft, verdict, risks }),
    details: [
      {
        label: 'This week’s starting lineup',
        before: before.optimalProjected,
        after: after.optimalProjected,
        delta: lineupDelta,
        note: 'Optimal legal lineup, both before and after.',
      },
      {
        label: 'Starting lineup, per week rest-of-season',
        before: round1(rosBefore),
        after: round1(rosAfter),
        delta: rosDelta,
        note: `Across the ${weeksLeft} weeks left in the regular season.`,
      },
      {
        label: 'Bench depth',
        before: round1(depthBefore),
        after: round1(depthAfter),
        delta: depthDelta,
        note: 'Value of the best few players who are NOT starting — your injury insurance.',
      },
    ],
    give,
    get,
    risks,
  };
}

/** Value of the top bench pieces — what you fall back on when a starter is out. */
function depthValue(roster: PlayerCard[], slots: SlotDefinition[]): number {
  const result = optimizeLineup({ roster, slots, strategy: 'BALANCED' });
  const startingIds = new Set(result.assignments.map((a) => a.player?.id).filter(Boolean) as string[]);
  const bench = roster
    .filter((p) => !startingIds.has(p.id) && p.slot !== 'IR')
    .map((p) => p.rosPerGame ?? 0)
    .sort((a, b) => b - a);
  return bench.slice(0, 4).reduce((s, v) => s + v, 0);
}

function rosterCapacity(ctx: LeagueContext): number {
  return ctx.slots.filter((s) => s.slot !== 'IR').reduce((sum, s) => sum + s.starters, 0);
}

function verdictFor(composite: number): TradeVerdict {
  if (composite >= 2.5) return 'ACCEPT';
  if (composite >= 0.8) return 'LEAN_ACCEPT';
  if (composite > -0.8) return 'EVEN';
  if (composite > -2.5) return 'LEAN_DECLINE';
  return 'DECLINE';
}

function collectRisks(give: PlayerCard[], get: PlayerCard[]): string[] {
  const risks: string[] = [];
  for (const p of get) {
    if (['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR'].includes(p.injuryStatus)) {
      risks.push(`${p.name} is currently ${p.injuryStatus.toLowerCase()} — you are buying an injury risk.`);
    }
    if (p.byeWeek) risks.push(`${p.name} is on bye in week ${p.byeWeek}.`);
  }
  for (const p of give) {
    if ((p.projection?.ceiling ?? 0) > (p.projection?.points ?? 0) * 1.6) {
      risks.push(`${p.name} carries real ceiling (${round1(p.projection?.ceiling ?? 0)}); you are trading upside away.`);
    }
  }
  return risks;
}

function buildExplanation(args: {
  ctx: LeagueContext;
  give: PlayerCard[];
  get: PlayerCard[];
  lineupDelta: number;
  rosDelta: number;
  depthDelta: number;
  weeksLeft: number;
  verdict: TradeVerdict;
  risks: string[];
}): string {
  const { give, get, lineupDelta, rosDelta, depthDelta, weeksLeft, verdict } = args;
  const giving = give.map((p) => p.name).join(', ') || 'nobody';
  const getting = get.map((p) => p.name).join(', ') || 'nobody';
  const sentences: string[] = [];

  sentences.push(
    `You give ${giving} and get ${getting}. Your optimal starting lineup changes by ${signed(lineupDelta)} points this week and ${signed(
      rosDelta,
    )} points per week across the remaining ${weeksLeft} weeks — about ${signed(round1(rosDelta * weeksLeft))} points of total starting value.`,
  );

  if (Math.abs(depthDelta) >= 1) {
    sentences.push(
      depthDelta < 0
        ? `Bench depth drops by ${Math.abs(depthDelta)} pts/week, so an injury to a starter would hurt more after this trade.`
        : `Bench depth improves by ${depthDelta} pts/week, which is real insurance against an injury.`,
    );
  }

  if (verdict === 'EVEN') {
    sentences.push('This is close to a wash on value. Decide it on roster fit and risk tolerance, not on the projection.');
  }

  return sentences.join(' ');
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
