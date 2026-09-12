import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { differenceInMinutes, isSameDay } from 'date-fns';
import type { LockState } from './domain/enums';

export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Denver';

export const DEFAULT_LOCK_WARNING_MINUTES = Number(process.env.LOCK_WARNING_MINUTES ?? 60);

export function fmt(date: Date | string, pattern: string, tz: string = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(new Date(date), tz, pattern);
}

/** "Sun 11:00 AM MT" — the format used all over the action queue. */
export function gameTimeLabel(date: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  return `${fmt(date, 'EEE h:mm a', tz)} ${tzAbbrev(tz, new Date(date))}`;
}

export function dateTimeLabel(date: Date | string, tz: string = DEFAULT_TIMEZONE): string {
  return `${fmt(date, 'EEE MMM d, h:mm a', tz)} ${tzAbbrev(tz, new Date(date))}`;
}

/** MT / MST / MDT style short zone label. */
export function tzAbbrev(tz: string = DEFAULT_TIMEZONE, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export function minutesUntil(target: Date | string, now: Date = new Date()): number {
  return differenceInMinutes(new Date(target), now);
}

/**
 * Lineup lock state for one player's game.
 * LOCKED means the app must never suggest moving him.
 */
export function lockState(
  kickoff: Date | string | null | undefined,
  now: Date = new Date(),
  warnMinutes: number = DEFAULT_LOCK_WARNING_MINUTES,
): LockState {
  if (!kickoff) return 'AVAILABLE'; // bye week / unknown game -> nothing to lock
  const mins = minutesUntil(kickoff, now);
  if (mins <= 0) return 'LOCKED';
  if (mins <= warnMinutes) return 'LOCKING_SOON';
  return 'AVAILABLE';
}

export const LOCK_LABEL: Record<LockState, string> = {
  AVAILABLE: 'Available',
  LOCKING_SOON: 'Locking soon',
  LOCKED: 'Locked',
};

/** "12 minutes ago" / "3 hours ago" / "just now". */
export function relativeTime(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return 'never';
  const diffMs = now.getTime() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 0) return inWords(-mins, true);
  if (mins < 1) return 'just now';
  return inWords(mins, false);
}

function inWords(mins: number, future: boolean): string {
  const suffix = future ? 'from now' : 'ago';
  if (mins < 60) return `${mins} min ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ${suffix}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ${suffix}`;
}

/** Compact countdown for deadlines: "in 2h 14m" / "past due". */
export function countdown(target: Date | string | null | undefined, now: Date = new Date()): string {
  if (!target) return '';
  const mins = minutesUntil(target, now);
  if (mins <= 0) return 'past';
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return `in ${d}d ${h % 24}h`;
}

export function isToday(date: Date | string, tz: string = DEFAULT_TIMEZONE, now: Date = new Date()): boolean {
  return isSameDay(toZonedTime(new Date(date), tz), toZonedTime(now, tz));
}

/** Groups games into the slots that matter for lineup decisions. */
export function kickoffSlot(date: Date, tz = 'America/New_York'): string {
  const day = fmt(date, 'EEE', tz);
  const hour = Number(fmt(date, 'H', tz));
  if (day === 'Thu') return 'TNF';
  if (day === 'Fri') return 'Friday';
  if (day === 'Sat') return 'Saturday';
  if (day === 'Mon') return 'MNF';
  if (day === 'Sun') {
    if (hour < 12) return 'International';
    if (hour < 15) return 'Sunday early';
    if (hour < 19) return 'Sunday late';
    return 'SNF';
  }
  return day;
}
