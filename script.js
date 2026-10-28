const $ = (id) => document.getElementById(id);

const levels = {
  easy:   { name: "EASY", length: 4, attempts: 8, multiplier: 1 },
  medium: { name: "MEDIUM", length: 4, attempts: 6, multiplier: 2 },
  hard:   { name: "HARD", length: 5, attempts: 6, multiplier: 3 }
};

let selectedLevel = "easy";
let state = null;
let soundOn = true;
let audioContext = null;
const STORAGE_KEY = "treasureByteScoresV1";

document.querySelectorAll(".difficulty-card").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".difficulty-card").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");
    selectedLevel = button.dataset.level;
  });
});

$("soundBtn").addEventListener("click", () => {
  soundOn = !soundOn;
  $("soundBtn").textContent = soundOn ? "🔊" : "🔇";
  $("soundBtn").setAttribute("aria-label", soundOn ? "Mute sound" : "Enable sound");
});

function beep(frequency = 520, duration = 0.07) {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (_) { /* Sound is an optional enhancement. */ }
}

function makeSecret(length) {
  const digits = "0123456789".split("");
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, length).join("");
}

function getFeedback(secret, guess) {
  let exact = 0;
  for (let i = 0; i < secret.length; i++) if (secret[i] === guess[i]) exact++;
  const common = [...guess].filter((digit) => secret.includes(digit)).length;
  return { exact, misplaced: common - exact };
}

function generateClues(secret) {
  const digits = [...secret].map(Number);
  const clues = [
    `The sum of all digits is ${digits.reduce((a, b) => a + b, 0)}.`,
    `The first two digits add up to ${digits[0] + digits[1]}.`,
    `The last two digits add up to ${digits[digits.length - 2] + digits[digits.length - 1]}.`,
    `The code contains ${digits.filter((n) => n % 2 === 0).length} even digits.`,
    `The code contains ${digits.filter((n) => n % 2 !== 0).length} odd digits.`,
    `The difference between the first and last digits is ${Math.abs(digits[0] - digits[digits.length - 1])}.`
  ];
  if (digits.length >= 3) {
    clues.push(`The middle digits add up to ${digits.slice(1, -1).reduce((a, b) => a + b, 0)}.`);
  }
  const pairs = [];
  for (let i = 0; i < digits.length; i++) {
    for (let j = i + 1; j < digits.length; j++) pairs.push([i, j]);
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  const [i, j] = pairs[0];
  clues.push(`Digit at position ${i + 1} is ${digits[i] > digits[j] ? "greater" : "smaller"} than digit at position ${j + 1}.`);
  clues.push(`The first digit is ${digits[0]}.`);
  clues.push(`The last digit is ${digits[digits.length - 1]}.`);
  return clues.sort(() => Math.random() - 0.5);
}

function startGame() {
  const player = $("playerName").value.trim().slice(0, 18) || "Explorer";
  const config = levels[selectedLevel];
  state = {
    player, config, secret: makeSecret(config.length),
    clues: [], clueIndex: 0, attempts: 0, hints: 0, score: 0,
    history: [], finished: false
  };
  state.clues = generateClues(state.secret);
  $("setupScreen").classList.add("hidden");
  $("resultScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  $("panelTitle").textContent = "Your mission is live";
  $("levelBadge").textContent = config.name + " LEVEL";
  $("guessInput").maxLength = config.length;
  $("guessInput").placeholder = "Enter " + config.length + " unique digits";
  $("guessInput").value = "";
  $("guessInput").disabled = false;
  $("guessBtn").disabled = false;
  $("hintBtn").disabled = false;
  $("history").innerHTML = '<div class="empty-history">Your guesses will appear here.</div>';
  $("historyCount").textContent = "0 ENTRIES";
  $("feedback").className = "feedback neutral";
  $("feedback").textContent = "Vault detected. Enter your first code guess.";
  updateMetrics();
  updateCodeDisplay("");
  $("guessInput").focus();
  beep(620);
}

function updateMetrics() {
  const remaining = state.config.attempts - state.attempts;
  $("attemptsLeft").textContent = remaining;
  $("currentScore").innerHTML = `${state.score} <small>PTS</small>`;
  $("hintsUsed").textContent = state.hints;
  $("attemptProgress").style.width = `${(remaining / state.config.attempts) * 100}%`;
  $("attemptProgress").style.background = remaining <= 2 ? "var(--red)" : "var(--mint)";
}

function updateCodeDisplay(value) {
  const slots = $("codeDisplay").querySelectorAll(".code-slot");
  slots.forEach((slot, index) => slot.textContent = value[index] || "?");
  if (slots.length !== state.config.length) {
    $("codeDisplay").innerHTML = Array.from({ length: state.config.length }, (_, i) =>
      `<span class="code-slot">${value[i] || "?"}</span>`).join("");
  }
}

function validateGuess(guess) {
  if (!new RegExp(`^\\d{${state.config.length}}$`).test(guess)) {
    return `Enter exactly ${state.config.length} digits (0–9).`;
  }
  if (new Set(guess).size !== guess.length) return "Every digit must be unique. Try again.";
  return "";
}

function submitGuess() {
  if (!state || state.finished) return;
  const guess = $("guessInput").value.trim();
  const error = validateGuess(guess);
  if (error) {
    showFeedback(error, "error");
    beep(180, 0.12);
    $("guessInput").focus();
    return;
  }
  state.attempts++;
  const result = getFeedback(state.secret, guess);
  state.history.unshift({ guess, ...result, turn: state.attempts });
  updateHistory();
  updateCodeDisplay(guess);
  $("guessInput").value = "";
  if (result.exact === state.config.length) {
    const baseScore = Math.max(10, (state.config.attempts - state.attempts + 1) * 100);
    state.score = Math.max(0, baseScore * state.config.multiplier - state.hints * 50);
    updateMetrics();
    showFeedback("Perfect decode! The treasure vault is opening…", "success");
    beep(780, 0.12); setTimeout(() => beep(980, 0.18), 110);
    finishGame(true);
    return;
  }
  showFeedback(`${result.exact} exact match${result.exact === 1 ? "" : "es"} · ${result.misplaced} misplaced digit${result.misplaced === 1 ? "" : "s"}. Keep decoding!`, "neutral");
  updateMetrics();
  beep(400);
  if (state.attempts >= state.config.attempts) {
    finishGame(false);
  } else {
    $("guessInput").focus();
  }
}

function showFeedback(message, type = "neutral") {
  $("feedback").className = `feedback ${type}`;
  $("feedback").textContent = message;
}

function updateHistory() {
  $("historyCount").textContent = `${state.history.length} ENTR${state.history.length === 1 ? "Y" : "IES"}`;
  $("history").innerHTML = state.history.map((item) => `
    <div class="history-row">
      <span class="history-guess">${item.guess}</span>
      <span class="history-result"><b>${item.exact}</b> exact · ${item.misplaced} misplaced</span>
      <span class="history-turn">#${item.turn}</span>
    </div>`).join("");
}

function getScores() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function saveScore(won) {
  const scores = getScores();
  scores.push({
    name: state.player, score: state.score, won,
    level: state.config.name, date: new Date().toISOString()
  });
  scores.sort((a, b) => b.score - a.score || Number(b.won) - Number(a.won));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, 10)));
  renderLeaderboard();
}

function renderLeaderboard() {
  const scores = getScores();
  if (!scores.length) {
    $("leaderboard").innerHTML = '<div class="empty-history">Your best runs will be listed here.</div>';
    return;
  }
  $("leaderboard").innerHTML = scores.slice(0, 5).map((entry, index) => `
    <div class="leader-row"><span class="rank">${String(index + 1).padStart(2, "0")}</span>
    <span class="leader-name" title="${escapeHTML(entry.name)}">${escapeHTML(entry.name)} <small style="color:#738093">· ${entry.level}</small></span>
    <span class="leader-score">${entry.score} pts</span></div>`).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function finishGame(won) {
  state.finished = true;
  $("guessInput").disabled = true;
  $("guessBtn").disabled = true;
  $("hintBtn").disabled = true;
  $("panelTitle").textContent = won ? "Mission accomplished" : "Mission ended";
  $("levelBadge").textContent = won ? "VAULT UNLOCKED" : "TRY AGAIN";
  if (!won) state.score = 0;
  updateMetrics();
  saveScore(won);
  $("gameScreen").classList.add("hidden");
  $("resultScreen").classList.remove("hidden");
  $("resultIcon").textContent = won ? "🏆" : "🧭";
  $("resultTitle").textContent = won ? "Vault unlocked!" : "Keep exploring.";
  $("resultMessage").textContent = won
    ? `Outstanding work, ${state.player}. You cracked the code and claimed the treasure.`
    : `The vault remains sealed, ${state.player}. Every attempt teaches you something—ready for another run?`;
  $("resultCode").textContent = state.secret;
  $("finalScore").textContent = state.score;
  $("finalAttempts").textContent = state.attempts;
}

function requestHint() {
  if (!state || state.finished) return;
  if (state.clueIndex >= state.clues.length) {
    showFeedback("You have uncovered every available clue.", "hint");
    return;
  }
  const clue = state.clues[state.clueIndex++];
  state.hints++;
  state.score = Math.max(0, state.score - 50);
  updateMetrics();
  showFeedback(`CLUE ${state.clueIndex}: ${clue} (−50 points)`, "hint");
  beep(650, 0.1);
}

function resetToSetup() {
  state = null;
  $("gameScreen").classList.add("hidden");
  $("resultScreen").classList.add("hidden");
  $("setupScreen").classList.remove("hidden");
  $("panelTitle").textContent = "Initialize your mission";
  $("levelBadge").textContent = "NOT STARTED";
  $("playerName").focus();
}

$("startBtn").addEventListener("click", startGame);
$("guessBtn").addEventListener("click", submitGuess);
$("guessInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitGuess();
  if (event.key === "Escape") resetToSetup();
});
$("hintBtn").addEventListener("click", requestHint);
$("quitBtn").addEventListener("click", () => {
  if (!state || state.finished) return;
  const confirmQuit = window.confirm("Abort this mission? Your current run will be recorded as a loss.");
  if (confirmQuit) finishGame(false);
});
$("playAgainBtn").addEventListener("click", resetToSetup);
$("clearScoresBtn").addEventListener("click", () => {
  if (window.confirm("Clear the leaderboard saved in this browser?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderLeaderboard();
  }
});

renderLeaderboard();
