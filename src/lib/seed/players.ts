import type { Archetype } from './archetypes';
import type { InjuryStatus, Position } from '../domain/enums';

export interface SeedPlayer {
  name: string;
  position: Position;
  /** Canonical NFL abbreviation, or null when the seed genuinely doesn't know. */
  team: string | null;
  archetype: Archetype;
  injuryStatus?: InjuryStatus;
  injuryDetail?: string;
  /** Multiplies baseline volume — differentiates players inside one archetype. */
  usageMod?: number;
  depthChartOrder?: number;
  depthChartRole?: string;
  /** Extra ESPN slot eligibility beyond the primary position. */
  eligible?: Position[];
  /** True when this player's value is mostly contingent on an injury ahead. */
  handcuffFor?: string;
  note?: string;
}

/**
 * SEED SNAPSHOT: 2026-09-11
 *
 * Transcribed from the user's ESPN screenshots. NFL team assignments, injury
 * designations and depth-chart roles are a point-in-time snapshot and are
 * expected to be replaced by provider data — every row is written with
 * source = "SEED" so the UI can show what has not yet been verified.
 */
export const SEED_SNAPSHOT_LABEL = '2026-09-11';

/** Team 1 — Gibbs Me The Trophy. */
export const GIBBS_ROSTER: { slot: string; slotIndex: number; player: SeedPlayer }[] = [
  { slot: 'QB', slotIndex: 0, player: { name: 'Brock Purdy', position: 'QB', team: 'SF', archetype: 'QB1', usageMod: 1.04, depthChartOrder: 1, depthChartRole: 'QB1' } },
  { slot: 'RB', slotIndex: 0, player: { name: 'Jahmyr Gibbs', position: 'RB', team: 'DET', archetype: 'RB_ELITE', usageMod: 1.06, depthChartOrder: 1, depthChartRole: 'Lead back / passing down' } },
  { slot: 'RB', slotIndex: 1, player: { name: 'Bucky Irving', position: 'RB', team: 'TB', archetype: 'RB1', usageMod: 1.02, depthChartOrder: 1, depthChartRole: 'Lead back' } },
  { slot: 'WR', slotIndex: 0, player: { name: 'Nico Collins', position: 'WR', team: 'HOU', archetype: 'WR_ELITE', usageMod: 0.98, depthChartOrder: 1, depthChartRole: 'X receiver' } },
  { slot: 'WR', slotIndex: 1, player: { name: 'Jaylen Waddle', position: 'WR', team: 'DEN', archetype: 'WR1', usageMod: 0.96, depthChartOrder: 1, depthChartRole: 'Z receiver' } },
  { slot: 'TE', slotIndex: 0, player: { name: 'Michael Mayer', position: 'TE', team: 'LV', archetype: 'TE2', usageMod: 1.05, depthChartOrder: 1, depthChartRole: 'TE1' } },
  { slot: 'FLEX', slotIndex: 0, player: { name: 'Jaylen Warren', position: 'RB', team: 'PIT', archetype: 'RB2', usageMod: 1.05, depthChartOrder: 1, depthChartRole: 'Committee back' } },
  { slot: 'DST', slotIndex: 0, player: { name: 'Baltimore Ravens D/ST', position: 'DST', team: 'BAL', archetype: 'DST1', usageMod: 1.0 } },
  { slot: 'K', slotIndex: 0, player: { name: 'Will Reichard', position: 'K', team: 'MIN', archetype: 'K1', usageMod: 1.0 } },
  { slot: 'BENCH', slotIndex: 0, player: { name: 'Christian Watson', position: 'WR', team: 'GB', archetype: 'WR3', usageMod: 0.95, depthChartOrder: 2, depthChartRole: 'Field stretcher', note: 'Boom/bust deep role; snap count still climbing back.' } },
  { slot: 'BENCH', slotIndex: 1, player: { name: 'Chris Godwin Jr.', position: 'WR', team: 'TB', archetype: 'WR2', usageMod: 1.04, depthChartOrder: 2, depthChartRole: 'Slot', note: 'Suffix in ESPN ("Jr.") — identity resolution must not split him from "Chris Godwin".' } },
  { slot: 'BENCH', slotIndex: 2, player: { name: 'Jayden Reed', position: 'WR', team: 'GB', archetype: 'WR2', usageMod: 1.06, depthChartOrder: 1, depthChartRole: 'Slot / primary target' } },
  { slot: 'BENCH', slotIndex: 3, player: { name: 'Jordan Mason', position: 'RB', team: 'MIN', archetype: 'RB2', usageMod: 0.98, depthChartOrder: 2, depthChartRole: 'Early-down back' } },
  // One bench slot intentionally left empty — matches the screenshot and gives
  // the roster engine an open spot to recommend an add into.
  { slot: 'IR', slotIndex: 0, player: { name: 'Brock Bowers', position: 'TE', team: 'LV', archetype: 'TE_ELITE', injuryStatus: 'OUT', injuryDetail: 'Listed OUT on the 2026-09-11 snapshot; occupying the IR slot.', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'TE1' } },
];

/** Team 2 — So Good It Hurts. */
export const SGIH_ROSTER: { slot: string; slotIndex: number; player: SeedPlayer }[] = [
  { slot: 'QB', slotIndex: 0, player: { name: 'Jalen Hurts', position: 'QB', team: 'PHI', archetype: 'QB_ELITE', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'QB1' } },
  { slot: 'RB', slotIndex: 0, player: { name: 'Jonathan Taylor', position: 'RB', team: 'IND', archetype: 'RB_ELITE', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'Lead back' } },
  { slot: 'RB', slotIndex: 1, player: { name: 'Bucky Irving', position: 'RB', team: 'TB', archetype: 'RB1', usageMod: 1.02, depthChartOrder: 1, depthChartRole: 'Lead back' } },
  { slot: 'WR', slotIndex: 0, player: { name: 'Drake London', position: 'WR', team: 'ATL', archetype: 'WR_ELITE', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'X receiver' } },
  { slot: 'WR', slotIndex: 1, player: { name: 'Malik Nabers', position: 'WR', team: 'NYG', archetype: 'WR_ELITE', usageMod: 1.02, injuryStatus: 'QUESTIONABLE', injuryDetail: 'Questionable on the 2026-09-11 snapshot. Status must be confirmed before kickoff.', depthChartOrder: 1, depthChartRole: 'Alpha target' } },
  { slot: 'TE', slotIndex: 0, player: { name: 'Kyle Pitts Sr.', position: 'TE', team: 'ATL', archetype: 'TE1', usageMod: 0.97, depthChartOrder: 1, depthChartRole: 'TE1' } },
  { slot: 'FLEX', slotIndex: 0, player: { name: 'Davante Adams', position: 'WR', team: 'LAR', archetype: 'WR1', usageMod: 0.98, depthChartOrder: 1, depthChartRole: 'X receiver' } },
  { slot: 'FLEX', slotIndex: 1, player: { name: 'Terry McLaurin', position: 'WR', team: 'WSH', archetype: 'WR1', usageMod: 0.97, depthChartOrder: 1, depthChartRole: 'X receiver' } },
  { slot: 'DST', slotIndex: 0, player: { name: 'Baltimore Ravens D/ST', position: 'DST', team: 'BAL', archetype: 'DST1', usageMod: 1.0 } },
  { slot: 'K', slotIndex: 0, player: { name: 'Cam Little', position: 'K', team: 'JAX', archetype: 'K1', usageMod: 1.03 } },
  { slot: 'BENCH', slotIndex: 0, player: { name: 'Tony Pollard', position: 'RB', team: 'TEN', archetype: 'RB1', usageMod: 0.96, depthChartOrder: 1, depthChartRole: 'Lead back' } },
  { slot: 'BENCH', slotIndex: 1, player: { name: 'Jordan Addison', position: 'WR', team: 'MIN', archetype: 'WR2', usageMod: 1.03, depthChartOrder: 2, depthChartRole: 'Z receiver' } },
  { slot: 'BENCH', slotIndex: 2, player: { name: 'Aaron Jones Sr.', position: 'RB', team: 'MIN', archetype: 'RB2', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'Committee back' } },
  { slot: 'BENCH', slotIndex: 3, player: { name: 'Rachaad White', position: 'RB', team: 'TB', archetype: 'RB3', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Passing-down back', handcuffFor: 'Bucky Irving' } },
  { slot: 'BENCH', slotIndex: 4, player: { name: 'Matthew Stafford', position: 'QB', team: 'LAR', archetype: 'QB1', usageMod: 0.98, depthChartOrder: 1, depthChartRole: 'QB1' } },
  { slot: 'BENCH', slotIndex: 5, player: { name: 'Calvin Ridley', position: 'WR', team: 'TEN', archetype: 'WR2', usageMod: 1.0, depthChartOrder: 1, depthChartRole: 'X receiver' } },
  { slot: 'BENCH', slotIndex: 6, player: { name: 'Rashod Bateman', position: 'WR', team: 'BAL', archetype: 'WR3', usageMod: 0.98, depthChartOrder: 2, depthChartRole: 'Z receiver' } },
  {
    slot: 'BENCH',
    slotIndex: 7,
    player: {
      name: 'Jonah Coleman',
      position: 'RB',
      team: null, // Seed does not know his NFL team — intentionally unresolved.
      archetype: 'RB_HANDCUFF',
      usageMod: 0.9,
      depthChartOrder: 3,
      depthChartRole: 'Rotational back',
      note: 'NFL team unresolved in the seed snapshot. Sync ESPN/Sleeper to fill it in.',
    },
  },
];

/**
 * Free-agent / waiver pool. Availability is set PER LEAGUE in the seed script,
 * because a player who is free in a 10-team league may be rostered in a 12-team
 * league. Nothing here is ever recommended in a league where it is rostered.
 */
export const FREE_AGENT_POOL: (SeedPlayer & { gibbsAvailable: boolean; sgihAvailable: boolean; percentOwned: number; trendingAdds?: number })[] = [
  // --- running backs ---
  { name: 'Tyjae Spears', position: 'RB', team: 'TEN', archetype: 'RB3', usageMod: 1.05, depthChartOrder: 2, depthChartRole: 'Change of pace', handcuffFor: 'Tony Pollard', gibbsAvailable: true, sgihAvailable: true, percentOwned: 41, trendingAdds: 4200 },
  { name: 'Ray Davis', position: 'RB', team: 'BUF', archetype: 'RB3', usageMod: 1.1, depthChartOrder: 2, depthChartRole: 'Committee back', gibbsAvailable: true, sgihAvailable: true, percentOwned: 28, trendingAdds: 9100 },
  { name: 'Braelon Allen', position: 'RB', team: 'NYJ', archetype: 'RB2', usageMod: 1.12, depthChartOrder: 1, depthChartRole: 'Early-down back', gibbsAvailable: true, sgihAvailable: true, percentOwned: 34, trendingAdds: 15400, note: 'Backfield share climbing.' },
  { name: 'Blake Corum', position: 'RB', team: 'LAR', archetype: 'RB_HANDCUFF', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Backup', handcuffFor: 'Kyren Williams', gibbsAvailable: true, sgihAvailable: false, percentOwned: 22 },
  { name: 'Trey Benson', position: 'RB', team: 'ARI', archetype: 'RB2', usageMod: 1.04, depthChartOrder: 1, depthChartRole: 'Lead back', gibbsAvailable: false, sgihAvailable: true, percentOwned: 47, trendingAdds: 6800 },
  { name: 'Isaac Guerendo', position: 'RB', team: 'SF', archetype: 'RB_HANDCUFF', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Backup', gibbsAvailable: true, sgihAvailable: true, percentOwned: 18 },
  { name: 'Kendre Miller', position: 'RB', team: 'NO', archetype: 'RB3', usageMod: 0.95, depthChartOrder: 2, depthChartRole: 'Rotational', gibbsAvailable: true, sgihAvailable: true, percentOwned: 9 },
  { name: 'Jaydon Blue', position: 'RB', team: 'DAL', archetype: 'RB3', usageMod: 1.08, depthChartOrder: 2, depthChartRole: 'Passing-down back', gibbsAvailable: true, sgihAvailable: true, percentOwned: 15, trendingAdds: 7300 },
  { name: 'Bhayshul Tuten', position: 'RB', team: 'JAX', archetype: 'RB3', usageMod: 1.06, depthChartOrder: 2, depthChartRole: 'Committee back', gibbsAvailable: true, sgihAvailable: true, percentOwned: 26, trendingAdds: 11200 },
  { name: 'Tank Bigsby', position: 'RB', team: 'PHI', archetype: 'RB_HANDCUFF', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Backup', gibbsAvailable: true, sgihAvailable: true, percentOwned: 12 },
  // --- wide receivers ---
  { name: 'Quentin Johnston', position: 'WR', team: 'LAC', archetype: 'WR2', usageMod: 1.02, depthChartOrder: 1, depthChartRole: 'X receiver', gibbsAvailable: true, sgihAvailable: true, percentOwned: 52, trendingAdds: 8900 },
  { name: 'Wan\'Dale Robinson', position: 'WR', team: 'NYG', archetype: 'WR3', usageMod: 1.14, depthChartOrder: 1, depthChartRole: 'Slot', gibbsAvailable: true, sgihAvailable: true, percentOwned: 38, trendingAdds: 12600, note: 'Direct beneficiary if Malik Nabers misses time.' },
  { name: 'Josh Downs', position: 'WR', team: 'IND', archetype: 'WR3', usageMod: 1.08, depthChartOrder: 2, depthChartRole: 'Slot', gibbsAvailable: true, sgihAvailable: true, percentOwned: 44 },
  { name: 'Adonai Mitchell', position: 'WR', team: 'IND', archetype: 'WR4', usageMod: 1.05, depthChartOrder: 3, depthChartRole: 'Z receiver', gibbsAvailable: true, sgihAvailable: true, percentOwned: 11 },
  { name: 'Dontayvion Wicks', position: 'WR', team: 'GB', archetype: 'WR4', usageMod: 1.0, depthChartOrder: 3, depthChartRole: 'Rotational', gibbsAvailable: true, sgihAvailable: true, percentOwned: 8 },
  { name: 'Jalen McMillan', position: 'WR', team: 'TB', archetype: 'WR3', usageMod: 1.06, depthChartOrder: 3, depthChartRole: 'Z receiver', gibbsAvailable: true, sgihAvailable: true, percentOwned: 24, trendingAdds: 5400 },
  { name: 'Luther Burden III', position: 'WR', team: 'CHI', archetype: 'WR3', usageMod: 1.1, depthChartOrder: 2, depthChartRole: 'Slot', gibbsAvailable: true, sgihAvailable: true, percentOwned: 31, trendingAdds: 14100 },
  { name: 'Kayshon Boutte', position: 'WR', team: 'NE', archetype: 'WR3', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Z receiver', gibbsAvailable: false, sgihAvailable: true, percentOwned: 29 },
  { name: 'Tre Tucker', position: 'WR', team: 'LV', archetype: 'WR3', usageMod: 1.02, depthChartOrder: 2, depthChartRole: 'Field stretcher', gibbsAvailable: true, sgihAvailable: true, percentOwned: 21 },
  { name: 'Michael Wilson', position: 'WR', team: 'ARI', archetype: 'WR3', usageMod: 1.0, depthChartOrder: 2, depthChartRole: 'Z receiver', gibbsAvailable: true, sgihAvailable: true, percentOwned: 19 },
  { name: 'Romeo Doubs', position: 'WR', team: 'GB', archetype: 'WR3', usageMod: 1.03, depthChartOrder: 2, depthChartRole: 'X receiver', gibbsAvailable: true, sgihAvailable: false, percentOwned: 46 },
  // --- tight ends ---
  { name: 'Dalton Kincaid', position: 'TE', team: 'BUF', archetype: 'TE1', usageMod: 1.02, depthChartOrder: 1, depthChartRole: 'TE1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 55, trendingAdds: 7600 },
  { name: 'Hunter Henry', position: 'TE', team: 'NE', archetype: 'TE1', usageMod: 0.98, depthChartOrder: 1, depthChartRole: 'TE1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 37 },
  { name: 'Cade Otton', position: 'TE', team: 'TB', archetype: 'TE2', usageMod: 1.05, depthChartOrder: 1, depthChartRole: 'TE1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 33 },
  { name: 'Theo Johnson', position: 'TE', team: 'NYG', archetype: 'TE2', usageMod: 1.08, depthChartOrder: 1, depthChartRole: 'TE1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 27, trendingAdds: 4900 },
  { name: 'Isaiah Likely', position: 'TE', team: 'BAL', archetype: 'TE2', usageMod: 1.06, depthChartOrder: 2, depthChartRole: 'TE2', gibbsAvailable: true, sgihAvailable: true, percentOwned: 42 },
  { name: 'Elijah Arroyo', position: 'TE', team: 'SEA', archetype: 'TE2', usageMod: 1.04, depthChartOrder: 1, depthChartRole: 'TE1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 14 },
  // --- quarterbacks ---
  { name: 'Bryce Young', position: 'QB', team: 'CAR', archetype: 'QB2', usageMod: 1.04, depthChartOrder: 1, depthChartRole: 'QB1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 32 },
  { name: 'Michael Penix Jr.', position: 'QB', team: 'ATL', archetype: 'QB2', usageMod: 1.06, depthChartOrder: 1, depthChartRole: 'QB1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 44 },
  { name: 'Tua Tagovailoa', position: 'QB', team: 'MIA', archetype: 'QB1', usageMod: 0.96, depthChartOrder: 1, depthChartRole: 'QB1', gibbsAvailable: true, sgihAvailable: false, percentOwned: 51 },
  { name: 'Sam Darnold', position: 'QB', team: 'SEA', archetype: 'QB2', usageMod: 1.02, depthChartOrder: 1, depthChartRole: 'QB1', gibbsAvailable: true, sgihAvailable: true, percentOwned: 36 },
  { name: 'Anthony Richardson Sr.', position: 'QB', team: 'IND', archetype: 'QB_STREAM', usageMod: 1.15, depthChartOrder: 2, depthChartRole: 'Backup', gibbsAvailable: true, sgihAvailable: true, percentOwned: 17 },
  // --- kickers ---
  { name: 'Chase McLaughlin', position: 'K', team: 'TB', archetype: 'K1', usageMod: 1.02, gibbsAvailable: true, sgihAvailable: true, percentOwned: 48 },
  { name: 'Jake Bates', position: 'K', team: 'DET', archetype: 'K1', usageMod: 1.05, gibbsAvailable: true, sgihAvailable: true, percentOwned: 53 },
  { name: 'Tyler Loop', position: 'K', team: 'BAL', archetype: 'K1', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 30 },
  { name: 'Joshua Karty', position: 'K', team: 'LAR', archetype: 'K2', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 22 },
  { name: 'Jason Sanders', position: 'K', team: 'MIA', archetype: 'K2', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 26 },
  // --- team defenses ---
  { name: 'Denver Broncos D/ST', position: 'DST', team: 'DEN', archetype: 'DST1', usageMod: 1.04, gibbsAvailable: true, sgihAvailable: true, percentOwned: 61, trendingAdds: 5200 },
  { name: 'Houston Texans D/ST', position: 'DST', team: 'HOU', archetype: 'DST1', usageMod: 1.02, gibbsAvailable: false, sgihAvailable: true, percentOwned: 58 },
  { name: 'Green Bay Packers D/ST', position: 'DST', team: 'GB', archetype: 'DST2', usageMod: 1.03, gibbsAvailable: true, sgihAvailable: true, percentOwned: 44 },
  { name: 'Seattle Seahawks D/ST', position: 'DST', team: 'SEA', archetype: 'DST2', usageMod: 1.02, gibbsAvailable: true, sgihAvailable: true, percentOwned: 39 },
  { name: 'Pittsburgh Steelers D/ST', position: 'DST', team: 'PIT', archetype: 'DST2', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 47 },
  { name: 'Minnesota Vikings D/ST', position: 'DST', team: 'MIN', archetype: 'DST2', usageMod: 1.01, gibbsAvailable: true, sgihAvailable: true, percentOwned: 41 },
  { name: 'Arizona Cardinals D/ST', position: 'DST', team: 'ARI', archetype: 'DST3', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 12 },
  { name: 'New York Jets D/ST', position: 'DST', team: 'NYJ', archetype: 'DST3', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 15 },
  { name: 'Carolina Panthers D/ST', position: 'DST', team: 'CAR', archetype: 'DST3', usageMod: 1.0, gibbsAvailable: true, sgihAvailable: true, percentOwned: 6 },
];

/**
 * Deliberate identity trap in the seed data: "Hollywood Brown" and
 * "Marquise Brown" are the same person. The resolver must collapse them.
 */
export const IDENTITY_ALIAS_FIXTURES: { alias: string; canonical: string }[] = [
  { alias: 'Hollywood Brown', canonical: 'Marquise Brown' },
  { alias: 'Chris Godwin', canonical: 'Chris Godwin Jr.' },
  { alias: 'Kyle Pitts', canonical: 'Kyle Pitts Sr.' },
  { alias: 'Aaron Jones', canonical: 'Aaron Jones Sr.' },
  { alias: 'Michael Penix', canonical: 'Michael Penix Jr.' },
  { alias: 'Anthony Richardson', canonical: 'Anthony Richardson Sr.' },
];
