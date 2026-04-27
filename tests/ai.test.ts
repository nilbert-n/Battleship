import { describe, it, expect } from "vitest";
import { buildHuntQueue } from "../src/ai/huntQueue";
import {
  advanceHuntIndex,
  chooseAiShot,
  createAiMemory,
  recordAiShotResult,
} from "../src/ai/ai";
import { BOARD_SIZE, Coordinate, coordKey } from "../src/engine/types";

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("hunt queue", () => {
  it("covers every cell of one parity with no duplicates", () => {
    const queue = buildHuntQueue(seededRng(42));
    const keys = new Set(queue.map(coordKey));
    expect(keys.size).toBe(queue.length);
    // Parity cells total 50 in a 10x10 board
    expect(queue.length).toBe(50);
    // All from a single parity
    const parity = (queue[0].row + queue[0].col) % 2;
    for (const c of queue) {
      expect((c.row + c.col) % 2).toBe(parity);
    }
    // All in bounds
    for (const c of queue) {
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(BOARD_SIZE);
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(BOARD_SIZE);
    }
  });

  it("varies across seeds", () => {
    const a = buildHuntQueue(seededRng(1)).map(coordKey).join("|");
    const b = buildHuntQueue(seededRng(2)).map(coordKey).join("|");
    expect(a).not.toBe(b);
  });
});

describe("ai targeting", () => {
  it("does not repeat shots", () => {
    const memory = createAiMemory(seededRng(7));
    const shots: Coordinate[] = [];
    let mem = memory;
    for (let i = 0; i < 30; i++) {
      const target = chooseAiShot(mem);
      shots.push(target);
      // simulate a miss result
      mem = recordAiShotResult(mem, { outcome: "miss", coord: target });
      mem = advanceHuntIndex(mem);
    }
    const keys = new Set(shots.map(coordKey));
    expect(keys.size).toBe(shots.length);
  });

  it("switches to resolve after any open hit so leads are not abandoned", () => {
    let mem = createAiMemory(seededRng(9));
    const hit: Coordinate = { row: 4, col: 4 };
    mem = recordAiShotResult(mem, { outcome: "hit", coord: hit });
    expect(mem.mode).toBe("resolve");
  });

  it("switches to resolve after two aligned hits and targets along orientation", () => {
    let mem = createAiMemory(seededRng(11));
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 4, col: 4 } });
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 4, col: 5 } });
    expect(mem.mode).toBe("resolve");
    expect(mem.clusters[0].orientation).toBe("horizontal");
    const target = chooseAiShot(mem);
    // Should target an extension along the row
    expect(target.row).toBe(4);
    expect([3, 6]).toContain(target.col);
  });

  it("clears a cluster after the ship is sunk", () => {
    let mem = createAiMemory(seededRng(13));
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 2, col: 2 } });
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 2, col: 3 } });
    mem = recordAiShotResult(mem, {
      outcome: "sunk",
      coord: { row: 2, col: 4 },
      sunkShip: {
        type: "cruiser",
        length: 3,
        origin: { row: 2, col: 2 },
        orientation: "horizontal",
        hits: [true, true, true],
      },
    });
    expect(mem.clusters.length).toBe(0);
    expect(mem.remainingEnemyShips).toBe(4);
    expect(mem.mode).toBe("hunt");
  });

  it("stays in resolve while multiple isolated clusters are open", () => {
    let mem = createAiMemory(seededRng(17));
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 0, col: 0 } });
    expect(mem.mode).toBe("resolve");
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 0, col: 5 } });
    expect(mem.mode).toBe("resolve");
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 5, col: 0 } });
    expect(mem.mode).toBe("resolve");
    expect(mem.clusters.length).toBe(3);
  });

  it("keeps resolving leftover hits after a neighboring ship is sunk", () => {
    // Two ships placed orthogonally adjacent:
    //   carrier (5) horizontal at row 0, cols 0..4
    //   cruiser (3) vertical at col 0, rows 1..3
    // AI hits B1 (col 1) first, then A1, then walks the cluster down into A2,
    // A3, A4, sinking the cruiser. The remaining unsunk hits (A1, B1) belong
    // to the carrier and the AI should keep resolving them, not drop back to
    // random hunt.
    let mem = createAiMemory(seededRng(23));
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 0, col: 1 } });
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 0, col: 0 } });
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 1, col: 0 } });
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 2, col: 0 } });
    mem = recordAiShotResult(mem, {
      outcome: "sunk",
      coord: { row: 3, col: 0 },
      sunkShip: {
        type: "cruiser",
        length: 3,
        origin: { row: 1, col: 0 },
        orientation: "vertical",
        hits: [true, true, true],
      },
    });

    expect(mem.remainingEnemyShips).toBe(4);
    // Carrier hits at A1 and B1 must still be tracked.
    const remaining = new Set(
      mem.clusters.flatMap((c) => c.hits.map(coordKey)),
    );
    expect(remaining.has(coordKey({ row: 0, col: 0 }))).toBe(true);
    expect(remaining.has(coordKey({ row: 0, col: 1 }))).toBe(true);
    // With unsunk hits still on the board the AI must stay focused, not hunt.
    expect(mem.mode).toBe("resolve");
    const next = chooseAiShot(mem);
    // The next shot must extend the carrier cluster, not be a random hunt.
    const nextKey = coordKey(next);
    const validFollowups = new Set(
      [
        { row: 0, col: 2 },
        { row: 0, col: -1 }, // out of bounds; just for documentation
      ].map(coordKey),
    );
    expect(validFollowups.has(nextKey)).toBe(true);
  });

  it("resolves an isolated single hit when it is the only open lead", () => {
    let mem = createAiMemory(seededRng(29));
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 4, col: 4 } });
    // An open hit must be followed up; the AI should not wander off.
    expect(mem.mode).toBe("resolve");
    const next = chooseAiShot(mem);
    const neighborKeys = new Set(
      [
        { row: 3, col: 4 },
        { row: 5, col: 4 },
        { row: 4, col: 3 },
        { row: 4, col: 5 },
      ].map(coordKey),
    );
    expect(neighborKeys.has(coordKey(next))).toBe(true);
  });

  it("skips hunt cells where no remaining ship can fit", () => {
    // Box off rows 0-3 from the rest of the board with a horizontal wall of
    // misses across row 4. Then sink every ship except the 5-cell carrier.
    // Rows 0-3 hold a 4-row by 10-col window — only 4 contiguous cells in any
    // column — so the carrier (length 5) cannot fit anywhere in that window.
    // The AI must therefore not target any cell in rows 0-3.
    let mem = createAiMemory(seededRng(31));

    // Sink battleship (4), cruiser (3), submarine (3), destroyer (2). We
    // mark the cells used as misses below; here we only adjust the ship
    // length tracking via dummy sunk events that don't touch rows 0-3 or
    // the wall.
    const sunkSpecs = [
      { length: 4, origin: { row: 9, col: 0 }, orientation: "horizontal" as const },
      { length: 3, origin: { row: 9, col: 4 }, orientation: "horizontal" as const },
      { length: 3, origin: { row: 9, col: 7 }, orientation: "horizontal" as const },
      { length: 2, origin: { row: 8, col: 0 }, orientation: "horizontal" as const },
    ];
    for (const spec of sunkSpecs) {
      // Walk along each ship: hit each cell, then sink the last one.
      for (let i = 0; i < spec.length; i++) {
        const cell =
          spec.orientation === "horizontal"
            ? { row: spec.origin.row, col: spec.origin.col + i }
            : { row: spec.origin.row + i, col: spec.origin.col };
        const isLast = i === spec.length - 1;
        mem = recordAiShotResult(mem, {
          outcome: isLast ? "sunk" : "hit",
          coord: cell,
          ...(isLast
            ? {
                sunkShip: {
                  type: "destroyer",
                  length: spec.length,
                  origin: spec.origin,
                  orientation: spec.orientation,
                  hits: new Array(spec.length).fill(true),
                },
              }
            : {}),
        });
      }
    }
    // Wall off rows 0-3 with a row of misses across row 4.
    for (let c = 0; c < BOARD_SIZE; c++) {
      mem = recordAiShotResult(mem, { outcome: "miss", coord: { row: 4, col: c } });
    }

    expect(mem.remainingShipLengths).toEqual([5]);
    expect(mem.mode).toBe("hunt");
    const next = chooseAiShot(mem);
    // Carrier (5) cannot fit in rows 0-3 since the column-direction has only
    // 4 unshot cells (row 4 is a miss wall). So the AI must not target there.
    expect(next.row).toBeGreaterThan(4);
  });

  it("shrinks remainingShipLengths when a ship is sunk", () => {
    let mem = createAiMemory(seededRng(33));
    expect(mem.remainingShipLengths).toEqual([5, 4, 3, 3, 2]);
    mem = recordAiShotResult(mem, {
      outcome: "sunk",
      coord: { row: 0, col: 0 },
      sunkShip: {
        type: "destroyer",
        length: 2,
        origin: { row: 0, col: 0 },
        orientation: "horizontal",
        hits: [true, true],
      },
    });
    expect(mem.remainingShipLengths).toEqual([5, 4, 3, 3]);
    mem = recordAiShotResult(mem, {
      outcome: "sunk",
      coord: { row: 1, col: 0 },
      sunkShip: {
        type: "cruiser",
        length: 3,
        origin: { row: 1, col: 0 },
        orientation: "horizontal",
        hits: [true, true, true],
      },
    });
    // Removes one of the 3s, not both.
    expect(mem.remainingShipLengths).toEqual([5, 4, 3]);
  });

  it("enters resolve when few enemy ships remain", () => {
    let mem = createAiMemory(seededRng(19));
    // simulate 3 sinks to get down to 2 remaining
    for (let i = 0; i < 3; i++) {
      mem = recordAiShotResult(mem, {
        outcome: "sunk",
        coord: { row: i, col: 0 },
        sunkShip: {
          type: "destroyer",
          length: 1,
          origin: { row: i, col: 0 },
          orientation: "horizontal",
          hits: [true],
        },
      });
    }
    expect(mem.remainingEnemyShips).toBe(2);
    // Single hit now should trigger resolve because <=2 ships remain
    mem = recordAiShotResult(mem, { outcome: "hit", coord: { row: 5, col: 5 } });
    expect(mem.mode).toBe("resolve");
  });
});
