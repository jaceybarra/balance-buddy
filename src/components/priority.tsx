import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Severity, ActionType } from '@/lib/domain/enums';

/**
 * The five product states the whole UI is painted with.
 * CRITICAL > ACTION NEEDED > WATCH > GOOD > NO ACTION
 */
export type PriorityTone = 'critical' | 'action' | 'watch' | 'good' | 'muted';

export function priorityFor(severity: Severity, type: ActionType): { label: string; tone: PriorityTone } {
  if (severity === 'CRITICAL') return { label: 'CRITICAL', tone: 'critical' };
  if (severity === 'HIGH') return { label: 'ACTION NEEDED', tone: 'action' };
  if (severity === 'MEDIUM') {
    return type === 'INJURY' || type === 'NEWS'
      ? { label: 'WATCH', tone: 'watch' }
      : { label: 'ACTION NEEDED', tone: 'action' };
  }
  return { label: 'WATCH', tone: 'watch' };
}

export function PriorityBadge({ severity, type, className }: { severity: Severity; type: ActionType; className?: string }) {
  const { label, tone } = priorityFor(severity, type);
  return (
    <Badge variant={tone} className={className}>
      {label}
    </Badge>
  );
}

export function NoActionBadge({ className }: { className?: string }) {
  return (
    <Badge variant="good" className={className}>
      NO ACTION
    </Badge>
  );
}

export function toneRing(tone: PriorityTone): string {
  return cn(
    tone === 'critical' && 'border-l-critical',
    tone === 'action' && 'border-l-action',
    tone === 'watch' && 'border-l-watch',
    tone === 'good' && 'border-l-good',
    tone === 'muted' && 'border-l-border',
  );
}
