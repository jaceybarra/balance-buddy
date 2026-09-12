import { z } from 'zod';
import { STAT_KEYS, type StatKey, type StatLine } from '../../scoring/stats';
import { canonicalPosition } from '../../identity/normalize';
import type { Position } from '../../domain/enums';

export interface CsvProjectionRow {
  name: string;
  position: Position | null;
  team: string | null;
  week: number | null;
  statLine: StatLine;
  providerPoints: number | null;
}

export interface CsvParseResult {
  rows: CsvProjectionRow[];
  errors: string[];
  warnings: string[];
  /** Which stat columns were recognized. */
  recognizedColumns: string[];
  ignoredColumns: string[];
}

const HEADER_ALIASES: Record<string, StatKey> = {
  pass_yds: 'passYards',
  passyds: 'passYards',
  passingyards: 'passYards',
  pass_td: 'passTD',
  passtd: 'passTD',
  passingtds: 'passTD',
  int: 'passInt',
  ints: 'passInt',
  interceptions: 'passInt',
  rush_yds: 'rushYards',
  rushyds: 'rushYards',
  rushingyards: 'rushYards',
  rush_td: 'rushTD',
  rushtd: 'rushTD',
  rec_yds: 'recYards',
  recyds: 'recYards',
  receivingyards: 'recYards',
  rec_td: 'recTD',
  rectd: 'recTD',
  receptions: 'rec',
  catches: 'rec',
  fumbles: 'fumblesLost',
  fum: 'fumblesLost',
  sacks: 'sacks',
  def_int: 'defInt',
  fumble_recoveries: 'fumRec',
  pa: 'pointsAllowed',
  points_allowed: 'pointsAllowed',
  ya: 'yardsAllowed',
  yards_allowed: 'yardsAllowed',
  xp: 'pat',
  xpm: 'pat',
};

/**
 * Manual CSV projection import — the fallback when no projection API is wired up.
 *
 * Stat columns are strongly preferred: they let each league price the same
 * projection with its OWN scoring. A bare `points` column is accepted but
 * flagged, because those points were computed in someone else's scoring system
 * and cannot be re-priced.
 */
export function parseProjectionCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV needs a header row and at least one data row.'], warnings, recognizedColumns: [], ignoredColumns: [] };
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const normalized = header.map((h) => h.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, ''));

  const nameIdx = normalized.findIndex((h) => ['name', 'player', 'playername'].includes(h));
  if (nameIdx === -1) {
    return { rows: [], errors: ['CSV must include a "name" (or "player") column.'], warnings, recognizedColumns: [], ignoredColumns: [] };
  }
  const posIdx = normalized.findIndex((h) => ['pos', 'position'].includes(h));
  const teamIdx = normalized.findIndex((h) => ['team', 'nflteam', 'tm'].includes(h));
  const weekIdx = normalized.findIndex((h) => h === 'week');
  const pointsIdx = normalized.findIndex((h) => ['points', 'pts', 'fpts', 'projection', 'proj'].includes(h));

  const statColumns = new Map<number, StatKey>();
  const ignoredColumns: string[] = [];
  normalized.forEach((h, idx) => {
    if ([nameIdx, posIdx, teamIdx, weekIdx, pointsIdx].includes(idx)) return;
    const direct = STAT_KEYS.find((k) => k.toLowerCase() === h);
    const aliased = HEADER_ALIASES[h];
    const key = direct ?? aliased;
    if (key) statColumns.set(idx, key);
    else if (header[idx]) ignoredColumns.push(header[idx]!);
  });

  if (statColumns.size === 0 && pointsIdx === -1) {
    return {
      rows: [],
      errors: ['No recognizable stat columns and no points column. Include columns like recYards, rec, recTD.'],
      warnings,
      recognizedColumns: [],
      ignoredColumns,
    };
  }
  if (statColumns.size === 0) {
    warnings.push(
      'Only a points column was found. Those points were computed in another system’s scoring, so this app cannot re-price them for each league. Stat columns are strongly preferred.',
    );
  }

  const rows: CsvProjectionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const name = cells[nameIdx]?.trim();
    if (!name) {
      errors.push(`Row ${i + 1}: missing player name.`);
      continue;
    }
    const statLine: StatLine = {};
    for (const [idx, key] of statColumns) {
      const raw = cells[idx]?.trim();
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isNaN(value)) {
        errors.push(`Row ${i + 1}: "${raw}" in column ${header[idx]} is not a number.`);
        continue;
      }
      statLine[key] = value;
    }
    const pointsRaw = pointsIdx >= 0 ? Number(cells[pointsIdx]) : NaN;
    rows.push({
      name,
      position: posIdx >= 0 ? canonicalPosition(cells[posIdx] ?? null) : null,
      team: teamIdx >= 0 ? (cells[teamIdx]?.trim().toUpperCase() || null) : null,
      week: weekIdx >= 0 && cells[weekIdx] ? Number(cells[weekIdx]) : null,
      statLine,
      providerPoints: Number.isNaN(pointsRaw) ? null : pointsRaw,
    });
  }

  return {
    rows,
    errors,
    warnings,
    recognizedColumns: [...statColumns.values()],
    ignoredColumns,
  };
}

/** Minimal CSV splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export const csvUploadSchema = z.object({
  csv: z.string().min(10).max(2_000_000),
  week: z.number().int().min(0).max(18).optional(),
});
