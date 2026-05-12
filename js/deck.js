let deck = [];
let cardsPage = 0;
let deckPage = 0;

const PAGE_SIZE = 8;
const DECK_PAGE_SIZE = 6;
const MAX_COPIES = 3;

// URLパラメータからデッキIDを取得
const DECK_ID = new URLSearchParams(location.search).get("deckId");

// ===== デッキリスト操作 =====
function loadDeckList() {
  try {
    return JSON.parse(localStorage.getItem("deckList")) || [];
  } catch {
    return [];
  }
}

function saveDeckList(list) {
  localStorage.setItem("deckList", JSON.stringify(list));
}

function getCurrentDeckEntry() {
  if (!DECK_ID) return null;
  return loadDeckList().find(d => d.id === DECK_ID) || null;
}

function saveCurrentDeckCode(code) {
  if (!DECK_ID) return;
  const list = loadDeckList();
  const entry = list.find(d => d.id === DECK_ID);
  if (entry) {
    entry.code = code;
    saveDeckList(list);
  }
  // 後方互換: game.htmlが参照するdeckCodeも更新
  localStorage.setItem("deckCode", code);
}

// ===== デッキ読み込み =====
async function loadDeck() {
  const deckMessage = document.getElementById("deckMessage");
  const entry = getCurrentDeckEntry();

  let code = "empty";
  if (entry) {
    code = entry.code;
  } else {
    // deckIdなし（直接アクセス）: 旧来のlocalStorageにフォールバック
    code = localStorage.getItem("deckCode") || "empty";
  }

  try {
    deck = decodeDeck(code);
  } catch (e) {
    if (e.message === "OLD_DECK_CODE") {
      deckMessage.innerText = "カード構成が変わったためデッキをリセットしました。";
      saveCurrentDeckCode("empty");
    } else {
      deckMessage.innerText = "デッキ情報を読み込めませんでした。";
    }
    deck = [];
  }
}

// ===== カード操作 =====
function addCard(id) {
  if (getDeckCount(id) >= MAX_COPIES) {
    showDeckMessage("同じカードは3枚までです。");
    return;
  }
  deck.push(id);
  sortDeck();
  render();
}

function removeCard(id) {
  const index = deck.indexOf(id);
  if (index === -1) return;
  deck.splice(index, 1);
  sortDeck();
  render();
}

function sortDeck() {
  const order = getSortedCardIds();
  deck.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function getSortedCardIds() {
  return getDeckCardIds();
}

function getDeckCount(id) {
  return deck.filter(cardId => cardId === id).length;
}

function getDeckEntries() {
  return getSortedCardIds()
    .map(id => ({ id, count: getDeckCount(id) }))
    .filter(entry => entry.count > 0);
}

function showDeckMessage(text) {
  const deckMessage = document.getElementById("deckMessage");
  deckMessage.innerText = text;
  setTimeout(() => {
    if (deckMessage.innerText === text) deckMessage.innerText = "";
  }, 1600);
}

// ===== ページング =====
function clampPage(page, totalItems, pageSize = PAGE_SIZE) {
  const maxPage = Math.max(0, Math.ceil(totalItems / pageSize) - 1);
  return Math.max(0, Math.min(maxPage, page));
}

function getPageItems(items, page, pageSize = PAGE_SIZE) {
  return items.slice(page * pageSize, page * pageSize + pageSize);
}

// ===== カード要素生成 =====
function createCardElement(id, count, source) {
  const card = getCardData(id);
  const el = document.createElement("div");
  el.className = "deckCard";
  el.draggable = true;
  el.dataset.id = id;
  el.dataset.source = source;

  const imageSrc = card.image ? encodeURI(card.image) : "assets/404.png";
  el.innerHTML = `
    <img src="${imageSrc}" alt="">
    ${card.name ? `<div class="deckCardName">${card.name}</div>` : ""}
    ${count ? `<div class="deckCardCount">×${count}</div>` : ""}
  `;

  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("source", source);
  });

  el.addEventListener("click", (e) => {
    if (e.button !== 0) return;
    if (source === "cards") addCard(id);
    else removeCard(id);
    hideDeckContextMenu();
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (source === "cards") {
      openDeckContextMenu(e.pageX, e.pageY, id, "add");
    } else {
      openDeckContextMenu(e.pageX, e.pageY, id, "remove");
    }
  });

  return el;
}

function openDeckContextMenu(x, y, id, action) {
  const menu = document.getElementById("deckContextMenu");
  if (!menu) return;
  const options = action === "add" ? [1, 2, 3] : [1, 2, 3];
  menu.innerHTML = options.map(count => {
    const label = action === "add" ? `+${count}枚追加` : `-${count}枚削除`;
    return `<div class="context-item" data-count="${count}">${label}</div>`;
  }).join("");

  menu.style.display = "block";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.minWidth = "140px";
  menu.style.color = "#f4f1d6";
  menu.style.fontSize = "13px";
  menu.style.lineHeight = "1.7";
  menu.style.border = "1px solid rgba(255,255,255,0.12)";
  menu.style.background = "rgba(12,11,18,0.98)";
  menu.style.backdropFilter = "blur(10px)";
  menu.style.padding = "4px 0";
  menu.style.boxSizing = "border-box";

  Array.from(menu.children).forEach(item => {
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.whiteSpace = "nowrap";
  });

  menu.querySelectorAll(".context-item").forEach(item => {
    item.addEventListener("click", () => {
      const count = Number(item.dataset.count);
      if (action === "add") {
        for (let i = 0; i < count; i++) addCard(id);
      } else {
        for (let i = 0; i < count; i++) removeCard(id);
      }
      hideDeckContextMenu();
    });
  });
}

function hideDeckContextMenu() {
  const menu = document.getElementById("deckContextMenu");
  if (menu) menu.style.display = "none";
}

window.addEventListener("click", (e) => {
  const menu = document.getElementById("deckContextMenu");
  if (!menu || menu.style.display !== "block") return;
  if (e.target.closest && e.target.closest("#deckContextMenu")) return;
  hideDeckContextMenu();
});

window.addEventListener("scroll", hideDeckContextMenu);
window.addEventListener("resize", hideDeckContextMenu);

// ===== 描画 =====
function render() {
  const cardsDiv = document.getElementById("cards");
  const deckDiv = document.getElementById("deck");
  const cardIds = getSortedCardIds();
  const deckEntries = getDeckEntries();

  cardsPage = clampPage(cardsPage, cardIds.length);
  deckPage = clampPage(deckPage, deckEntries.length, DECK_PAGE_SIZE);
  cardsDiv.innerHTML = "";
  deckDiv.innerHTML = "";

  getPageItems(cardIds, cardsPage, PAGE_SIZE).forEach(id => {
    cardsDiv.appendChild(createCardElement(id, 0, "cards"));
  });
  for (let i = cardsDiv.children.length; i < PAGE_SIZE; i++) {
    cardsDiv.appendChild(document.createElement("div")).className = "deckCard empty";
  }

  getPageItems(deckEntries, deckPage, DECK_PAGE_SIZE).forEach(entry => {
    deckDiv.appendChild(createCardElement(entry.id, entry.count, "deck"));
  });
  for (let i = deckDiv.children.length; i < DECK_PAGE_SIZE; i++) {
    deckDiv.appendChild(document.createElement("div")).className = "deckCard empty";
  }

  const code = encodeDeck(deck);
  saveCurrentDeckCode(code);
  document.getElementById("deckCode").innerText = code;
  updatePagerButtons(cardIds.length, deckEntries.length);
}

function updatePagerButtons(cardTotal, deckTotal) {
  document.getElementById("cardsPrev").disabled = cardsPage <= 0;
  document.getElementById("cardsNext").disabled = cardsPage >= Math.ceil(cardTotal / PAGE_SIZE) - 1;
  document.getElementById("deckPrev").disabled = deckPage <= 0;
  document.getElementById("deckNext").disabled = deckPage >= Math.ceil(deckTotal / DECK_PAGE_SIZE) - 1;
}

// ===== ドロップゾーン =====
function setupDropZone(el, onDrop) {
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    onDrop(e.dataTransfer.getData("text/plain"), e.dataTransfer.getData("source"));
  });
}

// ===== セットアップ =====
function setupDeckBuilder() {
  document.getElementById("cardsPrev").onclick = () => { cardsPage--; render(); };
  document.getElementById("cardsNext").onclick = () => { cardsPage++; render(); };
  document.getElementById("deckPrev").onclick  = () => { deckPage--;  render(); };
  document.getElementById("deckNext").onclick  = () => { deckPage++;  render(); };

  setupDropZone(document.getElementById("deck"), (id, source) => {
    if (source === "cards") addCard(id);
  });
  setupDropZone(document.getElementById("cards"), (id, source) => {
    if (source === "deck") removeCard(id);
  });
}

// ===== デッキ名表示 =====
function showDeckTitle() {
  const entry = getCurrentDeckEntry();
  const titleEl = document.getElementById("deckTitle");
  if (titleEl && entry) titleEl.textContent = entry.name;
}

// ===== 裏面画像 =====
function saveBackImage(dataUrl) {
  if (!DECK_ID) return;
  const list = loadDeckList();
  const entry = list.find(d => d.id === DECK_ID);
  if (entry) {
    entry.backImage = dataUrl || "";
    saveDeckList(list);
  }
}

function showBackImagePreview(dataUrl) {
  const img = document.getElementById("backImagePreviewImg");
  const none = document.getElementById("backImagePreviewNone");
  if (dataUrl) {
    img.onerror = () => {
      // 裏面画像の読み込みに失敗した場合、404.png をフォールバック表示
      img.src = "assets/404.png";
      img.onerror = null;
    };
    img.src = dataUrl;
    img.style.display = "";
    none.style.display = "none";
  } else {
    img.src = "";
    img.onerror = null;
    img.style.display = "none";
    none.style.display = "";
  }
}

function setupBackImageUI() {
  const entry = getCurrentDeckEntry();
  if (entry && entry.backImage) {
    showBackImagePreview(entry.backImage);
  }

  document.getElementById("btnSetBackImage").addEventListener("click", () => {
    document.getElementById("backImageInput").click();
  });
  document.getElementById("backImagePreview").addEventListener("click", () => {
    document.getElementById("backImageInput").click();
  });

  document.getElementById("backImageInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      saveBackImage(ev.target.result);
      showBackImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });

  document.getElementById("btnClearBackImage").addEventListener("click", () => {
    saveBackImage("");
    showBackImagePreview("");
  });
}

// ===== 起動 =====
loadCardData()
  .catch(() => {})
  .then(() => loadDeck())
  .then(() => {
    sortDeck();
    setupDeckBuilder();
    showDeckTitle();
    setupBackImageUI();
    render();
  });

// ===== コードから読み込み（デッキ構築画面） =====
document.getElementById("btnLoadCode").addEventListener("click", () => {
  const row = document.getElementById("codeImportRow");
  const isHidden = row.classList.contains("hidden");
  row.classList.toggle("hidden", !isHidden);
  document.getElementById("codeImportError").textContent = "";
  if (isHidden) document.getElementById("codeImportInput").focus();
});

document.getElementById("codeImportCancel").addEventListener("click", () => {
  document.getElementById("codeImportRow").classList.add("hidden");
  document.getElementById("codeImportError").textContent = "";
});

document.getElementById("codeImportConfirm").addEventListener("click", () => {
  const code = document.getElementById("codeImportInput").value.trim();
  const errorEl = document.getElementById("codeImportError");

  if (!code) {
    errorEl.textContent = "コードを入力してください。";
    return;
  }

  try {
    deck = decodeDeck(code);
  } catch (e) {
    if (e.message === "OLD_DECK_CODE") {
      errorEl.textContent = "古いデッキコードです。現在のカード構成と合いません。";
    } else {
      errorEl.textContent = "無効なデッキコードです。";
    }
    return;
  }

  sortDeck();
  saveCurrentDeckCode(encodeDeck(deck));
  document.getElementById("codeImportRow").classList.add("hidden");
  document.getElementById("codeImportError").textContent = "";
  document.getElementById("codeImportInput").value = "";
  render();
});

document.getElementById("codeImportInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("codeImportConfirm").click();
  if (e.key === "Escape") document.getElementById("codeImportCancel").click();
});
