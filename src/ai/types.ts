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
  mode: AiMode;
  rng: () => number;
}
