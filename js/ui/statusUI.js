function barPct(current, max) {
  if (!max) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

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

function renderLevelRow(owner) {
  const s = state[owner];
  return `
  <div class="statLevelWrap">
    <span class="statNumLabel">Lv</span>
    <input class="statLevelInput" type="number" value="${s.level}"
      data-owner="${owner}" data-key="level" data-type="val">
  </div>`;
}

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

  const handCount = (typeof countOwnerHandCardsOnField === "function") ? countOwnerHandCardsOnField(owner) : 0;
  const handLimit = (typeof window.getHandLimit === "function") ? window.getHandLimit(owner) : 6;

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
      <div class="lorStatRow lorHpRow">
        <span class="lorIcon" data-tooltip="HP">${ICON_HP}</span>
        <div class="lorBarOuter lorHpBarOuter">
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
        <span class="lorIcon" data-tooltip="合計防御力">${ICON_SLD}</span>
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
      ${lorInstantDefStatRow(owner, s)}
      ${isMine ? `
        <div class="lorActionGroup">
          <button class="lorInstantDefBtn" data-owner="${owner}" data-action="addInstantDef" type="button">瞬間防御</button>
          <button class="lorResetDefBtn" data-owner="${owner}" data-action="resetDefense" type="button" title="防御解除">解除</button>
        </div>
      ` : ""}
    </div>

  </div>
  
  <div style="display:flex; flex-direction:column; gap:8px;">
  ${s.evolutionPath ? `
  <div class="evoPanelWrapper" data-owner="${owner}" style="position:relative;">
    <div class="evoPanel" style="
      background: rgba(10,8,20,0.85); border: 1px solid #5a4b27; border-radius: 8px;
      padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 120px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    ">
      <div style="font-size:12px; color:#aaa; letter-spacing:1px; margin-bottom:4px;">進化の道</div>
      <div class="evoPanelTitle" data-owner="${owner}" style="font-size:18px; font-weight:bold; color:#f0d080; text-align:center; cursor:pointer; letter-spacing:0.4px;" title="クリックで拡大表示">${s.evolutionPath}</div>
      ${s.evolutionPath === '継続の道' ? `<div style="font-size:12px; color:#ddd; margin-top:4px;">今ターン発動: ${s.evoContinuousDmgCount || 0}回</div>` : ""}
      ${s.evolutionPath === '背水の道' ? `<div style="font-size:12px; color:#ddd; margin-top:4px;">追加EXP: ${s.evoBackwaterExpGained ? '<span style="color:#f88;">獲得済</span>' : '<span style="color:#8f8;">未獲得</span>'}</div>` : ""}
    </div>
    <div class="evoPopup" style="
      position: absolute; ${owner === window.myRole ? 'bottom: 100%; margin-bottom: 0; padding-bottom: 8px;' : 'top: 100%; margin-top: 0; padding-top: 8px;'} 
      left: 50%; transform: translateX(-50%); width: 420px;
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

function countOwnerHandCardsOnField(owner) {
  const c = typeof getFieldContent === "function" ? getFieldContent() : null;
  if (!c) return 0;
  const handMin = (typeof window.HAND_ZONE_Y_MIN === "number") ? window.HAND_ZONE_Y_MIN : 1460;
  const handMaxTop = FIELD_H - handMin; // 2000 - 1460 = 540
  
  return Array.from(c.querySelectorAll(".card:not(.deckObject)")).filter(
    (el) => {
      if (el.dataset.owner !== owner) return false;
      // ゾーン（アタッカー/スキル/墓地）に配置されているカードは除外
      if (el.dataset.zoneType) return false;

      const y = Number(el.dataset.y);
      if (Number.isFinite(y)) {
        // Player 1 の手札エリア (下部) または Player 2 の手札エリア (上部) にあるか判定
        if (owner === "player1" && y >= handMin) return true;
        if (owner === "player2" && y <= handMaxTop) return true;
      }
      // dataset.y が欠落/不正でも、手札整列済みカードは handOrder を持つため手札として扱う
      return Number.isFinite(Number(el.dataset.handOrder));
    }
  ).length;
}

function getHandLimit(owner) {
  const s = state[owner];
  if (!s) return 6;
  let limit = 6;
  if (s.evolutionPath === "忍耐の道") {
    limit += 2;
    if ((Number(s.level) || 1) >= 6) limit += 1;
  }
  return limit;
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

function lorLucide(name, cls = "") {
  const extra = cls ? ` ${cls}` : "";
  return `<i data-lucide="${name}" class="lorLucide${extra}" width="20" height="20"></i>`;
}

function lorInstantDefStatRow(owner, s) {
  const isEditable = window.devMode;
  const val = Number(s.instantDef) || 0;
  return `
  <div class="lorChip lorIdefChip" data-tooltip="瞬間防御力">
    <span class="lorChipIcon">${lorLucide("shield-alert", "lorLxIdef")}</span>
    ${isEditable ? `
      <input class="lorChipInput" type="number" value="${val}"
        data-owner="${owner}" data-key="instantDef" data-type="val"
        style="width:40px;background:none;border:none;color:inherit;font-family:inherit;font-size:inherit;text-align:center;padding:0;">
    ` : `
      <span class="lorChipVal">${val}</span>
    `}
  </div>`;
}

function updateFieldStatusPanels() {
  const content = (typeof getFieldContent === "function")
    ? getFieldContent()
    : document.getElementById("fieldContent");

  if (!content) return;

  ["player1", "player2"].forEach(owner => {
    const isMine = owner === (window.myRole || "player1");
    const id = `fieldStatusPanel_${owner}`;

    let el = document.getElementById(id);

    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.className = "fieldStatusPanel";

      el.style.cssText = `
        position: absolute;
        width: 660px;
        padding: 36px;
        background: rgba(15, 12, 28, 0.92);
        border: 3px solid #c7b377;
        border-radius: 24px;
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        z-index: 50;
        font-family: 'Outfit', sans-serif;
        pointer-events: auto;
      `;

      content.appendChild(el);
    }

    const s = state[owner];

    const handLimit =
      (typeof window.getHandLimit === "function")
        ? window.getHandLimit(owner)
        : 6;

    const currentPp = s.pp || 0;
    const maxPp = s.ppMax || 2;

    // 位置調整
    if (isMine) {
      el.style.left = "40px";
      el.style.top = "1180px";
      el.style.transform = "scale(1)";
      el.style.transformOrigin = "top left";
    } else {
      el.style.left = "2300px";
      el.style.top = "540px";
      el.style.transform = "scale(0.8)";
      el.style.transformOrigin = "top right";
    }

    el.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="color: #aaa; font-size: 32px; font-weight: 200; letter-spacing: 4px;">
            PP
          </span>

          <div style="display: flex; align-items: center; gap: 18px;">
            ${isMine
              ? `<button class="lorSmBtn"
                  data-owner="${owner}"
                  data-key="pp"
                  data-delta="-1"
                  style="width:60px;height:60px;padding:0;cursor:pointer;font-size:32px;">
                  −
                </button>`
              : ""}

            <span style="color: #00ffff; font-size: 64px; font-weight: bold; min-width: 140px; text-align: center;">
              ${currentPp}/${maxPp}
            </span>

            ${isMine
              ? `<button class="lorSmBtn"
                  data-owner="${owner}"
                  data-key="pp"
                  data-delta="1"
                  style="width:60px;height:60px;padding:0;cursor:pointer;font-size:32px;">
                  ＋
                </button>`
              : ""}
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="color: #aaa; font-size: 32px; font-weight: 200; letter-spacing: 4px;">
            手札
          </span>

          <span style="
            color: ${s.handCount > handLimit ? '#ff6666' : '#f0d080'};
            font-size: 64px;
            font-weight: bold;
            min-width: 140px;
            text-align: center;
          ">
            ${s.handCount} / ${handLimit}
          </span>
        </div>
      </div>
    `;
  });
}

window.getHandLimit = getHandLimit;

const ICON_BARRIER = lorLucide("orbit", "lorLxBarrier");
const ICON_HP = lorLucide("heart", "lorLxHp");
const ICON_SLD = lorLucide("shield", "lorLxDefTot");
const ICON_ATK = lorLucide("sword", "lorLxAtk");
const ICON_DEF = lorLucide("shield-ellipsis", "lorLxDef");
