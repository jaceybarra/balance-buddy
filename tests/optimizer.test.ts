import { describe, expect, it } from 'vitest';
import { optimizeLineup, strategyForMatchup, swapConfidence, lineupShuffles } from '@/lib/optimizer/lineup';
import { maxWeightAssignment } from '@/lib/optimizer/hungarian';
import { GIBBS_SLOTS, SGIH_SLOTS, bench, makePlayer, makeProjection, starter } from './fixtures';

/** A legal, fully-filled one-FLEX roster. */
function baseRoster() {
  return [
    starter('QB1', 'QB', 'QB', 20),
    starter('RB1', 'RB', 'RB', 15, 0),
    starter('RB2', 'RB', 'RB', 11, 1),
    starter('WR1', 'WR', 'WR', 14, 0),
    starter('WR2', 'WR', 'WR', 10, 1),
    starter('TE1', 'TE', 'TE', 8),
    starter('FLEX1', 'WR', 'FLEX', 9),
    starter('DST1', 'DST', 'DST', 7),
    starter('K1', 'K', 'K', 8),
  ];
}

describe('assignment algorithm', () => {
  it('finds the maximum-weight assignment, not a greedy one', () => {
    // Pairing each slot with its own best column gives 10 + 7 only if both can
    // have column 0/1 respectively; the algorithm must find 10 + 7 = 17 rather
    // than the 9 + 1 = 10 diagonal.
    const weights = [
      [9, 10],
      [7, 1],
    ];
    const { assignment, total } = maxWeightAssignment(weights);
    expect(total).toBe(17);
    expect(assignment).toEqual([1, 0]);
  });

  it('never assigns an ineligible pairing', () => {
    const weights = [
      [-Infinity, 5],
      [4, -Infinity],
    ];
    const { assignment } = maxWeightAssignment(weights);
    expect(assignment).toEqual([1, 0]);
  });

  it('leaves a slot empty when no eligible player exists', () => {
    const weights = [[-Infinity]];
    const { assignment } = maxWeightAssignment(weights);
    expect(assignment).toEqual([null]);
  });
});

describe('lineup optimizer', () => {
  it('recognizes an already-optimal lineup', () => {
    const result = optimizeLineup({ roster: baseRoster(), slots: GIBBS_SLOTS });
    expect(result.swaps).toHaveLength(0);
    expect(result.improvement).toBe(0);
    expect(result.optimalProjected).toBe(102);
  });

  it('promotes a better bench player into the FLEX', () => {
    const roster = [...baseRoster(), bench('BenchWR', 'WR', 13)];
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]!.in.name).toBe('BenchWR');
    expect(result.swaps[0]!.out?.name).toBe('FLEX1');
    expect(result.improvement).toBe(4);
  });

  it('fills two FLEX slots in the two-flex league', () => {
    const roster = [...baseRoster(), bench('BenchRB', 'RB', 12)];
    const result = optimizeLineup({ roster, slots: SGIH_SLOTS });
    const flexes = result.assignments.filter((a) => a.slot === 'FLEX');
    expect(flexes).toHaveLength(2);
    expect(flexes.every((f) => f.player !== null)).toBe(true);
    // The bench RB now starts. Which of the RB-eligible players lands in the
    // FLEX versus the RB slot is arbitrary between equal-value lineups, so the
    // assertion is about the lineup, not about a specific slot.
    const starting = result.assignments.map((a) => a.player?.name);
    expect(starting).toContain('BenchRB');
    expect(result.optimalProjected).toBe(114);
  });

  it('respects slot eligibility (a QB can never fill a FLEX)', () => {
    // The backup QB outscores every flex option, so a naive "best available"
    // optimizer would slot him at FLEX. He is only eligible at QB.
    const roster = [...baseRoster(), bench('BackupQB', 'QB', 30)];
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.assignments.find((a) => a.slot === 'FLEX')?.player?.name).toBe('FLEX1');
    expect(result.assignments.filter((a) => a.slot === 'FLEX').every((a) => a.player?.position !== 'QB')).toBe(true);
    // He does legitimately belong at QB, though.
    expect(result.assignments.find((a) => a.slot === 'QB')?.player?.name).toBe('BackupQB');
  });

  it('honors multi-position eligibility', () => {
    // A player listed at both RB and WR can fill either slot.
    const dual = makePlayer({
      name: 'Swiss Army',
      position: 'RB',
      eligiblePositions: ['WR'],
      slot: 'BENCH',
      projection: makeProjection(18),
    });
    const result = optimizeLineup({ roster: [...baseRoster(), dual], slots: GIBBS_SLOTS });
    expect(result.swaps[0]!.in.name).toBe('Swiss Army');
  });
});

describe('locked players', () => {
  it('never moves a starter whose game has kicked off', () => {
    const roster = baseRoster().map((p) => (p.name === 'FLEX1' ? { ...p, lock: 'LOCKED' as const } : p));
    roster.push(bench('BenchWR', 'WR', 25));
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    const flex = result.assignments.find((a) => a.slot === 'FLEX');
    expect(flex?.player?.name).toBe('FLEX1');
    expect(flex?.locked).toBe(true);
    expect(result.lockedPlayers).toContain('FLEX1');
  });

  it('never promotes a bench player whose game already started', () => {
    const lockedBench = makePlayer({
      name: 'Already Playing',
      position: 'WR',
      slot: 'BENCH',
      lock: 'LOCKED',
      projection: makeProjection(30),
    });
    const result = optimizeLineup({ roster: [...baseRoster(), lockedBench], slots: GIBBS_SLOTS });
    expect(result.swaps).toHaveLength(0);
    expect(result.notes.join(' ')).toContain('Already Playing');
  });

  it('still optimizes the slots that are not locked', () => {
    const roster = baseRoster().map((p) => (p.name === 'QB1' ? { ...p, lock: 'LOCKED' as const } : p));
    roster.push(bench('BenchWR', 'WR', 20));
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.swaps[0]!.in.name).toBe('BenchWR');
  });
});

describe('unavailable players', () => {
  it('benches a player on bye in favor of anyone who plays', () => {
    const roster = baseRoster().map((p) =>
      p.name === 'WR2' ? { ...p, onBye: true, game: null, projection: makeProjection(0) } : p,
    );
    roster.push(bench('BenchWR', 'WR', 6));
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.swaps.some((s) => s.in.name === 'BenchWR' && s.out?.name === 'WR2')).toBe(true);
  });

  it('never starts an IR player', () => {
    const ir = makePlayer({ name: 'On IR', position: 'WR', slot: 'IR', injuryStatus: 'IR', projection: makeProjection(40) });
    const result = optimizeLineup({ roster: [...baseRoster(), ir], slots: GIBBS_SLOTS });
    expect(result.assignments.some((a) => a.player?.name === 'On IR')).toBe(false);
  });

  it('prefers a healthy low projection over a ruled-OUT starter', () => {
    const roster = baseRoster().map((p) =>
      p.name === 'WR2' ? { ...p, injuryStatus: 'OUT' as const, projection: makeProjection(12, { playProbability: 0 }) } : p,
    );
    roster.push(bench('Healthy Backup', 'WR', 4));
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.assignments.some((a) => a.player?.name === 'Healthy Backup')).toBe(true);
  });

  it('discounts a questionable player by his chance of playing', () => {
    const roster = baseRoster().map((p) =>
      p.name === 'WR2'
        ? { ...p, injuryStatus: 'QUESTIONABLE' as const, projection: makeProjection(10, { playProbability: 0.65, expected: 6.5 }) }
        : p,
    );
    roster.push(bench('Safe Option', 'WR', 8));
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.swaps.some((s) => s.in.name === 'Safe Option')).toBe(true);
  });

  it('leaves a slot unfilled rather than inventing a player', () => {
    const roster = baseRoster().filter((p) => p.position !== 'K');
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    expect(result.unfilled).toContain('K');
  });
});

describe('matchup strategy', () => {
  it('chases ceiling when projected to lose', () => {
    expect(strategyForMatchup(100, 118).strategy).toBe('CEILING');
  });

  it('protects the floor when comfortably ahead', () => {
    expect(strategyForMatchup(140, 118).strategy).toBe('FLOOR');
  });

  it('plays it straight in a close matchup', () => {
    expect(strategyForMatchup(118, 116).strategy).toBe('BALANCED');
  });

  it('changes a close call between a boom player and a safe one', () => {
    // Both are RBs behind two better RBs, so the FLEX is the only slot either
    // can take and the strategy is the only thing that decides it.
    const boom = makePlayer({
      name: 'Boom',
      position: 'RB',
      slot: 'BENCH',
      projection: makeProjection(9.5, { floor: 2, ceiling: 24 }),
    });
    const safe = makePlayer({
      name: 'Safe',
      position: 'RB',
      slot: 'FLEX',
      projection: makeProjection(10, { floor: 7, ceiling: 13 }),
    });
    const roster = [...baseRoster().filter((p) => p.slot !== 'FLEX'), safe, boom];

    // Which RB-eligible player sits in RB vs FLEX is arbitrary between
    // equal-value lineups, so assert on who STARTS.
    const startersUnder = (strategy: 'FLOOR' | 'CEILING' | 'BALANCED') =>
      optimizeLineup({ roster, slots: GIBBS_SLOTS, strategy })
        .assignments.map((a) => a.player?.name)
        .filter(Boolean);

    expect(startersUnder('FLOOR')).toContain('Safe');
    expect(startersUnder('FLOOR')).not.toContain('Boom');
    expect(startersUnder('CEILING')).toContain('Boom');
    expect(startersUnder('CEILING')).not.toContain('Safe');
    expect(startersUnder('BALANCED')).toContain('Safe'); // straight projection wins the tie
  });
});

describe('confidence', () => {
  it('is low when two players are nearly tied', () => {
    const a = makePlayer({ name: 'A', position: 'WR', projection: makeProjection(10) });
    const b = makePlayer({ name: 'B', position: 'WR', projection: makeProjection(9.7) });
    expect(swapConfidence(a, b, 0.3)).toBeLessThan(0.6);
  });

  it('rises with the size of the gap but never reaches certainty', () => {
    const a = makePlayer({ name: 'A', position: 'WR', projection: makeProjection(20) });
    const b = makePlayer({ name: 'B', position: 'WR', projection: makeProjection(4) });
    const confidence = swapConfidence(a, b, 16);
    expect(confidence).toBeGreaterThan(0.7);
    expect(confidence).toBeLessThanOrEqual(0.93);
  });

  it('drops when a questionable designation is involved', () => {
    const healthy = makePlayer({ name: 'Healthy', position: 'WR', projection: makeProjection(14) });
    const questionable = makePlayer({
      name: 'Questionable',
      position: 'WR',
      injuryStatus: 'QUESTIONABLE',
      projection: makeProjection(14),
    });
    expect(swapConfidence(questionable, healthy, 3)).toBeLessThan(swapConfidence(healthy, healthy, 3));
  });
});

describe('slot shuffles', () => {
  it('reports a position change as a shuffle, not a swap', () => {
    // Both players stay in the lineup; only their slots trade.
    const rb = starter('RBstar', 'RB', 'FLEX', 19);
    const wr = starter('WRstar', 'WR', 'WR', 12, 0);
    const roster = [
      starter('QB1', 'QB', 'QB', 20),
      starter('RB1', 'RB', 'RB', 15, 0),
      starter('RB2', 'RB', 'RB', 11, 1),
      wr,
      starter('WR2', 'WR', 'WR', 10, 1),
      starter('TE1', 'TE', 'TE', 8),
      rb,
      starter('DST1', 'DST', 'DST', 7),
      starter('K1', 'K', 'K', 8),
    ];
    const result = optimizeLineup({ roster, slots: GIBBS_SLOTS });
    // The best RB belongs in an RB slot, which pushes RB2 down to the FLEX.
    // Nobody enters or leaves the lineup, so this is a shuffle, not a swap —
    // the user does not need to be told about it as an action.
    expect(result.swaps).toHaveLength(0);
    const shuffles = lineupShuffles(result);
    expect(shuffles.map((s) => s.player.name)).toContain('RBstar');
    expect(shuffles.find((s) => s.player.name === 'RBstar')?.to).toBe('RB');
  });
});
