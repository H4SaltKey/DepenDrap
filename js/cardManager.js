// instanceId プレフィックス: crypto.randomUUID() で衝突を防ぐ
// フォールバック: Date.now() + Math.random()
const cardInstancePrefix = (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  : Date.now() + "_" + Math.floor(Math.random() * 10000);
let cardInstanceCounter = 0;
let cardZCounter = 2; // カードのz-index管理（デッキは1固定）

const CARD_W = 320;
const CARD_H = 453;

function setSafeSrc(img, src) {
  if (!img) return;
  img.onerror = () => {
    img.src = "assets/404.png";
    img.onerror = null;
  };
  img.src = src || "assets/404.png";
}

function toServerX(localX){
  if(window.myRole === "player2") return FIELD_W - Number(localX) - CARD_W;
  return Number(localX);
}
function toServerY(localY){
  if(window.myRole === "player2") return FIELD_H - Number(localY) - CARD_H;
  return Number(localY);
}
function toLocalX(serverX){
  if(window.myRole === "player2") return FIELD_W - Number(serverX) - CARD_W;
  return Number(serverX);
}
function toLocalY(serverY){
  if(window.myRole === "player2") return FIELD_H - Number(serverY) - CARD_H;
  return Number(serverY);
}

const CARD_GRID_SIZE = 20;
const CARD_STACK_OFFSET = 14;
const FIELD_ZOOM_STEP = 0.05;
let FIELD_ZOOM_MAX = 0.8;
const FIELD_W = 3000;
const FIELD_H = 2000;

// 最小ズーム: フィールド全体がウィンドウに収まるスケール
function calcZoomMin(){
  return 0.2;
}

let FIELD_ZOOM_MIN = 0.1; // initCards後に更新

let fieldZoom = Number(localStorage.getItem("fieldZoom")) || 0.3;
let fieldPanX = Number(localStorage.getItem("fieldPanX")) || 0;
let fieldPanY = Number(localStorage.getItem("fieldPanY")) || 0;

// 現在ドラッグ中のカード情報
let draggingCard = null; // { el, offsetX, offsetY }
let lastLocalFieldSaveAt = 0;
let zoneOrderCounter = 0;
let handOrderCounter = 0;
let prevZoneLogState = null;

const BATTLE_ZONE_TYPES = ["attacker", "skill", "grave"];
const ZONE_RECT = { w: CARD_W, h: CARD_H };

function nextZoneOrder() {
  zoneOrderCounter += 1;
  return Date.now() + zoneOrderCounter;
}

function nextHandOrder() {
  handOrderCounter += 1;
  return (Date.now() * 1000) + handOrderCounter;
}
window.nextHandOrder = nextHandOrder;

function getZoneAnchor(owner, type) {
  const myRole = window.myRole || "player1";
  const isMine = owner === myRole;
  const midX = (FIELD_W / 2) - (CARD_W / 2);
  const midY = (FIELD_H / 2) - (CARD_H / 2);
  const attackerY = isMine ? (FIELD_H - CARD_H - 520) : 320;
  const attackerX = midX;
  if (type === "attacker") return { x: attackerX, y: attackerY };
  if (type === "skill") {
    return {
      x: isMine ? (attackerX - CARD_W - 90) : (attackerX + CARD_W + 90),
      y: attackerY
    };
  }
  if (type === "grave") {
    return {
      x: isMine ? (FIELD_W - CARD_W - 80) : 80,
      y: midY
    };
  }
  return { x: attackerX, y: attackerY };
}

function getZoneCards(owner, type) {
  const content = getFieldContent();
  if (!content) return [];
  return Array.from(content.querySelectorAll(".card:not(.deckObject)"))
    .filter((c) => c.dataset.owner === owner && c.dataset.zoneType === type)
    .sort((a, b) => Number(a.dataset.zoneOrder || 0) - Number(b.dataset.zoneOrder || 0));
}

function isTopZoneCard(card) {
  const owner = card.dataset.owner;
  const type = card.dataset.zoneType;
  if (!owner || !type) return true;
  const cards = getZoneCards(owner, type);
  return cards.length === 0 || cards[cards.length - 1] === card;
}

function placeCardInZone(card, owner, type) {
  if (type === "attacker") {
    const prev = getZoneCards(owner, "attacker").filter((c) => c !== card);
    prev.forEach((c, i) => {
      clearZoneMarker(c);
      const a = getZoneAnchor(owner, "attacker");
      const nx = a.x + 30 + (i * 20);
      const ny = a.y + 30 + (i * 20);
      c.style.left = `${nx}px`;
      c.style.top = `${ny}px`;
      c.dataset.x = nx;
      c.dataset.y = ny;
    });
  }
  card.dataset.zoneType = type;
  card.dataset.zoneOwner = owner;
  card.dataset.zoneOrder = String(nextZoneOrder());
}

function clearZoneMarker(card) {
  delete card.dataset.zoneType;
  delete card.dataset.zoneOwner;
  delete card.dataset.zoneOrder;
}

function ensureBattleZoneUIs() {
  const content = getFieldContent();
  if (!content) return;
  ["player1", "player2"].forEach((owner) => {
    const isMine = owner === (window.myRole || "player1");
    BATTLE_ZONE_TYPES.forEach((type) => {
      const id = `battleZone_${owner}_${type}`;
      if (document.getElementById(id)) return;
      const el = document.createElement("div");
      el.id = id;
      el.className = `battleZone battleZone-${type} ${isMine ? "mine" : "enemy"}`;
      el.dataset.owner = owner;
      el.dataset.zoneType = type;
      el.style.position = "absolute";
      el.style.width = `${CARD_W}px`;
      el.style.height = `${CARD_H}px`;
      el.style.zIndex = "0";
      el.style.pointerEvents = type === "attacker" ? "none" : "auto";
      el.innerHTML = `<div class="battleZoneLabel">${type === "attacker" ? "ATK" : type === "skill" ? "SKILL" : "GRAVE"}</div><div class="battleZoneCount"></div>`;
      if (owner !== (window.myRole || "player1")) {
        el.style.transform = "rotate(180deg)";
      }
      content.appendChild(el);
    });
  });
}

let zoneHoverPanel = null;
let zoneHoverHideTimer = null;
let zoneHoverActiveKey = null;

function cancelZoneHoverHide() {
  if (zoneHoverHideTimer) {
    clearTimeout(zoneHoverHideTimer);
    zoneHoverHideTimer = null;
  }
}

function scheduleZoneHoverHide() {
  cancelZoneHoverHide();
  zoneHoverHideTimer = setTimeout(() => {
    hideZoneHoverPanel();
  }, 120);
}

function ensureZoneHoverPanel() {
  if (zoneHoverPanel) return zoneHoverPanel;
  const panel = document.createElement("div");
  panel.className = "zoneHoverPanel";
  panel.style.position = "absolute";
  panel.style.pointerEvents = "auto";
  panel.style.display = "none";
  panel.style.zIndex = "10005";
  panel.style.background = "transparent";
  panel.addEventListener("pointerenter", () => {
    cancelZoneHoverHide();
  });
  panel.addEventListener("pointerleave", () => {
    scheduleZoneHoverHide();
  });
  document.body.appendChild(panel);
  zoneHoverPanel = panel;
  return panel;
}

function createZoneHoverPreviewCard(originalCard) {
  const cardId = originalCard.dataset.id;
  const data = getCardData(cardId) || {};
  const preview = document.createElement("div");
  preview.className = "card zoneHoverPreviewCard";
  preview.dataset.id = cardId;
  preview.dataset.originalInstanceId = originalCard.dataset.instanceId || "";
  preview.dataset.zoneHoverPreview = "true";
  preview.style.position = "absolute";
  preview.style.pointerEvents = "auto";
  preview.style.overflow = "hidden";
  preview.style.background = "#111";
  preview.style.border = "1px solid rgba(255,255,255,0.08)";
  preview.style.boxSizing = "border-box";

  const img = document.createElement("img");
  setSafeSrc(img, data.image || originalCard.querySelector("img")?.src || "");
  img.draggable = false;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "contain";

  const label = document.createElement("div");
  label.className = "cardVisibilityLabel";
  label.textContent = originalCard.querySelector(".cardVisibilityLabel")?.textContent || "";

  preview.appendChild(img);
  preview.appendChild(label);
  return preview;
}

function attachZoneHoverListeners(card, owner, type) {
  if (!card || card.dataset.zoneHoverAttached === "true") return;
  card.dataset.zoneHoverAttached = "true";
  card.addEventListener("pointerenter", () => {
    if (getZoneCards(owner, type).length > 1) {
      showZoneHoverPanel(owner, type);
    }
  });
  card.addEventListener("pointerleave", () => {
    scheduleZoneHoverHide();
  });
}

function showZoneHoverPanel(owner, type) {
  const cards = getZoneCards(owner, type);
  if (cards.length < 2) {
    hideZoneHoverPanel();
    return;
  }

  const panel = ensureZoneHoverPanel();
  panel.innerHTML = "";
  panel.style.display = "block";
  panel.dataset.owner = owner;
  panel.dataset.type = type;

  const field = document.getElementById("field");
  const fieldRect = field ? field.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  const anchor = getZoneAnchor(owner, type);
  const pageX = fieldRect.left + (anchor.x + fieldPanX) * fieldZoom;
  const pageY = fieldRect.top + (anchor.y + fieldPanY) * fieldZoom;

  const previewWidth = 220;
  const previewHeight = Math.round(previewWidth * CARD_H / CARD_W);
  const overlapRate = Math.min(0.95, 0.65 + Math.max(0, cards.length - 1) * 0.02);
  const step = previewWidth * (1 - overlapRate);
  const totalWidth = previewWidth + step * (cards.length - 1);

  panel.style.width = `${totalWidth}px`;
  panel.style.height = `${previewHeight}px`;
  panel.style.left = `${pageX + CARD_W * fieldZoom - totalWidth - 10}px`;
  panel.style.top = `${pageY}px`;

  cards.forEach((originalCard, index) => {
    const preview = createZoneHoverPreviewCard(originalCard);
    preview.style.left = `${index * step}px`;
    preview.style.top = "0px";
    preview.style.width = `${previewWidth}px`;
    preview.style.height = `${previewHeight}px`;
    preview.style.cursor = "pointer";
    preview.style.zIndex = String(10 + index);

    preview.addEventListener("pointerenter", () => {
      preview.classList.add("zoneHoverPreviewActive");
      preview.style.zIndex = "9999";
      cancelZoneHoverHide();
    });
    preview.addEventListener("pointerleave", () => {
      preview.classList.remove("zoneHoverPreviewActive");
      preview.style.zIndex = String(10 + index);
      scheduleZoneHoverHide();
    });
    preview.addEventListener("contextmenu", (e) => {
      const original = findFieldElementByInstanceId(preview.dataset.originalInstanceId);
      if (!original) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof openCardMenu === "function") openCardMenu(original, e.clientX, e.clientY);
    });
    preview.addEventListener("click", (e) => {
      const original = findFieldElementByInstanceId(preview.dataset.originalInstanceId);
      if (!original) return;
      e.stopPropagation();
      if (typeof showCardZoom === "function") showCardZoom(original);
    });

    panel.appendChild(preview);
  });

  zoneHoverActiveKey = `${owner}:${type}`;
}

function hideZoneHoverPanel() {
  if (!zoneHoverPanel) return;
  zoneHoverPanel.style.display = "none";
  zoneHoverActiveKey = null;
}

function updateBattleZoneUI() {
  ensureBattleZoneUIs();
  const currentRole = window.myRole || "player1";
  ["player1", "player2"].forEach((owner) => {
    BATTLE_ZONE_TYPES.forEach((type) => {
      const el = document.getElementById(`battleZone_${owner}_${type}`);
      if (!el) return;
      const isMine = owner === currentRole;
      el.classList.toggle("mine", isMine);
      el.classList.toggle("enemy", !isMine);
      el.style.transform = isMine ? "" : "rotate(180deg)";
      const anchor = getZoneAnchor(owner, type);
      el.style.left = `${anchor.x}px`;
      el.style.top = `${anchor.y}px`;
      const cards = getZoneCards(owner, type);
      const countEl = el.querySelector(".battleZoneCount");
      if (!countEl) return;
      if (type === "grave") countEl.textContent = `${cards.length}枚`;
      else countEl.textContent = cards.length > 0 ? "●" : "○";
      if ((type === "skill" || type === "grave") && cards.length > 1) {
        const topCard = cards[cards.length - 1];
        if (topCard) attachZoneHoverListeners(topCard, owner, type);
      }
    });
  });
}

function logBattleZoneChanges() {
  const myRole = window.myRole || "player1";
  const roleLabel = (owner) => owner === myRole ? "あなた" : "相手";
  const now = {
    player1: {
      attacker: getZoneCards("player1", "attacker").length > 0,
      skill: getZoneCards("player1", "skill").length > 0,
      grave: getZoneCards("player1", "grave").length
    },
    player2: {
      attacker: getZoneCards("player2", "attacker").length > 0,
      skill: getZoneCards("player2", "skill").length > 0,
      grave: getZoneCards("player2", "grave").length
    }
  };
  if (!prevZoneLogState) {
    prevZoneLogState = now;
    return;
  }
  ["player1", "player2"].forEach((owner) => {
    if (prevZoneLogState[owner].attacker !== now[owner].attacker && typeof addGameLog === "function") {
      addGameLog(`[ZONE] ${roleLabel(owner)} アタッカー場: ${now[owner].attacker ? "カードあり" : "空"}`);
    }
    if (prevZoneLogState[owner].skill !== now[owner].skill && typeof addGameLog === "function") {
      addGameLog(`[ZONE] ${roleLabel(owner)} スキル場: ${now[owner].skill ? "カードあり" : "空"}`);
    }
    if (prevZoneLogState[owner].grave !== now[owner].grave && typeof addGameLog === "function") {
      addGameLog(`[ZONE] ${roleLabel(owner)} 墓地: ${now[owner].grave} 枚`);
    }
  });
  prevZoneLogState = now;
}

window.organizeBattleZones = function() {
  const content = getFieldContent();
  if (!content) return;
  ["player1", "player2"].forEach((owner) => {
    BATTLE_ZONE_TYPES.forEach((type) => {
      const cards = getZoneCards(owner, type);
      const anchor = getZoneAnchor(owner, type);
      if (type === "attacker" && cards.length > 1) {
        cards.slice(0, -1).forEach((c) => clearZoneMarker(c));
      }
      const list = getZoneCards(owner, type);
      list.forEach((card, idx) => {
        card.style.left = `${anchor.x}px`;
        card.style.top = `${anchor.y}px`;
        card.dataset.x = anchor.x;
        card.dataset.y = anchor.y;
        const isTop = idx === list.length - 1;
        if (type === "attacker") {
          card.style.display = "";
          card.style.opacity = "1";
        } else {
          card.style.display = isTop ? "" : "none";
          card.style.opacity = "1";
        }
      });
    });
  });
  updateBattleZoneUI();
  logBattleZoneChanges();
};

window.sendZoneCardsToGrave = function(owner, fromType) {
  const myRole = window.myRole || "player1";
  if (owner !== myRole) return;
  const fromCards = getZoneCards(owner, fromType);
  if (fromType === "attacker") {
    const top = fromCards[fromCards.length - 1];
    if (!top) return;
    placeCardInZone(top, owner, "grave");
  } else {
    fromCards.forEach((c) => placeCardInZone(c, owner, "grave"));
  }
  if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
  saveFieldCards();
};

window.showGraveyardContents = function(owner) {
  const graveCards = getZoneCards(owner, "grave");
  if (graveCards.length === 0) {
    alert("墓地は空です。");
    return;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000000;
    backdrop-filter: blur(4px);
  `;

  const container = document.createElement("div");
  container.style.cssText = `
    background: #1a172c;
    border: 2px solid #c7b377;
    border-radius: 12px;
    padding: 24px;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    color: #e0d0a0;
  `;

  const ownerLabel = owner === (window.myRole || "player1") ? "自分" : "相手";
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; color: #e0d0a0;">${ownerLabel}の墓地 (${graveCards.length}枚)</h2>
      <button id="closeGraveViewer" style="
        background: #333;
        border: 1px solid #555;
        color: #ccc;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">閉じる</button>
    </div>
    <div id="graveCardList" style="display: flex; flex-direction: column; gap: 12px;"></div>
  `;

  const cardList = container.querySelector("#graveCardList");
  
  // 墓地のカードを順序に表示（最新が上）
  graveCards.slice().reverse().forEach((card, index) => {
    const cardId = card.dataset.id;
    const cardDiv = document.createElement("div");
    cardDiv.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #333;
    `;

    const orderLabel = document.createElement("div");
    orderLabel.style.cssText = `
      background: #c7b377;
      color: #1a172c;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      flex-shrink: 0;
    `;
    orderLabel.textContent = graveCards.length - index;

    const img = card.querySelector("img");
    const cardImg = document.createElement("img");
    if (img) {
      cardImg.src = img.src;
      cardImg.style.cssText = `
        width: 60px;
        height: 85px;
        object-fit: contain;
        border-radius: 4px;
        border: 1px solid #555;
      `;
    }

    const cardInfo = document.createElement("div");
    cardInfo.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const cardName = document.createElement("div");
    cardName.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      color: #e0d0a0;
    `;
    cardName.textContent = cardId;

    const cardMeta = document.createElement("div");
    cardMeta.style.cssText = `
      font-size: 12px;
      color: #888;
    `;
    cardMeta.textContent = `順序: ${graveCards.length - index} / ${graveCards.length}`;

    cardInfo.appendChild(cardName);
    cardInfo.appendChild(cardMeta);

    cardDiv.appendChild(orderLabel);
    if (img) cardDiv.appendChild(cardImg);
    cardDiv.appendChild(cardInfo);

    cardList.appendChild(cardDiv);
  });

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  container.querySelector("#closeGraveViewer").addEventListener("click", () => {
    overlay.remove();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handler);
    }
  });
};

window.resetBattleZoneState = function() {
  prevZoneLogState = null;
  zoneOrderCounter = 0;
  const content = getFieldContent();
  if (!content) return;
  content.querySelectorAll(".card[data-zone-type]").forEach((c) => {
    clearZoneMarker(c);
  });
  updateBattleZoneUI();
};

function getFieldContent(){
  return document.getElementById("fieldContent") || document.getElementById("field");
}

function nextCardInstanceId(){
  cardInstanceCounter += 1;
  return "cardInstance_" + cardInstancePrefix + "_" + cardInstanceCounter;
}

function isBrokenCardInstanceId(instanceId){
  return !instanceId || instanceId === "cardInstance_NaN";
}

function findFieldElementByInstanceId(instanceId){
  return Array.from(getFieldContent().querySelectorAll(".card, .deckObject"))
    .find(el => el.dataset.instanceId === instanceId);
}

function repairDuplicateDomInstanceIds(){
  const seen = new Set();
  let repaired = false;
  getFieldContent().querySelectorAll(".card").forEach(card => {
    const instanceId = card.dataset.instanceId;
    if(isBrokenCardInstanceId(instanceId) || seen.has(instanceId)){
      card.dataset.instanceId = nextCardInstanceId();
      repaired = true;
    }
    seen.add(card.dataset.instanceId);
  });
  return repaired;
}

function normalizeFieldCardData(data){
  const seen = new Set();
  let repaired = false;
  const normalized = data.map(item => {
    const next = { ...item };
    if(!next.isDeck && (isBrokenCardInstanceId(next.instanceId) || seen.has(next.instanceId))){
      next.instanceId = nextCardInstanceId();
      repaired = true;
    }
    seen.add(next.instanceId);
    return next;
  });
  return { data: normalized, repaired };
}

// ===== ズーム =====
function setFieldZoom(value, pivotX, pivotY){
  const oldZoom = fieldZoom;
  fieldZoom = Math.max(FIELD_ZOOM_MIN, Math.min(FIELD_ZOOM_MAX, value));

  if(pivotX !== undefined && pivotY !== undefined){
    fieldPanX = pivotX - (pivotX - fieldPanX) * (fieldZoom / oldZoom);
    fieldPanY = pivotY - (pivotY - fieldPanY) * (fieldZoom / oldZoom);
  }

  localStorage.setItem("fieldZoom", String(fieldZoom));
  applyFieldView();

  const slider = document.getElementById("zoomSlider");
  if(slider) slider.value = fieldZoom;
}

function applyFieldView(){
  const content = getFieldContent();
  if(!content) return;
  content.style.transform = `translate(${fieldPanX}px, ${fieldPanY}px) scale(${fieldZoom})`;
  localStorage.setItem("fieldPanX", String(fieldPanX));
  localStorage.setItem("fieldPanY", String(fieldPanY));
}

function zoomField(direction){
  const field = document.getElementById("field");
  const pivotX = field ? field.clientWidth / 2 : window.innerWidth / 2;
  const pivotY = field ? field.clientHeight / 2 : window.innerHeight / 2;
  setFieldZoom(fieldZoom + direction * FIELD_ZOOM_STEP, pivotX, pivotY);
}

function setupZoomControls(){
  const slider = document.getElementById("zoomSlider");
  const buttons = document.querySelectorAll("#zoomControls button");
  let repeatTimer = null;
  let repeatDelay = null;

  if(slider){
    slider.addEventListener("input", ()=>{
      setFieldZoom(Number(slider.value));
    });
  }

  buttons.forEach(button=>{
    const direction = button.textContent.trim() === "+" ? 1 : -1;
    const stopRepeat = ()=>{
      clearTimeout(repeatDelay);
      clearInterval(repeatTimer);
    };
    button.addEventListener("pointerdown", ()=>{
      stopRepeat();
      repeatDelay = setTimeout(()=>{
        repeatTimer = setInterval(()=>{ zoomField(direction); }, 80);
      }, 350);
    });
    button.addEventListener("pointerup", stopRepeat);
    button.addEventListener("pointerleave", stopRepeat);
    button.addEventListener("pointercancel", stopRepeat);
  });
}

// ===== フィールドパン =====
function setupFieldPan(field){
  let isPanning = false;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;

  field.addEventListener("pointerdown", (e)=>{
    if(e.button !== 0) return;
    if(e.target.closest(".card, .deckObject, #gameUi, #zoomControls")) return;
    if(draggingCard) return;

    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = fieldPanX;
    startPanY = fieldPanY;
    field.setPointerCapture(e.pointerId);
    field.classList.add("isPanning");
  });

  field.addEventListener("pointermove", (e)=>{
    if(!isPanning) return;
    fieldPanX = startPanX + e.clientX - startX;
    fieldPanY = startPanY + e.clientY - startY;
    applyFieldView();
  });

  function stopPan(e){
    if(!isPanning) return;
    isPanning = false;
    field.classList.remove("isPanning");
    if(field.hasPointerCapture(e.pointerId)){
      field.releasePointerCapture(e.pointerId);
    }
  }

  field.addEventListener("pointerup", stopPan);
  field.addEventListener("pointercancel", stopPan);
}

// ===== カード生成 =====
function createCard(id){
  const data = getCardData(id);
  if(!data){
    console.error("カードないにゃん:", id);
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.classList.add("card");
  wrapper.dataset.id = id;
  wrapper.dataset.instanceId = nextCardInstanceId();
  wrapper.dataset.visibility = "both";
  wrapper.dataset.owner = window.myRole || "player1";

  const img = document.createElement("img");
  setSafeSrc(img, data.image);
  img.dataset.frontSrc = data.image;
  img.draggable = false;

  const label = document.createElement("div");
  label.classList.add("cardVisibilityLabel");
  label.textContent = "";

  wrapper.appendChild(img);
  wrapper.appendChild(label);

  enablePointerDrag(wrapper);

  return wrapper;
}

function getBackImageSrc(){
  try{
    const deckCode = localStorage.getItem("deckCode");
    const list = JSON.parse(localStorage.getItem("deckList")) || [];
    const entry = list.find(d => d.code === deckCode) || list[list.length - 1];
    return entry && entry.backImage ? entry.backImage : null;
  } catch{
    return null;
  }
}

function applyCardFace(card, visibility){
  const img = card.querySelector("img");
  if(!img) return;
  const owner = card.dataset.owner || "player1";
  const isMine = owner === window.myRole;

  if(visibility === "none"){
    const back = state[owner].backImage || getBackImageSrc();
    setSafeSrc(img, back || img.dataset.frontSrc);
  } else if(visibility === "self"){
    if(isMine){
      setSafeSrc(img, img.dataset.frontSrc);
    } else {
      const back = state[owner].backImage || getBackImageSrc();
      setSafeSrc(img, back || img.dataset.frontSrc);
    }
  } else if(visibility === "opponent"){
    if(!isMine && window.myRole !== null){
      setSafeSrc(img, img.dataset.frontSrc);
    } else {
      const back = state[owner].backImage || getBackImageSrc();
      setSafeSrc(img, back || img.dataset.frontSrc);
    }
  } else {
    setSafeSrc(img, img.dataset.frontSrc);
  }
}

function cycleVisibility(card){
  const states = ["self", "both", "none"];
  const labels = { both:"", self:"自分のみ", none:"非公開" };
  const current = card.dataset.visibility || "both";
  const currentIndex = states.indexOf(current);
  const next = states[(currentIndex === -1 ? 0 : currentIndex + 1) % states.length];

  card.dataset.visibility = next;
  card.title = { both:"全体公開", self:"自分だけ見える", opponent:"相手だけ見える", none:"誰にも見えない" }[next];
  card.classList.toggle("visibilitySelf", next === "self");
  card.classList.toggle("visibilityOpponent", next === "opponent");
  card.classList.toggle("visibilityNone", next === "none");

  const label = card.querySelector(".cardVisibilityLabel");
  if(label) label.textContent = labels[next] ?? "";

  applyCardFace(card, next);
  saveFieldCards();
}

// ===== グリッド・配置 =====
function snapToGrid(value){
  return Math.round(value / CARD_GRID_SIZE) * CARD_GRID_SIZE;
}

function hasCardAt(x, y, ignoreCard){
  return Array.from(getFieldContent().querySelectorAll(".card")).some(card => {
    if(card === ignoreCard) return false;
    return Number(card.dataset.x) === x && Number(card.dataset.y) === y;
  });
}

function avoidExactOverlap(position, card){
  let x = position.x;
  let y = position.y;
  while(hasCardAt(x, y, card)){
    x += CARD_STACK_OFFSET;
    y += CARD_STACK_OFFSET;
  }
  return { x, y };
}

function placeCard(zone, card, position){
  const adjusted = avoidExactOverlap(position, card);
  const content = getFieldContent();

  card.style.left = adjusted.x + "px";
  card.style.top  = adjusted.y + "px";
  card.dataset.x  = adjusted.x;
  card.dataset.y  = adjusted.y;

  if(card.parentElement !== content){
    content.appendChild(card);
  }

  saveFieldCards();
}

function getNextFieldPosition(){
  const content = getFieldContent();
  const index = content.querySelectorAll(".card").length;
  const field = document.getElementById("field");
  const fieldWidth = field ? field.clientWidth / fieldZoom : window.innerWidth;
  const columns = Math.max(1, Math.floor((fieldWidth - 20) / 110));
  return {
    x: 20 + (index % columns) * 110,
    y: 20 + Math.floor(index / columns) * 150
  };
}

function addCardToField(id, visibility = "both"){
  const field = document.getElementById("field");
  if(!field) return;

  const card = createCard(id);
  if(!card) return;

  if(visibility !== "both"){
    card.dataset.visibility = visibility;
    const labels = { self:"自分のみ", opponent:"相手のみ", none:"非公開" };
    card.classList.toggle("visibilitySelf", visibility === "self");
    card.classList.toggle("visibilityOpponent", visibility === "opponent");
    card.classList.toggle("visibilityNone", visibility === "none");
    const label = card.querySelector(".cardVisibilityLabel");
    if(label) label.textContent = labels[visibility] || "";
    applyCardFace(card, visibility);
  }
  placeCard(field, card, getNextFieldPosition());
}

// ===== Pointer Eventsベースのドラッグ =====
function enablePointerDrag(el){
  let pointerId = null;
  let offsetX = 0, offsetY = 0;
  let isDragging = false;
  let clickStartX = 0, clickStartY = 0;
  const DRAG_THRESHOLD = 4; // px、これ以上動いたらドラッグ開始

  el.addEventListener("pointerdown", (e)=>{
    if(e.button !== 0) return;
    const myRole = window.myRole || "player1";
    if (el.dataset.owner !== myRole) return;
    if ((el.dataset.zoneType === "skill" || el.dataset.zoneType === "grave") && !isTopZoneCard(el)) return;
    e.stopPropagation();

    // 触った順にz-indexを上げる
    if(!el.classList.contains("deckObject")){
      el.style.zIndex = ++cardZCounter;
    }

    pointerId = e.pointerId;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
    isDragging = false;
    el.dataset.prevX = el.dataset.x || "0";
    el.dataset.prevY = el.dataset.y || "0";
    el.dataset.prevZoneType = el.dataset.zoneType || "";
    document.body.classList.add("isInteractingCard");

    // カードのフィールド座標上での掴み位置を計算
    const rect = el.getBoundingClientRect();
    // スクリーン座標のオフセットをフィールド座標に変換
    offsetX = (e.clientX - rect.left) / fieldZoom;
    offsetY = (e.clientY - rect.top)  / fieldZoom;

    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener("pointermove", (e)=>{
    if(e.pointerId !== pointerId) return;

    const dx = e.clientX - clickStartX;
    const dy = e.clientY - clickStartY;

    if(!isDragging){
      if(Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) return;
      isDragging = true;
      draggingCard = el;
      el.style.opacity = "0.85";
      document.body.classList.add("isDraggingCard");
    }

    // スクリーン座標 → フィールド座標に変換して配置
    const field = document.getElementById("field");
    const fieldRect = field.getBoundingClientRect();
    
    const fx = (e.clientX - fieldRect.left - fieldPanX) / fieldZoom;
    const fy = (e.clientY - fieldRect.top  - fieldPanY) / fieldZoom;
    
    const fieldX = fx - offsetX;
    const fieldY = fy - offsetY;

    el.style.left = fieldX + "px";
    el.style.top  = fieldY + "px";
  });

  el.addEventListener("pointerup", (e)=>{
    if(e.pointerId !== pointerId) return;

    el.style.opacity = "";
    document.body.classList.remove("isDraggingCard");

    if(isDragging){
      isDragging = false;
      draggingCard = null;

      // 自分のデッキオブジェクトへのドロップ判定
      const myRole = (typeof window.getMyRole === "function") ? window.getMyRole() : "player1";
      const deckObj = getFieldContent().querySelector(`.deckObject[data-owner="${myRole}"]`);
      if(deckObj){
        const deckRect = deckObj.getBoundingClientRect();
        const cardRect = el.getBoundingClientRect();
        const overlapW = Math.max(0, Math.min(cardRect.right, deckRect.right) - Math.max(cardRect.left, deckRect.left));
        const overlapH = Math.max(0, Math.min(cardRect.bottom, deckRect.bottom) - Math.max(cardRect.top, deckRect.top));
        const overlapArea = overlapW * overlapH;
        const cardArea = cardRect.width * cardRect.height;
        const overlapRatio = overlapArea / cardArea;

        if(overlapRatio >= 0.8 && el.dataset.id){
          el.remove();
          saveFieldCards();
          if(typeof returnToDeck === "function"){
            const isTemp = el.dataset.isTemp === "true";
            returnToDeck(el.dataset.id, isTemp);
          }
          document.body.classList.remove("isDraggingCard");
          document.body.classList.remove("isInteractingCard");
          return;
        }
      }

      // グリッドにスナップして確定
      const field = document.getElementById("field");
      const fieldRect = field.getBoundingClientRect();
      
      const fx = (e.clientX - fieldRect.left - fieldPanX) / fieldZoom;
      const fy = (e.clientY - fieldRect.top  - fieldPanY) / fieldZoom;
      
      const fieldX = snapToGrid(fx - offsetX);
      const fieldY = snapToGrid(fy - offsetY);

      // 自分のゾーンへドロップ判定
      const myRole2 = window.myRole || "player1";
      const centerX = fieldX + CARD_W / 2;
      const centerY = fieldY + CARD_H / 2;
      const zoneHit = BATTLE_ZONE_TYPES.find((type) => {
        const a = getZoneAnchor(myRole2, type);
        return centerX >= a.x && centerX <= a.x + ZONE_RECT.w && centerY >= a.y && centerY <= a.y + ZONE_RECT.h;
      });
      if (zoneHit) {
        placeCardInZone(el, myRole2, zoneHit);
        if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
        saveFieldCards();
        pointerId = null;
        document.body.classList.remove("isInteractingCard");
        return;
      }

      // ゾーンから出した場合は通常カードへ戻す
      if (el.dataset.prevZoneType) {
        clearZoneMarker(el);
      }

      el.style.left = fieldX + "px";
      el.style.top  = fieldY + "px";
      el.dataset.x  = fieldX;
      el.dataset.y  = fieldY;
      
      // 手札エリアでのドラッグ移動の場合、handOrder を更新
      if (el.dataset.owner === myRole2 && fieldY >= 1500) {
        // このカードが手札エリアにドロップされた
        const content = getFieldContent();
        if (content) {
          const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
          const otherHandCards = cards.filter(c => 
            c.dataset.owner === myRole2 && 
            Number(c.dataset.y) >= 1500 && 
            c !== el
          );
          
          if (otherHandCards.length > 0) {
            // ドロップ位置 x 座標に基づいて、どのカードの前か後ろかを判定
            otherHandCards.sort((a, b) => {
              const xa = Number(a.dataset.x || 0);
              const xb = Number(b.dataset.x || 0);
              return xa - xb;
            });
            
            const dropX = fieldX + CARD_W / 2; // ドロップされたカードの中心 X 座標
            let insertAfterCard = null;
            
            for (let i = 0; i < otherHandCards.length; i++) {
              const cardCenterX = Number(otherHandCards[i].dataset.x || 0) + CARD_W / 2;
              if (dropX > cardCenterX) {
                insertAfterCard = otherHandCards[i];
              } else {
                break;
              }
            }
            
            // handOrder を計算
            if (insertAfterCard) {
              // insertAfterCard の直後に挿入
              const afterOrder = Number(insertAfterCard.dataset.handOrder || 0);
              const nextCardInOrder = otherHandCards.find(c => Number(c.dataset.handOrder || 0) > afterOrder);
              if (nextCardInOrder) {
                const nextOrder = Number(nextCardInOrder.dataset.handOrder || 0);
                el.dataset.handOrder = String((afterOrder + nextOrder) / 2);
              } else {
                el.dataset.handOrder = String(afterOrder + 1000);
              }
            } else {
              // 最初に挿入
              const firstCard = otherHandCards[0];
              const firstOrder = Number(firstCard.dataset.handOrder || 0);
              el.dataset.handOrder = String(firstOrder - 1000);
            }
          }
        }
      }
      
      if (typeof window.organizeHands === "function") window.organizeHands();
      if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
      
      saveFieldCards();

    } else {
      // ドラッグなし = クリック → ダブルクリックはブラウザが検出
    }

    pointerId = null;
    document.body.classList.remove("isInteractingCard");
  });

  el.addEventListener("pointercancel", (e)=>{
    if(e.pointerId !== pointerId) return;
    el.style.opacity = "";
    isDragging = false;
    draggingCard = null;
    document.body.classList.remove("isDraggingCard");
    document.body.classList.remove("isInteractingCard");
    pointerId = null;
  });

  // ダブルクリックでvisibility切り替え（デッキオブジェクトは除外）
  el.addEventListener("dblclick", ()=>{
    if(el.classList.contains("deckObject")) return;
    cycleVisibility(el);
  });
}

function focusOnDeck(){
  const myRole = window.getMyRole() || "player1";
  const deckObj = document.querySelector(`.deckObject[data-owner="${myRole}"]`);
  if(!deckObj) return;

  const dx = parseFloat(deckObj.style.left);
  const dy = parseFloat(deckObj.style.top);
  if(isNaN(dx) || isNaN(dy)) return;

  const field = document.getElementById("field");
  if(!field) return;
  const vw = field.clientWidth || window.innerWidth;
  const vh = field.clientHeight || window.innerHeight;

  // デッキ(320x453)の中心が画面中央に来るように
  fieldPanX = (vw / 2) - (dx + 160) * fieldZoom;
  fieldPanY = (vh / 2) - (dy + 226) * fieldZoom;

  applyFieldView();
}
window.focusOnDeck = focusOnDeck;

function centerField(){
  const field = document.getElementById("field");
  if(!field) return;
  const vw = field.clientWidth || window.innerWidth;
  const vh = field.clientHeight || window.innerHeight;
  
  // 中央に配置
  fieldPanX = (vw / 2) - (FIELD_W / 2) * fieldZoom;
  fieldPanY = (vh / 2) - (FIELD_H / 2) * fieldZoom;
  
  applyFieldView();
}

// ===== 初期化 =====
async function initCards(){
  if(CARD_DB.length === 0){
    await loadCardData();
  }

  // フィールドサイズを設定
  const content = getFieldContent();
  content.style.width  = FIELD_W + "px";
  content.style.height = FIELD_H + "px";

  // 最小ズームをウィンドウサイズから計算
  FIELD_ZOOM_MIN = 0.15;
  FIELD_ZOOM_MAX = 0.8;
  const slider = document.getElementById("zoomSlider");
  if(slider) {
    slider.min = FIELD_ZOOM_MIN;
    slider.max = FIELD_ZOOM_MAX;
    slider.value = fieldZoom;
  }

  // 手札エリアの描画
  if(!document.getElementById("myHandZoneBg")) {
    const myHandBg = document.createElement("div");
    myHandBg.id = "myHandZoneBg";
    myHandBg.className = "handZoneBg myHandZoneBg";
    myHandBg.innerHTML = '<div class="handZoneLabel">手札エリア (ドロップで自動整列)</div><div id="myHandLimitDisplay" class="handLimitDisplay"></div>';
    content.appendChild(myHandBg);

    const opHandBg = document.createElement("div");
    opHandBg.id = "opHandZoneBg";
    opHandBg.className = "handZoneBg opHandZoneBg";
    opHandBg.innerHTML = '<div class="handZoneLabel">相手の手札エリア</div>';
    content.appendChild(opHandBg);
  }
  ensureBattleZoneUIs();
  updateBattleZoneUI();

  applyFieldView();
  centerField();
  setupZoomControls();

  const field = document.getElementById("field");
  if(field){
    setupFieldPan(field);
    // ブラウザデフォルトのドラッグを無効化
    field.addEventListener("dragstart", (e) => e.preventDefault());
  }

  document.addEventListener("wheel", (e)=>{
    // チャットや各種UI上ではブラウザデフォルトのスクロールを許可する
    if(e.target.closest("#gameUiPlayer, #gameUiEnemy, #chatArea, #chatLogs, #menuButton, #menuPanel, #optionsModal, #confirmModal, #zoomControls, .modal, .modal-content, #devModal, .scrollable")) return;
    
    e.preventDefault();
    const field = document.getElementById("field");
    const rect = field ? field.getBoundingClientRect() : { left:0, top:0 };
    
    const pivotX = e.clientX - rect.left;
    const pivotY = e.clientY - rect.top;
    
    setFieldZoom(fieldZoom + (e.deltaY < 0 ? 1 : -1) * FIELD_ZOOM_STEP, pivotX, pivotY);
  }, { passive:false });

  restoreFieldCards();
  if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
  window.dispatchEvent(new Event("cardsReady"));
}

// ===== フィールド状態の保存・復元 =====
window.getFieldData = function() {
  repairDuplicateDomInstanceIds();
  const cards = Array.from(getFieldContent().querySelectorAll(".card, .deckObject"));
  return cards
    .filter(card => {
      if (card.classList.contains("deckObject")) {
        return card.dataset.owner === window.myRole;
      }
      return true;
    })
    .map(card => ({
      id: card.dataset.id || null,
      instanceId: card.dataset.instanceId,
      x: typeof toServerX === "function" ? toServerX(card.dataset.x) : Number(card.dataset.x),
      y: typeof toServerY === "function" ? toServerY(card.dataset.y) : Number(card.dataset.y),
      owner: card.dataset.owner || "player1",
      visibility: card.dataset.visibility || "both",
      origin: card.dataset.origin || "",
      zoneType: card.dataset.zoneType || "",
      zoneOwner: card.dataset.zoneOwner || "",
      zoneOrder: Number(card.dataset.zoneOrder || 0),
      handOrder: Number(card.dataset.handOrder || 0),
      isDeck: card.classList.contains("deckObject"),
      isTemp: card.dataset.isTemp === "true"
    }));
};

// 手札枚数上限の計算（windowスコープ）
window.getHandLimit = function(owner) {
  const baseLimit = 6;
  const s = (typeof state !== "undefined") ? state[owner] : null;
  if (!s || !s.evolutionPath || s.evolutionPath !== "忍耐の道") {
    return baseLimit;
  }
  // 忍耐の道: 手札上限+2、最大レベル時は+3
  const level = s.level || 1;
  if (level >= 6) {
    return baseLimit + 3;
  } else if (level >= 5) {
    return baseLimit + 2;
  } else if (level >= 3) {
    return baseLimit + 1;
  }
  return baseLimit;
};

window.prevMyHandCount = -1;

window.organizeHands = function() {
  const content = getFieldContent();
  if(!content) return;
  const myRole = window.myRole || "player1";
  
  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  const myHandCards = cards.filter(c => c.dataset.owner === myRole && Number(c.dataset.y) >= 1500);
  
  if (myHandCards.length > 0) {
    // 手札のソート規則を手札に加えた順に変更
    myHandCards.sort((a, b) => {
      const oa = Number(a.dataset.handOrder || 0);
      const ob = Number(b.dataset.handOrder || 0);
      return oa - ob;
    });

    const spacing = 40;
    let startX = 40; // 左端詰め
    const handY = FIELD_H - CARD_H - 20;

    myHandCards.forEach((c) => {
      if (c === draggingCard) return; // ドラッグ中は動かさない
      c.style.left = startX + "px";
      c.style.top = handY + "px";
      c.dataset.x = startX;
      c.dataset.y = handY;
      c.style.zIndex = ++cardZCounter;
      startX += CARD_W + spacing;
    });
  }

  // 手札枚数の変更をチャットに記録
  if (window.prevMyHandCount !== -1 && window.prevMyHandCount !== myHandCards.length) {
    if (typeof addGameLog === "function") {
      addGameLog(`[SYSTEM] ${window.myUsername || state[myRole]?.username || myRole} の手札が ${myHandCards.length} 枚になりました。`);
    }
  }

  // 手札枚数上限表示の更新
  const limitDisplay = document.getElementById("myHandLimitDisplay");
  if (limitDisplay) {
    const limit = window.getHandLimit(myRole);
    limitDisplay.textContent = `${myHandCards.length}/${limit}`;
    limitDisplay.style.color = myHandCards.length > limit ? "#ff6666" : "#c7b377";
  }

  window.prevMyHandCount = myHandCards.length;
};

function saveFieldCards(){
  lastLocalFieldSaveAt = Date.now();
  const data = window.getFieldData();
  localStorage.setItem("fieldCards", JSON.stringify(data));

  if (typeof _pushFieldCardsDebounced === "function") {
    _pushFieldCardsDebounced(data);
  }
}

function restoreFieldCards(){
  const raw = localStorage.getItem("fieldCards");
  if(!raw) return;
  let data;
  try{ data = JSON.parse(raw); } catch{ return; }
  applyFieldCardsFromServer(data);
}

window.applyFieldCardsFromServer = function(data){
  if(document.body.classList.contains("isInteractingCard")) return;
  if(Date.now() - lastLocalFieldSaveAt < 500) return;
  const normalized = normalizeFieldCardData(data);
  data = normalized.data;
  const content = getFieldContent();
  const domRepaired = repairDuplicateDomInstanceIds();
  const serverIds = new Set(data.map(d => d.instanceId));
  
  content.querySelectorAll(".card").forEach(el => {
    if(el.dataset.instanceId && !serverIds.has(el.dataset.instanceId)){
      el.remove();
    }
  });

  data.forEach(item => {
    let el = findFieldElementByInstanceId(item.instanceId);
    const localX = toLocalX(item.x);
    const localY = toLocalY(item.y);

    if(item.isDeck){
      // 自分のデッキの位置情報はサーバーからは無視する（ローカルのルールを優先）
      if(item.owner === window.myRole) return;
      
      if(el){
        el.style.left = localX + "px";
        el.style.top = localY + "px";
        el.dataset.x = localX;
        el.dataset.y = localY;
      } else {
        // まだ生成されていない相手のデッキ位置を保存しておく
        window._savedDeckPos = { x: localX, y: localY };
      }
      return;
    }

    if(!el){
      el = createCard(item.id);
      if(!el) return;
      el.dataset.instanceId = item.instanceId;
      content.appendChild(el);
    }
    
    el.style.left = localX + "px";
    el.style.top = localY + "px";
    el.dataset.x = localX;
    el.dataset.y = localY;
    if(item.owner) el.dataset.owner = item.owner;
    if(item.origin) el.dataset.origin = item.origin; // 出自を復元
    if (item.zoneType) el.dataset.zoneType = item.zoneType;
    else delete el.dataset.zoneType;
    if (item.zoneOwner) el.dataset.zoneOwner = item.zoneOwner;
    else delete el.dataset.zoneOwner;
    if (item.zoneOrder) el.dataset.zoneOrder = String(item.zoneOrder);
    else delete el.dataset.zoneOrder;
    if (item.handOrder) el.dataset.handOrder = String(item.handOrder);
    else delete el.dataset.handOrder;
    el.dataset.isTemp = item.isTemp ? "true" : "false";
    
    // 相手のカードかどうかを判定（window.myRole が null の場合も考慮）
    const myRole = window.myRole || window.getMyRole?.() || localStorage.getItem("gamePlayerKey");
    if(item.owner && item.owner !== myRole && myRole !== null){
      el.classList.add("opponent-card");
    } else {
      el.classList.remove("opponent-card");
    }

    const vis = item.visibility || "both";
    el.dataset.visibility = vis;
    const labels = { self:"自分のみ", opponent:"相手のみ", none:"非公開", both:"" };
    el.classList.toggle("visibilitySelf", vis === "self");
    el.classList.toggle("visibilityOpponent", vis === "opponent");
    el.classList.toggle("visibilityNone", vis === "none");
    const label = el.querySelector(".cardVisibilityLabel");
    if(label) label.textContent = labels[vis] || "";
    applyCardFace(el, vis);
  });
  if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
  if(normalized.repaired || domRepaired) saveFieldCards();
};
