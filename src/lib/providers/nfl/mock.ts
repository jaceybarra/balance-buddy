import type { NflDataProvider, NflGameRecord, NflNewsItem, NflPlayerRecord, ProviderResult } from '../types';
import { buildSeedSchedule, SEASON } from '../../seed/schedule';
import { FREE_AGENT_POOL, GIBBS_ROSTER, SGIH_ROSTER } from '../../seed/players';

/**
 * Offline NFL data provider built from the seed files.
 *
 * Keeps the whole app functional with no network access at all — used for
 * tests, for `NFL_PROVIDER=mock`, and automatically whenever the live provider
 * fails so a sync degrades instead of erroring out.
 */
export class MockNflProvider implements NflDataProvider {
  readonly name = 'MOCK';

  isConfigured(): boolean {
    return true;
  }

  async getState(): Promise<ProviderResult<{ season: number; week: number; seasonType: string }>> {
    // The mock deliberately reports NO state so the app derives the week from
    // the schedule table rather than trusting a made-up number.
    return {
      data: { season: SEASON, week: 0, seasonType: 'regular' },
      source: 'MOCK',
      fetchedAt: new Date(),
      degraded: true,
      warning: 'Mock provider does not report a live week; the week is derived from the schedule.',
    };
  }

  async getPlayers(): Promise<ProviderResult<NflPlayerRecord[]>> {
    const seeds = [...GIBBS_ROSTER.map((r) => r.player), ...SGIH_ROSTER.map((r) => r.player), ...FREE_AGENT_POOL];
    const data: NflPlayerRecord[] = seeds.map((p, idx) => ({
      providerPlayerId: `mock-${idx}`,
      fullName: p.name,
      position: p.position,
      nflTeamAbbr: p.team,
      injuryStatus: p.injuryStatus ?? null,
      injuryDetail: p.injuryDetail ?? null,
      depthChartOrder: p.depthChartOrder ?? null,
      depthChartRole: p.depthChartRole ?? null,
      age: null,
      jersey: null,
    }));
    return { data, source: 'MOCK', fetchedAt: new Date(), degraded: true };
  }

  async getInjuries(): Promise<ProviderResult<NflPlayerRecord[]>> {
    const all = await this.getPlayers();
    return { ...all, data: all.data.filter((p) => p.injuryStatus) };
  }

  async getSchedule(season: number): Promise<ProviderResult<NflGameRecord[]>> {
    const games = buildSeedSchedule(season).map<NflGameRecord>((g) => ({
      providerGameId: `${season}-${g.week}-${g.awayAbbr}@${g.homeAbbr}`,
      season: g.season,
      week: g.week,
      homeAbbr: g.homeAbbr,
      awayAbbr: g.awayAbbr,
      kickoff: g.kickoff,
      status: 'SCHEDULED',
      homeScore: null,
      awayScore: null,
      spread: g.spread,
      overUnder: g.overUnder,
      isInternational: g.isInternational,
    }));
    return { data: games, source: 'MOCK', fetchedAt: new Date(), degraded: true };
  }

  async getNews(): Promise<ProviderResult<NflNewsItem[]>> {
    return { data: [], source: 'MOCK', fetchedAt: new Date(), degraded: true };
  }

  async getTrending(): Promise<ProviderResult<{ providerPlayerId: string; adds: number }[]>> {
    const data = FREE_AGENT_POOL.filter((p) => p.trendingAdds).map((p, idx) => ({
      providerPlayerId: `mock-fa-${idx}`,
      adds: p.trendingAdds ?? 0,
    }));
    return { data, source: 'MOCK', fetchedAt: new Date(), degraded: true };
  }
}
