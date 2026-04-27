import {
  BOARD_SIZE,
  Coordinate,
  Orientation,
  ShotResult,
  coordKey,
  inBounds,
} from "../engine/types";
import { AiMemory, HitCluster } from "./types";
import { buildHuntQueue } from "./huntQueue";

export function createAiMemory(rng: () => number = Math.random): AiMemory {
  return {
    huntQueue: buildHuntQueue(rng),
    huntIndex: 0,
    clusters: [],
    shots: new Set(),
    remainingEnemyShips: 5,
    remainingShipLengths: [5, 4, 3, 3, 2],
    mode: "hunt",
    rng,
  };
}

/**
 * Updates AI memory after a shot. Cluster tracking:
 *   - hits join adjacent clusters (merging multiples when a hit bridges them)
 *   - once a cluster has >=2 collinear hits the orientation is locked
 *   - on a sink, cells of the sunk ship are removed from clusters
 */
export function recordAiShotResult(memory: AiMemory, result: ShotResult): AiMemory {
  const shots = new Set(memory.shots);
  shots.add(coordKey(result.coord));

  let clusters = memory.clusters.map(cloneCluster);
  let remainingEnemyShips = memory.remainingEnemyShips;
  let remainingShipLengths = memory.remainingShipLengths.slice();

  if (result.outcome === "hit" || result.outcome === "sunk") {
    const neighbors = orthogonalNeighbors(result.coord);
    const touching: number[] = [];
    clusters.forEach((c, i) => {
      if (c.hits.some((h) => neighbors.some((n) => sameCoord(h, n)))) touching.push(i);
    });

    if (touching.length === 0) {
      clusters.push({ hits: [result.coord] });
    } else {
      const merged: HitCluster = { hits: [result.coord] };
      for (const i of touching) merged.hits.push(...clusters[i].hits);
      merged.orientation = inferOrientation(merged.hits);
      const keep = clusters.filter((_, i) => !touching.includes(i));
      keep.push(merged);
      clusters = keep;
    }
  }

  if (result.outcome === "sunk" && result.sunkShip) {
    remainingEnemyShips = Math.max(0, remainingEnemyShips - 1);
    const sunkLength = result.sunkShip.length;
    const removeIdx = remainingShipLengths.indexOf(sunkLength);
    if (removeIdx >= 0) remainingShipLengths.splice(removeIdx, 1);
    const sunkKeys = new Set(
      cellsForShip(result.sunkShip).map(coordKey),
    );
    clusters = clusters
      .map((c) => ({ ...c, hits: c.hits.filter((h) => !sunkKeys.has(coordKey(h))) }))
      .filter((c) => c.hits.length > 0)
      .map((c) => ({ hits: c.hits, orientation: inferOrientation(c.hits) }));
  }

  const mode = decideMode(clusters, remainingEnemyShips);

  return {
    ...memory,
    shots,
    clusters,
    remainingEnemyShips,
    remainingShipLengths,
    mode,
  };
}

/**
 * Picks the next shot coordinate. In `resolve` mode we extend the chosen
 * cluster along its locked orientation (or probe neighbors of a single hit).
 * In `hunt` mode we advance through the precomputed queue, skipping any cell
 * already shot.
 */
export function chooseAiShot(memory: AiMemory): Coordinate {
  if (memory.mode === "resolve") {
    const target = resolveTarget(memory);
    if (target) return target;
  }

  const densityPick = pickByPlacementDensity(memory);
  if (densityPick) return densityPick;

  for (let i = memory.huntIndex; i < memory.huntQueue.length; i++) {
    const candidate = memory.huntQueue[i];
    if (!memory.shots.has(coordKey(candidate))) return candidate;
  }

  // Fallback: scan all cells (should rarely be needed).
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const coord = { row: r, col: c };
      if (!memory.shots.has(coordKey(coord))) return coord;
    }
  }
  throw new Error("AI has no legal shots remaining");
}

/**
 * Counts how many placements of each remaining (unsunk) ship cover each unshot
 * cell, then returns the cell with the highest count. A "valid placement" is
 * one whose every cell is in bounds and not already shot — the AI knows shot
 * cells are either misses or part of an already-sunk ship, so no remaining
 * ship can occupy them.
 *
 * This makes the AI ship-length-aware: when only the 5-cell carrier is left,
 * a tightly-bordered region with fewer than 5 contiguous unshot cells gets
 * count 0 and is skipped, so the AI stops wasting turns on impossible cells.
 *
 * Returns null if no valid placement exists (e.g., game is essentially over)
 * so the caller can fall back to the legacy hunt queue.
 */
function pickByPlacementDensity(memory: AiMemory): Coordinate | null {
  if (memory.remainingShipLengths.length === 0) return null;

  const counts: number[][] = Array.from({ length: BOARD_SIZE }, () =>
    new Array<number>(BOARD_SIZE).fill(0),
  );

  for (const length of memory.remainingShipLengths) {
    // Horizontal placements
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c <= BOARD_SIZE - length; c++) {
        if (placementBlocked(memory, r, c, length, "horizontal")) continue;
        for (let i = 0; i < length; i++) counts[r][c + i]++;
      }
    }
    // Vertical placements
    for (let r = 0; r <= BOARD_SIZE - length; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (placementBlocked(memory, r, c, length, "vertical")) continue;
        for (let i = 0; i < length; i++) counts[r + i][c]++;
      }
    }
  }

  let bestCount = 0;
  let bestCells: Coordinate[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (memory.shots.has(coordKey({ row: r, col: c }))) continue;
      const v = counts[r][c];
      if (v > bestCount) {
        bestCount = v;
        bestCells = [{ row: r, col: c }];
      } else if (v === bestCount && v > 0) {
        bestCells.push({ row: r, col: c });
      }
    }
  }
  if (bestCount === 0 || bestCells.length === 0) return null;

  // Prefer the candidate whose huntQueue index is smallest, so per-game
  // randomness (queue is seeded) still influences tie-breaks.
  const queueOrder = new Map<string, number>();
  memory.huntQueue.forEach((c, i) => queueOrder.set(coordKey(c), i));
  bestCells.sort((a, b) => {
    const ai = queueOrder.get(coordKey(a)) ?? Number.POSITIVE_INFINITY;
    const bi = queueOrder.get(coordKey(b)) ?? Number.POSITIVE_INFINITY;
    return ai - bi;
  });
  return bestCells[0];
}

function placementBlocked(
  memory: AiMemory,
  r: number,
  c: number,
  length: number,
  orientation: Orientation,
): boolean {
  for (let i = 0; i < length; i++) {
    const cell =
      orientation === "horizontal"
        ? { row: r, col: c + i }
        : { row: r + i, col: c };
    if (memory.shots.has(coordKey(cell))) return true;
  }
  return false;
}

export function advanceHuntIndex(memory: AiMemory): AiMemory {
  let idx = memory.huntIndex;
  while (idx < memory.huntQueue.length && memory.shots.has(coordKey(memory.huntQueue[idx]))) {
    idx++;
  }
  return { ...memory, huntIndex: idx };
}

function decideMode(clusters: HitCluster[], _remainingEnemyShips: number): "hunt" | "resolve" {
  // Any open hit (cell that has been hit but whose ship has not been sunk) is
  // an active lead. Always resolve before returning to random hunt — otherwise
  // the AI can leave a partially-hit ship on the board and waste turns firing
  // elsewhere.
  return clusters.length > 0 ? "resolve" : "hunt";
}

function resolveTarget(memory: AiMemory): Coordinate | null {
  const sorted = memory.clusters
    .slice()
    .sort((a, b) => b.hits.length - a.hits.length);
  for (const cluster of sorted) {
    const candidate = clusterCandidates(cluster).find(
      (c) => inBounds(c) && !memory.shots.has(coordKey(c)),
    );
    if (candidate) return candidate;
  }
  return null;
}

function clusterCandidates(cluster: HitCluster): Coordinate[] {
  if (cluster.hits.length === 0) return [];
  if (cluster.orientation) {
    const sorted = cluster.hits.slice().sort((a, b) =>
      cluster.orientation === "horizontal" ? a.col - b.col : a.row - b.row,
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return cluster.orientation === "horizontal"
      ? [
          { row: first.row, col: first.col - 1 },
          { row: last.row, col: last.col + 1 },
        ]
      : [
          { row: first.row - 1, col: first.col },
          { row: last.row + 1, col: last.col },
        ];
  }
  return orthogonalNeighbors(cluster.hits[0]);
}

function orthogonalNeighbors(c: Coordinate): Coordinate[] {
  return [
    { row: c.row - 1, col: c.col },
    { row: c.row + 1, col: c.col },
    { row: c.row, col: c.col - 1 },
    { row: c.row, col: c.col + 1 },
  ];
}

function sameCoord(a: Coordinate, b: Coordinate): boolean {
  return a.row === b.row && a.col === b.col;
}

function inferOrientation(hits: Coordinate[]): Orientation | undefined {
  if (hits.length < 2) return undefined;
  const sameRow = hits.every((h) => h.row === hits[0].row);
  const sameCol = hits.every((h) => h.col === hits[0].col);
  if (sameRow) return "horizontal";
  if (sameCol) return "vertical";
  return undefined;
}

function cellsForShip(ship: {
  origin: Coordinate;
  orientation: Orientation;
  length: number;
}): Coordinate[] {
  const out: Coordinate[] = [];
  for (let i = 0; i < ship.length; i++) {
    out.push(
      ship.orientation === "horizontal"
        ? { row: ship.origin.row, col: ship.origin.col + i }
        : { row: ship.origin.row + i, col: ship.origin.col },
    );
  }
  return out;
}

function cloneCluster(c: HitCluster): HitCluster {
  return { hits: c.hits.slice(), orientation: c.orientation };
}
