import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { stringify } from '@/lib/json';
import { regenerateActions } from '@/lib/engine/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('app'),
    key: z.string().min(1).max(64),
    value: z.unknown(),
  }),
  z.object({
    kind: z.literal('league'),
    leagueId: z.string().min(1),
    name: z.string().min(1).max(80).optional(),
    size: z.number().int().min(2).max(32).nullable().optional(),
    ppr: z.number().min(0).max(2).optional(),
  }),
  z.object({
    kind: z.literal('scoringRule'),
    leagueId: z.string().min(1),
    statKey: z.string().min(1),
    ruleKind: z.enum(['PER_UNIT', 'BONUS', 'TIER']),
    points: z.number(),
    rangeMin: z.number().nullable().optional(),
    rangeMax: z.number().nullable().optional(),
  }),
  z.object({
    kind: z.literal('rosterSlot'),
    leagueId: z.string().min(1),
    slot: z.string().min(1),
    starters: z.number().int().min(0).max(20),
    maxAtPosition: z.number().int().min(0).max(20).nullable().optional(),
  }),
]);

/** Manual configuration. Anything set here is marked MANUAL and survives syncs. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings payload', issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;

  try {
    if (body.kind === 'app') {
      await prisma.appSetting.upsert({
        where: { key: body.key },
        create: { key: body.key, valueJson: stringify(body.value) },
        update: { valueJson: stringify(body.value) },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.kind === 'league') {
      await prisma.league.update({
        where: { id: body.leagueId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.size !== undefined ? { size: body.size } : {}),
          ...(body.ppr !== undefined ? { ppr: body.ppr } : {}),
          isSeeded: false,
        },
      });
      await regenerateActions();
      return NextResponse.json({ ok: true });
    }

    if (body.kind === 'scoringRule') {
      await prisma.leagueScoringRule.upsert({
        where: {
          leagueId_statKey_kind_rangeMin_rangeMax: {
            leagueId: body.leagueId,
            statKey: body.statKey,
            kind: body.ruleKind,
            rangeMin: (body.rangeMin ?? null) as number,
            rangeMax: (body.rangeMax ?? null) as number,
          },
        },
        create: {
          leagueId: body.leagueId,
          statKey: body.statKey,
          kind: body.ruleKind,
          points: body.points,
          rangeMin: body.rangeMin ?? null,
          rangeMax: body.rangeMax ?? null,
          category: 'OFFENSE',
          source: 'MANUAL',
        },
        update: { points: body.points, source: 'MANUAL' },
      });
      await regenerateActions();
      return NextResponse.json({ ok: true });
    }

    await prisma.rosterSlotConfig.updateMany({
      where: { leagueId: body.leagueId, slot: body.slot },
      data: { starters: body.starters, maxAtPosition: body.maxAtPosition ?? null, source: 'MANUAL' },
    });
    await regenerateActions();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}
