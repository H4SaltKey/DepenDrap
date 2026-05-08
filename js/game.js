let gameReady = false;

// setSafeSrc は cardManager.js で定義済み（重複定義を削除）

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
    s.level = 1; s.exp = 0; s.timeLeft = 300;
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
    diceTimeLeft: 30, choiceTimeLeft: 15, winner: null, firstPlayer: null
  };
  // GameTimer もリセット
  if (typeof GameTimer !== "undefined") {
    ["player1", "player2", "dice", "choice"].forEach(k => GameTimer.stop(k));
  }
  window.serverInitialState = JSON.parse(JSON.stringify(state));

  // アトミック保存（gameState完全上書き + フィールドクリア）
  // Firebase 経由で自動同期
  localStorage.setItem("gameState", JSON.stringify(state));
  localStorage.removeItem("fieldCards");
  }

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
    .match-timer-box { display: flex; flex-direction: column; align-items: center; min-width: 80px; }
    .match-timer-label { font-size: 10px; color: #888; letter-spacing: 1px; }
    .match-timer-val { font-size: 20px; font-weight: 900; color: #fff; }
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

  const isTimeEnabled = JSON.parse(localStorage.getItem("settings"))?.timeLimitEnabled !== false;
  const isMyTurn = (m.turnPlayer === window.myRole);
  const p1Time = Math.max(0, Math.floor(state.player1.timeLeft ?? BASE_INITIAL_STATE.timeLeft));
  const p2Time = Math.max(0, Math.floor(state.player2.timeLeft ?? BASE_INITIAL_STATE.timeLeft));

  const formatTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;

  // <style> タグは injectMatchHeaderStyle() で初回のみ <head> に追加済み
  const html = `
    <div class="match-header">
      <div class="match-timer-box" style="${m.turnPlayer === 'player1' ? 'filter: drop-shadow(0 0 8px #c7b377);' : 'opacity: 0.5;'}">
        <span class="match-timer-label">P1 持ち時間</span>
        <span class="match-timer-val" style="${p1Time < 30 ? 'color: #e24a4a;' : ''}">${formatTime(p1Time)}</span>
      </div>
      
      <div class="match-info-center">
        <div class="match-round">第 ${m.round} ラウンド</div>
        <div class="match-turn-count">TURN ${m.turn}</div>
        <div class="match-turn-indicator" style="background: ${isMyTurn ? '#00ffcc' : '#e24a4a'}; color: #1a172c;">
          ${isMyTurn ? 'あなたのターン' : "相手のターン"}
        </div>
      </div>

      <div class="match-timer-box" style="${m.turnPlayer === 'player2' ? 'filter: drop-shadow(0 0 8px #c7b377);' : 'opacity: 0.5;'}">
        <span class="match-timer-label">P2 持ち時間</span>
        <span class="match-timer-val" style="${p2Time < 30 ? 'color: #e24a4a;' : ''}">${formatTime(p2Time)}</span>
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
    .dice-container { text-align: center; max-width: 600px; width: 90%; }
    .dice-title { font-size: 48px; font-weight: 900; color: #c7b377; letter-spacing: 8px; margin-bottom: 5px; text-transform: uppercase; }
    .dice-subtitle { color: #888; font-size: 14px; letter-spacing: 2px; margin-bottom: 40px; }
    .dice-roll-btn { padding: 20px 80px; font-size: 20px; background: #c7b377; border: none; border-radius: 4px; color: #1a172c; font-weight: 900; cursor: pointer; letter-spacing: 4px; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 10px 30px rgba(199,179,119,0.3); }
    .dice-roll-btn:hover { transform: scale(1.05) translateY(-5px); box-shadow: 0 15px 40px rgba(199,179,119,0.5); }
    .dice-result-val { font-size: 120px; font-weight: 900; color: #fff; line-height: 1; margin: 20px 0; }
    .dice-wait-msg { font-size: 14px; color: #00ffcc; letter-spacing: 2px; animation: dicePulse 1.5s infinite; }
    .dice-choice-group { display: flex; gap: 20px; justify-content: center; margin-top: 40px; }
    .dice-choice-btn { padding: 15px 40px; border-radius: 4px; font-weight: 900; cursor: pointer; letter-spacing: 2px; transition: all 0.3s; }
    .dice-choice-btn.primary { background: #c7b377; border: none; color: #1a172c; }
    .dice-choice-btn.secondary { background: transparent; border: 1px solid #c7b377; color: #c7b377; }
    .dice-choice-btn:hover { transform: translateY(-3px); filter: brightness(1.2); }
    .dice-timer { text-align: center; margin-bottom: 20px; }
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
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);
    }
    return;
  }

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

  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";
  const myDice = m.dice[me];
  const opDice = m.dice[op];
  const bothRolled = (myDice !== null && opDice !== null);
  const someoneWon = bothRolled && (myDice !== opDice);

  const isTimeEnabled = JSON.parse(localStorage.getItem('settings'))?.timeLimitEnabled !== false;
  let timerDisplay = '';

  if (isTimeEnabled) {
    let left = 0;
    let label = "残り時間";
    if (!bothRolled) {
      left = Math.max(0, Math.floor(m.diceTimeLeft || 0));
    } else if (someoneWon) {
      left = Math.max(0, Math.floor(m.choiceTimeLeft || 0));
      label = "選択の残り時間";
    }

    if (!bothRolled || someoneWon) {
      timerDisplay = `
        <div class="dice-timer" style="color:${left < 5 ? '#e24a4a' : '#c7b377'};">
          <span style="font-size: 12px; letter-spacing: 2px; opacity: 0.7;">${label}</span>
          <div style="font-size: 32px; font-weight: 900;">${left}s</div>
        </div>`;
    }
  }

  // baseStyle は injectGameStyles() で <head> に注入済み
  let newHtml = "";

  if (myDice === null) {
    newHtml = `
      <div class="dice-container">
        <h2 class="dice-title">ダイスロール</h2>
        <p class="dice-subtitle">先攻・後攻を決定します</p>
        ${timerDisplay}
        <div style="margin-top: 40px;">
          <button class="dice-roll-btn" onclick="handleDiceRoll()">ダイスを振る</button>
        </div>
      </div>
    `;
  } else if (opDice === null) {
    newHtml = `
      <div class="dice-container">
        <h2 class="dice-title">待機中</h2>
        <div class="dice-result-val">${myDice}</div>
        <p class="dice-wait-msg">相手がダイスを振るのを待っています...</p>
      </div>
    `;
  } else {
    if (myDice === opDice) {
      newHtml = `
        <div class="dice-container">
          <h2 class="dice-title" style="color: #ff4444;">引き分け</h2>
          <div style="display:flex; justify-content:center; gap:40px; align-items:center; margin: 30px 0;">
             <div><div style="font-size:12px; color:#888;">あなた</div><div style="font-size:48px; font-weight:900;">${myDice}</div></div>
             <div style="font-size:24px; color:#444;">VS</div>
             <div><div style="font-size:12px; color:#888;">相手</div><div style="font-size:48px; font-weight:900;">${opDice}</div></div>
          </div>
          <button class="dice-roll-btn" onclick="handleResetDice()" style="background:#444; color:#fff;">振り直し</button>
        </div>
      `;
    } else {
      const iWin = (myDice < opDice);
      if (iWin) {
        newHtml = `
          <div class="dice-container">
            <h2 class="dice-title" style="color: #00ffcc;">勝利</h2>
            <div style="display:flex; justify-content:center; gap:40px; align-items:center; margin: 20px 0;">
               <div><div style="font-size:12px; color:#00ffcc;">あなた</div><div style="font-size:64px; font-weight:900; color:#00ffcc;">${myDice}</div></div>
               <div style="font-size:24px; color:#444;">VS</div>
               <div><div style="font-size:12px; color:#888;">相手</div><div style="font-size:48px; font-weight:900; color:#888;">${opDice}</div></div>
            </div>
            <p class="dice-subtitle">先攻・後攻を選択してください</p>
            <div class="dice-choice-group">
              <button class="dice-choice-btn primary" onclick="handleChooseOrder(true)">先攻</button>
              <button class="dice-choice-btn secondary" onclick="handleChooseOrder(false)">後攻</button>
            </div>
          </div>
        `;
      } else {
        newHtml = `
          <div class="dice-container">
            <h2 class="dice-title" style="color: #e24a4a;">敗北</h2>
            <div style="display:flex; justify-content:center; gap:40px; align-items:center; margin: 20px 0;">
               <div><div style="font-size:12px; color:#888;">あなた</div><div style="font-size:48px; font-weight:900; color:#888;">${myDice}</div></div>
               <div style="font-size:24px; color:#444;">VS</div>
               <div><div style="font-size:12px; color:#e24a4a;">相手</div><div style="font-size:64px; font-weight:900; color:#e24a4a;">${opDice}</div></div>
            </div>
            <p class="dice-wait-msg">相手が手番（先攻・後攻）を選択しています...</p>
          </div>
        `;
      }
    }
  }

  // ちらつき防止
  if (overlay.dataset.lastHtml !== newHtml) {
    overlay.innerHTML = newHtml;
    overlay.dataset.lastHtml = newHtml;
  }
}

async function handleDiceRoll() {
  const roll = Math.floor(Math.random() * 100) + 1;
  const me = window.myRole || "player1";
  state.matchData.dice[me] = roll;
  // matchData ロックなし — 保存後すぐ syncLoop で最新値を取得
  addGameLog(`[DICE] ${window.myUsername || me} がダイスを振りました: ${roll}`);
  if (typeof saveImmediate === "function") await saveImmediate();
  if (typeof syncLoop === "function") syncLoop();
  update();
}

async function handleResetDice() {
  state.matchData.dice = { player1: null, player2: null };
  state.matchData.diceTimeLeft = 30;
  state.matchData.choiceTimeLeft = 15;
  if (typeof saveImmediate === "function") await saveImmediate();
  if (typeof syncLoop === "function") syncLoop();
  update();
}

async function handleChooseOrder(goFirst) {
  // ClockSync が完了していなければ待つ（endTimestamp の精度を保証）
  if (typeof ClockSync !== "undefined" && !ClockSync.isSynced()) {
    await ClockSync.sync(3);
  }

  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";

  state.matchData.turnPlayer = goFirst ? me : op;
  state.matchData.firstPlayer = state.matchData.turnPlayer;
  state.matchData.status = "playing";
  state.matchData.round = 1;
  state.matchData.turn = 1;

  // ホストがターン開始タイムスタンプを設定
  // state[tp].timeLeft は表示キャッシュなので参照しない
  // 初期値は BASE_INITIAL_STATE.timeLeft から取得
  const tp = state.matchData.turnPlayer;
  const timeLeftMs = (state[tp].timeLeft > 0 ? state[tp].timeLeft : BASE_INITIAL_STATE.timeLeft) * 1000;
  const endTs = GameTimer.start(tp, timeLeftMs, 1);
  state.matchData[tp + '_endTimestamp'] = endTs;
  state.matchData[tp + '_timerSeq']     = 1;

  addGameLog(`[MATCH] 試合開始！先攻: ${tp === "player1" ? (state.player1.username || "P1") : (state.player2.username || "P2")}`);
  if (typeof saveImmediate === "function") await saveImmediate();
  if (typeof syncLoop === "function") syncLoop();
  update();
}

async function handleTurnEnd() {
  const m = state.matchData;
  const me = window.myRole || "player1";
  if (m.turnPlayer !== me) return;
  if (m.winner) return; // 勝敗確定後は無効

  // 1. 旧タイマーを先に停止（タイムアップ判定との競合を防ぐ）
  GameTimer.stop(me);

  // 2. ターン変更
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

  // 3. 新タイマー開始
  const nextTp = m.turnPlayer;
  const nextTimeMs = (state[nextTp].timeLeft > 0 ? state[nextTp].timeLeft : BASE_INITIAL_STATE.timeLeft) * 1000;
  const nextSeq = (m[nextTp + '_timerSeq'] || 0) + 1;
  const endTs = GameTimer.start(nextTp, nextTimeMs, nextSeq);
  m[nextTp + '_endTimestamp'] = endTs;
  m[nextTp + '_timerSeq']     = nextSeq;

  // 4. 保存・同期
  addGameLog(`[TURN] ${window.myUsername || me} がターンを終了しました。次は ${m.turnPlayer} のターンです。`);
  if (typeof saveImmediate === "function") await saveImmediate();
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

      // 初回接続時にもダイスロールを強制表示（進行中でなければ）
      if (state.matchData && state.matchData.status !== "setup_dice" && !state.matchData.winner) {
        state.matchData.status = "setup_dice";
        state.matchData.dice = { player1: null, player2: null };
        state.matchData.diceTimeLeft = 30;
      }

      markGameStarted();
      save();
      addGameLog(`${window.myUsername || window.myRole} が入室しました。`);
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

    // 初期状態の保存（ホスト側が最初に行う）
    setTimeout(async () => {
      if (!window.initialState) {
        const initData = {
          gameState: JSON.parse(JSON.stringify(state)),
          fieldCards: []
        };
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initialState: initData })
        });
        window.initialState = initData;
      }
    }, 3000);

  } catch (e) {
    console.error("initGame FAILED:", e);
    console.error("Stack:", e.stack);
    const playerEl = document.getElementById("gameUiPlayer");
    if (playerEl) {
      playerEl.innerHTML = `<div class="lorPanel"><div class="statusMessage">対戦UIの初期化に失敗しました: ${e.message}<br><pre style="font-size:10px;color:#f88;white-space:pre-wrap;">${e.stack}</pre></div></div>`;
    }
  }
}

window.addEventListener("cardsReady", () => {
  cardsReadyFired = true;
});

initGame();

// ===== タイマー処理（timerSync.js の rAF ループから呼ばれる） =====
// state.timeLeft への書き込みはここだけ（表示専用）
// GameTimer が唯一の権威。state.timeLeft は読み取り専用の表示キャッシュ。
function onTimerTick() {
  if (!gameReady || !state.matchData) return;
  const m = state.matchData;
  const isTimeEnabled = JSON.parse(localStorage.getItem('settings'))?.timeLimitEnabled !== false;
  if (!isTimeEnabled) return;

  const myRole = window.myRole;
  const opRole = myRole === 'player1' ? 'player2' : 'player1';

  // ===== ダイスフェーズ =====
  if (m.status === 'setup_dice' && !m.winner) {
    const isAuthority = (myRole === 'player1') || (!state.player1.username && myRole === 'player2');
    if (isAuthority) {
      const myDice = m.dice[myRole];
      const opDice = m.dice[opRole];
      const bothRolled = (myDice !== null && opDice !== null);
      if (!bothRolled) {
        // diceTimeLeft は表示用のみ（GameTimer から取得）
        const rem = GameTimer.getDisplayRemainingMs('dice');
        m.diceTimeLeft = rem / 1000;
      } else if (myDice !== opDice) {
        const rem = GameTimer.getDisplayRemainingMs('choice');
        m.choiceTimeLeft = rem / 1000;
      }
    }
    update();
    return;
  }

  // ===== プレイ中 =====
  if (m.status === 'playing' && !m.winner) {
    const tp = m.turnPlayer;
    const isMyTurn = (myRole === tp);

    if (isMyTurn) {
      // 自分のターン：GameTimer の表示値を state に反映（表示専用）
      const remMs = GameTimer.getDisplayRemainingMs(tp);
      state[tp].timeLeft = remMs / 1000;

      // タイムアップ検出（真の残り時間で判定）
      if (GameTimer.isExpired(tp)) {
        GameTimer.stop(tp);
        state.matchData.winner = (tp === 'player1' ? 'player2' : 'player1');
        addGameLog(`[TIME OVER] ${state[tp].username || tp} が時間切れにより敗北しました。`);
        saveImmediate();
      }
    } else {
      // 相手のターン：GameTimer の表示値（lerp補正済み）を state に反映（表示専用）
      const remMs = GameTimer.getDisplayRemainingMs(opRole);
      state[opRole].timeLeft = remMs / 1000;
    }

    if (typeof updateMatchUI === "function") updateMatchUI();
  }
}
