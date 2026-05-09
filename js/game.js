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

    const backImage = state[owner].backImage;
    const img = document.createElement("img");
    img.draggable = false;
    setSafeSrc(img, backImage);

    const countLabel = document.createElement("div");
    countLabel.classList.add("deckObjectCount");
    countLabel.textContent = state[owner].deck.length;

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

  lastResetAt = now;
  addGameLog(`[PROTOCOL:RESET] ${window.myUsername || window.myRole} がリセットを実行しました。`);

  // ステップ1: 全プレイヤーのステータス初期化
  ["player1", "player2"].forEach(owner => {
    const s = state[owner];
    if (!s) return;
    s.hp = 20; s.hpMax = 20;
    s.shield = 0; s.barrier = 0; s.def = 0;
    s.level = 1; s.exp = 0;
    if (typeof applyLevelStats === "function") applyLevelStats(owner, true);
  });

  // ステップ2: 自分のデッキのみ再構築
  initDeckFromCode();
  if (typeof getMyState === "function") {
    getMyState().backImage = getBackImage();
  }
  shuffleDeck();

  // ステップ3: 場のカードをすべて削除
  const content = getFieldContent();
  if (content) {
    content.querySelectorAll(".card:not(.deckObject)").forEach(el => el.remove());
  }

  // ブラウザのローカルキャッシュをクリーンアップ
  localStorage.removeItem("fieldCards");
  localStorage.removeItem("gameStarted");

  // マッチデータの初期化
  state.matchData = {
    round: 1, turn: 1, turnPlayer: "player1", status: "setup_dice",
    dice: { player1: null, player2: null },
    winner: null, firstPlayer: null
  };
  window.serverInitialState = JSON.parse(JSON.stringify(state));

  // アトミック保存（gameState完全上書き + フィールドクリア）
  // Firebase 経由で自動同期
  localStorage.setItem("gameState", JSON.stringify(state));
  localStorage.removeItem("fieldCards");

  createDeckObject(true);

  if (typeof syncLoop === "function") {
    await syncLoop();
  }

  if (typeof update === "function") update();
}

window.resetField = resetField;

function updateDeckObject() {
  const content = getFieldContent();
  if (!content) return;
  ["player1", "player2"].forEach(owner => {
    const obj = content.querySelector(`.deckObject[data-owner="${owner}"]`);
    if (!obj) return;
    const s = state[owner];
    if (!s || !s.deck) return;

    const countLabel = obj.querySelector(".deckObjectCount");
    if (countLabel) countLabel.textContent = s.deck.length;

    const img = obj.querySelector("img");
    if (img && s.backImage) {
      img.src = s.backImage;
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
  update();
}

// ===== ドロー =====
function drawFromDeckObject() {
  if (!gameReady) return;
  const currentRole = window.getMyRole();
  if (!currentRole) return;

  const s = state[currentRole];
  if (!s || !s.deck || s.deck.length === 0) return;

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
  const drawX = deckX + 340;

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
    placeCard(document.getElementById("field"), card, { x: drawX, y: deckY });
  }

  // 即時保存
  if (typeof saveImmediate === "function") saveImmediate();
  else save();

  updateDeckObject();
  update();
}

// ===== ステータスUI =====

function addVal(owner, key, delta) {
  const s = state[owner];
  const maxLv = Number(s.levelMax) || LEVEL_MAX;
  const curLv = Number(s.level) || 1;

  if (key === "level") {
    s.level = Math.min(Math.max(curLv + delta, 1), maxLv);
    s.exp = Math.min(Number(s.exp) || 0, calcExpMax(s.level) - 1);
    applyLevelStats(owner);
    update();
    return;
  }

  // Lv最大時は経験値を増やさない（減少は可）
  if (key === "exp" && delta > 0 && curLv >= maxLv) return;
  // Lv1の時は経験値をマイナスにしない
  if (key === "exp" && delta < 0 && curLv <= 1) {
    s.exp = Math.max(0, (Number(s.exp) || 0) + delta);
    syncDerivedStats(owner);
    update();
    return;
  }
  const prev = Number(s[key]) || 0;
  let v = prev + delta;
  if (key === "shield") {
    if (v < 0 && prev === 0) v = s.shieldMax || 0;
    v = Math.max(0, v);
    if (delta > 0 && !s.shieldOverMax) v = Math.min(v, s.shieldMax || 0);
    if (v <= (s.shieldMax || 0)) s.shieldOverMax = false;
  } else if (key !== "hp" && key !== "exp") {
    v = Math.max(0, v);
  }
  s[key] = v;
  if (key === "exp") checkLevelUp(owner);
  syncDerivedStats(owner);

  if (typeof saveImmediate === "function") saveImmediate();
  else if (typeof save === "function") save();
  update();
}

function setVal(owner, key, value) {
  const s = state[owner];
  const maxLv = s.levelMax || LEVEL_MAX;

  if (key === "level") {
    s.level = Math.min(Math.max(Math.round(Number(value) || 1), 1), maxLv);
    s.exp = Math.min(Number(s.exp) || 0, calcExpMax(s.level) - 1);
    applyLevelStats(owner);
    update();
    return;
  }

  // Lv最大時は経験値の増加だけ不可（減少によるレベルダウンは可）
  if (key === "exp" && s.level >= maxLv && Number(value) > (Number(s.exp) || 0)) return;
  let prev = Number(s[key]) || 0;
  let v = Number(value) || 0;

  if (key === "shield" && v < 0 && prev === 0) {
    v = s.shieldMax;
  } else if (key !== "hp") {
    v = Math.max(key === "exp" ? -999 : 0, v);
  }
  if (key === "barrier") {
    v = Math.min(v, s.barrierMax || 5);
  }
  if (key === "shield") {
    v = Math.min(v, s.shieldMax || 0);
    s.shieldOverMax = false;
  }

  s[key] = v;
  if (key === "exp") checkLevelUp(owner);
  syncDerivedStats(owner);
  update();
}

function setMax(owner, key, value) {
  state[owner][key + "Max"] = Math.max(0, Number(value) || 0);
  syncDerivedStats(owner);
  update();
}

// 派生ステータスの同期（shieldMax = def など）
function syncDerivedStats(owner) {
  const s = state[owner];
  if (!s) return;
  // shieldMaxは常にdefと同じ
  s.shieldMax = s.def || 0;
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
  const expMax = calcExpMax(s.level);
  const shieldMax = s.def || 0;
  const hpPct = barPct(s.hp, s.hpMax);
  const barrierPct = barPct(s.barrier, s.barrierMax);
  const sldPct = barPct(s.shield, shieldMax);
  const expPct = barPct(s.exp, expMax);
  const atMaxLv = s.level >= (s.levelMax || LEVEL_MAX);
  const atMinExp = s.level <= 1 && s.exp <= 0;

  return `
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
      <div class="lorExpRow">
        ${(atMinExp || !isMine)
      ? `<span class="lorSmBtnPlaceholder"></span>`
      : `<button class="lorSmBtn" data-owner="${owner}" data-key="exp" data-delta="-1">−</button>`
    }
        <span class="lorExpVal">${s.exp}/${expMax}</span>
        ${(atMaxLv || !isMine)
      ? `<span class="lorSmBtnPlaceholder"></span>`
      : `<button class="lorSmBtn" data-owner="${owner}" data-key="exp" data-delta="1">＋</button>`
    }
      </div>
    </div>

    <!-- 中央: HP・シールド -->
    <div class="lorCenter">
      <div class="lorStatRow lorBarrierRow" style="transform: scale(0.85); transform-origin: left bottom; margin-bottom: -4px;">
        <span class="lorIcon" title="シールド">${ICON_BARRIER}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorBarrierFill" style="width:${barrierPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="barrier" data-delta="-1">−</button>` : ""}
          <input class="lorValInput" type="number" value="${s.barrier}"
            data-owner="${owner}" data-key="barrier" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${s.barrierMax}" readonly disabled
            style="opacity: 0.6; cursor: not-allowed;">
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="barrier" data-delta="1">＋</button>` : ""}
        </div>
      </div>
      <div class="lorStatRow">
        <span class="lorIcon">${ICON_HP}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorHpFill" style="width:${hpPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="hp" data-delta="-1">−</button>` : ""}
          <input class="lorValInput" type="number" value="${s.hp}"
            data-owner="${owner}" data-key="hp" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${s.hpMax}"
            data-owner="${owner}" data-key="hp" data-type="max" ${isMine ? "" : "readonly disabled"}>
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="hp" data-delta="1">＋</button>` : ""}
        </div>
      </div>
      <div class="lorStatRow" style="position: relative;">
        <span class="lorIcon" title="合計防御力">${ICON_SLD}</span>
        <div class="lorBarOuter">
          <div class="lorBarInner lorSldFill" style="width:${sldPct}%"></div>
        </div>
        <div class="lorValGroup">
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="shield" data-delta="-1">−</button>` : ""}
          <input class="lorValInput" type="number" value="${s.shield}"
            data-owner="${owner}" data-key="shield" data-type="val" ${isMine ? "" : "readonly disabled"}>
          <span class="lorValSep">/</span>
          <input class="lorMaxInput" type="number" value="${shieldMax}" readonly disabled
            style="opacity: 0.6; cursor: not-allowed;">
          ${isMine ? `<button class="lorSmBtn" data-owner="${owner}" data-key="shield" data-delta="1">＋</button>` : ""}
        </div>
      </div>
    </div>

    <!-- 右: ATK/DEF/IDEF -->
    <div class="lorRight">
      ${lorStatChip(ICON_ATK, s.atk, owner, "atk")}
      ${lorStatChip(ICON_DEF, s.def, owner, "def")}
      ${lorStatChip(ICON_IDEF, s.instantDef, owner, "instantDef")}
      ${isMine ? `
        <div class="lorActionGroup">
          <button class="lorInstantDefBtn" data-owner="${owner}" data-action="addInstantDef" type="button">瞬間防御</button>
          <button class="lorResetDefBtn" data-owner="${owner}" data-action="resetDefense" type="button" title="防御解除">解除</button>
        </div>
      ` : ""}
    </div>

  </div>`;
}

function lorStatChip(icon, val, owner, key) {
  const isEditable = window.devMode;
  return `
  <div class="lorChip">
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

function update() {
  const oldState = JSON.parse(lastStateJson || "{}");
  checkAndLogStateChanges(oldState, state);
  lastStateJson = JSON.stringify(state);

  const playerEl = document.getElementById("gameUiPlayerInner");
  const enemyEl = document.getElementById("gameUiEnemy");
  const myOwner = window.myRole || "player1";
  const enemyOwner = myOwner === "player1" ? "player2" : "player1";

  if (playerEl) playerEl.innerHTML = renderOwnerUI(myOwner);
  if (enemyEl) enemyEl.innerHTML = renderOwnerUI(enemyOwner);

  // マッチ進行UIの更新
  updateMatchUI();

  if (typeof updateDeckObject === "function") updateDeckObject();

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

  // ターン開始通知
  if (lastTurnPlayer !== m.turnPlayer && m.status === 'playing') {
    const isMe = m.turnPlayer === window.myRole;
    showNotification(isMe ? "あなたのターン" : "相手のターン", isMe ? "#00ffcc" : "#e24a4a");
    lastTurnPlayer = m.turnPlayer;
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
        <div class="match-turn-count">TURN ${m.turn}</div>
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

  // 勝敗チェック
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

  // 3. ダイスフェーズのオーバーレイ
  updateDicePhaseUI();
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

function checkGameResult() {
  if (!state.matchData) return;
  if (state.matchData.winner) {
    showResultScreen(state.matchData.winner);
    return;
  }
  // 自分のHPが0になった場合のみ自分が敗北を宣言（二重書き込み防止）
  const myRole = window.myRole;
  if (!myRole) return;
  const opRole = myRole === 'player1' ? 'player2' : 'player1';
  if (state[myRole] && state[myRole].hp <= 0) {
    if (state[opRole] && state[opRole].hp <= 0) {
      state.matchData.winner = 'draw';
    } else {
      state.matchData.winner = opRole;
    }
    saveImmediate();
  }
}

function showResultScreen(winner) {
  if (document.getElementById('gameResultOverlay')) return;
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
      <div class="result-actions">
        <button class="result-btn" onclick="window.resetField()" style="background: ${color}; box-shadow: 0 0 20px ${color}44;">
          再戦 / リセット
        </button>
        <button class="result-btn secondary" onclick="location.href='index.html'">
          退室
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}


function updateDicePhaseUI() {
  const m = state.matchData;
  let overlay = document.getElementById("dicePhaseOverlay");

  if (m.status !== "setup_dice") {
    console.log("[updateDicePhaseUI] ダイスフェーズ終了。ステータス:", m.status);
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

  // 両プレイヤーが揃ったら結果画面に切り替え
  if (bothRolled) {
    let resultTitle, resultMsg, p1Color, p2Color;
    if (p1Dice === p2Dice) {
      resultTitle = `<h2 class="dice-title" style="color:#ff4444;">引き分け</h2>`;
      resultMsg = `<p class="dice-subtitle" style="color:#ff4444; margin-top:40px;">同じ値です。もう一度振ります...</p>
                   <button class="dice-roll-btn" onclick="handleResetDice()" style="background:#444;color:#fff;margin-top:30px;">振り直し</button>`;
      p1Color = "#ff4444"; p2Color = "#ff4444";
    } else if (p1Dice < p2Dice) {
      // プレイヤー1が選択権を持つ
      const me = window.myRole || "player1";
      const iAmChooser = (me === "player1");
      resultTitle = `<h2 class="dice-title" style="color:#00ffcc;animation:titleGlow 1s ease-in-out infinite;">プレイヤー1 勝利！</h2>`;
      if (iAmChooser) {
        resultMsg = `
          <p class="dice-subtitle" style="color:#00ffcc;margin-top:40px;font-size:18px;font-weight:900;">あなたが選択権を持っています</p>
          <div style="display:flex;gap:20px;justify-content:center;margin-top:30px;">
            <button class="dice-roll-btn" onclick="handleChooseOrder(true)" style="padding:15px 40px;font-size:16px;">先攻</button>
            <button class="dice-roll-btn" onclick="handleChooseOrder(false)" style="padding:15px 40px;font-size:16px;background:#444;color:#fff;">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-subtitle" style="color:#888;margin-top:40px;font-size:16px;">相手が先攻・後攻を選択しています...</p>
                     <div style="margin-top:20px;font-size:12px;color:#888;letter-spacing:2px;animation:pulse 2s infinite;">● 待機中</div>`;
      }
      p1Color = "#00ffcc"; p2Color = "#888";
    } else {
      // プレイヤー2が選択権を持つ
      const me = window.myRole || "player1";
      const iAmChooser = (me === "player2");
      resultTitle = `<h2 class="dice-title" style="color:#e24a4a;animation:titleGlow 1s ease-in-out infinite;">プレイヤー2 勝利！</h2>`;
      if (iAmChooser) {
        resultMsg = `
          <p class="dice-subtitle" style="color:#e24a4a;margin-top:40px;font-size:18px;font-weight:900;">あなたが選択権を持っています</p>
          <div style="display:flex;gap:20px;justify-content:center;margin-top:30px;">
            <button class="dice-roll-btn" onclick="handleChooseOrder(true)" style="padding:15px 40px;font-size:16px;">先攻</button>
            <button class="dice-roll-btn" onclick="handleChooseOrder(false)" style="padding:15px 40px;font-size:16px;background:#444;color:#fff;">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-subtitle" style="color:#888;margin-top:40px;font-size:16px;">相手が先攻・後攻を選択しています...</p>
                     <div style="margin-top:20px;font-size:12px;color:#888;letter-spacing:2px;animation:pulse 2s infinite;">● 待機中</div>`;
      }
      p1Color = "#888"; p2Color = "#e24a4a";
    }

    const newHtml = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        ${resultTitle}
        <div style="display:flex;justify-content:center;gap:100px;align-items:center;margin:50px 0;">
          <div style="text-align:center;">
            <div style="font-size:16px;color:${p1Color};letter-spacing:2px;margin-bottom:20px;font-weight:900;">プレイヤー1</div>
            <div class="dice-value-large" style="color:${p1Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;">${p1Dice}</div>
          </div>
          <div style="font-size:32px;color:#444;font-weight:900;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:16px;color:${p2Color};letter-spacing:2px;margin-bottom:20px;font-weight:900;">プレイヤー2</div>
            <div class="dice-value-large" style="color:${p2Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both;">${p2Dice}</div>
          </div>
        </div>
        ${resultMsg}
      </div>
    `;
    if (overlay.dataset.lastHtml !== newHtml) {
      overlay.innerHTML = newHtml;
      overlay.dataset.lastHtml = newHtml;
    }
    return;
  }

  // 初期状態 or 片方だけ振った状態 → 常に両プレイヤーを左右に表示
  // ちらつき防止: 既に正しいレイアウトが表示されていれば DOM を再構築しない
  if (!overlay.querySelector("#dice-val-player1")) {
    overlay.innerHTML = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        <h2 class="dice-title" style="margin-bottom:60px;">ダイスロール</h2>
        <div style="display:flex;justify-content:center;gap:100px;align-items:flex-start;">

          <div style="text-align:center;">
            <div style="font-size:18px;color:#00ffcc;letter-spacing:2px;margin-bottom:30px;font-weight:900;">プレイヤー1</div>
            <div id="dice-val-player1" class="dice-value-large" style="color:#00ffcc;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player1" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;">ダイスを振る</button>
          </div>

          <div style="font-size:32px;color:#444;font-weight:900;margin-top:90px;">VS</div>

          <div style="text-align:center;">
            <div style="font-size:18px;color:#e24a4a;letter-spacing:2px;margin-bottom:30px;font-weight:900;">プレイヤー2</div>
            <div id="dice-val-player2" class="dice-value-large" style="color:#e24a4a;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player2" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;">ダイスを振る</button>
          </div>

        </div>
        <div id="dice-status-msg" style="margin-top:50px;font-size:13px;color:#888;letter-spacing:2px;min-height:20px;"></div>
      </div>
    `;
    overlay.dataset.lastHtml = "__layout__";
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
    void p1El.offsetWidth; // reflow
    p1El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }
  if (p2El && p2Dice >= 0 && p2El.textContent !== String(p2Dice)) {
    p2El.style.animation = "none";
    p2El.textContent = p2Dice;
    void p2El.offsetWidth;
    p2El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }

  // 自分のボタンだけ有効、相手のボタンは非表示
  if (p1Btn) {
    if (playerKey === "player1") {
      p1Btn.style.display = p1Dice >= 0 ? "none" : "inline-block";
    } else {
      p1Btn.style.display = "none";
    }
  }
  if (p2Btn) {
    if (playerKey === "player2") {
      p2Btn.style.display = p2Dice >= 0 ? "none" : "inline-block";
    } else {
      p2Btn.style.display = "none";
    }
  }

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

async function handleDiceRoll() {
  const me = window.myRole || "player1";
  const playerKey = localStorage.getItem("gamePlayerKey") || me;

  // 既に振っていたら無視
  if (state[playerKey].diceValue >= 0) return;

  console.log("[handleDiceRoll] ダイスロール開始:", playerKey);

  // ボタンを無効化してアニメーション開始
  const btn = document.getElementById(`dice-btn-${playerKey}`);
  if (btn) { btn.disabled = true; btn.textContent = "振り中..."; }
  showDiceRollingAnimation();

  // 1秒後に値を決定
  await new Promise(resolve => setTimeout(resolve, 1000));

  const roll = Math.floor(Math.random() * 100) + 1;
  console.log("[handleDiceRoll] ダイスロール結果:", playerKey, "=", roll);
  addGameLog(`[DICE] ${window.myUsername || playerKey} がダイスを振りました: ${roll}`);

  // アニメーション停止して値を表示
  const diceEl = document.getElementById(`dice-val-${playerKey}`);
  if (diceEl) {
    diceEl.style.animation = "diceResultPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";
    diceEl.textContent = roll;
  }
  if (btn) { btn.style.display = "none"; }

  // state に保存
  state[playerKey].diceValue = roll;

  // Firebase にプレイヤーのダイス値を保存
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient) {
    await firebaseClient.setPlayerDice(gameRoom, playerKey, roll);

    // 両プレイヤーのダイス値を取得して比較
    const allDice = await firebaseClient.getAllPlayerDice(gameRoom);
    console.log("[handleDiceRoll] すべてのダイス値:", allDice);

    if (allDice.player1 !== null && allDice.player1 !== undefined && allDice.player1 >= 0 &&
        allDice.player2 !== null && allDice.player2 !== undefined && allDice.player2 >= 0) {
      // 両プレイヤーのダイス値が決定
      state.player1.diceValue = allDice.player1;
      state.player2.diceValue = allDice.player2;
      if (typeof saveImmediate === "function") await saveImmediate();
      await firebaseClient.updateRoomGameState(gameRoom, JSON.parse(JSON.stringify(state)));
    }
  }

  if (typeof saveImmediate === "function") await saveImmediate();
  if (typeof syncLoop === "function") syncLoop();
  update();
}

/**
 * ダイスロールアニメーションを表示（自分のダイス欄のみ更新）
 */
function showDiceRollingAnimation() {
  // 自分のプレイヤーキーを取得
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const diceEl = document.getElementById(`dice-val-${playerKey}`);
  if (!diceEl) return;
  diceEl.style.animation = "diceRolling 0.15s ease-in-out infinite";
  diceEl.textContent = "?";
}

async function handleResetDice() {
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  
  console.log("[handleResetDice] ダイスをリセット:", playerKey);
  
  // Firebase からプレイヤーのダイス値をリセット
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient) {
    console.log("[handleResetDice] Firebase からプレイヤーダイス値をリセット");
    await firebaseClient.setPlayerDice(gameRoom, playerKey, null);
  }
  
  // ローカルの state もリセット
  state.player1.diceValue = -1;
  state.player2.diceValue = -1;
  
  // ローカルに保存
  if (typeof saveImmediate === "function") await saveImmediate();
  
  if (typeof syncLoop === "function") syncLoop();
  update();
}

async function handleChooseOrder(goFirst) {
  console.log("[handleChooseOrder] ゲーム開始処理開始。goFirst:", goFirst);
  
  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";

  // 選択権を持つプレイヤーが「先攻」を選んだ場合は自分が先攻、「後攻」なら相手が先攻
  state.matchData.turnPlayer = goFirst ? me : op;
  state.matchData.firstPlayer = state.matchData.turnPlayer;
  state.matchData.status = "playing";
  state.matchData.round = 1;
  state.matchData.turn = 1;

  const firstPlayerName = state.matchData.turnPlayer === "player1"
    ? (state.player1.username || "P1")
    : (state.player2.username || "P2");

  console.log("[handleChooseOrder] ゲーム開始。先攻:", state.matchData.turnPlayer);
  addGameLog(`[MATCH] 試合開始！先攻: ${firstPlayerName}`);
  
  // ローカルに保存
  if (typeof saveImmediate === "function") await saveImmediate();
  
  // Firebase に保存
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient) {
    console.log("[handleChooseOrder] Firebase にゲーム状態を保存");
    await firebaseClient.updateRoomGameState(gameRoom, state);
  }
  
  if (typeof syncLoop === "function") syncLoop();
  update();
}

async function handleTurnEnd() {
  const m = state.matchData;
  const me = window.myRole || "player1";
  
  console.log("[handleTurnEnd] ターン終了処理開始。現在のターンプレイヤー:", m.turnPlayer, "自分:", me);
  
  if (m.turnPlayer !== me) {
    console.log("[handleTurnEnd] 自分のターンではないため、処理をスキップ");
    return;
  }
  if (m.winner) {
    console.log("[handleTurnEnd] 勝敗確定後のため、処理をスキップ");
    return; // 勝敗確定後は無効
  }

  // ターン変更
  const op = me === "player1" ? "player2" : "player1";
  const firstPlayer = m.firstPlayer || "player1";
  const isFirstPlayerTurn = (m.turnPlayer === firstPlayer);

  if (isFirstPlayerTurn) {
    m.turnPlayer = op;
  } else {
    m.turnPlayer = firstPlayer;
    m.turn += 1;
    if (m.turn > 10) {
      m.turn = 1;
      m.round += 1;
      addGameLog(`[MATCH] 第 ${m.round} ラウンド開始！`);
    }
  }

  // 保存・同期
  console.log("[handleTurnEnd] ターン変更完了。新しいターンプレイヤー:", m.turnPlayer, "ラウンド:", m.round, "ターン:", m.turn);
  addGameLog(`[TURN] ${window.myUsername || me} がターンを終了しました。次は ${m.turnPlayer} のターンです。`);
  
  // ローカルに保存
  if (typeof saveImmediate === "function") await saveImmediate();
  
  // Firebase に保存（ルームデータとして）
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient) {
    console.log("[handleTurnEnd] Firebase にゲーム状態を保存");
    await firebaseClient.updateRoomGameState(gameRoom, state);
  }
  
  if (typeof syncLoop === "function") syncLoop();
  update();
}

// イベント委譲（body全体で拾う）
document.body.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset.owner) return;
  if (t.dataset.type === "val") setVal(t.dataset.owner, t.dataset.key, t.value);
  if (t.dataset.type === "max") setMax(t.dataset.owner, t.dataset.key, t.value);
});

let sliderActive = false;

document.body.addEventListener("pointerdown", (e) => {
  if (e.target.classList.contains("lorSlider")) sliderActive = true;
});

document.body.addEventListener("pointerup", (e) => {
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

  if (key === "shield" && v < 0 && prev === 0) {
    v = state[owner].shieldMax;
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
  const t = e.target.closest(".lorSmBtn, .lorInstantDefBtn, .lorResetDefBtn");
  if (!t || !t.dataset.owner) return;
  if (t.disabled) return;

  if (t.dataset.action === "addInstantDef") {
    const owner = t.dataset.owner;
    const next = (Number(state[owner].shield) || 0) + (Number(state[owner].instantDef) || 0);
    state[owner].shield = Math.max(0, next);
    state[owner].shieldOverMax = state[owner].shield > (Number(state[owner].shieldMax) || 0);
    if (typeof saveImmediate === "function") saveImmediate();
    update();
    return;
  }

  if (t.dataset.action === "resetDefense") {
    const owner = t.dataset.owner;
    const s = state[owner];
    const cur = Number(s.shield) || 0;
    const max = Number(s.shieldMax) || 0;
    if (cur > max) {
      s.shield = max;
      s.shieldOverMax = false;
      if (typeof saveImmediate === "function") saveImmediate();
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
      if (initiator && initiator[1] !== (window.myUsername || window.myRole)) {
        console.log("Remote Reset Detected. Re-initializing local deck...");
        initDeckFromCode();
        shuffleDeck();
        createDeckObject(true);
      }
    }
  }

  ["player1", "player2"].forEach(owner => {
    if (!oldState[owner]) return;
    const s1 = oldState[owner];
    const s2 = newState[owner];
    const name = s2.username || owner;

    if (s1.level < s2.level) {
      addGameLog(`${name} レベルアップ!!!【レベル:${s2.level}】`);
    } else {
      if (s1.hp !== s2.hp) addGameLog(`${name} HP:${s1.hp}→${s2.hp}`);
      if (s1.exp !== s2.exp) addGameLog(`${name} EXP:${s1.exp}→${s2.exp}`);
      if (s1.shield !== s2.shield || s1.shieldMax !== s2.shieldMax) {
        if (s2.shield !== s1.shield) addGameLog(`${name} 防御力:${s2.shield}/${s2.shieldMax}`);
      }
    }
  });
}

function handleChatSend() {
  const input = document.getElementById("chatInput");
  const val = input.value.trim();
  if (!val) return;
  addGameLog(`${window.myUsername || window.myRole}: ${val}`);
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
      addGameLog(`${window.myUsername || window.myRole} が入室しました。`);
    }

    // 新しいルームに入った場合、ダイスロールフェーズをリセット
    // （前のルームのダイスデータが残っていないようにする）
    const currentRoom = localStorage.getItem("gameRoom");
    const lastRoom = window._lastGameRoom;
    if (currentRoom && currentRoom !== lastRoom) {
      console.log("[initGame] 新しいルームに入りました。ダイスロールをリセット");
      state.matchData.status = "setup_dice";
      state.player1.diceValue = -1;
      state.player2.diceValue = -1;
      window._lastGameRoom = currentRoom;
      window._gameStartInitiated = false;
      save();

      // Firebase の playerDice もリセット（前回の値が残っていると誤検知する）
      if (firebaseClient && firebaseClient.db) {
        console.log("[initGame] Firebase playerDice をリセット:", currentRoom);
        firebaseClient.db.ref(`rooms/${currentRoom}/playerDice`).remove();
      }
    }

    console.log("[initGame] step7: gameReady = true, calling update()");
    gameReady = true;
    update();
    console.log("[initGame] step8: update() done");

    if (cardsReadyFired) {
      createDeckObject();
    } else {
      window.addEventListener("cardsReady", () => {
        createDeckObject();
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

  console.log("[Game] ルーム監視開始:", gameRoom);

  roomWatcherUnsubscribe = firebaseClient.watchRoom(gameRoom, (roomData) => {
    if (!roomData) {
      console.log("[Game] ルームが削除されました");
      return;
    }

    console.log("[Game] ルーム更新を受信:", roomData);

    const players = roomData.players || {};
    const playerCount = Object.keys(players).length;

    console.log("[Game] ルーム内プレイヤー数:", playerCount);

    // ゲーム状態を更新
    if (roomData.gameState) {
      console.log("[Game] ゲーム状態を更新:", roomData.gameState.matchData);
      state.player1 = roomData.gameState.player1 || state.player1;
      state.player2 = roomData.gameState.player2 || state.player2;
      state.matchData = roomData.gameState.matchData || state.matchData;
      state.logs = roomData.gameState.logs || state.logs;
      
      // localStorage に保存
      localStorage.setItem("gameState", JSON.stringify(state));
      
      // UI を更新
      if (typeof update === "function") {
        console.log("[Game] update() を呼び出し");
        update();
      }
    }

    // 両プレイヤーが退出した場合
    if (playerCount === 0) {
      console.log("[Game] 両プレイヤーが退出しました。ゲーム状態をリセット");
      resetAllGameVariables();
      
      // ルーム監視を停止
      if (roomWatcherUnsubscribe) {
        roomWatcherUnsubscribe();
        roomWatcherUnsubscribe = null;
      }
      
      // プレイヤーダイス監視を停止
      if (playerDiceWatcherUnsubscribe) {
        playerDiceWatcherUnsubscribe();
        playerDiceWatcherUnsubscribe = null;
      }
      
      // ゲーム状態をリセット
      firebaseClient.resetRoomGameState(gameRoom);
    }
  });

  // プレイヤーダイス値の変更を監視
  setupPlayerDiceWatcher(gameRoom);
}

/**
 * プレイヤーダイス値の変更を監視
 */
function setupPlayerDiceWatcher(gameRoom) {
  if (!gameRoom || !firebaseClient || !firebaseClient.db) {
    console.warn("[Game] プレイヤーダイス監視を開始できません");
    return;
  }

  console.log("[Game] プレイヤーダイス監視開始:", gameRoom);

  const diceRef = firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`);
  playerDiceWatcherUnsubscribe = diceRef.on('value', (snapshot) => {
    const allDice = snapshot.val() || {};
    console.log("[Game] プレイヤーダイス更新を受信:", allDice);

    // ダイスフェーズ以外では無視
    if (state.matchData.status !== "setup_dice") {
      console.log("[Game] ダイスフェーズ以外のため無視");
      return;
    }

    // 片方でも値が届いたら state に反映（UI更新のため）
    if (allDice.player1 !== null && allDice.player1 !== undefined && allDice.player1 >= 0) {
      state.player1.diceValue = allDice.player1;
    }
    if (allDice.player2 !== null && allDice.player2 !== undefined && allDice.player2 >= 0) {
      state.player2.diceValue = allDice.player2;
    }

    // 両プレイヤーのダイス値が決定したか確認
    if (allDice.player1 !== null && allDice.player1 !== undefined && allDice.player1 >= 0 &&
        allDice.player2 !== null && allDice.player2 !== undefined && allDice.player2 >= 0) {
      console.log("[Game] 両プレイヤーのダイス値が決定:", allDice);
      
      // localStorage に保存
      localStorage.setItem("gameState", JSON.stringify(state));
      
      // UI を更新
      if (typeof update === "function") {
        console.log("[Game] update() を呼び出し（ダイス値更新）");
        update();
      }
    }
  });
}


window.addEventListener("cardsReady", () => {
  cardsReadyFired = true;
});

initGame();

// ===== タイマー処理は削除（時間制限機能は実装しない） =====
// 時間制限機能は Firebase では複雑なため、MVP では実装しません

