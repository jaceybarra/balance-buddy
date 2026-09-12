import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        critical: 'border-transparent bg-critical text-critical-foreground',
        action: 'border-transparent bg-action text-action-foreground',
        watch: 'border-transparent bg-watch text-watch-foreground',
        good: 'border-transparent bg-good text-good-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary text-primary-foreground',
      },
      size: {
        sm: 'px-1.5 py-0 text-[10px]',
        default: '',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
