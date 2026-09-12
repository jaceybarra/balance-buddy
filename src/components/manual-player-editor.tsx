'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { INJURY_STATUSES } from '@/lib/domain/enums';

/** Override a player's status or NFL team when a provider is wrong or offline. */
export function ManualPlayerEditor({
  players,
}: {
  players: { id: string; name: string; injuryStatus: string; nflTeamAbbr: string | null; isManual: boolean }[];
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const [status, setStatus] = useState(players[0]?.injuryStatus ?? 'HEALTHY');
  const [team, setTeam] = useState(players[0]?.nflTeamAbbr ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onSelect(id: string) {
    setPlayerId(id);
    const p = players.find((x) => x.id === id);
    setStatus(p?.injuryStatus ?? 'HEALTHY');
    setTeam(p?.nflTeamAbbr ?? '');
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/manual/player', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId, injuryStatus: status, nflTeamAbbr: team || null, pinManual: true }),
      });
      const json = await res.json();
      setMessage(res.ok ? 'Saved. This player is now pinned as manually maintained.' : (json.error ?? 'Failed'));
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Manual player override</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Use this when a provider is wrong or unavailable. Pinned players are not overwritten by future syncs.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select
          value={playerId}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="Player"
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isManual ? ' (manual)' : ''}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="Injury status"
        >
          {INJURY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={team}
          onChange={(e) => setTeam(e.target.value.toUpperCase())}
          placeholder="NFL team (e.g. SEA)"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="NFL team"
        />
      </div>
      <Button className="mt-3" size="sm" onClick={save} disabled={busy || !playerId}>
        {busy ? 'Saving…' : 'Save override'}
      </Button>
      {message ? <p className="mt-2 text-[13px] text-muted-foreground">{message}</p> : null}
    </Card>
  );
}
