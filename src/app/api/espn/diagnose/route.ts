import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EspnProvider } from '@/lib/providers/espn/provider';
import { EspnError } from '@/lib/providers/espn/client';
import { getEspnConfigStatus, redact } from '@/lib/providers/espn/config';
import { loadScoringConfig } from '@/lib/data/scoring';
import { describeRule } from '@/lib/scoring/engine';
import type { ScoringRule } from '@/lib/scoring/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LeagueDiagnosis {
  leagueId: string;
  leagueName: string;
  credentialKey: string;
  configured: { leagueId: boolean; teamId: boolean; cookies: boolean };
  envVars: Record<string, string>;
  reachable: boolean;
  /** Plain-language result of the connection attempt. */
  status: string;
  hint: string | null;
  espn: {
    name: string;
    size: number | null;
    currentWeek: number | null;
    teamCount: number;
    myTeam: string | null;
    myRosterCount: number | null;
  } | null;
  scoring: {
    mapped: number;
    unmapped: { id: string | number; points: number }[];
    differences: string[];
  } | null;
}

/**
 * "Test ESPN connection" — a read-only diagnosis that changes nothing.
 *
 * ESPN's API is undocumented, so the most useful thing the app can do is tell
 * you precisely which step fails and which environment variable fixes it,
 * rather than leaving you with an empty page. It also reports which scoring
 * items we could not map, and how ESPN's settings differ from what is stored.
 */
export async function POST() {
  const leagues = await prisma.league.findMany({ orderBy: { createdAt: 'asc' } });
  const results: LeagueDiagnosis[] = [];

  for (const league of leagues) {
    const key = (league.credentialRefKey as 'league1' | 'league2' | null) ?? 'league1';
    const configStatus = getEspnConfigStatus(key);
    const provider = new EspnProvider(key, league.season);

    const diagnosis: LeagueDiagnosis = {
      leagueId: league.id,
      leagueName: league.name,
      credentialKey: key,
      configured: {
        leagueId: configStatus.hasLeagueId,
        teamId: configStatus.hasTeamId,
        cookies: configStatus.hasCookies,
      },
      envVars: configStatus.envVarMap,
      reachable: false,
      status: '',
      hint: null,
      espn: null,
      scoring: null,
    };

    if (!configStatus.hasLeagueId) {
      diagnosis.status = `No league id configured. Set ${configStatus.envVarMap.leagueId} in .env and restart.`;
      diagnosis.hint = 'The id is the leagueId in your ESPN team URL.';
      results.push(diagnosis);
      continue;
    }

    try {
      const [leagueRes, teamsRes] = await Promise.all([provider.getLeague(), provider.getTeams()]);
      diagnosis.reachable = true;

      const myTeamId = process.env[key === 'league1' ? 'ESPN_TEAM_1_ID' : 'ESPN_TEAM_2_ID'] ?? null;
      const myTeam = myTeamId ? teamsRes.data.find((t) => t.providerTeamId === myTeamId) ?? null : null;

      let myRosterCount: number | null = null;
      if (myTeam) {
        try {
          const roster = await provider.getRoster(myTeam.providerTeamId);
          myRosterCount = roster.data.length;
        } catch {
          myRosterCount = null;
        }
      }

      diagnosis.espn = {
        name: leagueRes.data.name,
        size: leagueRes.data.size,
        currentWeek: leagueRes.data.currentWeek,
        teamCount: teamsRes.data.length,
        myTeam: myTeam?.name ?? null,
        myRosterCount,
      };

      diagnosis.status = myTeam
        ? `Connected. Found "${leagueRes.data.name}" (${leagueRes.data.size ?? teamsRes.data.length} teams) and your team "${myTeam.name}"${
            myRosterCount !== null ? ` with ${myRosterCount} roster spots` : ''
          }.`
        : `Connected to "${leagueRes.data.name}", but no team matches ${configStatus.envVarMap.teamId}${
            myTeamId ? ` (= ${myTeamId})` : ' (not set)'
          }. Teams in this league: ${teamsRes.data.map((t) => `${t.providerTeamId}:${t.name}`).join(', ')}.`;
      if (!myTeam) diagnosis.hint = 'Set the team id to the number next to your team name above.';

      // Scoring import: what we could map, and how it differs from what's stored.
      try {
        const scoring = await provider.getScoringSettings();
        const stored = await loadScoringConfig(league.id);
        diagnosis.scoring = {
          mapped: scoring.data.rules.length,
          unmapped: scoring.data.unmapped.map((u) => ({ id: u.id, points: u.points })),
          differences: diffRules(scoring.data.rules, stored.rules),
        };
      } catch (err) {
        diagnosis.scoring = {
          mapped: 0,
          unmapped: [],
          differences: [`Could not read scoring settings: ${redact(err instanceof Error ? err.message : 'unknown error')}`],
        };
      }
    } catch (err) {
      if (err instanceof EspnError) {
        diagnosis.status = err.message;
        diagnosis.hint = err.hint;
      } else {
        diagnosis.status = redact(err instanceof Error ? err.message : 'Unknown failure contacting ESPN');
        diagnosis.hint = 'Check your network connection.';
      }
    }

    results.push(diagnosis);
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), leagues: results });
}

/** Human-readable differences between ESPN's rules and the ones in the database. */
function diffRules(incoming: ScoringRule[], stored: ScoringRule[]): string[] {
  const keyOf = (r: ScoringRule) =>
    `${r.kind}:${r.statKey}:${'rangeMin' in r ? r.rangeMin : ''}:${'rangeMax' in r ? r.rangeMax : ''}`;
  const storedMap = new Map(stored.map((r) => [keyOf(r), r]));
  const out: string[] = [];

  for (const rule of incoming) {
    const match = storedMap.get(keyOf(rule));
    if (!match) out.push(`ESPN has a rule we do not: ${describeRule(rule)}`);
    else if (match.points !== rule.points) {
      out.push(`${describeRule(rule)} — ESPN says ${rule.points}, stored value is ${match.points}`);
    }
  }

  const incomingKeys = new Set(incoming.map(keyOf));
  for (const rule of stored) {
    if (!incomingKeys.has(keyOf(rule))) out.push(`Stored rule ESPN did not return: ${describeRule(rule)}`);
  }
  return out.slice(0, 40);
}
