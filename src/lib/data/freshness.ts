import { prisma } from '../db';
import { DATA_SCOPES, SCOPE_LABEL, STALE_AFTER_MINUTES, type DataScope } from '../domain/enums';

export interface FreshnessEntry {
  scope: DataScope;
  label: string;
  provider: string | null;
  lastSuccessAt: Date | null;
  ageMinutes: number | null;
  isStale: boolean;
  status: string;
  message: string | null;
  itemCount: number;
  scopeKey: string | null;
}

/**
 * Freshness is tracked PER SCOPE, because "the app synced" is not a useful
 * statement — ESPN rosters can be an hour old while the injury feed is fine.
 * Anything past its scope's staleness budget is flagged in the UI.
 */
export async function getFreshness(now: Date = new Date()): Promise<FreshnessEntry[]> {
  const rows = await prisma.dataSync.findMany({ orderBy: { startedAt: 'desc' }, take: 200 });

  return DATA_SCOPES.map((scope) => {
    const latest = rows.find((r) => r.scope === scope);
    // PARTIAL means "we got data, with caveats" (a degraded provider, an
    // unmapped field). That is still data, so it counts as a successful sync —
    // otherwise the UI cries "never synced" about data it is actively showing.
    const lastSuccess = rows.find((r) => r.scope === scope && (r.status === 'OK' || r.status === 'PARTIAL'));
    const at = lastSuccess?.finishedAt ?? lastSuccess?.startedAt ?? null;
    const ageMinutes = at ? Math.round((now.getTime() - at.getTime()) / 60000) : null;
    const budget = STALE_AFTER_MINUTES[scope];

    return {
      scope,
      label: SCOPE_LABEL[scope],
      provider: latest?.provider ?? null,
      lastSuccessAt: at,
      ageMinutes,
      isStale: ageMinutes === null || ageMinutes > budget,
      status: latest?.status ?? 'NEVER',
      message: latest?.message ?? null,
      itemCount: latest?.itemCount ?? 0,
      scopeKey: latest?.scopeKey ?? null,
    };
  });
}

export async function getStaleScopes(now: Date = new Date()): Promise<FreshnessEntry[]> {
  return (await getFreshness(now)).filter((f) => f.isStale);
}

/** Record the start of a sync; returns the row id to finish it with. */
export async function startSync(scope: DataScope, provider: string, scopeKey?: string): Promise<string> {
  const row = await prisma.dataSync.create({
    data: { scope, provider, scopeKey: scopeKey ?? null, status: 'RUNNING', staleAfterMinutes: STALE_AFTER_MINUTES[scope] },
  });
  return row.id;
}

export async function finishSync(
  id: string,
  status: 'OK' | 'PARTIAL' | 'FAILED',
  itemCount = 0,
  message?: string,
): Promise<void> {
  await prisma.dataSync.update({
    where: { id },
    data: { status, itemCount, message: message ?? null, finishedAt: new Date() },
  });
}

/** Freshness for a single scope, for the small "updated X ago" labels. */
export async function freshnessFor(scope: DataScope, now: Date = new Date()): Promise<FreshnessEntry> {
  const all = await getFreshness(now);
  return all.find((f) => f.scope === scope)!;
}
