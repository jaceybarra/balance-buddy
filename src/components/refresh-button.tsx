'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Refresh Everything" — runs the whole sync + recommendation pipeline.
 * In production the same endpoint is driven by cron; this is the manual path.
 */
export function RefreshButton({ className, label = 'Refresh' }: { className?: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Refresh failed');
      const failed = (json.steps ?? []).filter((s: { status: string }) => s.status === 'FAILED').length;
      setMessage(failed > 0 ? `Refreshed with ${failed} source${failed === 1 ? '' : 's'} unavailable` : 'Up to date');
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      <Button variant="outline" size="sm" onClick={refresh} disabled={busy || pending} aria-busy={busy}>
        <RefreshCw className={cn('h-3.5 w-3.5', (busy || pending) && 'animate-spin')} aria-hidden />
        {busy ? 'Refreshing' : label}
      </Button>
    </div>
  );
}
