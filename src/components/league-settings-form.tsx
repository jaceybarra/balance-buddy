'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Editable league fields — notably size, which is unknown until ESPN sync. */
export function LeagueSettingsForm({
  league,
}: {
  league: { id: string; name: string; size: number | null; ppr: number };
}) {
  const router = useRouter();
  const [name, setName] = useState(league.name);
  const [size, setSize] = useState(league.size === null ? '' : String(league.size));
  const [ppr, setPpr] = useState(String(league.ppr));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'league',
          leagueId: league.id,
          name,
          size: size === '' ? null : Number(size),
          ppr: Number(ppr),
        }),
      });
      const json = await res.json();
      setMessage(res.ok ? 'Saved' : (json.error ?? 'Failed'));
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-4">
      <label className="text-[11px] text-muted-foreground sm:col-span-2">
        League name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="text-[11px] text-muted-foreground">
        Teams (blank = unknown)
        <input
          value={size}
          onChange={(e) => setSize(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="unknown"
          inputMode="numeric"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="text-[11px] text-muted-foreground">
        Points per reception
        <input
          value={ppr}
          onChange={(e) => setPpr(e.target.value)}
          inputMode="decimal"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-4">
        <Button size="sm" variant="secondary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save league settings'}
        </Button>
        {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
