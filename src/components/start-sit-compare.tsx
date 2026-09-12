'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceMeter } from '@/components/confidence';
import { compareStartSit } from '@/lib/engine/start-sit';
import type { PlayerCard } from '@/lib/data/context';
import type { LineupStrategy } from '@/lib/optimizer/lineup';
import { cn } from '@/lib/utils';

const VERDICT_VARIANT = {
  STRONG_START: 'good',
  LEAN_START: 'primary',
  COIN_FLIP: 'watch',
  AVOID: 'critical',
} as const;

/**
 * Compare any two or more players side by side.
 * Runs the same pure comparison function the server engines use, so the answer
 * here always matches the action queue.
 */
export function StartSitCompare({ players, strategy }: { players: PlayerCard[]; strategy: LineupStrategy }) {
  const [selected, setSelected] = useState<string[]>(() => players.slice(0, 2).map((p) => p.id));

  const result = useMemo(() => {
    const chosen = players.filter((p) => selected.includes(p.id));
    return chosen.length >= 1 ? compareStartSit(chosen, strategy) : null;
  }, [players, selected, strategy]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(-4)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={() => toggle(player.id)}
            aria-pressed={selected.includes(player.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              selected.includes(player.id)
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {player.name}
          </button>
        ))}
      </div>

      {result ? (
        <Card className="p-4">
          <p className="text-sm font-medium">{result.recommendation}</p>
          <ConfidenceMeter value={result.confidence} className="mt-2" />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Factor</th>
                  {result.rows.map((row) => (
                    <th key={row.player.id} className="pb-2 font-medium">
                      {row.player.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Verdict</td>
                  {result.rows.map((row) => (
                    <td key={row.player.id} className="py-1.5">
                      <Badge variant={VERDICT_VARIANT[row.verdict]}>{row.verdictLabel}</Badge>
                    </td>
                  ))}
                </tr>
                {(result.rows[0]?.factors ?? []).map((factor, idx) => (
                  <tr key={factor.label} className="border-t border-border/50">
                    <td className="py-1.5 text-muted-foreground">{factor.label}</td>
                    {result.rows.map((row) => {
                      const f = row.factors[idx];
                      return (
                        <td key={row.player.id} className="tabular py-1.5">
                          <span className="inline-flex items-center gap-1">
                            {f?.value ?? '—'}
                            {f?.edge === 'up' ? (
                              <ArrowUp className="h-3 w-3 text-good" aria-label="advantage" />
                            ) : f?.edge === 'down' ? (
                              <ArrowDown className="h-3 w-3 text-critical" aria-label="disadvantage" />
                            ) : (
                              <Minus className="h-3 w-3 text-muted-foreground/40" aria-hidden />
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Pick players above to compare them.</p>
      )}
    </div>
  );
}
