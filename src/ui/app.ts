import {
  BOARD_SIZE,
  Coordinate,
  GameState,
  Orientation,
  SHIP_DEFS,
  ShipType,
  coordKey,
} from "../engine/types";
import {
  createGame,
  fireShot,
  startBattle,
} from "../engine/game";
import {
  canPlace,
  emptyBoard,
  isFleetComplete,
  placeShip,
  randomizeFleet,
  removeShip,
} from "../engine/placement";
import {
  AiMemory,
  advanceHuntIndex,
  chooseAiShot,
  createAiMemory,
  recordAiShotResult,
} from "../ai";
import { SoundPlayer } from "../sound/sounds";
import { renderBoard, previewIsValid } from "./board";

interface UiState {
  selectedShip: ShipType | null;
  orientation: Orientation;
  hover: Coordinate | null;
  status: string;
  lastPlayerShot?: Coordinate;
  lastAiShot?: Coordinate;
  aiThinking: boolean;
}

const AI_DELAY_MS = 650;

export class App {
  private root: HTMLElement;
  private game: GameState = createGame();
  private ai: AiMemory = createAiMemory();
  private ui: UiState = {
    selectedShip: "carrier",
    orientation: "horizontal",
    hover: null,
    status: "Setup — place your fleet",
    aiThinking: false,
  };
  private sound = new SoundPlayer();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start() {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.render();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.game.phase !== "setup") return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    ) {
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "r") {
      this.rotate();
      e.preventDefault();
    }
  }

  private newGame() {
    this.game = createGame();
    this.ai = createAiMemory();
    this.ui = {
      selectedShip: "carrier",
      orientation: "horizontal",
      hover: null,
      status: "Setup — place your fleet",
      aiThinking: false,
    };
    this.render();
  }

  private selectShip(type: ShipType) {
    if (this.game.phase !== "setup") return;
    this.ui.selectedShip = type;
    this.render();
  }

  private rotate() {
    if (this.game.phase !== "setup") return;
    this.ui.orientation =
      this.ui.orientation === "horizontal" ? "vertical" : "horizontal";
    this.render();
  }

  private randomize() {
    if (this.game.phase !== "setup") return;
    this.game = { ...this.game, player: randomizeFleet() };
    this.ui.selectedShip = null;
    this.render();
  }

  private clearFleet() {
    if (this.game.phase !== "setup") return;
    this.game = { ...this.game, player: emptyBoard() };
    this.ui.selectedShip = SHIP_DEFS[0].type;
    this.render();
  }

  private startGame() {
    if (this.game.phase !== "setup") return;
    if (!isFleetComplete(this.game.player)) return;
    const aiBoard = randomizeFleet();
    this.game = startBattle(this.game, aiBoard);
    this.ui.status = "Your turn — fire!";
    this.render();
  }

  private onPlayerBoardCellClick(coord: Coordinate) {
    if (this.game.phase !== "setup") return;
    // Click on an existing placed ship picks it up.
    const existing = this.game.player.ships.find((s) =>
      sShipCells(s).some((c) => c.row === coord.row && c.col === coord.col),
    );
    if (existing) {
      this.game = { ...this.game, player: removeShip(this.game.player, existing.type) };
      this.ui.selectedShip = existing.type;
      this.ui.orientation = existing.orientation;
      this.render();
      return;
    }
    if (!this.ui.selectedShip) return;
    const def = SHIP_DEFS.find((d) => d.type === this.ui.selectedShip)!;
    if (!canPlace(this.game.player, def.type, coord, this.ui.orientation)) return;
    this.game = { ...this.game, player: placeShip(this.game.player, def.type, coord, this.ui.orientation) };
    // Auto-pick next unplaced ship.
    const next = SHIP_DEFS.find((d) => !this.game.player.ships.some((s) => s.type === d.type));
    this.ui.selectedShip = next ? next.type : null;
    this.ui.hover = null;
    this.render();
  }

  private onPlayerBoardHover(coord: Coordinate | null) {
    if (this.game.phase !== "setup") return;
    const prev = this.ui.hover;
    const same =
      (prev === null && coord === null) ||
      (prev !== null &&
        coord !== null &&
        prev.row === coord.row &&
        prev.col === coord.col);
    if (same) return;
    this.ui.hover = coord;
    this.render();
  }

  private onAiBoardCellClick(coord: Coordinate) {
    if (this.game.phase !== "playing" || this.game.turn !== "player" || this.ui.aiThinking) return;
    if (this.game.ai.shots.has(coordKey(coord))) return;

    const { state, result } = fireShot(this.game, "player", coord);
    this.game = state;
    this.ui.lastPlayerShot = coord;

    if (result.outcome === "hit") {
      this.sound.play("hit");
      this.ui.status = "Hit! Computer's turn…";
    } else if (result.outcome === "sunk") {
      this.sound.play("sink");
      this.ui.status = "Sunk! Computer's turn…";
    } else if (result.outcome === "miss") {
      this.sound.play("miss");
      this.ui.status = "Miss — Computer's turn…";
    }

    if (result.winner === "player") {
      this.sound.play("win");
      this.ui.status = "You win!";
      this.render();
      return;
    }

    this.ui.aiThinking = true;
    this.render();
    window.setTimeout(() => this.aiTurn(), AI_DELAY_MS);
  }

  private aiTurn() {
    if (this.game.phase !== "playing" || this.game.turn !== "ai") {
      this.ui.aiThinking = false;
      this.render();
      return;
    }
    this.ai = advanceHuntIndex(this.ai);
    const target = chooseAiShot(this.ai);
    const { state, result } = fireShot(this.game, "ai", target);
    this.game = state;
    this.ai = recordAiShotResult(this.ai, result);
    this.ui.lastAiShot = target;

    if (result.winner === "ai") {
      this.sound.play("sink");
      this.sound.play("lose");
      this.ui.status = "Computer wins!";
    } else if (result.outcome === "sunk") {
      this.sound.play("sink");
      this.ui.status = "Computer sunk a ship! Your turn.";
    } else if (result.outcome === "hit") {
      this.sound.play("hit");
      this.ui.status = "Computer hit! Your turn.";
    } else if (result.outcome === "miss") {
      this.sound.play("miss");
      this.ui.status = "Your turn — fire!";
    }
    this.ui.aiThinking = false;
    this.render();
  }

  private toggleSound() {
    this.sound.toggle();
    this.render();
  }

  private render() {
    this.root.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "shell";

    const title = document.createElement("h1");
    title.className = "title";
    title.textContent = "BATTLESHIP";
    shell.appendChild(title);

    const main = document.createElement("div");
    main.className = "main";
    main.appendChild(this.renderPlayerPane());
    main.appendChild(this.renderStatusPanel());
    main.appendChild(this.renderAiPane());
    shell.appendChild(main);

    shell.appendChild(this.renderControls());

    this.root.appendChild(shell);

    if (this.game.phase === "ended") {
      this.root.appendChild(this.renderEndScreen());
    }
  }

  private renderEndScreen(): HTMLElement {
    const overlay = document.createElement("div");
    const won = this.game.winner === "player";
    overlay.className = `end-overlay ${won ? "end-win" : "end-lose"}`;

    const card = document.createElement("div");
    card.className = "end-card";

    const title = document.createElement("h2");
    title.className = "end-title";
    title.textContent = won ? "VICTORY" : "DEFEATED";
    card.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "end-sub";
    sub.textContent = won
      ? "Enemy fleet sunk. Well fought, Admiral."
      : "Your fleet lies on the ocean floor.";
    card.appendChild(sub);

    card.appendChild(this.renderScoreboard());

    const again = this.controlButton("Play Again", () => this.newGame());
    again.classList.add("primary");
    card.appendChild(again);

    overlay.appendChild(card);
    return overlay;
  }

  private renderPlayerPane(): HTMLElement {
    const pane = document.createElement("section");
    pane.className = "pane pane-player";
    const heading = document.createElement("h2");
    heading.className = "pane-heading";
    heading.textContent = "Your Waters";
    pane.appendChild(heading);

    const preview = this.computePreview();
    const board = renderBoard({
      board: this.game.player,
      side: "player",
      showShips: true,
      preview,
      lastShot: this.ui.lastAiShot,
      onCellClick: (c) => this.onPlayerBoardCellClick(c),
      onCellHover: (c) => this.onPlayerBoardHover(c),
      interactive: this.game.phase === "setup",
      placing: this.game.phase === "setup",
    });
    pane.appendChild(board);
    return pane;
  }

  private renderAiPane(): HTMLElement {
    const pane = document.createElement("section");
    pane.className = "pane pane-ai";
    const heading = document.createElement("h2");
    heading.className = "pane-heading";
    heading.textContent = "Enemy Waters";
    pane.appendChild(heading);

    const board = renderBoard({
      board: this.game.ai,
      side: "ai",
      showShips: false,
      lastShot: this.ui.lastPlayerShot,
      onCellClick: (c) => this.onAiBoardCellClick(c),
      interactive: this.game.phase === "playing" && this.game.turn === "player" && !this.ui.aiThinking,
    });
    pane.appendChild(board);
    return pane;
  }

  private renderStatusPanel(): HTMLElement {
    const panel = document.createElement("section");
    panel.className = "pane pane-status";

    const label = document.createElement("div");
    label.className = "status-label";
    label.textContent =
      this.game.phase === "setup" ? "SETUP" :
      this.game.phase === "ended" ? (this.game.winner === "player" ? "YOU WIN" : "COMPUTER WINS") :
      this.game.turn === "player" ? "YOUR TURN" : "COMPUTER";
    panel.appendChild(label);

    const status = document.createElement("div");
    status.className = "status-text";
    status.textContent = this.ui.status;
    panel.appendChild(status);

    if (this.game.phase === "setup") {
      panel.appendChild(this.renderFleetList());
    } else {
      panel.appendChild(this.renderScoreboard());
    }

    return panel;
  }

  private renderFleetList(): HTMLElement {
    const list = document.createElement("ul");
    list.className = "fleet-list";
    for (const def of SHIP_DEFS) {
      const placed = this.game.player.ships.some((s) => s.type === def.type);
      const item = document.createElement("li");
      item.className = "fleet-item";
      if (placed) item.classList.add("placed");
      if (this.ui.selectedShip === def.type) item.classList.add("selected");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fleet-btn";
      btn.disabled = this.game.phase !== "setup";
      btn.addEventListener("click", () => this.selectShip(def.type));

      const name = document.createElement("span");
      name.className = "fleet-name";
      name.textContent = def.label;

      const segments = document.createElement("span");
      segments.className = "fleet-segments";
      for (let i = 0; i < def.length; i++) {
        const seg = document.createElement("span");
        seg.className = "fleet-seg";
        segments.appendChild(seg);
      }

      const status = document.createElement("span");
      status.className = "fleet-status";
      status.textContent = placed ? "PLACED" : `${def.length}`;

      btn.appendChild(name);
      btn.appendChild(segments);
      btn.appendChild(status);
      item.appendChild(btn);
      list.appendChild(item);
    }
    return list;
  }

  private renderScoreboard(): HTMLElement {
    const board = document.createElement("div");
    board.className = "scoreboard";

    const sides: Array<{ label: string; board: import("../engine/types").Board }> = [
      { label: "You", board: this.game.player },
      { label: "Computer", board: this.game.ai },
    ];
    for (const { label, board: b } of sides) {
      const row = document.createElement("div");
      row.className = "score-row";
      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = label;
      row.appendChild(name);

      const pips = document.createElement("span");
      pips.className = "score-pips";
      for (const def of SHIP_DEFS) {
        const ship = b.ships.find((s) => s.type === def.type);
        const pip = document.createElement("span");
        pip.className = "score-pip";
        if (ship && ship.hits.every(Boolean)) pip.classList.add("sunk");
        pip.title = def.label;
        pips.appendChild(pip);
      }
      row.appendChild(pips);
      board.appendChild(row);
    }
    return board;
  }

  private renderControls(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "controls";

    const newGameBtn = this.controlButton("New Game", () => this.newGame());
    bar.appendChild(newGameBtn);

    const rotateBtn = this.controlButton("Rotate (R)", () => this.rotate());
    rotateBtn.disabled = this.game.phase !== "setup";
    bar.appendChild(rotateBtn);

    const randomizeBtn = this.controlButton("Randomize", () => this.randomize());
    randomizeBtn.disabled = this.game.phase !== "setup";
    bar.appendChild(randomizeBtn);

    const clearBtn = this.controlButton("Clear", () => this.clearFleet());
    clearBtn.disabled =
      this.game.phase !== "setup" || this.game.player.ships.length === 0;
    bar.appendChild(clearBtn);

    const startBtn = this.controlButton("Start Game", () => this.startGame());
    startBtn.classList.add("primary");
    startBtn.disabled =
      this.game.phase !== "setup" || !isFleetComplete(this.game.player);
    bar.appendChild(startBtn);

    const soundBtn = this.controlButton(
      this.sound.isEnabled() ? "Sound: On" : "Sound: Off",
      () => this.toggleSound(),
    );
    bar.appendChild(soundBtn);

    return bar;
  }

  private controlButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctrl";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private computePreview() {
    if (
      this.game.phase !== "setup" ||
      !this.ui.selectedShip ||
      !this.ui.hover
    ) {
      return undefined;
    }
    const def = SHIP_DEFS.find((d) => d.type === this.ui.selectedShip)!;
    const origin = this.ui.hover;
    // Don't show preview if hovering over an already-placed ship cell.
    if (
      this.game.player.ships.some((s) =>
        sShipCells(s).some((c) => c.row === origin.row && c.col === origin.col),
      )
    ) {
      return undefined;
    }
    const valid = previewIsValid(
      this.game.player,
      origin,
      this.ui.orientation,
      def.length,
      def.type,
    );
    // Also validate cells are inbounds (board.ts already does).
    if (
      origin.col + (this.ui.orientation === "horizontal" ? def.length - 1 : 0) >=
        BOARD_SIZE ||
      origin.row + (this.ui.orientation === "vertical" ? def.length - 1 : 0) >=
        BOARD_SIZE
    ) {
      return {
        origin,
        orientation: this.ui.orientation,
        length: def.length,
        valid: false,
      };
    }
    return {
      origin,
      orientation: this.ui.orientation,
      length: def.length,
      valid,
    };
  }
}

function sShipCells(s: import("../engine/types").Placement): Coordinate[] {
  const out: Coordinate[] = [];
  for (let i = 0; i < s.length; i++) {
    out.push(
      s.orientation === "horizontal"
        ? { row: s.origin.row, col: s.origin.col + i }
        : { row: s.origin.row + i, col: s.origin.col },
    );
  }
  return out;
}
