import { cn } from '@/lib/utils';

/** Thin confidence/strength bar. Value is 0..1. */
export function Progress({
  value,
  className,
  tone = 'primary',
}: {
  value: number;
  className?: string;
  tone?: 'primary' | 'good' | 'watch' | 'critical' | 'muted';
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const toneClass = {
    primary: 'bg-primary',
    good: 'bg-good',
    watch: 'bg-watch',
    critical: 'bg-critical',
    muted: 'bg-muted-foreground',
  }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-all', toneClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}
