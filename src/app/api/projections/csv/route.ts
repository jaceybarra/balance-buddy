import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseProjectionCsv, csvUploadSchema } from '@/lib/providers/projection/csv';
import { findPlayerByName } from '@/lib/identity/resolve';
import { getSeasonState } from '@/lib/season';
import { PROJECTION_SOURCES, GLOBAL_SCOPE } from '@/lib/projections/sources';
import { buildConsensus } from '@/lib/projections/generate';
import { regenerateActions } from '@/lib/engine/actions';
import { startSync, finishSync } from '@/lib/data/freshness';
import { stringify } from '@/lib/json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manual projection import.
 * Rows are matched to canonical players by provider-independent name
 * resolution; anything ambiguous is REPORTED rather than guessed.
 */
export async function POST(request: Request) {
  const parsed = csvUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send { csv: string, week?: number }' }, { status: 400 });

  const result = parseProjectionCsv(parsed.data.csv);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: result.errors.join(' ') || 'No rows parsed', ...result }, { status: 400 });
  }

  const state = await getSeasonState();
  const week = parsed.data.week ?? state.week;
  const syncId = await startSync('PROJECTIONS', 'CSV');

  let imported = 0;
  const unmatched: string[] = [];

  for (const row of result.rows) {
    const player = await findPlayerByName(row.name, row.position ?? undefined);
    if (!player) {
      unmatched.push(row.name);
      continue;
    }
    await prisma.projection.upsert({
      where: {
        playerId_season_week_source_leagueScope: {
          playerId: player.id,
          season: state.season,
          week: row.week ?? week,
          source: PROJECTION_SOURCES.CSV,
          leagueScope: GLOBAL_SCOPE,
        },
      },
      create: {
        playerId: player.id,
        season: state.season,
        week: row.week ?? week,
        source: PROJECTION_SOURCES.CSV,
        leagueScope: GLOBAL_SCOPE,
        statLineJson: stringify(row.statLine),
        providerPoints: row.providerPoints,
        confidence: 0.65,
      },
      update: {
        statLineJson: stringify(row.statLine),
        providerPoints: row.providerPoints,
        confidence: 0.65,
      },
    });
    imported++;
  }

  await buildConsensus(state.season, week);
  await regenerateActions();
  await finishSync(syncId, unmatched.length > 0 ? 'PARTIAL' : 'OK', imported, `${imported} imported, ${unmatched.length} unmatched`);

  return NextResponse.json({
    imported,
    unmatched,
    week,
    warnings: result.warnings,
    errors: result.errors,
    recognizedColumns: result.recognizedColumns,
    ignoredColumns: result.ignoredColumns,
  });
}
