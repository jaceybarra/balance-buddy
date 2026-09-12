'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, pts, signedPts } from '@/lib/utils';

interface Option {
  id: string;
  name: string;
  position: string;
  team: string | null;
  projected: number | null;
  rosPerGame: number | null;
}

interface TradeResponse {
  verdict: string;
  verdictLabel: string;
  lineupDelta: number;
  rosDelta: number;
  depthDelta: number;
  legal: boolean;
  legalityNote: string | null;
  explanation: string;
  details: { label: string; before: number; after: number; delta: number; note: string }[];
  risks: string[];
  error?: string;
}

const VERDICT_VARIANT: Record<string, 'good' | 'primary' | 'muted' | 'watch' | 'critical'> = {
  ACCEPT: 'good',
  LEAN_ACCEPT: 'primary',
  EVEN: 'muted',
  LEAN_DECLINE: 'watch',
  DECLINE: 'critical',
};

/**
 * Trade analyzer.
 * The answer comes from the server engine (which rebuilds the roster and
 * re-runs the optimizer) — this component only collects the two sides.
 */
export function TradeAnalyzer({ leagueId, roster, available }: { leagueId: string; roster: Option[]; available: Option[] }) {
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [result, setResult] = useState<TradeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    setResult(null);
  }

  async function analyze() {
    setBusy(true);
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leagueId, give, get }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold">You give</h2>
        <p className="text-[11px] text-muted-foreground">Players from your roster.</p>
        <PlayerPicker options={roster} selected={give} onToggle={(id) => toggle(give, setGive, id)} />
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">You get</h2>
        <p className="text-[11px] text-muted-foreground">
          Any player in the league pool. (Players on other teams appear once ESPN sync has seen them.)
        </p>
        <PlayerPicker options={available} selected={get} onToggle={(id) => toggle(get, setGet, id)} />
      </Card>

      <Button onClick={analyze} disabled={busy || (give.length === 0 && get.length === 0)} className="w-full sm:w-auto">
        {busy ? 'Analyzing…' : 'Analyze trade'}
      </Button>

      {result ? (
        result.error ? (
          <Card className="border-l-4 border-l-critical p-4 text-sm">{result.error}</Card>
        ) : (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={VERDICT_VARIANT[result.verdict] ?? 'muted'}>{result.verdictLabel}</Badge>
              {!result.legal ? <Badge variant="critical">roster illegal</Badge> : null}
            </div>
            <p className="mt-3 text-sm">{result.explanation}</p>
            {result.legalityNote ? <p className="mt-2 text-sm text-critical">{result.legalityNote}</p> : null}

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-1 font-medium">Measure</th>
                  <th className="pb-1 text-right font-medium">Before</th>
                  <th className="pb-1 text-right font-medium">After</th>
                  <th className="pb-1 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {result.details.map((d) => (
                  <tr key={d.label} className="border-t border-border/50">
                    <td className="py-1.5">
                      {d.label}
                      <span className="block text-[11px] text-muted-foreground">{d.note}</span>
                    </td>
                    <td className="tabular py-1.5 text-right">{pts(d.before)}</td>
                    <td className="tabular py-1.5 text-right">{pts(d.after)}</td>
                    <td className={cn('tabular py-1.5 text-right font-medium', d.delta >= 0 ? 'text-good' : 'text-critical')}>
                      {signedPts(d.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.risks.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[13px] text-watch">
                {result.risks.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        )
      ) : null}
    </div>
  );
}

function PlayerPicker({
  options,
  selected,
  onToggle,
}: {
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())) : options.slice(0, 24);

  return (
    <div className="mt-2 space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            aria-pressed={selected.includes(o.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              selected.includes(o.id)
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.name}
            <span className="ml-1 text-[10px] text-muted-foreground">
              {o.position}
              {o.team ? ` ${o.team}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
