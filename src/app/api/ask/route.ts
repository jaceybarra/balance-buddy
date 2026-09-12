import { NextResponse } from 'next/server';
import { z } from 'zod';
import { askGm } from '@/lib/ai/ask';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ question: z.string().min(2).max(500) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ask a question between 2 and 500 characters.' }, { status: 400 });

  try {
    const answer = await askGm(parsed.data.question);
    return NextResponse.json(answer);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to answer' }, { status: 500 });
  }
}
