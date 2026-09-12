import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * The small "Updated X ago" line that sits on every data card.
 * Stale data gets a visible warning rather than being quietly shown as current.
 */
export function Freshness({
  at,
  source,
  stale,
  className,
  prefix = 'Updated',
}: {
  at: Date | string | null | undefined;
  source?: string | null;
  stale?: boolean;
  className?: string;
  prefix?: string;
}) {
  return (
    <p className={cn('text-[11px] text-muted-foreground', stale && 'text-watch', className)}>
      {stale ? '⚠ ' : ''}
      {prefix} {relativeTime(at)}
      {source ? ` · ${source}` : ''}
    </p>
  );
}
