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
let subCloseTimer = null;

function closeMenu() {
  menuEl.classList.add("hidden");
  if(subCloseTimer){ clearTimeout(subCloseTimer); subCloseTimer = null; }
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
        row.addEventListener("pointerleave", () => {
          if(subCloseTimer) clearTimeout(subCloseTimer);
          subCloseTimer = setTimeout(() => {
            if(currentSub){ currentSub.remove(); currentSub = null; }
          }, 120);
        });
        row.addEventListener("pointerenter", (e) => {
          if(subCloseTimer){ clearTimeout(subCloseTimer); subCloseTimer = null; }
          if(currentSub){ currentSub.remove(); currentSub = null; }
          const sub = document.createElement("div");
          sub.className = "ctxSub";
          sub.addEventListener("pointerenter", () => {
            if(subCloseTimer){ clearTimeout(subCloseTimer); subCloseTimer = null; }
          });
          sub.addEventListener("pointerleave", () => {
            if(subCloseTimer) clearTimeout(subCloseTimer);
            subCloseTimer = setTimeout(() => {
              if(currentSub){ currentSub.remove(); currentSub = null; }
            }, 120);
          });
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
  const firstDrawOnly =
    typeof state !== "undefined" &&
    state?.matchData?.status === "setup_first_draw";
  if (firstDrawOnly) {
    buildMenu([
      {
        label: "拡大表示",
        action: () => showCardZoom(card)
      }
    ], x, y, card);
    return;
  }

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

  // ゾーン内のカードの場合、「内容確認」メニューを追加
  if (card.dataset.zoneType === "skill" || card.dataset.zoneType === "attacker" || card.dataset.zoneType === "grave") {
    items.splice(2, 0, {
      label: "内容確認 (この場)",
      action: () => {
        if (typeof window.showZoneInspectorModal === "function") {
          window.showZoneInspectorModal(card.dataset.owner, card.dataset.zoneType);
        }
      }
    });
    items.splice(3, 0, { sep: true });
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
    action: () => drawCards(i+1)
  }));
  const subIncreaseHand = Array.from({length:10}, (_, i) => ({
    label: `${i+1}枚`,
    action: () => drawToHand(i+1)
  }));
  const subTakeOut = Array.from({length:10}, (_, i) => ({
    label: `${i+1}枚`,
    action: () => takeOut(i+1)
  }));

  const items = [
    {
      label: "カードを引く",
      disabled: remaining === 0,
      sub: subDraw
    },
    {
      label: "手札を増やす",
      disabled: remaining === 0,
      sub: subIncreaseHand
    },
    {
      label: "取り出す",
      disabled: remaining === 0,
      sub: subTakeOut
    },
    { sep: true },
    {
      label: "全て集める",
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

function drawCards(count){
  if(typeof getMyState === "undefined" || !getMyState()) return;
  const dState = getMyState();
  
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole || "player1");
  const content = (typeof getFieldContent === "function") ? getFieldContent() : null;
  const deckObj = content ? content.querySelector(`.deckObject[data-owner="${me}"]`) : null;
  
  let isOverdraw = false;
  let actual = count;
  if (count > dState.deck.length) {
    console.warn(`[drawCards] オーバードロー: ${count}枚引こうとしましたが、デッキは${dState.deck.length}枚しかありません。敗北判定を実行します。`);
    actual = dState.deck.length;
    isOverdraw = true;
  }

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

    const vis = "self";
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
      card.style.left = deckX + "px";
      card.style.top = deckY + "px";
      const nextOrder = (typeof window.nextHandOrder === "function") ? window.nextHandOrder() : (Date.now() + i);
      card.dataset.handOrder = String(nextOrder);
      placeCard(document.getElementById("field"), card, { x: deckX, y: deckY });
      card.dataset.y = String(typeof window.HAND_ZONE_Y_MIN === "number" ? window.HAND_ZONE_Y_MIN + 40 : 1520);
    }
  }

  dState.pp = Math.min((Number(dState.pp) || 0) + actual, Number(dState.ppMax) || 2);
  if (typeof addGameLog === "function") {
    const afterPp = Number(dState.pp) || 0;
    const beforePp = Math.max(0, afterPp - actual);
    const playerName = window.myUsername || me;
    addGameLog(`[システム] ${playerName} のPP: ${beforePp} → ${afterPp}`);
  }

  if (typeof window.organizeHands === "function") window.organizeHands();

  const field = document.getElementById("field");
  if (field) {
    const cards = Array.from(field.querySelectorAll(".card:not(.deckObject)"));
    cards.forEach(card => {
      if (card.dataset.owner === me && Number(card.dataset.y) >= 1500) {
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

  if (typeof addGameLog === "function") {
    const playerName = window.myUsername || me;
    addGameLog(`${playerName} が カードを${actual}枚引いた`);
  }

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

function drawToHand(count){
  if(typeof getMyState === "undefined" || !getMyState()) return;
  const dState = getMyState();
  
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole || "player1");
  const content = (typeof getFieldContent === "function") ? getFieldContent() : null;
  const deckObj = content ? content.querySelector(`.deckObject[data-owner="${me}"]`) : null;
  
  let isOverdraw = false;
  let actual = count;
  if (count > dState.deck.length) {
    console.warn(`[drawToHand] オーバードロー: ${count}枚引こうとしましたが、デッキは${dState.deck.length}枚しかありません。敗北判定を実行します。`);
    actual = dState.deck.length;
    isOverdraw = true;
  }

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

    const vis = "self";
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
      // デッキ位置から手札へ移動する演出
      card.style.left = deckX + "px";
      card.style.top = deckY + "px";
      const nextOrder = (typeof window.nextHandOrder === "function") ? window.nextHandOrder() : (Date.now() + i);
      card.dataset.handOrder = String(nextOrder);
      placeCard(document.getElementById("field"), card, { x: deckX, y: deckY });
      card.dataset.y = String(typeof window.HAND_ZONE_Y_MIN === "number" ? window.HAND_ZONE_Y_MIN + 40 : 1520);
    }
  }

  // ドロー直後に自動で手札整列
  if (typeof window.organizeHands === "function") window.organizeHands();

  // 目的地の座標を取得してアニメーション
  const field = document.getElementById("field");
  if (field) {
    const cards = Array.from(field.querySelectorAll(".card:not(.deckObject)"));
    cards.forEach(card => {
      if (card.dataset.owner === me && Number(card.dataset.y) >= 1500) {
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

  // チャット記録
  if (typeof addGameLog === "function") {
    const playerName = window.myUsername || me;
    addGameLog(`${playerName} が 手札を${actual}枚増やした`);
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

/**
 * @param {number} count
 * @param {{ visibility?: "none"|"self", hideSelfVisibilityLabel?: boolean }} [opts] 省略時は "none"。ファーストドローは { visibility: "self", hideSelfVisibilityLabel: true } など
 */
function takeOut(count, opts){
  opts = opts || {};
  const visMode = opts.visibility === "self" ? "self" : "none";
  const hideSelfLabel = !!opts.hideSelfVisibilityLabel && visMode === "self";
  if(typeof getMyState === "undefined" || !getMyState()) return;
  const dState = getMyState();
  
  const me = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole || "player1");
  const content = (typeof getFieldContent === "function") ? getFieldContent() : null;
  const deckObj = content ? content.querySelector(`.deckObject[data-owner="${me}"]`) : null;
  
  let isOverdraw = false;
  let actual = count;
  if (count > dState.deck.length) {
    console.warn(`[takeOut] オーバードロー: ${count}枚引こうとしましたが、デッキは${dState.deck.length}枚しかありません。敗北判定を実行します。`);
    actual = dState.deck.length;
    isOverdraw = true;
  }

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

    const vis = visMode;
    card.dataset.visibility = vis;
    card.dataset.owner = me;
    card.dataset.origin = me; 
    if (isTemp) card.dataset.isTemp = "true";

    card.classList.toggle("visibilitySelf", vis === "self");
    card.classList.toggle("visibilityNone",  vis === "none");

    const lbl = card.querySelector(".cardVisibilityLabel");
    if(lbl) lbl.textContent = vis === "self" ? "自分のみ" : "非公開";
    if (hideSelfLabel) card.classList.add("firstDrawHideVisLabel");
    if(typeof applyCardFace === "function") applyCardFace(card, vis);

    if(typeof placeCard === "function"){
      if(typeof cardZCounter !== "undefined") card.style.zIndex = ++cardZCounter;
      // デッキ位置から盤面へ配置（手札へは移動しない）
      card.style.left = deckX + "px";
      card.style.top = deckY + "px";
      placeCard(document.getElementById("field"), card, { x: deckX + 100 + i * 50, y: deckY - 100 });
    }
  }

  if (isOverdraw) {
    if (typeof addGameLog === "function") {
      addGameLog(`[DEFEAT] ${window.myUsername || "プレイヤー"} はデッキ枚数を超えてドローしようとしました（${count}枚 > 引けた枚数${actual}枚）。敗北です。`);
    }
    if (typeof triggerOverdrawDefeat === "function") {
      setTimeout(() => triggerOverdrawDefeat(), 500);
    }
  }

  // チャット記録
  if (typeof addGameLog === "function") {
    const playerName = window.myUsername || me;
    addGameLog(`${playerName} が カードを${actual}枚取り出した`);
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

function applyDamageByRule(snapshot, type, amount) {
  const result = {
    hp: Number(snapshot.hp) || 0,
    shield: Number(snapshot.shield) || 0,
    defstack: Number(snapshot.defstack) || 0,
    defstackMax: Math.max(0, Number(snapshot.defstackMax) || 0)
  };
  const hits = Math.max(0, Number(amount) || 0);
  if (hits <= 0) return result;

  const applyToShieldAndHp = (damageAmount) => {
    let remain = Math.max(0, Number(damageAmount) || 0);
    if (result.shield > 0) {
      const absorbed = Math.min(result.shield, remain);
      result.shield -= absorbed;
      remain -= absorbed;
    }
    if (remain > 0) {
      result.hp = Math.max(0, result.hp - remain);
    }
  };

  if (type === "hp_reduce") {
    result.hp = Math.max(0, result.hp - hits);
    return result;
  }

  if (type === "fragile") {
    result.defstack = Math.max(0, result.defstack - hits);
    return result;
  }

  if (type === "pierce") {
    applyToShieldAndHp(hits);
    return result;
  }

  if (type === "arcana") {
    const brokenDef = Math.min(result.defstack, hits);
    result.defstack -= brokenDef;
    applyToShieldAndHp(hits - brokenDef);
    return result;
  }

  // 通常ダメージ（direct_attack含む）:
  // 防御スタックを 0 まで減らし、0到達時のみ 1 ダメージ通過。その後防御を最大値へループ。
  let passDamage = 0;
  for (let i = 0; i < hits; i++) {
    if (result.defstack > 0) {
      result.defstack -= 1;
      continue;
    }
    passDamage += 1;
    result.defstack = result.defstackMax;
  }
  applyToShieldAndHp(passDamage);
  return result;
}

function showDamagePopup(targetOwner, type, subType, options = {}) {
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
  if (type === "direct_attack") desc = "アタッカーカードによる攻撃ダメージ";

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
    const me = state[window.myRole || "player1"] || {};

    let tHP = s.hp;
    let tDef = s.defstack;
    let tBarrier = s.shield;
    const tDefMax = s.defstackMax || 0;
    let actualAmount = amount;

    const getLvIdx = (lv) => (lv >= 6 ? 3 : lv >= 5 ? 2 : lv >= 3 ? 1 : 0);

    const applyHit = (hitType, hitAmount) => {
      const next = applyDamageByRule({
        hp: tHP,
        shield: tBarrier,
        defstack: tDef,
        defstackMax: tDefMax
      }, hitType, hitAmount);
      tHP = next.hp;
      tBarrier = next.shield;
      tDef = next.defstack;
    };

    const meRole = window.myRole || "player1";
    const canApplyEvolution = targetOwner !== meRole;

    // 奇撃の道（旧: 瞬発の道）: 本ダメージ前に脆弱ダメージ
    if (canApplyEvolution && actualAmount >= 6 && (me.evolutionPath === "奇撃の道" || me.evolutionPath === "瞬発の道")) {
      const z = [1, 3, 4, 6][getLvIdx(me.level || 1)];
      applyHit("fragile", z);
    }

    // 背水の道: 直接攻撃時の追加
    if (canApplyEvolution && type === "direct_attack" && me.evolutionPath === "背水の道") {
      const handCount = window.prevMyHandCount !== undefined ? window.prevMyHandCount : 0;
      if (handCount <= 2) actualAmount += 1;
      if ((me.pp || 0) >= 2 && !me.evoBackwaterExpGained) {
        const t = [1, 2, 3, 4][getLvIdx(me.level || 1)];
        actualAmount += t;
      }
    }

    // 本ダメージ
    applyHit(type, actualAmount);

    // 継続の道: 本ダメージ後に追加1ダメージ（3回目は貫通）
    if (canApplyEvolution && actualAmount >= 1 && me.evolutionPath === "継続の道") {
      const y = [1, 3, 4, 6][getLvIdx(me.level || 1)];
      const cur = me.evoContinuousDmgCount || 0;
      if (cur < y) {
        const isThird = cur + 1 === 3;
        applyHit("damage", 1);
        if (isThird) applyHit("pierce", 1);
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
      window.applyCalculatedDamage(targetOwner, type, subType, val, false, options);
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
window.applyCalculatedDamage = function(targetOwner, type, subType, amount, isEvoDmg = false, options = {}) {
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
  
  // 奇撃の道（旧: 瞬発の道）: 一撃で6以上のダメージを与える時、その直前にzの脆弱ダメージ
  const meRole = window.myRole || "player1";
  const myState = state[meRole];
  const canApplyEvolution = targetOwner !== meRole;
  if (canApplyEvolution && !isEvoDmg && actualAmount >= 6 && myState && (myState.evolutionPath === '奇撃の道' || myState.evolutionPath === '瞬発の道')) {
    const lv = myState.level || 1;
    let idx = 0;
    if (lv >= 6) idx = 3;
    else if (lv >= 5) idx = 2;
    else if (lv >= 3) idx = 1;
    const zArr = [1, 3, 4, 6];
    const z = zArr[idx];
    
    s.defstack = Math.max(0, s.defstack - z);
    if (typeof addGameLog === "function") {
      addGameLog(`[EVOLUTION] ${actor} の「奇撃の道」効果！ 直前に ${z} の脆弱ダメージを与えた！`);
    }
  }

  // 「直接攻撃」の処理と、背水の道効果の適用
  if (canApplyEvolution && type === "direct_attack") {
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
  
  const next = applyDamageByRule({
    hp: s.hp,
    shield: s.shield,
    defstack: s.defstack,
    defstackMax: s.defstackMax
  }, type, actualAmount);
  s.hp = next.hp;
  s.shield = next.shield;
  s.defstack = next.defstack;

  // 最終的な負の値ガード（念のため）
  s.hp = Math.max(0, s.hp);
  s.shield = Math.max(0, s.shield);
  s.defstack = Math.max(0, s.defstack);

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
  const myState2 = state[window.myRole || "player1"];
  if (canApplyEvolution && !isEvoDmg && actualAmount >= 1 && myState2 && myState2.evolutionPath === '継続の道') {
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
      // 通常1ダメージを付与し、3回目のみ追加で1貫通ダメージを付与
      window.applyCalculatedDamage(targetOwner, "damage", "additional", 1, true, options);
      if (isThird) {
        window.applyCalculatedDamage(targetOwner, "pierce", "additional", 1, true, options);
      }
    }
  }

  // Firebase 同期
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (targetOwner === me) {
    // 自分のステータス → 自分のパスに直接書く
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  } else {
    // 相手のステータス → 確定後の値を pendingChange 経由で送る
    // hp/shield/defstack の確定値をまとめて送信
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && window.firebaseClient?.db) {
      window.firebaseClient.sendChangeRequest(gameRoom, me, targetOwner, "_bulk", "set", {
        hp: s.hp,
        shield: s.shield,
        defstack: s.defstack,
        defstackOverMax: s.defstackOverMax || false
      });
    }
  }

  // ダメージ処理からの更新なので、ログチェックをスキップ（既にログは出力済み）
  if (typeof update === "function") update(true);
};

function openGraveZoneMenu(owner, x, y){
  const me = window.myRole || "player1";
  const isMine = owner === me;
  const items = [
    { label: "墓地操作", disabled: true },
    { sep: true },
    {
      label: "場のアタッカーカードを墓地へ送る",
      disabled: !isMine,
      action: () => {
        if (typeof window.sendZoneCardsToGrave === "function") window.sendZoneCardsToGrave(owner, "attacker");
      }
    },
    {
      label: "場のスキルカードを墓地へ送る",
      disabled: !isMine,
      action: () => {
        if (typeof window.sendZoneCardsToGrave === "function") window.sendZoneCardsToGrave(owner, "skill");
      }
    }
  ];
  buildMenu(items, x, y);
}

function openSkillZoneMenu(owner, x, y){
  const items = [
    { label: "スキル場操作", disabled: true }
  ];
  buildMenu(items, x, y);
}

function getContextMenuTarget(target){
  if(!target || typeof target.closest !== "function") return null;
  const battleZone = target.closest(".battleZone");
  if (battleZone && battleZone.dataset.zoneType === "grave") {
    return { type: "graveZone", el: battleZone };
  }
  if (battleZone && battleZone.dataset.zoneType === "skill") {
    return { type: "skillZone", el: battleZone };
  }
  const card = target.closest(".card:not(.deckObject)");
  if (card && card.dataset.zoneType === "grave") {
    return {
      type: "graveZone",
      owner: card.dataset.zoneOwner || card.dataset.owner || "player1",
      el: null
    };
  }
  if(card) return { type: "card", el: card };
  const deck = target.closest(".deckObject");
  if(deck) return { type: "deck", el: deck };
  const lorPanel = target.closest(".lorPanel");
  if(lorPanel) return { type: "lorPanel", el: lorPanel };
  const evoOwner = target.closest(".evoPanelWrapper[data-owner]")?.dataset?.owner;
  if(evoOwner){
    const panelByOwner = document.querySelector(`.lorPanel[data-owner="${evoOwner}"]`);
    if(panelByOwner) return { type: "lorPanel", el: panelByOwner };
  }
  return null;
}

function openGameContextMenu(hit, x, y){
  if(!hit) return;
  if(hit.type === "card") openCardMenu(hit.el, x, y);
  else if(hit.type === "deck") openDeckMenu(hit.el, x, y);
  else if(hit.type === "lorPanel") openStatusMenu(hit.el.dataset.owner, x, y);
  else if(hit.type === "graveZone") openGraveZoneMenu(hit.el?.dataset?.owner || hit.owner || "player1", x, y);
  else if(hit.type === "skillZone") openSkillZoneMenu(hit.el?.dataset?.owner || hit.owner || "player1", x, y);
}

document.addEventListener("mousedown", (e) => {
  if(e.button !== 2) return;
  const hit = getContextMenuTarget(e.target);
  if(hit){
    console.log("[ctx-debug:mousedown]", e.button, e.target);
  }
});

document.addEventListener("contextmenu", (e) => {
  if (typeof window.isGameInteractionLocked === "function" && window.isGameInteractionLocked()) {
    return;
  }
  const hit = getContextMenuTarget(e.target);
  if(hit){
    console.log("[ctx-debug:contextmenu]", e.button, e.target);
    e.preventDefault();
    openGameContextMenu(hit, e.clientX, e.clientY);
  }
});

// 相手ステータスパネル上でダメージメニューが使える旨を薄字表示
(function setupCtxDamageMenuHint() {
  let hint = document.getElementById("ctxDamageMenuHint");
  document.addEventListener("mousemove", (e) => {
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "ctxDamageMenuHint";
      hint.textContent = "右クリックでダメージメニュー";
      document.body.appendChild(hint);
    }
    const t = e.target;
    const lor = t && t.closest && t.closest(".lorPanel");
    const me = window.myRole || window.getMyRole?.() || "player1";
    if (lor && lor.dataset.owner && lor.dataset.owner !== me) {
      hint.classList.add("is-visible");
      hint.style.left = (e.clientX + 14) + "px";
      hint.style.top = (e.clientY + 16) + "px";
    } else {
      hint.classList.remove("is-visible");
    }
  });
  // game.js など IIFE 外から山札ドロー操作を呼ぶため公開
  window.takeOut = takeOut;
  window.drawCards = drawCards;
})();

// ===== ゾーン内容確認モーダル =====
window.showZoneInspectorModal = function(owner, type) {
  const cards = typeof getZoneCards === "function" ? getZoneCards(owner, type) : [];
  const overlay = document.createElement("div");
  overlay.className = "zoneInspectorOverlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(8, 6, 15, 0.92);
    display: flex; align-items: center; justify-content: center;
    z-index: 100000; backdrop-filter: blur(10px); font-family: 'Outfit', sans-serif;
  `;

  const typeName = type === "skill" ? "スキル" : (type === "attacker" ? "アタッカー" : "墓地");
  const ownerName = owner === window.myRole ? "あなた" : "相手";

  const renderContent = () => {
    const currentCards = typeof getZoneCards === "function" ? getZoneCards(owner, type) : [];
    const html = `
      <div class="zoneInspectorBox" style="
        width: 800px; max-height: 80vh; background: #1a172c; border: 1px solid #c7b377;
        border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      ">
        <div style="padding: 20px; background: rgba(199, 179, 119, 0.1); border-bottom: 1px solid rgba(199, 179, 119, 0.2); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 20px; color: #f0d080; letter-spacing: 1px;">${ownerName}の${typeName}場</h2>
          <button id="closeInspector" style="background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer;">✕</button>
        </div>
        
        <div id="inspectorScrollArea" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px;">
          ${currentCards.length === 0 ? '<div style="color: #777; text-align: center; padding: 40px;">カードがありません</div>' : ""}
          ${currentCards.map((c, i) => {
            const data = typeof getCardData === "function" ? getCardData(c.dataset.id) : {};
            return `
              <div class="inspectorItem" data-instance-id="${c.dataset.instanceId}" style="
                display: flex; align-items: center; gap: 16px; background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px;
                transition: all 0.2s;
              ">
                <div style="width: 30px; font-weight: 900; color: #c7b377; text-align: center; font-size: 18px;">${i + 1}</div>
                <div style="width: 60px; height: 84px; flex-shrink: 0; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid #444; cursor: zoom-in;" onclick="window.showCardZoomById('${c.dataset.id}')">
                  <img src="${data.image || ''}" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div style="flex: 1;">
                  <div style="color: #fff; font-weight: bold; font-size: 15px;">${data.name || "Unknown"}</div>
                  <div style="color: #888; font-size: 12px; margin-top: 4px;">ID: ${c.dataset.id}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="inspBtn moveUp" data-idx="${i}" title="順序を上げる" ${i === 0 ? "disabled" : ""} style="background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; width: 32px; height: 32px; cursor: pointer;">↑</button>
                  <button class="inspBtn moveDown" data-idx="${i}" title="順序を下げる" ${i === currentCards.length - 1 ? "disabled" : ""} style="background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; width: 32px; height: 32px; cursor: pointer;">↓</button>
                  <button class="inspBtn takeOut" data-idx="${i}" title="手札に取り出す" style="background: #442a2a; color: #ff9999; border: 1px solid #663333; border-radius: 4px; padding: 0 12px; height: 32px; cursor: pointer; font-size: 12px; font-weight: bold;">取り出す</button>
                  <button class="inspBtn insertNext" data-idx="${i}" title="この次に手札から追加" style="background: #2a3a44; color: #99e1ff; border: 1px solid #334e66; border-radius: 4px; padding: 0 12px; height: 32px; cursor: pointer; font-size: 12px; font-weight: bold;">挿入</button>
                </div>
              </div>
            `;
          }).join("")}
          
          ${currentCards.length > 0 ? "" : `
            <div style="text-align: center;">
              <button id="insertFirst" style="background: #2a3a44; color: #99e1ff; border: 1px solid #334e66; border-radius: 4px; padding: 8px 20px; cursor: pointer; font-weight: bold;">手札からカードを追加</button>
            </div>
          `}
        </div>

        <div style="padding: 16px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.05); font-size: 12px; color: #666; text-align: center;">
          カードを右クリックすると詳細メニューが開けます。順序は上が「新しい/上」です。
        </div>
      </div>
    `;
    overlay.innerHTML = html;

    // イベント紐づけ
    overlay.querySelector("#closeInspector").onclick = () => overlay.remove();
    
    // アイテムごとの右クリックメニュー
    overlay.querySelectorAll(".inspectorItem").forEach(item => {
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const instanceId = item.dataset.instanceId;
        const cardEl = typeof findFieldElementByInstanceId === "function" ? findFieldElementByInstanceId(instanceId) : null;
        if (cardEl) {
          openCardMenu(cardEl, e.clientX, e.clientY);
        }
      });

      const firstBtn = item.querySelector(".inspBtn");
      if (!firstBtn) return;
      const idx = parseInt(firstBtn.dataset.idx);
      
      item.querySelector(".moveUp")?.addEventListener("click", () => {
        reorderCards(idx, idx - 1);
      });
      item.querySelector(".moveDown")?.addEventListener("click", () => {
        reorderCards(idx, idx + 1);
      });
      item.querySelector(".takeOut")?.addEventListener("click", () => {
        const instanceId = item.dataset.instanceId;
        const cardEl = typeof findFieldElementByInstanceId === "function" ? findFieldElementByInstanceId(instanceId) : null;
        if (cardEl && typeof takeOutCardFromZone === "function") {
          takeOutCardFromZone(cardEl);
          renderContent();
        }
      });
      item.querySelector(".insertNext")?.addEventListener("click", (e) => {
        showHandSelectionForInsert(idx + 1, e);
      });
    });

    if (overlay.querySelector("#insertFirst")) {
      overlay.querySelector("#insertFirst").onclick = (e) => showHandSelectionForInsert(0, e);
    }
  };

  const reorderCards = (fromIdx, toIdx) => {
    const currentCards = typeof getZoneCards === "function" ? getZoneCards(owner, type) : [];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= currentCards.length || toIdx >= currentCards.length) return;
    
    const item = currentCards.splice(fromIdx, 1)[0];
    currentCards.splice(toIdx, 0, item);
    
    currentCards.forEach((c, i) => {
      c.dataset.zoneOrder = String(1000 + i);
    });
    
    if (typeof organizeBattleZones === "function") organizeBattleZones();
    if (typeof saveFieldCards === "function") saveFieldCards();
    renderContent();
  };

  const showHandSelectionForInsert = (targetIdx, event) => {
    const me = window.myRole || "player1";
    const handCards = Array.from(document.querySelectorAll(".card")).filter(c => c.dataset.owner === me && Number(c.dataset.y) >= (window.HAND_ZONE_Y_MIN || 1460));
    
    if (handCards.length === 0) {
      alert("手札にカードがありません。");
      return;
    }

    const subItems = handCards.map(c => {
      const data = typeof getCardData === "function" ? getCardData(c.dataset.id) : {};
      return {
        label: data.name || c.dataset.id,
        action: () => {
          insertHandCardAt(c, targetIdx);
        }
      };
    });

    buildMenu(subItems, event.clientX, event.clientY);
  };

  const insertHandCardAt = (cardEl, targetIdx) => {
    const currentCards = typeof getZoneCards === "function" ? getZoneCards(owner, type) : [];
    
    // ゾーン情報を設定
    cardEl.dataset.zoneType = type;
    cardEl.dataset.owner = owner;
    cardEl.dataset.visibility = "both";
    if (typeof applyCardFace === "function") applyCardFace(cardEl, "both");
    
    // 順序を再割り当て
    currentCards.splice(targetIdx, 0, cardEl);
    currentCards.forEach((c, i) => {
      c.dataset.zoneOrder = String(1000 + i);
    });

    // アンカー位置へ移動（organizeBattleZones で最終調整される）
    if (typeof window.getZoneAnchor === "function") {
      const anchor = window.getZoneAnchor(owner, type);
      cardEl.style.left = anchor.x + "px";
      cardEl.style.top = anchor.y + "px";
      cardEl.dataset.x = String(anchor.x);
      cardEl.dataset.y = String(anchor.y);
    }

    if (typeof organizeBattleZones === "function") organizeBattleZones();
    if (typeof organizeHands === "function") organizeHands();
    if (typeof saveFieldCards === "function") saveFieldCards();
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
    
    renderContent();
  };

  renderContent();
  document.body.appendChild(overlay);
  
  // 背景クリックで閉じる
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
};

window.showCardZoomById = function(id) {
  const dummy = document.createElement("div");
  dummy.dataset.id = id;
  const img = document.createElement("img");
  const data = typeof getCardData === "function" ? getCardData(id) : {};
  img.src = data.image || "";
  dummy.appendChild(img);
  showCardZoom(dummy);
};

})();
