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
  timeLeft: 300,
  deck: [],
  backImage: null
};

function makeCharState() {
  return JSON.parse(JSON.stringify(BASE_INITIAL_STATE));
}

// ===== ゲーム状態 =====
let state = {
  player1: makeCharState(),
  player2: makeCharState(),
  matchData: {
    round: 1, turn: 1,
    turnPlayer: "player1",
    status: "setup_dice",
    dice: { player1: null, player2: null },
    diceTimeLeft: 30, choiceTimeLeft: 15,
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

// 自分のデータをサーバーにキャッシュ（200msデバウンス）
function saveDebounced() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => _pushMyState(), 200);
}

// 自分のデータをサーバーに即時キャッシュ（await可能）
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

  // Photon 接続中は Photon 経由で送信
  if (typeof PhotonSync !== "undefined" && PhotonSync.isConnected()) {
    PhotonSync.sendPlayerState();
    PhotonSync.sendMatchData();
    PhotonSync.sendFieldCards(fieldData);
    return Promise.resolve();
  }

  // HTTP フォールバック
  return fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameState: state, fieldCards: fieldData })
  }).catch(() => {});
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
// Photon 接続中は PhotonSync を使う
function _pushMyState() {
  // Photon 接続中は Photon 経由で送信
  if (typeof PhotonSync !== "undefined" && PhotonSync.isConnected()) {
    PhotonSync.sendPlayerState();
    PhotonSync.sendMatchData();
    return Promise.resolve();
  }

  // HTTP フォールバック
  const myRole = window.myRole;

  if (!myRole) {
    // ロール未確定時は全体を送る（timeLeft は除外）
    const { timeLeft: _t1, ...p1 } = state.player1;
    const { timeLeft: _t2, ...p2 } = state.player2;
    return fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameState: { player1: p1, player2: p2, matchData: state.matchData, logs: state.logs } })
    }).catch(() => {});
  }

  // 自分のプレイヤーデータ（timeLeft は表示キャッシュなので送らない）
  const { timeLeft: _ignored, ...myData } = state[myRole];

  return fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameState: {
        [myRole]: myData,
        matchData: state.matchData,
        logs: state.logs
      }
    })
  }).catch(() => {});
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
// Photon 接続中は PhotonSync を使う。未接続時は HTTP ポーリングにフォールバック。
let isPolling = false;
let lastLocalLogSentAt = 0;

async function syncLoop() {
  // Photon 接続中はポーリング不要
  if (typeof PhotonSync !== "undefined" && PhotonSync.isConnected()) return;

  if (isPolling) return;
  isPolling = true;
  try {
    // ユーザー名未取得なら whoami
    if (!window.myUsername) {
      try {
        const r = await fetch("/api/whoami");
        if (r.status === 401) { window.location.href = "/login.html"; return; }
        if (r.ok) { const d = await r.json(); window.myUsername = d.role; }
      } catch {}
    }

    const res = await fetch("/api/state");
    if (res.status === 401) { window.location.href = "/login.html"; return; }
    if (!res.ok) return;

    const data = await res.json();

    // levelStats 初回ロード
    if (!window._levelStatsLoaded) {
      await loadLevelStats();
      window._levelStatsLoaded = true;
    }

    const gs = data.gameState;
    if (!gs || Object.keys(gs).length === 0) {
      normalizeState();
      saveImmediate(); // 自分の初期状態を送る
      return;
    }

    // 初期状態スナップショット（リセット用）
    if (!window.serverInitialState) {
      window.serverInitialState = JSON.parse(JSON.stringify(gs));
    }

    // ロール確定（サーバーのデータから自分のロールを特定）
    if (window.myUsername) {
      if (gs.player1?.username === window.myUsername)      window.myRole = "player1";
      else if (gs.player2?.username === window.myUsername) window.myRole = "player2";
      if (window.myRole) { document.body.dataset.role = window.myRole; applyRotationVars(); }
    }

    const myRole = window.myRole;
    const opRole = myRole === "player1" ? "player2" : "player1";

    if (myRole) {
      // ===== 相手のプレイヤーデータを受け取る（timeLeft は除外） =====
      if (gs[opRole]) {
        const { timeLeft: _t, ...opData } = gs[opRole];
        state[opRole] = { ...state[opRole], ...opData };
      }

      // ===== 自分のプレイヤーデータ：username など未設定分のみ補完 =====
      if (gs[myRole] && !state[myRole].username && gs[myRole].username) {
        state[myRole].username = gs[myRole].username;
      }

      // ===== matchData の同期（timeLeft 系は GameTimer が管理） =====
      if (gs.matchData) {
        const md = gs.matchData;
        const iAmTurnPlayer = (md.turnPlayer === myRole);

        // 非タイマーフィールドのみ更新
        state.matchData = {
          ...state.matchData,
          round:       md.round,
          turn:        md.turn,
          turnPlayer:  md.turnPlayer,
          status:      md.status,
          dice:        md.dice,
          winner:      md.winner,
          firstPlayer: md.firstPlayer,
          diceTimeLeft:   md.diceTimeLeft,
          choiceTimeLeft: md.choiceTimeLeft,
          player1_endTimestamp: md.player1_endTimestamp,
          player1_timerSeq:     md.player1_timerSeq,
          player2_endTimestamp: md.player2_endTimestamp,
          player2_timerSeq:     md.player2_timerSeq,
        };

        // 相手のターン → endTimestamp を GameTimer に適用
        if (!iAmTurnPlayer && typeof GameTimer !== "undefined") {
          const tp    = md.turnPlayer;
          const endTs = md[tp + '_endTimestamp'];
          const seq   = md[tp + '_timerSeq'] || 0;
          if (endTs) GameTimer.applyFromServer(tp, endTs, seq, false, null);
        }
        // 自分のターン → GameTimer はすでに自分が start() しているので触らない
        // ただし再接続直後（GameTimer 未設定）の場合は endTimestamp から復元
        if (iAmTurnPlayer && typeof GameTimer !== "undefined") {
          const endTs = md[myRole + '_endTimestamp'];
          const seq   = md[myRole + '_timerSeq'] || 0;
          if (endTs && !GameTimer.serialize(myRole)) {
            // GameTimer が未設定 = 再接続後 → 復元
            GameTimer.applyFromServer(myRole, endTs, seq, false, null);
          }
        }
      }
    } else {
      // ロール未確定（再接続直後）→ timeLeft 以外の全データを受け取って復元
      if (gs.player1) { const { timeLeft: _, ...d } = gs.player1; state.player1 = { ...state.player1, ...d }; }
      if (gs.player2) { const { timeLeft: _, ...d } = gs.player2; state.player2 = { ...state.player2, ...d }; }
      if (gs.matchData) {
        state.matchData = gs.matchData;
        // 再接続時：endTimestamp から GameTimer を復元
        if (typeof GameTimer !== "undefined") {
          ["player1", "player2"].forEach(tp => {
            const endTs = gs.matchData[tp + '_endTimestamp'];
            const seq   = gs.matchData[tp + '_timerSeq'] || 0;
            if (endTs) GameTimer.applyFromServer(tp, endTs, seq, false, null);
          });
        }
      }
    }

    // ===== logs の同期 =====
    // 自分が最後に送ってから1.5秒以上経過していれば受け取る
    if (gs.logs && Date.now() - lastLocalLogSentAt > 1500) {
      state.logs = gs.logs;
    }

    // ===== fieldCards の同期 =====
    if (data.fieldCards && typeof applyFieldCardsFromServer === "function") {
      applyFieldCardsFromServer(data.fieldCards);
    }

    // ロール未確定なら自動割り当て
    if (window.myUsername && !window.myRole) {
      if (!state.player1.username) {
        state.player1.username = window.myUsername;
        window.myRole = "player1";
        saveImmediate();
      } else if (!state.player2.username) {
        state.player2.username = window.myUsername;
        window.myRole = "player2";
        saveImmediate();
      }
      if (window.myRole) { document.body.dataset.role = window.myRole; applyRotationVars(); }
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
    if (!state[p]) state[p] = makeCharState();
    if (!Array.isArray(state[p].deck)) state[p].deck = [];
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
      dice: { player1: null, player2: null },
      diceTimeLeft: 30, choiceTimeLeft: 15, winner: null, firstPlayer: null
    };
  }
  if (!state.matchData.dice) state.matchData.dice = { player1: null, player2: null };
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

  // Photon 接続中は Photon 経由で送信
  if (typeof PhotonSync !== "undefined" && PhotonSync.isConnected()) {
    PhotonSync.sendGameLog(entry);
    return;
  }
  saveDebounced();
}
window.addGameLog = addGameLog;

// ===== 初期化 =====
load();
syncLoop();
