import { NFL_TEAMS } from './nfl-teams';
import { ratingFor } from './team-strength';

export interface SeedGame {
  season: number;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  kickoff: Date;
  spread: number;
  overUnder: number;
  homeImplied: number;
  awayImplied: number;
  isInternational: boolean;
  slot: string;
}

/**
 * 2026 regular season Week 1 opens Thursday Sept 10, 2026 (8:15pm ET).
 * Everything else is derived from this anchor, so nothing in the app has to
 * hardcode "what week is it" — the week is read back off these game rows.
 */
export const SEASON = Number(process.env.SEASON ?? 2026);
/**
 * Week 1 opens Thursday September 10, 2026 (8:15pm ET).
 * Stored as an EASTERN calendar date, not a UTC instant: NFL scheduling is
 * expressed in ET, and doing the day math in UTC shifts every post-Thursday
 * kickoff onto the wrong calendar day.
 */
export const WEEK_1_THURSDAY_ET = { year: 2026, month: 8, day: 10 } as const; // month is 0-indexed
export const REGULAR_SEASON_WEEKS = 18;

/** Retained for callers that want the instant of the season's first kickoff. */
export const WEEK_1_THURSDAY_UTC = etToUtc(WEEK_1_THURSDAY_ET.year, WEEK_1_THURSDAY_ET.month, WEEK_1_THURSDAY_ET.day, 20, 15);

/**
 * Convert an Eastern-time wall clock to a UTC instant.
 * The US switches to standard time on the first Sunday in November, which in
 * 2026 is November 1 — before that the offset is -4, after it is -5.
 */
function etToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const isEst = month > 10 || (month === 10 && day >= 1) || month < 2;
  const offset = isEst ? 5 : 4;
  return new Date(Date.UTC(year, month, day, hour + offset, minute));
}

/** Deterministic PRNG so a reseed produces an identical schedule. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Kickoff instant for a given week + day offset from that week's Thursday,
 * computed on the Eastern calendar so Sunday games land on Sunday.
 */
function kickoffAt(week: number, dayOffset: number, etHour: number, etMinute: number): Date {
  const base = new Date(Date.UTC(WEEK_1_THURSDAY_ET.year, WEEK_1_THURSDAY_ET.month, WEEK_1_THURSDAY_ET.day));
  const target = new Date(base.getTime() + ((week - 1) * 7 + dayOffset) * 86400000);
  return etToUtc(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), etHour, etMinute);
}

interface SlotSpec {
  dayOffset: number;
  hour: number;
  minute: number;
  label: string;
  international?: boolean;
}

/**
 * Slot template for a week, in assignment order. Covers every edge case the
 * app must handle: Thursday night, Sunday morning international, the two
 * Sunday afternoon windows, Sunday night, Monday night, and (late season)
 * Saturday games.
 */
function slotsForWeek(week: number): SlotSpec[] {
  const slots: SlotSpec[] = [{ dayOffset: 0, hour: 20, minute: 15, label: 'TNF' }];
  if (week >= 4 && week <= 9) {
    slots.push({ dayOffset: 3, hour: 9, minute: 30, label: 'International', international: true });
  }
  if (week >= 16) {
    slots.push({ dayOffset: 2, hour: 16, minute: 30, label: 'Saturday' });
  }
  // Sunday early window
  for (let i = 0; i < 8; i++) slots.push({ dayOffset: 3, hour: 13, minute: 0, label: 'Sunday early' });
  // Sunday late window
  for (let i = 0; i < 4; i++) slots.push({ dayOffset: 3, hour: 16, minute: i === 0 ? 5 : 25, label: 'Sunday late' });
  slots.push({ dayOffset: 3, hour: 20, minute: 20, label: 'SNF' });
  slots.push({ dayOffset: 4, hour: 20, minute: 15, label: 'MNF' });
  return slots;
}

/**
 * Builds a full, internally consistent seed schedule: every team plays once a
 * week except on its bye, with plausible kickoff windows and Vegas-style
 * numbers derived from the seeded team ratings.
 */
export function buildSeedSchedule(season: number = SEASON): SeedGame[] {
  const games: SeedGame[] = [];

  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
    const playing = NFL_TEAMS.filter((t) => t.byeWeek !== week).map((t) => t.abbr);

    const rand = mulberry32(season * 1000 + week);
    // Deterministic shuffle.
    for (let i = playing.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const a = playing[i]!;
      const b = playing[j]!;
      playing[i] = b;
      playing[j] = a;
    }

    const slots = slotsForWeek(week);
    for (let p = 0; p + 1 < playing.length; p += 2) {
      const teamA = playing[p]!;
      const teamB = playing[p + 1]!;
      // Alternate home/away by week so nobody is home 18 times.
      const homeAbbr = (p / 2 + week) % 2 === 0 ? teamA : teamB;
      const awayAbbr = homeAbbr === teamA ? teamB : teamA;
      const slot = slots[Math.min(p / 2, slots.length - 1)]!;
      const kickoff = kickoffAt(week, slot.dayOffset, slot.hour, slot.minute);

      const home = ratingFor(homeAbbr);
      const away = ratingFor(awayAbbr);
      // Simple market model: strength differential + 2 points of home field.
      const edge = (home.offense - away.defense) - (away.offense - home.defense);
      const spread = Math.round((edge * 0.28 + 2) * 2) / 2; // positive = home favored
      const total = Math.round(((home.offense + away.offense) * 0.36 + (110 - home.defense - away.defense) * 0.18) * 2) / 2;
      const overUnder = Math.min(56, Math.max(33, total));
      const homeImplied = Math.round((overUnder / 2 + spread / 2) * 10) / 10;
      const awayImplied = Math.round((overUnder / 2 - spread / 2) * 10) / 10;

      games.push({
        season,
        week,
        homeAbbr,
        awayAbbr,
        kickoff,
        spread,
        overUnder,
        homeImplied,
        awayImplied,
        isInternational: Boolean(slot.international),
        slot: slot.label,
      });
    }
  }
  return games;
}
