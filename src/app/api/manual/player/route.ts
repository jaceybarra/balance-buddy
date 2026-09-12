import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { zInjuryStatus } from '@/lib/domain/enums';
import { canonicalTeamAbbr } from '@/lib/seed/nfl-teams';
import { recordInjuryChange } from '@/lib/engine/news';
import { regenerateActions } from '@/lib/engine/actions';

export const runtime = 'nodejs';

const schema = z.object({
  playerId: z.string().min(1),
  injuryStatus: zInjuryStatus.optional(),
  injuryDetail: z.string().max(300).nullable().optional(),
  nflTeamAbbr: z.string().max(4).nullable().optional(),
  /** Pin the record so future syncs don't overwrite these manual values. */
  pinManual: z.boolean().optional(),
});

/**
 * Manual player override — the fallback when ESPN/Sleeper are wrong or down.
 * Manual values are marked so the UI can show "manual" and syncs leave them alone.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });

  const body = parsed.data;
  const player = await prisma.player.findUnique({ where: { id: body.playerId } });
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const teamAbbr = body.nflTeamAbbr === null ? null : body.nflTeamAbbr ? canonicalTeamAbbr(body.nflTeamAbbr) : undefined;
  if (body.nflTeamAbbr && !teamAbbr) {
    return NextResponse.json({ error: `"${body.nflTeamAbbr}" is not a recognized NFL team abbreviation.` }, { status: 400 });
  }

  const nflTeamId =
    teamAbbr === undefined ? undefined : teamAbbr === null ? null : (await prisma.nFLTeam.findUnique({ where: { abbr: teamAbbr } }))?.id ?? null;

  await prisma.player.update({
    where: { id: body.playerId },
    data: {
      ...(body.injuryStatus ? { injuryStatus: body.injuryStatus, injuryUpdatedAt: new Date() } : {}),
      ...(body.injuryDetail !== undefined ? { injuryDetail: body.injuryDetail } : {}),
      ...(teamAbbr !== undefined ? { nflTeamAbbr: teamAbbr, nflTeamId } : {}),
      ...(body.pinManual !== undefined ? { isManual: body.pinManual } : { isManual: true }),
      source: 'MANUAL',
    },
  });

  if (body.injuryStatus && body.injuryStatus !== player.injuryStatus) {
    await recordInjuryChange({
      playerId: player.id,
      playerName: player.fullName,
      from: player.injuryStatus,
      to: body.injuryStatus,
      detail: body.injuryDetail ?? null,
      source: 'MANUAL',
    });
  }

  await regenerateActions();
  return NextResponse.json({ ok: true });
}
