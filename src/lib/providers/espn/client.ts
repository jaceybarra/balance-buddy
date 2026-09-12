import 'server-only';
import { getEspnConfig, redact, type EspnLeagueConfig } from './config';

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
const TIMEOUT_MS = 12_000;

export class EspnError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly hint: string,
  ) {
    super(redact(message));
    this.name = 'EspnError';
  }
}

/**
 * The ONLY place that talks to ESPN over the wire.
 *
 * ESPN's fantasy endpoints are unofficial: they change without notice, rate
 * limit aggressively, and return HTML on auth failures. Every failure is
 * translated into an EspnError with a human hint, and callers are expected to
 * degrade to stored/manual data rather than surfacing an exception.
 */
export async function espnFetch<T>(
  cfg: EspnLeagueConfig,
  path: string,
  options: { views?: string[]; filter?: unknown; season?: number } = {},
): Promise<T> {
  if (!cfg.leagueId) {
    throw new EspnError('ESPN league id is not configured', null, `Set ${cfg.envVarMap.leagueId} in .env.local`);
  }

  const season = options.season ?? Number(process.env.SEASON ?? new Date().getUTCFullYear());
  const url = new URL(`${BASE}/seasons/${season}/segments/0/leagues/${cfg.leagueId}${path}`);
  for (const view of options.views ?? []) url.searchParams.append('view', view);

  const headers: Record<string, string> = {
    accept: 'application/json',
    // ESPN rejects requests without a browser-ish UA.
    'user-agent': 'Mozilla/5.0 (compatible; FantasyGM/1.0; personal use)',
  };
  if (cfg.swid && cfg.s2) {
    // Cookie header is built here and nowhere else. Never logged.
    headers.cookie = `SWID=${cfg.swid}; espn_s2=${cfg.s2}`;
  }
  if (options.filter) headers['x-fantasy-filter'] = JSON.stringify(options.filter);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { headers, signal: controller.signal, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) {
      // Distinguish "you never gave us credentials" from "the ones you gave
      // were refused" — they need different fixes, and guessing wrong sends
      // people hunting for a cookie problem they do not have.
      const hadCookies = Boolean(cfg.swid && cfg.s2);
      throw new EspnError(
        hadCookies
          ? 'ESPN rejected your credentials'
          : 'ESPN refused the request and no credentials were sent',
        res.status,
        hadCookies
          ? `Your cookies were refused. Sign in to fantasy.espn.com again and re-copy ${cfg.envVarMap.swid} and ${cfg.envVarMap.s2} — they expire every few weeks. (A proxy or VPN between you and ESPN can also return ${res.status}.)`
          : `This league is private, so it needs cookies. Set ${cfg.envVarMap.swid} and ${cfg.envVarMap.s2}, then restart. See README "Cookies (private leagues only)".`,
      );
    }
    if (res.status === 404) {
      throw new EspnError('ESPN league not found', 404, `Check ${cfg.envVarMap.leagueId} — is the season correct?`);
    }
    if (!res.ok) {
      throw new EspnError(`ESPN returned HTTP ${res.status}`, res.status, 'ESPN may be rate limiting; try again in a minute.');
    }
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      throw new EspnError('ESPN returned HTML instead of JSON', res.status, 'This usually means the cookies are invalid.');
    }
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof EspnError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EspnError('ESPN request timed out', null, 'ESPN was slow to respond. The app is serving stored data.');
    }
    throw new EspnError(err instanceof Error ? err.message : 'Unknown ESPN failure', null, 'Network error contacting ESPN.');
  } finally {
    clearTimeout(timer);
  }
}

export function espnConfigFor(key: 'league1' | 'league2') {
  return getEspnConfig(key);
}
