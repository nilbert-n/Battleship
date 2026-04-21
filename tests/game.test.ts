import { describe, it, expect } from "vitest";
import { createGame, fireShot, startBattle } from "../src/engine/game";
import { emptyBoard, placeShip } from "../src/engine/placement";
import { SHIP_DEFS } from "../src/engine/types";

function fullFleet() {
  let board = emptyBoard();
  board = placeShip(board, "carrier", { row: 0, col: 0 }, "horizontal");
  board = placeShip(board, "battleship", { row: 2, col: 0 }, "horizontal");
  board = placeShip(board, "cruiser", { row: 4, col: 0 }, "horizontal");
  board = placeShip(board, "submarine", { row: 6, col: 0 }, "horizontal");
  board = placeShip(board, "destroyer", { row: 8, col: 0 }, "horizontal");
  return board;
}

describe("game / combat", () => {
  it("fireShot registers a miss and flips the turn", () => {
    const game = startBattle({ ...createGame(), player: fullFleet() }, fullFleet());
    const { state, result } = fireShot(game, "player", { row: 9, col: 9 });
    expect(result.outcome).toBe("miss");
    expect(state.turn).toBe("ai");
  });

  it("fireShot registers a hit (not sunk)", () => {
    const game = startBattle({ ...createGame(), player: fullFleet() }, fullFleet());
    const { result } = fireShot(game, "player", { row: 0, col: 0 });
    expect(result.outcome).toBe("hit");
  });

  it("fireShot registers sunk when last segment hit", () => {
    const game = startBattle({ ...createGame(), player: fullFleet() }, fullFleet());
    // destroyer is length 2 at (8,0)-(8,1)
    let s = game;
    ({ state: s } = fireShot(s, "player", { row: 8, col: 0 }));
    // ai turn: fire a harmless shot and swap back
    ({ state: s } = fireShot(s, "ai", { row: 9, col: 9 }));
    const { result } = fireShot(s, "player", { row: 8, col: 1 });
    expect(result.outcome).toBe("sunk");
    expect(result.sunkShip?.type).toBe("destroyer");
  });

  it("rejects repeat shots on same cell", () => {
    const game = startBattle({ ...createGame(), player: fullFleet() }, fullFleet());
    let s = game;
    ({ state: s } = fireShot(s, "player", { row: 9, col: 9 }));
    ({ state: s } = fireShot(s, "ai", { row: 9, col: 9 }));
    const { result } = fireShot(s, "player", { row: 9, col: 9 });
    expect(result.outcome).toBe("repeat");
  });

  it("declares a winner once all enemy ships are sunk", () => {
    let s = startBattle({ ...createGame(), player: fullFleet() }, fullFleet());
    const allCells: Array<[number, number]> = [];
    for (const def of SHIP_DEFS) {
      const ship = s.ai.ships.find((x) => x.type === def.type)!;
      for (let i = 0; i < ship.length; i++) {
        allCells.push(
          ship.orientation === "horizontal"
            ? [ship.origin.row, ship.origin.col + i]
            : [ship.origin.row + i, ship.origin.col],
        );
      }
    }

    const fireLegalAiShot = (state: typeof s): typeof s => {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const key = `${r},${c}`;
          if (!state.player.shots.has(key)) {
            return fireShot(state, "ai", { row: r, col: c }).state;
          }
        }
      }
      return state;
    };

    for (const [r, c] of allCells) {
      if (s.phase !== "playing") break;
      if (s.turn === "ai") s = fireLegalAiShot(s);
      if (s.phase !== "playing") break;
      s = fireShot(s, "player", { row: r, col: c }).state;
    }
    expect(s.phase).toBe("ended");
    expect(s.winner).toBe("player");
  });
});
