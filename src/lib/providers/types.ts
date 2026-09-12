import type { InjuryStatus, Position, RosterSlot } from '../domain/enums';
import type { StatLine } from '../scoring/stats';
import type { ScoringRule } from '../scoring/types';

/** Every provider call returns its own provenance so the UI can show freshness. */
export interface ProviderResult<T> {
  data: T;
  source: string;
  fetchedAt: Date;
  /** True when we fell back (e.g. ESPN failed and we served cached/manual data). */
  degraded: boolean;
  warning?: string;
}

export interface ProviderLeague {
  providerLeagueId: string;
  name: string;
  season: number;
  size: number | null;
  format: string;
  regularSeasonWeeks: number | null;
  playoffStartWeek: number | null;
  currentWeek: number | null;
  rosterSlots: { slot: RosterSlot; starters: number; maxAtPosition: number | null }[];
}

export interface ProviderTeam {
  providerTeamId: string;
  name: string;
  abbrev: string | null;
  ownerName: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  standing: number | null;
  logoUrl: string | null;
}

export interface ProviderPlayerRef {
  providerPlayerId: string;
  fullName: string;
  position: Position | null;
  eligiblePositions: Position[];
  nflTeamAbbr: string | null;
  injuryStatus: InjuryStatus | null;
  injuryDetail?: string | null;
  percentOwned?: number | null;
  percentStarted?: number | null;
  byeWeek?: number | null;
}

export interface ProviderRosterEntry {
  player: ProviderPlayerRef;
  slot: RosterSlot;
  acquisitionType?: string | null;
}

export interface ProviderMatchup {
  week: number;
  homeProviderTeamId: string;
  awayProviderTeamId: string | null;
  homeScore: number;
  awayScore: number;
  homeProjected: number | null;
  awayProjected: number | null;
  isPlayoff: boolean;
}

export interface ProviderFreeAgent extends ProviderPlayerRef {
  availability: 'FREE_AGENT' | 'WAIVERS';
  waiverClearsAt: Date | null;
  trendingAdds?: number | null;
}

export interface ProviderTransaction {
  providerTransactionId: string;
  type: 'ADD' | 'DROP' | 'TRADE' | 'LINEUP' | 'WAIVER_CLAIM';
  providerTeamId: string | null;
  providerPlayerId: string | null;
  week: number | null;
  bid: number | null;
  processedAt: Date;
  detail: string | null;
}

export interface ProviderScoringSettings {
  rules: ScoringRule[];
  /** Items the provider sent that we could not confidently map — never guessed. */
  unmapped: { id: string | number; points: number; note: string }[];
  ppr: number | null;
}

/**
 * The contract every fantasy platform adapter implements.
 * ESPN-specific quirks live ONLY inside its implementation.
 */
export interface FantasyProvider {
  readonly name: string;
  /** False when credentials/ids are missing — callers fall back to manual data. */
  isConfigured(): boolean;
  getLeague(): Promise<ProviderResult<ProviderLeague>>;
  getTeams(): Promise<ProviderResult<ProviderTeam[]>>;
  getRoster(providerTeamId: string, week?: number): Promise<ProviderResult<ProviderRosterEntry[]>>;
  getMatchup(week: number): Promise<ProviderResult<ProviderMatchup[]>>;
  getSchedule(): Promise<ProviderResult<ProviderMatchup[]>>;
  getFreeAgents(week: number, limit?: number): Promise<ProviderResult<ProviderFreeAgent[]>>;
  getTransactions(week?: number): Promise<ProviderResult<ProviderTransaction[]>>;
  getScoringSettings(): Promise<ProviderResult<ProviderScoringSettings>>;
}

// --------------------------------------------------------------------------
// NFL data (identity, schedule, injuries, news) — independent of the league host
// --------------------------------------------------------------------------

export interface NflPlayerRecord {
  providerPlayerId: string;
  fullName: string;
  position: Position | null;
  nflTeamAbbr: string | null;
  injuryStatus: InjuryStatus | null;
  injuryDetail: string | null;
  depthChartOrder: number | null;
  depthChartRole: string | null;
  age: number | null;
  jersey: string | null;
  espnId?: string | null;
  yahooId?: string | null;
}

export interface NflGameRecord {
  providerGameId: string;
  season: number;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  kickoff: Date;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL' | 'POSTPONED' | 'CANCELED';
  homeScore: number | null;
  awayScore: number | null;
  spread: number | null;
  overUnder: number | null;
  isInternational: boolean;
}

export interface NflNewsItem {
  externalId: string;
  providerPlayerId: string | null;
  headline: string;
  body: string | null;
  url: string | null;
  publishedAt: Date;
  category: 'INJURY' | 'DEPTH_CHART' | 'TRANSACTION' | 'PRACTICE' | 'GAME_STATUS' | 'GENERAL';
}

export interface NflDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Current season + week straight from the data source, never hardcoded. */
  getState(): Promise<ProviderResult<{ season: number; week: number; seasonType: string }>>;
  getPlayers(): Promise<ProviderResult<NflPlayerRecord[]>>;
  getSchedule(season: number): Promise<ProviderResult<NflGameRecord[]>>;
  getInjuries(): Promise<ProviderResult<NflPlayerRecord[]>>;
  getNews(): Promise<ProviderResult<NflNewsItem[]>>;
  /** Ownership/trend signals, keyed by provider player id. */
  getTrending(): Promise<ProviderResult<{ providerPlayerId: string; adds: number }[]>>;
}

// --------------------------------------------------------------------------
// Projections
// --------------------------------------------------------------------------

export interface ProjectionRecord {
  /** Canonical player id once resolved; providers key on their own id first. */
  providerPlayerId: string | null;
  playerId: string | null;
  season: number;
  /** null = rest of season */
  week: number | null;
  statLine: StatLine;
  floorStatLine?: StatLine;
  ceilingStatLine?: StatLine;
  providerPoints?: number | null;
  confidence: number;
}

export interface ProjectionProvider {
  readonly name: string;
  isConfigured(): boolean;
  getWeeklyProjections(season: number, week: number): Promise<ProviderResult<ProjectionRecord[]>>;
  getRosProjections(season: number, fromWeek: number): Promise<ProviderResult<ProjectionRecord[]>>;
}
