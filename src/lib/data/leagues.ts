import { prisma } from '../db';
import { buildLeagueContext, type LeagueContext } from './context';

export interface LeagueOption {
  id: string;
  name: string;
  teamId: string;
}

/** The league tabs shown on every league-scoped page. */
export async function getLeagueOptions(): Promise<LeagueOption[]> {
  const leagues = await prisma.league.findMany({
    orderBy: { createdAt: 'asc' },
    include: { teams: { where: { isMine: true }, select: { id: true } } },
  });
  return leagues.map((l) => ({ id: l.id, name: l.name, teamId: l.teams[0]?.id ?? '' }));
}

/** Resolve the ?league= param, defaulting to the first league. */
export async function resolveLeague(requested?: string): Promise<{ options: LeagueOption[]; ctx: LeagueContext }> {
  const options = await getLeagueOptions();
  const id = options.find((o) => o.id === requested)?.id ?? options[0]?.id;
  if (!id) throw new Error('No leagues configured. Run `npm run db:seed`.');
  return { options, ctx: await buildLeagueContext(id) };
}

export async function getAllContexts(): Promise<LeagueContext[]> {
  const options = await getLeagueOptions();
  const contexts: LeagueContext[] = [];
  for (const option of options) {
    try {
      contexts.push(await buildLeagueContext(option.id));
    } catch {
      /* skipped — surfaced through freshness warnings */
    }
  }
  return contexts;
}
