import { describe, expect, it } from 'vitest';
import { scoreStatLine, scorePoints, scoringDelta, ruleDifferences } from '@/lib/scoring/engine';
import type { StatLine } from '@/lib/scoring/stats';
import { gibbsConfig, sgihConfig } from './fixtures';

describe('league scoring engines are independent', () => {
  /**
   * The worked example from the product spec:
   *   100 receiving yards, 6 receptions, 1 receiving TD
   *   Team 1 -> 10 + 3 + 6                = 19
   *   Team 2 -> 10 + 3 + 6 + 4 (100+ bonus) = 23
   */
  const wrGame: StatLine = { recYards: 100, rec: 6, recTD: 1 };

  it('prices the spec fixture at 19 in Gibbs Me The Trophy', () => {
    expect(scorePoints(wrGame, gibbsConfig)).toBe(19);
  });

  it('prices the same game at 23 in So Good It Hurts (100-yard bonus)', () => {
    expect(scorePoints(wrGame, sgihConfig)).toBe(23);
  });

  it('reports the 4-point difference between the two leagues', () => {
    expect(scoringDelta(wrGame, sgihConfig, gibbsConfig)).toBe(4);
  });

  it('applies 0.5 PPR in both leagues', () => {
    const tenCatches: StatLine = { rec: 10 };
    expect(scorePoints(tenCatches, gibbsConfig)).toBe(5);
    expect(scorePoints(tenCatches, sgihConfig)).toBe(5);
  });

  it('surfaces the rule differences between the leagues', () => {
    const diffs = ruleDifferences(sgihConfig, gibbsConfig);
    expect(diffs.join(' ')).toContain('Receiving yards');
    expect(diffs.some((d) => d.includes('Fumbles lost'))).toBe(true);
  });
});

describe('yardage bonuses', () => {
  it('treats 300-399 and 400+ passing bonuses as mutually exclusive', () => {
    // 410 yards, 3 TD: 16.4 + 12 = 28.4, plus ONLY the 6-point bonus.
    const line: StatLine = { passYards: 410, passTD: 3 };
    expect(scorePoints(line, sgihConfig)).toBe(34.4);

    // A 350-yard game takes the 4-point bonus instead.
    expect(scorePoints({ passYards: 350, passTD: 3 }, sgihConfig)).toBe(30);
  });

  it('never awards a bonus below the threshold', () => {
    expect(scorePoints({ recYards: 99, rec: 5, recTD: 0 }, sgihConfig)).toBe(12.4);
    expect(scorePoints({ recYards: 100, rec: 5, recTD: 0 }, sgihConfig)).toBe(16.5);
  });

  it('awards the 200+ receiving bonus once, not on top of the 100+ bonus', () => {
    const result = scoreStatLine({ recYards: 215, rec: 9, recTD: 2 }, sgihConfig);
    const bonuses = result.breakdown.filter((b) => b.kind === 'BONUS');
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]!.points).toBe(6);
  });

  it('gives Gibbs Me The Trophy no bonus at all', () => {
    const result = scoreStatLine({ recYards: 215, rec: 9, recTD: 2 }, gibbsConfig);
    expect(result.breakdown.filter((b) => b.kind === 'BONUS')).toHaveLength(0);
  });

  it('applies rushing bonuses independently of receiving bonuses', () => {
    // 120 rush + 110 rec in one game earns BOTH milestone bonuses (different stats).
    const line: StatLine = { rushYards: 120, recYards: 110, rec: 5 };
    const result = scoreStatLine(line, sgihConfig);
    expect(result.breakdown.filter((b) => b.kind === 'BONUS')).toHaveLength(2);
    expect(result.points).toBe(12 + 11 + 2.5 + 4 + 4);
  });
});

describe('D/ST scoring', () => {
  const shutout: StatLine = { pointsAllowed: 0, yardsAllowed: 180, sacks: 4, defInt: 2, fumRec: 1 };

  it('scores a shutout at 5 in Gibbs and 6 in So Good It Hurts', () => {
    // 5/6 (PA) + 3 (yards 100-199) + 4 (sacks) + 4 (INT) + 2 (fumble) = 18 / 19
    expect(scorePoints(shutout, gibbsConfig)).toBe(18);
    expect(scorePoints(shutout, sgihConfig)).toBe(19);
  });

  it('selects exactly one points-allowed bracket', () => {
    const result = scoreStatLine({ pointsAllowed: 13, yardsAllowed: 250 }, gibbsConfig);
    const paItems = result.breakdown.filter((b) => b.statKey === 'pointsAllowed');
    expect(paItems).toHaveLength(1);
    expect(paItems[0]!.points).toBe(3);
  });

  it('scores zero for a range the league never defined', () => {
    // 18-27 points allowed and 300-349 yards allowed are both undefined gaps.
    const result = scoreStatLine({ pointsAllowed: 21, yardsAllowed: 320 }, gibbsConfig);
    expect(result.points).toBe(0);
    expect(result.breakdown.every((b) => b.points === 0)).toBe(true);
    expect(result.breakdown.some((b) => b.note?.includes('no bracket defined'))).toBe(true);
  });

  it('scores return yardage in So Good It Hurts only', () => {
    const line: StatLine = { kickReturnYards: 100, puntReturnYards: 50 };
    expect(scorePoints(line, sgihConfig)).toBe(6);
    expect(scorePoints(line, gibbsConfig)).toBe(0);
  });

  it('reports stats a league has no rule for instead of guessing', () => {
    const result = scoreStatLine({ fumblesLost: 2 }, gibbsConfig);
    expect(result.points).toBe(0);
    expect(result.unscored).toContainEqual({ statKey: 'fumblesLost', value: 2 });

    // The other league does define it.
    expect(scorePoints({ fumblesLost: 2 }, sgihConfig)).toBe(-4);
  });

  it('applies the heavy negative tiers', () => {
    expect(scorePoints({ pointsAllowed: 48, yardsAllowed: 560 }, gibbsConfig)).toBe(-12);
  });
});

describe('kicker scoring', () => {
  it('scores field goals by distance bucket', () => {
    // 3 PAT + 1x(0-39) + 1x(40-49) + 1x(50-59) + 1x(60+) - 1 miss
    const line: StatLine = {
      pat: 3,
      fgMade0_39: 1,
      fgMade40_49: 1,
      fgMade50_59: 1,
      fgMade60Plus: 1,
      fgMissed: 1,
    };
    expect(scorePoints(line, gibbsConfig)).toBe(3 + 3 + 4 + 5 + 6 - 1);
  });

  it('only penalizes a missed PAT in So Good It Hurts', () => {
    expect(scorePoints({ pat: 2, patMissed: 1 }, gibbsConfig)).toBe(2);
    expect(scorePoints({ pat: 2, patMissed: 1 }, sgihConfig)).toBe(1);
  });
});

describe('offense scoring', () => {
  it('scores a quarterback line identically in both leagues below the bonus threshold', () => {
    const line: StatLine = { passYards: 280, passTD: 2, passInt: 1, rushYards: 22, rushTD: 1 };
    // 11.2 + 8 - 2 + 2.2 + 6
    expect(scorePoints(line, gibbsConfig)).toBe(25.4);
    expect(scorePoints(line, sgihConfig)).toBe(25.4);
  });

  it('scores two-point conversions', () => {
    expect(scorePoints({ pass2pt: 1, rush2pt: 1, rec2pt: 1 }, gibbsConfig)).toBe(6);
  });

  it('produces an explainable breakdown', () => {
    const result = scoreStatLine({ recYards: 100, rec: 6, recTD: 1 }, sgihConfig);
    const labels = result.breakdown.map((b) => b.label);
    expect(labels).toContain('Receptions');
    expect(labels).toContain('Receiving yards');
    expect(labels).toContain('Receiving yards bonus');
    expect(result.breakdown.reduce((s, b) => s + b.points, 0)).toBeCloseTo(23, 5);
  });
});
