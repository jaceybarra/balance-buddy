import { GIBBS_SCORING_RULES, SGIH_SCORING_RULES } from '@/lib/scoring/seed-configs';
import type { ScoringConfig } from '@/lib/scoring/types';
import type { PlayerCard } from '@/lib/data/context';
import type { PricedProjection } from '@/lib/projections/price';
import type { InjuryStatus, LockState, Position, RosterSlot } from '@/lib/domain/enums';
import type { SlotDefinition } from '@/lib/optimizer/lineup';

/** Team 1 — no yardage bonuses, 5-point shutout. */
export const gibbsConfig: ScoringConfig = {
  leagueId: 'gibbs',
  leagueName: 'Gibbs Me The Trophy',
  ppr: 0.5,
  rules: GIBBS_SCORING_RULES,
  source: 'SEED',
};

/** Team 2 — yardage bonuses, 6-point shutout, fumbles and return yards scored. */
export const sgihConfig: ScoringConfig = {
  leagueId: 'sgih',
  leagueName: 'So Good It Hurts',
  ppr: 0.5,
  rules: SGIH_SCORING_RULES,
  source: 'SEED',
};

export const GIBBS_SLOTS: SlotDefinition[] = [
  { slot: 'QB', starters: 1, eligible: ['QB'], sortOrder: 0 },
  { slot: 'RB', starters: 2, eligible: ['RB'], sortOrder: 1 },
  { slot: 'WR', starters: 2, eligible: ['WR'], sortOrder: 2 },
  { slot: 'TE', starters: 1, eligible: ['TE'], sortOrder: 3 },
  { slot: 'FLEX', starters: 1, eligible: ['RB', 'WR', 'TE'], sortOrder: 4 },
  { slot: 'DST', starters: 1, eligible: ['DST'], sortOrder: 5 },
  { slot: 'K', starters: 1, eligible: ['K'], sortOrder: 6 },
];

/** Same league shape but with TWO flex slots, like "So Good It Hurts". */
export const SGIH_SLOTS: SlotDefinition[] = GIBBS_SLOTS.map((s) =>
  s.slot === 'FLEX' ? { ...s, starters: 2 } : s,
);

let counter = 0;

export function makePlayer(overrides: Partial<PlayerCard> & { name: string; position: Position }): PlayerCard {
  counter += 1;
  const projection: PricedProjection | null =
    overrides.projection === undefined
      ? makeProjection(10)
      : overrides.projection;

  return {
    id: overrides.id ?? `p${counter}`,
    rosterPlayerId: null,
    name: overrides.name,
    position: overrides.position,
    eligiblePositions: overrides.eligiblePositions ?? [],
    nflTeamAbbr: overrides.nflTeamAbbr ?? 'SEA',
    injuryStatus: (overrides.injuryStatus ?? 'HEALTHY') as InjuryStatus,
    injuryDetail: overrides.injuryDetail ?? null,
    injuryUpdatedAt: null,
    byeWeek: overrides.byeWeek ?? null,
    depthChartOrder: overrides.depthChartOrder ?? 1,
    depthChartRole: overrides.depthChartRole ?? null,
    isManual: false,
    source: 'TEST',
    slot: (overrides.slot ?? null) as RosterSlot | null,
    slotIndex: overrides.slotIndex ?? 0,
    game:
      overrides.game === undefined
        ? {
            id: `g${counter}`,
            kickoff: new Date('2026-09-13T17:00:00Z'),
            opponentAbbr: 'ARI',
            isHome: true,
            status: 'SCHEDULED',
            spread: -2,
            overUnder: 45,
            impliedPoints: 23,
            opponentImplied: 22,
            slotLabel: 'Sunday early',
            isInternational: false,
          }
        : overrides.game,
    onBye: overrides.onBye ?? false,
    lock: (overrides.lock ?? 'AVAILABLE') as LockState,
    projection,
    rosPerGame: overrides.rosPerGame ?? projection?.points ?? null,
    rosPoints: overrides.rosPoints ?? null,
    usage: overrides.usage ?? null,
    bonusUpside: overrides.bonusUpside ?? 0,
    percentOwned: overrides.percentOwned ?? null,
    trendingAdds: overrides.trendingAdds ?? null,
  };
}

export function makeProjection(points: number, opts: Partial<PricedProjection> = {}): PricedProjection {
  return {
    points,
    floor: opts.floor ?? points * 0.6,
    ceiling: opts.ceiling ?? points * 1.5,
    expected: opts.expected ?? points * (opts.playProbability ?? 1),
    playProbability: opts.playProbability ?? 1,
    confidence: opts.confidence ?? 0.7,
    source: opts.source ?? 'TEST',
    updatedAt: opts.updatedAt ?? new Date('2026-09-12T12:00:00Z'),
    breakdown: opts.breakdown ?? [],
    unscored: opts.unscored ?? [],
  };
}

/** Convenience: a starter already sitting in a slot. */
export function starter(name: string, position: Position, slot: RosterSlot, points: number, slotIndex = 0): PlayerCard {
  return makePlayer({ name, position, slot, slotIndex, projection: makeProjection(points) });
}

export function bench(name: string, position: Position, points: number): PlayerCard {
  return makePlayer({ name, position, slot: 'BENCH', projection: makeProjection(points) });
}
