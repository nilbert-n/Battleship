export const BOARD_SIZE = 10;

export type PlayerId = "player" | "ai";

export type Orientation = "horizontal" | "vertical";

export type ShipType = "carrier" | "battleship" | "cruiser" | "submarine" | "destroyer";

export interface ShipDefinition {
  type: ShipType;
  length: number;
  label: string;
}

export const SHIP_DEFS: ShipDefinition[] = [
  { type: "carrier", length: 5, label: "Carrier" },
  { type: "battleship", length: 4, label: "Battleship" },
  { type: "cruiser", length: 3, label: "Cruiser" },
  { type: "submarine", length: 3, label: "Submarine" },
  { type: "destroyer", length: 2, label: "Destroyer" },
];

export interface Coordinate {
  row: number;
  col: number;
}

export interface Placement {
  type: ShipType;
  length: number;
  origin: Coordinate;
  orientation: Orientation;
  hits: boolean[];
}

export type CellState =
  | { kind: "empty" }
  | { kind: "ship"; type: ShipType }
  | { kind: "miss" }
  | { kind: "hit"; type: ShipType };

export interface Board {
  ships: Placement[];
  shots: Set<string>;
}

export type ShotOutcome = "miss" | "hit" | "sunk" | "repeat";

export interface ShotResult {
  outcome: ShotOutcome;
  coord: Coordinate;
  sunkShip?: Placement;
  winner?: PlayerId;
}

export type GamePhase = "setup" | "playing" | "ended";

export interface GameState {
  phase: GamePhase;
  turn: PlayerId;
  player: Board;
  ai: Board;
  winner?: PlayerId;
}

export function coordKey(c: Coordinate): string {
  return `${c.row},${c.col}`;
}

export function inBounds(c: Coordinate): boolean {
  return c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE;
}

export function cellsFor(p: Pick<Placement, "origin" | "orientation" | "length">): Coordinate[] {
  const out: Coordinate[] = [];
  for (let i = 0; i < p.length; i++) {
    out.push(
      p.orientation === "horizontal"
        ? { row: p.origin.row, col: p.origin.col + i }
        : { row: p.origin.row + i, col: p.origin.col },
    );
  }
  return out;
}
