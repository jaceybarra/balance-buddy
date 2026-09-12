import { describe, expect, it } from 'vitest';
import { modelProjection } from '@/lib/projections/model';
import { modelDstProjection } from '@/lib/projections/dst';
import { priceProjection, bonusUpside } from '@/lib/projections/price';
import { scorePoints } from '@/lib/scoring/engine';
import { gibbsConfig, sgihConfig } from './fixtures';
import type { StatLine } from '@/lib/scoring/stats';

const baseWr: StatLine = { rec: 6, recYards: 85, recTD: 0.5 };

const neutralGame = {
  opponentAbbr: 'ARI',
  isHome: true,
  impliedPoints: 22.5,
  opponentImplied: 22.5,
  spread: 0,
  overUnder: 45,
  isDome: false,
  kickoff: new Date('2026-09-13T17:00:00Z'),
};

describe('projection model', () => {
  it('projects zero with no game (bye week or unknown NFL team)', () => {
    const result = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: null,
    });
    expect(result.statLine).toEqual({});
    expect(result.playProbability).toBe(0);
    expect(result.adjustments[0]!.label).toBe('No game');
  });

  it('raises production against a weak defense and lowers it against a strong one', () => {
    const vsWeak = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: { ...neutralGame, opponentAbbr: 'CAR' }, // worst pass defense in the seed ratings
    });
    const vsStrong = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: { ...neutralGame, opponentAbbr: 'DEN' }, // best pass defense
    });
    expect(vsWeak.statLine.recYards!).toBeGreaterThan(vsStrong.statLine.recYards!);
  });

  it('grades a running back against the run defense, not the pass defense', () => {
    const explain = modelProjection({
      position: 'RB',
      baseStatLine: { rushYards: 70, rushTD: 0.5, rec: 3, recYards: 20 },
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: neutralGame,
    });
    expect(explain.adjustments.find((a) => a.label === 'Matchup')?.detail).toContain('run');
  });

  it('shifts game script toward the run when favored', () => {
    const favored = modelProjection({
      position: 'RB',
      baseStatLine: { rushYards: 70, rushTD: 0.5 },
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: { ...neutralGame, spread: 9 },
    });
    const underdog = modelProjection({
      position: 'RB',
      baseStatLine: { rushYards: 70, rushTD: 0.5 },
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: { ...neutralGame, spread: -9 },
    });
    expect(favored.statLine.rushYards!).toBeGreaterThan(underdog.statLine.rushYards!);
  });

  it('never scales up negative events with a good matchup', () => {
    const result = modelProjection({
      position: 'QB',
      baseStatLine: { passYards: 250, passTD: 1.6, passInt: 0.7 },
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: { ...neutralGame, opponentAbbr: 'CAR' },
    });
    expect(result.statLine.passInt).toBe(0.7);
  });

  it('produces a floor below and a ceiling above the projection', () => {
    const result = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'HEALTHY',
      game: neutralGame,
    });
    expect(result.floorStatLine.recYards!).toBeLessThan(result.statLine.recYards!);
    expect(result.ceilingStatLine.recYards!).toBeGreaterThan(result.statLine.recYards!);
  });

  it('carries the play probability of an injury designation', () => {
    const questionable = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'QUESTIONABLE',
      game: neutralGame,
    });
    const out = modelProjection({
      position: 'WR',
      baseStatLine: baseWr,
      volatility: 5,
      roleStability: 0.9,
      injuryStatus: 'OUT',
      game: neutralGame,
    });
    expect(questionable.playProbability).toBeCloseTo(0.65, 2);
    expect(out.playProbability).toBe(0);
    // The "if he plays" stat line is unchanged — the risk lives in the probability.
    expect(out.statLine.recYards).toBeCloseTo(questionable.statLine.recYards!, 5);
  });
});

describe('D/ST model', () => {
  it('projects better against a low-implied-total opponent', () => {
    const good = modelDstProjection('BAL', { ...neutralGame, opponentAbbr: 'CAR', opponentImplied: 14 });
    const bad = modelDstProjection('BAL', { ...neutralGame, opponentAbbr: 'DET', opponentImplied: 30 });
    expect(scorePoints(good.statLine, gibbsConfig)).toBeGreaterThan(scorePoints(bad.statLine, gibbsConfig));
  });

  it('prices the same defensive game differently in the two leagues', () => {
    const model = modelDstProjection('DEN', { ...neutralGame, opponentAbbr: 'CAR', opponentImplied: 11 });
    const shutout = { ...model.ceilingStatLine, pointsAllowed: 0 };

    // Two independent rule differences show up in the same stat line:
    //   the shutout bracket (5 vs 6) and return yardage (unscored vs 0.04/yd).
    const shutoutOnly = { pointsAllowed: 0, yardsAllowed: 150 };
    expect(scorePoints(shutoutOnly, gibbsConfig)).toBe(8);
    expect(scorePoints(shutoutOnly, sgihConfig)).toBe(9);

    const returnYards = (model.ceilingStatLine.kickReturnYards ?? 0) + (model.ceilingStatLine.puntReturnYards ?? 0);
    expect(scorePoints(shutout, sgihConfig) - scorePoints(shutout, gibbsConfig)).toBeCloseTo(1 + returnYards * 0.04, 5);
  });

  it('returns no production on a bye', () => {
    const model = modelDstProjection('BAL', null);
    expect(model.statLine).toEqual({});
    expect(model.drivers[0]).toContain('bye');
  });

  it('explains the drivers behind the number', () => {
    const model = modelDstProjection('PIT', { ...neutralGame, opponentAbbr: 'CAR', opponentImplied: 15, spread: 7 });
    expect(model.drivers.join(' ')).toContain('implied');
    expect(model.drivers.some((d) => d.includes('game script'))).toBe(true);
  });
});

describe('pricing a projection for a league', () => {
  const statLine: StatLine = { rec: 6, recYards: 100, recTD: 1 };
  const ceiling: StatLine = { rec: 9, recYards: 160, recTD: 2 };
  const floor: StatLine = { rec: 3, recYards: 45, recTD: 0 };

  it('prices the same projection higher in the bonus league', () => {
    const gibbs = priceProjection({ statLine, floorStatLine: floor, ceilingStatLine: ceiling, config: gibbsConfig, injuryStatus: 'HEALTHY', confidence: 0.7, source: 'TEST' });
    const sgih = priceProjection({ statLine, floorStatLine: floor, ceilingStatLine: ceiling, config: sgihConfig, injuryStatus: 'HEALTHY', confidence: 0.7, source: 'TEST' });
    expect(gibbs.points).toBe(19);
    expect(sgih.points).toBe(23);
    expect(sgih.ceiling - gibbs.ceiling).toBe(4);
    // The floor game does not reach 100 yards, so no bonus there.
    expect(sgih.floor).toBe(gibbs.floor);
  });

  it('discounts expected points by the chance he actually plays', () => {
    const priced = priceProjection({ statLine, config: gibbsConfig, injuryStatus: 'QUESTIONABLE', confidence: 0.7, source: 'TEST' });
    expect(priced.points).toBe(19);
    expect(priced.expected).toBeCloseTo(12.35, 2);
  });

  it('reports how much the league bonus is worth in a ceiling game', () => {
    expect(bonusUpside(statLine, ceiling, sgihConfig)).toBe(0); // already at the bonus in the mean
    expect(bonusUpside(floor, ceiling, sgihConfig)).toBe(4); // floor has none, ceiling does
    expect(bonusUpside(floor, ceiling, gibbsConfig)).toBe(0); // this league has no bonuses at all
  });

  it('uses provider points as-is when a source gives no stat line, and says so', () => {
    const priced = priceProjection({
      statLine: {},
      config: sgihConfig,
      injuryStatus: 'HEALTHY',
      confidence: 0.8,
      source: 'CSV',
      providerPoints: 15.5,
    });
    expect(priced.points).toBe(15.5);
    expect(priced.source).toContain('points as provided');
    // Confidence is capped because this league's scoring was NOT applied.
    expect(priced.confidence).toBeLessThanOrEqual(0.45);
  });
});
