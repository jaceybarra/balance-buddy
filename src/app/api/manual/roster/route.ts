import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { zRosterSlot } from '@/lib/domain/enums';
import { regenerateActions } from '@/lib/engine/actions';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('move'), teamId: z.string(), playerId: z.string(), slot: zRosterSlot, slotIndex: z.number().int().min(0).max(20).optional() }),
  z.object({ op: z.literal('add'), teamId: z.string(), playerId: z.string(), slot: zRosterSlot.optional() }),
  z.object({ op: z.literal('remove'), teamId: z.string(), playerId: z.string() }),
]);

/**
 * Manual roster editing.
 * Rows touched here are flagged isManual so an ESPN sync will not silently
 * revert a correction the user made by hand.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;

  const team = await prisma.fantasyTeam.findUnique({ where: { id: body.teamId }, include: { league: { include: { rosterSlots: true } } } });
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  if (body.op === 'remove') {
    await prisma.rosterPlayer.deleteMany({ where: { teamId: body.teamId, playerId: body.playerId } });
    await regenerateActions();
    return NextResponse.json({ ok: true });
  }

  const slot = body.op === 'move' ? body.slot : (body.slot ?? 'BENCH');
  const config = team.league.rosterSlots.find((s) => s.slot === slot);
  if (!config) return NextResponse.json({ error: `This league has no ${slot} slot.` }, { status: 400 });

  // Enforce the league's own slot capacity rather than trusting the client.
  const occupied = await prisma.rosterPlayer.count({ where: { teamId: body.teamId, slot, NOT: { playerId: body.playerId } } });
  if (occupied >= config.starters) {
    return NextResponse.json(
      { error: `${slot} is full (${config.starters} spot${config.starters === 1 ? '' : 's'}). Move someone out first.` },
      { status: 400 },
    );
  }

  await prisma.rosterPlayer.upsert({
    where: { teamId_playerId: { teamId: body.teamId, playerId: body.playerId } },
    create: {
      teamId: body.teamId,
      playerId: body.playerId,
      slot,
      slotIndex: body.op === 'move' ? (body.slotIndex ?? occupied) : occupied,
      isManual: true,
      source: 'MANUAL',
      acquisitionType: 'FREE_AGENT',
    },
    update: { slot, slotIndex: body.op === 'move' ? (body.slotIndex ?? occupied) : occupied, isManual: true, source: 'MANUAL' },
  });

  await regenerateActions();
  return NextResponse.json({ ok: true });
}
