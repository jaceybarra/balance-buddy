import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { buildLeagueContext } from '@/lib/data/context';
import { analyzeTrade } from '@/lib/engine/trade';
import { stringify } from '@/lib/json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  leagueId: z.string().min(1),
  give: z.array(z.string()).max(6),
  get: z.array(z.string()).max(6),
  save: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid trade request' }, { status: 400 });
  const { leagueId, give, get, save } = parsed.data;
  if (give.length === 0 && get.length === 0) {
    return NextResponse.json({ error: 'Add at least one player to each side.' }, { status: 400 });
  }

  try {
    const ctx = await buildLeagueContext(leagueId);
    const result = await analyzeTrade(ctx, { give, get });

    if (save) {
      await prisma.tradeAnalysis.create({
        data: {
          leagueId,
          teamId: ctx.team.id,
          giveJson: stringify(give),
          getJson: stringify(get),
          verdict: result.verdict,
          lineupDelta: result.lineupDelta,
          rosDelta: result.rosDelta,
          depthDelta: result.depthDelta,
          explanation: result.explanation,
          detailJson: stringify(result.details),
        },
      });
    }

    return NextResponse.json({
      ...result,
      give: result.give.map(slim),
      get: result.get.map(slim),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Trade analysis failed' }, { status: 500 });
  }
}

function slim(p: { id: string; name: string; position: string; nflTeamAbbr: string | null; projection: { expected: number } | null; rosPerGame: number | null }) {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.nflTeamAbbr,
    projected: p.projection?.expected ?? null,
    rosPerGame: p.rosPerGame,
  };
}
