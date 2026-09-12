import type { LeagueContext, PlayerCard } from '../data/context';
import { round1 } from '../scoring/engine';

export interface ExposureEntry {
  playerId: string;
  name: string;
  position: string;
  nflTeamAbbr: string | null;
  /** Which of my teams roster him, and in what slot. */
  teams: { leagueId: string; leagueName: string; teamName: string; slot: string | null; projected: number | null }[];
  /** Share of my teams exposed to this player. */
  exposurePct: number;
  starterOnBoth: boolean;
  injuryStatus: string;
  byeWeek: number | null;
  /** Combined weekly points riding on this one player. */
  combinedProjection: number;
  note: string;
}

export interface ExposureReport {
  entries: ExposureEntry[];
  teamCount: number;
  byeConcentration: { week: number; players: string[]; teams: string[] }[];
  injuryConcentration: ExposureEntry[];
  /** Total share of my combined projected points coming from shared players. */
  dependencyPct: number;
  summary: string;
}

/**
 * Cross-team exposure.
 *
 * This report deliberately does NOT tell you to diversify. Owning the same
 * player twice is often correct — if he is the best option in both leagues,
 * that is a feature. What it does is make the concentration visible: how much
 * of your week rides on one player, one bye week, or one injury.
 */
export function buildExposureReport(contexts: LeagueContext[]): ExposureReport {
  const byPlayer = new Map<string, ExposureEntry>();
  let totalProjected = 0;

  for (const ctx of contexts) {
    for (const card of ctx.all) {
      if (card.slot === 'IR') continue;
      const entry = byPlayer.get(card.id) ?? {
        playerId: card.id,
        name: card.name,
        position: card.position,
        nflTeamAbbr: card.nflTeamAbbr,
        teams: [],
        exposurePct: 0,
        starterOnBoth: false,
        injuryStatus: card.injuryStatus,
        byeWeek: card.byeWeek,
        combinedProjection: 0,
        note: '',
      };
      entry.teams.push({
        leagueId: ctx.league.id,
        leagueName: ctx.league.name,
        teamName: ctx.team.name,
        slot: card.slot,
        projected: card.projection?.expected ?? null,
      });
      entry.combinedProjection = round1(entry.combinedProjection + (card.projection?.expected ?? 0));
      byPlayer.set(card.id, entry);
    }
    totalProjected += ctx.starters.reduce((s, p) => s + (p.projection?.expected ?? 0), 0);
  }

  const teamCount = contexts.length;
  const shared: ExposureEntry[] = [];
  for (const entry of byPlayer.values()) {
    if (entry.teams.length < 2) continue;
    entry.exposurePct = Math.round((entry.teams.length / teamCount) * 100);
    entry.starterOnBoth = entry.teams.every((t) => t.slot !== null && !['BENCH', 'IR'].includes(t.slot));
    entry.note = describeExposure(entry);
    shared.push(entry);
  }
  shared.sort((a, b) => b.combinedProjection - a.combinedProjection);

  // Bye-week concentration across BOTH rosters.
  const byeMap = new Map<number, { players: Set<string>; teams: Set<string> }>();
  for (const ctx of contexts) {
    for (const card of ctx.all) {
      if (!card.byeWeek || card.slot === 'IR') continue;
      const bucket = byeMap.get(card.byeWeek) ?? { players: new Set(), teams: new Set() };
      bucket.players.add(card.name);
      bucket.teams.add(ctx.team.name);
      byeMap.set(card.byeWeek, bucket);
    }
  }
  const byeConcentration = [...byeMap.entries()]
    .filter(([, v]) => v.players.size >= 3)
    .map(([week, v]) => ({ week, players: [...v.players], teams: [...v.teams] }))
    .sort((a, b) => b.players.length - a.players.length);

  const injuryConcentration = shared.filter((e) => !['HEALTHY', 'UNKNOWN'].includes(e.injuryStatus));
  const sharedProjection = shared.reduce((s, e) => s + e.combinedProjection, 0);
  const dependencyPct = totalProjected > 0 ? Math.round((sharedProjection / totalProjected) * 100) : 0;

  return {
    entries: shared,
    teamCount,
    byeConcentration,
    injuryConcentration,
    dependencyPct,
    summary:
      shared.length === 0
        ? 'No player is on both of your rosters this week.'
        : `${shared.length} player${shared.length === 1 ? '' : 's'} on both rosters, carrying about ${dependencyPct}% of your combined projected starting points.`,
  };
}

function describeExposure(entry: ExposureEntry): string {
  const where = entry.teams.map((t) => `${t.teamName} (${t.slot})`).join(' and ');
  const base = `Started on ${where}.`;
  if (entry.starterOnBoth && !['HEALTHY', 'UNKNOWN'].includes(entry.injuryStatus)) {
    return `${base} He is ${entry.injuryStatus.toLowerCase()}, so one status update moves both of your weeks at once.`;
  }
  if (entry.starterOnBoth) {
    return `${base} ${entry.combinedProjection} combined projected points ride on his game — that is concentration, not necessarily a mistake.`;
  }
  return base;
}

export function exposureForPlayer(report: ExposureReport, playerId: string): ExposureEntry | null {
  return report.entries.find((e) => e.playerId === playerId) ?? null;
}

export type { PlayerCard };
