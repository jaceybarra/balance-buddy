import { describe, expect, it } from 'vitest';
import { normalizeName, identityKey, normalizeDstName, canonicalPosition, dstDisplayName } from '@/lib/identity/normalize';
import { canonicalTeamAbbr } from '@/lib/seed/nfl-teams';
import { IDENTITY_ALIAS_FIXTURES } from '@/lib/seed/players';

describe('player identity resolution', () => {
  it('collapses suffix differences so one player is not stored twice', () => {
    expect(normalizeName('Chris Godwin Jr.')).toBe(normalizeName('Chris Godwin'));
    expect(normalizeName('Kyle Pitts Sr.')).toBe(normalizeName('Kyle Pitts'));
    expect(normalizeName('Aaron Jones Sr.')).toBe(normalizeName('Aaron Jones'));
    expect(normalizeName('Michael Penix Jr.')).toBe(normalizeName('Michael Penix'));
  });

  it('resolves the Hollywood Brown / Marquise Brown nickname to one key', () => {
    expect(normalizeName('Hollywood Brown')).toBe(normalizeName('Marquise Brown'));
  });

  it('handles every alias fixture in the seed data', () => {
    for (const { alias, canonical } of IDENTITY_ALIAS_FIXTURES) {
      expect(normalizeName(alias), `${alias} should resolve to ${canonical}`).toBe(normalizeName(canonical));
    }
  });

  it('ignores punctuation and spacing differences', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe(normalizeName('JaMarr Chase'));
    expect(normalizeName('D.K. Metcalf')).toBe(normalizeName('DK Metcalf'));
    expect(normalizeName('  Amon-Ra  St. Brown ')).toBe(normalizeName('Amon-Ra St. Brown'));
  });

  it('keeps genuinely different players apart', () => {
    expect(normalizeName('Josh Allen')).not.toBe(normalizeName('Keenan Allen'));
    expect(normalizeName('Michael Thomas')).not.toBe(normalizeName('Michael Pittman'));
  });

  it('never collapses a defense into a skill player', () => {
    expect(identityKey('Baltimore Ravens D/ST', 'DST', 'BAL')).not.toBe(identityKey('Baltimore Ravens', 'WR', 'BAL'));
  });
});

describe('team defense identity', () => {
  it('resolves every way a provider might name the Ravens defense', () => {
    const expected = 'dst:bal';
    expect(normalizeDstName('Baltimore Ravens D/ST', 'BAL')).toBe(expected);
    expect(normalizeDstName('Ravens D/ST')).toBe(expected);
    expect(normalizeDstName('Baltimore', null)).toBe(expected);
    expect(normalizeDstName('BAL')).toBe(expected);
  });

  it('renders a display name from an abbreviation', () => {
    expect(dstDisplayName('BAL')).toBe('Baltimore Ravens D/ST');
  });
});

describe('provider value normalization', () => {
  it('maps provider team abbreviation variants to ours', () => {
    expect(canonicalTeamAbbr('WAS')).toBe('WSH');
    expect(canonicalTeamAbbr('JAC')).toBe('JAX');
    expect(canonicalTeamAbbr('OAK')).toBe('LV');
    expect(canonicalTeamAbbr('LA')).toBe('LAR');
    expect(canonicalTeamAbbr('sea')).toBe('SEA');
  });

  it('returns null for free agents and unknown teams', () => {
    expect(canonicalTeamAbbr('FA')).toBeNull();
    expect(canonicalTeamAbbr('')).toBeNull();
    expect(canonicalTeamAbbr(null)).toBeNull();
    expect(canonicalTeamAbbr('XYZ')).toBeNull();
  });

  it('maps provider positions, including D/ST spellings', () => {
    expect(canonicalPosition('D/ST')).toBe('DST');
    expect(canonicalPosition('DEF')).toBe('DST');
    expect(canonicalPosition('PK')).toBe('K');
    expect(canonicalPosition('FB')).toBe('RB');
    expect(canonicalPosition('LB')).toBeNull();
  });
});
