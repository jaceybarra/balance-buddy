import { NextResponse } from 'next/server';
import { refreshEverything } from '@/lib/engine/sync';
import { redact } from '@/lib/providers/espn/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Refresh Everything".
 * Always returns 200 with a per-step report: a failed provider is information,
 * not an error page.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const skipEspn = url.searchParams.get('skipEspn') === '1';
    const result = await refreshEverything({ skipEspn });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: redact(err instanceof Error ? err.message : 'Refresh failed'), steps: [] },
      { status: 500 },
    );
  }
}
