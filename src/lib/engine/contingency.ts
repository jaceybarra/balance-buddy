import type { LeagueContext, PlayerCard } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { NON_PLAYING_STATUSES } from '../domain/enums';
import { gameTimeLabel, minutesUntil } from '../time';
import { round1 } from '../scoring/engine';

export interface ContingencyStep {
  label: 'Plan A' | 'Plan B' | 'Plan C';
  condition: string;
  action: string;
  /** Concrete moves, ready to execute in ESPN. */
  moves: { in: string; out: string | null; slot: string }[];
  costIfWrong: number | null;
}

export interface ContingencyPlan {
  player: PlayerCard;
  status: string;
  /**
   * Set when the best replacement kicks off BEFORE the questionable player.
   * That inverts the usual advice: you cannot wait for news, because the
   * replacement locks first.
   */
  earlyDecision: { replacement: string; lockAt: Date; because: string } | null;
  /** Decision deadline — his kickoff, minus a safety margin. */
  deadline: Date | null;
  deadlineLabel: string;
  minutesRemaining: number | null;
  steps: ContingencyStep[];
  /** Can we wait for news because a replacement plays later? */
  hasLateWindowFallback: boolean;
  summary: string;
}

const DECISION_MARGIN_MINUTES = 15;

/**
 * Build the Plan A / Plan B / Plan C fallback ladder for a questionable starter.
 *
 * The point is to do the thinking BEFORE kickoff: if the news breaks 40 minutes
 * before the game, the answer is already written down.
 */
export function buildContingencyPlan(ctx: LeagueContext, player: PlayerCard, now: Date = new Date()): ContingencyPlan | null {
  if (!player.slot || player.slot === 'BENCH' || player.slot === 'IR') return null;
  if (player.lock === 'LOCKED') return null;

  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));
  const { strategy } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);

  // Plan B: what the lineup looks like if he is ruled OUT.
  const withoutHim = ctx.all.map((p) =>
    p.id === player.id
      ? ({ ...p, injuryStatus: 'OUT', projection: p.projection ? { ...p.projection, expected: 0, playProbability: 0 } : null } as PlayerCard)
      : p,
  );
  const planA = optimizeLineup({ roster: ctx.all, slots, strategy });
  const planB = optimizeLineup({ roster: withoutHim, slots, strategy });
  // What it costs if he sits: the whole lineup's best total with him, minus the
  // best total without him. That already accounts for the replacement.
  const costIfOut = round1(planA.optimalProjected - planB.optimalProjected);
  const moves = planB.swaps
    .filter((s) => s.in.id !== player.id)
    .map((s) => ({ in: s.in.name, out: s.out?.name ?? null, slot: s.slot }));

  const kickoff = player.game?.kickoff ?? null;
  const deadline = kickoff ? new Date(kickoff.getTime() - DECISION_MARGIN_MINUTES * 60_000) : null;

  // Plan C: a bench replacement who is ELIGIBLE for his slot and whose game
  // starts LATER, so you can wait for the inactive report instead of guessing.
  const slotDef = ctx.slots.find((s) => s.slot === player.slot);
  const eligibleForSlot = (candidate: PlayerCard): boolean => {
    if (!slotDef) return false;
    const positions = [candidate.position, ...candidate.eligiblePositions];
    return positions.some((pos) => slotDef.eligible.includes(pos));
  };

  const laterOptions = ctx.bench
    .filter((b) => b.game && kickoff && b.game.kickoff.getTime() > kickoff.getTime())
    .filter((b) => !NON_PLAYING_STATUSES.includes(b.injuryStatus))
    .filter(eligibleForSlot)
    .sort((a, b) => (b.projection?.expected ?? 0) - (a.projection?.expected ?? 0));
  const lateOption = laterOptions[0] ?? null;

  // The strongest replacement overall, regardless of kickoff order.
  const bestReplacement = ctx.bench
    .filter((b) => !NON_PLAYING_STATUSES.includes(b.injuryStatus) && !b.onBye)
    .filter(eligibleForSlot)
    .sort((a, b) => (b.projection?.expected ?? 0) - (a.projection?.expected ?? 0))[0] ?? null;

  // If that replacement plays earlier, the real deadline is HIS kickoff, not
  // the questionable player's — a distinction that decides the week.
  const earlyDecision =
    bestReplacement?.game && kickoff && bestReplacement.game.kickoff.getTime() < kickoff.getTime()
      ? {
          replacement: bestReplacement.name,
          lockAt: bestReplacement.game.kickoff,
          because: `${bestReplacement.name} kicks off at ${gameTimeLabel(bestReplacement.game.kickoff)}, ${
            player.name
          } not until ${gameTimeLabel(kickoff)}. If you want ${bestReplacement.name} in, you must decide before his game — you cannot wait for ${player.name}'s status.`,
        }
      : null;

  const steps: ContingencyStep[] = [
    {
      label: 'Plan A',
      condition: `${player.name} is active without a snap restriction`,
      action: `Start him at ${player.slot}. No change needed.`,
      moves: [],
      costIfWrong: null,
    },
    {
      label: 'Plan B',
      condition: `${player.name} is ruled OUT or inactive`,
      action:
        moves.length > 0
          ? moves.map((m) => `${m.in} → ${m.slot}${m.out ? ` (bench ${m.out})` : ''}`).join(', ')
          : 'No legal replacement available — you would start the slot short.',
      moves,
      costIfWrong: costIfOut,
    },
  ];

  if (lateOption) {
    steps.push({
      label: 'Plan C',
      condition: `News is still unclear at his ${gameTimeLabel(kickoff!)} kickoff`,
      action: `${lateOption.name} plays ${gameTimeLabel(lateOption.game!.kickoff)} — you can bench ${player.name} now and still decide after the early games.`,
      moves: [{ in: lateOption.name, out: player.name, slot: player.slot }],
      costIfWrong: round1((player.projection?.expected ?? 0) - (lateOption.projection?.expected ?? 0)),
    });
  }

  return {
    player,
    status: player.injuryStatus,
    earlyDecision,
    // The real deadline is whichever comes first: his kickoff, or the kickoff
    // of the replacement you would need to swap in.
    deadline: earlyDecision ? new Date(Math.min(deadline?.getTime() ?? Infinity, earlyDecision.lockAt.getTime() - DECISION_MARGIN_MINUTES * 60_000)) : deadline,
    deadlineLabel: earlyDecision
      ? gameTimeLabel(new Date(earlyDecision.lockAt.getTime() - DECISION_MARGIN_MINUTES * 60_000))
      : deadline
        ? gameTimeLabel(deadline)
        : 'no scheduled game',
    minutesRemaining: deadline ? minutesUntil(deadline, now) : null,
    steps,
    hasLateWindowFallback: Boolean(lateOption),
    summary: `${player.name} is ${player.injuryStatus.toLowerCase()}${
      moves.length > 0 ? `. If he sits: ${moves.map((m) => `${m.in} → ${m.slot}`).join(', ')}` : ''
    }.`,
  };
}

/** Every starter who needs a contingency plan this week, most urgent first. */
export function playersNeedingContingency(ctx: LeagueContext): PlayerCard[] {
  return ctx.starters
    .filter((p) => ['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'PUP', 'SUSPENDED'].includes(p.injuryStatus) || p.onBye)
    .filter((p) => p.lock !== 'LOCKED')
    .sort((a, b) => {
      const aTime = a.game?.kickoff?.getTime() ?? Infinity;
      const bTime = b.game?.kickoff?.getTime() ?? Infinity;
      return aTime - bTime;
    });
}
