/**
 * Real NFL Week 1 (2026) games, transcribed from the user's ESPN roster page
 * on 2026-09-12. Only the games involving rostered players are known; the
 * schedule generator fills in the rest of the week from the remaining teams.
 *
 * Kickoffs are stored as UTC instants. September is EDT (UTC-4).
 */
export interface KnownGame {
  awayAbbr: string;
  homeAbbr: string;
  kickoff: Date;
  status: 'SCHEDULED' | 'FINAL';
  awayScore?: number;
  homeScore?: number;
}

const THU_NIGHT = new Date(Date.UTC(2026, 8, 11, 0, 15)); // Thu Sep 10, 8:15pm ET
const SUN_EARLY = new Date(Date.UTC(2026, 8, 13, 17, 0)); // Sun Sep 13, 1:00pm ET
const SUN_LATE = new Date(Date.UTC(2026, 8, 13, 20, 25)); // Sun Sep 13, 4:25pm ET
const SUN_NIGHT = new Date(Date.UTC(2026, 8, 14, 0, 20)); // Sun Sep 13, 8:20pm ET
const MON_NIGHT = new Date(Date.UTC(2026, 8, 15, 0, 15)); // Mon Sep 14, 8:15pm ET

export const WEEK1_KNOWN_GAMES: KnownGame[] = [
  // Thursday opener — already final. Brock Purdy's line read "@LAR W 27-7".
  { awayAbbr: 'SF', homeAbbr: 'LAR', kickoff: THU_NIGHT, status: 'FINAL', awayScore: 27, homeScore: 7 },

  // Sunday early window (11:00 AM Mountain = 1:00 PM Eastern)
  { awayAbbr: 'NO', homeAbbr: 'DET', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'TB', homeAbbr: 'CIN', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'BUF', homeAbbr: 'HOU', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'ATL', homeAbbr: 'PIT', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'BAL', homeAbbr: 'IND', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'NYJ', homeAbbr: 'TEN', kickoff: SUN_EARLY, status: 'SCHEDULED' },
  { awayAbbr: 'CLE', homeAbbr: 'JAX', kickoff: SUN_EARLY, status: 'SCHEDULED' },

  // Sunday late window (2:25 PM Mountain = 4:25 PM Eastern)
  { awayAbbr: 'MIA', homeAbbr: 'LV', kickoff: SUN_LATE, status: 'SCHEDULED' },
  { awayAbbr: 'GB', homeAbbr: 'MIN', kickoff: SUN_LATE, status: 'SCHEDULED' },
  { awayAbbr: 'WSH', homeAbbr: 'PHI', kickoff: SUN_LATE, status: 'SCHEDULED' },

  // Sunday night (6:20 PM Mountain = 8:20 PM Eastern) — Malik Nabers' game,
  // which is what makes his questionable tag a late-window decision.
  { awayAbbr: 'DAL', homeAbbr: 'NYG', kickoff: SUN_NIGHT, status: 'SCHEDULED' },

  // Monday night (6:15 PM Mountain = 8:15 PM Eastern)
  { awayAbbr: 'DEN', homeAbbr: 'KC', kickoff: MON_NIGHT, status: 'SCHEDULED' },
];

/** Teams whose Week 1 opponent is known for certain. */
export const WEEK1_KNOWN_TEAMS = new Set(
  WEEK1_KNOWN_GAMES.flatMap((g) => [g.awayAbbr, g.homeAbbr]),
);

/**
 * ESPN's own Week 1 projections for the Gibbs Me The Trophy roster, read off
 * the ESPN roster page on 2026-09-12.
 *
 * These are REAL provider numbers, computed by ESPN in that league's scoring
 * settings. They replace the internal model's estimates for these players, and
 * an ESPN sync replaces them in turn.
 */
export const GIBBS_ESPN_WEEK1_PROJECTIONS: Record<string, number> = {
  'Brock Purdy': 15.5,
  'Jahmyr Gibbs': 20.5,
  'Bucky Irving': 12.4,
  'Nico Collins': 13.0,
  'Jaylen Waddle': 10.0,
  'Michael Mayer': 7.3,
  'Jaylen Warren': 11.3,
  'Baltimore Ravens D/ST': 6.6,
  'Will Reichard': 8.4,
  'Christian Watson': 9.3,
  'Chris Godwin Jr.': 8.3,
  'Jayden Reed': 8.1,
  'Jordan Mason': 8.4,
  'Brock Bowers': 0.0,
};

/** Actual points already scored in Week 1 (Thursday game only, so far). */
export const GIBBS_ESPN_WEEK1_ACTUALS: Record<string, number> = {
  'Brock Purdy': 21.1,
};

/**
 * ESPN's own Week 1 projections for the So Good It Hurts roster, read off the
 * ESPN roster page on 2026-09-13.
 *
 * Worth comparing against the Gibbs table above: Bucky Irving and the Baltimore
 * defense are on BOTH rosters, and ESPN prices Irving at 12.4 in Gibbs but 13.3
 * here. That gap is this league's yardage bonuses, computed by ESPN itself —
 * independent confirmation that a player is not worth the same in both leagues.
 */
export const SGIH_ESPN_WEEK1_PROJECTIONS: Record<string, number> = {
  'Jalen Hurts': 21.8,
  'Jonathan Taylor': 17.6,
  'Bucky Irving': 13.3,
  'Drake London': 11.8,
  'Malik Nabers': 12.2,
  'Kyle Pitts Sr.': 7.9,
  'Davante Adams': 12.5,
  'Terry McLaurin': 10.7,
  'Baltimore Ravens D/ST': 6.6,
  'Cam Little': 8.8,
  'Tony Pollard': 11.5,
  'Jordan Addison': 8.4,
  'Aaron Jones Sr.': 9.2,
  'Rachaad White': 7.9,
  'Matthew Stafford': 18.5,
  'Calvin Ridley': 7.0,
  'Rashod Bateman': 6.3,
  'Jonah Coleman': 3.7,
};

/** Both Rams players already played Thursday and scored 4.1. */
export const SGIH_ESPN_WEEK1_ACTUALS: Record<string, number> = {
  'Davante Adams': 4.1,
  'Matthew Stafford': 4.1,
};
