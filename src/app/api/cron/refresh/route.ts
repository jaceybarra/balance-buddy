import { NextResponse } from 'next/server';
import { refreshEverything } from '@/lib/engine/sync';
import { getSeasonState } from '@/lib/season';
import { prisma } from '@/lib/db';
import { redact } from '@/lib/providers/espn/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled refresh target (Vercel Cron hits this with GET).
 *
 * The schedule itself is intentionally dumb — it runs often — and the DECISION
 * about how much work to do is made here from real kickoff data, so nothing
 * assumes "games are on Sunday at 1pm ET" or that the NFL calendar is fixed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const state = await getSeasonState(now);
    const urgency = await computeUrgency(state.season, state.week, now);

    // Away from kickoffs, skip the expensive ESPN pass on most runs.
    const skipEspn = urgency === 'IDLE';
    const result = await refreshEverything({ skipEspn });

    return NextResponse.json({ ...result, urgency, skippedEspn: skipEspn });
  } catch (err) {
    return NextResponse.json({ error: redact(err instanceof Error ? err.message : 'Cron refresh failed') }, { status: 500 });
  }
}

/**
 * How close are we to a decision point? Derived from actual kickoff times.
 *   IMMINENT — a game kicks off within 2 hours (lineup locks, inactives)
 *   ACTIVE   — games today, or a game finished in the last few hours
 *   IDLE     — nothing within a day
 */
async function computeUrgency(season: number, week: number, now: Date): Promise<'IMMINENT' | 'ACTIVE' | 'IDLE'> {
  const games = await prisma.nFLGame.findMany({
    where: { season, week },
    select: { kickoff: true, status: true },
    orderBy: { kickoff: 'asc' },
  });
  if (games.length === 0) return 'IDLE';

  const twoHours = 2 * 3600_000;
  const oneDay = 24 * 3600_000;

  for (const game of games) {
    const delta = game.kickoff.getTime() - now.getTime();
    if (delta > 0 && delta <= twoHours) return 'IMMINENT';
    if (delta <= 0 && delta > -4 * 3600_000) return 'IMMINENT'; // games in progress
  }
  for (const game of games) {
    const delta = Math.abs(game.kickoff.getTime() - now.getTime());
    if (delta <= oneDay) return 'ACTIVE';
  }
  return 'IDLE';
}
