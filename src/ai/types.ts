import { Coordinate, Orientation } from "../engine/types";

export interface HitCluster {
  hits: Coordinate[];
  orientation?: Orientation;
}

export type AiMode = "hunt" | "resolve";

export interface AiMemory {
  huntQueue: Coordinate[];
  huntIndex: number;
  clusters: HitCluster[];
  shots: Set<string>;
  remainingEnemyShips: number;
  /**
   * Lengths of enemy ships that have not yet been sunk. Used by hunt mode to
   * skip cells where no remaining ship could possibly fit (e.g. a 4-cell gap
   * when only the 5-cell carrier is left).
   */
  remainingShipLengths: number[];
  mode: AiMode;
  rng: () => number;
}
