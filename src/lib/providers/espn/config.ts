import 'server-only';

/**
 * ESPN credential handling. SERVER ONLY.
 *
 * Nothing in this file may be imported from a client component — the
 * `server-only` import makes that a build error. Values are never logged,
 * never serialized into props, and never written to the database; the database
 * only stores the NAME of the env var (ProviderCredentialRef).
 */

export interface EspnLeagueConfig {
  key: 'league1' | 'league2';
  leagueId: string | null;
  teamId: string | null;
  swid: string | null;
  s2: string | null;
  envVarMap: Record<string, string>;
}

function envOr(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function getEspnConfig(key: 'league1' | 'league2'): EspnLeagueConfig {
  const n = key === 'league1' ? '1' : '2';
  return {
    key,
    leagueId: envOr(`ESPN_LEAGUE_${n}_ID`),
    teamId: envOr(`ESPN_TEAM_${n}_ID`),
    // Per-league cookies win; otherwise the shared pair is used.
    swid: envOr(`ESPN_LEAGUE_${n}_SWID`, 'ESPN_SWID'),
    s2: envOr(`ESPN_LEAGUE_${n}_S2`, 'ESPN_S2'),
    envVarMap: {
      leagueId: `ESPN_LEAGUE_${n}_ID`,
      teamId: `ESPN_TEAM_${n}_ID`,
      swid: `ESPN_LEAGUE_${n}_SWID or ESPN_SWID`,
      s2: `ESPN_LEAGUE_${n}_S2 or ESPN_S2`,
    },
  };
}

/** Safe for the client: booleans only, never the values themselves. */
export interface EspnConfigStatus {
  key: 'league1' | 'league2';
  hasLeagueId: boolean;
  hasTeamId: boolean;
  hasCookies: boolean;
  envVarMap: Record<string, string>;
}

export function getEspnConfigStatus(key: 'league1' | 'league2'): EspnConfigStatus {
  const cfg = getEspnConfig(key);
  return {
    key,
    hasLeagueId: Boolean(cfg.leagueId),
    hasTeamId: Boolean(cfg.teamId),
    hasCookies: Boolean(cfg.swid && cfg.s2),
    envVarMap: cfg.envVarMap,
  };
}

/**
 * Scrubs anything secret out of a string before it can reach a log or the UI.
 * Defense in depth: we also simply never log request headers.
 */
export function redact(message: string): string {
  let out = message;
  for (const name of ['ESPN_SWID', 'ESPN_S2', 'ESPN_LEAGUE_1_SWID', 'ESPN_LEAGUE_1_S2', 'ESPN_LEAGUE_2_SWID', 'ESPN_LEAGUE_2_S2', 'ANTHROPIC_API_KEY']) {
    const value = process.env[name];
    if (value && value.length > 6) out = out.split(value).join('[redacted]');
  }
  return out.replace(/\{[0-9A-Fa-f-]{30,}\}/g, '[redacted-swid]');
}
