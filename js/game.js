let gameReady = false;

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
      status: "setup_dice",
      winner: null, firstPlayer: null
    },
    logs: []
  };
  
  // localStorage をクリア
  localStorage.removeItem("gameState");
  localStorage.removeItem("fieldCards");
  localStorage.removeItem("gameStarted");
  localStorage.removeItem("gameRoom");
  localStorage.removeItem("gamePlayerKey");
  
  // UI をリセット
  const overlay = document.getElementById("dicePhaseOverlay");
  if (overlay) overlay.style.display = "none";
  
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

    // 相手のデッキ画像も表示（backImageが設定されていない場合はデフォルト画像）
    const backImage = state[owner]?.backImage || "assets/favicon.png";
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
      wrapper.addEventListener("dblclick", () => { drawFromDeckObject(); });
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
    alert("リセットプロトコルは実行直後です。しばらくお待ちください。");
    return;
  }

  const ok = confirm("盤面全体のリセットプロトコルを実行しますか？（自分と相手の両方のステータスが初期化されます）");
  if (!ok) return;

  await executeReset();
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
  pushMyStateDebounced(); // デッキ枚数を同期
  update();
}

// ===== ドロー =====
function drawFromDeckObject() {
  if (!gameReady) return;
  const currentRole = window.getMyRole();
  if (!currentRole) return;

  const s = state[currentRole];
  if (!s || !s.deck || s.deck.length === 0) {
    // デッキが空の状態でドローしようとした場合、敗北判定
    console.warn("[Draw] デッキが空です。敗北判定を実行します。");
    addGameLog(`[DEFEAT] ${window.myUsername || state[currentRole]?.username || "プレイヤー"} はデッキが空の状態でドローしようとしました。敗北です。`);
    // オーバードロー敗北判定を呼び出し
    setTimeout(() => triggerOverdrawDefeat(), 100);
    return;
  }

  let rawId = s.deck.pop();
  if (!rawId) return;

  let isTemp = false;
  if (typeof rawId === "string" && rawId.startsWith("TEMP:")) {
    isTemp = true;
    rawId = rawId.replace("TEMP:", "");
  }

  const deckObj = getFieldContent().querySelector(".deckObject[data-owner='" + currentRole + "']");
  const deckX = deckObj ? Number(deckObj.dataset.x) : -320;
  const deckY = deckObj ? Number(deckObj.dataset.y) : 200;
  const handY = 1600;

  const card = createCard(rawId);
  if (card) {
    card.dataset.owner = currentRole;
    card.dataset.origin = currentRole;
    if (isTemp) card.dataset.isTemp = "true";

    card.dataset.visibility = "self";
    card.classList.add("visibilitySelf");
    const label = card.querySelector(".cardVisibilityLabel");
    if (label) label.textContent = "自分のみ";
    card.style.zIndex = ++cardZCounter;
    const nextOrder = (typeof window.nextHandOrder === "function") ? window.nextHandOrder() : Date.now();
    card.dataset.handOrder = String(nextOrder);
    placeCard(document.getElementById("field"), card, { x: deckX, y: deckY });
    if (typeof window.organizeHands === "function") window.organizeHands();
    const destX = parseFloat(card.style.left) || deckX;
    const destY = parseFloat(card.style.top) || handY;
    card.animate([
      { transform: `translate(${deckX - destX}px, ${deckY - destY}px) scale(0.55)`, opacity: 0.2 },
      { transform: "translate(0, 0) scale(1.08)", opacity: 1, offset: 0.8 },
      { transform: "translate(0, 0) scale(1)", opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" });
  }

  // 即時保存
  if (typeof saveImmediate === "function") saveImmediate();
  else save();

  updateDeckObject();
  pushMyStateDebounced(); // デッキ枚数を同期
  update();
}

// ===== ステータスUI =====

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
  if (key === "defstack") {
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
function calcExpMax(level) {
  return Math.max(1, level) * 2;
}

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

function barPct(current, max) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

// バー+増減行（スライダーなし版とあり版）
function renderBarRow(owner, key, label, fillClass, withSlider = true) {
  const s = state[owner];
  const cur = s[key];
  const max = s[key + "Max"];
  const pct = barPct(cur, max);
  const slider = withSlider ? `
    <input class="statSlider" type="range" min="0" max="${max}" value="${Math.min(Math.max(cur, 0), max)}"
      data-owner="${owner}" data-key="${key}" data-type="slider">` : "";
  return `
  <div class="statBarWrap">
    <div class="statBarLabel">${label}</div>
    <div class="statBarOuter">
      <div class="statBarInner ${fillClass}" style="width:${pct}%"></div>
    </div>
    <div class="statBarControls">
      <button class="statBtn" data-owner="${owner}" data-key="${key}" data-delta="-1">−</button>
      <input class="statBarInput" type="number" value="${cur}"
        data-owner="${owner}" data-key="${key}" data-type="val">
      <button class="statBtn" data-owner="${owner}" data-key="${key}" data-delta="1">＋</button>
      <span class="statBarSep">/</span>
      <input class="statMaxInput" type="number" value="${max}"
        data-owner="${owner}" data-key="${key}" data-type="max">
    </div>
    ${slider}
  </div>`;
}

// レベル行（増減ボタンなし）
function renderLevelRow(owner) {
  const s = state[owner];
  return `
  <div class="statLevelWrap">
    <span class="statNumLabel">Lv</span>
    <input class="statLevelInput" type="number" value="${s.level}"
      data-owner="${owner}" data-key="level" data-type="val">
  </div>`;
}

// 数値のみ行（スライダーなし）
function renderNumRow(owner, key, label) {
  const s = state[owner];
  return `
  <div class="statNumWrap">
    <span class="statNumLabel">${label}</span>
    <button class="statBtn" data-owner="${owner}" data-key="${key}" data-delta="-1">−</button>
    <input class="statNumInput" type="number" value="${s[key]}"
      data-owner="${owner}" data-key="${key}" data-type="val">
    <button class="statBtn" data-owner="${owner}" data-key="${key}" data-delta="1">＋</button>
  </div>`;
}

function renderOwnerUI(owner) {
  // 副作用なし：state を変更せず、ローカル変数で計算する
  const s = state[owner];
  const isMine = owner === (window.myRole || "player1");
  const currentPp = Number.isFinite(Number(s.pp)) ? Number(s.pp) : 0;
  const maxPp = Number.isFinite(Number(s.ppMax)) ? Number(s.ppMax) : 2;
  const expMax = calcExpMax(s.level);
  const defstackMax = s.def || 0;
  const hpPct = barPct(s.hp, s.hpMax);
  const barrierPct = barPct(s.shield, s.shieldMax);
  const sldPct = barPct(s.defstack, defstackMax);
  const expPct = barPct(s.exp, expMax);
  const atMaxLv = s.level >= (s.levelMax || LEVEL_MAX);
  const atMinExp = s.level <= 1 && s.exp <= 0;

  return `
  <div style="display:flex; align-items:flex-end; gap:12px; ${isMine ? '' : 'flex-direction:row-reverse;'}">
  <div class="lorPanel" data-owner="${owner}">

    <!-- 左: レベル・経験値 -->
    <div class="lorLeft">
      <div style="text-align:center; font-size:14px; color:#e0d0a0; margin-bottom:6px; font-weight:bold; letter-spacing:1px;">
        ${s.username ? s.username : (owner === "player1" ? "Player 1" : "Player 2")}
      </div>
      <div class="lorLevelBlock">
        <div class="lorLevelLabel">LV</div>
        <div class="lorLevelGem">
          <svg class="lorExpRing" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3"/>
            <circle cx="22" cy="22" r="19" fill="none" stroke="#c89b3c"
              stroke-width="3"
              stroke-dasharray="${(expPct * 119.4 / 100).toFixed(2)} 119.4"
              stroke-dashoffset="0"
              stroke-linecap="butt"
              transform="rotate(-90 22 22)"/>
          </svg>
          <div class="lorLevelInner">
            <div class="lorLevelNum">${s.level}</div>
          </div>
        </div>
      </div>
      <div class="lorExpRow" style="margin-bottom: 4px;">
        ${(atMinExp || !isMine)
      ? `<span class="lorSmBtnPlaceholder"></span>`
      : `<button class="lorSmBtn" data-owner="${owner}" data-key="exp" data-delta="-1">−</button>`
    }
        <span class="lorExpVal">EXP ${s.exp}/${expMax}</span>
        <span class="lorSmBtnPlaceholder"></span>
      </div>
      ${(!atMaxLv && isMine)
        ? `<button class="lorExpAddBtn lorSmBtn" data-owner="${owner}" data-key="exp" data-delta="1" style="width: 100%; padding: 4px 0; font-size: 11px; margin-top: 4px; background: rgba(50,40,30,0.8); border: 1px solid #7a6a40; border-radius: 4px; color: #f0d080; cursor: pointer; transition: all 0.2s;">＋ EXP追加</button>`
        : `<div style="height:24px;"></div>`
      }
    </div>

    <!-- 中央: HP・シールド -->
    <div class="lorCenter">
      <div class="lorStatRow lorBarrierRow" style="transform: scale(0.85); transform-origin: left bottom; margin-bottom: -4px;">
        <span class="lorIcon" data-tooltip="シールド">${ICON_BARRIER}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorShieldFill" style="width:${barrierPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? (s.shield <= 0 ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="shield" data-delta="-1">−</button>`) : ""}
          <input class="lorValInput" type="number" value="${s.shield}"
            data-owner="${owner}" data-key="shield" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${s.shieldMax}" readonly disabled
            style="opacity: 0.6; cursor: not-allowed;">
          ${isMine ? (s.shield >= s.shieldMax ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="shield" data-delta="1">＋</button>`) : ""}
        </div>
      </div>
      <div class="lorStatRow">
        <span class="lorIcon" data-tooltip="HP">${ICON_HP}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorHpFill" style="width:${hpPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? (s.hp <= 0 ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="hp" data-delta="-1">−</button>`) : ""}
          <input class="lorValInput" type="number" value="${s.hp}"
            data-owner="${owner}" data-key="hp" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${s.hpMax}"
            data-owner="${owner}" data-key="hp" data-type="max" ${isMine ? "" : "readonly disabled"}>
          ${isMine ? (s.hp >= s.hpMax ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="hp" data-delta="1">＋</button>`) : ""}
        </div>
      </div>
      <div class="lorStatRow" style="position: relative;">
        <span class="lorIcon" data-tooltip="防御力">${ICON_SLD}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorDefstackFill" style="width:${sldPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? (s.defstack <= 0 ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="defstack" data-delta="-1">−</button>`) : ""}
          <input class="lorValInput" type="number" value="${s.defstack}"
            data-owner="${owner}" data-key="defstack" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${defstackMax}" readonly disabled
            style="opacity: 0.6; cursor: not-allowed;">
          ${isMine ? (s.defstack >= defstackMax && !s.defstackOverMax ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn" data-owner="${owner}" data-key="defstack" data-delta="1">＋</button>`) : ""}
        </div>
      </div>
    </div>

    <!-- 右: ATK/DEF/IDEF -->
    <div class="lorRight">
      ${lorStatChip(ICON_ATK, s.atk, owner, "atk", "基礎攻撃力")}
      ${lorStatChip(ICON_DEF, s.def, owner, "def", "基礎防御力")}
      ${lorStatChip(ICON_IDEF, s.instantDef, owner, "instantDef", "瞬間防御力")}
      ${isMine ? `
        <div class="lorActionGroup">
          <button class="lorInstantDefBtn" data-owner="${owner}" data-action="addInstantDef" type="button">瞬間防御</button>
          <button class="lorResetDefBtn" data-owner="${owner}" data-action="resetDefense" type="button" title="防御解除">解除</button>
        </div>
      ` : ""}
    </div>

  </div>
  
  <div style="display:flex; flex-direction:column; gap:8px;">
    <!-- PP パネル -->
    <div class="evoPanel" style="
      background: rgba(10,8,20,0.85); border: 1px solid #5a4b27; border-radius: 8px;
      padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 120px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    ">
      <div style="font-size:11px; color:#aaa; letter-spacing:1px; margin-bottom:2px;" data-tooltip="ターン毎の行動ポイント">PP</div>
      <div style="display:flex; align-items:center; gap:8px;">
        ${isMine ? (currentPp <= 0 ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn lorPpBtn" data-owner="${owner}" data-key="pp" data-delta="-1">−</button>`) : `<span class="lorSmBtnPlaceholder"></span>`}
        <span style="font-size:20px; font-weight:bold; color:#00ffff;">${currentPp}/${maxPp}</span>
        ${isMine ? (currentPp >= maxPp ? `<span class="lorSmBtnPlaceholder"></span>` : `<button class="lorSmBtn lorPpBtn" data-owner="${owner}" data-key="pp" data-delta="1">＋</button>`) : `<span class="lorSmBtnPlaceholder"></span>`}
      </div>
    </div>

  ${s.evolutionPath ? `
  <div class="evoPanelWrapper" data-owner="${owner}" style="position:relative;">
    <div class="evoPanel" style="
      background: rgba(10,8,20,0.85); border: 1px solid #5a4b27; border-radius: 8px;
      padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 120px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    ">
      <div style="font-size:11px; color:#aaa; letter-spacing:1px; margin-bottom:4px;">進化の道</div>
      <div class="evoPanelTitle" data-owner="${owner}" style="font-size:16px; font-weight:bold; color:#f0d080; text-align:center; cursor:pointer;" title="クリックで拡大表示">${s.evolutionPath}</div>
      ${s.evolutionPath === '継続の道' ? `<div style="font-size:11px; color:#ddd; margin-top:4px;">今ターン発動: ${s.evoContinuousDmgCount || 0}回</div>` : ""}
      ${s.evolutionPath === '背水の道' ? `<div style="font-size:11px; color:#ddd; margin-top:4px;">追加EXP: ${s.evoBackwaterExpGained ? '<span style="color:#f88;">獲得済</span>' : '<span style="color:#8f8;">未獲得</span>'}</div>` : ""}
    </div>
    <div class="evoPopup" style="
      position: absolute; ${owner === window.myRole ? 'bottom: 100%; margin-bottom: 0; padding-bottom: 8px;' : 'top: 100%; margin-top: 0; padding-top: 8px;'} 
      left: 50%; transform: translateX(-50%); width: 320px;
      z-index: 99999; pointer-events: none;
      opacity: 0; transition: opacity 0.2s; visibility: hidden;
    ">
      <div style="background: rgba(10,8,20,0.95); border: 1px solid #c89b3c; border-radius: 6px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.8);">
        ${getEvolutionPathHTML(owner)}
      </div>
    </div>
  </div>
  ` : ""}
  </div>
  
  </div>`;
}

function getEvolutionPathTooltip(owner) { return ""; } // Obsolete, keeping to avoid undefined errors if called elsewhere

function openEvolutionPathModal(owner) {
  const html = getEvolutionPathHTML(owner);
  if (!html) return;
  const overlay = document.createElement("div");
  overlay.className = "evoDetailOverlay";
  overlay.innerHTML = `
    <div class="evoDetailModal" role="dialog" aria-modal="true">
      <button type="button" class="evoDetailClose" aria-label="閉じる">✕</button>
      ${html}
    </div>
  `;
  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    close();
  };
  const close = () => {
    document.removeEventListener("keydown", onEsc);
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("evoDetailClose")) close();
  });
  document.addEventListener("keydown", onEsc);
  document.body.appendChild(overlay);
}

function getEvolutionPathHTML(owner) {
  const s = state[owner];
  if (!s || !s.evolutionPath) return "";
  const lv = s.level || 1;
  let idx = 0;
  if (lv >= 6) idx = 3;
  else if (lv >= 5) idx = 2;
  else if (lv >= 3) idx = 1;

  let desc = "";
  let tableHTML = "";

  const colorAction = "#ff9999"; // 行動につながる部分
  const colorLevel = "#66ccff"; // レベルで変動する変数

  if (s.evolutionPath === '忍耐の道') {
    const xArr = [0, 1, 3, 4];
    const x = xArr[idx];
    desc = `手札の枚数上限が<span style="color:${colorAction}">2枚増加</span>し、最大レベル時(Lv6)は2ではなく<span style="color:${colorAction}">3枚</span>になる。<br>また、ラウンド開始時、手札を <span style="color:${colorLevel}; font-size:16px; font-weight:bold;">${x}</span> <span style="color:${colorAction}">枚増やす</span>。<br>さらに、自身のターン終了時、枚数上限によって手札を捨てると、捨てた枚数ごとに<span style="color:${colorAction}">経験値を最大2まで獲得</span>する。`;
    tableHTML = `x = [0, 1, 3, 4]`;
  } else if (s.evolutionPath === '継続の道') {
    const yArr = [1, 3, 4, 6];
    const y = yArr[idx];
    desc = `ターン毎に <span style="color:${colorLevel}; font-size:16px; font-weight:bold;">${y}</span> 回まで、1以上のダメージを与える度(※)、<span style="color:${colorAction}">1のダメージ</span>を与える。<br>さらに追加で、それぞれ3回目の発動に限り、<span style="color:${colorAction}">1の貫通ダメージ</span>を与える。<br><span style="font-size:10px; color:#aaa;">※：この効果によるものは含まない</span>`;
    tableHTML = `y = [1, 3, 4, 6]`;
  } else if (s.evolutionPath === '瞬発の道') {
    const zArr = [1, 3, 4, 6];
    const z = zArr[idx];
    desc = `一撃で6以上のダメージを与える時、そのダメージ判定の直前に <span style="color:${colorLevel}; font-size:16px; font-weight:bold;">${z}</span> の<span style="color:${colorAction}">脆弱ダメージ</span>を与える。`;
    tableHTML = `z = [1, 3, 4, 6]`;
  } else if (s.evolutionPath === '背水の道') {
    const tArr = [1, 2, 3, 4];
    const t = tArr[idx];
    desc = `手札が2枚以下の状態なら、[直接攻撃/”直接攻撃時“効果]の<span style="color:${colorAction}">ダメージを +1</span> する。<br>また、自身のPPが2以上なら、<span style="color:${colorAction}">与ダメージを追加で</span> <span style="color:${colorLevel}; font-size:16px; font-weight:bold;">+${t}</span> して、<span style="color:${colorAction}">1の経験値を獲得</span>する。<br><span style="font-size:10px; color:#aaa;">ただし、この効果による経験値は、ターン毎に1回まで獲得可能。</span>`;
    tableHTML = `t = [1, 2, 3, 4]`;
  }
  
  return `
    <div style="font-size:15px; font-weight:bold; color:#f0d080; margin-bottom:8px; border-bottom:1px solid #5a4b27; padding-bottom:4px; text-align:center;">
      【${s.evolutionPath}】
    </div>
    <div style="font-size:13px; color:#ddd; line-height:1.7; text-align:left;">
      ${desc}
    </div>
    <div style="margin-top:12px; text-align:right; font-size:12px; color:#999; font-family:monospace;">
      ${tableHTML}
    </div>
  `;
}

function lorStatChip(icon, val, owner, key, title = "") {
  const isEditable = window.devMode;
  return `
  <div class="lorChip" data-tooltip="${title}">
    <span class="lorChipIcon">${icon}</span>
    ${isEditable ? `
      <input class="lorChipInput" type="number" value="${val}"
        data-owner="${owner}" data-key="${key}" data-type="val"
        style="width:40px;background:none;border:none;color:inherit;font-family:inherit;font-size:inherit;text-align:center;padding:0;">
    ` : `
      <span class="lorChipVal">${val}</span>
    `}
  </div>`;
}

// ===== アイコン =====
const ICON_BARRIER = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 2 L17 5 L17 11 Q17 16.5 10 19 Q3 16.5 3 11 L3 5 Z"
    fill="rgba(255,255,255,0.4)" stroke="#ffffff" stroke-width="1.2"/>
</svg>`;

const ICON_HP = `<svg viewBox="0 0 20 20" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 17 C10 17 2 12 2 6.5 A4 4 0 0 1 10 5 A4 4 0 0 1 18 6.5 C18 12 10 17 10 17Z"
    fill="#ff6b9d" stroke="#ff3377" stroke-width="0.8"/>
</svg>`;

const ICON_SLD = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 2 L17 5 L17 11 Q17 16.5 10 19 Q3 16.5 3 11 L3 5 Z"
    fill="rgba(47,128,237,0.35)" stroke="#2f80ed" stroke-width="1.2"/>
</svg>`;

const ICON_ATK = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 刀身 -->
  <line x1="3" y1="17" x2="15" y2="5" stroke="#f0d080" stroke-width="2" stroke-linecap="round"/>
  <!-- 先端 -->
  <polygon points="15,5 17,3 19,5 17,7" fill="#f0d080"/>
  <!-- 鍔 -->
  <line x1="8" y1="12" x2="12" y2="8" stroke="#c89b3c" stroke-width="3" stroke-linecap="round"/>
  <!-- 柄 -->
  <line x1="3" y1="17" x2="5" y2="15" stroke="#a07840" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const ICON_DEF = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 2 L17 5 L17 11 Q17 16.5 10 19 Q3 16.5 3 11 L3 5 Z"
    fill="rgba(47,128,237,0.3)" stroke="#2f80ed" stroke-width="1.2"/>
  <!-- 縦線 -->
  <line x1="10" y1="6" x2="10" y2="15" stroke="#2f80ed" stroke-width="1" opacity="0.6"/>
  <!-- 横線 -->
  <line x1="6" y1="10" x2="14" y2="10" stroke="#2f80ed" stroke-width="1" opacity="0.6"/>
</svg>`;

const ICON_IDEF = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 2 L17 5 L17 11 Q17 16.5 10 19 Q3 16.5 3 11 L3 5 Z"
    fill="rgba(47,128,237,0.2)" stroke="#74b9ff" stroke-width="1.2"/>
  <!-- 稲妻 -->
  <polygon points="11,4 8,10.5 10.5,10.5 9,17 13,9.5 10.5,9.5" fill="#f0d080"/>
</svg>`;

function update(skipLogCheck = false) {
  const currentStateStr = JSON.stringify(state);
  
  // 状態が変わっていないならDOMの再構築をスキップ（フォーカス外れやホバーの点滅を防ぐ）
  if (lastStateJson === currentStateStr) {
    return;
  }

  // 初回呼び出し（lastStateJsonが空）の場合は、ログチェックをスキップ
  if (!skipLogCheck && lastStateJson) {
    const oldState = JSON.parse(lastStateJson);
    checkAndLogStateChanges(oldState, state);
  }
  lastStateJson = currentStateStr;

  const playerEl = document.getElementById("gameUiPlayerInner");
  const enemyEl = document.getElementById("gameUiEnemy");
  const myOwner = window.myRole || "player1";
  const enemyOwner = myOwner === "player1" ? "player2" : "player1";

  if (playerEl) playerEl.innerHTML = renderOwnerUI(myOwner);
  if (enemyEl) enemyEl.innerHTML = renderOwnerUI(enemyOwner);

  // マッチ進行UIの更新
  updateMatchUI();

  if (typeof updateDeckObject === "function") updateDeckObject();
  
  // チャットログの更新
  if (typeof updateGameLogs === "function") updateGameLogs(state.logs);

  // update() からは localStorage のみ保存（サーバーへの過剰POSTを防ぐ）
  saveLocal();
}

let lastTurnPlayer = null;

// match-header スタイルは初回のみ <head> に追加（毎回 innerHTML に埋め込まない）
(function injectMatchHeaderStyle() {
  if (document.getElementById('matchHeaderStyle')) return;
  const s = document.createElement('style');
  s.id = 'matchHeaderStyle';
  s.textContent = `
    .match-header {
      background: linear-gradient(180deg, rgba(20, 15, 40, 0.9) 0%, rgba(10, 8, 20, 0.7) 100%);
      backdrop-filter: blur(10px);
      border-bottom: 2px solid #c7b377;
      border-left: 2px solid #c7b377;
      border-right: 2px solid #c7b377;
      border-bottom-left-radius: 20px;
      border-bottom-right-radius: 20px;
      padding: 10px 40px;
      display: flex;
      align-items: center;
      gap: 30px;
      box-shadow: 0 5px 25px rgba(0,0,0,0.5);
    }
    .match-info-center { text-align: center; }
    .match-round { font-size: 12px; color: #c7b377; letter-spacing: 3px; font-weight: bold; text-transform: uppercase; }
    .match-turn-count { font-size: 24px; font-weight: 900; color: #fff; margin-top: -5px; }
    .match-turn-indicator {
      font-size: 10px; letter-spacing: 2px; font-weight: 900; margin-top: 2px;
      padding: 2px 10px; border-radius: 10px;
    }
  `;
  document.head.appendChild(s);
})();

function updateMatchUI() {
  const m = state.matchData;
  if (!m) return;

  // 盤面リセット中は通知を表示しない
  if (window._isResetting) return;

  // ダイスロールが完全に終了するまで通知を表示しない
  // 条件: status が 'playing' かつ firstPlayer が設定されている（ダイスロール完了の証拠）
  const isDicePhaseComplete = m.status === 'playing' && m.firstPlayer;
  
  // ラウンド開始通知（ターンよりも大きな括り）
  // ラウンドが変わった時、かつターン1の時に表示（先攻・後攻関係なく全員に表示）
  const roundChanged = window._lastRound !== m.round && isDicePhaseComplete;
  const isFirstTurnOfRound = m.turn === 1;
  
  if (roundChanged && isFirstTurnOfRound) {
    showRoundNotification(m.round);
    window._lastRound = m.round;
    
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

  // 1. ラウンド・ターン表示
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

  // <style> タグは injectMatchHeaderStyle() で初回のみ <head> に追加済み
  const html = `
    <div class="match-header">
      <div class="match-info-center">
        <div class="match-round">第 ${m.round} ラウンド</div>
        <div class="match-turn-count">ターン ${m.turn}</div>
        <div class="match-turn-indicator" style="background: ${isMyTurn ? '#00ffcc' : '#e24a4a'}; color: #1a172c;">
          ${isMyTurn ? 'あなたのターン' : "相手のターン"}
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

  // 勝敗チェック（checkGameResult 内で showResultScreen も呼ぶ）
  checkGameResult();

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
    endBtn.onclick = handleTurnEnd;
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
  } else if (resultBtn) {
    resultBtn.style.display = "none";
  }

  // 4. ダイスフェーズのオーバーレイ
  updateDicePhaseUI();

  // 5. 進化の道フェーズのオーバーレイ
  updateEvolutionPhaseUI();
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
  `;
  document.head.appendChild(s);
})();

function showNotification(text, color) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
    z-index: 9999; pointer-events: none; text-align: center;
    font-family: 'Outfit', sans-serif; white-space: nowrap;
  `;
  div.innerHTML = `
    <h2 style="
      font-size: 60px; font-weight: 900; color: ${color}; margin: 0;
      letter-spacing: 15px; text-transform: uppercase;
      animation: notifyIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards,
                 notifyOut 0.5s 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      text-shadow: 0 0 20px ${color}66;
    ">${text}</h2>
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

function showRoundNotification(round) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; inset: 0; z-index: 10000; pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle, rgba(199,179,119,0.15) 0%, rgba(0,0,0,0.8) 70%);
    animation: roundFadeIn 0.6s ease-out forwards, roundFadeOut 0.6s 2.4s ease-in forwards;
  `;
  
  const subtitleHtml = round === 1 ? `
      <div style="
        margin-top: 30px; font-size: 20px; font-weight: 600; color: #e0d0a0;
        letter-spacing: 4px; opacity: 0.8;
        animation: roundSubtitleSlide 0.8s 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: translateY(-30px); opacity: 0;
      ">新たな戦いが始まる</div>
  ` : "";
  
  div.innerHTML = `
    <div style="text-align: center; animation: roundContentScale 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
      <div style="
        font-size: 28px; font-weight: 700; color: #c7b377; letter-spacing: 8px;
        text-transform: uppercase; margin-bottom: 20px; opacity: 0.9;
        animation: roundSubtitleSlide 0.8s 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: translateY(30px); opacity: 0;
      ">ROUND</div>
      <div style="
        font-size: 140px; font-weight: 900; color: #fff;
        letter-spacing: 20px; line-height: 1;
        text-shadow: 0 0 40px rgba(199,179,119,0.6), 0 0 80px rgba(199,179,119,0.4),
                     0 10px 30px rgba(0,0,0,0.8);
        animation: roundNumberPulse 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transform: scale(0.5); opacity: 0;
      ">${round}</div>${subtitleHtml}
    </div>
  `;
  
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

// ラウンド通知用のアニメーションスタイルを追加
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

/**
 * オーバードロー時の敗北判定
 * デッキが空の状態でドローしようとした場合、即座に敗北とする
 */
function triggerOverdrawDefeat() {
  // リザルト表示中は判定しない（2重表示防止）
  if (window._resultShowing) return;
  
  // 閉じるボタンが押された後は判定しない
  if (window._resultDismissed) return;
  
  // 盤面リセット中は判定しない
  if (window._isResetting) return;
  
  const myRole = window.myRole;
  if (!myRole) return;
  const opRole = myRole === 'player1' ? 'player2' : 'player1';
  
  console.log("[Overdraw] オーバードローによる敗北:", myRole);
  
  // 自分が敗北
  const winner = opRole;
  
  state.matchData.winner = winner;
  state.matchData.winnerSetAt = Date.now();
  
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    firebaseClient.writeMatchData(gameRoom, state.matchData);
  }
  
  // 即座にリザルトを表示
  showResultScreen(winner);
}

function showResultScreen(winner) {
  // 既に表示中の場合は何もしない（2重表示防止）
  if (window._resultShowing) {
    console.log("[Result] SKIP: already showing");
    return;
  }
  if (document.getElementById('gameResultOverlay')) {
    console.log("[Result] SKIP: overlay already exists");
    return;
  }
  
  // リザルト表示中フラグを立てる
  window._resultShowing = true;
  
  // 勝者を記憶（リザルトを閉じた後も再表示できるように）
  window._lastWinner = winner;
  
  const isWin = (window.myRole === winner);
  const isDraw = (winner === 'draw');
  const div = document.createElement('div');
  div.id = 'gameResultOverlay';

  let title = '勝利';
  let color = '#c7b377';
  let subText = '世界はあなたのものです。';

  if (isDraw) {
    title = '引き分け';
    color = '#aaa';
    subText = '決着はつきませんでした。';
  } else if (!isWin) {
    title = '敗北';
    color = '#e24a4a';
    subText = '力を蓄え、再挑戦しましょう。';
  }

  div.innerHTML = `
    <div class="result-backdrop" style="background: radial-gradient(circle, ${color}33 0%, rgba(0,0,0,0.95) 70%);"></div>
    <div class="result-content">
      <div class="result-banner" style="border-top: 2px solid ${color}; border-bottom: 2px solid ${color};">
        <h1 class="result-title" style="color: ${color}; text-shadow: 0 0 30px ${color}66;">${title}</h1>
      </div>
      <p class="result-subtext">${subText}</p>
      <div id="rematchStatus" style="min-height:28px;margin-bottom:10px;font-size:13px;color:#aaa;letter-spacing:1px;"></div>
      <div class="result-actions">
        <button class="result-btn" id="rematchBtn" onclick="requestRematch()" style="background: ${color}; box-shadow: 0 0 20px ${color}44;">
          再戦を申し込む
        </button>
        <button class="result-btn secondary" onclick="closeResultScreen()" style="border-color:rgba(255,255,255,0.2);">
          閉じる
        </button>
        <button class="result-btn secondary" onclick="location.href='index.html'">
          退室
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  // 相手からの再戦リクエストを監視（まだ監視していない場合のみ開始）
  if (!_rematchWatcher) {
    watchRematchRequest();
  }
}

function closeResultScreen() {
  // リスナーは解除せず、監視を継続（相手からの再戦申し込みを受け取るため）
  const overlay = document.getElementById('gameResultOverlay');
  if (overlay) overlay.remove();
  
  // リザルト表示中フラグを解除
  window._resultShowing = false;

  // winner を state と Firebase からクリア（再流入防止）
  if (state?.matchData) {
    state.matchData.winner = null;
    state.matchData.winnerSetAt = null;
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && firebaseClient?.db) {
      firebaseClient.writeMatchData(gameRoom, state.matchData);
    }
  }

  // 閉じた後は再度 winner 判定を行わない（executeReset / handleChooseOrder まで維持）
  window._resultDismissed = true;
}

// ===== 再戦合意システム =====

let _rematchWatcher = null;

function requestRematch() {
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (!gameRoom || !firebaseClient?.db) return;

  const btn = document.getElementById("rematchBtn");
  if (btn) { btn.disabled = true; btn.textContent = "申し込み中..."; }

  const statusEl = document.getElementById("rematchStatus");
  if (statusEl) statusEl.textContent = "相手の承諾を待っています...";

  // Firebase に再戦リクエストを書き込む
  firebaseClient.db.ref(`rooms/${gameRoom}/rematch/${me}`).set({
    requested: true,
    ts: firebase.database.ServerValue.TIMESTAMP
  });
}

function watchRematchRequest() {
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const op = me === "player1" ? "player2" : "player1";
  if (!gameRoom || !firebaseClient?.db) return;

  if (_rematchWatcher) { _rematchWatcher.off(); _rematchWatcher = null; }

  _rematchWatcher = firebaseClient.db.ref(`rooms/${gameRoom}/rematch`);
  _rematchWatcher.on("value", snap => {
    const data = snap.val() || {};
    const myReq = data[me]?.requested;
    const opReq = data[op]?.requested;

    const statusEl = document.getElementById("rematchStatus");
    const btn = document.getElementById("rematchBtn");

    if (opReq && !myReq) {
      // 相手が申し込んできた → リザルトが閉じられていたら再表示
      if (!document.getElementById('gameResultOverlay') && state.matchData.winner) {
        window._resultDismissed = false;
        showResultScreen(state.matchData.winner);
      }
      
      if (statusEl) statusEl.textContent = "相手が再戦を申し込んでいます！";
      if (btn) {
        btn.disabled = false;
        btn.textContent = "承諾して再戦";
        btn.style.animation = "resultTextGlow 0.8s ease-in-out infinite alternate";
      }
    } else if (myReq && !opReq) {
      if (statusEl) statusEl.textContent = "相手の承諾を待っています...";
    } else if (myReq && opReq) {
      // 両者合意 → リセット実行
      if (statusEl) statusEl.textContent = "再戦が成立しました！";
      if (_rematchWatcher) { _rematchWatcher.off(); _rematchWatcher = null; }

      // Firebase の rematch フラグをクリア
      firebaseClient.db.ref(`rooms/${gameRoom}/rematch`).remove();

      // 結果画面を閉じてリセット
      closeResultScreen();
      setTimeout(() => executeReset(), 300);
    }
  });
}

async function executeReset() {
  // 盤面リセット中フラグを立てる
  window._isResetting = true;
  
  lastResetAt = Date.now();
  lastTurnPlayer = null; // ターン通知用の記憶をリセット
  window._lastRound = undefined; // ラウンド通知用の記憶をリセット
  addGameLog(`[PROTOCOL:RESET] ${window.myUsername || state[window.myRole || "player1"]?.username || window.myRole} が再戦リセットを実行しました。`);

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

  state.matchData = {
    round: 1, turn: 1, turnPlayer: "player1", status: "setup_dice",
    winner: null, winnerSetAt: null, firstPlayer: null
  };
  state.player1.diceValue = -1;
  state.player2.diceValue = -1;
  window._gameStartInitiated = false;
  window._gameStartedAt = 0;  // リセット時はクリア（次の handleChooseOrder で再設定）
  window._resultDismissed = false;  // 再戦時は判定を再開
  window._resultShowing = false;  // リザルト表示フラグをリセット
  window._lastWinner = null;  // 勝者情報をクリア
  window.serverInitialState = JSON.parse(JSON.stringify(state));

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    // playerDice を完全に削除してダイス値をリセット
    await firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`).remove();
    // 各プレイヤーの diceValue もリセット
    await firebaseClient.db.ref(`rooms/${gameRoom}/playerState/player1/diceValue`).set(-1);
    await firebaseClient.db.ref(`rooms/${gameRoom}/playerState/player2/diceValue`).set(-1);
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
    // リセットされた playerState を反映
    await firebaseClient.writeMyState(gameRoom, "player1", state.player1);
    await firebaseClient.writeMyState(gameRoom, "player2", state.player2);
  }

  localStorage.setItem("gameState", JSON.stringify(state));
  localStorage.removeItem("fieldCards");

  createDeckObject(true);

  if (typeof syncLoop === "function") await syncLoop();
  if (typeof update === "function") update();
  
  // リセット完了後、フラグを解除
  window._isResetting = false;
}

// ===== 進化の道フェーズ UI =====
function updateEvolutionPhaseUI() {
  const m = state.matchData;
  let overlay = document.getElementById("evolutionPhaseOverlay");

  if (m.status !== "setup_evolution") {
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);
    }
    return;
  }

  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";
  
  const myPath = state[me]?.evolutionPath;
  const opPath = state[op]?.evolutionPath;

  // 両方とも選択済みなら playing に移行
  if (myPath && opPath) {
    if (m.turnPlayer === me && !window._evoPhaseTransitioning) {
      window._evoPhaseTransitioning = true;
      setTimeout(async () => {
        m.status = "playing";
        addGameLog(`[MATCH] 試合開始！先攻: ${m.firstPlayer === "player1" ? state.player1.username : state.player2.username}`);
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          await firebaseClient.writeMatchData(gameRoom, m);
        }
        window._evoPhaseTransitioning = false;
        update();
      }, 1500);
    }
    if (overlay) overlay.innerHTML = `<h2 style="color:#fff; text-shadow: 0 0 10px #fff;">両プレイヤーが道を選択しました<br>試合を開始します...</h2>`;
    return;
  }

  // オーバーレイを作成
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "evolutionPhaseOverlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.98); z-index: 10000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(15px); flex-direction: column; color: #e0d0a0;
      transition: opacity 0.5s ease; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  // 自分が選択済みの場合は待機画面
  if (myPath) {
    overlay.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#c7b377; font-size:24px;">相手の選択を待っています...</h2>
        <div style="margin-top:20px; color:#aaa; font-size:14px;">あなたは「${myPath}」を選択しました</div>
      </div>
    `;
    return;
  }

  // UI描画
  if (!overlay.dataset.rendered) {
    overlay.dataset.rendered = "true";
    overlay.innerHTML = `
      <div style="max-width:900px; width:90%; display:flex; flex-direction:column; gap:20px; animation: fadeIn 0.3s ease;">
        <h2 style="text-align:center; color:#c7b377; font-size:26px; margin-bottom:5px; font-weight:900; letter-spacing:2px;">進化の道を選択</h2>
        <p style="text-align:center; color:#aaa; font-size:13px; margin-bottom:15px;">レベルが[3/5/6]に達した時に強化される、永続的な能力を選択してください。</p>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <!-- 忍耐の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('忍耐の道')">
            <div class="evo-path-title">忍耐の道</div>
            <div class="evo-path-desc">手札の枚数上限が2枚増加し、最大レベル時は2ではなく3枚になる。<br>また、ラウンド開始時、手札をx枚増やす。<br>さらに、自身のターン終了時、枚数上限によって手札を捨てると、捨てた枚数ごとに経験値を最大2まで獲得する。<br><span class="evo-path-val">x=[0/1/3/4]</span></div>
          </button>

          <!-- 継続の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('継続の道')">
            <div class="evo-path-title">継続の道</div>
            <div class="evo-path-desc">ターン毎にy回まで、1以上のダメージを与える度(※)、1のダメージを与える。<br>さらに追加で、それぞれ3回目の発動に限り、1の貫通ダメージを与える。<br><span style="font-size:11px; color:#aaa;">※：この効果によるものは含まない</span><br><span class="evo-path-val">y=[1/3/4/6]</span></div>
          </button>

          <!-- 瞬発の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('瞬発の道')">
            <div class="evo-path-title">瞬発の道</div>
            <div class="evo-path-desc">一撃で6以上のダメージを与える時、そのダメージ判定の直前にzの脆弱ダメージを与える。<br><span class="evo-path-val">z=[1/3/4/6]</span></div>
          </button>

          <!-- 背水の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('背水の道')">
            <div class="evo-path-title">背水の道</div>
            <div class="evo-path-desc">手札が2枚以下の状態なら、[直接攻撃/”直接攻撃時“効果]のダメージを+1する。<br>また、自身のPPが2以上なら、与ダメージを追加で+tして、1の経験値を獲得する。<br><span style="font-size:11px; color:#aaa;">ただし、この効果による経験値は、ターン毎に1回まで獲得可能。</span><br><span class="evo-path-val">t=[1/2/3/4]</span></div>
          </button>
        </div>
      </div>
      <style>
        .evo-path-btn { background:rgba(20,20,30,0.8); border:1px solid #5a4b27; border-radius:8px; padding:20px; text-align:left; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 12px rgba(0,0,0,0.5); }
        .evo-path-btn:hover { background:rgba(40,40,50,0.9); border-color:#c7b377; transform:translateY(-2px); box-shadow:0 8px 24px rgba(199,179,119,0.25); }
        .evo-path-title { font-size:18px; font-weight:900; color:#f0d080; margin-bottom:8px; letter-spacing:1px; }
        .evo-path-desc { font-size:13px; color:#ddd; line-height:1.5; }
        .evo-path-val { color:#c7b377; font-weight:bold; }
      </style>
    `;
  }
}

window.selectEvolutionPath = async function(pathName) {
  const me = window.myRole || "player1";
  state[me].evolutionPath = pathName;
  addGameLog(`[EVOLUTION] ${window.myUsername || state[me]?.username || me} が「${pathName}」を選択しました。`);
  
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
  }
  
  // UI更新で相手の選択待ち画面へ
  const overlay = document.getElementById("evolutionPhaseOverlay");
  if (overlay) delete overlay.dataset.rendered; // 強制再描画
  
  update();
};

function updateDicePhaseUI() {
  const m = state.matchData;
  let overlay = document.getElementById("dicePhaseOverlay");

  if (m.status !== "setup_dice") {
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);
    }
    return;
  }

  // オーバーレイを作成（初回のみ）
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "dicePhaseOverlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.95); z-index: 10000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(15px); flex-direction: column; color: #fff;
      transition: opacity 0.5s ease; font-family: 'Outfit', sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const p1Dice = state.player1.diceValue;
  const p2Dice = state.player2.diceValue;
  const bothRolled = (p1Dice >= 0 && p2Dice >= 0);

  // ===== フェーズ判定 =====
  // phase: "rolling" | "result"
  const phase = bothRolled ? "result" : "rolling";
  const prevPhase = overlay.dataset.phase || "";

  // ===== フェーズ: 結果表示（両プレイヤーが振り終えた） =====
  if (phase === "result") {
    // フェーズが変わった時 or 選択状態が変わった時（勝者が選択後に敗者側も更新）は再描画
    const chooserKey = p1Dice < p2Dice ? "player1" : (p2Dice < p1Dice ? "player2" : "");
    const renderKey = `result_${p1Dice}_${p2Dice}_${playerKey}`;
    if (overlay.dataset.renderKey === renderKey) return; // 同じ内容なら何もしない
    overlay.dataset.phase = "result";
    overlay.dataset.renderKey = renderKey;

    let resultTitle, resultMsg, p1Color, p2Color;

    if (p1Dice === p2Dice) {
      // 引き分け
      resultTitle = `<h2 class="dice-title" style="color:#ff4444;">引き分け</h2>`;
      resultMsg = `
        <p class="dice-subtitle" style="color:#fff;margin-top:40px;">同じ値です。もう一度振ります...</p>
        <button class="dice-roll-btn" onclick="handleResetDice()" style="background:#444;color:#fff;margin-top:30px;">振り直し</button>`;
      p1Color = "#fff"; p2Color = "#fff";

    } else if (p1Dice < p2Dice) {
      // プレイヤー1が勝利 → 選択権あり
      const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
      const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
      const winnerIsMe = (playerKey === "player1");
      const winColor = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      p1Color = winnerIsMe ? "#4fc3f7" : "#e24a4a"; p2Color = "#fff";
      resultTitle = `<h2 class="dice-title" style="color:${winColor};animation:titleGlow 1s ease-in-out infinite;">${p1Label}の勝利！</h2>`;
      if (playerKey === "player1") {
        resultMsg = `
          <p class="dice-subtitle" style="color:#fff;margin-top:30px;">先攻・後攻を選択してください</p>
          <div class="dice-choice-group">
            <button class="dice-choice-btn primary" onclick="handleChooseOrder(true)">先攻</button>
            <button class="dice-choice-btn secondary" onclick="handleChooseOrder(false)">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-wait-msg" style="color:#fff;margin-top:40px;">相手が手番（先攻・後攻）を選択しています...</p>`;
      }

    } else {
      // プレイヤー2が勝利 → 選択権あり
      const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
      const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
      const winnerIsMe = (playerKey === "player2");
      const winColor = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      p1Color = "#fff"; p2Color = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      resultTitle = `<h2 class="dice-title" style="color:${winColor};animation:titleGlow 1s ease-in-out infinite;">${p2Label}の勝利！</h2>`;
      if (playerKey === "player2") {
        resultMsg = `
          <p class="dice-subtitle" style="color:#fff;margin-top:30px;">先攻・後攻を選択してください</p>
          <div class="dice-choice-group">
            <button class="dice-choice-btn primary" onclick="handleChooseOrder(true)">先攻</button>
            <button class="dice-choice-btn secondary" onclick="handleChooseOrder(false)">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-wait-msg" style="color:#fff;margin-top:40px;">相手が手番（先攻・後攻）を選択しています...</p>`;
      }
    }

    const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
    const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
    overlay.innerHTML = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        ${resultTitle}
        <div style="display:flex;justify-content:center;gap:100px;align-items:center;margin:50px 0;">
          <div style="text-align:center;">
            <div style="font-size:16px;color:#fff;letter-spacing:2px;margin-bottom:20px;font-weight:900;">${p1Label}</div>
            <div class="dice-value-large" style="color:${p1Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;">${p1Dice}</div>
          </div>
          <div style="font-size:32px;color:#444;font-weight:900;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:16px;color:#fff;letter-spacing:2px;margin-bottom:20px;font-weight:900;">${p2Label}</div>
            <div class="dice-value-large" style="color:${p2Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both;">${p2Dice}</div>
          </div>
        </div>
        ${resultMsg}
      </div>
    `;
    return;
  }

  // ===== フェーズ: ローリング（まだ振っていない or 片方だけ） =====
  // レイアウトが存在しない場合、またはプレイヤー名が変わった場合に再構築
  const p1Name = state.player1.username || "プレイヤー1";
  const p2Name = state.player2.username || "プレイヤー2";
  const nameKey = `${p1Name}|${p2Name}`;

  if (phase !== prevPhase || !overlay.querySelector("#dice-val-player1") || overlay.dataset.nameKey !== nameKey) {
    overlay.dataset.phase = "rolling";
    overlay.dataset.renderKey = "";
    overlay.dataset.nameKey = nameKey;
    overlay.innerHTML = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        <h2 class="dice-title" style="margin-bottom:60px;">ダイスロール</h2>
        <div style="display:flex;justify-content:center;gap:100px;align-items:flex-start;">
          <div style="text-align:center;">
            <div style="font-size:18px;color:#fff;letter-spacing:2px;margin-bottom:8px;font-weight:900;">${myRole === "player1" ? "あなた" : "あいて"}</div>
            <div style="font-size:14px;color:#c7b377;letter-spacing:1px;margin-bottom:22px;font-weight:700;">${p1Name}</div>
            <div id="dice-val-player1" class="dice-value-large" style="color:#fff;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player1" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;display:none;">ダイスを振る</button>
          </div>
          <div style="font-size:32px;color:#444;font-weight:900;margin-top:90px;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:18px;color:#fff;letter-spacing:2px;margin-bottom:8px;font-weight:900;">${myRole === "player2" ? "あなた" : "あいて"}</div>
            <div style="font-size:14px;color:#c7b377;letter-spacing:1px;margin-bottom:22px;font-weight:700;">${p2Name}</div>
            <div id="dice-val-player2" class="dice-value-large" style="color:#fff;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player2" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;display:none;">ダイスを振る</button>
          </div>
        </div>
        <div id="dice-roll-center" style="text-align:center;margin-top:40px;">
          <button id="dice-btn-center" class="dice-roll-btn" onclick="handleDiceRoll()" style="display:none;">ダイスを振る</button>
        </div>
        <div id="dice-status-msg" style="margin-top:30px;font-size:13px;color:#fff;letter-spacing:2px;min-height:20px;text-align:center;"></div>
      </div>
    `;
  }

  // 各プレイヤーの欄を個別に更新（DOM再構築なし）
  const p1El = document.getElementById("dice-val-player1");
  const p2El = document.getElementById("dice-val-player2");
  const p1Btn = document.getElementById("dice-btn-player1");
  const p2Btn = document.getElementById("dice-btn-player2");
  const statusMsg = document.getElementById("dice-status-msg");

  if (p1El && p1Dice >= 0 && p1El.textContent !== String(p1Dice)) {
    p1El.style.animation = "none";
    p1El.textContent = p1Dice;
    void p1El.offsetWidth;
    p1El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }
  if (p2El && p2Dice >= 0 && p2El.textContent !== String(p2Dice)) {
    p2El.style.animation = "none";
    p2El.textContent = p2Dice;
    void p2El.offsetWidth;
    p2El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }

  // 自分のボタンだけ表示、相手のボタンは非表示
  // diceValue が確実に -1 の場合のみボタンを表示（undefined/null は非表示）
  const myDice = playerKey === "player1" ? p1Dice : p2Dice;
  if (p1Btn) p1Btn.style.display = "none";
  if (p2Btn) p2Btn.style.display = "none";
  // 中央ボタン
  const centerBtn = document.getElementById("dice-btn-center");
  if (centerBtn) centerBtn.style.display = (myDice === -1) ? "inline-block" : "none";

  // ステータスメッセージ
  if (statusMsg) {
    if (p1Dice >= 0 && p2Dice < 0) {
      statusMsg.innerHTML = `<span style="color:#00ffcc;animation:pulse 2s infinite;display:inline-block;">プレイヤー2がダイスを振るのを待っています...</span>`;
    } else if (p2Dice >= 0 && p1Dice < 0) {
      statusMsg.innerHTML = `<span style="color:#e24a4a;animation:pulse 2s infinite;display:inline-block;">プレイヤー1がダイスを振るのを待っています...</span>`;
    } else {
      statusMsg.innerHTML = "";
    }
  }
}

// ===== ダイスフェーズ =====
// 設計原則（新）:
//   - 自分のデータは rooms/{room}/playerState/{myKey} にのみ書く
//   - 相手のデータは絶対に書かない
//   - matchData は rooms/{room}/matchData に書く（ターン権保持者のみ）
//   - diceValue は rooms/{room}/playerDice/{myKey} に書く（ダイスフェーズ専用）
//   - 読み取りは各パスの watcher が担当

async function handleDiceRoll() {
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");

  console.log("[handleDiceRoll] 開始 playerKey:", playerKey,
    "diceValue:", state[playerKey]?.diceValue,
    "gameRoom:", localStorage.getItem("gameRoom"),
    "firebase connected:", firebaseClient?.isConnected);

  if (!state[playerKey]) {
    console.warn("[handleDiceRoll] state[playerKey] が存在しません:", playerKey);
    return;
  }
  if (state[playerKey].diceValue !== -1) {
    console.log("[handleDiceRoll] 既に振っています:", state[playerKey].diceValue);
    return;
  }

  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom) {
    console.warn("[handleDiceRoll] gameRoom が null です。localStorage:", {
      gameRoom: localStorage.getItem("gameRoom"),
      gamePlayerKey: localStorage.getItem("gamePlayerKey"),
      gameStarted: localStorage.getItem("gameStarted")
    });
    return;
  }
  if (!firebaseClient?.db) {
    console.warn("[handleDiceRoll] firebaseClient.db が null です。isConnected:", firebaseClient?.isConnected);
    return;
  }

  // ボタンを非表示にする（押した直後）
  const btn1 = document.getElementById("dice-btn-player1");
  const btn2 = document.getElementById("dice-btn-player2");
  const btnCenter = document.getElementById("dice-btn-center");
  if (btn1) btn1.style.display = "none";
  if (btn2) btn2.style.display = "none";
  if (btnCenter) btnCenter.style.display = "none";

  showDiceRollingAnimation();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const roll = Math.floor(Math.random() * 100) + 1;
  console.log("[handleDiceRoll] ロール結果:", roll);
  addGameLog(`[DICE] ${window.myUsername || state[playerKey]?.username || playerKey} がダイスを振りました: ${roll}`);

  // ローカルに即反映
  state[playerKey].diceValue = roll;
  update();

  // Firebase: playerDice パスにのみ書く（相手のパスは触らない）
  await firebaseClient.setPlayerDice(gameRoom, playerKey, roll);
  
  // 初回ゲーム時のデッキ枚数同期漏れを防ぐため、ダイスロール直後に自分の状態を同期する
  await firebaseClient.writeMyState(gameRoom, playerKey, _getMyStateForSync());
}

function showDiceRollingAnimation() {
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const diceEl = document.getElementById(`dice-val-${playerKey}`);
  if (!diceEl) return;
  diceEl.style.animation = "diceRolling 0.15s ease-in-out infinite";
  diceEl.textContent = "?";
}

async function handleResetDice() {
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom || !firebaseClient) return;
  await firebaseClient.resetPlayerDice(gameRoom);
}

async function handleChooseOrder(goFirst) {
  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";

  state.matchData.turnPlayer  = goFirst ? me : op;
  state.matchData.firstPlayer = state.matchData.turnPlayer;
  state.matchData.status      = "setup_evolution";
  state.matchData.round       = 1;
  state.matchData.turn        = 1;
  state.matchData.winner      = null;   // 前回の winner を必ずクリア
  state.matchData.winnerSetAt = null;   // タイムスタンプもクリア

  // ゲーム開始時刻を記録（古い winner を無視するため）
  // 3秒の猶予を持たせて、Firebase から古い winner が流れてきても無視できるようにする
  window._gameStartedAt = Date.now() + 3000;
  window._resultDismissed = false;  // 新しいゲーム開始時は判定を有効化

  const firstPlayerName = state.matchData.turnPlayer === "player1"
    ? (state.player1.username || "P1")
    : (state.player2.username || "P2");

  addGameLog(`[MATCH] 先攻: ${firstPlayerName}。進化の道を選択してください...`);

  state.player1.evolutionPath = null;
  state.player1.evoContinuousDmgCount = 0;
  state.player1.evoBackwaterExpGained = false;

  state.player2.evolutionPath = null;
  state.player2.evoContinuousDmgCount = 0;
  state.player2.evoBackwaterExpGained = false;

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
    await firebaseClient.writeMyState(gameRoom, "player1", state.player1);
    await firebaseClient.writeMyState(gameRoom, "player2", state.player2);
  }

  update();
}

async function handleTurnEnd() {
  const m  = state.matchData;
  const me = window.myRole || "player1";

  if (m.turnPlayer !== me) return;
  if (m.winner) return;

  const op          = me === "player1" ? "player2" : "player1";
  const firstPlayer = m.firstPlayer || "player1";

  if (m.turnPlayer === firstPlayer) {
    m.turnPlayer = op;
  } else {
    m.turnPlayer = firstPlayer;
    m.turn += 1;
    if (m.turn > 5) {
      m.turn = 1;
      m.round += 1;
      addGameLog(`[MATCH] 第 ${m.round} ラウンド開始！`);
    }
  }

  const nextPlayerName = m.turnPlayer === "player1"
    ? (state.player1.username || "プレイヤー1")
    : (state.player2.username || "プレイヤー2");
  addGameLog(`[TURN] ${window.myUsername || state[me]?.username || me} がターンを終了。次: ${nextPlayerName}`);

  // 進化の道のターン依存変数をリセット
  state[me].evoContinuousDmgCount = 0;
  state[me].evoBackwaterExpGained = false;
  window._turnDmgHistory = {};

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    // matchData のみ書く（自分の playerState も更新）
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
    await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
  }

  update();
}

/**
 * 自分の playerState として Firebase に送る内容を返す
 * diceValue は playerDice パスで管理するため除外
 * deck の内容は送信せず、枚数のみ送信（相手には内容を見せない）
 */
function _getMyStateForSync() {
  const me = window.myRole || "player1";
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
  const t = e.target;
  if (!t.dataset.owner) return;
  if (t.dataset.type === "val") setVal(t.dataset.owner, t.dataset.key, t.value);
  if (t.dataset.type === "max") setMax(t.dataset.owner, t.dataset.key, t.value);
});

let sliderActive = false;
let ppRepeatTimer = null;
let ppRepeatTarget = null;

document.body.addEventListener("pointerdown", (e) => {
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
  const evoTitle = e.target.closest(".evoPanelTitle[data-owner]");
  if (evoTitle) {
    openEvolutionPathModal(evoTitle.dataset.owner);
    return;
  }
  const t = e.target.closest(".lorSmBtn, .lorInstantDefBtn, .lorResetDefBtn");
  if (!t || !t.dataset.owner) return;
  if (t.disabled) return;

  if (t.dataset.action === "addInstantDef") {
    const owner = t.dataset.owner;
    const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    const next = (Number(state[owner].defstack) || 0) + (Number(state[owner].instantDef) || 0);
    state[owner].defstack = Math.max(0, next);
    state[owner].defstackOverMax = state[owner].defstack > (Number(state[owner].defstackMax) || 0);

    if (owner === me) {
      pushMyStateDebounced();
    } else {
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && firebaseClient?.db) {
        firebaseClient.sendChangeRequest(gameRoom, me, owner, "_bulk", "set", {
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

function updateGameLogs(logs) {
  const chatLogs = document.getElementById("chatLogs");
  if (!chatLogs || !Array.isArray(logs)) return;

  const existingCount = chatLogs.querySelectorAll(".log-entry").length;
  // logs.length が減少した（サーバーリセット等）場合も考慮して更新
  if (logs.length !== existingCount) {
    chatLogs.innerHTML = "";
    // 重複を排除してユニークなログのみ表示（簡易的）
    const uniqueLogs = [...new Set(logs)];
    uniqueLogs.forEach(msg => {
      const div = document.createElement("div");
      div.classList.add("log-entry");

      const match = msg.match(/^(\[[^\]]+\])\s*(.*)$/);
      if (match) {
        const ts = document.createElement("span");
        ts.classList.add("log-ts");
        ts.textContent = match[1];
        div.appendChild(ts);
        div.appendChild(document.createTextNode(match[2]));
      } else {
        div.textContent = msg;
      }
      chatLogs.appendChild(div);
    });
    chatLogs.scrollTop = chatLogs.scrollHeight;
  }
}
window.updateGameLogs = updateGameLogs;

function checkAndLogStateChanges(oldState, newState) {
  // リセットプロトコルの検知
  const oldLogs = oldState.logs || [];
  const newLogs = newState.logs || [];
  if (newLogs.length > 0 && newLogs.length !== oldLogs.length) {
    const latest = newLogs[newLogs.length - 1];
    if (latest.includes("[PROTOCOL:RESET]")) {
      // 自分が実行者でない場合のみ、追従リセットを行う
      const initiator = latest.match(/\[PROTOCOL:RESET\] (.*?) が/);
      if (initiator && initiator[1] !== (window.myUsername || state[window.myRole || "player1"]?.username || window.myRole)) {
        console.log("Remote Reset Detected. Re-initializing local deck...");
        initDeckFromCode();
        shuffleDeck();
        createDeckObject(true);
      }
    }
  }

  ["player1", "player2"].forEach(owner => {
    // oldState[owner]が存在しない場合はスキップ（初期化前）
    if (!oldState[owner] || !newState[owner]) return;
    
    const s1 = oldState[owner];
    const s2 = newState[owner];
    const name = s2.username || (owner === "player1" ? "プレイヤー1" : "プレイヤー2");

    // レベルアップのみログ出力（HPやEXPの細かい変更はログに出さない）
    if (s1.level < s2.level) {
      addGameLog(`${name} レベルアップ!!!【レベル:${s2.level}】`);
    }
    // HP/EXP/防御力の変更ログは出力しない（ログが多すぎるため）
    // 必要に応じてコメントアウトを外す
    // else {
    //   if (s1.hp !== s2.hp) addGameLog(`${name} HP:${s1.hp}→${s2.hp}`);
    //   if (s1.exp !== s2.exp) addGameLog(`${name} EXP:${s1.exp}→${s2.exp}`);
    //   if (s1.defstack !== s2.defstack || s1.defstackMax !== s2.defstackMax) {
    //     if (s2.defstack !== s1.defstack) addGameLog(`${name} 防御力:${s2.defstack}/${s2.defstackMax}`);
    //   }
    // }
  });
}

function handleChatSend() {
  const input = document.getElementById("chatInput");
  const val = input.value.trim();
  if (!val) return;
  addGameLog(`${window.myUsername || state[window.myRole || "player1"]?.username || window.myRole}: ${val}`);
  input.value = "";
}

async function initGame() {
  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleChatSend();
    });
  }
  const chatBtn = document.getElementById("chatSendBtn");
  if (chatBtn) {
    chatBtn.addEventListener("click", handleChatSend);
  }

  try {
    console.log("[initGame] step1: loading card data");
    try {
      await loadCardData();
      console.log("[initGame] step2: card data loaded");
      await loadLevelStats();
      console.log("[initGame] step3: level stats loaded");
    } catch (e) {
      console.warn("[initGame] data load warning:", e);
      window.deckLoadMessage = "カードデータまたはステータスの読み込みに失敗しました。";
    }

    console.log("[initGame] step4: isGameStarted =", isGameStarted());
    if (isGameStarted()) {
      load();
    } else {
      load();
      console.log("[initGame] step5: initDeckFromCode");
      initDeckFromCode();
      console.log("[initGame] step6: getMyState");
      getMyState().backImage = getBackImage();
      shuffleDeck();

      markGameStarted();
      save();
      addGameLog(`${window.myUsername || state[window.myRole || "player1"]?.username || window.myRole} が入室しました。`);
    }

    const currentRoom = localStorage.getItem("gameRoom");
    const myKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
    const opKey = myKey === "player1" ? "player2" : "player1";

    // Firebase から最新状態を復元（リロード対応）
    if (currentRoom && firebaseClient?.db) {
      console.log("[initGame] Firebase から状態を復元中...");
      try {
        // matchData を復元
        const matchSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/matchData`).once('value');
        if (matchSnap.exists()) {
          state.matchData = { ...state.matchData, ...matchSnap.val() };
          // 前回ゲームの winner が残っている可能性があるため、ここでクリア
          state.matchData.winner = null;
          state.matchData.winnerSetAt = null;
          console.log("[initGame] matchData 復元:", state.matchData.status);
        }

        // 相手の playerState を復元
        const opSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerState/${opKey}`).once('value');
        if (opSnap.exists()) {
          const opData = opSnap.val();
          const { diceValue: _d, username: _u, deck: _deck, ...rest } = opData;
          Object.assign(state[opKey], rest);
          console.log("[initGame] 相手の状態を復元:", opKey);
        }

        // 自分の playerState を復元（念のため）
        const mySnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerState/${myKey}`).once('value');
        if (mySnap.exists()) {
          const myData = mySnap.val();
          const { diceValue: _d, username: _u, deck: _deck, ...rest } = myData;
          Object.assign(state[myKey], rest);
          console.log("[initGame] 自分の状態を復元:", myKey);
        }

        normalizeState();
        applyLevelStats("player1");
        applyLevelStats("player2");
      } catch (e) {
        console.warn("[initGame] Firebase 復元エラー:", e);
      }
    }

    // 新しいルームに入った場合のみダイスリセット（リロード時はスキップ）
    const isReload = sessionStorage.getItem("wasInGame") === currentRoom;
    const lastRoom = window._lastGameRoom;

    if (currentRoom && currentRoom !== lastRoom && !isReload) {
      console.log("[initGame] 新しいルームに入りました。ダイスロールをリセット");
      state.matchData.status = "setup_dice";
      state.player1.diceValue = -1;
      state.player2.diceValue = -1;
      window._gameStartInitiated = false;
      save();

      if (firebaseClient?.db) {
        firebaseClient.db.ref(`rooms/${currentRoom}/playerDice`).remove();
      }
    } else if (isReload) {
      console.log("[initGame] リロード検出 - ゲーム状態を維持");
      // ダイス値も Firebase から復元
      if (currentRoom && firebaseClient?.db) {
        const diceSnap = await firebaseClient.db.ref(`rooms/${currentRoom}/playerDice`).once('value');
        if (diceSnap.exists()) {
          const diceData = diceSnap.val() || {};
          if (diceData.player1 >= 0) state.player1.diceValue = diceData.player1;
          if (diceData.player2 >= 0) state.player2.diceValue = diceData.player2;
        }
      }
    }

    window._lastGameRoom = currentRoom;
    // リロード検出用にセッションにルーム名を記録
    if (currentRoom) sessionStorage.setItem("wasInGame", currentRoom);

    // gameReady=true の前に古い winner を必ずクリア（前回ゲームの残滓を防ぐ）
    state.matchData.winner = null;
    state.matchData.winnerSetAt = null;
    // _gameStartedAt を設定（checkGameResult の stale 判定に使用）
    // 3秒の猶予を持たせて、Firebase から古い winner が流れてきても無視できるようにする
    window._gameStartedAt = Date.now() + 3000;

    console.log("[initGame] step7: gameReady = true, calling update()");
    gameReady = true;
    update();
    console.log("[initGame] step8: update() done");

    if (cardsReadyFired) {
      createDeckObject(!isReload); // リロード時は位置保持、新規入室時はリセット
    } else {
      window.addEventListener("cardsReady", () => {
        createDeckObject(!isReload);
      }, { once: true });
    }

    // 初期状態は Firebase で管理（API呼び出しは不要）
    window.initialState = {
      gameState: JSON.parse(JSON.stringify(state)),
      fieldCards: []
    };

    // ルームの状態を監視（両プレイヤーが退出したかチェック）
    setupRoomWatcher();

  } catch (e) {
    console.error("initGame FAILED:", e);
    console.error("Stack:", e.stack);
    const playerEl = document.getElementById("gameUiPlayer");
    if (playerEl) {
      playerEl.innerHTML = `<div class="lorPanel"><div class="statusMessage">対戦UIの初期化に失敗しました: ${e.message}<br><pre style="font-size:10px;color:#f88;white-space:pre-wrap;">${e.stack}</pre></div></div>`;
    }
  }
}

/**
 * ルームの状態を監視して、両プレイヤーが退出したかチェック
 */
let roomWatcherUnsubscribe = null;
let playerDiceWatcherUnsubscribe = null;

function setupRoomWatcher() {
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom) {
    console.warn("[Game] ゲームルーム情報がありません");
    return;
  }

  if (!firebaseClient || !firebaseClient.db) {
    console.warn("[Game] Firebase 未初期化 - setupRoomWatcher をスキップ");
    return;
  }

  const myKey   = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const opKey   = myKey === "player1" ? "player2" : "player1";
  const db      = firebaseClient.db;

  console.log("[Game] ルーム監視開始:", gameRoom, "自分:", myKey);

  // ── 1. players ノード監視（接続/切断・username 取得）──────────────────
  const playersRef = db.ref(`rooms/${gameRoom}/players`);
  const playersListener = playersRef.on('value', (snap) => {
    if (!snap) return;
    const players = snap.val() || {};
    if (players.player1?.username) state.player1.username = players.player1.username;
    if (players.player2?.username) state.player2.username = players.player2.username;

    const playerCount = Object.keys(players).length;
    if (playerCount === 0) {
      console.log("[Game] 両プレイヤーが退出");
      resetAllGameVariables();
      stopAllWatchers();
      firebaseClient.resetRoomGameState(gameRoom);
    }
    update();
  });

  // ── 2. 相手の playerState 監視（相手のデータのみ受信）────────────────
  const opStateRef = db.ref(`rooms/${gameRoom}/playerState/${opKey}`);
  const opStateListener = opStateRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const opData = snap.val();
    // diceValue は playerDice で管理、username は players で管理するため除外
    // deck の内容は同期しないが、枚数（length）は同期する
    const { diceValue: _d, username: _u, deck: opDeck, deckCount: opDeckCount, ...rest } = opData;
    // 相手のデータを自分の state に反映
    Object.assign(state[opKey], rest);
    
    // backImage も同期
    if (opData.backImage) {
      state[opKey].backImage = opData.backImage;
    }
    
    // デッキ枚数のみ同期（内容は同期しない）
    if (Array.isArray(opDeck)) {
      // 相手のデッキ内容は見えないが、枚数だけ反映
      if (!Array.isArray(state[opKey].deck)) {
        state[opKey].deck = [];
      }
      // 枚数を合わせる（ダミーデータで埋める）
      const currentLen = state[opKey].deck.length;
      const targetLen = opDeck.length;
      if (currentLen < targetLen) {
        // 足りない分を追加
        for (let i = currentLen; i < targetLen; i++) {
          state[opKey].deck.push("DUMMY");
        }
      } else if (currentLen > targetLen) {
        // 多い分を削除
        state[opKey].deck.splice(targetLen);
      }
    }
    if (Number.isFinite(Number(opDeckCount))) {
      state[opKey].deckCount = Number(opDeckCount);
    }
    
    // username は players watcher が管理するため上書きしない
    normalizeState();
    applyLevelStats(opKey);
    updateDeckObject(); // デッキ枚数表示を更新
    update();
  });

  // ── 3. matchData 監視（共有ターン情報）──────────────────────────────
  const matchDataRef = db.ref(`rooms/${gameRoom}/matchData`);
  const matchDataListener = matchDataRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const incoming = snap.val();

    // winner が含まれている場合、stale チェックを行う
    if (incoming.winner) {
      const winnerSetAt = incoming.winnerSetAt || 0;
      const gameStartedAt = window._gameStartedAt || 0;
      const isStale = winnerSetAt < gameStartedAt;
      const isDismissed = !!window._resultDismissed;

      if (isStale || isDismissed) {
        if (isStale) console.warn("[matchDataWatcher] stale winner を無視:", incoming.winner,
          "winnerSetAt=", winnerSetAt, "< gameStartedAt=", gameStartedAt);
        if (isDismissed) console.log("[matchDataWatcher] dismissed winner を無視:", incoming.winner);
        // winner だけ除いて適用
        const { winner: _w, winnerSetAt: _ws, ...rest } = incoming;
        state.matchData = { ...state.matchData, ...rest };
        update();
        return;
      }
    }

    // matchData は丸ごと上書き（ターン権を持つプレイヤーが書いた値が正）
    state.matchData = { ...state.matchData, ...incoming };
    update();
  });

  // ── 4. logs 監視──────────────────────────────────────────────────
  const logsRef = db.ref(`rooms/${gameRoom}/logs`);
  const logsListener = logsRef.on('value', (snap) => {
    if (!snap || !snap.val()) {
      // ログがクリアされた場合
      state.logs = [];
      update(true); // skipLogCheck = true
      return;
    }
    const logsObj = snap.val();
    const receivedLogs = Object.values(logsObj);
    
    // 受信したログを state.logs にマージ（重複を避ける）
    receivedLogs.forEach(log => {
      if (!state.logs.includes(log)) {
        state.logs.push(log);
      }
    });
    
    // 最大50件に制限
    if (state.logs.length > 50) {
      state.logs = state.logs.slice(-50);
    }
    
    update(true); // skipLogCheck = true（ログ監視からの更新なので、checkAndLogStateChanges をスキップ）
  });

  // ── 5. 相手のフィールドカード監視 ────────────────────────────────
  const opCardsRef = db.ref(`rooms/${gameRoom}/fieldCards/${opKey}`);
  const opCardsListener = opCardsRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const opCards = snap.val();
    // 相手のカードデータを適用（applyFieldCardsFromServer は自分のカードを上書きしない）
    if (typeof window.applyFieldCardsFromServer === "function") {
      window.applyFieldCardsFromServer(opCards);
    }
  });

  // ── 6. 相手からの変更リクエスト監視 ──────────────────────────────  // 相手が自分のステータスを変更したい時、pendingChange/{opKey} に書いてくる
  const pendingRef = db.ref(`rooms/${gameRoom}/pendingChange/${opKey}`);
  const pendingListener = pendingRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const req = snap.val();
    // 自分のステータスへのリクエストのみ処理
    if (req.target !== myKey) return;

    console.log("[PendingChange] 変更リクエスト受信:", req);

    const s = state[myKey];
    if (!s) return;

    // リクエストを適用
    if (req.type === "set") {
      if (req.key === "_bulk" && typeof req.value === "object") {
        // 複数フィールドを一括適用（ダメージ計算後の確定値）
        Object.assign(s, req.value);
      } else {
        s[req.key] = req.value;
      }
    } else if (req.type === "add") {
      s[req.key] = (Number(s[req.key]) || 0) + req.value;
    }

    // 派生ステータスを再計算
    if (req.key === "exp") checkLevelUp(myKey);
    syncDerivedStats(myKey);
    normalizeState();
    applyLevelStats(myKey);

    // 自分のパスに書き込んで確定
    pushMyStateDebounced();

    // リクエストをクリア（処理済み）
    firebaseClient.clearChangeRequest(gameRoom, opKey);

    update();
  });

  // ── クリーンアップ関数 ────────────────────────────────────────────
  roomWatcherUnsubscribe = () => {
    playersRef.off('value', playersListener);
    opStateRef.off('value', opStateListener);
    matchDataRef.off('value', matchDataListener);
    logsRef.off('value', logsListener);
    opCardsRef.off('value', opCardsListener);
    pendingRef.off('value', pendingListener);
    roomWatcherUnsubscribe = null;
  };

  // ── 5. playerDice 監視（ダイスフェーズ専用）──────────────────────
  setupPlayerDiceWatcher(gameRoom);
}

function stopAllWatchers() {
  if (roomWatcherUnsubscribe) { roomWatcherUnsubscribe(); roomWatcherUnsubscribe = null; }
  if (playerDiceWatcherUnsubscribe) { playerDiceWatcherUnsubscribe(); playerDiceWatcherUnsubscribe = null; }
}

/**
 * playerDice の変更を監視する唯一の場所。
 * ここだけが state.player*.diceValue を更新し update() を呼ぶ。
 *
 * 手順:
 *   1. 片方の値が届く → state に反映 → update() → UI に値表示
 *   2. 両方の値が届く → state に反映 → update() → 結果画面表示
 *      （勝者は選択ボタン、敗者は待機メッセージ）
 *   3. 値が消える（引き分け振り直し）→ state をリセット → update()
 */
function setupPlayerDiceWatcher(gameRoom) {
  if (!gameRoom || !firebaseClient || !firebaseClient.db) {
    console.warn("[DiceWatcher] 開始できません");
    return;
  }

  console.log("[DiceWatcher] 監視開始:", gameRoom);

  const diceRef = firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`);

  const listener = (snapshot) => {
    // snapshot の null チェック
    if (!snapshot) return;

    // ダイスフェーズ以外は無視
    if (state.matchData.status !== "setup_dice") return;

    const raw = snapshot.val() || {};
    const p1 = (raw.player1 !== null && raw.player1 !== undefined && raw.player1 >= 0)
      ? raw.player1 : -1;
    const p2 = (raw.player2 !== null && raw.player2 !== undefined && raw.player2 >= 0)
      ? raw.player2 : -1;

    console.log("[DiceWatcher] 受信 p1:", p1, "p2:", p2);

    // state に反映
    state.player1.diceValue = p1;
    state.player2.diceValue = p2;

    // rolling フェーズ中なら相手の欄を直接更新（DOM が存在する場合）
    const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
    const opKey = playerKey === "player1" ? "player2" : "player1";
    const opDice = opKey === "player1" ? p1 : p2;
    const opEl = document.getElementById(`dice-val-${opKey}`);
    if (opEl) {
      const newText = opDice >= 0 ? String(opDice) : "?";
      if (opEl.textContent !== newText) {
        opEl.style.animation = "none";
        opEl.textContent = newText;
        void opEl.offsetWidth;
        if (opDice >= 0) {
          opEl.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
        }
      }
    }

    // ステータスメッセージも更新
    const statusMsg = document.getElementById("dice-status-msg");
    if (statusMsg) {
      const p1Name = state.player1.username || "Player1";
      const p2Name = state.player2.username || "Player2";
      if (p1 >= 0 && p2 < 0) {
        statusMsg.innerHTML = `<span style="color:#00ffcc;animation:pulse 2s infinite;display:inline-block;">${p2Name} がダイスを振るのを待っています...</span>`;
      } else if (p2 >= 0 && p1 < 0) {
        statusMsg.innerHTML = `<span style="color:#e24a4a;animation:pulse 2s infinite;display:inline-block;">${p1Name} がダイスを振るのを待っています...</span>`;
      }
    }

    // UI を更新
    update();
  };

  diceRef.on('value', listener);

  // クリーンアップ関数を返す（roomWatcherUnsubscribe と同じパターン）
  playerDiceWatcherUnsubscribe = () => {
    diceRef.off('value', listener);
    playerDiceWatcherUnsubscribe = null;
  };
}


window.addEventListener("cardsReady", () => {
  cardsReadyFired = true;
});

// Firebase 初期化完了を待ってから initGame を呼ぶ
// game.html の window.load → firebaseClient.initialize() → firebaseJoined の順で発火する
document.addEventListener("firebaseJoined", () => {
  console.log("[Game] firebaseJoined 受信 → initGame 開始");
  initGame();
});

// ===== タイマー処理は削除（時間制限機能は実装しない） =====
// 時間制限機能は Firebase では複雑なため、MVP では実装しません
