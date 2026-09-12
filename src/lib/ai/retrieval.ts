import { prisma } from '../db';
import { buildLeagueContext, type LeagueContext, type PlayerCard } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { buildWaiverReport } from '../engine/waivers';
import { buildExposureReport } from '../engine/exposure';
import { buildRosterMetrics } from '../engine/analytics';
import { rankNews } from '../engine/news';
import { getFreshness } from '../data/freshness';
import { buildContingencyPlan, playersNeedingContingency } from '../engine/contingency';
import { round1 } from '../scoring/engine';
import { gameTimeLabel } from '../time';

export type AskIntent =
  | 'START_SIT'
  | 'FLEX'
  | 'DROP'
  | 'WAIVER'
  | 'TRADE'
  | 'WEAKNESS'
  | 'COMPARE_TEAMS'
  | 'TODO'
  | 'CHANGES'
  | 'PLAYER'
  | 'GENERAL';

export interface Citation {
  label: string;
  source: string;
  updatedAt: Date | null;
  stale: boolean;
}

export interface AskEvidence {
  intent: AskIntent;
  question: string;
  season: number;
  week: number;
  asOf: Date;
  /** Structured, retrieved facts. The LLM may ONLY reason over this. */
  facts: Record<string, unknown>;
  citations: Citation[];
  /** Populated when a needed data source is missing or stale. */
  gaps: string[];
}

const INTENT_PATTERNS: { intent: AskIntent; patterns: RegExp[] }[] = [
  { intent: 'FLEX', patterns: [/\bflex\b/i] },
  { intent: 'START_SIT', patterns: [/who should i start/i, /\bstart\b|\bsit\b|\bbench\b|\bstart or sit\b/i] },
  { intent: 'DROP', patterns: [/\bdrop\b|\bcut\b|\brelease\b/i] },
  { intent: 'WAIVER', patterns: [/\bwaiver\b|\bpick ?up\b|\badd\b|\bfree agent\b|\bstream\b/i] },
  { intent: 'TRADE', patterns: [/\btrade\b|\bswap\b for\b/i] },
  { intent: 'WEAKNESS', patterns: [/\bweakness\b|\bweakest\b|\bneed\b|\bhole\b/i] },
  { intent: 'COMPARE_TEAMS', patterns: [/which team is (stronger|better)/i, /compare my teams/i] },
  { intent: 'CHANGES', patterns: [/anything change/i, /what(?:'s| is) new/i, /latest news/i, /today/i] },
  { intent: 'TODO', patterns: [/what should i do/i, /before sunday/i, /right now/i, /need to do/i] },
];

export function classifyIntent(question: string): AskIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(question))) return intent;
  }
  return 'GENERAL';
}

/**
 * Retrieval step of "Ask My GM".
 *
 * The model is an EXPLANATION layer. Every fact it is allowed to state is
 * gathered here, from the database and the deterministic engines, with the
 * source and freshness attached. Nothing about injuries, rosters, projections,
 * free agents, news, statistics or schedules is left to the model to recall.
 */
export async function buildAskEvidence(question: string, now: Date = new Date()): Promise<AskEvidence> {
  const intent = classifyIntent(question);
  const leagues = await prisma.league.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const contexts: LeagueContext[] = [];
  for (const l of leagues) {
    try {
      contexts.push(await buildLeagueContext(l.id, now));
    } catch {
      /* reported through gaps below */
    }
  }

  const freshness = await getFreshness(now);
  const citations: Citation[] = freshness.map((f) => ({
    label: f.label,
    source: f.provider ?? 'none',
    updatedAt: f.lastSuccessAt,
    stale: f.isStale,
  }));
  const gaps = freshness.filter((f) => f.isStale).map((f) => `${f.label} data is stale (${f.ageMinutes ?? 'never'} min old, ${f.status}).`);

  const facts: Record<string, unknown> = {
    leagues: contexts.map((ctx) => ({
      leagueId: ctx.league.id,
      leagueName: ctx.league.name,
      teamName: ctx.team.name,
      record: ctx.team.record,
      size: ctx.league.size,
      ppr: ctx.league.ppr,
      scoringSource: ctx.config.source,
      scoringHighlights: describeScoring(ctx),
      matchup: ctx.matchup,
      openBenchSlots: ctx.openBenchSlots,
    })),
  };

  const focusPlayers = matchPlayers(question, contexts);
  if (focusPlayers.length > 0) {
    facts.focusPlayers = focusPlayers.map(({ ctx, card }) => playerFact(ctx, card));
  }

  if (['START_SIT', 'FLEX', 'TODO', 'GENERAL', 'CHANGES'].includes(intent)) {
    facts.lineups = contexts.map((ctx) => {
      const slots = toSlotDefs(ctx);
      const { strategy, rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
      const result = optimizeLineup({ roster: ctx.all, slots, strategy });
      return {
        leagueName: ctx.league.name,
        strategy,
        strategyRationale: rationale,
        currentProjected: result.currentProjected,
        optimalProjected: result.optimalProjected,
        improvement: result.improvement,
        recommended: result.assignments.map((a) => ({
          slot: a.slot,
          player: a.player?.name ?? null,
          projected: a.player?.projection?.expected ?? null,
          locked: a.locked,
        })),
        swaps: result.swaps.map((s) => ({
          start: s.in.name,
          bench: s.out?.name ?? null,
          slot: s.slot,
          gain: s.gain,
          confidence: s.confidence,
          reason: s.reason,
          tooClose: s.tooClose,
        })),
      };
    });
  }

  if (['WAIVER', 'DROP', 'WEAKNESS', 'TODO'].includes(intent)) {
    facts.waivers = [];
    for (const ctx of contexts) {
      const report = await buildWaiverReport(ctx, 5, now);
      (facts.waivers as unknown[]).push({
        leagueName: ctx.league.name,
        openRosterSpots: report.openRosterSpots,
        weaknesses: report.weaknesses,
        targets: report.candidates.map((c) => ({
          add: c.player.name,
          position: c.player.position,
          team: c.player.nflTeamAbbr,
          drop: c.dropCandidate?.name ?? null,
          priority: c.priority,
          lineupGain: c.lineupGain,
          rosGainPerWeek: c.rosGain,
          evidence: c.evidence,
          speculative: c.speculative,
        })),
      });
    }
  }

  if (['WEAKNESS', 'COMPARE_TEAMS', 'GENERAL'].includes(intent)) {
    facts.metrics = contexts.map((ctx) => ({
      leagueName: ctx.league.name,
      metrics: buildRosterMetrics(ctx).map((m) => ({ label: m.label, value: m.display, explanation: m.explanation })),
    }));
  }

  if (['TODO', 'CHANGES', 'GENERAL', 'START_SIT'].includes(intent)) {
    const actions = await prisma.action.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ severity: 'asc' }, { deadline: 'asc' }],
      include: { league: true },
      take: 15,
    });
    facts.actionQueue = actions.map((a) => ({
      league: a.league?.name ?? null,
      type: a.type,
      severity: a.severity,
      headline: a.headline,
      recommendation: a.recommendation,
      reason: a.reason,
      confidence: a.confidence,
      deadline: a.deadline ? gameTimeLabel(a.deadline) : null,
    }));

    facts.contingencies = contexts.flatMap((ctx) =>
      playersNeedingContingency(ctx)
        .map((p) => buildContingencyPlan(ctx, p, now))
        .filter(Boolean)
        .map((plan) => ({
          league: ctx.league.name,
          player: plan!.player.name,
          status: plan!.status,
          deadline: plan!.deadlineLabel,
          steps: plan!.steps.map((s) => ({ label: s.label, condition: s.condition, action: s.action })),
        })),
    );
  }

  if (['CHANGES', 'GENERAL', 'TODO'].includes(intent)) {
    facts.news = (await rankNews(contexts, 6)).map((n) => ({
      headline: n.headline,
      soWhat: n.interpretation,
      impactScore: n.impactScore,
      ago: n.ago,
      affects: n.affects,
      source: n.source,
    }));
  }

  if (intent === 'COMPARE_TEAMS' || contexts.length > 1) {
    facts.exposure = buildExposureReport(contexts);
  }

  return {
    intent,
    question,
    season: contexts[0]?.season ?? new Date().getUTCFullYear(),
    week: contexts[0]?.week ?? 1,
    asOf: now,
    facts,
    citations,
    gaps,
  };
}

function toSlotDefs(ctx: LeagueContext): SlotDefinition[] {
  return ctx.slots.map((s) => ({ slot: s.slot, starters: s.starters, eligible: s.eligible, sortOrder: s.sortOrder }));
}

function describeScoring(ctx: LeagueContext): string[] {
  const out: string[] = [`${ctx.league.ppr} points per reception`];
  const bonuses = ctx.config.rules.filter((r) => r.kind === 'BONUS');
  if (bonuses.length > 0) {
    out.push(`yardage bonuses: ${bonuses.map((b) => `${b.statKey} ${b.rangeMin}+ = ${b.points}`).join(', ')}`);
  } else {
    out.push('no yardage bonuses');
  }
  return out;
}

/** Find players named in the question, across both rosters and the FA pool. */
function matchPlayers(question: string, contexts: LeagueContext[]): { ctx: LeagueContext; card: PlayerCard }[] {
  const lower = question.toLowerCase();
  const matches: { ctx: LeagueContext; card: PlayerCard }[] = [];
  for (const ctx of contexts) {
    for (const card of ctx.all) {
      const last = card.name.split(' ').slice(-1)[0]?.toLowerCase() ?? '';
      if (lower.includes(card.name.toLowerCase()) || (last.length > 4 && lower.includes(last))) {
        matches.push({ ctx, card });
      }
    }
  }
  return matches;
}

function playerFact(ctx: LeagueContext, card: PlayerCard) {
  return {
    league: ctx.league.name,
    name: card.name,
    position: card.position,
    nflTeam: card.nflTeamAbbr,
    slot: card.slot,
    injuryStatus: card.injuryStatus,
    injuryDetail: card.injuryDetail,
    onBye: card.onBye,
    lock: card.lock,
    opponent: card.game?.opponentAbbr ?? null,
    kickoff: card.game?.kickoff ? gameTimeLabel(card.game.kickoff) : null,
    projectedPoints: card.projection?.points ?? null,
    floor: card.projection?.floor ?? null,
    ceiling: card.projection?.ceiling ?? null,
    expectedAfterInjuryRisk: card.projection?.expected ?? null,
    projectionSource: card.projection?.source ?? null,
    projectionUpdatedAt: card.projection?.updatedAt ?? null,
    restOfSeasonPerWeek: card.rosPerGame,
    usage: card.usage,
    leagueBonusUpside: card.bonusUpside,
    depthChartRole: card.depthChartRole,
    dataSource: card.source,
    manualEntry: card.isManual,
  };
}

export { round1 };
