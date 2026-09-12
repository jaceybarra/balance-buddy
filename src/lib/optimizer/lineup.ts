import type { PlayerCard } from '../data/context';
import type { Position, RosterSlot } from '../domain/enums';
import { NON_PLAYING_STATUSES } from '../domain/enums';
import { maxWeightAssignment } from './hungarian';
import { round1, round2 } from '../scoring/engine';

export interface SlotDefinition {
  slot: RosterSlot;
  starters: number;
  eligible: Position[];
  sortOrder: number;
}

/** How aggressive to be: driven by the week's matchup projection. */
export type LineupStrategy = 'FLOOR' | 'BALANCED' | 'CEILING';

export interface LineupSlotAssignment {
  slot: RosterSlot;
  slotIndex: number;
  player: PlayerCard | null;
  /** The player currently occupying this slot on the real roster. */
  current: PlayerCard | null;
  locked: boolean;
}

export interface LineupSwap {
  in: PlayerCard;
  out: PlayerCard | null;
  slot: RosterSlot;
  /** League points gained by making the swap. */
  gain: number;
  confidence: number;
  reason: string;
  /** True when the two players are close enough that it's a coin flip. */
  tooClose: boolean;
}

export interface LineupResult {
  assignments: LineupSlotAssignment[];
  swaps: LineupSwap[];
  currentProjected: number;
  optimalProjected: number;
  improvement: number;
  strategy: LineupStrategy;
  /** Slots that could not be filled legally (e.g. everyone at the position is out). */
  unfilled: RosterSlot[];
  lockedPlayers: string[];
  notes: string[];
}

/** Points below which two players are treated as effectively tied. */
export const TIE_THRESHOLD = 0.75;

function eligibleFor(slot: SlotDefinition, player: PlayerCard): boolean {
  const positions = [player.position, ...player.eligiblePositions];
  return positions.some((p) => slot.eligible.includes(p));
}

/**
 * The objective the optimizer maximizes for one player in one slot.
 *
 * Starts from risk-adjusted expected points (projection x probability he
 * plays), then tilts toward floor or ceiling based on the week's matchup.
 */
export function playerValue(player: PlayerCard, strategy: LineupStrategy): number {
  const proj = player.projection;
  if (!proj) return -1; // no projection at all — worse than a zero projection
  if (player.onBye) return -1;
  const weight = strategy === 'BALANCED' ? 0 : 0.3;
  const tilt = strategy === 'CEILING' ? proj.ceiling : proj.floor;
  const blended = proj.points * (1 - weight) + tilt * weight;
  return blended * proj.playProbability;
}

/**
 * Compute the optimal legal lineup and the changes needed to get there.
 *
 * Hard rules:
 *   - a LOCKED player (his game started) stays exactly where he is
 *   - a locked bench player can never be moved into the lineup
 *   - IR-slot players are never startable
 *   - slot eligibility is always respected
 */
export function optimizeLineup(args: {
  roster: PlayerCard[];
  slots: SlotDefinition[];
  strategy?: LineupStrategy;
}): LineupResult {
  const strategy = args.strategy ?? 'BALANCED';
  const notes: string[] = [];

  const startingSlots = args.slots
    .filter((s) => s.slot !== 'BENCH' && s.slot !== 'IR' && s.starters > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Expand "RB: 2 starters" into two individual slot instances.
  const slotInstances: { def: SlotDefinition; index: number }[] = [];
  for (const def of startingSlots) {
    for (let i = 0; i < def.starters; i++) slotInstances.push({ def, index: i });
  }

  const currentBySlot = new Map<string, PlayerCard>();
  for (const p of args.roster) {
    if (p.slot && p.slot !== 'BENCH' && p.slot !== 'IR') currentBySlot.set(`${p.slot}:${p.slotIndex}`, p);
  }

  const lockedStarters = args.roster.filter(
    (p) => p.lock === 'LOCKED' && p.slot && p.slot !== 'BENCH' && p.slot !== 'IR',
  );
  const lockedPlayerIds = new Set(lockedStarters.map((p) => p.id));

  // Candidates: anyone not on IR and not locked on the bench.
  const candidates = args.roster.filter((p) => {
    if (p.slot === 'IR') return false;
    if (lockedPlayerIds.has(p.id)) return false;
    if (p.lock === 'LOCKED' && (p.slot === 'BENCH' || !p.slot)) {
      notes.push(`${p.name} is locked on your bench — his game already started.`);
      return false;
    }
    return true;
  });

  // Slots occupied by locked starters are fixed and leave the matching.
  const fixed = new Map<string, PlayerCard>();
  for (const p of lockedStarters) fixed.set(`${p.slot}:${p.slotIndex}`, p);

  const openSlots = slotInstances.filter((s) => !fixed.has(`${s.def.slot}:${s.index}`));

  const weights: number[][] = openSlots.map((slot) =>
    candidates.map((player) => {
      if (!eligibleFor(slot.def, player)) return -Infinity;
      const value = playerValue(player, strategy);
      // Never recommend starting a player who cannot play at all when a real
      // alternative exists: heavy penalty rather than a hard ban, so the
      // optimizer can still fill a slot when the cupboard is bare.
      const penalty = NON_PLAYING_STATUSES.includes(player.injuryStatus) ? 50 : 0;
      return value - penalty;
    }),
  );

  const { assignment } = maxWeightAssignment(weights);

  const assignments: LineupSlotAssignment[] = slotInstances.map((s) => {
    const key = `${s.def.slot}:${s.index}`;
    const lockedPlayer = fixed.get(key);
    if (lockedPlayer) {
      return { slot: s.def.slot, slotIndex: s.index, player: lockedPlayer, current: lockedPlayer, locked: true };
    }
    const openIdx = openSlots.findIndex((o) => o.def.slot === s.def.slot && o.index === s.index);
    const candIdx = openIdx >= 0 ? assignment[openIdx] : null;
    const player = candIdx !== null && candIdx !== undefined ? (candidates[candIdx] ?? null) : null;
    return { slot: s.def.slot, slotIndex: s.index, player, current: currentBySlot.get(key) ?? null, locked: false };
  });

  const currentProjected = round1(
    [...currentBySlot.values()].reduce((sum, p) => sum + (p.projection?.expected ?? 0), 0),
  );
  const optimalProjected = round1(
    assignments.reduce((sum, a) => sum + (a.player?.projection?.expected ?? 0), 0),
  );

  const swaps = buildSwaps(assignments, currentBySlot);
  const unfilled = assignments.filter((a) => !a.player).map((a) => a.slot);

  return {
    assignments,
    swaps,
    currentProjected,
    optimalProjected,
    improvement: round1(optimalProjected - currentProjected),
    strategy,
    unfilled,
    lockedPlayers: lockedStarters.map((p) => p.name),
    notes,
  };
}

/**
 * Turn the difference between the current and recommended lineups into human
 * "start X over Y" moves.
 *
 * Slot-by-slot comparison is not enough: the optimizer often shuffles a player
 * from RB to FLEX, which is not a move the user has to think about. What
 * matters is who ENTERS the lineup and who LEAVES it, so those two sets are
 * paired by value and reported as real swaps.
 */
function buildSwaps(assignments: LineupSlotAssignment[], currentBySlot: Map<string, PlayerCard>): LineupSwap[] {
  const recommended = assignments
    .filter((a) => a.player)
    .map((a) => ({ slot: a.slot, player: a.player! }));
  const recommendedIds = new Set(recommended.map((r) => r.player.id));
  const currentStarters = [...currentBySlot.values()];
  const currentIds = new Set(currentStarters.map((p) => p.id));

  const entering = recommended
    .filter((r) => !currentIds.has(r.player.id))
    .sort((a, b) => (b.player.projection?.expected ?? 0) - (a.player.projection?.expected ?? 0));
  const leaving = currentStarters
    .filter((p) => !recommendedIds.has(p.id))
    .sort((a, b) => (b.projection?.expected ?? 0) - (a.projection?.expected ?? 0));

  const swaps: LineupSwap[] = [];
  entering.forEach((incoming, idx) => {
    const displaced = leaving[idx] ?? null;
    const gain = round2((incoming.player.projection?.expected ?? 0) - (displaced?.projection?.expected ?? 0));
    swaps.push({
      in: incoming.player,
      out: displaced,
      slot: incoming.slot,
      gain,
      confidence: swapConfidence(incoming.player, displaced, gain),
      reason: swapReason(incoming.player, displaced),
      tooClose: displaced !== null && Math.abs(gain) < TIE_THRESHOLD,
    });
  });
  return swaps.sort((x, y) => y.gain - x.gain);
}

/** Starters who keep starting but move slots — informational, not an action. */
export function lineupShuffles(result: LineupResult): { player: PlayerCard; from: RosterSlot; to: RosterSlot }[] {
  const out: { player: PlayerCard; from: RosterSlot; to: RosterSlot }[] = [];
  for (const a of result.assignments) {
    if (!a.player) continue;
    const from = a.player.slot;
    if (!from || from === 'BENCH' || from === 'IR') continue;
    if (from !== a.slot) out.push({ player: a.player, from, to: a.slot });
  }
  return out;
}

/**
 * Confidence in a start/sit call.
 *
 * Combines: how big the projected gap is, how much we trust each projection,
 * and how much injury ambiguity is in play. A 0.4-point edge between two
 * questionable players is a coin flip and the app says so.
 */
export function swapConfidence(inPlayer: PlayerCard, outPlayer: PlayerCard | null, gain: number): number {
  const projA = inPlayer.projection;
  const projB = outPlayer?.projection ?? null;
  if (!projA) return 0.4;

  // A ~6 point gap is where a weekly start/sit call becomes genuinely clear-cut.
  // Weekly fantasy variance is large, so the ceiling on confidence stays below
  // 100% even for obvious calls — pretending otherwise would be false precision.
  const gapScore = Math.min(1, Math.abs(gain) / 6);
  const trust = (projA.confidence + (projB?.confidence ?? projA.confidence)) / 2;
  const injuryDrag =
    (inPlayer.injuryStatus === 'QUESTIONABLE' ? 0.12 : 0) +
    (outPlayer?.injuryStatus === 'QUESTIONABLE' ? 0.06 : 0) +
    (inPlayer.onBye || outPlayer?.onBye ? -0.1 : 0); // a bye is a certainty, not a risk

  const raw = 0.45 + gapScore * 0.33 + (trust - 0.6) * 0.3 - injuryDrag;
  return Math.round(Math.min(0.93, Math.max(0.35, raw)) * 100) / 100;
}

function swapReason(inPlayer: PlayerCard, outPlayer: PlayerCard | null): string {
  const parts: string[] = [];
  if (outPlayer?.onBye) parts.push(`${outPlayer.name} is on bye`);
  if (outPlayer && NON_PLAYING_STATUSES.includes(outPlayer.injuryStatus)) {
    parts.push(`${outPlayer.name} is ${outPlayer.injuryStatus.toLowerCase()}`);
  }
  if (inPlayer.usage?.targets && outPlayer?.usage?.targets && inPlayer.usage.targets > outPlayer.usage.targets) {
    parts.push(`${inPlayer.usage.targets} targets/gm vs ${outPlayer.usage.targets}`);
  }
  if (inPlayer.usage?.carries && outPlayer?.usage?.carries && inPlayer.usage.carries > outPlayer.usage.carries) {
    parts.push(`${inPlayer.usage.carries} carries/gm vs ${outPlayer.usage.carries}`);
  }
  const matchup = inPlayer.projection?.breakdown ? null : null;
  void matchup;
  if (inPlayer.game && outPlayer?.game && (inPlayer.game.impliedPoints ?? 0) > (outPlayer.game.impliedPoints ?? 0) + 2) {
    parts.push(`better game environment (${inPlayer.game.impliedPoints?.toFixed(1)} implied team total)`);
  }
  if (inPlayer.bonusUpside > 0.5) {
    parts.push(`this league's yardage bonus adds up to ${inPlayer.bonusUpside} pts in his ceiling outcome`);
  }
  if (parts.length === 0) parts.push('higher projected points in this league’s scoring');
  return parts.join('; ');
}

/**
 * Pick a strategy from the week's matchup: chase ceiling when you're losing,
 * protect the floor when you're comfortably ahead.
 */
export function strategyForMatchup(myProjected: number, oppProjected: number): { strategy: LineupStrategy; rationale: string } {
  if (!oppProjected) return { strategy: 'BALANCED', rationale: 'No opponent projection available yet.' };
  const margin = myProjected - oppProjected;
  if (margin < -6) {
    return {
      strategy: 'CEILING',
      rationale: `You project to lose by ${Math.abs(round1(margin))}. Favor ceiling over floor in close calls.`,
    };
  }
  if (margin > 15) {
    return {
      strategy: 'FLOOR',
      rationale: `You are favored by ${round1(margin)}. Take the safer floor play in close calls.`,
    };
  }
  return { strategy: 'BALANCED', rationale: `Projected margin ${round1(margin)} — play the straight best lineup.` };
}
