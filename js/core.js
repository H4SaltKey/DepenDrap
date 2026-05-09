// ===== 基礎となる初期状態（不変） =====
const BASE_INITIAL_STATE = {
  level: 1,      levelMax: 6,
  exp: 0,        expMax: 2,
  hp: 20,        hpMax: 20,
  barrier: 0,    barrierMax: 5,
  shield: 0,     shieldMax: 0, shieldOverMax: false,
  atk: 5,        atkMax: 999,
  def: 0,        defMax: 999,
  instantDef: 0, instantDefMax: 999,
  deck: [],
  backImage: null
};

function makeCharState() {
  return JSON.parse(JSON.stringify(BASE_INITIAL_STATE));
}

// ===== ゲーム状態 =====
let state = {
  player1: { ...makeCharState(), diceValue: -1 },
  player2: { ...makeCharState(), diceValue: -1 },
  matchData: {
    round: 1, turn: 1,
    turnPlayer: "player1",
    status: "setup_dice",
    winner: null, firstPlayer: null
  },
  logs: []
};

// ===== 役割管理 =====
const GAME_STARTED_KEY = "gameStarted";
window.myRole     = null;
window.myUsername = null;

try {
  const setup = JSON.parse(localStorage.getItem("matchSetup") || "null");
  if (setup && (setup.role === "player1" || setup.role === "player2")) {
    window.myRole     = setup.role;
    window.myUsername = setup.self || setup.username;
  }
  if (!window.myUsername) window.myUsername = localStorage.getItem("username");
} catch {}

function applyRotationVars() {
  const role = window.myRole;
  if (!role) return;
  document.body.style.setProperty("--p1-rot", role === "player1" ? "0deg" : "180deg");
  document.body.style.setProperty("--p2-rot", role === "player2" ? "0deg" : "180deg");
  document.body.dataset.role = role;
}

window.getMyRole = function () {
  if (window.myRole) { applyRotationVars(); return window.myRole; }
  try {
    const setup = JSON.parse(localStorage.getItem("matchSetup") || "null");
    if (setup && (setup.role === "player1" || setup.role === "player2")) {
      window.myRole = setup.role;
      applyRotationVars();
      return window.myRole;
    }
  } catch {}
  return null;
};

function getMyState() { return state[window.myRole || "player1"]; }
function getOpState() { return state[window.myRole === "player1" ? "player2" : "player1"]; }

window.serverInitialState = null;
window.devMode = localStorage.getItem("devMode") === "true";

// ===== プレイヤー状態リセット（名前・デッキ維持） =====
function resetPlayerState(owner) {
  const s = state[owner];
  if (!s) return;
  const { username, deck, backImage } = s;
  Object.assign(s, makeCharState());
  s.username  = username;
  s.deck      = deck;
  s.backImage = backImage;
  delete s._lastAppliedLv;
}
window.resetPlayerState = resetPlayerState;

// ===== 保存 =====
// 設計原則：
//   自分のデータ（state[myRole]）は自分だけが変更・送信する
//   相手のデータ（state[opRole]）はサーバーから受け取るだけで絶対に書かない
//   matchData は手番プレイヤーが変更・送信する
//   値が変化した時のみサーバーに送る（毎秒ポーリングで受け取るだけ）

let saveTimeout = null;

// 自分のデータをサーバーに送信（200msデバウンス）
function saveDebounced() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => _pushMyState(), 200);
}

// 自分のデータをサーバーに即時送信（await可能）
function saveImmediate() {
  if (saveTimeout) clearTimeout(saveTimeout);
  localStorage.setItem("gameState", JSON.stringify(state));
  return _pushMyState();
}

// gameState + fieldCards を同時キャッシュ
function saveAllImmediate(customFieldCards = null) {
  if (saveTimeout) clearTimeout(saveTimeout);
  localStorage.setItem("gameState", JSON.stringify(state));
  if (typeof lastLocalFieldSaveAt !== "undefined") window.lastLocalFieldSaveAt = Date.now();
  const fieldData = customFieldCards || (typeof getFieldData === "function" ? getFieldData() : []);

  // Firebase 経由で同期（自動）
  // ローカルストレージに保存すれば、Firebase が自動的に同期
  return Promise.resolve();
}

// localStorage のみ（UI更新用、サーバーには送らない）
function saveLocal() {
  localStorage.setItem("gameState", JSON.stringify(state));
}

// 後方互換
function save() {
  saveLocal();
  saveDebounced();
}

// 実際の送信（自分のデータのみ送る、timeLeft は除外）
// Firebase 接続中は Firebase 経由で送信
function _pushMyState() {
  // ローカルストレージにのみ保存
  localStorage.setItem("gameState", JSON.stringify(state));
  return Promise.resolve();
}

window.saveImmediate    = saveImmediate;
window.saveAllImmediate = saveAllImmediate;
window.saveDebounced    = saveDebounced;

// ===== ローカル読み込み =====
function load() {
  const s = localStorage.getItem("gameState");
  if (s) {
    try {
      const loaded = JSON.parse(s);
      Object.keys(loaded).forEach(k => { if (state[k] !== undefined) state[k] = loaded[k]; });
    } catch {}
  }
  // matchSetup からの初期補完
  try {
    const setup = JSON.parse(localStorage.getItem("matchSetup") || "null");
    if (setup && window.myRole) {
      if (!state[window.myRole].username)
        state[window.myRole].username = window.myUsername || "";
      if (setup.deckCode && (!state[window.myRole].deck || state[window.myRole].deck.length === 0))
        state[window.myRole].deck = decodeDeck(setup.deckCode);
    }
  } catch {}
  normalizeState();
  applyLevelStats("player1");
  applyLevelStats("player2");
}

// ===== サーバー同期ループ =====
// Firebase 経由で同期（自動）
let isPolling = false;
let lastLocalLogSentAt = 0;

async function syncLoop() {
  // Firebase watcher が state を直接更新するため、
  // syncLoop は levelStats ロードと UI 更新のみ担当

  if (isPolling) return;
  isPolling = true;
  try {
    if (!window._levelStatsLoaded) {
      await loadLevelStats();
      window._levelStatsLoaded = true;
    }

    normalizeState();
    applyLevelStats("player1");
    applyLevelStats("player2");
    if (typeof update === "function") update();

  } catch (e) {
    console.error("Sync error:", e);
  } finally {
    isPolling = false;
  }
}

// 1秒ごとに同期
setInterval(syncLoop, 1000);

// ===== 状態正規化 =====
function normalizeState() {
  ["player1", "player2"].forEach(p => {
    if (!state[p]) state[p] = { ...makeCharState(), diceValue: -1 };
    if (!Array.isArray(state[p].deck)) state[p].deck = [];
    // diceValue が undefined/null の場合は -1 に初期化
    if (state[p].diceValue === undefined || state[p].diceValue === null) state[p].diceValue = -1;
    // matchSetup 由来の一時フラグを除去（ゲーム状態を汚染しない）
    delete state[p]._ready;
    delete state[p]._deckCode;
    ["hp", "shield", "barrier", "exp"].forEach(k => {
      const v  = state[p][k];
      const mx = state[p][k + "Max"] || 99;
      if (k !== "shield" && v > mx) state[p][k] = mx;
      if (v < 0) state[p][k] = 0;
    });
  });
  if (!state.matchData) {
    state.matchData = {
      round: 1, turn: 1, turnPlayer: "player1", status: "setup_dice",
      winner: null, firstPlayer: null
    };
  }
  state.logs = state.logs || [];
}

// ===== デッキ =====
function initDeckFromCode() {
  const deckCode = localStorage.getItem("deckCode");
  if (!deckCode) return false;
  try {
    getMyState().deck = decodeDeck(deckCode);
    return true;
  } catch {
    localStorage.removeItem("deckCode");
    getMyState().deck = [];
    window.deckLoadMessage = "カード構成が変わったためデッキをリセットしました。";
    return false;
  }
}

// ===== ゲーム開始フラグ =====
function isGameStarted()   { return localStorage.getItem(GAME_STARTED_KEY) === "true"; }
function markGameStarted() { localStorage.setItem(GAME_STARTED_KEY, "true"); }
function clearGameState()  {
  localStorage.removeItem("gameState");
  localStorage.removeItem("gameStarted");
  localStorage.removeItem("fieldCards");
}

// ===== レベルステータス =====
const LEVEL_MAX = 6;
let LEVEL_STATS = {
  atk:        [0, 0, 1, 2, 2, 3],
  def:        [0, 1, 1, 2, 3, 4],
  instantDef: [1, 1, 2, 2, 3, 3]
};

async function loadLevelStats() {
  try {
    const res = await fetch("data/levelStats.json");
    if (res.ok) LEVEL_STATS = await res.json();
  } catch (e) { console.error("levelStats.json load failed", e); }
}

async function saveLevelStats(stats) {
  try {
    const res = await fetch("/api/save-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "data/levelStats.json", data: stats })
    });
    if (res.ok) { LEVEL_STATS = stats; addGameLog("レベルステータスがサーバーに保存されました。"); }
  } catch (e) { console.error("Save failed", e); }
}

// BASE値 + レベルボーナスで絶対値セット（加算ではない）
function applyLevelStats(owner, force = false) {
  const s = state[owner];
  if (!s) return;
  const lv = s.level || 1;
  if (!force && s._lastAppliedLv === lv) return;
  const idx = Math.min(lv - 1, LEVEL_MAX - 1);
  s.atk        = BASE_INITIAL_STATE.atk        + (LEVEL_STATS.atk[idx]        || 0);
  s.def        = BASE_INITIAL_STATE.def        + (LEVEL_STATS.def[idx]        || 0);
  s.instantDef = BASE_INITIAL_STATE.instantDef + (LEVEL_STATS.instantDef[idx] || 0);
  s._lastAppliedLv = lv;
}

// ===== ログ =====
function addGameLog(msg) {
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  state.logs.push(entry);
  if (state.logs.length > 50) state.logs.shift();
  lastLocalLogSentAt = Date.now();

  // Firebase 経由で同期（自動）
  saveDebounced();
}
window.addGameLog = addGameLog;

// ===== 初期化 =====
load();
syncLoop();
