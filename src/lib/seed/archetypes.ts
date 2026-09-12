import type { StatLine } from '../scoring/stats';

/**
 * Per-game baseline production by role archetype.
 *
 * This is the bootstrap projection model: a deterministic, explainable starting
 * point so the app is useful with zero external data. A real projection
 * provider (ESPN / CSV upload / future API) overrides it, and every projection
 * carries its source so the UI can say where the number came from.
 */
export const ARCHETYPES = [
  'QB_ELITE', 'QB1', 'QB2', 'QB_STREAM',
  'RB_ELITE', 'RB1', 'RB2', 'RB3', 'RB_HANDCUFF',
  'WR_ELITE', 'WR1', 'WR2', 'WR3', 'WR4',
  'TE_ELITE', 'TE1', 'TE2',
  'K1', 'K2',
  'DST1', 'DST2', 'DST3',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export interface UsageProfile {
  snapShare: number;
  targets: number;
  carries: number;
  redZoneTouches: number;
  /** 0..1 — how locked-in the role is. Feeds the confidence model. */
  roleStability: number;
}

export interface ArchetypeProfile {
  statLine: StatLine;
  usage: UsageProfile;
  /** Week-to-week standard deviation of fantasy points, before league scoring. */
  volatility: number;
}

export const ARCHETYPE_PROFILES: Record<Archetype, ArchetypeProfile> = {
  QB_ELITE: {
    statLine: { passYards: 262, passTD: 1.85, passInt: 0.62, rushYards: 42, rushTD: 0.42, pass2pt: 0.05, fumblesLost: 0.05 },
    usage: { snapShare: 0.99, targets: 0, carries: 7.2, redZoneTouches: 2.4, roleStability: 0.97 },
    volatility: 6.4,
  },
  QB1: {
    statLine: { passYards: 248, passTD: 1.6, passInt: 0.68, rushYards: 16, rushTD: 0.16, pass2pt: 0.04, fumblesLost: 0.06 },
    usage: { snapShare: 0.98, targets: 0, carries: 3.1, redZoneTouches: 1.1, roleStability: 0.93 },
    volatility: 5.8,
  },
  QB2: {
    statLine: { passYards: 216, passTD: 1.24, passInt: 0.74, rushYards: 11, rushTD: 0.1, fumblesLost: 0.07 },
    usage: { snapShare: 0.96, targets: 0, carries: 2.4, redZoneTouches: 0.7, roleStability: 0.8 },
    volatility: 5.4,
  },
  QB_STREAM: {
    statLine: { passYards: 194, passTD: 1.05, passInt: 0.8, rushYards: 14, rushTD: 0.12, fumblesLost: 0.08 },
    usage: { snapShare: 0.9, targets: 0, carries: 2.6, redZoneTouches: 0.6, roleStability: 0.6 },
    volatility: 5.6,
  },
  RB_ELITE: {
    statLine: { rushYards: 86, rushTD: 0.68, rec: 3.6, recYards: 29, recTD: 0.16, fumblesLost: 0.04 },
    usage: { snapShare: 0.72, targets: 4.6, carries: 17.4, redZoneTouches: 3.6, roleStability: 0.95 },
    volatility: 6.9,
  },
  RB1: {
    statLine: { rushYards: 69, rushTD: 0.46, rec: 2.9, recYards: 22, recTD: 0.1, fumblesLost: 0.04 },
    usage: { snapShare: 0.62, targets: 3.7, carries: 14.6, redZoneTouches: 2.5, roleStability: 0.88 },
    volatility: 6.1,
  },
  RB2: {
    statLine: { rushYards: 47, rushTD: 0.3, rec: 2.2, recYards: 16, recTD: 0.07, fumblesLost: 0.04 },
    usage: { snapShare: 0.45, targets: 2.8, carries: 10.1, redZoneTouches: 1.5, roleStability: 0.74 },
    volatility: 5.2,
  },
  RB3: {
    statLine: { rushYards: 29, rushTD: 0.18, rec: 1.4, recYards: 10, recTD: 0.04, fumblesLost: 0.03 },
    usage: { snapShare: 0.31, targets: 1.8, carries: 6.4, redZoneTouches: 0.8, roleStability: 0.6 },
    volatility: 4.4,
  },
  RB_HANDCUFF: {
    statLine: { rushYards: 21, rushTD: 0.14, rec: 0.9, recYards: 6, recTD: 0.02, fumblesLost: 0.02 },
    // Low current volume, but high contingent value — the free-agent engine
    // weights `handcuffUpside` separately so we never drop these for a
    // marginally better one-week projection.
    usage: { snapShare: 0.22, targets: 1.1, carries: 4.8, redZoneTouches: 0.5, roleStability: 0.45 },
    volatility: 5.8,
  },
  WR_ELITE: {
    statLine: { rec: 6.4, recYards: 88, recTD: 0.55, rushYards: 2, fumblesLost: 0.03 },
    usage: { snapShare: 0.92, targets: 9.7, carries: 0.3, redZoneTouches: 1.7, roleStability: 0.95 },
    volatility: 7.6,
  },
  WR1: {
    statLine: { rec: 5.4, recYards: 72, recTD: 0.44, fumblesLost: 0.03 },
    usage: { snapShare: 0.88, targets: 8.2, carries: 0.2, redZoneTouches: 1.3, roleStability: 0.9 },
    volatility: 7.1,
  },
  WR2: {
    statLine: { rec: 4.3, recYards: 55, recTD: 0.32, fumblesLost: 0.02 },
    usage: { snapShare: 0.8, targets: 6.4, carries: 0.2, redZoneTouches: 0.9, roleStability: 0.82 },
    volatility: 6.3,
  },
  WR3: {
    statLine: { rec: 3.1, recYards: 39, recTD: 0.22, fumblesLost: 0.02 },
    usage: { snapShare: 0.66, targets: 4.6, carries: 0.1, redZoneTouches: 0.6, roleStability: 0.7 },
    volatility: 5.5,
  },
  WR4: {
    statLine: { rec: 2.0, recYards: 25, recTD: 0.13, fumblesLost: 0.01 },
    usage: { snapShare: 0.48, targets: 3.0, carries: 0.1, redZoneTouches: 0.35, roleStability: 0.55 },
    volatility: 4.6,
  },
  TE_ELITE: {
    statLine: { rec: 5.6, recYards: 63, recTD: 0.46, fumblesLost: 0.02 },
    usage: { snapShare: 0.87, targets: 7.8, carries: 0, redZoneTouches: 1.4, roleStability: 0.94 },
    volatility: 5.9,
  },
  TE1: {
    statLine: { rec: 4.0, recYards: 44, recTD: 0.3, fumblesLost: 0.02 },
    usage: { snapShare: 0.8, targets: 5.6, carries: 0, redZoneTouches: 0.9, roleStability: 0.85 },
    volatility: 4.8,
  },
  TE2: {
    statLine: { rec: 2.6, recYards: 26, recTD: 0.17, fumblesLost: 0.01 },
    usage: { snapShare: 0.62, targets: 3.4, carries: 0, redZoneTouches: 0.5, roleStability: 0.66 },
    volatility: 3.9,
  },
  K1: {
    statLine: { pat: 2.5, fgMade0_39: 0.85, fgMade40_49: 0.55, fgMade50_59: 0.3, fgMade60Plus: 0.04, fgMissed: 0.32, patMissed: 0.07 },
    usage: { snapShare: 1, targets: 0, carries: 0, redZoneTouches: 0, roleStability: 0.9 },
    volatility: 3.4,
  },
  K2: {
    statLine: { pat: 2.1, fgMade0_39: 0.72, fgMade40_49: 0.46, fgMade50_59: 0.22, fgMade60Plus: 0.02, fgMissed: 0.36, patMissed: 0.08 },
    usage: { snapShare: 1, targets: 0, carries: 0, redZoneTouches: 0, roleStability: 0.8 },
    volatility: 3.2,
  },
  DST1: {
    statLine: {
      sacks: 2.7, defInt: 0.92, fumRec: 0.62, safety: 0.06, blockedKick: 0.08,
      intReturnTD: 0.09, fumbleReturnTD: 0.05, kickReturnTD: 0.02, puntReturnTD: 0.03,
      pointsAllowed: 18.5, yardsAllowed: 318, kickReturnYards: 42, puntReturnYards: 18,
    },
    usage: { snapShare: 1, targets: 0, carries: 0, redZoneTouches: 0, roleStability: 0.85 },
    volatility: 5.6,
  },
  DST2: {
    statLine: {
      sacks: 2.3, defInt: 0.78, fumRec: 0.55, safety: 0.04, blockedKick: 0.06,
      intReturnTD: 0.06, fumbleReturnTD: 0.04, kickReturnTD: 0.02, puntReturnTD: 0.02,
      pointsAllowed: 22.4, yardsAllowed: 344, kickReturnYards: 40, puntReturnYards: 16,
    },
    usage: { snapShare: 1, targets: 0, carries: 0, redZoneTouches: 0, roleStability: 0.75 },
    volatility: 5.4,
  },
  DST3: {
    statLine: {
      sacks: 1.9, defInt: 0.66, fumRec: 0.5, safety: 0.03, blockedKick: 0.05,
      intReturnTD: 0.04, fumbleReturnTD: 0.03, kickReturnTD: 0.01, puntReturnTD: 0.02,
      pointsAllowed: 25.8, yardsAllowed: 372, kickReturnYards: 38, puntReturnYards: 15,
    },
    usage: { snapShare: 1, targets: 0, carries: 0, redZoneTouches: 0, roleStability: 0.65 },
    volatility: 5.2,
  },
};
