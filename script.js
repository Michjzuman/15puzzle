const SIZE_OPTIONS = [3, 4, 5, 6];
const SIZE_STORAGE_KEY = "retro15-size";
const SAVE_KEY = "retro15-save";
const BEST_TIME_KEY_PREFIX = "retro15-best-time-";

const sizeInputEl = document.getElementById("size-input");
const startScreenEl = document.getElementById("start-screen");
const startFormEl = document.getElementById("start-form");
const closeMenuBtn = document.getElementById("close-menu-btn");
const previewGridEl = document.querySelector("[data-preview-grid]");
const sizeOptionButtons = Array.from(
  document.querySelectorAll("[data-size-option]")
);

let size = getStoredSize();
let solvedState = createSolvedState(size);
let state = [...solvedState];

const boardEl = document.getElementById("board");
const tileTemplate = document.getElementById("tile-template");
const moveCountEl = document.getElementById("move-count");
const timerEl = document.getElementById("timer");
const bestTimeEl = document.getElementById("best-time");
const shuffleBtn = document.getElementById("shuffle-btn");
const resetBtn = document.getElementById("solve-btn");
const toastEl = document.getElementById("toast");
const toastTextEl = document.getElementById("toast-text");

const sizeMenuBtn = document.getElementById("size-btn");
const BEST_TIME_KEY = () => `${BEST_TIME_KEY_PREFIX}${size}`;

let moves = 0;
let bestTime = null;
let timerInterval = null;
let timerStartTimestamp = null;
let timerBase = 0;
let gameActive = false;
let toastTimeout;
let markedTiles = new Set();

const keyToDirection = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
};

init();

function init() {
  boardEl.style.setProperty("--size", size);
  loadBestTime();
  const restored = restoreGame();
  renderBoard();
  updateMoveDisplay();
  updateTimerDisplay(getElapsedTime());
  bindEvents();
  setPendingSizeSelection(size);
  updateSizeOptionTimes();

  if (!restored) {
    showStartScreen();
  } else if (restored.shouldResume) {
    resumeTimer();
  }
}

function bindEvents() {
  shuffleBtn.addEventListener("click", startGame);
  resetBtn.addEventListener("click", resetBoard);
  window.addEventListener("keydown", handleKeyPress);
  sizeMenuBtn.addEventListener("click", showStartScreen);
  startFormEl.addEventListener("submit", handleStartFormSubmit);
  closeMenuBtn.addEventListener("click", hideStartScreen);
  sizeOptionButtons.forEach((button) => {
    button.addEventListener("click", () => handleSizeOptionClick(button));
  });
}

function handleStartFormSubmit(event) {
  event.preventDefault();
  const selectedSize = Number(sizeInputEl?.value ?? size);
  if (!SIZE_OPTIONS.includes(selectedSize)) return;
  if (selectedSize !== size) {
    setSize(selectedSize);
  }
  hideStartScreen();
  startGame();
}

function handleSizeOptionClick(button) {
  const optionSize = Number(button.dataset.sizeOption);
  if (!SIZE_OPTIONS.includes(optionSize)) return;
  setPendingSizeSelection(optionSize);
}

function renderBoard() {
  const previousPositions = captureTilePositions();
  const leadingCorrectCount = getLeadingCorrectCount();
  boardEl.innerHTML = "";

  state.forEach((value, index) => {
    const tile = tileTemplate.content.firstElementChild.cloneNode(true);
    tile.dataset.index = index;
    tile.dataset.value = value ? String(value) : "";

    if (value === 0) {
      tile.classList.add("empty");
      tile.setAttribute("tabindex", "-1");
    } else {
      tile.textContent = value.toString().padStart(2, "0");
      const isLeadingCorrect =
        index < leadingCorrectCount && value === solvedState[index];
      tile.classList.toggle("correct", isLeadingCorrect);
      tile.classList.toggle("marked", markedTiles.has(value));
      tile.addEventListener("click", () => tryMove(index));
      tile.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        toggleTileMark(value, tile);
      });
    }

    boardEl.appendChild(tile);
  });

  requestAnimationFrame(() => playSlideAnimation(previousPositions));
}

function captureTilePositions() {
  const positions = new Map();
  boardEl.querySelectorAll(".tile").forEach((tile) => {
    if (tile.classList.contains("empty")) return;
    const value = Number(tile.dataset.value);
    if (!value) return;
    positions.set(value, tile.getBoundingClientRect());
  });
  return positions;
}

function getLeadingCorrectCount() {
  let count = 0;
  while (count < state.length && state[count] === solvedState[count]) {
    count += 1;
  }
  return count;
}

function playSlideAnimation(previousPositions) {
  if (!previousPositions.size) return;
  boardEl.querySelectorAll(".tile").forEach((tile) => {
    if (tile.classList.contains("empty")) return;
    const value = Number(tile.dataset.value);
    if (!value) return;
    const from = previousPositions.get(value);
    if (!from) return;
    const to = tile.getBoundingClientRect();
    const deltaX = from.left - to.left;
    const deltaY = from.top - to.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    tile.style.transition = "none";
    tile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    requestAnimationFrame(() => {
      tile.classList.add("is-moving");
      tile.style.transition = "transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)";
      tile.style.transform = "translate(0, 0)";
    });

    const cleanup = () => {
      tile.classList.remove("is-moving");
      tile.style.transition = "";
      tile.style.transform = "";
      tile.removeEventListener("transitionend", cleanup);
    };
    tile.addEventListener("transitionend", cleanup);
  });
}

function tryMove(index) {
  if (!gameActive) return false;
  const blankIndex = state.indexOf(0);
  if (!isAdjacent(index, blankIndex)) return false;

  [state[index], state[blankIndex]] = [state[blankIndex], state[index]];
  moves += 1;
  updateMoveDisplay();
  renderBoard();

  if (!checkWinCondition()) {
    saveGame();
  }
  return true;
}

function isAdjacent(idxA, idxB) {
  const rowA = Math.floor(idxA / size);
  const colA = idxA % size;
  const rowB = Math.floor(idxB / size);
  const colB = idxB % size;
  return (
    (rowA === rowB && Math.abs(colA - colB) === 1) ||
    (colA === colB && Math.abs(rowA - rowB) === 1)
  );
}

function startGame() {
  state = generateSolvableState();
  moves = 0;
  markedTiles.clear();
  gameActive = true;
  updateMoveDisplay();
  renderBoard();
  startTimer();
  showToast("Shuffle komplett. Viel Erfolg!");
  saveGame();
}

function resetBoard() {
  state = [...solvedState];
  moves = 0;
  markedTiles.clear();
  gameActive = false;
  updateMoveDisplay();
  renderBoard();
  stopTimer({ resetDisplay: true });
  showToast("Zurückgesetzt.");
  saveGame();
}

function generateSolvableState() {
  let shuffled = [...solvedState];
  do {
    shuffled = shuffleArray([...solvedState]);
  } while (!isSolvable(shuffled) || arraysMatch(shuffled, solvedState));
  return shuffled;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSolvable(arr) {
  const inversionCount = getInversionCount(arr);
  const blankRowFromBottom = size - Math.floor(arr.indexOf(0) / size);
  if (size % 2 !== 0) {
    return inversionCount % 2 === 0;
  }
  if (blankRowFromBottom % 2 === 0) {
    return inversionCount % 2 !== 0;
  }
  return inversionCount % 2 === 0;
}

function getInversionCount(arr) {
  let inversions = 0;
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      if (arr[i] && arr[j] && arr[i] > arr[j]) {
        inversions += 1;
      }
    }
  }
  return inversions;
}

function arraysMatch(a, b) {
  return a.every((value, idx) => value === b[idx]);
}

function checkWinCondition() {
  if (!arraysMatch(state, solvedState)) return false;
  const elapsed = stopTimer();
  gameActive = false;
  const formatted = formatTime(elapsed);
  showToast(`Mission erfüllt in ${formatted}.`);
  updateBestTime(elapsed);
  saveGame();
  return true;
}

function startTimer() {
  stopTimer({ resetDisplay: true });
  timerStartTimestamp = Date.now();
  timerInterval = window.setInterval(() => {
    updateTimerDisplay(getElapsedTime());
  }, 120);
}

function resumeTimer() {
  if (timerStartTimestamp) return;
  timerStartTimestamp = Date.now();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  timerInterval = window.setInterval(() => {
    updateTimerDisplay(getElapsedTime());
  }, 120);
}

function stopTimer({ resetDisplay = false } = {}) {
  let elapsed = getElapsedTime();
  if (timerStartTimestamp) {
    timerBase += Date.now() - timerStartTimestamp;
    timerStartTimestamp = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (resetDisplay) {
    timerBase = 0;
    elapsed = 0;
  } else {
    timerBase = elapsed;
  }
  updateTimerDisplay(elapsed);
  return elapsed;
}

function getElapsedTime() {
  return timerBase + (timerStartTimestamp ? Date.now() - timerStartTimestamp : 0);
}

function updateTimerDisplay(ms) {
  timerEl.textContent = formatTime(ms);
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateMoveDisplay() {
  moveCountEl.textContent = String(moves).padStart(3, "0");
}

function loadBestTime() {
  const stored = localStorage.getItem(BEST_TIME_KEY());
  if (!stored) {
    bestTime = null;
    bestTimeEl.textContent = "--:--";
  } else {
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed >= 0) {
      bestTime = parsed;
      bestTimeEl.textContent = formatTime(bestTime);
    } else {
      bestTime = null;
      bestTimeEl.textContent = "--:--";
    }
  }
  updateSizeOptionTimes();
}

function updateBestTime(duration) {
  if (!Number.isFinite(duration)) return;
  if (bestTime === null || duration < bestTime) {
    bestTime = duration;
    bestTimeEl.textContent = formatTime(bestTime);
    try {
      localStorage.setItem(BEST_TIME_KEY(), String(bestTime));
    } catch {
      // ignore quota errors
    }
    updateSizeOptionTimes();
  }
}

function handleKeyPress(event) {
  const dir = keyToDirection[event.key];
  if (!dir) return;
  event.preventDefault();
  moveByDirection(dir);
}

function moveByDirection(direction) {
  const blankIndex = state.indexOf(0);
  let targetIndex = null;
  switch (direction) {
    case "up":
      if (blankIndex >= size) targetIndex = blankIndex - size;
      break;
    case "down":
      if (blankIndex < size * (size - 1)) targetIndex = blankIndex + size;
      break;
    case "left":
      if (blankIndex % size !== 0) targetIndex = blankIndex - 1;
      break;
    case "right":
      if (blankIndex % size !== size - 1) targetIndex = blankIndex + 1;
      break;
    default:
      break;
  }
  if (targetIndex !== null) {
    tryMove(targetIndex);
  }
}

function toggleTileMark(value, tileElement) {
  if (!value) return;
  if (markedTiles.has(value)) {
    markedTiles.delete(value);
  } else {
    markedTiles.add(value);
  }
  if (tileElement) {
    tileElement.classList.toggle("marked", markedTiles.has(value));
  }
  saveGame();
}

function saveGame() {
  const payload = {
    board: [...state],
    moves,
    gameActive,
    timerBase: getElapsedTime(),
    timerRunning: Boolean(timerStartTimestamp),
    markedTiles: Array.from(markedTiles),
    size,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

function restoreGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.board)) {
      return null;
    }
    const board = data.board.map((value) => Number(value));
    if (board.some((value) => Number.isNaN(value))) {
      return null;
    }
    const derivedSize = Number.isFinite(data.size)
      ? Number(data.size)
      : Math.sqrt(board.length);
    if (!SIZE_OPTIONS.includes(derivedSize)) {
      return null;
    }
    setSize(derivedSize, { preserveState: true });
    state = [...board];
    if (state.length !== size * size) {
      return null;
    }
    moves = Number.isFinite(data.moves) ? data.moves : 0;
    gameActive = Boolean(data.gameActive);
    timerBase = Number.isFinite(data.timerBase) ? data.timerBase : 0;
    timerStartTimestamp = null;
    if (Array.isArray(data.markedTiles)) {
      const cleaned = data.markedTiles
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      markedTiles = new Set(cleaned);
    } else {
      markedTiles = new Set();
    }
    return { shouldResume: Boolean(data.timerRunning && gameActive) };
  } catch {
    return null;
  }
}

function showToast(message) {
  toastTextEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2200);
}

function createSolvedState(currentSize) {
  return Array.from({ length: currentSize * currentSize }, (_, idx) =>
    idx + 1 === currentSize * currentSize ? 0 : idx + 1
  );
}

function getStoredSize() {
  const stored = Number(localStorage.getItem(SIZE_STORAGE_KEY));
  if (SIZE_OPTIONS.includes(stored)) {
    return stored;
  }
  return 4;
}

function setSize(newSize, { preserveState = false } = {}) {
  if (!SIZE_OPTIONS.includes(newSize)) return;
  const hasChanged = size !== newSize;
  size = newSize;
  solvedState = createSolvedState(size);
  boardEl.style.setProperty("--size", size);
  localStorage.setItem(SIZE_STORAGE_KEY, String(size));
  loadBestTime();
  setPendingSizeSelection(size);
  if (!preserveState && hasChanged) {
    state = [...solvedState];
    moves = 0;
    markedTiles.clear();
    gameActive = false;
    stopTimer({ resetDisplay: true });
    updateMoveDisplay();
    renderBoard();
  }
}

function showStartScreen() {
  setPendingSizeSelection(size);
  updateSizeOptionTimes();
  startScreenEl.classList.add("is-visible");
  startScreenEl.setAttribute("aria-hidden", "false");
}

function hideStartScreen() {
  startScreenEl.classList.remove("is-visible");
  startScreenEl.setAttribute("aria-hidden", "true");
}

function setPendingSizeSelection(selectedSize) {
  if (sizeInputEl) {
    sizeInputEl.value = String(selectedSize);
  }
  sizeOptionButtons.forEach((button) => {
    const buttonSize = Number(button.dataset.sizeOption);
    const isActive = buttonSize === selectedSize;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  updatePreviewGrid(selectedSize);
}

function getBestTimeForSize(targetSize) {
  if (!SIZE_OPTIONS.includes(targetSize)) return null;
  const stored = localStorage.getItem(`${BEST_TIME_KEY_PREFIX}${targetSize}`);
  if (!stored) return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

function updateSizeOptionTimes() {
  if (!sizeOptionButtons.length) return;
  sizeOptionButtons.forEach((button) => {
    const buttonSize = Number(button.dataset.sizeOption);
    const bestTimeValue = getBestTimeForSize(buttonSize);
    const label = button.querySelector("[data-best-time]");
    if (label) {
      label.textContent =
        bestTimeValue !== null
          ? `Bestzeit: ${formatTime(bestTimeValue)}`
          : "Bestzeit: --:--";
    }
  });
}

function updatePreviewGrid(previewSize) {
  if (!previewGridEl) return;
  const target = SIZE_OPTIONS.includes(previewSize) ? previewSize : size;
  previewGridEl.style.setProperty("--preview-size", target);
  previewGridEl.innerHTML = "";
  const totalCells = target * target;
  for (let i = 0; i < totalCells; i += 1) {
    const cell = document.createElement("span");
    cell.className = "preview-cell";
    if (i === totalCells - 1) {
      cell.classList.add("is-empty");
    }
    previewGridEl.appendChild(cell);
  }
}
