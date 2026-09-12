'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Clock3, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Mark an action done or snooze it.
 * The app never performs the roster transaction itself — this only records that
 * you handled it, so the queue reflects reality.
 */
export function ActionControls({ actionId, status }: { actionId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(next: 'DONE' | 'SNOOZED' | 'OPEN', minutes?: number) {
    setBusy(true);
    try {
      await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, snoozeMinutes: minutes }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-border/60 pt-3">
      {status === 'DONE' || status === 'SNOOZED' ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => update('OPEN')}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Reopen
        </Button>
      ) : (
        <>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => update('DONE')}>
            <Check className="h-3.5 w-3.5" aria-hidden /> Done
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => update('SNOOZED', 180)}>
            <Clock3 className="h-3.5 w-3.5" aria-hidden /> Snooze 3h
          </Button>
        </>
      )}
    </div>
  );
}
