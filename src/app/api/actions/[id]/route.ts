import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { zActionStatus } from '@/lib/domain/enums';

export const runtime = 'nodejs';

const bodySchema = z.object({
  status: zActionStatus,
  snoozeMinutes: z.number().int().positive().max(10080).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { status, snoozeMinutes } = parsed.data;
  const snoozedUntil = status === 'SNOOZED' ? new Date(Date.now() + (snoozeMinutes ?? 180) * 60_000) : null;

  try {
    const action = await prisma.action.update({
      where: { id },
      data: { status, snoozedUntil },
    });
    return NextResponse.json({ id: action.id, status: action.status, snoozedUntil: action.snoozedUntil });
  } catch {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }
}
