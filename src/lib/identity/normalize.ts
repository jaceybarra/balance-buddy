import { NFL_TEAMS, canonicalTeamAbbr, teamFullName } from '../seed/nfl-teams';
import type { Position } from '../domain/enums';

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Well-known nicknames that must NOT create a second player record.
 * Keyed by normalized alias -> normalized canonical.
 */
const NICKNAMES: Record<string, string> = {
  hollywoodbrown: 'marquisebrown',
  hollywood: 'marquisebrown',
  dkmetcalf: 'dkmetcalf',
  kenwalker: 'kennethwalker',
  kennethwalkeriii: 'kennethwalker',
  jjettas: 'justinjefferson',
  camward: 'cameronward',
  robbyanderson: 'robbiechosen',
  joshpalmer: 'joshuapalmer',
  mitchtrubisky: 'mitchelltrubisky',
  gabedavis: 'gabrieldavis',
};

/**
 * Canonical match key for a player name.
 *
 * Strips punctuation, suffixes (Jr./Sr./III) and whitespace so that
 * "Chris Godwin Jr." and "Chris Godwin" collapse to one key. Used ONLY as a
 * fallback when no provider id match exists.
 */
export function normalizeName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'`’\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ').filter((t) => t.length > 0 && !SUFFIXES.has(t));
  const key = tokens.join('');
  return NICKNAMES[key] ?? key;
}

/** "Baltimore Ravens D/ST" / "Ravens" / "BAL" all normalize to `dst:bal`. */
export function normalizeDstName(raw: string, teamHint?: string | null): string {
  const abbr =
    canonicalTeamAbbr(teamHint) ??
    canonicalTeamAbbr(raw) ??
    guessDstTeamFromName(raw);
  return abbr ? `dst:${abbr.toLowerCase()}` : `dst:${normalizeName(raw)}`;
}

function guessDstTeamFromName(raw: string): string | null {
  const lower = raw.toLowerCase();
  for (const team of DST_LOOKUP) {
    if (lower.includes(team.nickname) || lower.includes(team.location)) return team.abbr;
  }
  return null;
}

// Derived from the NFL team table so there is only one source of truth.
const DST_LOOKUP = NFL_TEAMS.map((t) => ({
  abbr: t.abbr,
  nickname: t.nickname.toLowerCase(),
  location: t.location.toLowerCase(),
}));

/** The key stored on Player.normalizedName. Positions matter: a DST is never a WR. */
export function identityKey(name: string, position: Position, team?: string | null): string {
  if (position === 'DST') return normalizeDstName(name, team);
  return normalizeName(name);
}

export function dstDisplayName(abbr: string): string {
  return `${teamFullName(abbr)} D/ST`;
}

/** Provider position strings -> our canonical position. */
export function canonicalPosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const p = raw.trim().toUpperCase().replace(/[^A-Z/]/g, '');
  switch (p) {
    case 'QB':
      return 'QB';
    case 'RB':
    case 'HB':
    case 'FB':
      return 'RB';
    case 'WR':
      return 'WR';
    case 'TE':
      return 'TE';
    case 'K':
    case 'PK':
      return 'K';
    case 'DST':
    case 'D/ST':
    case 'DEF':
    case 'DST/D':
      return 'DST';
    default:
      return null;
  }
}
