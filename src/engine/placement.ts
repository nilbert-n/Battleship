import {
  BOARD_SIZE,
  Board,
  Coordinate,
  Orientation,
  Placement,
  SHIP_DEFS,
  ShipType,
  cellsFor,
  coordKey,
  inBounds,
} from "./types";

export function emptyBoard(): Board {
  return { ships: [], shots: new Set() };
}

export function shipAt(board: Board, coord: Coordinate): Placement | undefined {
  const key = coordKey(coord);
  return board.ships.find((s) => cellsFor(s).some((c) => coordKey(c) === key));
}

export function canPlace(
  board: Board,
  type: ShipType,
  origin: Coordinate,
  orientation: Orientation,
): boolean {
  const def = SHIP_DEFS.find((d) => d.type === type);
  if (!def) return false;
  const cells = cellsFor({ origin, orientation, length: def.length });
  if (!cells.every(inBounds)) return false;
  const occupied = new Set<string>();
  for (const s of board.ships) {
    if (s.type === type) continue;
    for (const c of cellsFor(s)) occupied.add(coordKey(c));
  }
  return cells.every((c) => !occupied.has(coordKey(c)));
}

export function placeShip(
  board: Board,
  type: ShipType,
  origin: Coordinate,
  orientation: Orientation,
): Board {
  if (!canPlace(board, type, origin, orientation)) {
    throw new Error(`Invalid placement for ${type}`);
  }
  const def = SHIP_DEFS.find((d) => d.type === type)!;
  const placement: Placement = {
    type,
    length: def.length,
    origin,
    orientation,
    hits: Array(def.length).fill(false),
  };
  return {
    ...board,
    ships: [...board.ships.filter((s) => s.type !== type), placement],
  };
}

export function removeShip(board: Board, type: ShipType): Board {
  return { ...board, ships: board.ships.filter((s) => s.type !== type) };
}

export function isFleetComplete(board: Board): boolean {
  return SHIP_DEFS.every((d) => board.ships.some((s) => s.type === d.type));
}

export function randomizeFleet(rng: () => number = Math.random): Board {
  let attempts = 0;
  while (attempts < 500) {
    attempts++;
    let board = emptyBoard();
    let ok = true;
    for (const def of SHIP_DEFS) {
      const candidate = randomPlacement(board, def.type, def.length, rng);
      if (!candidate) {
        ok = false;
        break;
      }
      board = placeShip(board, def.type, candidate.origin, candidate.orientation);
    }
    if (ok) return board;
  }
  throw new Error("Failed to randomize fleet");
}

function randomPlacement(
  board: Board,
  type: ShipType,
  length: number,
  rng: () => number,
): { origin: Coordinate; orientation: Orientation } | null {
  const tries = 200;
  for (let i = 0; i < tries; i++) {
    const orientation: Orientation = rng() < 0.5 ? "horizontal" : "vertical";
    const maxRow = orientation === "vertical" ? BOARD_SIZE - length : BOARD_SIZE - 1;
    const maxCol = orientation === "horizontal" ? BOARD_SIZE - length : BOARD_SIZE - 1;
    const origin: Coordinate = {
      row: Math.floor(rng() * (maxRow + 1)),
      col: Math.floor(rng() * (maxCol + 1)),
    };
    if (canPlace(board, type, origin, orientation)) return { origin, orientation };
  }
  return null;
}
