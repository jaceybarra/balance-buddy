import { prisma } from '../db';
import type { LeagueContext } from '../data/context';
import { relativeTime } from '../time';

export interface RankedNews {
  id: string;
  headline: string;
  interpretation: string | null;
  body: string | null;
  playerId: string | null;
  playerName: string | null;
  publishedAt: Date;
  ago: string;
  impactScore: number;
  category: string;
  source: string;
  /** Which of my teams this actually touches. */
  affects: { leagueName: string; slot: string | null }[];
  /** True when the item changes a decision rather than just being news. */
  actionable: boolean;
}

/**
 * News is ranked by IMPACT ON MY DECISIONS, not by newsworthiness.
 *
 * A coach's compliment about a player I don't own is noise. A practice
 * upgrade for a starter with an open contingency plan is the most important
 * thing on the screen.
 */
export async function rankNews(contexts: LeagueContext[], limit = 20): Promise<RankedNews[]> {
  const rosterIndex = new Map<string, { leagueName: string; slot: string | null; projected: number }[]>();
  for (const ctx of contexts) {
    for (const card of ctx.all) {
      const list = rosterIndex.get(card.id) ?? [];
      list.push({ leagueName: ctx.league.name, slot: card.slot, projected: card.projection?.expected ?? 0 });
      rosterIndex.set(card.id, list);
    }
  }

  const items = await prisma.playerNews.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 120,
    include: { player: true },
  });

  const ranked = items.map<RankedNews>((item) => {
    const owned = item.playerId ? (rosterIndex.get(item.playerId) ?? []) : [];
    const isStarter = owned.some((o) => o.slot && !['BENCH', 'IR'].includes(o.slot));
    const projected = Math.max(0, ...owned.map((o) => o.projected), 0);

    // Scoring: relevance to my rosters dominates everything else.
    let score = 0;
    if (owned.length > 0) score += 35;
    if (isStarter) score += 25;
    if (owned.length > 1) score += 10; // exposure on both teams
    score += Math.min(15, projected * 0.8);
    if (item.category === 'INJURY' || item.category === 'GAME_STATUS') score += 15;
    if (item.category === 'DEPTH_CHART') score += 10;
    if (item.category === 'GENERAL') score -= 10;

    const ageHours = (Date.now() - item.publishedAt.getTime()) / 3_600_000;
    score -= Math.min(20, ageHours * 1.5);

    return {
      id: item.id,
      headline: item.headline,
      interpretation: item.interpretation,
      body: item.body,
      playerId: item.playerId,
      playerName: item.player?.fullName ?? null,
      publishedAt: item.publishedAt,
      ago: relativeTime(item.publishedAt),
      impactScore: Math.round(Math.max(0, score)),
      category: item.category,
      source: item.source,
      affects: owned.map((o) => ({ leagueName: o.leagueName, slot: o.slot })),
      actionable: score >= 45,
    };
  });

  return ranked.sort((a, b) => b.impactScore - a.impactScore).slice(0, limit);
}

/**
 * Turn an injury-status CHANGE into a news item with a "so what".
 * This is what makes the feed useful: not "he is questionable", but "he no
 * longer carries a designation, so your contingency plan is unnecessary".
 */
export async function recordInjuryChange(args: {
  playerId: string;
  playerName: string;
  from: string;
  to: string;
  detail?: string | null;
  source: string;
  at?: Date;
}): Promise<void> {
  const at = args.at ?? new Date();
  const improved = severityRank(args.to) < severityRank(args.from);
  const interpretation = buildInterpretation(args.playerName, args.from, args.to, improved);

  await prisma.playerNews.create({
    data: {
      playerId: args.playerId,
      headline: `${args.playerName}: ${humanize(args.from)} → ${humanize(args.to)}`,
      body: args.detail ?? null,
      source: args.source,
      publishedAt: at,
      category: args.to === 'OUT' || args.from === 'OUT' ? 'GAME_STATUS' : 'INJURY',
      impactScore: improved ? 55 : 75,
      interpretation,
    },
  });

  await prisma.injuryReport.create({
    data: { playerId: args.playerId, status: args.to, detail: args.detail ?? null, reportedAt: at, source: args.source },
  });
}

function buildInterpretation(name: string, from: string, to: string, improved: boolean): string {
  if (to === 'HEALTHY') return `${name} no longer carries an injury designation. Any contingency plan you built for him is no longer necessary.`;
  if (to === 'OUT' || to === 'IR') return `${name} will not play. Move him out of your lineup now and promote his replacement.`;
  if (to === 'DOUBTFUL') return `${name} is unlikely to play (roughly a 1-in-5 chance). Plan as if he is out and keep the decision open until inactives.`;
  if (to === 'QUESTIONABLE') return `${name} is a true game-time decision. Have a replacement ready and check inactives 90 minutes before kickoff.`;
  return improved ? `${name}'s designation improved from ${humanize(from)} to ${humanize(to)}.` : `${name}'s designation worsened to ${humanize(to)}.`;
}

function severityRank(status: string): number {
  const order = ['HEALTHY', 'UNKNOWN', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'PUP', 'SUSPENDED', 'IR'];
  const idx = order.indexOf(status);
  return idx === -1 ? 1 : idx;
}

function humanize(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
}
