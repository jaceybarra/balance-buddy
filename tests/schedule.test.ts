import { describe, expect, it } from 'vitest';
import { buildSeedSchedule, REGULAR_SEASON_WEEKS } from '@/lib/seed/schedule';
import { NFL_TEAMS } from '@/lib/seed/nfl-teams';
import { kickoffSlot, lockState } from '@/lib/time';

const schedule = buildSeedSchedule(2026);

function etWeekday(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date);
}

describe('seeded NFL schedule', () => {
  it('covers the whole regular season', () => {
    const weeks = new Set(schedule.map((g) => g.week));
    expect(weeks.size).toBe(REGULAR_SEASON_WEEKS);
  });

  it('never schedules a team twice in the same week', () => {
    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
      const games = schedule.filter((g) => g.week === week);
      const teams = games.flatMap((g) => [g.homeAbbr, g.awayAbbr]);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it('honors every team bye week', () => {
    for (const team of NFL_TEAMS) {
      const played = schedule.filter((g) => g.week === team.byeWeek && (g.homeAbbr === team.abbr || g.awayAbbr === team.abbr));
      expect(played, `${team.abbr} should be on bye in week ${team.byeWeek}`).toHaveLength(0);
    }
  });

  it('puts kickoffs on the right Eastern calendar days', () => {
    // A UTC-based day calculation silently shifts Sunday games to Monday; this
    // is the regression guard for that.
    const week1 = schedule.filter((g) => g.week === 1);
    const days = new Set(week1.map((g) => etWeekday(g.kickoff)));
    expect(days.has('Sun')).toBe(true);
    expect(days.has('Thu')).toBe(true);
    expect(days.has('Mon')).toBe(true);
    expect(days.has('Tue')).toBe(false);
    expect(days.has('Wed')).toBe(false);
  });

  it('opens the season on Thursday night', () => {
    const [opener] = schedule;
    expect(etWeekday(opener!.kickoff)).toBe('Thu');
    expect(kickoffSlot(opener!.kickoff)).toBe('TNF');
  });

  it('includes the edge-case windows the app has to handle', () => {
    const slots = new Set(schedule.map((g) => kickoffSlot(g.kickoff)));
    expect(slots.has('TNF')).toBe(true);
    expect(slots.has('International')).toBe(true);
    expect(slots.has('Sunday early')).toBe(true);
    expect(slots.has('Sunday late')).toBe(true);
    expect(slots.has('SNF')).toBe(true);
    expect(slots.has('MNF')).toBe(true);
    expect(slots.has('Saturday')).toBe(true);
  });

  it('produces sane Vegas-style numbers', () => {
    for (const game of schedule) {
      expect(game.overUnder).toBeGreaterThanOrEqual(33);
      expect(game.overUnder).toBeLessThanOrEqual(56);
      // Each side is rounded to one decimal, so the halves can drift 0.1 from the total.
      expect(Math.abs(game.homeImplied + game.awayImplied - game.overUnder)).toBeLessThanOrEqual(0.11);
    }
  });

  it('is deterministic across runs', () => {
    const again = buildSeedSchedule(2026);
    expect(again.map((g) => `${g.week}:${g.awayAbbr}@${g.homeAbbr}`)).toEqual(
      schedule.map((g) => `${g.week}:${g.awayAbbr}@${g.homeAbbr}`),
    );
  });
});

describe('lineup lock awareness', () => {
  const kickoff = new Date('2026-09-13T17:00:00Z');

  it('is available well before kickoff', () => {
    expect(lockState(kickoff, new Date('2026-09-13T14:00:00Z'))).toBe('AVAILABLE');
  });

  it('warns inside the configurable window', () => {
    expect(lockState(kickoff, new Date('2026-09-13T16:30:00Z'))).toBe('LOCKING_SOON');
    // A 15-minute window would not have warned yet at T-30.
    expect(lockState(kickoff, new Date('2026-09-13T16:30:00Z'), 15)).toBe('AVAILABLE');
  });

  it('locks at kickoff and stays locked', () => {
    expect(lockState(kickoff, new Date('2026-09-13T17:00:00Z'))).toBe('LOCKED');
    expect(lockState(kickoff, new Date('2026-09-13T20:00:00Z'))).toBe('LOCKED');
  });

  it('treats a player with no game as movable (bye week)', () => {
    expect(lockState(null, new Date())).toBe('AVAILABLE');
  });
});
