import {
  BOARD_SIZE,
  Board,
  Coordinate,
  Orientation,
  Placement,
  cellsFor,
  coordKey,
  inBounds,
} from "../engine/types";
import { shipAt, canPlace } from "../engine/placement";

const COL_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
// Labels (A-J column headers, 1-10 row headers) are intentionally not rendered.
// COL_LABELS is still used to compose aria-labels for each cell (e.g., "C7").

export interface BoardRenderOptions {
  board: Board;
  side: "player" | "ai";
  showShips: boolean;
  preview?: {
    origin: Coordinate;
    orientation: Orientation;
    length: number;
    valid: boolean;
  };
  lastShot?: Coordinate;
  onCellClick?: (c: Coordinate) => void;
  onCellHover?: (c: Coordinate | null) => void;
  interactive: boolean;
  placing?: boolean;
}

export function renderBoard(opts: BoardRenderOptions): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `board board-${opts.side}`;
  wrap.setAttribute("data-interactive", String(opts.interactive));
  if (opts.placing) wrap.setAttribute("data-placing", "true");

  const grid = document.createElement("div");
  grid.className = "board-grid";

  const previewCells = opts.preview
    ? new Set(
        cellsFor({
          origin: opts.preview.origin,
          orientation: opts.preview.orientation,
          length: opts.preview.length,
        }).map(coordKey),
      )
    : new Set<string>();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const coord: Coordinate = { row: r, col: c };
      const key = coordKey(coord);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute("aria-label", `${COL_LABELS[c]}${r + 1}`);

      const ship = shipAt(opts.board, coord);
      const shot = opts.board.shots.has(key);

      if (ship && opts.showShips) {
        cell.classList.add("has-ship");
        decorateShipSegment(cell, ship, coord);
      }

      if (shot) {
        if (ship) {
          cell.classList.add("hit");
          if (ship.hits.every(Boolean)) {
            cell.classList.add("sunk");
            // when sunk, reveal the ship art even on enemy board
            if (!opts.showShips) {
              cell.classList.add("has-ship");
              decorateShipSegment(cell, ship, coord);
            }
          }
        } else {
          cell.classList.add("miss");
        }
      }

      if (opts.lastShot && opts.lastShot.row === r && opts.lastShot.col === c) {
        cell.classList.add("last-shot");
      }

      if (previewCells.has(key)) {
        cell.classList.add(opts.preview!.valid ? "preview-ok" : "preview-bad");
      }

      if (opts.interactive) {
        cell.addEventListener("click", () => opts.onCellClick?.(coord));
        cell.addEventListener("mouseenter", () => opts.onCellHover?.(coord));
        cell.addEventListener("mouseleave", () => opts.onCellHover?.(null));
      } else {
        cell.disabled = true;
      }

      grid.appendChild(cell);
    }
  }

  wrap.appendChild(grid);
  return wrap;
}

function decorateShipSegment(cell: HTMLElement, ship: Placement, coord: Coordinate) {
  const cells = cellsFor(ship);
  const idx = cells.findIndex((c) => c.row === coord.row && c.col === coord.col);
  const last = cells.length - 1;
  const pos = idx === 0 ? "start" : idx === last ? "end" : "middle";
  cell.dataset.ship = ship.type;
  cell.dataset.shipOrient = ship.orientation;
  cell.dataset.shipPos = pos;
}

export function previewIsValid(
  board: Board,
  origin: Coordinate,
  orientation: Orientation,
  length: number,
  type: import("../engine/types").ShipType,
): boolean {
  const cells = cellsFor({ origin, orientation, length });
  if (!cells.every(inBounds)) return false;
  return canPlace(board, type, origin, orientation);
}
