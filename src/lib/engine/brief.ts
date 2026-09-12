import { prisma } from '../db';
import { buildLeagueContext, type LeagueContext } from '../data/context';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { buildExposureReport } from './exposure';
import { rankNews } from './news';
import { getFreshness } from '../data/freshness';
import { round1 } from '../scoring/engine';
import { SEVERITY_RANK, type Severity } from '../domain/enums';
import { gameTimeLabel } from '../time';

export interface BriefTeamSection {
  leagueId: string;
  leagueName: string;
  teamName: string;
  record: string;
  matchup: { myProjected: number; opponentProjected: number; opponentName: string; winProbability: number } | null;
  strategy: string;
  actions: { headline: string; recommendation: string; severity: Severity; deadlineLabel: string | null }[];
  bestWaiver: string | null;
  biggestRisk: string | null;
  noActionNote: string | null;
}

export interface WeeklyBrief {
  season: number;
  week: number;
  generatedAt: Date;
  teams: BriefTeamSection[];
  overall: {
    actionsRequired: number;
    playersToMonitor: number;
    waiverClaims: number;
    criticalCount: number;
    headline: string;
  };
  exposureSummary: string;
  topNews: { headline: string; interpretation: string | null }[];
  staleWarnings: string[];
}

/**
 * The 60-second read.
 *
 * Everything here is pulled from the deterministic engines — the brief is a
 * presentation of the action queue, not a second opinion about it.
 */
export async function buildWeeklyBrief(now: Date = new Date()): Promise<WeeklyBrief> {
  const leagues = await prisma.league.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const contexts: LeagueContext[] = [];
  for (const league of leagues) {
    try {
      contexts.push(await buildLeagueContext(league.id, now));
    } catch {
      // A league that can't be built is reported via freshness warnings.
    }
  }

  const openActions = await prisma.action.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ severity: 'asc' }, { deadline: 'asc' }],
  });

  const teams: BriefTeamSection[] = [];
  for (const ctx of contexts) {
    const leagueActions = openActions
      .filter((a) => a.leagueId === ctx.league.id)
      .sort((a, b) => SEVERITY_RANK[a.severity as Severity] - SEVERITY_RANK[b.severity as Severity]);

    const slots: SlotDefinition[] = ctx.slots.map((s) => ({
      slot: s.slot,
      starters: s.starters,
      eligible: s.eligible,
      sortOrder: s.sortOrder,
    }));
    const { rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
    const lineup = optimizeLineup({ roster: ctx.all, slots });

    const risky = ctx.starters
      .filter((p) => ['QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR'].includes(p.injuryStatus) || p.onBye)
      .sort((a, b) => (b.projection?.points ?? 0) - (a.projection?.points ?? 0));

    const waiver = leagueActions.find((a) => a.type === 'WAIVER');

    teams.push({
      leagueId: ctx.league.id,
      leagueName: ctx.league.name,
      teamName: ctx.team.name,
      record: ctx.team.record,
      matchup: ctx.matchup
        ? {
            myProjected: ctx.matchup.myProjected,
            opponentProjected: ctx.matchup.opponentProjected,
            opponentName: ctx.matchup.opponentName,
            winProbability: ctx.matchup.winProbability,
          }
        : null,
      strategy: rationale,
      actions: leagueActions.slice(0, 4).map((a) => ({
        headline: a.headline,
        recommendation: a.recommendation,
        severity: a.severity as Severity,
        deadlineLabel: a.deadline ? gameTimeLabel(a.deadline) : null,
      })),
      bestWaiver: waiver ? waiver.recommendation : null,
      biggestRisk: risky[0]
        ? `${risky[0].name} (${risky[0].onBye ? 'on bye' : risky[0].injuryStatus.toLowerCase()}) — ${round1(risky[0].projection?.points ?? 0)} projected points at stake`
        : null,
      noActionNote:
        leagueActions.length === 0
          ? `${ctx.team.name} lineup looks optimized. Nothing to do.`
          : lineup.improvement <= 0.1
            ? 'Lineup is already optimal; the remaining items are roster moves, not start/sit calls.'
            : null,
    });
  }

  const exposure = buildExposureReport(contexts);
  const news = await rankNews(contexts, 3);
  const freshness = await getFreshness(now);

  const criticalCount = openActions.filter((a) => a.severity === 'CRITICAL').length;
  const actionsRequired = openActions.filter((a) => ['CRITICAL', 'HIGH'].includes(a.severity)).length;
  const monitor = openActions.filter((a) => a.type === 'INJURY' || a.type === 'NEWS').length;
  const waivers = openActions.filter((a) => a.type === 'WAIVER').length;

  const state = contexts[0];
  return {
    season: state?.season ?? new Date().getUTCFullYear(),
    week: state?.week ?? 1,
    generatedAt: now,
    teams,
    overall: {
      actionsRequired,
      playersToMonitor: monitor,
      waiverClaims: waivers,
      criticalCount,
      headline:
        actionsRequired === 0
          ? 'Nothing needs your attention right now.'
          : `${actionsRequired} action${actionsRequired === 1 ? '' : 's'} required, ${monitor} player${monitor === 1 ? '' : 's'} to monitor, ${waivers} waiver claim${waivers === 1 ? '' : 's'} worth considering.`,
    },
    exposureSummary: exposure.summary,
    topNews: news.filter((n) => n.impactScore >= 30).map((n) => ({ headline: n.headline, interpretation: n.interpretation })),
    staleWarnings: freshness
      .filter((f) => f.isStale && f.status !== 'NEVER')
      .map((f) => `${f.label} data is ${f.ageMinutes === null ? 'missing' : `${f.ageMinutes} minutes old`} — refresh before trusting it.`),
  };
}
