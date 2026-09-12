export interface SeedNflTeam {
  abbr: string;
  location: string;
  nickname: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
  /** SEED bye week — overwritten by the schedule provider on first sync. */
  byeWeek: number;
  isDome: boolean;
}

/**
 * 2026 seed. Bye weeks are a plausible placeholder distribution; the NFL
 * schedule provider overwrites them (and the app labels them as seeded until
 * it does).
 */
export const NFL_TEAMS: SeedNflTeam[] = [
  { abbr: 'ARI', location: 'Arizona', nickname: 'Cardinals', conference: 'NFC', division: 'West', byeWeek: 8, isDome: true },
  { abbr: 'ATL', location: 'Atlanta', nickname: 'Falcons', conference: 'NFC', division: 'South', byeWeek: 5, isDome: true },
  { abbr: 'BAL', location: 'Baltimore', nickname: 'Ravens', conference: 'AFC', division: 'North', byeWeek: 7, isDome: false },
  { abbr: 'BUF', location: 'Buffalo', nickname: 'Bills', conference: 'AFC', division: 'East', byeWeek: 7, isDome: false },
  { abbr: 'CAR', location: 'Carolina', nickname: 'Panthers', conference: 'NFC', division: 'South', byeWeek: 14, isDome: false },
  { abbr: 'CHI', location: 'Chicago', nickname: 'Bears', conference: 'NFC', division: 'North', byeWeek: 5, isDome: false },
  { abbr: 'CIN', location: 'Cincinnati', nickname: 'Bengals', conference: 'AFC', division: 'North', byeWeek: 10, isDome: false },
  { abbr: 'CLE', location: 'Cleveland', nickname: 'Browns', conference: 'AFC', division: 'North', byeWeek: 9, isDome: false },
  { abbr: 'DAL', location: 'Dallas', nickname: 'Cowboys', conference: 'NFC', division: 'East', byeWeek: 10, isDome: true },
  { abbr: 'DEN', location: 'Denver', nickname: 'Broncos', conference: 'AFC', division: 'West', byeWeek: 12, isDome: false },
  { abbr: 'DET', location: 'Detroit', nickname: 'Lions', conference: 'NFC', division: 'North', byeWeek: 8, isDome: true },
  { abbr: 'GB', location: 'Green Bay', nickname: 'Packers', conference: 'NFC', division: 'North', byeWeek: 5, isDome: false },
  { abbr: 'HOU', location: 'Houston', nickname: 'Texans', conference: 'AFC', division: 'South', byeWeek: 6, isDome: true },
  { abbr: 'IND', location: 'Indianapolis', nickname: 'Colts', conference: 'AFC', division: 'South', byeWeek: 11, isDome: true },
  { abbr: 'JAX', location: 'Jacksonville', nickname: 'Jaguars', conference: 'AFC', division: 'South', byeWeek: 8, isDome: false },
  { abbr: 'KC', location: 'Kansas City', nickname: 'Chiefs', conference: 'AFC', division: 'West', byeWeek: 10, isDome: false },
  { abbr: 'LAC', location: 'Los Angeles', nickname: 'Chargers', conference: 'AFC', division: 'West', byeWeek: 12, isDome: true },
  { abbr: 'LAR', location: 'Los Angeles', nickname: 'Rams', conference: 'NFC', division: 'West', byeWeek: 8, isDome: true },
  { abbr: 'LV', location: 'Las Vegas', nickname: 'Raiders', conference: 'AFC', division: 'West', byeWeek: 8, isDome: true },
  { abbr: 'MIA', location: 'Miami', nickname: 'Dolphins', conference: 'AFC', division: 'East', byeWeek: 12, isDome: false },
  { abbr: 'MIN', location: 'Minnesota', nickname: 'Vikings', conference: 'NFC', division: 'North', byeWeek: 6, isDome: true },
  { abbr: 'NE', location: 'New England', nickname: 'Patriots', conference: 'AFC', division: 'East', byeWeek: 14, isDome: false },
  { abbr: 'NO', location: 'New Orleans', nickname: 'Saints', conference: 'NFC', division: 'South', byeWeek: 11, isDome: true },
  { abbr: 'NYG', location: 'New York', nickname: 'Giants', conference: 'NFC', division: 'East', byeWeek: 14, isDome: false },
  { abbr: 'NYJ', location: 'New York', nickname: 'Jets', conference: 'AFC', division: 'East', byeWeek: 9, isDome: false },
  { abbr: 'PHI', location: 'Philadelphia', nickname: 'Eagles', conference: 'NFC', division: 'East', byeWeek: 9, isDome: false },
  { abbr: 'PIT', location: 'Pittsburgh', nickname: 'Steelers', conference: 'AFC', division: 'North', byeWeek: 5, isDome: false },
  { abbr: 'SEA', location: 'Seattle', nickname: 'Seahawks', conference: 'NFC', division: 'West', byeWeek: 8, isDome: false },
  { abbr: 'SF', location: 'San Francisco', nickname: '49ers', conference: 'NFC', division: 'West', byeWeek: 14, isDome: false },
  { abbr: 'TB', location: 'Tampa Bay', nickname: 'Buccaneers', conference: 'NFC', division: 'South', byeWeek: 9, isDome: false },
  { abbr: 'TEN', location: 'Tennessee', nickname: 'Titans', conference: 'AFC', division: 'South', byeWeek: 10, isDome: false },
  { abbr: 'WSH', location: 'Washington', nickname: 'Commanders', conference: 'NFC', division: 'East', byeWeek: 12, isDome: false },
];

export const NFL_TEAM_ABBRS = NFL_TEAMS.map((t) => t.abbr);

/** Provider abbreviation quirks -> our canonical abbreviation. */
const ABBR_ALIASES: Record<string, string> = {
  WAS: 'WSH',
  JAC: 'JAX',
  LA: 'LAR',
  STL: 'LAR',
  SD: 'LAC',
  OAK: 'LV',
  LVR: 'LV',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
  ARZ: 'ARI',
  BLT: 'BAL',
  CLV: 'CLE',
  HST: 'HOU',
};

export function canonicalTeamAbbr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (!upper || upper === 'FA' || upper === 'NONE') return null;
  const aliased = ABBR_ALIASES[upper] ?? upper;
  return NFL_TEAM_ABBRS.includes(aliased) ? aliased : null;
}

export function teamFullName(abbr: string): string {
  const t = NFL_TEAMS.find((x) => x.abbr === abbr);
  return t ? `${t.location} ${t.nickname}` : abbr;
}
