'use client';

import { useState } from 'react';
import { PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Diagnosis {
  leagueId: string;
  leagueName: string;
  credentialKey: string;
  configured: { leagueId: boolean; teamId: boolean; cookies: boolean };
  envVars: Record<string, string>;
  reachable: boolean;
  status: string;
  hint: string | null;
  espn: {
    name: string;
    size: number | null;
    currentWeek: number | null;
    teamCount: number;
    myTeam: string | null;
    myRosterCount: number | null;
  } | null;
  scoring: { mapped: number; unmapped: { id: string | number; points: number }[]; differences: string[] } | null;
}

/**
 * Read-only connection test. Changes nothing — it exists so an ESPN problem
 * produces a specific answer and the variable that fixes it, instead of a
 * blank page.
 */
export function EspnDiagnose() {
  const [results, setResults] = useState<Diagnosis[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/espn/diagnose', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Diagnosis failed');
      else setResults(json.leagues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diagnosis failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Test ESPN connection</h3>
          <p className="text-[13px] text-muted-foreground">
            Reads only. Tells you whether each league is reachable, whether your team id matches, and which scoring
            items could not be mapped.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={busy}>
          <PlugZap className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Testing…' : 'Test connection'}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}

      {results?.map((d) => (
        <div key={d.leagueId} className="mt-4 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{d.leagueName}</h4>
            <Badge variant={d.reachable ? 'good' : 'critical'}>{d.reachable ? 'connected' : 'not connected'}</Badge>
            {!d.configured.cookies ? <Badge variant="watch">no cookies</Badge> : null}
          </div>

          <p className="mt-2 text-[13px]">{d.status}</p>
          {d.hint ? <p className="mt-1 text-[13px] text-watch">{d.hint}</p> : null}

          {d.espn ? (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">ESPN name</dt>
                <dd className="font-medium">{d.espn.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Teams</dt>
                <dd className="tabular font-medium">{d.espn.size ?? d.espn.teamCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ESPN week</dt>
                <dd className="tabular font-medium">{d.espn.currentWeek ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Your roster</dt>
                <dd className="tabular font-medium">{d.espn.myRosterCount ?? '—'}</dd>
              </div>
            </dl>
          ) : null}

          {d.scoring ? (
            <div className="mt-3 space-y-1 text-[12px]">
              <p className="text-muted-foreground">
                {d.scoring.mapped} scoring rules mapped
                {d.scoring.unmapped.length > 0 ? `, ${d.scoring.unmapped.length} unrecognized` : ''}
              </p>
              {d.scoring.unmapped.length > 0 ? (
                <p className="text-watch">
                  Unmapped statIds (not applied — confirm manually):{' '}
                  {d.scoring.unmapped.map((u) => `${u.id}=${u.points}`).join(', ')}
                </p>
              ) : null}
              {d.scoring.differences.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">
                    {d.scoring.differences.length} difference{d.scoring.differences.length === 1 ? '' : 's'} from the
                    stored rules
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {d.scoring.differences.map((diff) => (
                      <li key={diff}>• {diff}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {!d.reachable ? (
            <ul className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
              {Object.entries(d.envVars).map(([field, name]) => (
                <li key={field}>
                  <code className="text-[10px]">{name}</code>{' '}
                  {field === 'leagueId'
                    ? d.configured.leagueId
                      ? '✓ set'
                      : '✗ missing'
                    : field === 'teamId'
                      ? d.configured.teamId
                        ? '✓ set'
                        : '✗ missing'
                      : d.configured.cookies
                        ? '✓ set'
                        : '✗ missing'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
