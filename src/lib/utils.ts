import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a points value the way ESPN does: one decimal, never "-0.0". */
export function pts(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  const rounded = Math.round(value * 10) / 10;
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1);
}

export function signedPts(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const s = pts(Math.abs(value));
  return value >= 0 ? `+${s}` : `-${s}`;
}

export function pct(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  return `${Math.round(value * 100)}%`;
}
