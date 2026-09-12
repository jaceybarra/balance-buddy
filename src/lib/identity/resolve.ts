import { prisma } from '../db';
import { identityKey, normalizeName } from './normalize';
import { canonicalTeamAbbr } from '../seed/nfl-teams';
import type { InjuryStatus, Position } from '../domain/enums';

export interface IncomingPlayer {
  provider: string;
  providerId: string;
  fullName: string;
  position: Position;
  nflTeamAbbr?: string | null;
  injuryStatus?: InjuryStatus | null;
  injuryDetail?: string | null;
  depthChartOrder?: number | null;
  depthChartRole?: string | null;
  eligiblePositions?: Position[];
  age?: number | null;
  jersey?: string | null;
  byeWeek?: number | null;
  /** Extra ids the provider knows about (e.g. Sleeper publishes ESPN ids). */
  crossIds?: { provider: string; providerId: string }[];
}

/**
 * Resolve an incoming player to ONE canonical Player row.
 *
 * Matching order, strongest first:
 *   1. an exact provider-id mapping we have already stored
 *   2. a cross-provider id the source handed us (Sleeper publishes ESPN ids)
 *   3. normalized name + position (suffixes and nicknames collapsed)
 *   4. create a new canonical player
 *
 * Name matching is the LAST resort on purpose — it is the step that creates
 * "Hollywood Brown" / "Marquise Brown" duplicates if you lead with it.
 */
export async function resolvePlayer(incoming: IncomingPlayer): Promise<string> {
  const teamAbbr = canonicalTeamAbbr(incoming.nflTeamAbbr);
  const key = identityKey(incoming.fullName, incoming.position, teamAbbr);

  // 1. direct provider id
  const direct = await prisma.playerProviderId.findUnique({
    where: { provider_providerId: { provider: incoming.provider, providerId: incoming.providerId } },
  });
  if (direct) {
    await updatePlayer(direct.playerId, incoming, teamAbbr, key);
    await linkCrossIds(direct.playerId, incoming);
    return direct.playerId;
  }

  // 2. cross-provider ids supplied by this source
  for (const cross of incoming.crossIds ?? []) {
    const found = await prisma.playerProviderId.findUnique({
      where: { provider_providerId: { provider: cross.provider, providerId: cross.providerId } },
    });
    if (found) {
      await prisma.playerProviderId.upsert({
        where: { provider_providerId: { provider: incoming.provider, providerId: incoming.providerId } },
        create: { playerId: found.playerId, provider: incoming.provider, providerId: incoming.providerId },
        update: { playerId: found.playerId },
      });
      await updatePlayer(found.playerId, incoming, teamAbbr, key);
      return found.playerId;
    }
  }

  // 3. normalized name + position
  const byName = await prisma.player.findFirst({
    where: { normalizedName: key, position: incoming.position },
  });
  if (byName) {
    await prisma.playerProviderId.upsert({
      where: { provider_providerId: { provider: incoming.provider, providerId: incoming.providerId } },
      create: { playerId: byName.id, provider: incoming.provider, providerId: incoming.providerId },
      update: { playerId: byName.id },
    });
    await updatePlayer(byName.id, incoming, teamAbbr, key);
    await linkCrossIds(byName.id, incoming);
    return byName.id;
  }

  // 4. new canonical player
  const created = await prisma.player.create({
    data: {
      fullName: incoming.fullName,
      normalizedName: key,
      position: incoming.position,
      nflTeamAbbr: teamAbbr,
      nflTeamId: teamAbbr ? (await prisma.nFLTeam.findUnique({ where: { abbr: teamAbbr } }))?.id ?? null : null,
      injuryStatus: incoming.injuryStatus ?? 'UNKNOWN',
      injuryDetail: incoming.injuryDetail ?? null,
      depthChartOrder: incoming.depthChartOrder ?? null,
      depthChartRole: incoming.depthChartRole ?? null,
      eligiblePositionsJson: JSON.stringify(incoming.eligiblePositions ?? []),
      isDst: incoming.position === 'DST',
      age: incoming.age ?? null,
      jersey: incoming.jersey ?? null,
      byeWeek: incoming.byeWeek ?? null,
      source: incoming.provider,
      firstName: incoming.fullName.split(' ')[0] ?? null,
      lastName: incoming.fullName.split(' ').slice(1).join(' ') || null,
    },
  });
  await prisma.playerProviderId.create({
    data: { playerId: created.id, provider: incoming.provider, providerId: incoming.providerId },
  });
  await linkCrossIds(created.id, incoming);
  return created.id;
}

async function linkCrossIds(playerId: string, incoming: IncomingPlayer): Promise<void> {
  for (const cross of incoming.crossIds ?? []) {
    await prisma.playerProviderId.upsert({
      where: { provider_providerId: { provider: cross.provider, providerId: cross.providerId } },
      create: { playerId, provider: cross.provider, providerId: cross.providerId },
      update: { playerId },
    });
  }
}

/**
 * Update a canonical player from provider data.
 * Manual edits win: if the user typed it, a sync does not overwrite it.
 */
async function updatePlayer(playerId: string, incoming: IncomingPlayer, teamAbbr: string | null, key: string): Promise<void> {
  const current = await prisma.player.findUnique({ where: { id: playerId } });
  if (!current) return;
  if (current.isManual) return;

  const nflTeamId = teamAbbr ? (await prisma.nFLTeam.findUnique({ where: { abbr: teamAbbr } }))?.id ?? null : current.nflTeamId;

  await prisma.player.update({
    where: { id: playerId },
    data: {
      fullName: incoming.fullName || current.fullName,
      normalizedName: key,
      nflTeamAbbr: teamAbbr ?? current.nflTeamAbbr,
      nflTeamId,
      injuryStatus: incoming.injuryStatus ?? current.injuryStatus,
      injuryDetail: incoming.injuryDetail ?? current.injuryDetail,
      injuryUpdatedAt: incoming.injuryStatus && incoming.injuryStatus !== current.injuryStatus ? new Date() : current.injuryUpdatedAt,
      depthChartOrder: incoming.depthChartOrder ?? current.depthChartOrder,
      depthChartRole: incoming.depthChartRole ?? current.depthChartRole,
      age: incoming.age ?? current.age,
      jersey: incoming.jersey ?? current.jersey,
      byeWeek: incoming.byeWeek ?? current.byeWeek,
      source: incoming.provider,
      eligiblePositionsJson:
        incoming.eligiblePositions && incoming.eligiblePositions.length > 0
          ? JSON.stringify(incoming.eligiblePositions)
          : current.eligiblePositionsJson,
    },
  });
}

/** Look up a canonical player id from any provider id we've seen. */
export async function findPlayerIdByProvider(provider: string, providerId: string): Promise<string | null> {
  const row = await prisma.playerProviderId.findUnique({
    where: { provider_providerId: { provider, providerId } },
  });
  return row?.playerId ?? null;
}

/** Fuzzy name lookup used by CSV import and "Ask My GM". */
export async function findPlayerByName(name: string, position?: Position): Promise<{ id: string; fullName: string } | null> {
  const key = normalizeName(name);
  const rows = await prisma.player.findMany({
    where: { normalizedName: key, ...(position ? { position } : {}) },
    select: { id: true, fullName: true },
    take: 2,
  });
  if (rows.length === 1) return rows[0]!;
  if (rows.length > 1) {
    // Ambiguous (e.g. two players with the same normalized name) — the caller
    // must disambiguate rather than silently pick one.
    return null;
  }
  const contains = await prisma.player.findMany({
    where: { fullName: { contains: name } },
    select: { id: true, fullName: true },
    take: 2,
  });
  return contains.length === 1 ? contains[0]! : null;
}
