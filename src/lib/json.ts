import { z } from 'zod';

/**
 * SQLite has no JSON column type, so structured fields are stored as strings.
 * Everything goes through these helpers so a malformed row can never crash a page.
 */
export function parseJson<T>(raw: string | null | undefined, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function stringify(value: unknown): string {
  return JSON.stringify(value);
}

export const zStringArray = z.array(z.string());
