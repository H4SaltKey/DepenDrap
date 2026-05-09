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
        row.addEventListener("pointerenter", (e) => {
          if(currentSub){ currentSub.remove(); currentSub = null; }
        });
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
  
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole || "player1");
  const content = (typeof getFieldContent === "function") ? getFieldContent() : null;
  const deckObj = content ? content.querySelector(`.deckObject[data-owner="${me}"]`) : null;
  
  let isOverdraw = false;
  let actual = count;
  if (count > dState.deck.length) {
    console.warn(`[drawMultiple] オーバードロー: ${count}枚引こうとしましたが、デッキは${dState.deck.length}枚しかありません。敗北判定を実行します。`);
    actual = dState.deck.length;
    isOverdraw = true;
  }

  const handY = 1600; // 手札エリアのY座標
  const deckX = deckObj ? Number(deckObj.dataset.x) : 0;
  const deckY = deckObj ? Number(deckObj.dataset.y) : 0;
  
  for(let i = 0; i < actual; i++){
    let rawId = dState.deck.pop();
    if(!rawId) continue;

    let isTemp = false;
    if (typeof rawId === "string" && rawId.startsWith("TEMP:")) {
      isTemp = true;
      rawId = rawId.replace("TEMP:", "");
    }

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
      // アニメーション用にいったんデッキ位置に置く
      card.style.left = deckX + "px";
      card.style.top = deckY + "px";
      card.dataset.y = 1600; // organizeHandsの対象になるようにフェイク設定
      placeCard(document.getElementById("field"), card, { x: deckX, y: 1600 });
    }
  }

  // ここで整理して目的地のleft/topをセット
  if (typeof window.organizeHands === "function") window.organizeHands();

  // 目的地の座標を取得してアニメーション
  const field = document.getElementById("field");
  if (field) {
    const cards = Array.from(field.querySelectorAll(".card:not(.deckObject)"));
    cards.forEach(card => {
      if (card.dataset.y == 1600 && card.dataset.owner === me) { // 今回ドローされたカード
        const destX = parseFloat(card.style.left) || deckX;
        const destY = parseFloat(card.style.top) || 1600;
        card.animate([
          { transform: `translate(${deckX - destX}px, ${deckY - destY}px) scale(0.5)`, opacity: 0 },
          { transform: `translate(0, 0) scale(1.1)`, opacity: 1, offset: 0.8 },
          { transform: `translate(0, 0) scale(1)`, opacity: 1 }
        ], { duration: 500, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' });
      }
    });
  }

  if (isOverdraw) {
    if (typeof addGameLog === "function") {
      addGameLog(`[DEFEAT] ${window.myUsername || "プレイヤー"} はデッキ枚数を超えてドローしようとしました（${count}枚 > 引けた枚数${actual}枚）。敗北です。`);
    }
    if (typeof triggerOverdrawDefeat === "function") {
      setTimeout(() => triggerOverdrawDefeat(), 500);
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
  if(typeof pushMyStateDebounced === "function") pushMyStateDebounced(); // デッキ枚数を同期
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
    hp_reduce: "HP減少",
    direct_attack: "直接攻撃"
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
  if (type === "direct_attack") desc = "直接の攻撃によるダメージ";

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
        if (tBarrier > 0) tBarrier--;
        else tHP = Math.max(0, tHP - 1);
      } else if (type === "arcana") {
        if (tBarrier > 0) {
          tBarrier--;
        } else {
          tShield = Math.max(0, tShield - 1);
          tHP = Math.max(0, tHP - 1);
        }
      } else if (type === "damage" || type === "direct_attack") {
        if (tBarrier > 0) tBarrier--;
        else if (tShield > 0) tShield--;
        else tHP = Math.max(0, tHP - 1);
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
    { label: "直接攻撃", action: () => showDamagePopup(targetOwner, "direct_attack", "none") },
    { label: "貫通ダメージ", sub: makeSubTypeBranch("pierce") },
    { label: "脆弱ダメージ", sub: makeSubTypeBranch("fragile") },
    { label: "アルカナダメージ", sub: makeSubTypeBranch("arcana") },
    { label: "HPを減らす", action: () => showDamagePopup(targetOwner, "hp_reduce", "none") }
  ];

  buildMenu(items, x, y);
}

// ダメージ適用ロジック
window.applyCalculatedDamage = function(targetOwner, type, subType, amount, isEvoDmg = false) {
  const s = state[targetOwner];
  if (!s) return;

  const actor = state[window.myRole]?.username || "Player";
  const victim = s.username || targetOwner;
  const typeLabels = {
    damage: "ダメージ",
    pierce: "貫通ダメージ",
    fragile: "脆弱ダメージ",
    arcana: "アルカナダメージ",
    hp_reduce: "HP減少",
    direct_attack: "直接攻撃"
  };
  const subLabels = {
    normal: "通常",
    additional: "追加",
    none: ""
  };
  
  let actualAmount = amount;
  
  // 瞬発の道: 一撃で6以上のダメージを与える時、その直前にzの脆弱ダメージ
  const meRole = window.myRole || "player1";
  const myState = state[meRole];
  if (!isEvoDmg && actualAmount >= 6 && myState && myState.evolutionPath === '瞬発の道') {
    const lv = myState.level || 1;
    let idx = 0;
    if (lv >= 6) idx = 3;
    else if (lv >= 5) idx = 2;
    else if (lv >= 3) idx = 1;
    const zArr = [1, 3, 4, 6];
    const z = zArr[idx];
    
    s.shield = Math.max(0, s.shield - z);
    if (typeof addGameLog === "function") {
      addGameLog(`[EVOLUTION] ${actor} の「瞬発の道」効果！ 直前に ${z} の脆弱ダメージを与えた！`);
    }
  }

  // 「直接攻撃」の処理と、背水の道効果の適用
  if (type === "direct_attack") {
    const meRole = window.myRole || "player1";
    const myState = state[meRole];
    if (myState && myState.evolutionPath === '背水の道') {
      const handCount = window.prevMyHandCount !== undefined ? window.prevMyHandCount : 0;
      if (handCount <= 2) {
        actualAmount += 1;
        if (typeof addGameLog === "function") {
          addGameLog(`[EVOLUTION] ${actor} の「背水の道」効果により、直接攻撃ダメージが +1 されました！`);
        }
      }
      
      if (myState.pp >= 2) {
        if (!myState.evoBackwaterExpGained) {
          const lv = myState.level || 1;
          let idx = 0;
          if (lv >= 6) idx = 3;
          else if (lv >= 5) idx = 2;
          else if (lv >= 3) idx = 1;
          const tArr = [1, 2, 3, 4];
          const t = tArr[idx];
          
          actualAmount += t;
          myState.exp += 1;
          myState.evoBackwaterExpGained = true;
          
          if (typeof addGameLog === "function") {
            addGameLog(`[EVOLUTION] ${actor} の「背水の道」効果（PP2以上）により、与ダメージが +${t} され、経験値1を獲得しました！`);
          }
          if (typeof applyLevelStats === "function") applyLevelStats(meRole, true);
        }
      }
    }
  }
  
  // ダメージを1ずつ処理する（途中でリバウンドが発生する可能性があるため）
  for (let i = 0; i < actualAmount; i++) {
    if (type === "hp_reduce") {
      s.hp = Math.max(0, s.hp - 1);
    } else if (type === "fragile") {
      s.shield = Math.max(0, s.shield - 1);
    } else if (type === "pierce") {
      if (s.barrier > 0) {
        s.barrier -= 1;
      } else {
        s.hp = Math.max(0, s.hp - 1);
      }
    } else {
      // 通常/追加/アルカナ/直接攻撃
      if (s.shield > 0) {
        // 防御力がある場合は防御力を減らす
        s.shield -= 1;
      } else {
        // 防御力が0の場合
        if (type === "damage" || type === "direct_attack") {
          // 通常ダメージならリバウンド特性発動
          s.shield = s.shieldMax || 0;
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
    if (!window._turnDmgHistory) window._turnDmgHistory = {};
    const thKey = `${actor}->${victim}`;
    if (!window._turnDmgHistory[thKey]) window._turnDmgHistory[thKey] = { total: 0, count: 0 };
    
    // このダメージ自体の記録
    window._turnDmgHistory[thKey].total += actualAmount;
    window._turnDmgHistory[thKey].count += 1;
    const stats = window._turnDmgHistory[thKey];
    
    window.addGameLog(`【${fullType}】${actor} が ${victim} に ${actualAmount} ダメージ！ (今ターン計: ${stats.total}ダメ/${stats.count}回)`);
  }

  // 継続の道: 1以上のダメージを与える度に1ダメージ（3回目は1貫通ダメージ）
  const meRole = window.myRole || "player1";
  const myState2 = state[meRole];
  if (!isEvoDmg && actualAmount >= 1 && myState2 && myState2.evolutionPath === '継続の道') {
    const lv = myState2.level || 1;
    let idx = 0;
    if (lv >= 6) idx = 3;
    else if (lv >= 5) idx = 2;
    else if (lv >= 3) idx = 1;
    const yArr = [1, 3, 4, 6];
    const y = yArr[idx];
    
    if ((myState2.evoContinuousDmgCount || 0) < y) {
      myState2.evoContinuousDmgCount = (myState2.evoContinuousDmgCount || 0) + 1;
      const isThird = myState2.evoContinuousDmgCount === 3;
      if (typeof window.addGameLog === "function") {
        window.addGameLog(`[EVOLUTION] ${actor} の「継続の道」効果発動（${myState2.evoContinuousDmgCount}回目）！`);
      }
      // 再帰呼び出しで進化ダメージを適用（isEvoDmg=true）
      window.applyCalculatedDamage(targetOwner, isThird ? "pierce" : "damage", "additional", 1, true);
    }
  }

  // Firebase 同期
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (targetOwner === me) {
    // 自分のステータス → 自分のパスに直接書く
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  } else {
    // 相手のステータス → 確定後の値を pendingChange 経由で送る
    // hp/barrier/shield の確定値をまとめて送信
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && window.firebaseClient?.db) {
      window.firebaseClient.sendChangeRequest(gameRoom, me, targetOwner, "_bulk", "set", {
        hp: s.hp,
        barrier: s.barrier,
        shield: s.shield,
        shieldOverMax: s.shieldOverMax || false
      });
    }
  }

  // ダメージ処理からの更新なので、ログチェックをスキップ（既にログは出力済み）
  if (typeof update === "function") update(true);
};
function getContextMenuTarget(target){
  if(!target || typeof target.closest !== "function") return null;
  const card = target.closest(".card:not(.deckObject)");
  if(card) return { type: "card", el: card };
  const deck = target.closest(".deckObject");
  if(deck) return { type: "deck", el: deck };
  const lorPanel = target.closest(".lorPanel");
  if(lorPanel) return { type: "lorPanel", el: lorPanel };
  return null;
}

function openGameContextMenu(hit, x, y){
  if(!hit) return;
  if(hit.type === "card") openCardMenu(hit.el, x, y);
  else if(hit.type === "deck") openDeckMenu(hit.el, x, y);
  else if(hit.type === "lorPanel") openStatusMenu(hit.el.dataset.owner, x, y);
}

document.addEventListener("mousedown", (e) => {
  if(e.button !== 2) return;
  const hit = getContextMenuTarget(e.target);
  if(hit){
    console.log("[ctx-debug:mousedown]", e.button, e.target);
  }
});

document.addEventListener("contextmenu", (e) => {
  const hit = getContextMenuTarget(e.target);
  if(hit){
    console.log("[ctx-debug:contextmenu]", e.button, e.target);
    e.preventDefault();
    openGameContextMenu(hit, e.clientX, e.clientY);
  }
});

})();
