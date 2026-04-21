import { describe, it, expect } from "vitest";
import {
  canPlace,
  emptyBoard,
  isFleetComplete,
  placeShip,
  randomizeFleet,
  removeShip,
  shipAt,
} from "../src/engine/placement";
import { SHIP_DEFS, cellsFor } from "../src/engine/types";

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("placement", () => {
  it("rejects out-of-bounds placement", () => {
    const board = emptyBoard();
    expect(canPlace(board, "carrier", { row: 0, col: 7 }, "horizontal")).toBe(false);
    expect(canPlace(board, "carrier", { row: 7, col: 0 }, "vertical")).toBe(false);
  });

  it("rejects overlap with other ship", () => {
    let board = emptyBoard();
    board = placeShip(board, "carrier", { row: 0, col: 0 }, "horizontal");
    expect(canPlace(board, "battleship", { row: 0, col: 2 }, "horizontal")).toBe(false);
  });

  it("allows re-placing the same ship type", () => {
    let board = emptyBoard();
    board = placeShip(board, "carrier", { row: 0, col: 0 }, "horizontal");
    // placing carrier again at a new spot should overwrite, not collide with itself
    board = placeShip(board, "carrier", { row: 5, col: 0 }, "horizontal");
    expect(board.ships).toHaveLength(1);
    expect(board.ships[0].origin).toEqual({ row: 5, col: 0 });
  });

  it("removes a ship", () => {
    let board = emptyBoard();
    board = placeShip(board, "carrier", { row: 0, col: 0 }, "horizontal");
    board = removeShip(board, "carrier");
    expect(board.ships).toHaveLength(0);
  });

  it("shipAt finds occupant cell", () => {
    let board = emptyBoard();
    board = placeShip(board, "destroyer", { row: 3, col: 4 }, "vertical");
    expect(shipAt(board, { row: 3, col: 4 })?.type).toBe("destroyer");
    expect(shipAt(board, { row: 4, col: 4 })?.type).toBe("destroyer");
    expect(shipAt(board, { row: 5, col: 4 })).toBeUndefined();
  });

  it("randomizeFleet produces full, non-overlapping, in-bounds fleet", () => {
    for (let seed = 1; seed < 20; seed++) {
      const board = randomizeFleet(seededRng(seed));
      expect(isFleetComplete(board)).toBe(true);
      const occupied = new Set<string>();
      for (const ship of board.ships) {
        for (const c of cellsFor(ship)) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(10);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(10);
          const key = `${c.row},${c.col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
      // Total cells should be sum of ship lengths
      const total = SHIP_DEFS.reduce((s, d) => s + d.length, 0);
      expect(occupied.size).toBe(total);
    }
  });
});
