import 'server-only';
import { EspnError, espnConfigFor, espnFetch } from './client';
import { redact, type EspnLeagueConfig } from './config';
import {
  ESPN_INJURY_MAP,
  ESPN_POINTS_ALLOWED_TIERS,
  ESPN_POSITION_MAP,
  ESPN_SLOT_MAP,
  ESPN_STAT_MAP,
  ESPN_YARDS_ALLOWED_TIERS,
} from './scoring-map';
import type {
  FantasyProvider,
  ProviderFreeAgent,
  ProviderLeague,
  ProviderMatchup,
  ProviderResult,
  ProviderRosterEntry,
  ProviderScoringSettings,
  ProviderTeam,
  ProviderTransaction,
  ProviderPlayerRef,
} from '../types';
import type { InjuryStatus, Position, RosterSlot } from '../../domain/enums';
import { canonicalTeamAbbr, NFL_TEAMS } from '../../seed/nfl-teams';
import type { ScoringRule } from '../../scoring/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ESPN_TEAM_BY_ID: Record<number, string> = (() => {
  // ESPN proTeamIds. Index 0 is "free agent".
  const order = [
    '', 'ATL', 'BUF', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'TEN', 'IND', 'KC', 'LV', 'LAR', 'MIA',
    'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'ARI', 'PIT', 'LAC', 'SF', 'SEA', 'TB', 'WSH', 'CAR', 'JAX', 'BAL', 'HOU',
  ];
  const map: Record<number, string> = {};
  order.forEach((abbr, idx) => {
    if (abbr) map[idx] = abbr;
  });
  return map;
})();

function result<T>(data: T, degraded = false, warning?: string): ProviderResult<T> {
  return { data, source: 'ESPN', fetchedAt: new Date(), degraded, warning };
}

/**
 * ESPN Fantasy adapter.
 *
 * Every ESPN-shaped field is normalized here; nothing outside this folder knows
 * about proTeamId, lineupSlotId or scoringItems.
 */
export class EspnProvider implements FantasyProvider {
  readonly name = 'ESPN';
  private cfg: EspnLeagueConfig;
  private season: number;

  constructor(key: 'league1' | 'league2', season: number) {
    this.cfg = espnConfigFor(key);
    this.season = season;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.leagueId);
  }

  get missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.leagueId) missing.push(this.cfg.envVarMap.leagueId!);
    if (!this.cfg.swid || !this.cfg.s2) missing.push(`${this.cfg.envVarMap.swid} / ${this.cfg.envVarMap.s2} (private leagues only)`);
    return missing;
  }

  private async raw<T>(views: string[], filter?: unknown, path = ''): Promise<T> {
    return espnFetch<T>(this.cfg, path, { views, filter, season: this.season });
  }

  async getLeague(): Promise<ProviderResult<ProviderLeague>> {
    const json: any = await this.raw(['mSettings']);
    const settings = json?.settings ?? {};
    const roster = settings?.rosterSettings?.lineupSlotCounts ?? {};
    const positionLimits = settings?.rosterSettings?.positionLimits ?? {};

    const rosterSlots: ProviderLeague['rosterSlots'] = [];
    for (const [slotIdRaw, countRaw] of Object.entries(roster)) {
      const slotId = Number(slotIdRaw);
      const count = Number(countRaw);
      const slot = ESPN_SLOT_MAP[slotId] as RosterSlot | undefined;
      if (!slot || count <= 0) continue;
      const posId = Object.entries(ESPN_POSITION_MAP).find(([, p]) => p === slot)?.[0];
      rosterSlots.push({
        slot,
        starters: slot === 'BENCH' || slot === 'IR' ? 0 : count,
        maxAtPosition: posId ? (positionLimits?.[posId] ?? null) : null,
      });
    }

    return result({
      providerLeagueId: String(this.cfg.leagueId),
      name: settings?.name ?? 'ESPN League',
      season: json?.seasonId ?? this.season,
      // ESPN reports size directly; this is how League 2's unknown size resolves.
      size: settings?.size ?? json?.teams?.length ?? null,
      format: settings?.scoringSettings?.scoringType ?? 'H2H_POINTS',
      regularSeasonWeeks: settings?.scheduleSettings?.matchupPeriodCount ?? null,
      playoffStartWeek: settings?.scheduleSettings?.playoffMatchupPeriodLength
        ? (settings?.scheduleSettings?.matchupPeriodCount ?? 14) + 1
        : null,
      currentWeek: json?.scoringPeriodId ?? null,
      rosterSlots,
    });
  }

  async getTeams(): Promise<ProviderResult<ProviderTeam[]>> {
    const json: any = await this.raw(['mTeam']);
    const members: any[] = json?.members ?? [];
    const teams: ProviderTeam[] = (json?.teams ?? []).map((t: any) => {
      const owner = members.find((m) => (t.owners ?? []).includes(m.id));
      const record = t?.record?.overall ?? {};
      return {
        providerTeamId: String(t.id),
        name: t.name ?? [t.location, t.nickname].filter(Boolean).join(' ') ?? `Team ${t.id}`,
        abbrev: t.abbrev ?? null,
        ownerName: owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || null : null,
        wins: record.wins ?? 0,
        losses: record.losses ?? 0,
        ties: record.ties ?? 0,
        pointsFor: record.pointsFor ?? 0,
        pointsAgainst: record.pointsAgainst ?? 0,
        standing: t.playoffSeed ?? null,
        logoUrl: t.logo ?? null,
      };
    });
    return result(teams);
  }

  async getRoster(providerTeamId: string, week?: number): Promise<ProviderResult<ProviderRosterEntry[]>> {
    const json: any = await this.raw(['mRoster']);
    const team = (json?.teams ?? []).find((t: any) => String(t.id) === String(providerTeamId));
    const entries: ProviderRosterEntry[] = (team?.roster?.entries ?? []).map((e: any) => ({
      player: mapPlayer(e?.playerPoolEntry?.player ?? e?.player ?? {}),
      slot: (ESPN_SLOT_MAP[e?.lineupSlotId] ?? 'BENCH') as RosterSlot,
      acquisitionType: e?.acquisitionType ?? null,
    }));
    void week;
    return result(entries);
  }

  async getMatchup(week: number): Promise<ProviderResult<ProviderMatchup[]>> {
    const json: any = await this.raw(['mMatchupScore', 'mMatchup']);
    const all: ProviderMatchup[] = (json?.schedule ?? [])
      .filter((m: any) => m.matchupPeriodId === week)
      .map(mapMatchup);
    return result(all);
  }

  async getSchedule(): Promise<ProviderResult<ProviderMatchup[]>> {
    const json: any = await this.raw(['mMatchup']);
    return result((json?.schedule ?? []).map(mapMatchup));
  }

  async getFreeAgents(week: number, limit = 120): Promise<ProviderResult<ProviderFreeAgent[]>> {
    // ESPN needs an x-fantasy-filter header to page the player pool.
    const filter = {
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        filterSlotIds: { value: [0, 2, 4, 6, 16, 17, 23] },
        limit,
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
      },
    };
    const json: any = await this.raw(['kona_player_info'], filter, `?scoringPeriodId=${week}`);
    const players: ProviderFreeAgent[] = (json?.players ?? []).map((p: any) => {
      const base = mapPlayer(p?.player ?? {});
      return {
        ...base,
        availability: p?.status === 'WAIVERS' ? ('WAIVERS' as const) : ('FREE_AGENT' as const),
        waiverClearsAt: p?.player?.waiverProcessDate ? new Date(p.player.waiverProcessDate) : null,
        trendingAdds: null,
      };
    });
    return result(players);
  }

  async getTransactions(week?: number): Promise<ProviderResult<ProviderTransaction[]>> {
    const json: any = await this.raw(['mTransactions2']);
    const items: ProviderTransaction[] = (json?.transactions ?? [])
      .filter((t: any) => (week ? t.scoringPeriodId === week : true))
      .map((t: any) => ({
        providerTransactionId: String(t.id),
        type: mapTransactionType(t.type),
        providerTeamId: t.teamId != null ? String(t.teamId) : null,
        providerPlayerId: t?.items?.[0]?.playerId != null ? String(t.items[0].playerId) : null,
        week: t.scoringPeriodId ?? null,
        bid: t.bidAmount ?? null,
        processedAt: new Date(t.proposedDate ?? Date.now()),
        detail: t.type ?? null,
      }));
    return result(items);
  }

  /**
   * Import the league's ACTUAL scoring settings.
   * Anything we cannot map with confidence is returned in `unmapped` and shown
   * in Settings rather than being applied — we never invent a rule.
   */
  async getScoringSettings(): Promise<ProviderResult<ProviderScoringSettings>> {
    const json: any = await this.raw(['mSettings']);
    const items: any[] = json?.settings?.scoringSettings?.scoringItems ?? [];
    const rules: ScoringRule[] = [];
    const unmapped: ProviderScoringSettings['unmapped'] = [];
    let ppr: number | null = null;

    for (const item of items) {
      const id = Number(item.statId);
      const points = Number(item.points ?? 0);
      const statKey = ESPN_STAT_MAP[id];
      if (statKey) {
        if (statKey === 'rec') ppr = points;
        rules.push({ kind: 'PER_UNIT', statKey, points, category: categoryFor(statKey) });
        continue;
      }
      const paTier = ESPN_POINTS_ALLOWED_TIERS[id];
      if (paTier) {
        rules.push({ kind: 'TIER', statKey: 'pointsAllowed', points, rangeMin: paTier.min, rangeMax: paTier.max, category: 'DST' });
        continue;
      }
      const yaTier = ESPN_YARDS_ALLOWED_TIERS[id];
      if (yaTier) {
        rules.push({ kind: 'TIER', statKey: 'yardsAllowed', points, rangeMin: yaTier.min, rangeMax: yaTier.max, category: 'DST' });
        continue;
      }
      unmapped.push({ id, points, note: 'Unrecognized ESPN statId — confirm manually in Settings.' });
    }

    // ESPN expresses yardage bonuses as separate scoringItems with a
    // pointsOverrides range; when present they arrive as unmapped ids, which is
    // exactly why unmapped items are surfaced instead of dropped.
    return result({ rules, unmapped, ppr });
  }
}

function categoryFor(statKey: string): 'OFFENSE' | 'KICKING' | 'DST' {
  if (statKey.startsWith('fg') || statKey.startsWith('pat')) return 'KICKING';
  if (
    ['sacks', 'defInt', 'fumRec', 'safety', 'onePtSafety', 'blockedKick', 'intReturnTD', 'fumbleReturnTD', 'blockedKickReturnTD', 'twoPtReturn', 'pointsAllowed', 'yardsAllowed'].includes(
      statKey,
    )
  ) {
    return 'DST';
  }
  return 'OFFENSE';
}

function mapPlayer(p: any): ProviderPlayerRef {
  const positionId = p?.defaultPositionId;
  const position = (ESPN_POSITION_MAP[positionId] ?? null) as Position | null;
  const eligible = (p?.eligibleSlots ?? [])
    .map((slotId: number) => ESPN_SLOT_MAP[slotId])
    .filter((s: string | undefined): s is string => Boolean(s) && !['BENCH', 'IR', 'FLEX'].includes(s!))
    .filter((s: string) => s !== position) as Position[];

  const abbrFromId = ESPN_TEAM_BY_ID[p?.proTeamId ?? 0] ?? null;
  const nflTeamAbbr = canonicalTeamAbbr(abbrFromId);

  return {
    providerPlayerId: String(p?.id ?? ''),
    fullName: p?.fullName ?? [p?.firstName, p?.lastName].filter(Boolean).join(' '),
    position,
    eligiblePositions: Array.from(new Set(eligible)),
    nflTeamAbbr,
    injuryStatus: (ESPN_INJURY_MAP[String(p?.injuryStatus ?? '').toUpperCase()] ?? null) as InjuryStatus | null,
    injuryDetail: p?.injuryStatus ?? null,
    percentOwned: p?.ownership?.percentOwned ?? null,
    percentStarted: p?.ownership?.percentStarted ?? null,
    byeWeek: NFL_TEAMS.find((t) => t.abbr === nflTeamAbbr)?.byeWeek ?? null,
  };
}

function mapMatchup(m: any): ProviderMatchup {
  return {
    week: m.matchupPeriodId,
    homeProviderTeamId: String(m?.home?.teamId ?? ''),
    awayProviderTeamId: m?.away?.teamId != null ? String(m.away.teamId) : null,
    homeScore: m?.home?.totalPoints ?? 0,
    awayScore: m?.away?.totalPoints ?? 0,
    homeProjected: m?.home?.totalProjectedPointsLive ?? null,
    awayProjected: m?.away?.totalProjectedPointsLive ?? null,
    isPlayoff: Boolean(m?.playoffTierType && m.playoffTierType !== 'NONE'),
  };
}

function mapTransactionType(raw: string): ProviderTransaction['type'] {
  switch (raw) {
    case 'WAIVER':
      return 'WAIVER_CLAIM';
    case 'TRADE_ACCEPT':
      return 'TRADE';
    case 'ROSTER':
      return 'LINEUP';
    case 'DROP':
      return 'DROP';
    default:
      return 'ADD';
  }
}

export { EspnError, redact };
