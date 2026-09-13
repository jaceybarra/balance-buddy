import { prisma } from '../db';
import { buildLeagueContext, type LeagueContext, type PlayerCard } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { buildContingencyPlan, playersNeedingContingency } from './contingency';
import { buildWaiverReport, rosterUpgrades } from './waivers';
import { buildStreamerReports } from './streamers';
import { stringify } from '../json';
import { countdown, gameTimeLabel, minutesUntil } from '../time';
import { round1 } from '../scoring/engine';
import type { ActionType, Severity } from '../domain/enums';
import { NON_PLAYING_STATUSES } from '../domain/enums';

export interface DraftAction {
  type: ActionType;
  severity: Severity;
  leagueId: string;
  teamId: string;
  playerId?: string | null;
  headline: string;
  recommendation: string;
  reason: string;
  confidence: number;
  deadline: Date | null;
  source: string;
  dedupeKey: string;
  payload?: unknown;
}

/**
 * The recommendation pipeline.
 *
 * DATA -> league scoring -> projections -> roster constraints -> optimization
 * -> decision rules -> Action rows. Everything here is deterministic; the LLM
 * layer only ever rewrites these strings, it never decides them.
 */
export async function generateActionsForLeague(ctx: LeagueContext, now: Date = new Date()): Promise<DraftAction[]> {
  const actions: DraftAction[] = [];
  const slots: SlotDefinition[] = ctx.slots.map((s) => ({
    slot: s.slot,
    starters: s.starters,
    eligible: s.eligible,
    sortOrder: s.sortOrder,
  }));

  const { strategy, rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
  const lineup = optimizeLineup({ roster: ctx.all, slots, strategy });

  // Players that will get their own INJURY card. That card carries the whole
  // Plan A/B/C ladder, so emitting a separate "start X over Y" card for the
  // same player would be the same decision twice.
  const contingencyPlayers = new Set(playersNeedingContingency(ctx).map((p) => p.id));

  // ---------------------------------------------------------------- lineup
  for (const swap of lineup.swaps) {
    if (swap.gain <= 0.15) continue;
    if (swap.out && contingencyPlayers.has(swap.out.id)) continue;
    const kickoff = earliestKickoff([swap.in, swap.out]);
    const urgency = kickoff ? minutesUntil(kickoff, now) : null;
    const severity: Severity =
      urgency !== null && urgency <= 90 && swap.gain >= 1
        ? 'CRITICAL'
        : swap.gain >= 3
          ? 'HIGH'
          : swap.gain >= 1
            ? 'MEDIUM'
            : 'LOW';

    const tie = swap.tooClose;
    actions.push({
      type: 'LINEUP',
      severity,
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      playerId: swap.in.id,
      headline: swap.out
        ? `Start ${swap.in.name} over ${swap.out.name} at ${swap.slot}`
        : `Start ${swap.in.name} at ${swap.slot} — the slot is empty`,
      recommendation: swap.out
        ? `Move ${swap.in.name} into ${swap.slot} and bench ${swap.out.name}.`
        : `Move ${swap.in.name} into your open ${swap.slot} slot.`,
      reason: tie
        ? `Only ${swap.gain} points separate them — this is close to a coin flip. ${swap.reason}. ${rationale}`
        : `Projected ${round1(swap.in.projection?.expected ?? 0)}${
            swap.out ? ` vs ${round1(swap.out.projection?.expected ?? 0)}` : ''
          } (+${swap.gain}) in ${possessive(ctx.league.name)} scoring. ${swap.reason}. ${rationale}`,
      confidence: swap.confidence,
      deadline: kickoff,
      source: 'engine:lineup',
      dedupeKey: `${ctx.league.id}:LINEUP:${ctx.week}:${swap.in.id}:${swap.out?.id ?? 'empty'}`,
      payload: {
        in: playerRef(swap.in),
        out: swap.out ? playerRef(swap.out) : null,
        slot: swap.slot,
        gain: swap.gain,
        tooClose: tie,
        currentProjected: lineup.currentProjected,
        optimalProjected: lineup.optimalProjected,
        strategy,
      },
    });
  }

  // --------------------------------------------------------------- injuries
  for (const player of playersNeedingContingency(ctx)) {
    const plan = buildContingencyPlan(ctx, player, now);
    if (!plan) continue;
    const mins = plan.minutesRemaining;
    const ruledOut = NON_PLAYING_STATUSES.includes(player.injuryStatus) || player.onBye;

    const severity: Severity = ruledOut
      ? mins !== null && mins < 720
        ? 'CRITICAL'
        : 'HIGH'
      : mins !== null && mins <= 180
        ? 'HIGH'
        : 'MEDIUM';

    const headline = player.onBye
      ? `${player.name} is on bye and still in your ${player.slot} slot`
      : `${player.name} is ${player.injuryStatus.toLowerCase()}`;

    const planB = plan.steps.find((s) => s.label === 'Plan B');
    actions.push({
      type: 'INJURY',
      severity,
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      playerId: player.id,
      headline,
      recommendation: ruledOut
        ? planB?.action ?? 'Replace him in your lineup.'
        : `Monitor his status. If he sits: ${planB?.action ?? 'no legal replacement available'}.`,
      reason: [
        player.injuryDetail ?? 'Status per the latest injury report',
        planB?.costIfWrong ? `Leaving him in costs about ${planB.costIfWrong} projected points if he is inactive.` : null,
        plan.earlyDecision ? plan.earlyDecision.because : null,
        plan.hasLateWindowFallback && !plan.earlyDecision
          ? 'You have a later-window fallback, so you can wait for news.'
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      confidence: ruledOut ? 0.95 : 0.7,
      deadline: plan.deadline,
      source: 'engine:injury',
      dedupeKey: `${ctx.league.id}:INJURY:${ctx.week}:${player.id}`,
      payload: {
        player: playerRef(player),
        steps: plan.steps,
        deadlineLabel: plan.deadlineLabel,
        hasLateWindowFallback: plan.hasLateWindowFallback,
        earlyDecision: plan.earlyDecision,
      },
    });
  }

  // ---------------------------------------------------------------- roster
  if (ctx.openBenchSlots > 0) {
    actions.push({
      type: 'ROSTER',
      severity: 'LOW',
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      headline: `${ctx.openBenchSlots} open roster spot${ctx.openBenchSlots === 1 ? '' : 's'} in ${ctx.league.name}`,
      recommendation: 'Claim the best available upside player — an empty bench slot earns nothing.',
      reason: 'You can add a player without dropping anyone, so the only cost is a waiver claim.',
      confidence: 0.9,
      deadline: null,
      source: 'engine:roster',
      dedupeKey: `${ctx.league.id}:ROSTER:OPEN_SLOT:${ctx.week}`,
      payload: { openBenchSlots: ctx.openBenchSlots },
    });
  }

  for (const player of ctx.all) {
    if (!player.nflTeamAbbr) {
      actions.push({
        type: 'ROSTER',
        severity: 'LOW',
        leagueId: ctx.league.id,
        teamId: ctx.team.id,
        playerId: player.id,
        headline: `${player.name}'s NFL team is unresolved`,
        recommendation: 'Sync ESPN (or set his team manually in the player page) so he can be projected.',
        reason: 'Without an NFL team we cannot find his game, opponent, or kickoff time, so he projects as zero.',
        confidence: 0.99,
        deadline: null,
        source: 'engine:roster',
        dedupeKey: `${ctx.league.id}:ROSTER:NO_TEAM:${player.id}`,
        payload: { player: playerRef(player) },
      });
    }
  }

  // IR slot holding someone who is healthy again blocks a roster spot.
  for (const player of ctx.ir) {
    if (['HEALTHY', 'QUESTIONABLE'].includes(player.injuryStatus)) {
      actions.push({
        type: 'ROSTER',
        severity: 'MEDIUM',
        leagueId: ctx.league.id,
        teamId: ctx.team.id,
        playerId: player.id,
        headline: `${player.name} may no longer be IR-eligible`,
        recommendation: `Move ${player.name} back to your bench before ESPN forces the move.`,
        reason: `He is listed ${player.injuryStatus.toLowerCase()}. ESPN removes IR eligibility once a player is activated, and an illegal roster can lock your lineup.`,
        confidence: 0.75,
        deadline: null,
        source: 'engine:roster',
        dedupeKey: `${ctx.league.id}:ROSTER:IR_ELIGIBILITY:${player.id}`,
        payload: { player: playerRef(player) },
      });
    }
  }

  // ---------------------------------------------------------------- waivers
  const waiverReport = await buildWaiverReport(ctx, 6, now);
  // Only the best two claims per league become action cards. A wire full of
  // marginal upgrades is not "things you need to do" — the full ranked list
  // lives on the waivers page.
  const waiverPositionsSeen = new Set<string>();
  const waiverCandidates = waiverReport.candidates
    // D/ST and K are streaming decisions, and the streamer engine already
    // produces a card for them — don't say it twice.
    .filter((c) => c.player.position !== 'DST' && c.player.position !== 'K')
    // One claim per position: two tight ends fill the same hole.
    .filter((c) => {
      if (waiverPositionsSeen.has(c.player.position)) return false;
      waiverPositionsSeen.add(c.player.position);
      return true;
    })
    .slice(0, 2);

  for (const candidate of waiverCandidates) {
    if (candidate.score < 8) continue;
    // Waiver claims are rarely urgent: a claim only earns HIGH when it
    // measurably improves THIS WEEK's starting lineup — and only when the
    // comparison is real data against real data. An estimate-driven "+3.7" is
    // a lead worth checking, not an instruction, so it stays LOW.
    const severity: Severity = !candidate.comparisonIsReliable
      ? 'LOW'
      : candidate.lineupGain >= 2.5
        ? 'HIGH'
        : candidate.lineupGain >= 0.8
          ? 'MEDIUM'
          : 'LOW';
    actions.push({
      type: 'WAIVER',
      severity,
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      playerId: candidate.player.id,
      headline: `Waiver target: ${candidate.player.name} (${candidate.player.position}${candidate.player.nflTeamAbbr ? ` - ${candidate.player.nflTeamAbbr}` : ''})`,
      recommendation: candidate.dropCandidate
        ? `Add ${candidate.player.name}, drop ${candidate.dropCandidate.name}.`
        : `Add ${candidate.player.name} — you have an open roster spot.`,
      reason: candidate.reason,
      confidence: !candidate.comparisonIsReliable
        ? 0.4
        : candidate.priority === 'HIGH'
          ? 0.78
          : candidate.priority === 'SPECULATIVE'
            ? 0.5
            : 0.65,
      deadline: null,
      source: 'engine:waivers',
      dedupeKey: `${ctx.league.id}:WAIVER:${ctx.week}:${candidate.player.id}`,
      payload: {
        add: playerRef(candidate.player),
        drop: candidate.dropCandidate ? playerRef(candidate.dropCandidate) : null,
        priority: candidate.priority,
        lineupGain: candidate.lineupGain,
        rosGain: candidate.rosGain,
        evidence: candidate.evidence,
        speculative: candidate.speculative,
        comparisonIsReliable: candidate.comparisonIsReliable,
      },
    });
  }

  // "Your weakest bench asset" is a rest-of-season judgment. While ROS numbers
  // are the app's own estimates and the weekly numbers are ESPN's, that verdict
  // can contradict what the user sees in ESPN — so it is not claimed at all.
  const rosComparable = ctx.all.every((pl) => pl.rosIsReal) || ctx.all.every((pl) => !pl.projectionIsReal);
  for (const upgrade of (rosComparable ? rosterUpgrades(ctx, waiverReport) : []).slice(0, 1)) {
    actions.push({
      type: 'ROSTER',
      severity: 'LOW',
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      playerId: upgrade.drop.id,
      headline: `${upgrade.drop.name} is your weakest bench asset`,
      recommendation: `Consider swapping him for ${upgrade.betterOptions.map((o) => o.player.name).slice(0, 2).join(' or ')}.`,
      reason: upgrade.note,
      confidence: 0.6,
      deadline: null,
      source: 'engine:roster',
      dedupeKey: `${ctx.league.id}:ROSTER:UPGRADE:${ctx.week}:${upgrade.drop.id}`,
      payload: {
        drop: playerRef(upgrade.drop),
        options: upgrade.betterOptions.map((o) => ({ ...playerRef(o.player), rosGain: o.rosGain })),
      },
    });
  }

  // -------------------------------------------------------------- streamers
  const streamers = await buildStreamerReports(ctx, now);
  const alreadyRecommended = new Set(waiverCandidates.map((c) => c.player.id));
  for (const report of streamers) {
    if (report.holdSteady || !report.options[0]) continue;
    const best = report.options[0];
    // "Add him" and "stream him" are the same move; the waiver card already said it.
    if (alreadyRecommended.has(best.player.id)) continue;
    const streamComparisonIsReliable =
      best.player.projectionIsReal || !(report.incumbent?.projectionIsReal ?? false);
    actions.push({
      type: 'STREAMER',
      // Streaming is a real edge but never an emergency — and an estimate
      // measured against ESPN's real number is not an edge we can stand behind.
      severity: !streamComparisonIsReliable ? 'LOW' : best.gain >= 5 ? 'MEDIUM' : 'LOW',
      leagueId: ctx.league.id,
      teamId: ctx.team.id,
      playerId: best.player.id,
      headline: `Stream ${best.player.name} at ${report.position}`,
      recommendation: report.recommendation ?? `Pick up ${best.player.name}.`,
      reason: `${best.drivers.slice(0, 3).join('; ')}. Worth +${best.gain} over ${report.incumbent?.name ?? 'an empty slot'} in ${possessive(ctx.league.name)} scoring.${
        streamComparisonIsReliable
          ? ''
          : ` Note: ${best.player.name}'s projection is this app's estimate while ${report.incumbent?.name ?? 'your starter'} is on ESPN's real number — sync ESPN before acting on the gap.`
      }`,
      confidence: streamComparisonIsReliable ? best.confidence : 0.4,
      deadline: best.player.game?.kickoff ?? null,
      source: 'engine:streamers',
      dedupeKey: `${ctx.league.id}:STREAMER:${ctx.week}:${report.position}:${best.player.id}`,
      payload: {
        position: report.position,
        add: playerRef(best.player),
        drop: report.incumbent ? playerRef(report.incumbent) : null,
        gain: best.gain,
        drivers: best.drivers,
      },
    });
  }

  return actions;
}

/** "So Good It Hurts" -> "So Good It Hurts'" (never "Hurts's"). */
export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function earliestKickoff(players: (PlayerCard | null)[]): Date | null {
  const times = players
    .filter((p): p is PlayerCard => Boolean(p))
    .map((p) => p.game?.kickoff)
    .filter((d): d is Date => Boolean(d));
  if (times.length === 0) return null;
  return new Date(Math.min(...times.map((d) => d.getTime())));
}

function playerRef(p: PlayerCard) {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.nflTeamAbbr,
    slot: p.slot,
    projected: p.projection?.expected ?? null,
    floor: p.projection?.floor ?? null,
    ceiling: p.projection?.ceiling ?? null,
    injuryStatus: p.injuryStatus,
    kickoff: p.game?.kickoff ?? null,
    kickoffLabel: p.game?.kickoff ? gameTimeLabel(p.game.kickoff) : null,
    lock: p.lock,
  };
}

/**
 * Regenerate the action queue for every league.
 *
 * Uses a stable dedupeKey so a re-run updates an existing card instead of
 * spamming a duplicate, preserves SNOOZED/DONE states, and expires anything
 * whose deadline has passed.
 */
export async function regenerateActions(now: Date = new Date()): Promise<{ created: number; updated: number; expired: number }> {
  const leagues = await prisma.league.findMany({ select: { id: true } });
  const drafts: DraftAction[] = [];

  for (const league of leagues) {
    try {
      const ctx = await buildLeagueContext(league.id, now);
      drafts.push(...(await generateActionsForLeague(ctx, now)));
    } catch (err) {
      // One broken league must never take down the whole queue.
      console.error(`[actions] league ${league.id} failed:`, err instanceof Error ? err.message : err);
    }
  }

  const existing = await prisma.action.findMany({ where: { status: { in: ['OPEN', 'SNOOZED'] } } });
  const existingByKey = new Map(existing.map((a) => [a.dedupeKey, a]));
  const seen = new Set<string>();

  let created = 0;
  let updated = 0;

  for (const draft of drafts) {
    seen.add(draft.dedupeKey);
    const prior = existingByKey.get(draft.dedupeKey);
    const data = {
      type: draft.type,
      severity: draft.severity,
      leagueId: draft.leagueId,
      teamId: draft.teamId,
      playerId: draft.playerId ?? null,
      headline: draft.headline,
      recommendation: draft.recommendation,
      reason: draft.reason,
      confidence: draft.confidence,
      deadline: draft.deadline,
      source: draft.source,
      payloadJson: draft.payload ? stringify(draft.payload) : null,
    };
    if (prior) {
      await prisma.action.update({ where: { id: prior.id }, data });
      updated++;
    } else {
      await prisma.action.create({ data: { ...data, dedupeKey: draft.dedupeKey, status: 'OPEN' } });
      created++;
    }
  }

  // Anything the engines no longer produce, or whose deadline has passed.
  const stale = existing.filter((a) => !seen.has(a.dedupeKey) || (a.deadline && a.deadline.getTime() < now.getTime()));
  if (stale.length > 0) {
    await prisma.action.updateMany({ where: { id: { in: stale.map((a) => a.id) } }, data: { status: 'EXPIRED' } });
  }

  await createNotifications(now);

  return { created, updated, expired: stale.length };
}

/**
 * Notification policy: only fire for decisions that actually matter.
 * CRITICAL always; HIGH only when a deadline is close. Everything else stays
 * in the app.
 */
async function createNotifications(now: Date): Promise<void> {
  const actions = await prisma.action.findMany({
    where: { status: 'OPEN', severity: { in: ['CRITICAL', 'HIGH'] } },
    include: { league: true },
  });

  for (const action of actions) {
    const mins = action.deadline ? minutesUntil(action.deadline, now) : null;
    const worthNotifying = action.severity === 'CRITICAL' || (mins !== null && mins <= 180 && mins > 0);
    if (!worthNotifying) continue;

    const dedupeKey = `notify:${action.dedupeKey}:${action.severity}`;
    const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
    if (existing) continue;

    await prisma.notification.create({
      data: {
        dedupeKey,
        severity: action.severity,
        title: action.headline,
        body: `${action.recommendation}${action.deadline ? ` (${countdown(action.deadline, now)})` : ''}`,
        href: `/actions?focus=${action.id}`,
        actionId: action.id,
        channel: 'IN_APP',
      },
    });
  }
}
