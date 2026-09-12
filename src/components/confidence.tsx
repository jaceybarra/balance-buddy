import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/**
 * Confidence is always shown as a number AND as words, because "61%" alone
 * reads as precision the model does not have.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Very confident';
  if (confidence >= 0.7) return 'Confident';
  if (confidence >= 0.55) return 'Leaning';
  return 'Close call';
}

export function ConfidenceMeter({ value, className, compact }: { value: number; className?: string; compact?: boolean }) {
  const tone = value >= 0.75 ? 'good' : value >= 0.55 ? 'watch' : 'critical';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={value} tone={tone} className={compact ? 'w-12' : 'w-20'} />
      <span className="tabular text-xs text-muted-foreground">
        {Math.round(value * 100)}%{compact ? '' : ` · ${confidenceLabel(value)}`}
      </span>
    </div>
  );
}
