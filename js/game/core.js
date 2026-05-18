// state と初期状態は js/state/gameState.js に移動しました


// ===== 役割管理 =====
const GAME_STARTED_KEY = "gameStarted";
const GAME_STARTED_ROOM_KEY = "gameStartedRoom";
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
let reconnectSaveTimer = null;
let pushMyStateTimer = null;
const STORAGE_WARN_BYTES = Math.floor(5 * 1024 * 1024 * 0.9); // 5MB の90%
const RECONNECT_STATE_KEY = "reconnectState";
const LEGACY_LARGE_KEYS = ["gameState", "fieldCards"];

window.runtimeState = window.runtimeState || {
  drag: {},
  hover: {},
  menu: {},
  watcher: {},
  effects: {}
};
window.uiState = window.uiState || {};
window.saveState = window.saveState || { reconnect: {} };
window.debugMode = (localStorage.getItem("debugMode") === "true");
window.TRACE_GAME_FLOW = window.debugMode;
window._traceLastPhase = window._traceLastPhase || null;
window.setDebugMode = function(enabled) {
  const next = !!enabled;
  window.debugMode = next;
  window.TRACE_GAME_FLOW = next;
  localStorage.setItem("debugMode", next ? "true" : "false");
  console.log(`[Debug] debugMode=${next ? "ON" : "OFF"}`);
};

function shouldTrace(tag, stage) {
  if (!window.debugMode) return false;
  const s = String(stage || "");
  const t = String(tag || "");

  // 常時ループ系は出さない
  const noisyStages = new Set(["start", "end", "call", "success", "await", "check", "incoming", "return"]);

  // 常に出す: エラー/未定義系
  if (s === "failure" || s === "missing" || s === "aborted") return true;

  // フェーズ遷移
  if (t === "phaseTransition" && (s === "start" || s === "success" || s === "failure" || s === "end")) return true;
  if (t === "phaseProgression" && (s === "transition" || s === "failure")) return true;
  if (t === "bothConnected" && s === "set") return true;

  // watcher の開始/終了
  if ((t === "roomWatcher" || t === "diceWatcher" || t === "phaseWatcher") && (s === "start" || s === "end" || s === "failure")) return true;

  // init の開始/完了/失敗
  if (t === "firebaseJoined" && s === "received") return true;
  if (t === "initGame" && (s === "start" || s === "end" || s === "failure" || s === "return")) return true;

  // その他は抑制（毎tick防止）
  if (noisyStages.has(s)) return false;
  return false;
}

function traceFlow(tag, stage, details) {
  if (!shouldTrace(tag, stage)) return;
  if (details !== undefined) {
    console.log(`[TRACE] ${tag} ${stage}`, details);
  } else {
    console.log(`[TRACE] ${tag} ${stage}`);
  }
}
window.traceFlow = traceFlow;

window.tracePhaseDiff = function(source, currentPhase) {
  if (!window.debugMode) return;
  const next = currentPhase || "";
  const prev = window._traceLastPhase;
  if (prev === next) return;
  window._traceLastPhase = next;
  console.log(`[PHASE] ${prev || "(none)"} -> ${next} @${source}`);
};

function isQuotaExceededError(err) {
  return err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014);
}

function calcLocalStorageSizeBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) || "";
    total += (key.length + value.length) * 2; // UTF-16概算
  }
  return total;
}

function getLocalStorageEntriesBySize() {
  const rows = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) || "";
    rows.push({
      key,
      bytes: (key.length + value.length) * 2
    });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return rows;
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function logLocalStorageUsage(prefix = "[Storage]") {
  const totalBytes = calcLocalStorageSizeBytes();
  const msg = `${prefix} save size: ${formatKB(totalBytes)}`;
  console.log(msg);
  if (totalBytes >= STORAGE_WARN_BYTES) {
    console.warn(`${prefix} WARNING: localStorage usage is near 5MB (${formatKB(totalBytes)})`);
  }
  return totalBytes;
}
window.logLocalStorageUsage = logLocalStorageUsage;

window.inspectLocalStorageUsage = function() {
  const rows = getLocalStorageEntriesBySize();
  console.table(rows.map((r) => ({ key: r.key, sizeKB: (r.bytes / 1024).toFixed(1) })));
  return logLocalStorageUsage("[Storage][inspect]");
};

function ensureReconnectToken() {
  let token = localStorage.getItem("reconnectToken");
  if (!token) {
    token = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    localStorage.setItem("reconnectToken", token);
  }
  return token;
}

function buildReconnectState() {
  const roomId = localStorage.getItem("gameRoom") || null;
  const playerId = localStorage.getItem("gamePlayerKey") || window.myRole || null;
  const playerName = window.myUsername || localStorage.getItem("username") || null;
  const reconnectToken = ensureReconnectToken();
  const ui = {
    chatColor: localStorage.getItem("chatColor") || null,
    fieldZoom: localStorage.getItem("fieldZoom") || null,
    fieldPanX: localStorage.getItem("fieldPanX") || null,
    fieldPanY: localStorage.getItem("fieldPanY") || null
  };
  return {
    roomId,
    playerId,
    reconnectToken,
    playerName,
    ui,
    savedAt: Date.now()
  };
}

function createSafeReconnectStateCopy() {
  try {
    const reconnect = buildReconnectState();
    window.saveState.reconnect = reconnect;
    return JSON.stringify(reconnect);
  } catch (e) {
    return null;
  }
}

function safeLocalSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    logLocalStorageUsage();
    return true;
  } catch (e) {
    if (!isQuotaExceededError(e)) throw e;
    console.warn(`[Storage] Quota exceeded while writing ${key}. Trying fallback.`);
    try {
      LEGACY_LARGE_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    const fallbackJson = createSafeReconnectStateCopy();
    if (!fallbackJson) return false;
    try {
      localStorage.setItem(key, fallbackJson);
      logLocalStorageUsage("[Storage][fallback]");
      return true;
    } catch (err) {
      if (isQuotaExceededError(err)) {
        console.warn(`[Storage] Fallback save failed for ${key}, giving up.`);
        return false;
      }
      throw err;
    }
  }
}

function purgeLegacyLargeLocalKeys() {
  let removed = false;
  LEGACY_LARGE_KEYS.forEach((k) => {
    if (localStorage.getItem(k) != null) {
      localStorage.removeItem(k);
      removed = true;
    }
  });
  if (removed) {
    console.log("[Storage] Removed legacy heavy localStorage keys: gameState, fieldCards");
    logLocalStorageUsage("[Storage][purge]");
  }
}

function saveReconnectStateDebounced() {
  if (reconnectSaveTimer) clearTimeout(reconnectSaveTimer);
  reconnectSaveTimer = setTimeout(() => {
    const payload = createSafeReconnectStateCopy();
    if (!payload) return;
    safeLocalSetItem(RECONNECT_STATE_KEY, payload);
  }, 250);
}

function saveReconnectStateImmediate() {
  if (reconnectSaveTimer) clearTimeout(reconnectSaveTimer);
  const payload = createSafeReconnectStateCopy();
  if (!payload) return false;
  return safeLocalSetItem(RECONNECT_STATE_KEY, payload);
}

function sanitizeForSync(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 8) return undefined;
  const t = typeof value;
  if (t === "number" || t === "string" || t === "boolean") return value;
  if (t === "function" || t === "symbol") return undefined;
  if (typeof Element !== "undefined" && value instanceof Element) return undefined;
  if (typeof Node !== "undefined" && value instanceof Node) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeForSync(v, depth + 1))
      .filter((v) => v !== undefined);
  }
  if (t === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (k.startsWith("_")) return;
      const cleaned = sanitizeForSync(v, depth + 1);
      if (cleaned !== undefined) out[k] = cleaned;
    });
    return out;
  }
  return undefined;
}

window._getMyStateForSync = function() {
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const s = state[me];
  if (!s) return {};
  const deck = Array.isArray(s.deck) ? s.deck.slice() : [];
  return sanitizeForSync({
    username: s.username || "",
    backImage: s.backImage || "",
    level: Number(s.level || 1),
    exp: Number(s.exp || 0),
    expMax: Number(s.expMax || calcExpMax(s.level || 1)),
    hp: Number(s.hp || 0),
    hpMax: Number(s.hpMax || 0),
    shield: Number(s.shield || 0),
    shieldMax: Number(s.shieldMax || 0),
    defstack: Number(s.defstack || 0),
    defstackMax: Number(s.defstackMax || 0),
    defstackOverMax: !!s.defstackOverMax,
    atk: Number(s.atk || 0),
    def: Number(s.def || 0),
    instantDef: Number(s.instantDef || 0),
    pp: Number(s.pp || 0),
    ppMax: Number(s.ppMax || 2),
    diceValue: Number(s.diceValue ?? -1),
    evolutionPath: s.evolutionPath || null,
    evoContinuousDmgCount: Number(s.evoContinuousDmgCount || 0),
    evoBackwaterExpGained: !!s.evoBackwaterExpGained,
    statusBlocks: Array.isArray(s.statusBlocks) ? s.statusBlocks : [],
    deck,
    deckCount: deck.length
  }) || {};
};

// 自分のデータをサーバーに送信（200msデバウンス）
function saveDebounced() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => _pushMyState(), 200);
}

// 自分のデータをサーバーに即時送信（await可能）
function saveImmediate() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveReconnectStateImmediate();
  return _pushMyState();
}

// gameState + fieldCards を同時キャッシュ
function saveAllImmediate(customFieldCards = null) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveReconnectStateImmediate();
  if (typeof lastLocalFieldSaveAt !== "undefined") window.lastLocalFieldSaveAt = Date.now();
  const fieldData = customFieldCards || (typeof getFieldData === "function" ? getFieldData() : null);

  // フィールドカードの同期も実施
  if (typeof saveFieldCards === "function") {
    saveFieldCards(fieldData);
  }

  // 可能ならステータス同期も行う
  if (typeof saveImmediate === "function") {
    return saveImmediate();
  }
  return Promise.resolve();
}

// localStorage のみ（UI更新用、サーバーには送らない）
function saveLocal() {
  saveReconnectStateDebounced();
}

// 後方互換
function save() {
  saveLocal();
  saveDebounced();
}

// 実際の送信（自分のデータのみ送る、timeLeft は除外）
// Firebase 接続中は Firebase 経由で送信。localStorageには再接続情報のみ保存。
function _pushMyState() {
  saveReconnectStateDebounced();
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (!gameRoom || !firebaseClient?.db || !firebaseClient.writeMyState) {
    return Promise.resolve();
  }
  return firebaseClient.writeMyState(gameRoom, me, window._getMyStateForSync())
    .catch((e) => {
      console.warn("[Sync] writeMyState failed:", e?.message || e);
    });
}

window.pushMyStateDebounced = function() {
  if (pushMyStateTimer) clearTimeout(pushMyStateTimer);
  pushMyStateTimer = setTimeout(() => {
    _pushMyState();
  }, 250);
};

window.saveImmediate    = saveImmediate;
window.saveAllImmediate = saveAllImmediate;
window.saveDebounced    = saveDebounced;

// ===== ローカル読み込み =====
function load() {
  purgeLegacyLargeLocalKeys();
  saveReconnectStateImmediate();
  window.inspectLocalStorageUsage();
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
  traceFlow("syncLoop", "start");
  // Firebase watcher が state を直接更新するため、
  // syncLoop は levelStats ロードと UI 更新のみ担当

  if (isPolling) {
    traceFlow("syncLoop", "return", "already polling");
    return;
  }
  isPolling = true;
  try {
    if (!window._levelStatsLoaded) {
      traceFlow("syncLoop", "await", "loadLevelStats");
      await loadLevelStats();
      window._levelStatsLoaded = true;
      traceFlow("syncLoop", "success", "loadLevelStats");
    }

    normalizeState();
    applyLevelStats("player1");
    applyLevelStats("player2");
    if (typeof update === "function") {
      traceFlow("syncLoop", "call", "update");
      update();
      traceFlow("syncLoop", "success", "update");
    } else {
      traceFlow("syncLoop", "failure", "update missing");
    }

  } catch (e) {
    traceFlow("syncLoop", "failure", e?.message || e);
    console.error("Sync error:", e);
  } finally {
    isPolling = false;
    traceFlow("syncLoop", "end");
  }
}

// 1秒ごとに同期
setInterval(syncLoop, 1000);



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
function isGameStarted() {
  const started = localStorage.getItem(GAME_STARTED_KEY) === "true";
  if (!started) return false;
  const room = localStorage.getItem("gameRoom");
  const startedRoom = localStorage.getItem(GAME_STARTED_ROOM_KEY);
  return !!room && startedRoom === room;
}
function markGameStarted() {
  localStorage.setItem(GAME_STARTED_KEY, "true");
  const room = localStorage.getItem("gameRoom");
  if (room) localStorage.setItem(GAME_STARTED_ROOM_KEY, room);
}
function clearGameState()  {
  localStorage.removeItem(RECONNECT_STATE_KEY);
  localStorage.removeItem("gameStarted");
  localStorage.removeItem("gameStartedRoom");
  LEGACY_LARGE_KEYS.forEach((k) => localStorage.removeItem(k));
  logLocalStorageUsage("[Storage][clear]");
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
  const prevDef = Number(s.def) || 0;
  s.atk        = BASE_INITIAL_STATE.atk        + (LEVEL_STATS.atk[idx]        || 0);
  s.def        = BASE_INITIAL_STATE.def        + (LEVEL_STATS.def[idx]        || 0);
  s.instantDef = BASE_INITIAL_STATE.instantDef + (LEVEL_STATS.instantDef[idx] || 0);
  const defIncrease = (Number(s.def) || 0) - prevDef;
  if (defIncrease > 0) {
    s.defstack = (Number(s.defstack) || 0) + defIncrease;
  }
  s.defstackMax = Number(s.def) || 0;
  s._lastAppliedLv = lv;
}

// ===== ログ =====
function addGameLog(msg) {
  if (typeof msg === "string") {
    msg = msg
      .replace(/\[EVOLUTION\]/g, "[進化の道]")
      .replace(/\[ZONE\]/g, "[システム]")
      .replace(/\[(SYSTEM|DICE|MATCH)\]/g, "[システム]");
  }
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  
  // 既に同じログが存在する場合は追加しない（重複防止）
  if (state.logs.includes(entry)) {
    return;
  }
  
  state.logs.push(entry);
  if (state.logs.length > 50) state.logs.shift();
  lastLocalLogSentAt = Date.now();

  // Firebase にログを送信
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && typeof firebaseClient !== "undefined" && firebaseClient?.db) {
    const logRef = firebaseClient.db.ref(`rooms/${gameRoom}/logs`);
    logRef.push(entry);
  }

  // ローカルストレージに保存
  saveLocal();
}
window.addGameLog = addGameLog;

// ===== 初期化 =====
load();
syncLoop();
