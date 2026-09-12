import { prisma } from '../db';
import { buildLeagueContext, type LeagueContext } from './context';
import { getFreshness, type FreshnessEntry } from './freshness';
import { optimizeLineup, strategyForMatchup, type SlotDefinition } from '../optimizer/lineup';
import { buildExposureReport, type ExposureReport } from '../engine/exposure';
import { SEVERITY_RANK, type Severity } from '../domain/enums';
import { parseJson } from '../json';
import { z } from 'zod';

export interface ActionView {
  id: string;
  type: string;
  severity: Severity;
  status: string;
  leagueId: string | null;
  leagueName: string | null;
  teamId: string | null;
  playerId: string | null;
  headline: string;
  recommendation: string;
  reason: string;
  confidence: number;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  source: string;
  payload: Record<string, unknown> | null;
}

export interface TeamSummary {
  ctx: LeagueContext;
  actionCount: number;
  criticalCount: number;
  actions: ActionView[];
  lineup: ReturnType<typeof optimizeLineup>;
  strategyRationale: string;
  playingNow: number;
  lockedCount: number;
  injuredStarters: number;
  byeStarters: number;
}

export interface DashboardData {
  teams: TeamSummary[];
  actions: ActionView[];
  freshness: FreshnessEntry[];
  exposure: ExposureReport;
  week: number;
  season: number;
  weekSource: string;
  totalActions: number;
}

const payloadSchema = z.record(z.unknown());

export function toActionView(row: {
  id: string;
  type: string;
  severity: string;
  status: string;
  leagueId: string | null;
  teamId: string | null;
  playerId: string | null;
  headline: string;
  recommendation: string;
  reason: string;
  confidence: number;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  source: string;
  payloadJson: string | null;
  league?: { name: string } | null;
}): ActionView {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity as Severity,
    status: row.status,
    leagueId: row.leagueId,
    leagueName: row.league?.name ?? null,
    teamId: row.teamId,
    playerId: row.playerId,
    headline: row.headline,
    recommendation: row.recommendation,
    reason: row.reason,
    confidence: row.confidence,
    deadline: row.deadline,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: row.source,
    payload: row.payloadJson ? parseJson<Record<string, unknown>>(row.payloadJson, payloadSchema, {}) : null,
  };
}

/**
 * Everything the command center needs, in one pass.
 * Sorted by severity then deadline — the most urgent decision is always first.
 */
export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const leagues = await prisma.league.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });

  const contexts: LeagueContext[] = [];
  for (const league of leagues) {
    try {
      contexts.push(await buildLeagueContext(league.id, now));
    } catch (err) {
      console.error('[dashboard] failed to build league context', err);
    }
  }

  const rows = await prisma.action.findMany({
    where: { status: { in: ['OPEN', 'SNOOZED'] } },
    include: { league: { select: { name: true } } },
  });
  const actions = rows
    .map(toActionView)
    .filter((a) => a.status === 'OPEN' || !isSnoozeActive(a, now))
    .sort(compareActions);

  const teams: TeamSummary[] = contexts.map((ctx) => {
    const slots: SlotDefinition[] = ctx.slots.map((s) => ({
      slot: s.slot,
      starters: s.starters,
      eligible: s.eligible,
      sortOrder: s.sortOrder,
    }));
    const { strategy, rationale } = strategyForMatchup(ctx.matchup?.myProjected ?? 0, ctx.matchup?.opponentProjected ?? 0);
    const lineup = optimizeLineup({ roster: ctx.all, slots, strategy });
    const leagueActions = actions.filter((a) => a.leagueId === ctx.league.id);

    return {
      ctx,
      actions: leagueActions,
      actionCount: leagueActions.filter((a) => a.severity !== 'LOW').length,
      criticalCount: leagueActions.filter((a) => a.severity === 'CRITICAL').length,
      lineup,
      strategyRationale: rationale,
      playingNow: ctx.starters.filter((p) => p.game?.status === 'IN_PROGRESS').length,
      lockedCount: ctx.starters.filter((p) => p.lock === 'LOCKED').length,
      injuredStarters: ctx.starters.filter((p) => !['HEALTHY', 'UNKNOWN'].includes(p.injuryStatus)).length,
      byeStarters: ctx.starters.filter((p) => p.onBye).length,
    };
  });

  return {
    teams,
    actions,
    freshness: await getFreshness(now),
    exposure: buildExposureReport(contexts),
    week: contexts[0]?.week ?? 1,
    season: contexts[0]?.season ?? new Date().getUTCFullYear(),
    weekSource: contexts[0]?.weekSource ?? 'FALLBACK',
    totalActions: actions.filter((a) => a.severity !== 'LOW').length,
  };
}

function isSnoozeActive(action: ActionView, now: Date): boolean {
  void action;
  void now;
  return false;
}

/** Severity first, then the nearest deadline, then the biggest projected gain. */
export function compareActions(a: ActionView, b: ActionView): number {
  const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (sev !== 0) return sev;
  const aTime = a.deadline?.getTime() ?? Infinity;
  const bTime = b.deadline?.getTime() ?? Infinity;
  if (aTime !== bTime) return aTime - bTime;
  return b.confidence - a.confidence;
}
