import { describe, expect, it } from 'vitest';
import { analyzeTrade } from '@/lib/engine/trade';
import { rosLineupValue } from '@/lib/optimizer/ros';
import { parseProjectionCsv } from '@/lib/providers/projection/csv';
import { dropValue, isLikelyHandcuff } from '@/lib/engine/waivers';
import { GIBBS_SLOTS, gibbsConfig, bench, makePlayer, makeProjection, starter } from './fixtures';
import type { LeagueContext } from '@/lib/data/context';

function ctx(players: ReturnType<typeof makePlayer>[]): LeagueContext {
  return {
    league: { id: 'gibbs', name: 'Gibbs Me The Trophy', season: 2026, size: 12, ppr: 0.5, isSeeded: true, lastSyncAt: null, provider: 'ESPN' },
    team: { id: 'team', name: 'Gibbs Me The Trophy', record: '0-0', wins: 0, losses: 0, ties: 0, pointsFor: 0, isSeeded: true },
    config: gibbsConfig,
    season: 2026,
    week: 1,
    weekSource: 'SCHEDULE',
    slots: GIBBS_SLOTS.map((s) => ({ ...s, maxAtPosition: null })),
    starters: players.filter((p) => p.slot && !['BENCH', 'IR'].includes(p.slot)),
    bench: players.filter((p) => p.slot === 'BENCH'),
    ir: [],
    all: players,
    openBenchSlots: 1,
    openIrSlots: 1,
    matchup: null,
  };
}

const roster = [
  starter('QB1', 'QB', 'QB', 20),
  starter('RB1', 'RB', 'RB', 16, 0),
  starter('RB2', 'RB', 'RB', 11, 1),
  starter('WR1', 'WR', 'WR', 14, 0),
  starter('WR2', 'WR', 'WR', 10, 1),
  starter('TE1', 'TE', 'TE', 8),
  starter('FLEX1', 'WR', 'FLEX', 9),
  starter('DST1', 'DST', 'DST', 7),
  starter('K1', 'K', 'K', 8),
  bench('Depth1', 'RB', 8),
  bench('Depth2', 'WR', 7),
];

describe('rest-of-season lineup value', () => {
  it('ignores a player who cannot crack the lineup', () => {
    const before = rosLineupValue(roster, GIBBS_SLOTS);
    const backupQb = bench('BackupQB', 'QB', 18); // good, but QB1 is better
    const after = rosLineupValue([...roster, backupQb], GIBBS_SLOTS);
    expect(after).toBe(before);
  });

  it('counts a player who does crack the lineup', () => {
    const before = rosLineupValue(roster, GIBBS_SLOTS);
    const after = rosLineupValue([...roster, bench('StudWR', 'WR', 18)], GIBBS_SLOTS);
    expect(after).toBeGreaterThan(before);
  });
});

describe('trade analyzer', () => {
  it('declines giving away a starter for nothing', async () => {
    const result = await analyzeTrade(ctx(roster), { give: [roster[1]!.id], get: [] });
    expect(result.lineupDelta).toBeLessThan(0);
    expect(['DECLINE', 'LEAN_DECLINE']).toContain(result.verdict);
    expect(result.explanation).toContain('RB1');
  });

  it('measures the starting lineup, not the sum of the traded players', async () => {
    // Trading away a bench player the lineup never uses costs nothing weekly.
    const result = await analyzeTrade(ctx(roster), { give: [roster[10]!.id], get: [] });
    expect(result.lineupDelta).toBe(0);
    // Depth still takes a hit, and the verdict reflects that rather than "even".
    expect(result.depthDelta).toBeLessThan(0);
  });

  it('reports the measures it used', async () => {
    const result = await analyzeTrade(ctx(roster), { give: [roster[0]!.id], get: [] });
    expect(result.details.map((d) => d.label)).toEqual([
      'This week’s starting lineup',
      'Starting lineup, per week rest-of-season',
      'Bench depth',
    ]);
  });
});

describe('drop protection', () => {
  it('values a handcuff above his one-week projection', () => {
    const handcuff = makePlayer({
      name: 'Backup RB',
      position: 'RB',
      slot: 'BENCH',
      depthChartOrder: 2,
      usage: { snapShare: 0.22, targets: 1, carries: 5, redZoneTouches: 0.5 },
      projection: makeProjection(4, { ceiling: 14 }),
      rosPerGame: 4,
    });
    const plodder = makePlayer({
      name: 'Low Ceiling WR',
      position: 'WR',
      slot: 'BENCH',
      projection: makeProjection(5, { ceiling: 7 }),
      rosPerGame: 5,
    });
    expect(isLikelyHandcuff(handcuff)).toBe(true);
    expect(isLikelyHandcuff(plodder)).toBe(false);
    // Despite the lower weekly projection, the handcuff is protected from being
    // the automatic drop.
    expect(dropValue(handcuff)).toBeGreaterThan(dropValue(plodder));
  });
});

describe('CSV projection import', () => {
  it('parses stat columns and matches canonical stat keys', () => {
    const csv = ['name,position,team,recYards,rec,recTD', 'Jayden Reed,WR,GB,78,5.4,0.5'].join('\n');
    const result = parseProjectionCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.statLine).toEqual({ recYards: 78, rec: 5.4, recTD: 0.5 });
    expect(result.rows[0]!.position).toBe('WR');
  });

  it('accepts common column aliases', () => {
    const csv = ['Player,Pos,Tm,Rec Yds,Receptions,Rec TD', 'Nico Collins,WR,HOU,88,6.1,0.55'].join('\n');
    const result = parseProjectionCsv(csv);
    expect(result.rows[0]!.statLine.recYards).toBe(88);
    expect(result.rows[0]!.statLine.rec).toBe(6.1);
    expect(result.rows[0]!.statLine.recTD).toBe(0.55);
  });

  it('warns when only a points column is supplied', () => {
    const csv = ['name,points', 'Nico Collins,16.4'].join('\n');
    const result = parseProjectionCsv(csv);
    expect(result.rows[0]!.providerPoints).toBe(16.4);
    expect(result.warnings.join(' ')).toContain('another system');
  });

  it('rejects a file with no usable columns', () => {
    const result = parseProjectionCsv(['name,adp,tier', 'Nico Collins,12,2'].join('\n'));
    expect(result.rows).toHaveLength(0);
    expect(result.errors.join(' ')).toContain('No recognizable stat columns');
  });

  it('requires a name column', () => {
    const result = parseProjectionCsv(['team,recYards', 'HOU,88'].join('\n'));
    expect(result.errors.join(' ')).toContain('name');
  });

  it('handles quoted fields and reports unusable values', () => {
    const csv = ['name,recYards', '"Smith, Jr., Steve",88', 'Broken Row,not-a-number'].join('\n');
    const result = parseProjectionCsv(csv);
    expect(result.rows[0]!.name).toBe('Smith, Jr., Steve');
    expect(result.errors.join(' ')).toContain('not a number');
  });

  it('lists columns it ignored so nothing is silently dropped', () => {
    const csv = ['name,recYards,adp', 'Nico Collins,88,14'].join('\n');
    expect(parseProjectionCsv(csv).ignoredColumns).toContain('adp');
  });
});
