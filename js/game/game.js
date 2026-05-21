let gameReady = false;
window._soloStartMode = false;
let lastTurnDrawKey = "";
let handOverflowDiscardOpen = false;
window._lastRound = 0; // 初期化
window._syncGate = window._syncGate || {
  firebaseReady: false,
  roomWatcherReady: false,
  playersReady: false,
  phaseReady: false,
  initDone: false
};

function updateSyncLoadingOverlay() {
  const overlay = document.getElementById("syncLoadingOverlay");
  const detail = document.getElementById("syncLoadingDetail");
  if (!overlay) return;
  const gate = window._syncGate || {};
  const ready = !!(gate.firebaseReady && gate.roomWatcherReady && gate.playersReady && gate.phaseReady && gate.initDone);
  overlay.style.display = ready ? "none" : "flex";
  if (!detail || ready) return;
  const missing = [];
  if (!gate.firebaseReady) missing.push("Firebase");
  if (!gate.roomWatcherReady) missing.push("RoomWatcher");
  if (!gate.playersReady) missing.push("対戦相手接続");
  if (!gate.phaseReady) missing.push("Phase同期");
  if (!gate.initDone) missing.push("初期化");
  detail.textContent = missing.length > 0 ? `${missing.join(" / ")} を待機中` : "同期中";
}

window.notifySyncGate = function(flag, value = true) {
  if (!window._syncGate) return;
  if (!(flag in window._syncGate)) return;
  window._syncGate[flag] = !!value;
  updateSyncLoadingOverlay();
};

window.isGameInteractionLocked = function() {
  const isGamePage = window.location.pathname.endsWith("game.html") || !!document.getElementById("field");
  if (!isGamePage) return false;
  const status = state.matchData?.status;
  if (state.matchData?.winner || window._lastWinner) return true;
  
  // 進行中のフェーズ（ready_check, setup_dice 以外）であれば、一時的な切断でロックしない
  const inGamePhase = status && status !== "ready_check" && status !== "setup_dice";
  if (inGamePhase) return false;
  
  return !window._soloStartMode && (!window._bothPlayersConnected || status === "ready_check");
};

function applyInteractionLockState() {
  document.body.classList.toggle("preGameLocked", window.isGameInteractionLocked());
}

function traceGame(tag, stage, details) {
  if (typeof window.traceFlow === "function") {
    window.traceFlow(tag, stage, details);
    return;
  }
  if (window.TRACE_GAME_FLOW) {
    if (details !== undefined) console.log(`[TRACE] ${tag} ${stage}`, details);
    else console.log(`[TRACE] ${tag} ${stage}`);
  }
}

function invokeGuarded(stepName, fn, fallback) {
  traceGame(stepName, "start");
  try {
    const result = fn();
    traceGame(stepName, "success");
    return result;
  } catch (e) {
    traceGame(stepName, "failure", e?.message || e);
    console.error(`[${stepName}] failed:`, e);
    return fallback;
  }
}

function runPhaseProgression() {
  traceGame("phaseProgression", "start", {
    bothConnected: !!window._bothPlayersConnected,
    status: state?.matchData?.status
  });
  if (!state?.matchData) {
    traceGame("phaseProgression", "return", "matchData missing");
    return;
  }
  if (window._bothPlayersConnected && state.matchData.status === "ready_check") {
    traceGame("phaseProgression", "transition", "ready_check -> setup_dice");
    const prev = state.matchData.status;
    state.matchData.status = "setup_dice";
    console.log(`[PHASE] local -> ${state.matchData.status}`);
    if (typeof window.tracePhaseDiff === "function") {
      window.tracePhaseDiff("runPhaseProgression", state.matchData.status);
    } else if (window.debugMode) {
      console.log(`[PHASE] ${prev} -> ${state.matchData.status} @runPhaseProgression`);
    }
    if (typeof GameTimer !== "undefined") {
      traceGame("phaseProgression", "call", "GameTimer.start(dice)");
      GameTimer.start("dice", 10000);
    }
    if (firebaseClient?.db) {
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom) {
        firebaseClient.writeMatchData(gameRoom, state.matchData)
          .then((ok) => {
            if (ok) console.log("[PHASE] firebase write success");
          })
          .catch((e) => {
            traceGame("phaseProgression", "failure", e?.message || e);
          });
      } else {
        traceGame("phaseProgression", "failure", "gameRoom missing");
      }
    } else {
      traceGame("phaseProgression", "failure", "firebaseClient.db missing");
    }
  }
  traceGame("phaseProgression", "end");
}
window.runPhaseProgression = runPhaseProgression;

// setSafeSrc は cardManager.js で定義済み（重複定義を削除）

// ===== ゲーム状態リセット =====
/**
 * 両プレイヤーが退出した場合、すべての変数をリセット
 */
function resetAllGameVariables() {
  console.log("[Game] すべてのゲーム変数をリセット");
  
  // ゲーム状態をリセット
  gameReady = false;
  lastResetAt = 0;
  lastTurnPlayer = null;
  window._lastRound = undefined; // ラウンド通知用の記憶もリセット
  window._isResetting = false; // リセット中フラグをクリア
  window._resultShowing = false; // リザルト表示フラグをクリア
  window._resultDismissed = false; // リザルト非表示フラグをクリア
  window._firstDrawPhaseStarted = false;
  window._firstDrawAdvanceSent = false;  // ファーストドロー送信フラグをリセット
  window.__playingStarted = false;       // ファーストドロー→playing遷移フラグをリセット
  window._orderPhaseAutoStartScheduled = false; // Order phase auto-start flag
  window._soloStartMode = false;
  cardsReadyFired = false;
  lastStateJson = "";
  sliderActive = false;
  window._gameStartInitiated = false;
  
  // state をリセット
  state = {
    player1: {
      ...makeCharState(),
      diceValue: -1
    },
    player2: {
      ...makeCharState(),
      diceValue: -1
    },
    matchData: {
      round: 1, turn: 1,
      turnPlayer: "player1",
      status: "ready_check",
      winner: null, firstPlayer: null
    },
    logs: []
  };
  
  // localStorage をクリア
  localStorage.removeItem("gameState");
  localStorage.removeItem("fieldCards");
  localStorage.removeItem("gameStarted");
  localStorage.removeItem("gameStartedRoom");
  localStorage.removeItem("gameRoom");
  localStorage.removeItem("gamePlayerKey");
  
  // UI をリセット
  const overlay = document.getElementById("dicePhaseOverlay");
  if (overlay) overlay.remove();

  const firstDrawOv = document.getElementById("firstDrawPhaseOverlay");
  if (firstDrawOv) firstDrawOv.remove();
  
  const orderOverlay = document.getElementById("orderDecideOverlay");
  if (orderOverlay) orderOverlay.style.display = "none";
  
  const matchInfo = document.getElementById("matchInfoDisplay");
  if (matchInfo) matchInfo.innerHTML = "";
  
  const turnEndBtn = document.getElementById("turnEndBtn");
  if (turnEndBtn) turnEndBtn.style.display = "none";
  
  const gameUiPlayer = document.getElementById("gameUiPlayer");
  if (gameUiPlayer) gameUiPlayer.innerHTML = "";
  
  const gameUiEnemy = document.getElementById("gameUiEnemy");
  if (gameUiEnemy) gameUiEnemy.innerHTML = "";
  
  // フィールドをクリア
  const fieldContent = getFieldContent();
  if (fieldContent) {
    fieldContent.querySelectorAll(".card, .deckObject").forEach(el => el.remove());
  }
  if (typeof window.resetBattleZoneState === "function") window.resetBattleZoneState();
  
  console.log("[Game] ✅ ゲーム変数リセット完了");
}

// ===== シャッフル =====
function shuffleDeck() {
  const d = getMyState().deck;
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
}

// ===== デッキオブジェクト =====
function getBackImage() {
  try {
    const deckCode = localStorage.getItem("deckCode");
    const list = JSON.parse(localStorage.getItem("deckList")) || [];
    const entry = list.find(d => d.code === deckCode) || list[list.length - 1];
    return entry && entry.backImage ? entry.backImage : null;
  } catch {
    return null;
  }
}

function createDeckObject(forceResetPos = false) {
  const currentRole = window.getMyRole();
  if (!currentRole && !forceResetPos) return; // 役割が決まるまで待機

  const content = getFieldContent();
  if (!content) return;

  // 既存のデッキオブジェクトを削除（一旦クリア）
  content.querySelectorAll(".deckObject").forEach(el => el.remove());

  ["player1", "player2"].forEach(owner => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("deckObject");
    wrapper.dataset.instanceId = "deckObject_" + owner;
    wrapper.dataset.owner = owner;

    // 相手のデッキ画像も表示（backImageが設定されていない場合は404.pngをフォールバック）
    const backImage = state[owner]?.backImage || "assets/404.png";
    const img = document.createElement("img");
    img.draggable = false;
    setSafeSrc(img, backImage);

    const countLabel = document.createElement("div");
    countLabel.classList.add("deckObjectCount");
    countLabel.textContent = state[owner]?.deck?.length || 0;

    wrapper.appendChild(img);
    wrapper.appendChild(countLabel);

    const isMe = (owner === currentRole);
    const savedPos = forceResetPos ? null : window._savedDeckPos;

    // 相手のデッキには一切イベントを付けず、座標も固定
    if (isMe) {
      wrapper.addEventListener("dblclick", () => {
        if (!gameReady) return;
        if (typeof window.drawCards === "function") window.drawCards(1);
      });
      enablePointerDrag(wrapper);

      // 自分から見て左下に配置する
      if (forceResetPos) {
        const lx = -320;
        const ly = 1547;
        wrapper.style.left = lx + "px";
        wrapper.style.top = ly + "px";
        wrapper.dataset.x = lx;
        wrapper.dataset.y = ly;
      } else if (savedPos) {
        wrapper.style.left = savedPos.x + "px";
        wrapper.style.top = savedPos.y + "px";
        wrapper.dataset.x = savedPos.x;
        wrapper.dataset.y = savedPos.y;
      } else {
        // 再接続時など保存位置がない場合のフォールバック（手札横）
        const lx = -320;
        const ly = 1547;
        wrapper.style.left = lx + "px";
        wrapper.style.top = ly + "px";
        wrapper.dataset.x = lx;
        wrapper.dataset.y = ly;
      }
    } else {
      wrapper.classList.add("opponent-deck");
      wrapper.style.pointerEvents = "none";
      // 相手のデッキ位置：相手から見て左下＝自分から見て右上に固定
      // P1の左下 = (-320, 1547), P2の左下 = (3000, 0)
      const globalX = (owner === "player1") ? -320 : 3000;
      const globalY = (owner === "player1") ? 1547 : 0;
      wrapper.style.left = toLocalX(globalX) + "px";
      wrapper.style.top = toLocalY(globalY) + "px";
    }
    content.appendChild(wrapper);
  });
  saveFieldCards();
}

let lastResetAt = 0;

async function resetField() {
  const now = Date.now();
  if (now - lastResetAt < 10000) {
    showWarningMessage("リセットプロトコルは実行直後です。しばらくお待ちください。");
    return;
  }

  const ok = confirm("盤面リセットは「再戦開始用」です。両プレイヤーの状態・山札・進化の道・ターン進行を初期化します。実行しますか？");
  if (!ok) return;
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom || !firebaseClient?.db) {
    showErrorMessage("リセット失敗: ルーム接続が無効です。再読み込み後に再試行してください。");
    return;
  }
  try {
    await executeReset(true);
  } catch (e) {
    console.error("[Reset] 実行失敗:", e);
    showErrorMessage("リセットに失敗しました。通信状態を確認して再試行してください。");
  }
}

window.resetField = resetField;

function updateDeckObject() {
  const content = getFieldContent();
  if (!content) return;
  ["player1", "player2"].forEach(owner => {
    const obj = content.querySelector(`.deckObject[data-owner="${owner}"]`);
    if (!obj) return;
    const s = state[owner];
    if (!s) return;

    const countLabel = obj.querySelector(".deckObjectCount");
    if (countLabel) {
      const deckLen = Array.isArray(s.deck) ? s.deck.length : 0;
      const deckCount = Number.isFinite(Number(s.deckCount)) ? Number(s.deckCount) : deckLen;
      countLabel.textContent = String(Math.max(deckLen, deckCount, 0));
    }

    const img = obj.querySelector("img");
    if (img) {
      // backImageが設定されている場合は使用、なければデフォルト画像
      const backImage = s.backImage || "assets/favicon.png";
      setSafeSrc(img, backImage);
      img.style.display = "block";
    }
  });
}

// ===== デッキに戻す =====
function returnToDeck(cardId, isTemp = false) {
  const me = window.getMyRole() || "player1";
  const s = state[me];
  const storeId = isTemp ? "TEMP:" + cardId : cardId;
  s.deck.push(storeId);
  shuffleDeck();

  // 即時保存
  if (typeof saveImmediate === "function") saveImmediate();
  else save();

  updateDeckObject();
  
  // 手札状況を即座に同期
  if (firebaseClient?.db) {
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && me) {
      firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync()).catch(e => 
        console.warn("[ReturnToDeck] 同期エラー:", e)
      );
    }
  }
  
  update();
}

/**
 * 自分の playerState を Firebase に送信（デバウンス付き）
 */
let _syncMyStateTimer = null;
function pushMyStateDebounced() {
  if (_syncMyStateTimer) clearTimeout(_syncMyStateTimer);
  _syncMyStateTimer = setTimeout(async () => {
    const gameRoom = localStorage.getItem("gameRoom");
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    if (gameRoom && firebaseClient?.db && me) {
      await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
    }
  }, 300);
}

/**
 * フィールドカードを Firebase に送信（デバウンス付き）
 */
let _pushFieldCardsTimer = null;
window._pushFieldCardsDebounced = function(data) {
  if (_pushFieldCardsTimer) clearTimeout(_pushFieldCardsTimer);
  _pushFieldCardsTimer = setTimeout(async () => {
    const gameRoom = localStorage.getItem("gameRoom");
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    if (gameRoom && firebaseClient?.db && me) {
      await firebaseClient.writeFieldCards(gameRoom, me, data || window.getFieldData());
    }
  }, 200);
};

/**
 * 相手のステータス変更リクエストを送信（デバウンス付き）
 * 競合防止: 送信中フラグで同時変更を防ぐ
 */
let _pendingChangeTimer = null;
let _pendingChangeLock = false;

async function sendChangeRequest(owner, key, type, value) {
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (!gameRoom || !firebaseClient?.db) return;

  // 送信中は新しいリクエストを上書き（最後の値が勝つ）
  if (_pendingChangeTimer) clearTimeout(_pendingChangeTimer);
  _pendingChangeTimer = setTimeout(async () => {
    if (_pendingChangeLock) return; // 競合防止
    _pendingChangeLock = true;
    try {
      await firebaseClient.sendChangeRequest(gameRoom, me, owner, key, type, value);
    } finally {
      _pendingChangeLock = false;
    }
  }, 100);
}

function addVal(owner, key, delta) {
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const s = state[owner];
  const maxLv = Number(s.levelMax) || LEVEL_MAX;
  const curLv = Number(s.level) || 1;

  if (key === "level") {
    s.level = Math.min(Math.max(curLv + delta, 1), maxLv);
    s.exp = Math.min(Number(s.exp) || 0, calcExpMax(s.level) - 1);
    applyLevelStats(owner);
    if (owner === me) pushMyStateDebounced();
    else sendChangeRequest(owner, key, "set", s.level);
    update();
    return;
  }

  if (key === "exp" && delta > 0 && curLv >= maxLv) return;
  if (key === "exp" && delta < 0 && curLv <= 1) {
    s.exp = Math.max(0, (Number(s.exp) || 0) + delta);
    syncDerivedStats(owner);
    if (owner === me) pushMyStateDebounced();
    else sendChangeRequest(owner, key, "set", s.exp);
    update();
    return;
  }
  const prev = Number(s[key]) || 0;
  let v = prev + delta;
  if (key === "pp") {
    const maxPp = Number(s.ppMax) || 2;
    v = Math.min(Math.max(v, 0), maxPp);
  } else if (key === "defstack") {
    if (v < 0 && prev === 0) v = s.defstackMax || 0;
    v = Math.max(0, v);
    if (delta > 0 && !s.defstackOverMax) v = Math.min(v, s.defstackMax || 0);
    if (v <= (s.defstackMax || 0)) s.defstackOverMax = false;
  } else if (key !== "hp" && key !== "exp") {
    v = Math.max(0, v);
  }
  if (key === "exp" && delta !== 0) {
    if (delta > 0) addGameLog(`[EXP] ${s.username || owner} が ${delta} EXPを獲得しました。`);
    else if (s.exp > 0 || curLv > 1) addGameLog(`[EXP] ${s.username || owner} が ${Math.abs(delta)} EXPを失いました。`);
  }
  
  s[key] = v;
  if (key === "pp" && typeof addGameLog === "function") {
    addGameLog(`[システム] ${s.username || owner} のPP: ${prev} → ${s[key]}`);
  }
  if (key === "exp") checkLevelUp(owner);
  syncDerivedStats(owner);

  if (owner === me) pushMyStateDebounced();
  else sendChangeRequest(owner, key, "set", s[key]);
  update();
}

function setVal(owner, key, value) {
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const s = state[owner];
  const maxLv = s.levelMax || LEVEL_MAX;

  if (key === "level") {
    s.level = Math.min(Math.max(Math.round(Number(value) || 1), 1), maxLv);
    s.exp = Math.min(Number(s.exp) || 0, calcExpMax(s.level) - 1);
    applyLevelStats(owner);
    if (owner === me) pushMyStateDebounced();
    else sendChangeRequest(owner, key, "set", s.level);
    update();
    return;
  }

  if (key === "exp" && s.level >= maxLv && Number(value) > (Number(s.exp) || 0)) return;
  let prev = Number(s[key]) || 0;
  let v = Number(value) || 0;

  if (key === "defstack" && v < 0 && prev === 0) {
    v = s.defstackMax;
  } else if (key !== "hp") {
    v = Math.max(key === "exp" ? -999 : 0, v);
  }
  if (key === "shield") v = Math.min(v, s.shieldMax || 5);
  if (key === "defstack") { v = Math.min(v, s.defstackMax || 0); s.defstackOverMax = false; }

  s[key] = v;
  if (key === "exp") checkLevelUp(owner);
  syncDerivedStats(owner);
  if (owner === me) pushMyStateDebounced();
  else sendChangeRequest(owner, key, "set", s[key]);
  update();
}

function setMax(owner, key, value) {
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  state[owner][key + "Max"] = Math.max(0, Number(value) || 0);
  syncDerivedStats(owner);
  if (owner === me) pushMyStateDebounced();
  else sendChangeRequest(owner, key + "Max", "set", state[owner][key + "Max"]);
  update();
}

// 派生ステータスの同期（defstackMax = def など）
function syncDerivedStats(owner) {
  const s = state[owner];
  if (!s) return;
  // defstackMaxは常にdefと同じ
  s.defstackMax = s.def || 0;
  // expMaxはレベルから計算
  s.expMax = calcExpMax(s.level || 1);
}

// 経験値上限 = 現在レベル * 2

// 経験値がたまったら自動レベルアップ
function checkLevelUp(owner) {
  const s = state[owner];
  const maxLv = s.levelMax || LEVEL_MAX;

  // 最大レベルに達したら経験値を増やさない。ただしマイナス時はレベルダウンを優先。
  if (s.level >= maxLv && s.exp >= 0) {
    s.exp = 0;
    s.expMax = calcExpMax(s.level);
    syncDerivedStats(owner);
    return;
  }

  // レベルアップ
  while (s.level < maxLv) {
    const needed = calcExpMax(s.level);
    if (s.exp >= needed) {
      s.exp -= needed;
      s.level += 1;
      s.expMax = calcExpMax(s.level);
      applyLevelStats(owner);
      if ([3, 5, 6].includes(s.level) && s.evolutionPath) {
        addGameLog(`[EVOLUTION] ${s.username || owner} のレベルが ${s.level} に上がり、「${s.evolutionPath}」が強化されました！`);
      }
    } else {
      break;
    }
  }

  // レベルダウン（経験値がマイナスかつLv2以上）
  while (s.exp < 0 && s.level > 1) {
    s.level -= 1;
    s.expMax = calcExpMax(s.level);
    s.exp = s.expMax + s.exp; // 繰り下がり
    applyLevelStats(owner);
  }

  // Lv1でマイナスになったら0に固定
  if (s.exp < 0) s.exp = 0;

  // 最大レベルに達したら経験値を0に固定
  if (s.level >= maxLv) {
    s.exp = 0;
    s.level = maxLv; // 念のため上限に固定
  }

  s.expMax = calcExpMax(s.level);
  syncDerivedStats(owner);
}

/** Lucide（game.html で lucide.min.js を読み込み、update 末尾で createIcons） */

/** 瞬間防御力: shield-alert のみ */

function renderUI() {
  traceGame("renderUI", "start");
  const playerEl = document.getElementById("gameUiPlayerInner");
  const enemyEl = document.getElementById("gameUiEnemy");
  const myOwner = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");
  const enemyOwner = myOwner === "player1" ? "player2" : "player1";

  invokeGuarded("renderUI.renderOwnerUI.my", () => {
    if (playerEl) playerEl.innerHTML = renderOwnerUI(myOwner);
  });
  invokeGuarded("renderUI.renderOwnerUI.enemy", () => {
    if (enemyEl) enemyEl.innerHTML = renderOwnerUI(enemyOwner);
  });

  // マッチ進行UIの更新
  if (typeof updateMatchUI === "function") {
    invokeGuarded("renderUI.updateMatchUI", () => updateMatchUI());
  } else {
    traceGame("renderUI.updateMatchUI", "missing");
  }

  // ダイスフェーズUIの更新
  if (typeof updateDicePhaseUI === 'function') {
    invokeGuarded("renderUI.updateDicePhaseUI", () => updateDicePhaseUI());
  } else {
    traceGame("renderUI.updateDicePhaseUI", "missing");
  }

  if (typeof updateDeckObject === "function") {
    invokeGuarded("renderUI.updateDeckObject", () => updateDeckObject());
  } else {
    traceGame("renderUI.updateDeckObject", "missing");
  }
  
  // フィールド上のステータスパネルの更新
  if (typeof updateFieldStatusPanels === "function") {
    invokeGuarded("renderUI.updateFieldStatusPanels", () => updateFieldStatusPanels());
  } else {
    traceGame("renderUI.updateFieldStatusPanels", "missing");
  }

  // ステータスブロックの描画更新
  if (typeof renderStatusBlocks === "function") {
    invokeGuarded("renderUI.renderStatusBlocks", () => renderStatusBlocks());
  } else {
    traceGame("renderUI.renderStatusBlocks", "missing");
  }

  // チャットログの更新
  if (typeof updateGameLogs === "function") {
    invokeGuarded("renderUI.updateGameLogs", () => updateGameLogs(state.logs));
  } else {
    traceGame("renderUI.updateGameLogs", "missing");
  }

  // Lucide アイコンを再生成（innerHTML 更新後に必ず呼ぶ）
  if (window.lucide?.createIcons) {
    try {
      window.lucide.createIcons();
    } catch (e) {
      // アイコン名が見つからない場合は個別にフォールバック
      document.querySelectorAll("i[data-lucide]").forEach(el => {
        const name = el.getAttribute("data-lucide");
        try {
          window.lucide.createIcons({ nodes: [el] });
        } catch {
          // 存在しないアイコン名はスキップ（エラーを握りつぶす）
          el.removeAttribute("data-lucide");
        }
      });
    }
  }

  traceGame("renderUI", "end");
}

function update(skipLogCheck = false) {
  traceGame("update", "start", { skipLogCheck, status: state?.matchData?.status, bothConnected: !!window._bothPlayersConnected });
  invokeGuarded("update.applyInteractionLockState", () => applyInteractionLockState());
  invokeGuarded("update.phaseProgression", () => runPhaseProgression());
  invokeGuarded("update.handleMatchStateTransitions", () => handleMatchStateTransitions());
  const currentStateStr = invokeGuarded("update.stringifyState", () => JSON.stringify(state), "");
  
  // 状態が変わっていないならDOMの再構築をスキップ
  if (typeof updateZoneCountsInState === "function") {
    invokeGuarded("update.updateZoneCountsInState", () => updateZoneCountsInState());
  } else {
    traceGame("update.updateZoneCountsInState", "missing");
  }

  if (lastStateJson === currentStateStr) {
    traceGame("update", "return", "state unchanged");
    return;
  }

  // 初回呼び出しの場合は、ログチェックをスキップ
  if (!skipLogCheck && lastStateJson) {
    const oldState = invokeGuarded("update.parseLastState", () => JSON.parse(lastStateJson), null);
    if (oldState && typeof checkAndLogStateChanges === "function") {
      invokeGuarded("update.checkAndLogStateChanges", () => checkAndLogStateChanges(oldState, state));
    } else if (!oldState) {
      traceGame("update.checkAndLogStateChanges", "aborted", "oldState parse failed");
    } else {
      traceGame("update.checkAndLogStateChanges", "missing");
    }
  }
  lastStateJson = currentStateStr;

  // 手札上限超過時の破棄モーダルが表示されている間は、更新を最小限にする
  if (handOverflowDiscardOpen) {
    invokeGuarded("update.applyInteractionLockState.handOverflow", () => applyInteractionLockState());
    traceGame("update", "return", "handOverflowDiscardOpen");
    return;
  }

  // 描画責務
  invokeGuarded("update.renderUI", () => renderUI());

  // 保存最適化：毎updateの自動保存を廃止（localStorage溢れ防止）
  // 状態変更が発生するアクション側で明示的に save() / saveDebounced() を呼び出すこと
  // if (typeof saveDebounced === "function") saveDebounced();

  // ===== 拡張フックポイント（モンキーパッチ不要） =====
  // pvpveWatcher 等の外部モジュールはここに関数を登録する
  if (Array.isArray(window._afterUpdateHooks)) {
    window._afterUpdateHooks.forEach(fn => {
      try { fn(); } catch (e) { console.warn("[afterUpdateHook] error:", e); }
    });
  }

  traceGame("update", "end");
}

let lastTurnPlayer = null;

// match-header スタイルは初回のみ <head> に追加（毎回 innerHTML に埋め込まない）
(function injectMatchHeaderStyle() {
  if (document.getElementById('matchHeaderStyle')) return;
  const s = document.createElement('style');
  s.id = 'matchHeaderStyle';
  s.textContent = `
    /* ── コンパクト表示（通常時） ── */
    .match-header-compact {
      position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      z-index: 5000; pointer-events: auto;
      display: flex; align-items: center; gap: 8px;
      background: rgba(10, 8, 20, 0.82);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(199,179,119,0.45);
      border-top: none;
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
      padding: 4px 16px 5px;
      cursor: default;
      box-shadow: 0 4px 16px rgba(0,0,0,0.45);
      transition: opacity 0.2s;
      user-select: none;
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
    }
    .match-compact-text {
      font-size: 12px;
      font-weight: 700;
      color: #d0c090;
      letter-spacing: 1px;
    }
    .match-compact-badge {
      font-size: 10px;
      font-weight: 900;
      padding: 1px 8px;
      border-radius: 8px;
      letter-spacing: 1px;
    }

    /* ── 展開表示（ホバー時） ── */
    .match-header-expanded {
      position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
      margin-top: 4px;
      background: linear-gradient(180deg, rgba(20,15,40,0.95) 0%, rgba(10,8,20,0.88) 100%);
      backdrop-filter: blur(12px);
      border: 1.5px solid #c7b377;
      border-radius: 12px;
      padding: 12px 36px 14px;
      display: flex; align-items: center; justify-content: center; gap: 24px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.6);
      pointer-events: none;
      opacity: 0;
      transform: translateX(-50%) translateY(-6px) scaleY(0.92);
      transform-origin: top center;
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
      font-family: 'Outfit', sans-serif;
      white-space: nowrap;
    }
    .match-header-compact:hover .match-header-expanded,
    .match-header-compact:focus-within .match-header-expanded {
      opacity: 1;
      pointer-events: none;
      transform: translateX(-50%) translateY(0) scaleY(1);
    }
    .match-header-wrap {
      position: relative; display: inline-flex; flex-direction: column; align-items: center;
    }
    .match-info-center { text-align: center; }
    .match-round { font-size: 11px; color: #c7b377; letter-spacing: 3px; font-weight: bold; text-transform: uppercase; }
    .match-turn-count { font-size: 22px; font-weight: 900; color: #fff; margin-top: -4px; }
    .match-turn-indicator {
      font-size: 10px; letter-spacing: 2px; font-weight: 900; margin-top: 2px;
      padding: 2px 10px; border-radius: 10px;
    }
  `;
  document.head.appendChild(s);
})();

function handleMatchStateTransitions() {
  const m = state.matchData;
  if (!m) return;

  // 盤面リセット中は通知を表示しない
  if (window._isResetting) return;

  // ダイスロールが完全に終了するまで通知を表示しない
  // 条件: status が 'playing' かつ firstPlayer が設定されている（ダイスロール完了の証拠）
  const isDicePhaseComplete = m.status === 'playing' && m.firstPlayer;
  const meRole = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");

  // 判定用変数を先に計算
  const roundChanged = window._lastRound !== m.round && isDicePhaseComplete;
  const isFirstTurnOfRound = m.turn === 1;
  const turnChanged = lastTurnPlayer !== m.turnPlayer && isDicePhaseComplete;

  // ターン開始ドローの取りこぼし防止:
  // 同期順序で turnChanged 判定を逃しても「自分ターンなら1回だけ」必ず実行する。
  if (isDicePhaseComplete && m.turnPlayer === meRole && !m.winner) {
    const drawKey = `${m.round}-${m.turn}-${m.turnPlayer}`;
    // R1T1 でファーストドローフェーズ（3枚選択）が未完了なら通常ドローをスキップする
    const shouldSkipNormalDrawInR1T1 = (m.round === 1 && m.turn === 1 && m.firstDrawDone !== true);
    
    if (!shouldSkipNormalDrawInR1T1 && lastTurnDrawKey !== drawKey) {
      lastTurnDrawKey = drawKey;
      // ターン開始通知の後にドローするように遅延を調整
      // ラウンド開始時は通知が遅れるため、さらに待機
      const drawDelay = roundChanged ? 4500 : 1500;
      setTimeout(() => startTurnDraw(), drawDelay);
    }
  }
  
  // ラウンド開始通知（ターンよりも大きな括り）
  // ラウンドが変わった時、かつターン1の時に表示（先攻・後攻関係なく全員に表示）
  if (roundChanged && isFirstTurnOfRound) {
    showRoundNotification(m.round);
    window._lastRound = m.round;
    
    // R1T1処理（ラウンド1のみ）
    // ファーストドローフェーズで既に5枚取り出し→手札3枚を済ませた場合は二重ドローしない（firstDrawDone は playing 移行時に true）
    if (m.round === 1 && m.firstDrawDone !== true) {
      // ファーストドローフェーズをスキップした場合などのフォールバック
      setTimeout(() => startR1T1(), 4500);
    }

    // lastTurnPlayerを即座に更新（2重表示を防ぐ）
    lastTurnPlayer = m.turnPlayer;
    
    // ラウンド通知の後、2秒後にターン通知を表示
    setTimeout(() => {
      const isMe = m.turnPlayer === window.myRole;
      showNotification(isMe ? "あなたのターン" : "相手のターン", isMe ? "#00ffcc" : "#e24a4a");
    }, 2000);
  } else {
    // ラウンド変更がない場合、またはターン1以外の場合は通常のターン通知のみ
    const turnChanged = lastTurnPlayer !== m.turnPlayer && isDicePhaseComplete;
    if (turnChanged) {
      const isMe = m.turnPlayer === window.myRole;
      showNotification(isMe ? "あなたのターン" : "相手のターン", isMe ? "#00ffcc" : "#e24a4a");
      lastTurnPlayer = m.turnPlayer;
    }
  }

  // 勝敗チェック（checkGameResult 内で showResultScreen も呼ぶ）
  checkGameResult();
}

function updateMatchUI() {
  const m = state.matchData;
  if (!m) return;

  // 1. ラウンド・ターン表示（コンパクト + ホバーで展開）
  let info = document.getElementById("matchInfoDisplay");
  if (!info) {
    info = document.createElement("div");
    info.id = "matchInfoDisplay";
    info.style.cssText = `
      position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      z-index: 5000; pointer-events: none;
      display: flex; flex-direction: column; align-items: center;
      font-family: 'Outfit', sans-serif;
    `;
    document.body.appendChild(info);
  }

  const isMyTurn = (m.turnPlayer === window.myRole);
  const turnColor = isMyTurn ? '#00ffcc' : '#e24a4a';
  const turnLabel = isMyTurn ? 'あなたのターン' : '相手のターン';

  // コンパクト表示: 「1-1 相手のターン」
  const compactText = `${m.round}-${m.turn}`;

  const html = `
    <div class="match-header-compact" style="pointer-events: auto;">
      <div class="match-header-wrap">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="match-compact-text">${compactText}</span>
          <span class="match-compact-badge" style="background:${turnColor}; color:#1a172c;">${turnLabel}</span>
        </div>
        <div class="match-header-expanded">
          <div class="match-info-center">
            <div class="match-round">第 ${m.round} ラウンド</div>
            <div class="match-turn-count">ターン ${m.turn}</div>
            <div class="match-turn-indicator" style="background:${turnColor}; color:#1a172c; margin-top:6px;">
              ${turnLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ちらつき防止: 内容が変わったときだけ更新
  const infoWrap = document.getElementById("matchInfoDisplay");
  if (infoWrap && infoWrap.dataset.lastHtml !== html) {
    infoWrap.innerHTML = html;
    infoWrap.dataset.lastHtml = html;
  }

  // 2. ターンエンドボタン
  let endBtn = document.getElementById("turnEndBtn");
  if (!endBtn) {
    endBtn = document.createElement("button");
    endBtn.id = "turnEndBtn";
    endBtn.innerHTML = "TURN<br>END";
    endBtn.style.cssText = `
      position: fixed; right: 40px; top: 50%; transform: translateY(-50%);
      width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #c7b377, #8e7b45);
      border: 4px solid #1a172c; color: #1a172c; font-size: 16px; font-weight: 900;
      cursor: pointer; z-index: 5000; box-shadow: 0 0 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.3);
      transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.1;
    `;
    endBtn.onclick = (e) => {
      // イベントオブジェクトが skipHandLimitCheck に渡されないようにラップする
      handleTurnEnd(false);
    };
    document.body.appendChild(endBtn);
  }
  endBtn.style.opacity = isMyTurn ? "1" : "0.3";
  endBtn.style.pointerEvents = isMyTurn ? "auto" : "none";
  endBtn.style.transform = `translateY(-50%) scale(${isMyTurn ? 1 : 0.9})`;

  // 3. リザルト表示ボタン（勝者が決まっていて、リザルトが閉じられている場合のみ表示）
  let resultBtn = document.getElementById("showResultBtn");
  const hasWinner = m.winner || window._lastWinner; // 最後の勝者を記憶
  const isResultOpen = !!document.getElementById('gameResultOverlay');
  
  if (hasWinner && !isResultOpen) {
    if (!resultBtn) {
      resultBtn = document.createElement("button");
      resultBtn.id = "showResultBtn";
      resultBtn.innerHTML = "リザルト<br>表示";
      resultBtn.style.cssText = `
        position: fixed; right: 40px; top: calc(50% + 120px); transform: translateY(-50%);
        width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, #7a6a40, #5a4a30);
        border: 3px solid #1a172c; color: #e0d0a0; font-size: 14px; font-weight: 700;
        cursor: pointer; z-index: 5000; box-shadow: 0 0 15px rgba(0,0,0,0.5), inset 0 0 8px rgba(255,255,255,0.2);
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.1;
      `;
      resultBtn.onclick = () => {
        window._resultDismissed = false;
        showResultScreen(window._lastWinner);
      };
      document.body.appendChild(resultBtn);
    }
    resultBtn.style.display = "flex";
    resultBtn.style.pointerEvents = "auto";
  } else if (resultBtn) {
    resultBtn.style.display = "none";
  }
  if (hasWinner) {
    endBtn.style.pointerEvents = "none";
    endBtn.style.opacity = "0.3";
  }

  // 4. ダイスフェーズのオーバーレイ
  if (typeof updateDicePhaseUI === "function") {
    invokeGuarded("updateMatchUI.updateDicePhaseUI", () => updateDicePhaseUI());
  } else {
    traceGame("updateMatchUI.updateDicePhaseUI", "missing");
  }

  // 5. 進化の道フェーズのオーバーレイ
  if (typeof updateEvolutionPhaseUI === "function") {
    invokeGuarded("updateMatchUI.updateEvolutionPhaseUI", () => updateEvolutionPhaseUI());
  } else {
    traceGame("updateMatchUI.updateEvolutionPhaseUI", "missing");
  }

  // 6. ファーストドローフェーズのオーバーレイ
  if (typeof updateFirstDrawPhaseUI === "function") {
    invokeGuarded("updateMatchUI.updateFirstDrawPhaseUI", () => updateFirstDrawPhaseUI());
  } else {
    traceGame("updateMatchUI.updateFirstDrawPhaseUI", "missing");
  }

  // 7. フェーズオーバーレイ中の「デッキを確認」ボタン制御
  // ダイス/進化/ファーストドローフェーズ中は左上にボタンを表示
  if (typeof window.injectPhaseOverlayDeckBtn === "function") {
    const phaseOverlayActive = ["setup_dice", "setup_evolution", "setup_first_draw"].includes(m.status);
    if (phaseOverlayActive) {
      window.injectPhaseOverlayDeckBtn();
    } else {
      window.removePhaseOverlayDeckBtn?.();
    }
  }
}

// アニメーション・結果画面・ダイスフェーズのスタイルを初回のみ注入
(function injectGameStyles() {
  if (document.getElementById('gameAnimStyles')) return;
  const s = document.createElement('style');
  s.id = 'gameAnimStyles';
  s.textContent = `
    @keyframes notifyIn { from { transform: scale(0.5) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
    @keyframes notifyOut { from { transform: scale(1) translateY(0); opacity: 1; } to { transform: scale(1.2) translateY(-20px); opacity: 0; } }
    @keyframes resultFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes resultContentSlide { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes resultTextGlow { from { filter: drop-shadow(0 0 10px rgba(199,179,119,0.4)); } to { filter: drop-shadow(0 0 40px rgba(199,179,119,0.8)); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes dicePulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    @keyframes diceRolling { 0% { transform: rotateX(0deg) rotateY(0deg) scale(1); } 50% { transform: rotateX(180deg) rotateY(180deg) scale(1.1); } 100% { transform: rotateX(360deg) rotateY(360deg) scale(1); } }    @keyframes diceResultPop { 0% { transform: scale(0) rotateZ(-180deg); opacity: 0; } 50% { transform: scale(1.15); } 100% { transform: scale(1) rotateZ(0deg); opacity: 1; } }
    @keyframes titleGlow { 0% { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor; } 50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor, 0 0 60px currentColor; } 100% { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor; } }
    @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    #gameResultOverlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      font-family: 'Outfit', sans-serif; overflow: hidden;
    }
    .result-backdrop { position: absolute; inset: 0; animation: resultFadeIn 1s ease-out forwards; }
    .result-content {
      position: relative; z-index: 1; text-align: center;
      animation: resultContentSlide 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .result-banner { padding: 40px 100px; margin-bottom: 20px; background: rgba(0,0,0,0.4); backdrop-filter: blur(10px); transform: skewX(-10deg); }
    .result-title { font-size: 100px; font-weight: 900; margin: 0; letter-spacing: 20px; transform: skewX(10deg); animation: resultTextGlow 2s ease-in-out infinite alternate; }
    .result-subtext { color: #fff; font-size: 18px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 60px; opacity: 0; animation: fadeIn 0.5s 1s ease-out forwards; }
    .result-actions { display: flex; gap: 20px; justify-content: center; opacity: 0; animation: fadeIn 0.5s 1.5s ease-out forwards; }
    .result-btn { padding: 18px 45px; border: none; border-radius: 4px; color: #1a172c; font-size: 14px; font-weight: 900; letter-spacing: 2px; cursor: pointer; transition: all 0.3s; text-transform: uppercase; }
    .result-btn:hover { transform: scale(1.05) translateY(-2px); filter: brightness(1.2); }
    .result-btn.secondary { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; }
    .result-btn.secondary:hover { background: rgba(255,255,255,0.1); border-color: #fff; }
    .dice-container { text-align: center; max-width: 700px; width: 90%; }
    .dice-title { font-size: 48px; font-weight: 900; color: #c7b377; letter-spacing: 8px; margin-bottom: 20px; text-transform: uppercase; }
    .dice-subtitle { color: #888; font-size: 14px; letter-spacing: 2px; margin-bottom: 40px; }
    .dice-roll-btn { padding: 20px 80px; font-size: 20px; background: #c7b377; border: none; border-radius: 4px; color: #1a172c; font-weight: 900; cursor: pointer; letter-spacing: 4px; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 10px 30px rgba(199,179,119,0.3); }
    .dice-roll-btn:hover { transform: scale(1.05) translateY(-5px); box-shadow: 0 15px 40px rgba(199,179,119,0.5); }
    .dice-result-val { font-size: 120px; font-weight: 900; color: #fff; line-height: 1; margin: 20px 0; }
    .dice-result-display { margin: 40px 0; }
    .dice-value-large { font-size: 140px; font-weight: 900; color: #fff; line-height: 1; text-shadow: 0 0 30px rgba(199,179,119,0.6); }
    .dice-rolling-animation { margin: 40px 0; }
    .dice-value { font-size: 140px; font-weight: 900; color: #c7b377; line-height: 1; animation: diceRolling 1.5s ease-in-out infinite; text-shadow: 0 0 30px rgba(199,179,119,0.6); }
    .dice-wait-msg { font-size: 14px; color: #00ffcc; letter-spacing: 2px; animation: dicePulse 1.5s infinite; }
    .dice-choice-group { display: flex; gap: 20px; justify-content: center; margin-top: 40px; }
    .dice-choice-btn { padding: 15px 40px; border-radius: 4px; font-weight: 900; cursor: pointer; letter-spacing: 2px; transition: all 0.3s; }
    .dice-choice-btn.primary { background: #c7b377; border: none; color: #1a172c; }
    .dice-choice-btn.secondary { background: transparent; border: 1px solid #c7b377; color: #c7b377; }
    .dice-choice-btn:hover { transform: translateY(-3px); filter: brightness(1.2); }
    /* Lucide（ステータス行アイコン） */
    .lorIcon, .lorChipIcon { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
    .lorLucide, .lorLucide svg { width: 20px !important; height: 20px !important; flex-shrink: 0; }
    .lorLxBarrier { color: #8ab8ff; stroke: #8ab8ff; }
    .lorLxHp { color: #ff6b9d; stroke: #ff6b9d; }
    .lorLxAtk { color: #ff8aab; stroke: #ff8aab; }
    .lorLxDef { color: #6a9cff; stroke: #6a9cff; }
    .lorLxIdef { color: #7eb8ff; stroke: #7eb8ff; }
    .lorLxDefTot { color: #5eb0ff; stroke: #5eb0ff; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
    .lorLxDefTot svg {
      fill: #3d9eef;
      stroke: #1e5cb8;
      color: #5eb0ff;
    }
    .lorIdefChip .lorChipIcon .lorLucide,
    .lorIdefChip .lorChipIcon svg { width: 16px !important; height: 16px !important; }
    .lorHpBarOuter {
      border-color: rgba(231, 76, 60, 0.42) !important;
    }
    .lorHpFill {
      background: rgba(231, 76, 60, 0.92) !important;
      box-shadow: none !important;
    }
    .card.handCardLift {
      transform: translateY(-16px);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      box-shadow: 0 10px 28px rgba(0,0,0,0.45);
    }
    .zonePpModalOverlay {
      position: fixed; inset: 0; z-index: 12000;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(4px);
    }
    .zonePpModalBox {
      background: rgba(14,12,24,0.98);
      border: 2px solid rgba(199,179,119,0.5);
      border-radius: 12px;
      padding: 22px 26px;
      max-width: 480px;
      color: #f0f0f0;
      font-family: 'Outfit', sans-serif;
      text-align: center;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    }
    .zonePpCostSentence { font-size: 15px; line-height: 1.75; margin-bottom: 20px; text-align: center; color: #eae6f5; }
    .zonePpCostSentence b { color: #f0d080; }
    .zonePpInlineCtrl { display: inline-flex; align-items: center; gap: 6px; margin: 0 6px; vertical-align: middle; }
    .zonePpInlineCtrl input {
      width: 52px; text-align: center; font-size: 18px; font-weight: 800;
      border-radius: 6px; border: 1px solid #5a4b27; background: #1a172c; color: #fff;
    }
    .zonePpInlineCtrl button {
      min-width: 40px; height: 40px; font-size: 20px; font-weight: 900;
      border-radius: 8px; border: 1px solid #c7b377; background: rgba(199,179,119,0.2); color: #f0d080; cursor: pointer;
    }
    .zonePpActions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 8px; }
    .zonePpBtnPrimary {
      padding: 11px 28px; background: linear-gradient(180deg, #d4b76a, #a8893a); border: none; border-radius: 10px;
      font-weight: 900; cursor: pointer; color: #1a172c; font-size: 15px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    }
    .zonePpBtnSecondary {
      padding: 11px 22px; background: transparent; border: 1px solid rgba(200,200,220,0.45); border-radius: 10px;
      font-weight: 700; cursor: pointer; color: #ccc; font-size: 14px;
    }
    .zonePpBtnSecondary:hover { border-color: #f0d080; color: #f0d080; }
    #ctxDamageMenuHint {
      position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%);
      z-index: 6000; pointer-events: none;
      font-size: 12px; color: rgba(255,255,255,0.38);
      letter-spacing: 0.5px;
      font-family: 'Outfit', sans-serif;
      opacity: 0; transition: opacity 0.2s;
    }
    #ctxDamageMenuHint.is-visible { opacity: 1; }
    /* ファーストドロー選択 UI（フィールド複製の left/top/寸法インラインを無効化して切れを防ぐ） */
    .firstDrawCardOuter { position:relative; width:90px; height:130px; flex-shrink:0; cursor:pointer; border-radius:10px; box-sizing:border-box; transition: box-shadow .2s ease, transform .2s ease; }
    .firstDrawCardOuter:hover { transform: translateY(-2px); }
    .firstDrawPickRow .firstDrawCardClone.card {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      width: 90px !important;
      height: 130px !important;
      max-width: 90px !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden;
      border-radius: 8px;
    }
    .firstDrawPickRow .firstDrawCardClone.card img {
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
      aspect-ratio: auto !important;
    }
    .firstDrawCheckRing {
      position:absolute; top:6px; right:6px; width:26px; height:26px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      border:2px solid rgba(255,255,255,0.5); background:rgba(0,0,0,0.55); color:transparent;
      pointer-events:none; transition: color .2s, border-color .2s, background .2s, box-shadow .2s;
    }
    .firstDrawCheckRing svg { display:block; }
    .firstDrawCardOuter--picked {
      box-shadow: 0 0 0 2px #00ffcc, 0 6px 22px rgba(0,255,204,0.22);
    }
    .firstDrawCardOuter--picked .firstDrawCheckRing {
      border-color:#00ffcc; color:#00ffcc; background:rgba(0,32,28,0.92);
      box-shadow: 0 0 10px rgba(0,255,204,0.35);
    }
    .firstDrawHideVisLabel .cardVisibilityLabel { display: none !important; }
    .firstDrawPhaseMainRow { display:flex; align-items:flex-start; gap:20px; width:100%; }
    .firstDrawPhaseLeftCol { flex: 1 1 0; min-width: 0; overflow-x: auto; overflow-y: visible; padding-bottom: 4px; }
    .firstDrawPickRow {
      display:flex; justify-content:flex-start; align-items:flex-start; gap:12px; flex-wrap:wrap;
      margin-bottom:12px; min-height:140px; width: max-content; max-width: 100%;
    }
    .firstDrawPickRow.firstDrawPickRow--finalThree { justify-content:center; gap:16px; }
    .firstDrawPickPreviewCol { flex:0 0 420px; display:flex; flex-direction:column; align-items:center; padding-top:2px; }
    .firstDrawPickPreviewCaption { font-size:11px; color:#889; margin-bottom:8px; text-align:center; letter-spacing:0.02em; }
    .firstDrawLastPickPreview {
      width:100%; min-height:520px; display:flex; align-items:center; justify-content:center;
      border-radius:12px; background:rgba(0,0,0,0.22); border:1px solid rgba(199,179,119,0.12);
      box-sizing: border-box;
      padding: 10px 14px;
      overflow: visible;
    }
    .firstDrawLastPickClone {
      position: relative !important;
      left: auto !important;
      top: auto !important;
      width: 380px !important;
      height: 538px !important;
      flex: none !important;
      max-width: none !important;
      min-width: none !important;
      margin: 0 auto !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden;
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.65), 0 0 32px rgba(199,179,119,0.3);
      transition: transform 0.3s ease;
    }
    .firstDrawLastPickClone img {
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
      aspect-ratio: auto !important;
    }
    .firstDrawCardOuter--kept {
      transform: scale(1.04);
      box-shadow: 0 0 0 2px rgba(240,208,128,0.55), 0 8px 26px rgba(0,0,0,0.38);
    }
  `;
  document.head.appendChild(s);
})();

(function injectRoundNotificationStyles() {
  if (document.getElementById('roundNotificationStyles')) return;
  const s = document.createElement('style');
  s.id = 'roundNotificationStyles';
  s.textContent = `
    @keyframes roundFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes roundFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes roundContentScale {
      from { transform: scale(0.8); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes roundNumberPulse {
      0% { transform: scale(0.5); opacity: 0; }
      50% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes roundSubtitleSlide {
      from { transform: translateY(var(--slide-y, 30px)); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

function checkGameResult() {
  if (!state.matchData) return;

  // リザルト表示中は判定しない（2重表示防止）
  if (window._resultShowing) return;

  // 閉じるボタンが押された後は判定しない
  if (window._resultDismissed) return;

  // 盤面リセット中は判定しない
  if (window._isResetting) return;

  // ゲームが開始されていない場合はスキップ
  if (!gameReady) {
    if (state.matchData.winner) console.warn("[Result] SKIP: gameReady=false, winner=", state.matchData.winner);
    return;
  }
  // ダイスフェーズ・勝者決定済みの場合はスキップ
  if (state.matchData.status !== "playing") {
    if (state.matchData.winner) console.warn("[Result] SKIP: status=", state.matchData.status, "winner=", state.matchData.winner);
    return;
  }
  // 1ラウンド目が始まる前はスキップ（ラウンド1・ターン1以降のみ判定）
  if ((state.matchData.round || 0) < 1 || (state.matchData.turn || 0) < 1) {
    if (state.matchData.winner) console.warn("[Result] SKIP: round=", state.matchData.round, "turn=", state.matchData.turn, "winner=", state.matchData.winner);
    return;
  }

  // Firebase から winner が同期されてきた場合（相手が書き込んだ）
  if (state.matchData.winner) {
    // winnerSetAt が存在しない（古いデータ）または gameStartedAt より前なら無視
    const winnerSetAt = state.matchData.winnerSetAt || 0;
    const gameStartedAt = window._gameStartedAt || 0;
    if (winnerSetAt < gameStartedAt) {
      console.warn("[Result] SKIP: winner is stale (winnerSetAt=", winnerSetAt, "< gameStartedAt=", gameStartedAt, ") winner=", state.matchData.winner);
      // 古い winner を Firebase からクリア
      state.matchData.winner = null;
      state.matchData.winnerSetAt = null;
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && firebaseClient?.db) {
        firebaseClient.writeMatchData(gameRoom, state.matchData);
      }
      return;
    }
    console.log("[Result] winner synced from Firebase:", state.matchData.winner,
      "| round=", state.matchData.round, "turn=", state.matchData.turn,
      "| gameReady=", gameReady, "status=", state.matchData.status,
      "| winnerSetAt=", winnerSetAt, "gameStartedAt=", gameStartedAt);
    showResultScreen(state.matchData.winner);
    return;
  }

  const myRole = window.myRole;
  if (!myRole) return;
  const opRole = myRole === 'player1' ? 'player2' : 'player1';
  const me = state[myRole];
  const op = state[opRole];

  // デッキが未初期化（空配列ではなく undefined/null）の場合は判定しない
  if (!me || !Array.isArray(me.deck)) return;
  if (!op || !Array.isArray(op.deck)) return;

  // 自分または相手のデッキが空の場合、ゲーム開始直後の可能性があるためスキップ
  // （デッキは createDeckObject() が完了するまで空のまま）
  if (me.deck.length === 0 && op.deck.length === 0) {
    console.log("[Result] SKIP: both decks not ready (me:", me.deck.length, "op:", op.deck.length, ")");
    return;
  }

  if (state.matchData.winner) return;

  // 敗北条件: HP <= 0
  const myLost = me.hp <= 0;
  const opLost = op.hp <= 0;

  if (myLost || opLost) {
    console.log("[Result] TRIGGER:",
      "myRole=", myRole,
      "| me.hp=", me.hp, "me.deck=", me.deck.length,
      "| op.hp=", op.hp, "op.deck=", op.deck.length,
      "| myLost=", myLost, "opLost=", opLost,
      "| round=", state.matchData.round, "turn=", state.matchData.turn
    );

    let winner;
    if (myLost && opLost) {
      winner = 'draw';
      if (myRole === "player1" && typeof addGameLog === "function") {
        addGameLog(`[RESULT] 両プレイヤーのHPが0になりました。引き分けです。`);
      }
    } else if (myLost) {
      winner = opRole;
      if (typeof addGameLog === "function") {
        addGameLog(`[DEFEAT] ${me.username || "プレイヤー"} のHPが0になりました。${op.username || "相手"} の勝利です！`);
      }
    } else {
      winner = myRole;
      // opLost is true, the opponent client will log their own defeat.
    }

    state.matchData.winner      = winner;
    state.matchData.winnerSetAt = Date.now();

    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && firebaseClient?.db) {
      firebaseClient.writeMatchData(gameRoom, state.matchData);
    }
    
    // 即座にリザルトを表示
    showResultScreen(winner);
  }
}


async function executeReset(syncShared = true) {
  // 盤面リセット中フラグを立てる
  window._isResetting = true;
  
  // ──【安定化：処理の直前に不要な同期データをFirebaseから並列削除】──
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db && syncShared) {
    console.log("[Reset] 不要なFirebase同期データを即時クリアします...");
    try {
      await Promise.all([
        firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/fieldCards`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/pendingChange`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/logs`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/rematch`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/playerState`).remove(),
        firebaseClient.db.ref(`rooms/${gameRoom}/players/player1/ready`).set(false),
        firebaseClient.db.ref(`rooms/${gameRoom}/players/player2/ready`).set(false),
        firebaseClient.db.ref(`rooms/${gameRoom}/playerState/player1/diceValue`).set(-1),
        firebaseClient.db.ref(`rooms/${gameRoom}/playerState/player2/diceValue`).set(-1)
      ]);
      console.log("[Reset] Firebase同期データの即時クリアが完了しました。");
    } catch (e) {
      console.warn("[Reset] 同期データ即時クリア中にエラーが発生しましたが、処理を続行します:", e);
    }
  }
  // ────────────────────────────────────────────────────────────
  
  lastResetAt = Date.now();
  lastTurnPlayer = null; // ターン通知用の記憶をリセット
  window._lastRound = undefined; // ラウンド通知用の記憶をリセット
  addGameLog(`[PROTOCOL:RESET] ${window.myUsername || state[(window.getMyRole ? window.getMyRole() : window.myRole || "player1")]?.username || window.myRole} が再戦リセットを実行しました。`);

  ["player1", "player2"].forEach(owner => {
    const s = state[owner];
    if (!s) return;
    s.hp = 20; s.hpMax = 20;
    s.shield = 0; s.defstack = 0; s.def = 0;
    s.level = 1; s.exp = 0;
    s.pp = 0; s.ppMax = 2;
    s.diceValue = -1; // ダイス値を確実にリセット
    s.evolutionPath = null; // 進化の道リセット
    s.evoContinuousDmgCount = 0; // 継続の道: ターン中の発動回数
    s.evoBackwaterExpGained = false; // 背水の道: ターン中の経験値獲得フラグ
    if (typeof applyLevelStats === "function") applyLevelStats(owner, true);
  });

  initDeckFromCode();
  if (typeof getMyState === "function") {
    getMyState().backImage = getBackImage();
  }
  shuffleDeck();

  const content = getFieldContent();
  if (content) {
    content.querySelectorAll(".card:not(.deckObject)").forEach(el => el.remove());
  }
  if (typeof window.resetBattleZoneState === "function") window.resetBattleZoneState();

  localStorage.removeItem("fieldCards");
  localStorage.removeItem("gameStarted");
  localStorage.removeItem("gameStartedRoom");

  state.matchData = {
    round: 1, turn: 1, turnPlayer: "player1", status: "ready_check",
    winner: null, winnerSetAt: null, firstPlayer: null
  };
  state.player1.diceValue = -1;
  state.player2.diceValue = -1;
  window._gameStartInitiated = false;
  window._gameStartedAt = Date.now(); // 試合開始時刻を更新（以前の勝者情報を stale 判定するため）
  window._resultDismissed = false;     // 再戦時は判定を再開
  window._resultShowing = false;       // リザルト表示フラグをリセット
  window.__playingStarted = false;     // ファーストドロー→playing遷移フラグをリセット
  window._firstDrawPhaseStarted = false; // ファーストドローフェーズ開始フラグをリセット
  window._firstDrawAdvanceSent = false;  // ファーストドロー送信フラグをリセット
  window._lastWinner = null;           // 勝者情報をクリア
  
  // DOM上のリザルト画面があれば削除
  const overlay = document.getElementById('gameResultOverlay');
  if (overlay) overlay.remove();

  window._soloStartMode = false;
  window.serverInitialState = JSON.parse(JSON.stringify(state));

  // 既に直前に不要データを消去済みなので、ここでは共通マッチデータの書き込みのみ行う
  if (gameRoom && firebaseClient?.db && syncShared) {
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
  }

  // ──【安定化：接続直後と同じ処理を挟む (rebuild watchers & gates)】──
  console.log("[Reset] 接続直後と同じ処理（ウォッチャーと同期ゲートの再初期化）を実行します...");
  window.notifySyncGate("initDone", false);
  window.notifySyncGate("roomWatcherReady", false);
  window.notifySyncGate("phaseReady", false);
  updateSyncLoadingOverlay();

  if (typeof setupRoomWatcher === "function") {
    try {
      setupRoomWatcher();
      console.log("[Reset] ウォッチャーの再セットアップに成功しました。");
    } catch (watcherErr) {
      console.error("[Reset] ウォッチャー再セットアップ中にエラー:", watcherErr);
    }
  }

  // 自分の最新状態を Firebase に送信（整合性担保）
  if (gameRoom && firebaseClient?.db) {
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    try {
      await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
      console.log("[Reset] 自分の最新状態の同期に成功しました。");
    } catch (writeErr) {
      console.error("[Reset] 自分の最新状態の同期中にエラー:", writeErr);
    }
  }

  window.notifySyncGate("initDone", true);
  updateSyncLoadingOverlay();
  // ────────────────────────────────────────────────────────────

  safeLocalSetItem("gameState", createSafeLocalStateCopy());
  localStorage.removeItem("fieldCards");

  createDeckObject(true);

  if (typeof syncLoop === "function") await syncLoop();

  // リセット後、両プレイヤーが既に接続済みなら ready_check → setup_dice へ遷移
  // （players ノードは変更されないため roomWatcher が再発火しない問題への対処）
  if (window._bothPlayersConnected && state.matchData.status === "ready_check") {
    state.matchData.status = "setup_dice";
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && firebaseClient?.db) {
      firebaseClient.writeMatchData(gameRoom, state.matchData);
    }
  }
  applyInteractionLockState();

  if (typeof update === "function") update();
  
  // リセット完了後、フラグを解除
  window._isResetting = false;
}








// (moved to top of file)

/**
 * 自分の playerState として Firebase に送る内容を返す
 * diceValue は playerDice パスで管理するため除外
 * deck の内容は送信せず、枚数のみ送信（相手には内容を見せない）
 */
function _getMyStateForSync() {
  const me = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");
  const myState = state[me];
  const { diceValue: _d, deck, ...rest } = myState;
  
  // デッキの内容は送信せず、枚数だけ送信（ダミーデータで埋める）
  const deckLength = Array.isArray(deck) ? deck.length : 0;
  const dummyDeck = Array(deckLength).fill("HIDDEN");
  
  return {
    ...rest,
    deck: dummyDeck,
    deckCount: deckLength
  };
}

// イベント委譲（body全体で拾う）
document.body.addEventListener("change", (e) => {
  if (window.isGameInteractionLocked()) return;
  const t = e.target;
  if (!t.dataset.owner) return;
  if (t.dataset.type === "val") setVal(t.dataset.owner, t.dataset.key, t.value);
  if (t.dataset.type === "max") setMax(t.dataset.owner, t.dataset.key, t.value);
});

let sliderActive = false;
let ppRepeatTimer = null;
let ppRepeatTarget = null;

document.body.addEventListener("pointerdown", (e) => {
  if (window.isGameInteractionLocked()) return;
  if (e.target.classList.contains("lorSlider")) sliderActive = true;
  const ppBtn = e.target.closest(".lorPpBtn");
  if (!ppBtn) return;
  const owner = ppBtn.dataset.owner;
  const key = ppBtn.dataset.key;
  const delta = Number(ppBtn.dataset.delta || 0);
  if (!owner || key !== "pp" || !delta) return;
  ppRepeatTarget = { owner, key, delta };
  ppRepeatTimer = setTimeout(() => {
    const loop = () => {
      if (!ppRepeatTarget) return;
      addVal(ppRepeatTarget.owner, ppRepeatTarget.key, ppRepeatTarget.delta);
      ppRepeatTimer = setTimeout(loop, 70);
    };
    loop();
  }, 260);
});

document.body.addEventListener("pointerup", (e) => {
  if (ppRepeatTimer) clearTimeout(ppRepeatTimer);
  ppRepeatTimer = null;
  ppRepeatTarget = null;
  if (sliderActive) {
    sliderActive = false;
    update();
  }
});

document.body.addEventListener("input", (e) => {
  if (window.isGameInteractionLocked()) return;
  const t = e.target;
  if (!t.dataset.owner || t.dataset.type !== "slider") return;
  const owner = t.dataset.owner;
  const key = t.dataset.key;
  let prev = Number(state[owner][key]) || 0;
  let v = Number(t.value);

  if (key === "defstack" && v < 0 && prev === 0) {
    v = state[owner].defstackMax;
    t.value = v;
  } else if (key !== "hp") {
    v = Math.max(0, v);
  }

  state[owner][key] = v;
  if (key === "exp") checkLevelUp(owner);
  save();

  // バーと数値を部分更新
  const panel = t.closest(".lorPanel");
  if (panel) {
    const max = state[owner][key + "Max"] || 1;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    panel.querySelectorAll(".lorStatRow").forEach(row => {
      const inp = row.querySelector(`input[data-key="${key}"]`);
      if (!inp) return;
      const inner = row.querySelector(".lorBarInner");
      if (inner) inner.style.width = pct + "%";
      const valInp = row.querySelector(".lorValInput");
      if (valInp) valInp.value = v;
    });
  }
});

document.body.addEventListener("click", (e) => {
  if (window.isGameInteractionLocked()) {
    const allowed = e.target.closest("#menuButton, #menuPanel, #optionsModal, #confirmModal, #chatArea, #gameResultOverlay, #showResultBtn");
    if (!allowed) return;
  }
  const evoTitle = e.target.closest(".evoPanelTitle[data-owner]");
  if (evoTitle) {
    openEvolutionPathModal(evoTitle.dataset.owner);
    return;
  }
  const t = e.target.closest(".lorSmBtn, .lorInstantDefBtn, .lorResetDefBtn, .lorTargetBtn");
  if (!t || !t.dataset.owner) return;
  if (t.disabled) return;

  if (t.dataset.action === "openTargetSelect") {
    // 敵ステータスUIの「ターゲット」ボタン → MonsterUI のターゲット選択パネルを開く
    if (typeof window.MonsterUI?._showTargetSelectPanel === "function") {
      window.MonsterUI._showTargetSelectPanel();
    } else if (typeof window.MonsterUI?.showTargetChangeButton === "function") {
      // フォールバック: ターゲット変更ボタンを表示
      window.MonsterUI.showTargetChangeButton();
    }
    return;
  }

  if (t.dataset.action === "addInstantDef") {
    const owner = t.dataset.owner;
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    const currentPp = Number(state[owner].pp) || 0;
    if (currentPp <= 0) {
      if (typeof showErrorMessage === "function") {
        showErrorMessage("PPが不足しています。");
      }
      return;
    }
    state[owner].pp = currentPp - 1;
    const next = (Number(state[owner].defstack) || 0) + (Number(state[owner].instantDef) || 0);
    state[owner].defstack = Math.max(0, next);
    state[owner].defstackOverMax = state[owner].defstack > (Number(state[owner].defstackMax) || 0);

    if (owner === me) {
      pushMyStateDebounced();
    } else {
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && firebaseClient?.db) {
        firebaseClient.sendChangeRequest(gameRoom, me, owner, "_bulk", "set", {
          pp: state[owner].pp,
          defstack: state[owner].defstack,
          defstackOverMax: state[owner].defstackOverMax
        });
      }
    }
    update();
    return;
  }

  if (t.dataset.action === "resetDefense") {
    const owner = t.dataset.owner;
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    const s = state[owner];
    const cur = Number(s.defstack) || 0;
    const max = Number(s.defstackMax) || 0;
    if (cur > max) {
      s.defstack = max;
      s.defstackOverMax = false;

      if (owner === me) {
        pushMyStateDebounced();
      } else {
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          firebaseClient.sendChangeRequest(gameRoom, me, owner, "_bulk", "set", {
            defstack: s.defstack,
            defstackOverMax: s.defstackOverMax
          });
        }
      }
      update();
    }
    return;
  }

  addVal(t.dataset.owner, t.dataset.key, Number(t.dataset.delta));
});

// ===== 初期化 =====
let cardsReadyFired = false;
let lastStateJson = "";

// lastStateJson を外部からリセットする公開関数（ファーストドローフェーズ等で使用）
window.resetLastStateJson = function() { lastStateJson = ""; };

let _chatEventsBound = false;
let _gameBootstrapped = false;
let _connectionEventsBound = false;

function bindConnectionUiEvents() {
  if (_connectionEventsBound) return;
  if (!window.firebaseClient || typeof firebaseClient.on !== "function") return;
  _connectionEventsBound = true;

  firebaseClient.on("disconnected", () => {
    showWarningMessage("接続が切断されました。再接続を試みています…");
    if (typeof showGameplayMessage === "function") {
      showGameplayMessage("再接続中", "#ffb347");
    }
  });

  firebaseClient.on("connected", () => {
    showSuccessMessage("接続が回復しました。");
    if (typeof showGameplayMessage === "function") {
      showGameplayMessage("接続復帰", "#00ff99");
    }
  });
}

function setupGameUiEnhancements() {
  const chat = document.getElementById("chatArea");
  if (!chat || chat.dataset.expandToggle === "1") return;
  chat.dataset.expandToggle = "1";
  chat.addEventListener("click", (e) => {
    if (e.target.closest("#chatInputRow")) return;
    if (e.target.closest("#chatInput") || e.target.closest("#chatSendBtn")) return;
    chat.classList.toggle("chat-expanded");
  });
}

async function handleFreshStart(currentRoom, myKey) {
  console.log("[initGame] NEW ROOM: プレイヤーデータを完全初期化");

  // プレイヤー状態を完全リセット（前のルームの残滓を消す）
  state.player1 = { ...makeCharState(), diceValue: -1 };
  state.player2 = { ...makeCharState(), diceValue: -1 };

  // username / backImage は matchSetup から引き継ぐ
  const matchSetupData = (() => {
    try { return JSON.parse(localStorage.getItem("matchSetup")) || {}; } catch { return {}; }
  })();
  state[myKey].username  = matchSetupData.username || matchSetupData.self || localStorage.getItem("username") || myKey;
  state[myKey].backImage = getBackImage() || null;

  // matchData を初期状態にリセット
  state.matchData = {
    round: 1, turn: 1, turnPlayer: "player1",
    status: "ready_check", winner: null, winnerSetAt: null, firstPlayer: null
  };

  // 各種フラグをクリア
  window._gameStartInitiated = false;
  window._lastRound          = undefined;
  window._resultDismissed    = false;
  window._resultShowing      = false;
  window._lastWinner         = null;
  window._gameStartedAt      = Date.now();
  lastTurnPlayer             = null;

  // 古いルームの残滓をFirebaseから削除（部屋作成者のみ実行して競合防止）
  if (firebaseClient?.db && myKey === "player1") {
    await firebaseClient.db.ref(`rooms/${currentRoom}/playerDice`).remove().catch(() => {});
    await firebaseClient.db.ref(`rooms/${currentRoom}/fieldCards`).remove().catch(() => {});
    await firebaseClient.db.ref(`rooms/${currentRoom}/pendingChange`).remove().catch(() => {});
    await firebaseClient.db.ref(`rooms/${currentRoom}/logs`).remove().catch(() => {});
    await firebaseClient.db.ref(`rooms/${currentRoom}/rematch`).remove().catch(() => {});
  }

  // デッキ初期化
  const deckCodeCheck = localStorage.getItem("deckCode");
  console.log(`[handleFreshStart] deckCode="${deckCodeCheck}", matchSetup.deckCode="${matchSetupData.deckCode}"`);
  initDeckFromCode();
  state[myKey].backImage = getBackImage() || null;
  shuffleDeck();
  console.log(`[handleFreshStart] デッキ初期化完了: ${state[myKey]?.deck?.length ?? 0}枚`);
  markGameStarted();
  save();
  addGameLog(`${window.myUsername || state[myKey]?.username || myKey} が入室しました。`);
}

async function handleReload(currentRoom, myKey, opKey) {
  console.log("[initGame] RELOAD: Firebase から状態を完全復元");

  // まずローカルキャッシュを読み込む（オフライン時のフォールバック）
  load();

  if (firebaseClient?.db) {
    try {
      // matchData 復元
      const matchSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/matchData`).once('value');
      if (matchSnap.exists()) {
        const md = matchSnap.val();
        // winner は復元しない（再判定させる）
        const { winner: _w, winnerSetAt: _ws, ...mdRest } = md;
        state.matchData = { ...state.matchData, ...mdRest };
        console.log("[initGame] matchData 復元:", state.matchData.status);
      }

      // 相手の playerState を復元
      const opSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerState/${opKey}`).once('value');
      if (opSnap.exists()) {
        const { diceValue: _d, username: _u, deck: _deck, ...rest } = opSnap.val();
        Object.assign(state[opKey], rest);
        console.log("[initGame] 相手の状態を復元:", opKey);
      }

      // 自分の playerState を復元（ローカルより Firebase を優先）
      const mySnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerState/${myKey}`).once('value');
      if (mySnap.exists()) {
        const { diceValue: _d, username: _u, deck: _deck, ...rest } = mySnap.val();
        Object.assign(state[myKey], rest);
        // デッキの中身はローカルから維持（Firebase には HIDDEN しか入っていない）
        initDeckFromCode();
        console.log("[initGame] 自分の状態を復元:", myKey);
      }

      // ダイス値を復元
      if (state.matchData.status === "setup_dice") {
        const diceSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerDice`).once('value');
        if (diceSnap.exists()) {
          const diceData = diceSnap.val() || {};
          if (diceData.player1 >= 0) state.player1.diceValue = diceData.player1;
          if (diceData.player2 >= 0) state.player2.diceValue = diceData.player2;
        }
      }

      normalizeState();
      applyLevelStats("player1");
      applyLevelStats("player2");

      // 再開時は Firebase 側の進行ステータスを尊重し、上書きしない
      console.log("[initGame] 再開ステータスを維持:", state.matchData.status);

    } catch (e) {
      console.warn("[initGame] Firebase 復元エラー:", e);
    }

    // ── リロード時: 自分を rooms/players に再登録 ──
    try {
      const myPlayerRef = firebaseClient.db.ref(`rooms/${currentRoom}/players/${myKey}`);
      const myPlayerSnap = await myPlayerRef.once('value');
      if (!myPlayerSnap.exists()) {
        console.log("[initGame] リロード後に自分を rooms/players に再登録:", myKey);
        await myPlayerRef.set({
          username: window.myUsername || state[myKey].username || localStorage.getItem("username") || myKey,
          sessionId: firebaseClient.sessionId,
          ready: true,
          joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
      // onDisconnect を再設定
      await firebaseClient.setupOnDisconnect(currentRoom, myKey);
    } catch (e) {
      console.warn("[initGame] 再登録エラー:", e);
    }
  }
}

async function initGame() {
  traceGame("initGame", "start");
  window.notifySyncGate("initDone", false);
  updateSyncLoadingOverlay();
  if (_gameBootstrapped) {
    traceGame("initGame", "return", "already bootstrapped");
    console.log("[initGame] already bootstrapped - skip duplicate init");
    return;
  }
  _gameBootstrapped = true;

  if (typeof setupChatUI === "function") {
    invokeGuarded("initGame.setupChatUI", () => setupChatUI());
  } else {
    traceGame("initGame.setupChatUI", "missing");
  }
  if (typeof window.setupChatEvents === "function") {
    invokeGuarded("initGame.setupChatEvents", () => window.setupChatEvents());
  } else {
    traceGame("initGame.setupChatEvents", "missing");
  }

  try {
    if (typeof bindConnectionUiEvents === "function") {
      invokeGuarded("initGame.bindConnectionUiEvents", () => bindConnectionUiEvents());
    } else {
      traceGame("initGame.bindConnectionUiEvents", "missing");
    }
    console.log("[initGame] step0: loading assets");
    try {
      traceGame("initGame", "await", "loadCardData");
      await loadCardData();
      traceGame("initGame", "success", "loadCardData");
      traceGame("initGame", "await", "loadLevelStats");
      await loadLevelStats();
      window._levelStatsLoaded = true;
      traceGame("initGame", "success", "loadLevelStats");
    } catch (e) {
      traceGame("initGame", "failure", e?.message || e);
      console.warn("[initGame] asset load warning:", e);
    }

    const currentRoom = localStorage.getItem("gameRoom");
    const myKey = localStorage.getItem("gamePlayerKey") || ((window.getMyRole ? window.getMyRole() : window.myRole || "player1"));
    const opKey = myKey === "player1" ? "player2" : "player1";

    if (!currentRoom) {
      throw new Error("gameRoom が未設定です。対戦ルーム情報を確認してください。");
    }

    const isReload = sessionStorage.getItem("wasInGame") === currentRoom;
    console.log(`[initGame] isReload=${isReload} room=${currentRoom}`);

    if (!isReload) {
      traceGame("initGame", "await", "handleFreshStart");
      await handleFreshStart(currentRoom, myKey);
      traceGame("initGame", "success", "handleFreshStart");
    } else {
      traceGame("initGame", "await", "handleReload");
      await handleReload(currentRoom, myKey, opKey);
      traceGame("initGame", "success", "handleReload");
    }

    // ── 3. 接続プレイヤー数を確認して操作ロック解除判定 ──
    if (firebaseClient?.db) {
      try {
        const playersSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/players`).once('value');
        const players = playersSnap.val() || {};
        // username を state に反映（再入室時に相手名が失われないよう）
        if (players.player1?.username) state.player1.username = players.player1.username;
        if (players.player2?.username) state.player2.username = players.player2.username;
        // 接続状態を即時反映（ウォッチャーの初回コールバック前にロックを解除するため）
        window._bothPlayersConnected = !!players.player1 && !!players.player2;
        traceGame("bothConnected", "set", window._bothPlayersConnected);
        window.notifySyncGate("playersReady", window._bothPlayersConnected);
        // 両プレイヤー接続済みで ready_check なら setup_dice へ遷移
        if (window._bothPlayersConnected && state.matchData.status === "ready_check") {
          const prevStatus = state.matchData.status;
          state.matchData.status = "setup_dice";
          console.log(`[PHASE] local -> ${state.matchData.status}`);
          traceGame("initGame.phase", "transition", "ready_check -> setup_dice");
          if (typeof window.tracePhaseDiff === "function") {
            window.tracePhaseDiff("initGame", state.matchData.status);
          } else if (window.debugMode) {
            console.log(`[PHASE] ${prevStatus} -> ${state.matchData.status} @initGame`);
          }
          firebaseClient.writeMatchData(currentRoom, state.matchData).catch((e) => {
            traceGame("initGame.phase", "failure", e?.message || e);
          });
        }
        applyInteractionLockState();
        console.log("[initGame] 接続プレイヤー数:", Object.keys(players).length, "bothConnected:", window._bothPlayersConnected);
      } catch (e) {
        console.warn("[initGame] players確認エラー:", e);
      }
    }

    // ── 4. セッション記録・winner クリア・gameReady セット ──
    sessionStorage.setItem("wasInGame", currentRoom);
    window._lastGameRoom = currentRoom;
    window._isReload = isReload;

    // winner は再開整合性のため維持（stale 判定は watcher 側で処理）
    // 3秒の猶予: Firebase から流れてくる古い winner を stale として無視できるようにする
    // window._gameStartedAt = Date.now() + 3000; // 削除

    console.log("[initGame] gameReady = true");
    gameReady = true;
    if (typeof update === "function") {
      update();
    } else {
      traceGame("initGame.update", "missing");
    }

    // ── 5. デッキオブジェクト配置 ──
    if (cardsReadyFired) {
      if (typeof createDeckObject === "function") createDeckObject(!isReload);
      else traceGame("initGame.createDeckObject", "missing");
    } else {
      window.addEventListener("cardsReady", () => {
        if (typeof createDeckObject === "function") createDeckObject(!isReload);
        else traceGame("initGame.createDeckObject.cardsReady", "missing");
      }, { once: true });
    }

    // ── 6. Firebase Watcher 開始（ルーム状態監視） ──
    window.initialState = {
      gameState: JSON.parse(JSON.stringify(state)),
      fieldCards: []
    };
    if (typeof setupGameUiEnhancements === "function") {
      invokeGuarded("initGame.setupGameUiEnhancements", () => setupGameUiEnhancements());
    } else {
      traceGame("initGame.setupGameUiEnhancements", "missing");
    }
    if (typeof setupRoomWatcher === "function") {
      invokeGuarded("initGame.setupRoomWatcher", () => setupRoomWatcher());
    } else {
      traceGame("initGame.setupRoomWatcher", "missing");
    }

    // ── 7. 自分の最新状態を Firebase に送信（整合性担保） ──
    if (firebaseClient?.db) {
      traceGame("initGame", "await", "writeMyState");
      await firebaseClient.writeMyState(currentRoom, myKey, _getMyStateForSync());
      traceGame("initGame", "success", "writeMyState");
    }
    window.notifySyncGate("initDone", true);
    updateSyncLoadingOverlay();

  } catch (e) {
    traceGame("initGame", "failure", e?.message || e);
    console.error("initGame FAILED:", e);
    console.error("Stack:", e.stack);
    const playerEl = document.getElementById("gameUiPlayer");
    if (playerEl) {
      playerEl.innerHTML = `<div class="lorPanel"><div class="statusMessage">対戦UIの初期化に失敗しました: ${e.message}<br><pre style="font-size:10px;color:#f88;white-space:pre-wrap;">${e.stack}</pre></div></div>`;
    }
    updateSyncLoadingOverlay();
  }
  traceGame("initGame", "end");
}

window.startSoloGame = async function() {
  if (window._bothPlayersConnected) return;
  window._soloStartMode = true;
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const op = me === "player1" ? "player2" : "player1";
  if (!state[op].username) state[op].username = "CPU";
  if (state.matchData?.status === "setup_dice" && (state[op].diceValue === undefined || state[op].diceValue < 0)) {
    state[op].diceValue = Math.floor(Math.random() * 100) + 1;
  }
  applyInteractionLockState();
  update();
};

window.addEventListener("cardsReady", () => {
  cardsReadyFired = true;
});

// Firebase 初期化完了を待ってから initGame を呼ぶ
// game.html の window.load → firebaseClient.initialize() → firebaseJoined の順で発火する
document.addEventListener("firebaseJoined", () => {
  traceGame("firebaseJoined", "received");
  console.log("[Game] firebaseJoined 受信 → initGame 開始");
  initGame();
});

// ===== タイマー処理は削除（時間制限機能は実装しない） =====
// 時間制限機能は Firebase では複雑なため、MVP では実装しません

// ===== R1T1処理 =====
/** R1T1 用の追加 UI（未実装）。盤面への5枚配置のみ startR1T1 が担当。 */
function showR1T1Selection(_n) {}

function startR1T1() {
  const m = state.matchData;
  if (m && m.firstDrawDone === true) {
    console.log("[R1T1] ファーストドロー済みのためスキップします。");
    return;
  }
  const me = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");
  const myState = state[me];
  if (!myState || myState.deck.length < 5) {
    console.warn("[R1T1] デッキが5枚未満です。処理をスキップします。");
    return;
  }

  // 山札から5枚取り出す（盤面へ配置、非公開）
  const takenCards = [];
  for (let i = 0; i < 5; i++) {
    const rawId = myState.deck.pop();
    if (!rawId) break;
    takenCards.push(rawId);
  }

  // 取り出したカードを盤面へ配置（非公開）
  const deckObj = document.querySelector(`.deckObject[data-owner="${me}"]`);
  const deckX = deckObj ? Number(deckObj.dataset.x) : 0;
  const deckY = deckObj ? Number(deckObj.dataset.y) : 0;

  const field = document.getElementById("field");
  takenCards.forEach((rawId, i) => {
    const card = createCard(rawId);
    if (!card) return;
    card.dataset.visibility = "none";
    card.dataset.owner = me;
    card.dataset.origin = me;
    card.classList.add("visibilityNone");
    if (typeof updateVisibilityIcon === "function") {
      updateVisibilityIcon(card, "none");
    }
    if (typeof applyCardFace === "function") applyCardFace(card, "none");
    if (typeof placeCard === "function") {
      card.style.zIndex = ++cardZCounter;
      placeCard(field, card, { x: deckX + 100 + i * 80, y: deckY - 200 });
    }
  });

  // UI: 5枚から3枚選択
  showR1T1Selection(takenCards.length);

  // チャット記録
  if (typeof addGameLog === "function") {
    const playerName = window.myUsername || me;
    addGameLog(`${playerName} が R1T1を開始しました`);
  }
}

function startTurnDraw() {
  const m = state.matchData || {};
  const me = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");
  if (m.status !== "playing" || m.turnPlayer !== me || m.winner) return;
  const myState = state[me];
  if (!myState || myState.deck.length === 0) {
    console.warn("[TurnDraw] デッキが空です。敗北判定を実行します。");
    if (typeof addGameLog === "function") {
      addGameLog(`[DEFEAT] ${window.myUsername || "プレイヤー"} のデッキが空になりました。敗北です。`);
    }
    if (typeof triggerOverdrawDefeat === "function") {
      setTimeout(() => triggerOverdrawDefeat(), 500);
    }
    return;
  }

  // 山札から1枚取得
  const rawId = myState.deck.pop();
  if (!rawId) return;

  // 手札へ追加
  const card = createCard(rawId);
  if (!card) return;
  card.dataset.visibility = "self";
  card.dataset.owner = me;
  card.dataset.origin = me;
  card.classList.add("visibilitySelf");
  if (typeof updateVisibilityIcon === "function") {
    updateVisibilityIcon(card, "self");
  }
  if (typeof applyCardFace === "function") applyCardFace(card, "self");

  const field = document.getElementById("field");
  const deckObj = document.querySelector(`.deckObject[data-owner="${me}"]`);
  const deckX = deckObj ? Number(deckObj.dataset.x) : 0;
  const deckY = deckObj ? Number(deckObj.dataset.y) : 0;
  if (typeof placeCard === "function") {
    card.style.zIndex = ++cardZCounter;
    card.style.left = deckX + "px";
    card.style.top = deckY + "px";
    const nextOrder = (typeof window.nextHandOrder === "function") ? window.nextHandOrder() : Date.now();
    card.dataset.handOrder = String(nextOrder);
    placeCard(field, card, { x: deckX, y: deckY });
  }

  // PP +1（上限まで）
  const currentPp = Number(myState.pp) || 0;
  const maxPp = Number(myState.ppMax) || 2;
  myState.pp = Math.min(currentPp + 1, maxPp);

  // 手札整列
  if (typeof window.organizeHands === "function") window.organizeHands();

  // アニメーション
  card.animate([
    { transform: `translate(${deckX - deckX}px, ${deckY - 1600}px) scale(0.5)`, opacity: 0 },
    { transform: `translate(0, 0) scale(1.1)`, opacity: 1, offset: 0.8 },
    { transform: `translate(0, 0) scale(1)`, opacity: 1 }
  ], { duration: 500, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });

  // チャット記録
  if (typeof addGameLog === "function") {
    const playerName = window.myUsername || me;
    addGameLog(`${playerName} が カードを1枚引いた`);
  }

  // 保存
  if (typeof saveAllImmediate === "function") saveAllImmediate();
  if (typeof update === "function") update();
}
function updateZoneCountsInState() {
  ["player1", "player2"].forEach(owner => {
    const s = state[owner];
    if (!s) return;
    const cards = Array.from(document.querySelectorAll(".card:not(.deckObject)")).filter(c => c.dataset.owner === owner);
    
    s.handCount = cards.filter(c => {
      const y = parseInt(c.dataset.y || 0);
      return !c.dataset.zoneType && (owner === "player1" ? y >= 1460 : y <= 540);
    }).length;
    
    s.attackerCount = cards.filter(c => c.dataset.zoneType === "attacker").length;
    s.skillCount = cards.filter(c => c.dataset.zoneType === "skill").length;
    s.graveCount = cards.filter(c => c.dataset.zoneType === "grave").length;
    
    s.fieldNoneCount = cards.filter(c => {
      const y = parseInt(c.dataset.y || 0);
      const isHand = (owner === "player1" ? y >= 1460 : y <= 540);
      return !c.dataset.zoneType && !isHand;
    }).length;
  });
}

