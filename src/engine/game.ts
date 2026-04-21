import {
  Board,
  Coordinate,
  GameState,
  PlayerId,
  Placement,
  ShotResult,
  cellsFor,
  coordKey,
} from "./types";
import { emptyBoard, shipAt } from "./placement";

export function createGame(): GameState {
  return {
    phase: "setup",
    turn: "player",
    player: emptyBoard(),
    ai: emptyBoard(),
  };
}

export function startBattle(state: GameState, aiBoard: Board): GameState {
  return { ...state, phase: "playing", ai: aiBoard, turn: "player" };
}

export function getSunkShips(board: Board): Placement[] {
  return board.ships.filter((s) => s.hits.every(Boolean));
}

export function allShipsSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.hits.every(Boolean));
}

export function fireShot(state: GameState, shooter: PlayerId, coord: Coordinate): {
  state: GameState;
  result: ShotResult;
} {
  if (state.phase !== "playing") {
    return { state, result: { outcome: "repeat", coord } };
  }
  if (state.turn !== shooter) {
    return { state, result: { outcome: "repeat", coord } };
  }
  const targetKey: PlayerId = shooter === "player" ? "ai" : "player";
  const target = state[targetKey];
  const key = coordKey(coord);
  if (target.shots.has(key)) {
    return { state, result: { outcome: "repeat", coord } };
  }

  const newShots = new Set(target.shots);
  newShots.add(key);

  const hitShip = shipAt(target, coord);
  let outcome: ShotResult["outcome"] = "miss";
  let newShips = target.ships;
  let sunkShip: Placement | undefined;

  if (hitShip) {
    const idx = cellsFor(hitShip).findIndex((c) => coordKey(c) === key);
    const updatedShip: Placement = {
      ...hitShip,
      hits: hitShip.hits.map((h, i) => (i === idx ? true : h)),
    };
    newShips = target.ships.map((s) => (s.type === hitShip.type ? updatedShip : s));
    if (updatedShip.hits.every(Boolean)) {
      outcome = "sunk";
      sunkShip = updatedShip;
    } else {
      outcome = "hit";
    }
  }

  const newTarget: Board = { ships: newShips, shots: newShots };
  const newState: GameState = { ...state, [targetKey]: newTarget } as GameState;

  if (allShipsSunk(newTarget)) {
    return {
      state: { ...newState, phase: "ended", winner: shooter },
      result: { outcome, coord, sunkShip, winner: shooter },
    };
  }

  const nextTurn: PlayerId = shooter === "player" ? "ai" : "player";
  return {
    state: { ...newState, turn: nextTurn },
    result: { outcome, coord, sunkShip },
  };
}
