/**
 * Max-weight bipartite assignment (Hungarian / Jonker-Volgenant).
 *
 * Used instead of "sort by projection and fill slots" because slot eligibility
 * is not a simple hierarchy: FLEX, multi-position eligibility and locked
 * players can all make the greedy answer wrong. Rosters are small (<= 25
 * players, <= 12 slots) so the O(n^3) exact algorithm is instant and removes a
 * whole class of "the optimizer gave a silly lineup" bugs.
 *
 * `weights[i][j]` is the value of putting player j in slot i.
 * Use `-Infinity` for an ineligible pairing.
 */
export function maxWeightAssignment(weights: number[][]): { assignment: (number | null)[]; total: number } {
  const rows = weights.length;
  if (rows === 0) return { assignment: [], total: 0 };
  const cols = weights[0]!.length;
  if (cols === 0) return { assignment: new Array(rows).fill(null), total: 0 };

  const n = Math.max(rows, cols);
  const BIG = 1e9;

  // Square cost matrix for minimization. Padding rows/cols cost 0 so unused
  // slots or unused players are free.
  const cost: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i >= rows || j >= cols) return 0;
      const w = weights[i]![j]!;
      return Number.isFinite(w) ? -w : BIG;
    }),
  );

  // e-maxx style O(n^3) implementation with 1-based potentials.
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row matched to column j
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment: (number | null)[] = new Array(rows).fill(null);
  let total = 0;
  for (let j = 1; j <= n; j++) {
    const i = p[j] - 1;
    const col = j - 1;
    if (i < rows && col < cols) {
      const w = weights[i]![col]!;
      // Never report an ineligible pairing as a real assignment.
      if (Number.isFinite(w)) {
        assignment[i] = col;
        total += w;
      }
    }
  }
  return { assignment, total: Math.round(total * 1000) / 1000 };
}
