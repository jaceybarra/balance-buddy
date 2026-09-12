import type {
  NflDataProvider,
  NflGameRecord,
  NflNewsItem,
  NflPlayerRecord,
  ProviderResult,
} from '../types';
import type { InjuryStatus, Position } from '../../domain/enums';
import { canonicalPosition } from '../../identity/normalize';
import { canonicalTeamAbbr } from '../../seed/nfl-teams';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = 'https://api.sleeper.app/v1';
const TIMEOUT_MS = 20_000;

const SLEEPER_INJURY_MAP: Record<string, InjuryStatus> = {
  Questionable: 'QUESTIONABLE',
  Doubtful: 'DOUBTFUL',
  Out: 'OUT',
  IR: 'IR',
  'Injured Reserve': 'IR',
  PUP: 'PUP',
  NA: 'OUT',
  Sus: 'SUSPENDED',
  Suspended: 'SUSPENDED',
  COV: 'OUT',
};

/**
 * Sleeper's public read-only NFL endpoints. No key required, generous terms,
 * and the best free source of canonical player identity + cross-provider ids
 * (it publishes each player's ESPN and Yahoo id, which is what makes identity
 * resolution reliable).
 *
 * Sleeper does NOT publish a schedule or news feed, so those methods report
 * "unsupported" and the caller falls back to the seeded schedule and to
 * injury-change derived news.
 */
export class SleeperNflProvider implements NflDataProvider {
  readonly name = 'SLEEPER';

  isConfigured(): boolean {
    return process.env.SLEEPER_ENABLED !== '0' && process.env.NFL_PROVIDER !== 'mock';
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json', 'user-agent': 'FantasyGM/1.0 (personal use)' },
      });
      if (!res.ok) throw new Error(`Sleeper HTTP ${res.status} for ${path}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async getState(): Promise<ProviderResult<{ season: number; week: number; seasonType: string }>> {
    const json: any = await this.get('/state/nfl');
    return {
      data: {
        season: Number(json?.season ?? new Date().getUTCFullYear()),
        // During the offseason Sleeper reports week 0 — treat that as week 1.
        week: Math.max(1, Number(json?.week ?? 1)),
        seasonType: String(json?.season_type ?? 'regular'),
      },
      source: 'SLEEPER',
      fetchedAt: new Date(),
      degraded: false,
    };
  }

  async getPlayers(): Promise<ProviderResult<NflPlayerRecord[]>> {
    // ~5MB payload; called at most once a day by the sync scheduler.
    const json: any = await this.get('/players/nfl');
    const records: NflPlayerRecord[] = [];
    for (const [id, raw] of Object.entries<any>(json ?? {})) {
      const position = canonicalPosition(raw?.position) as Position | null;
      if (!position) continue;
      if (raw?.active === false && !raw?.injury_status) continue;
      records.push({
        providerPlayerId: id,
        fullName: raw?.full_name ?? [raw?.first_name, raw?.last_name].filter(Boolean).join(' '),
        position,
        nflTeamAbbr: canonicalTeamAbbr(raw?.team),
        injuryStatus: raw?.injury_status ? (SLEEPER_INJURY_MAP[raw.injury_status] ?? 'QUESTIONABLE') : null,
        injuryDetail: raw?.injury_body_part ?? raw?.injury_notes ?? null,
        depthChartOrder: raw?.depth_chart_order ?? null,
        depthChartRole: raw?.depth_chart_position ?? null,
        age: raw?.age ?? null,
        jersey: raw?.number != null ? String(raw.number) : null,
        espnId: raw?.espn_id != null ? String(raw.espn_id) : null,
        yahooId: raw?.yahoo_id != null ? String(raw.yahoo_id) : null,
      });
    }
    return { data: records, source: 'SLEEPER', fetchedAt: new Date(), degraded: false };
  }

  async getInjuries(): Promise<ProviderResult<NflPlayerRecord[]>> {
    const all = await this.getPlayers();
    return { ...all, data: all.data.filter((p) => p.injuryStatus !== null) };
  }

  async getSchedule(season: number): Promise<ProviderResult<NflGameRecord[]>> {
    void season;
    // Sleeper has no public schedule endpoint. Declared unsupported rather than
    // scraped — the caller keeps the seeded/imported schedule.
    return {
      data: [],
      source: 'SLEEPER',
      fetchedAt: new Date(),
      degraded: true,
      warning: 'Sleeper publishes no schedule endpoint; existing schedule data was kept.',
    };
  }

  async getNews(): Promise<ProviderResult<NflNewsItem[]>> {
    return {
      data: [],
      source: 'SLEEPER',
      fetchedAt: new Date(),
      degraded: true,
      warning: 'No licensed news feed configured; news is derived from injury and depth-chart changes.',
    };
  }

  async getTrending(): Promise<ProviderResult<{ providerPlayerId: string; adds: number }[]>> {
    const json: any = await this.get('/players/nfl/trending/add?lookback_hours=48&limit=100');
    return {
      data: (json ?? []).map((row: any) => ({ providerPlayerId: String(row.player_id), adds: Number(row.count ?? 0) })),
      source: 'SLEEPER',
      fetchedAt: new Date(),
      degraded: false,
    };
  }
}
