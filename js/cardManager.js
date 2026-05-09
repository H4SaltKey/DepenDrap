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
    img.src = "assets/cards/cd0000.png";
    img.onerror = null;
  };
  img.src = src || "assets/cards/cd0000.png";
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
const FIELD_ZOOM_MAX = 0.9;
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
    e.stopPropagation();

    // 触った順にz-indexを上げる
    if(!el.classList.contains("deckObject")){
      el.style.zIndex = ++cardZCounter;
    }

    pointerId = e.pointerId;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
    isDragging = false;
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

      el.style.left = fieldX + "px";
      el.style.top  = fieldY + "px";
      el.dataset.x  = fieldX;
      el.dataset.y  = fieldY;
      
      if (typeof window.organizeHands === "function") window.organizeHands();
      
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
  FIELD_ZOOM_MIN = 0.3;
  FIELD_ZOOM_MAX = 0.8;
  const slider = document.getElementById("zoomSlider");
  if(slider) {
    slider.min = FIELD_ZOOM_MIN;
    slider.max = FIELD_ZOOM_MAX;
  }

  // 手札エリアの描画
  if(!document.getElementById("myHandZoneBg")) {
    const myHandBg = document.createElement("div");
    myHandBg.id = "myHandZoneBg";
    myHandBg.style.cssText = "position:absolute; bottom:0; left:0; width:100%; height:500px; background:rgba(0,0,0,0.15); border-top:2px dashed rgba(200,150,50,0.3); pointer-events:none; z-index:0;";
    myHandBg.innerHTML = '<div style="position:absolute; top:20px; left:30px; font-size:24px; color:rgba(200,150,50,0.5); font-weight:bold;">手札エリア (ドロップで自動整列)</div>';
    content.appendChild(myHandBg);

    const opHandBg = document.createElement("div");
    opHandBg.id = "opHandZoneBg";
    opHandBg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:500px; background:rgba(0,0,0,0.15); border-bottom:2px dashed rgba(200,150,50,0.3); pointer-events:none; z-index:0;";
    opHandBg.innerHTML = '<div style="position:absolute; bottom:20px; right:30px; font-size:24px; color:rgba(200,150,50,0.5); font-weight:bold; transform: rotate(180deg);">相手の手札エリア</div>';
    content.appendChild(opHandBg);
  }

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
      isDeck: card.classList.contains("deckObject"),
      isTemp: card.dataset.isTemp === "true"
    }));
};

window.prevMyHandCount = -1;

window.organizeHands = function() {
  const content = getFieldContent();
  if(!content) return;
  const myRole = window.myRole || "player1";
  
  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  const myHandCards = cards.filter(c => c.dataset.owner === myRole && Number(c.dataset.y) >= 1500);
  
  if (myHandCards.length > 0) {
    myHandCards.sort((a, b) => Number(a.dataset.x) - Number(b.dataset.x));
    
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
  if(normalized.repaired || domRepaired) saveFieldCards();
};
