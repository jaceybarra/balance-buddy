import { STAT_LABEL, STAT_KEYS, TIER_STATS, type StatKey, type StatLine } from './stats';
import type { BonusRule, PerUnitRule, ScoreResult, ScoringConfig, ScoringRule, TierRule } from './types';

function inRange(value: number, min: number, max: number | null): boolean {
  if (value < min) return false;
  if (max === null) return true;
  return value <= max;
}

interface IndexedConfig {
  perUnit: Map<StatKey, PerUnitRule>;
  bonusesByStat: Map<StatKey, BonusRule[]>;
  tiersByStat: Map<StatKey, TierRule[]>;
}

const indexCache = new WeakMap<ScoringConfig, IndexedConfig>();

function indexConfig(config: ScoringConfig): IndexedConfig {
  const cached = indexCache.get(config);
  if (cached) return cached;

  const perUnit = new Map<StatKey, PerUnitRule>();
  const bonusesByStat = new Map<StatKey, BonusRule[]>();
  const tiersByStat = new Map<StatKey, TierRule[]>();

  for (const rule of config.rules) {
    if (rule.kind === 'PER_UNIT') {
      perUnit.set(rule.statKey, rule);
    } else if (rule.kind === 'BONUS') {
      const list = bonusesByStat.get(rule.statKey) ?? [];
      list.push(rule);
      bonusesByStat.set(rule.statKey, list);
    } else {
      const list = tiersByStat.get(rule.statKey) ?? [];
      list.push(rule);
      tiersByStat.set(rule.statKey, list);
    }
  }
  const indexed = { perUnit, bonusesByStat, tiersByStat };
  indexCache.set(config, indexed);
  return indexed;
}

/**
 * Price a stat line with ONE league's rules.
 *
 * Order of operations:
 *   1. per-unit rules   (yards, TDs, receptions, sacks, ...)
 *   2. tier rules       (points allowed / yards allowed: exactly one bracket)
 *   3. bonus rules      (yardage milestones; best-qualifying per exclusive group)
 *
 * Anything the league has no rule for is reported in `unscored` rather than
 * silently guessed — that's how we avoid inventing scoring for undefined ranges.
 */
export function scoreStatLine(line: StatLine, config: ScoringConfig): ScoreResult {
  const { perUnit, bonusesByStat, tiersByStat } = indexConfig(config);
  const breakdown: ScoreResult['breakdown'] = [];
  const unscored: ScoreResult['unscored'] = [];
  let total = 0;

  for (const statKey of STAT_KEYS) {
    const value = line[statKey];
    if (value === undefined || value === 0) {
      // A shutout (0 points allowed) is a real, scoreable event — don't skip it.
      if (!(value === 0 && TIER_STATS.includes(statKey))) continue;
    }
    const v = value ?? 0;

    if (TIER_STATS.includes(statKey)) {
      const tiers = tiersByStat.get(statKey);
      if (!tiers || tiers.length === 0) {
        unscored.push({ statKey, value: v });
        continue;
      }
      const tier = tiers.find((t) => inRange(v, t.rangeMin, t.rangeMax));
      if (!tier) {
        // Value fell in a range the league never defined -> scores nothing.
        breakdown.push({
          statKey,
          label: STAT_LABEL[statKey],
          value: v,
          points: 0,
          kind: 'TIER',
          note: 'no bracket defined for this range',
        });
        continue;
      }
      total += tier.points;
      breakdown.push({
        statKey,
        label: STAT_LABEL[statKey],
        value: v,
        points: tier.points,
        kind: 'TIER',
        note: rangeLabel(tier.rangeMin, tier.rangeMax),
      });
      continue;
    }

    const rule = perUnit.get(statKey);
    if (rule) {
      const pts = rule.points * v;
      total += pts;
      breakdown.push({ statKey, label: STAT_LABEL[statKey], value: v, points: pts, kind: 'PER_UNIT' });
    } else if (v !== 0) {
      unscored.push({ statKey, value: v });
    }
  }

  // Yardage / milestone bonuses — best qualifying bonus per exclusive group.
  const bestByGroup = new Map<string, { rule: BonusRule; value: number }>();
  for (const [statKey, bonuses] of bonusesByStat) {
    const value = line[statKey];
    if (value === undefined) continue;
    for (const bonus of bonuses) {
      if (!inRange(value, bonus.rangeMin, bonus.rangeMax)) continue;
      const current = bestByGroup.get(bonus.exclusiveGroup);
      if (!current || bonus.points > current.rule.points) {
        bestByGroup.set(bonus.exclusiveGroup, { rule: bonus, value });
      }
    }
  }
  for (const { rule, value } of bestByGroup.values()) {
    total += rule.points;
    breakdown.push({
      statKey: rule.statKey,
      label: `${STAT_LABEL[rule.statKey]} bonus`,
      value,
      points: rule.points,
      kind: 'BONUS',
      note: rangeLabel(rule.rangeMin, rule.rangeMax),
    });
  }

  return { points: round2(total), breakdown, unscored };
}

/** Convenience: points only. */
export function scorePoints(line: StatLine, config: ScoringConfig): number {
  return scoreStatLine(line, config).points;
}

/**
 * How much MORE this stat line is worth in league A than league B.
 * Powers "he's the better start in So Good It Hurts" style copy.
 */
export function scoringDelta(line: StatLine, a: ScoringConfig, b: ScoringConfig): number {
  return round2(scorePoints(line, a) - scorePoints(line, b));
}

export function rangeLabel(min: number, max: number | null): string {
  if (max === null) return `${formatNum(min)}+`;
  if (min === max) return `${formatNum(min)}`;
  return `${formatNum(min)}-${formatNum(max)}`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rules that only exist in one of two leagues — used by the comparison UI. */
export function ruleDifferences(a: ScoringConfig, b: ScoringConfig): string[] {
  const key = (r: ScoringRule) => `${r.kind}:${r.statKey}:${'rangeMin' in r ? r.rangeMin : ''}:${'rangeMax' in r ? r.rangeMax : ''}`;
  const bMap = new Map(b.rules.map((r) => [key(r), r]));
  const diffs: string[] = [];
  for (const rule of a.rules) {
    const other = bMap.get(key(rule));
    if (!other) {
      diffs.push(`${a.leagueName} only: ${describeRule(rule)}`);
    } else if (other.points !== rule.points) {
      diffs.push(`${describeRule(rule)} — ${a.leagueName} ${rule.points}, ${b.leagueName} ${other.points}`);
    }
  }
  const aMap = new Map(a.rules.map((r) => [key(r), r]));
  for (const rule of b.rules) {
    if (!aMap.has(key(rule))) diffs.push(`${b.leagueName} only: ${describeRule(rule)}`);
  }
  return diffs;
}

export function describeRule(rule: ScoringRule): string {
  const label = STAT_LABEL[rule.statKey];
  if (rule.kind === 'PER_UNIT') return `${label} ${rule.points} pt${Math.abs(rule.points) === 1 ? '' : 's'}/unit`;
  return `${label} ${rangeLabel(rule.rangeMin, rule.rangeMax)} = ${rule.points}`;
}
