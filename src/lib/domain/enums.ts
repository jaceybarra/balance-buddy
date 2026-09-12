import { z } from 'zod';

/**
 * SQLite has no enums, so every "enum" column is a string validated here.
 * These constants are the single source of truth for the whole app.
 */

export const PLAYER_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const;
export const zPosition = z.enum(PLAYER_POSITIONS);
export type Position = (typeof PLAYER_POSITIONS)[number];

export const ROSTER_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH', 'IR'] as const;
export const zRosterSlot = z.enum(ROSTER_SLOTS);
export type RosterSlot = (typeof ROSTER_SLOTS)[number];

export const STARTING_SLOTS: RosterSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K'];

export const INJURY_STATUSES = [
  'HEALTHY',
  'QUESTIONABLE',
  'DOUBTFUL',
  'OUT',
  'IR',
  'PUP',
  'SUSPENDED',
  'UNKNOWN',
] as const;
export const zInjuryStatus = z.enum(INJURY_STATUSES);
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

/** Probability a player suits up, by designation. Drives contingency planning. */
export const PLAY_PROBABILITY: Record<InjuryStatus, number> = {
  HEALTHY: 1,
  QUESTIONABLE: 0.65,
  DOUBTFUL: 0.2,
  OUT: 0,
  IR: 0,
  PUP: 0,
  SUSPENDED: 0,
  UNKNOWN: 0.9,
};

/** Statuses that make a player ineligible to start at all. */
export const NON_PLAYING_STATUSES: InjuryStatus[] = ['OUT', 'IR', 'PUP', 'SUSPENDED'];

export const ACTION_TYPES = ['LINEUP', 'WAIVER', 'INJURY', 'TRADE', 'STREAMER', 'ROSTER', 'NEWS'] as const;
export const zActionType = z.enum(ACTION_TYPES);
export type ActionType = (typeof ACTION_TYPES)[number];

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const zSeverity = z.enum(SEVERITIES);
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const ACTION_STATUSES = ['OPEN', 'SNOOZED', 'DONE', 'EXPIRED'] as const;
export const zActionStatus = z.enum(ACTION_STATUSES);
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** The five product-level states the UI paints. */
export const PRIORITY_STATES = ['CRITICAL', 'ACTION_NEEDED', 'WATCH', 'GOOD', 'NO_ACTION'] as const;
export type PriorityState = (typeof PRIORITY_STATES)[number];

export const PRIORITY_LABEL: Record<PriorityState, string> = {
  CRITICAL: 'CRITICAL',
  ACTION_NEEDED: 'ACTION NEEDED',
  WATCH: 'WATCH',
  GOOD: 'GOOD',
  NO_ACTION: 'NO ACTION',
};

export function severityToPriority(severity: Severity, type: ActionType): PriorityState {
  if (severity === 'CRITICAL') return 'CRITICAL';
  if (severity === 'HIGH') return 'ACTION_NEEDED';
  if (severity === 'MEDIUM') return type === 'NEWS' || type === 'INJURY' ? 'WATCH' : 'ACTION_NEEDED';
  return 'WATCH';
}

export const LOCK_STATES = ['AVAILABLE', 'LOCKING_SOON', 'LOCKED'] as const;
export type LockState = (typeof LOCK_STATES)[number];

export const GAME_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINAL', 'POSTPONED', 'CANCELED'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const DATA_SCOPES = [
  'ESPN_LEAGUE',
  'NFL_PLAYERS',
  'NFL_SCHEDULE',
  'INJURIES',
  'PROJECTIONS',
  'NEWS',
  'FREE_AGENTS',
  'STATS',
  'ENGINE',
] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/** How long before each scope is considered stale (minutes). */
export const STALE_AFTER_MINUTES: Record<DataScope, number> = {
  ESPN_LEAGUE: 180,
  NFL_PLAYERS: 1440,
  NFL_SCHEDULE: 1440,
  INJURIES: 120,
  PROJECTIONS: 360,
  NEWS: 120,
  FREE_AGENTS: 360,
  STATS: 720,
  ENGINE: 60,
};

export const SCOPE_LABEL: Record<DataScope, string> = {
  ESPN_LEAGUE: 'ESPN league',
  NFL_PLAYERS: 'NFL players',
  NFL_SCHEDULE: 'NFL schedule',
  INJURIES: 'Injuries',
  PROJECTIONS: 'Projections',
  NEWS: 'News',
  FREE_AGENTS: 'Free agents',
  STATS: 'Statistics',
  ENGINE: 'Recommendations',
};

export const TRADE_VERDICTS = ['ACCEPT', 'LEAN_ACCEPT', 'EVEN', 'LEAN_DECLINE', 'DECLINE'] as const;
export type TradeVerdict = (typeof TRADE_VERDICTS)[number];

export const START_SIT_VERDICTS = ['STRONG_START', 'LEAN_START', 'COIN_FLIP', 'AVOID'] as const;
export type StartSitVerdict = (typeof START_SIT_VERDICTS)[number];

export const START_SIT_LABEL: Record<StartSitVerdict, string> = {
  STRONG_START: 'Strong Start',
  LEAN_START: 'Lean Start',
  COIN_FLIP: 'Coin Flip',
  AVOID: 'Avoid',
};

export const WAIVER_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'SPECULATIVE'] as const;
export type WaiverPriority = (typeof WAIVER_PRIORITIES)[number];

export type DataSourceTag = 'SEED' | 'ESPN' | 'SLEEPER' | 'CSV' | 'BASELINE' | 'CONSENSUS' | 'MANUAL' | 'MOCK';
