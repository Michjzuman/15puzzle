const SIZE = 4;
const solvedState = Array.from({ length: SIZE * SIZE }, (_, idx) =>
  idx + 1 === SIZE * SIZE ? 0 : idx + 1
);

const boardEl = document.getElementById("board");
const tileTemplate = document.getElementById("tile-template");
const moveCountEl = document.getElementById("move-count");
const timerEl = document.getElementById("timer");
const bestTimeEl = document.getElementById("best-time");
const shuffleBtn = document.getElementById("shuffle-btn");
const resetBtn = document.getElementById("solve-btn");
const toastEl = document.getElementById("toast");
const toastTextEl = document.getElementById("toast-text");
const tickerTextEl = document.getElementById("ticker-text");

const BEST_TIME_KEY = "retro15-best-time";
const SAVE_KEY = "retro15-save";
const TICKER_REFRESH_MS = 10 * 60 * 1000; // 10 Minuten

let state = [...solvedState];
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
  loadBestTime();
  const restored = restoreGame();
  renderBoard();
  updateMoveDisplay();
  updateTimerDisplay(getElapsedTime());
  bindEvents();
  fetchTechNews();
  setInterval(fetchTechNews, TICKER_REFRESH_MS);

  if (!restored) {
    startGame();
  } else if (restored.shouldResume) {
    resumeTimer();
  }
}

function bindEvents() {
  shuffleBtn.addEventListener("click", startGame);
  resetBtn.addEventListener("click", resetBoard);
  window.addEventListener("keydown", handleKeyPress);
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
  const rowA = Math.floor(idxA / SIZE);
  const colA = idxA % SIZE;
  const rowB = Math.floor(idxB / SIZE);
  const colB = idxB % SIZE;
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

async function fetchTechNews() {
  if (!tickerTextEl) return;
  const fallbackText =
    "Tech-News: Live-Feed momentan nicht erreichbar. Mehr Glück beim Puzzle!";

  try {
    const response = await fetch(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&query=technology&hitsPerPage=8"
    );
    if (!response.ok) {
      throw new Error(`Ticker HTTP ${response.status}`);
    }
    const data = await response.json();
    const headlines = (data?.hits ?? [])
      .map((hit) => hit.title || hit.story_title || "")
      .map((title) => title.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 4);

    if (!headlines.length) {
      throw new Error("Keine Schlagzeilen erhalten");
    }

    tickerTextEl.textContent = `Tech-News: ${headlines.join(" — ")}`;
  } catch (error) {
    console.error("Ticker konnte nicht aktualisiert werden", error);
    tickerTextEl.textContent = fallbackText;
  }
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
  const blankRowFromBottom = SIZE - Math.floor(arr.indexOf(0) / SIZE);
  if (SIZE % 2 !== 0) {
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
  const stored = localStorage.getItem(BEST_TIME_KEY);
  if (!stored) {
    bestTimeEl.textContent = "--:--";
    return;
  }
  bestTime = Number(stored);
  bestTimeEl.textContent = formatTime(bestTime);
}

function updateBestTime(duration) {
  if (!duration) return;
  if (!bestTime || duration < bestTime) {
    bestTime = duration;
    localStorage.setItem(BEST_TIME_KEY, String(bestTime));
    bestTimeEl.textContent = formatTime(bestTime);
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
      if (blankIndex >= SIZE) targetIndex = blankIndex - SIZE;
      break;
    case "down":
      if (blankIndex < SIZE * (SIZE - 1)) targetIndex = blankIndex + SIZE;
      break;
    case "left":
      if (blankIndex % SIZE !== 0) targetIndex = blankIndex - 1;
      break;
    case "right":
      if (blankIndex % SIZE !== SIZE - 1) targetIndex = blankIndex + 1;
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
    if (!Array.isArray(data.board) || data.board.length !== solvedState.length) {
      return null;
    }
    const board = data.board.map((value) => Number(value));
    if (board.some((value) => Number.isNaN(value))) {
      return null;
    }
    state = board;
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
