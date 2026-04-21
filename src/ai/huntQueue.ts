import { BOARD_SIZE, Coordinate } from "../engine/types";

/**
 * Builds the AI hunt queue following the user-specified scheme:
 *   - one randomly chosen parity color
 *   - center bias
 *   - four diagonal-board quadrants
 *   - repeated +3/+1 style offsets produce a patterned-but-not-checkerboard feel
 *   - slight tie-breaking randomness so games don't repeat exactly
 */
export function buildHuntQueue(rng: () => number): Coordinate[] {
  const parity = rng() < 0.5 ? 0 : 1;
  const center = (BOARD_SIZE - 1) / 2;

  const quadrants: Coordinate[][] = [[], [], [], []];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 !== parity) continue;
      const qRow = r < BOARD_SIZE / 2 ? 0 : 1;
      const qCol = c < BOARD_SIZE / 2 ? 0 : 1;
      quadrants[qRow * 2 + qCol].push({ row: r, col: c });
    }
  }

  // Each quadrant sorted by a +3 col / +1 row walk score (creates the diagonal
  // slant), with a center-distance nudge and a small random tie-breaker.
  for (const q of quadrants) {
    q.sort((a, b) => scoreCell(a, center, rng) - scoreCell(b, center, rng));
  }

  // Interleave the four quadrants round-robin so coverage stays balanced.
  // Start quadrant order is shuffled for per-game variation.
  const order = shuffle([0, 1, 2, 3], rng);
  const queue: Coordinate[] = [];
  const cursors = [0, 0, 0, 0];
  const total = quadrants.reduce((s, q) => s + q.length, 0);
  while (queue.length < total) {
    for (const q of order) {
      if (cursors[q] < quadrants[q].length) {
        queue.push(quadrants[q][cursors[q]++]);
      }
    }
  }
  return queue;
}

function scoreCell(cell: Coordinate, center: number, rng: () => number): number {
  const walk = 3 * cell.col + cell.row;
  const centerNudge = Math.hypot(cell.row - center, cell.col - center) * 0.4;
  const jitter = rng() * 0.5;
  return walk + centerNudge + jitter;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
