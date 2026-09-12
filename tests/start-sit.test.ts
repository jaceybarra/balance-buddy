import { describe, expect, it } from 'vitest';
import { compareStartSit } from '@/lib/engine/start-sit';
import { buildExposureReport } from '@/lib/engine/exposure';
import { makePlayer, makeProjection } from './fixtures';
import type { LeagueContext } from '@/lib/data/context';

describe('start/sit assistant', () => {
  it('calls a clear edge a start', () => {
    const a = makePlayer({ name: 'Clear Starter', position: 'WR', projection: makeProjection(17) });
    const b = makePlayer({ name: 'Clear Bench', position: 'WR', projection: makeProjection(6) });
    const result = compareStartSit([a, b]);
    expect(result.rows[0]!.player.name).toBe('Clear Starter');
    expect(result.rows[0]!.verdict).toBe('STRONG_START');
    expect(result.tooClose).toBe(false);
    expect(result.recommendation).toContain('Start Clear Starter');
  });

  it('admits when two players are effectively tied instead of faking certainty', () => {
    const a = makePlayer({ name: 'A', position: 'RB', projection: makeProjection(11.2) });
    const b = makePlayer({ name: 'B', position: 'RB', projection: makeProjection(10.9) });
    const result = compareStartSit([a, b]);
    expect(result.tooClose).toBe(true);
    expect(result.rows[0]!.verdict).toBe('COIN_FLIP');
    expect(result.recommendation).toContain('coin flip');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('breaks a tie toward ceiling when chasing points', () => {
    const boom = makePlayer({ name: 'Boom', position: 'WR', projection: makeProjection(10.2, { floor: 2, ceiling: 26 }) });
    const safe = makePlayer({ name: 'Safe', position: 'WR', projection: makeProjection(10.4, { floor: 8, ceiling: 13 }) });
    const ceilingCall = compareStartSit([boom, safe], 'CEILING');
    expect(ceilingCall.rows[0]!.player.name).toBe('Boom');
    const floorCall = compareStartSit([boom, safe], 'FLOOR');
    expect(floorCall.rows[0]!.player.name).toBe('Safe');
  });

  it('marks a player on bye as avoid', () => {
    const active = makePlayer({ name: 'Active', position: 'TE', projection: makeProjection(7) });
    const bye = makePlayer({ name: 'Bye Week', position: 'TE', onBye: true, game: null, projection: makeProjection(0) });
    const result = compareStartSit([active, bye]);
    expect(result.rows.find((r) => r.player.name === 'Bye Week')!.verdict).toBe('AVOID');
  });

  it('marks a ruled-out player as avoid even with a big projection', () => {
    const out = makePlayer({
      name: 'Ruled Out',
      position: 'RB',
      injuryStatus: 'OUT',
      projection: makeProjection(18, { playProbability: 0, expected: 0 }),
    });
    const healthy = makePlayer({ name: 'Healthy', position: 'RB', projection: makeProjection(9) });
    const result = compareStartSit([out, healthy]);
    expect(result.rows[0]!.player.name).toBe('Healthy');
    expect(result.rows.find((r) => r.player.name === 'Ruled Out')!.verdict).toBe('AVOID');
  });

  it('compares more than two players', () => {
    const players = [12, 9, 14, 6].map((pts, i) =>
      makePlayer({ name: `P${i}`, position: 'WR', projection: makeProjection(pts) }),
    );
    const result = compareStartSit(players);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(result.rows[0]!.player.name).toBe('P2');
  });

  it('exposes the factors behind the call', () => {
    const a = makePlayer({
      name: 'A',
      position: 'WR',
      projection: makeProjection(14),
      usage: { snapShare: 0.9, targets: 9, carries: 0, redZoneTouches: 1.5 },
    });
    const b = makePlayer({ name: 'B', position: 'WR', projection: makeProjection(8) });
    const labels = compareStartSit([a, b]).rows[0]!.factors.map((f) => f.label);
    expect(labels).toContain('Projection');
    expect(labels).toContain('Floor / ceiling');
    expect(labels).toContain('Opponent');
    expect(labels).toContain('Targets/gm');
  });
});

/** Minimal context shim — exposure only reads a few fields. */
function ctxWith(leagueName: string, teamName: string, players: ReturnType<typeof makePlayer>[]): LeagueContext {
  return {
    league: { id: leagueName, name: leagueName, season: 2026, size: 12, ppr: 0.5, isSeeded: true, lastSyncAt: null, provider: 'ESPN' },
    team: { id: teamName, name: teamName, record: '0-0', wins: 0, losses: 0, ties: 0, pointsFor: 0, isSeeded: true },
    config: { leagueId: leagueName, leagueName, ppr: 0.5, rules: [], source: 'SEED' },
    season: 2026,
    week: 1,
    weekSource: 'SCHEDULE',
    slots: [],
    starters: players.filter((p) => p.slot && !['BENCH', 'IR'].includes(p.slot)),
    bench: players.filter((p) => p.slot === 'BENCH'),
    ir: [],
    all: players,
    openBenchSlots: 0,
    openIrSlots: 0,
    matchup: null,
  };
}

describe('cross-team exposure', () => {
  const shared = makePlayer({ id: 'shared', name: 'Bucky Irving', position: 'RB', slot: 'RB', projection: makeProjection(14) });
  const soloA = makePlayer({ name: 'Only A', position: 'WR', slot: 'WR', projection: makeProjection(10) });
  const soloB = makePlayer({ name: 'Only B', position: 'WR', slot: 'WR', projection: makeProjection(10) });

  it('finds players rostered on both teams', () => {
    const report = buildExposureReport([
      ctxWith('League A', 'Team A', [shared, soloA]),
      ctxWith('League B', 'Team B', [shared, soloB]),
    ]);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]!.name).toBe('Bucky Irving');
    expect(report.entries[0]!.exposurePct).toBe(100);
    expect(report.entries[0]!.starterOnBoth).toBe(true);
    expect(report.entries[0]!.combinedProjection).toBe(28);
  });

  it('does not tell the user to diversify', () => {
    const report = buildExposureReport([
      ctxWith('League A', 'Team A', [shared]),
      ctxWith('League B', 'Team B', [shared]),
    ]);
    const text = `${report.summary} ${report.entries.map((e) => e.note).join(' ')}`.toLowerCase();
    expect(text).not.toContain('diversify');
    expect(text).not.toContain('you should drop');
  });

  it('flags injury concentration across both rosters', () => {
    const hurt = makePlayer({
      id: 'hurt',
      name: 'Malik Nabers',
      position: 'WR',
      slot: 'WR',
      injuryStatus: 'QUESTIONABLE',
      projection: makeProjection(13),
    });
    const report = buildExposureReport([
      ctxWith('League A', 'Team A', [hurt]),
      ctxWith('League B', 'Team B', [hurt]),
    ]);
    expect(report.injuryConcentration.map((e) => e.name)).toContain('Malik Nabers');
    expect(report.entries[0]!.note).toContain('both of your weeks');
  });

  it('reports no exposure when rosters do not overlap', () => {
    const report = buildExposureReport([
      ctxWith('League A', 'Team A', [soloA]),
      ctxWith('League B', 'Team B', [soloB]),
    ]);
    expect(report.entries).toHaveLength(0);
    expect(report.summary).toContain('No player');
  });
});
