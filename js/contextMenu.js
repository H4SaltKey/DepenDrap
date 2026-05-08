// ===== 右クリックコンテキストメニュー =====

(function(){

const menuEl = document.createElement("div");
menuEl.id = "ctxMenu";
menuEl.classList.add("hidden");
document.body.appendChild(menuEl);

const style = document.createElement("style");
style.textContent = `
  #ctxMenu {
    position: fixed;
    background: #222;
    color: white;
    border: 1px solid #555;
    border-radius: 4px;
    z-index: 99999;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    user-select: none;
    font-size: 13px;
  }
  #ctxMenu.hidden { display: none !important; }

  .ctxItem {
    padding: 8px 14px;
    cursor: pointer;
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .ctxItem:hover { background: #444; }
  .ctxItem.disabled { color: #777; cursor: default; }
  .ctxItem.disabled:hover { background: transparent; }
  .ctxSep {
    height: 1px;
    background: #444;
    margin: 3px 0;
  }
  .ctxArrow { font-size: 10px; color: #aaa; }

  .ctxSub {
    position: fixed;
    background: #222;
    color: white;
    border: 1px solid #555;
    border-radius: 4px;
    z-index: 100000;
    min-width: 80px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    font-size: 13px;
  }
  .ctxSub.hidden { display: none !important; }
  .ctxSub .ctxItem { padding: 7px 14px; }
`;
document.head.appendChild(style);

let currentSub = null;

function closeMenu() {
  menuEl.classList.add("hidden");
  if(currentSub){ currentSub.remove(); currentSub = null; }
}

function buildMenu(items, x, y, el){
  menuEl.innerHTML = "";
  menuEl.classList.remove("hidden");

  items.forEach(item => {
    if(item.sep){
      const sep = document.createElement("div");
      sep.className = "ctxSep";
      menuEl.appendChild(sep);
      return;
    }

    const row = document.createElement("div");
    row.className = "ctxItem" + (item.disabled ? " disabled" : "");
    row.innerHTML = `<span>${item.label}</span>${item.sub ? '<span class="ctxArrow">▶</span>' : ""}`;

    if(!item.disabled){
      if(item.sub){
        row.addEventListener("pointerenter", (e) => {
          if(currentSub){ currentSub.remove(); currentSub = null; }
          const sub = document.createElement("div");
          sub.className = "ctxSub";
          item.sub.forEach(subItem => {
            const subRow = document.createElement("div");
            subRow.className = "ctxItem";
            subRow.textContent = subItem.label;
            subRow.addEventListener("pointerdown", (e) => {
              e.stopPropagation();
              closeMenu();
              subItem.action();
            });
            sub.appendChild(subRow);
          });
          document.body.appendChild(sub);
          currentSub = sub;

          // サブメニューの位置
          const rowRect = row.getBoundingClientRect();
          let sx = rowRect.right;
          let sy = rowRect.top;
          // 画面右端チェック
          if(sx + 100 > window.innerWidth) sx = rowRect.left - 100;
          sub.style.left = sx + "px";
          sub.style.top  = sy + "px";
        });
      } else {
        row.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          closeMenu();
          item.action();
        });
      }
    }

    menuEl.appendChild(row);
  });

  // 位置調整
  let mx = x, my = y;
  menuEl.style.left = "0px";
  menuEl.style.top  = "0px";
  const mw = menuEl.offsetWidth;
  const mh = menuEl.offsetHeight;
  if(mx + mw > window.innerWidth)  mx = window.innerWidth  - mw - 4;
  if(my + mh > window.innerHeight) my = window.innerHeight - mh - 4;
  menuEl.style.left = mx + "px";
  menuEl.style.top  = my + "px";
}

// クリック外で閉じる
document.addEventListener("pointerdown", (e) => {
  if(!menuEl.contains(e.target) && (!currentSub || !currentSub.contains(e.target))){
    closeMenu();
  }
});
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape") closeMenu();
});

// ===== カード右クリック =====
function openCardMenu(card, x, y){
  const vis = card.dataset.visibility || "both";
  const items = [
    {
      label: "拡大表示",
      action: () => showCardZoom(card)
    },
    { sep: true },
    {
      label: "自分だけ表示",
      disabled: vis === "self",
      action: () => setCardVisibility(card, "self")
    },
    {
      label: "全体公開",
      disabled: vis === "both",
      action: () => setCardVisibility(card, "both")
    },
    {
      label: "非公開",
      disabled: vis === "none",
      action: () => setCardVisibility(card, "none")
    },
    {
      label: "カードを複製",
      action: () => cloneCard(card)
    },
    { sep: true },
    {
      label: "デッキに戻す",
      disabled: card.dataset.isTemp === "true",
      action: () => {
        card.remove();
        if(typeof saveFieldCards === "function") saveFieldCards();
        if(typeof returnToDeck === "function") returnToDeck(card.dataset.id);
      }
    }
  ];

  if(card.dataset.isTemp === "true"){
    items.push({
      label: "削除 (一時複製)",
      action: () => {
        card.remove();
        if(typeof saveFieldCards === "function") saveFieldCards();
      }
    });
  }
  buildMenu(items, x, y, card);
}

function showCardZoom(card){
  const img = card.querySelector("img");
  if(!img) return;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;
    background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
    z-index:999999;
    overflow:hidden;
    cursor:zoom-in;
  `;

  const zoomImg = document.createElement("img");
  zoomImg.src = img.src;
  zoomImg.style.cssText = `
    max-width:80vw;max-height:80vh;
    object-fit:contain;
    border-radius:8px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
    transition:transform 0.2s;
    user-select:none;
    pointer-events:none;
    flex-shrink:0;
  `;

  // 閉じるボタン
  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    position:fixed;
    top:16px;right:16px;
    width:36px;height:36px;
    background:rgba(0,0,0,0.6);
    color:white;
    border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:18px;
    cursor:pointer;
    z-index:1000000;
    user-select:none;
  `;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.remove();
  });

  overlay.appendChild(zoomImg);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  let zoomed = false;
  let panX = 0, panY = 0;
  let isDragging = false;
  let isLongPress = false;
  let longPressTimer = null;
  let dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanY = 0;
  let pointerDownAt = 0;
  let wasLongOrDrag = false;

  function applyTransform(){
    const s = zoomed ? 2 : 1;
    zoomImg.style.transform = `scale(${s}) translate(${panX/s}px, ${panY/s}px)`;
  }

  overlay.addEventListener("pointerdown", (e) => {
    if(e.target === closeBtn) return;
    isDragging = false;
    isLongPress = false;
    wasLongOrDrag = false;
    pointerDownAt = Date.now();
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    overlay.setPointerCapture(e.pointerId);

    if(zoomed){
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        overlay.style.cursor = "grabbing";
      }, 300);
    }
  });

  overlay.addEventListener("pointermove", (e) => {
    if(!isLongPress) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if(!isDragging && Math.sqrt(dx*dx + dy*dy) > 4) isDragging = true;
    if(!isDragging) return;
    panX = dragStartPanX + dx;
    panY = dragStartPanY + dy;
    applyTransform();
  });

  overlay.addEventListener("pointerup", (e) => {
    clearTimeout(longPressTimer);
    const wasDragging = isDragging;
    const elapsed = Date.now() - pointerDownAt;
    wasLongOrDrag = wasDragging || elapsed >= 300;
    isLongPress = false;
    isDragging = false;
    overlay.style.cursor = zoomed ? "grab" : "zoom-in";
    if(wasDragging) return;
  });

  overlay.addEventListener("click", (e) => {
    if(e.target === closeBtn) return;
    if(wasLongOrDrag) return; // 長押し・ドラッグ後はズームトグルしない
    if(!zoomed){
      zoomed = true;
      applyTransform();
      overlay.style.cursor = "grab";
    } else {
      zoomed = false;
      panX = 0; panY = 0;
      applyTransform();
      overlay.style.cursor = "zoom-in";
    }
  });

  document.addEventListener("keydown", function handler(e){
    if(e.key === "Escape"){
      overlay.remove();
      document.removeEventListener("keydown", handler);
    }
  });
}

function setCardVisibility(card, vis){
  const labels = { both:"", self:"自分のみ", none:"非公開" };
  card.dataset.visibility = vis;
  card.classList.toggle("visibilitySelf",    vis === "self");
  card.classList.toggle("visibilityOpponent", vis === "opponent");
  card.classList.toggle("visibilityNone",    vis === "none");
  const label = card.querySelector(".cardVisibilityLabel");
  if(label) label.textContent = labels[vis] ?? "";
  if(typeof applyCardFace === "function") applyCardFace(card, vis);
  if(typeof saveFieldCards === "function") saveFieldCards();
}

function cloneCard(card){
  if(typeof createCard !== "function") return;
  const newCard = createCard(card.dataset.id);
  if(!newCard) return;

  newCard.dataset.isTemp = "true";
  newCard.dataset.owner = card.dataset.owner;
  newCard.dataset.origin = card.dataset.origin || card.dataset.owner || "player1";
  newCard.dataset.visibility = card.dataset.visibility;
  
  if(typeof cardZCounter !== "undefined") newCard.style.zIndex = ++cardZCounter;
  
  const field = document.getElementById("field");
  const rect = card.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();
  
  // 元のカードの隣に配置
  const nx = Number(card.dataset.x) + 40;
  const ny = Number(card.dataset.y) + 40;
  
  if(typeof placeCard === "function"){
    placeCard(field, newCard, { x: nx, y: ny });
  }
  if(typeof saveFieldCards === "function") saveFieldCards();
}

// ===== デッキ右クリック =====
function openDeckMenu(deck, x, y){
  const remaining = (typeof getMyState !== "undefined" && getMyState()) ? getMyState().deck.length : 0;

  const subDraw = Array.from({length:10}, (_, i) => ({
    label: `${i+1}枚`,
    action: () => drawMultiple(i+1, false)
  }));
  const subDrawBack = Array.from({length:10}, (_, i) => ({
    label: `${i+1}枚`,
    action: () => drawMultiple(i+1, true)
  }));

  const items = [
    {
      label: "1枚引く",
      disabled: remaining === 0,
      action: () => drawMultiple(1, false)
    },
    {
      label: "裏側で1枚引く",
      disabled: remaining === 0,
      action: () => drawMultiple(1, true)
    },
    { sep: true },
    {
      label: "複数枚引く",
      disabled: remaining === 0,
      sub: subDraw
    },
    {
      label: "裏側で複数枚引く",
      disabled: remaining === 0,
      sub: subDrawBack
    },
    { sep: true },
    {
      label: "デッキを全て集める",
      disabled: !getFieldContent() || Array.from(getFieldContent().querySelectorAll(".card:not(.deckObject)"))
        .filter(c => (c.dataset.origin || c.dataset.owner || "player1") === (window.myRole || "player1")).length === 0,
      action: () => collectAllToDeck()
    }
  ];

  if (window.devMode) {
    items.push({ sep: true });
    items.push({
      label: "レベルステータス編集 (Dev)",
      action: () => { if (typeof openLevelStatsEditor === "function") openLevelStatsEditor(); }
    });
  }

  buildMenu(items, x, y, deck);
}

function drawMultiple(count, faceDown){
  if(typeof getMyState === "undefined" || !getMyState()) return;
  const dState = getMyState();
  const actual = Math.min(count, dState.deck.length);
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole || "player1");
  const content = (typeof getFieldContent === "function") ? getFieldContent() : null;
  const deckObj = content ? content.querySelector(`.deckObject[data-owner="${me}"]`) : null;

  for(let i = 0; i < actual; i++){
    let rawId = dState.deck.pop();
    if(!rawId) continue;

    let isTemp = false;
    if (typeof rawId === "string" && rawId.startsWith("TEMP:")) {
      isTemp = true;
      rawId = rawId.replace("TEMP:", "");
    }

    const deckX = deckObj ? Number(deckObj.dataset.x) : -320;
    const deckY = deckObj ? Number(deckObj.dataset.y) : 200;
    const drawX = deckX + 340;

    const card = (typeof createCard === "function") ? createCard(rawId) : null;
    if(!card) continue;

    const vis = faceDown ? "none" : "self";
    card.dataset.visibility = vis;
    card.dataset.owner = me;
    card.dataset.origin = me; 
    if (isTemp) card.dataset.isTemp = "true";

    card.classList.toggle("visibilitySelf", vis === "self");
    card.classList.toggle("visibilityNone",  vis === "none");
    const lbl = card.querySelector(".cardVisibilityLabel");
    if(lbl) lbl.textContent = vis === "self" ? "自分のみ" : "非公開";
    if(typeof applyCardFace === "function") applyCardFace(card, vis);

    if(typeof placeCard === "function"){
      if(typeof cardZCounter !== "undefined") card.style.zIndex = ++cardZCounter;
      placeCard(document.getElementById("field"), card, { x: drawX, y: deckY });
    }
  }

  // 【一括保存】（ステータスとフィールドを同時に送る）
  if (typeof saveAllImmediate === "function") {
    saveAllImmediate();
  } else {
    if (typeof saveImmediate === "function") saveImmediate();
    if (typeof saveFieldCards === "function") saveFieldCards();
  }

  if(typeof updateDeckObject === "function") updateDeckObject();
  if(typeof update === "function") update();
}

function collectAllToDeck(){
  if(typeof getFieldContent === "undefined") return;
  const cards = Array.from(getFieldContent().querySelectorAll(".card:not(.deckObject)"));
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : "player1");
  let collectedCount = 0;

  cards.forEach(card => {
    if(card.dataset.id){
      const originOwner = card.dataset.origin || card.dataset.owner || "player1";
      if (originOwner === me) {
        const isTemp = card.dataset.isTemp === "true";
        const storeId = isTemp ? "TEMP:" + card.dataset.id : card.dataset.id;
        card.remove();
        if(typeof state !== "undefined" && state[me] && state[me].deck){
          state[me].deck.push(storeId);
          collectedCount++;
        }
      }
    }
  });

  if (collectedCount > 0) {
    if(typeof shuffleDeck === "function") shuffleDeck();

    // 【アトミック保存】: ステータス(山札)と現在のフィールド状態を送信
    if (typeof saveAllImmediate === "function") {
      saveAllImmediate();
    } else {
      if (typeof saveImmediate === "function") saveImmediate();
      if (typeof saveFieldCards === "function") saveFieldCards();
    }
  }

  if(typeof updateDeckObject === "function") updateDeckObject();
  if(typeof update === "function") update();
}

function showDamagePopup(targetOwner, type, subType) {
  const typeLabels = {
    damage: "ダメージ",
    pierce: "貫通ダメージ",
    fragile: "脆弱ダメージ",
    arcana: "アルカナダメージ",
    hp_reduce: "HP減少"
  };
  const subLabels = {
    normal: "通常",
    additional: "追加",
    none: ""
  };

  // 説明文の生成
  let desc = "";
  if (type === "damage") desc = "通常のダメージ";
  if (type === "pierce") desc = "防御力を無視";
  if (type === "arcana") desc = "防御突破時のバースト";
  if (type === "hp_reduce") desc = "HPを直に減らす";
  if (type === "fragile") desc = "防御力を減少させる";

  if (subType === "additional") {
    if (type === "damage") desc = "”追加”特性を持つ、通常のダメージ";
    else desc = `”追加”特性を持ち、${desc}する`;
  }

  const fullLabel = typeLabels[type] + (subType !== "none" ? ` (${subLabels[subType]})` : "");
  const targetName = targetOwner === window.myRole ? "自身" : "相手";

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000000;
    backdrop-filter: blur(4px);
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    background: #1a172c; border: 1px solid #c7b377; border-radius: 8px; padding: 20px;
    width: 300px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); color: #e0d0a0; font-family: sans-serif;
  `;
  
  box.innerHTML = `
    <div style="font-size:11px; color:#c7b377; margin-bottom:6px; text-align:center; opacity:0.8;">${targetName}への攻撃</div>
    <div style="font-size:20px; font-weight:bold; margin-bottom:4px; text-align:center; color:#fff;">${fullLabel}</div>
    <div style="font-size:12px; color:#aaa; margin-bottom:20px; text-align:center; font-style:italic;">${desc}</div>
    <div style="margin-bottom:20px; display: flex; align-items: center; gap: 8px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <button id="dmgPopDec5" style="width:36px; height:24px; background:#444; border:1px solid #555; color:#ccc; border-radius:3px; font-size:10px; cursor:pointer;">-5</button>
        <button id="dmgPopDec1" style="width:36px; height:24px; background:#444; border:1px solid #555; color:#ccc; border-radius:3px; font-size:12px; cursor:pointer;">-1</button>
      </div>
      <input type="number" id="popupDmgVal" value="1" min="0" style="
        flex: 1; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid #5a4b27;
        color: #fff; font-size: 24px; text-align: center; border-radius: 4px; box-sizing: border-box; width: 0;
      ">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <button id="dmgPopInc5" style="width:36px; height:24px; background:#444; border:1px solid #555; color:#ccc; border-radius:3px; font-size:10px; cursor:pointer;">+5</button>
        <button id="dmgPopInc1" style="width:36px; height:24px; background:#444; border:1px solid #555; color:#ccc; border-radius:3px; font-size:12px; cursor:pointer;">+1</button>
      </div>
    </div>
    <div id="damagePreview" style="text-align:center; font-size:13px; color:#aaa; margin-bottom:20px; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px; border:1px dashed #5a4b27;">
      HPに与えるダメージ: <span style="font-size:16px; color:#ff4d4d; font-weight:bold;">0</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="popupCancel" style="
        flex: 1; padding: 10px; background: #333; border: 1px solid #555; color: #ccc; cursor: pointer; border-radius: 4px;
      ">キャンセル</button>
      <button id="popupConfirm" style="
        flex: 1; padding: 10px; background: linear-gradient(to bottom, #c7b377, #a88e4a); border: none; color: #1a172c;
        font-weight: bold; cursor: pointer; border-radius: 4px;
      ">確定</button>
    </div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const input = box.querySelector("#popupDmgVal");
  const preview = box.querySelector("#damagePreview");

  function updatePreview() {
    const amount = parseInt(input.value) || 0;
    const s = state[targetOwner];
    if (!s) return;

    // シミュレーション（実際の適用ロジックを模倣）
    let tHP = s.hp;
    let tShield = s.shield;
    let tBarrier = s.barrier;
    let tShieldMax = s.shieldMax || 0;

    for (let i = 0; i < amount; i++) {
      if (type === "hp_reduce") {
        tHP = Math.max(0, tHP - 1);
      } else if (type === "fragile") {
        tShield = Math.max(0, tShield - 1);
      } else if (type === "pierce") {
        if (tBarrier > 0) tBarrier -= 1;
        else tHP = Math.max(0, tHP - 1);
      } else {
        if (tShield > 0) {
          tShield -= 1;
        } else {
          if (type === "damage") tShield = tShieldMax;
          else tShield = 0;
          if (tBarrier > 0) tBarrier -= 1;
          else tHP = Math.max(0, tHP - 1);
        }
      }
    }
    const hpDmg = s.hp - tHP;
    preview.innerHTML = `HPに与えるダメージ: <span style="font-size:18px; color:#ff4d4d; font-weight:bold;">${hpDmg}</span>`;
  }

  input.addEventListener("input", updatePreview);
  updatePreview();

  input.focus();
  input.select();

  const close = () => {
    modal.remove();
  };

  box.querySelector("#popupCancel").onclick = close;
  box.querySelector("#popupConfirm").onclick = () => {
    const val = parseInt(input.value) || 0;
    if (val >= 0) {
      window.applyCalculatedDamage(targetOwner, type, subType, val);
    }
    close();
  };

  const updateVal = (delta) => {
    input.value = Math.max(0, (parseInt(input.value) || 0) + delta);
    updatePreview();
  };
  box.querySelector("#dmgPopDec5").onclick = () => updateVal(-5);
  box.querySelector("#dmgPopDec1").onclick = () => updateVal(-1);
  box.querySelector("#dmgPopInc1").onclick = () => updateVal(1);
  box.querySelector("#dmgPopInc5").onclick = () => updateVal(5);

  input.onkeypress = (e) => {
    if (e.key === "Enter") box.querySelector("#popupConfirm").click();
  };
}

function openStatusMenu(targetOwner, x, y) {
  const makeSubTypeBranch = (typeKey) => {
    return [
      { label: "通常ダメージ", action: () => showDamagePopup(targetOwner, typeKey, "normal") },
      { label: "追加ダメージ", action: () => showDamagePopup(targetOwner, typeKey, "additional") }
    ];
  };

  const targetName = targetOwner === window.myRole ? "自身" : "相手";
  const items = [
    { label: `${targetName}にダメージを与える`, disabled: true },
    { sep: true },
    { label: "ダメージ", sub: makeSubTypeBranch("damage") },
    { label: "貫通ダメージ", sub: makeSubTypeBranch("pierce") },
    { label: "脆弱ダメージ", sub: makeSubTypeBranch("fragile") },
    { label: "アルカナダメージ", sub: makeSubTypeBranch("arcana") },
    { label: "HPを減らす", action: () => showDamagePopup(targetOwner, "hp_reduce", "none") }
  ];

  buildMenu(items, x, y);
}

// ダメージ適用ロジック
window.applyCalculatedDamage = function(targetOwner, type, subType, amount) {
  const s = state[targetOwner];
  if (!s) return;

  const actor = state[window.myRole].username || "Player";
  const victim = s.username || targetOwner;
  const typeLabels = {
    damage: "ダメージ",
    pierce: "貫通ダメージ",
    fragile: "脆弱ダメージ",
    arcana: "アルカナダメージ",
    hp_reduce: "HP減少"
  };
  const subLabels = {
    normal: "通常",
    additional: "追加",
    none: ""
  };

  let logType = `${typeLabels[targetOwner] || typeLabels[type]}${subLabels[subType] ? " (" + subLabels[subType] + ")" : ""}`;
  
  // 同期ロックをかける（サーバーからの古いデータで上書きされるのを防ぐ）
  // ※ Photon 版では _lockSyncUntil は廃止済み。saveImmediate で即時送信する。

  // ダメージを1ずつ処理する（途中でリバウンドが発生する可能性があるため）
  for (let i = 0; i < amount; i++) {
    if (type === "hp_reduce") {
      // HPを減らす: 直接HP
      s.hp = Math.max(0, s.hp - 1);
    } else if (type === "fragile") {
      // 脆弱ダメージ: 防御力(現在値:shield)を0になるまで減らす
      s.shield = Math.max(0, s.shield - 1);
    } else if (type === "pierce") {
      // 貫通ダメージ: 防御力を無視してシールド(barrier) -> HP
      if (s.barrier > 0) {
        s.barrier -= 1;
      } else {
        s.hp = Math.max(0, s.hp - 1);
      }
    } else {
      // 通常/追加/アルカナ
      if (s.shield > 0) {
        // 防御力がある場合は防御力を減らす
        s.shield -= 1;
      } else {
        // 防御力が0の場合
        if (type === "damage") {
          // 通常ダメージならリバウンド特性発動
          s.shield = s.shieldMax;
        } else {
          s.shield = 0;
        }

        // ダメージを次の層（障壁/HP）へ通す
        if (s.barrier > 0) {
          s.barrier -= 1;
        } else {
          s.hp = Math.max(0, s.hp - 1);
        }
      }
    }
  }

  // 最終的な負の値ガード（念のため）
  s.hp = Math.max(0, s.hp);
  s.barrier = Math.max(0, s.barrier);
  s.shield = Math.max(0, s.shield);

  if (window.addGameLog) {
    const fullType = typeLabels[type] + (subType !== "none" ? ` (${subLabels[subType]})` : "");
    window.addGameLog(`【${fullType}】${actor} が ${victim} に ${amount} ダメージ！`);
  }

  if (typeof saveImmediate === "function") {
    saveImmediate();
  } else if (typeof save === "function") {
    save();
  }
  if (typeof update === "function") update();
};
document.addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".card:not(.deckObject)");
  const deck = e.target.closest(".deckObject");
  const lorPanel = e.target.closest(".lorPanel");

  if(card || deck || lorPanel){
    e.preventDefault();
    if(card) openCardMenu(card, e.clientX, e.clientY);
    else if(deck) openDeckMenu(deck, e.clientX, e.clientY);
    else if(lorPanel) openStatusMenu(lorPanel.dataset.owner, e.clientX, e.clientY);
  }
});

})();
