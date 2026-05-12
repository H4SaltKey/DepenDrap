let deck = [];
let cardFilters = {
  tag: "",
  attribute: "all",
  type: "all"
};

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

function getFilteredCardIds() {
  const queryTag = cardFilters.tag.trim().toLowerCase();
  return getSortedCardIds().filter(id => {
    const card = getCardData(id);
    if (!card) return false;
    if (cardFilters.attribute !== "all" && card.attribute !== cardFilters.attribute) return false;
    if (cardFilters.type !== "all" && card.type !== cardFilters.type) return false;
    if (queryTag) {
      const tags = Array.isArray(card.tags) ? card.tags : String(card.tags || "").split(/[,、\s]+/);
      if (!tags.some(tag => String(tag || "").toLowerCase().includes(queryTag))) return false;
    }
    return true;
  });
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
    e.dataTransfer.effectAllowed = "move";

    // Hide default ghost image
    const emptyImage = new Image();
    e.dataTransfer.setDragImage(emptyImage, 0, 0);

    // Remove any stale preview first
    const existingPreview = document.getElementById("dragPreview");
    if (existingPreview) existingPreview.remove();

    // Create and show custom drag preview
    const dragPreview = document.createElement("div");
    dragPreview.id = "dragPreview";
    dragPreview.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 99999;
      display: none;
      opacity: 0.9;
      border: 1px solid rgba(199,179,119,0.35);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      background: rgba(10,10,16,0.92);
    `;
    dragPreview.innerHTML = el.innerHTML;
    const scale = 0.6;
    dragPreview.style.width = Math.round(el.offsetWidth * scale) + "px";
    dragPreview.style.height = Math.round(el.offsetHeight * scale) + "px";
    dragPreview.style.overflow = "hidden";
    dragPreview.style.display = "block";
    document.body.appendChild(dragPreview);

    // Update position on drag
    const movePreview = (evt) => {
      dragPreview.style.left = (evt.clientX + 12) + "px";
      dragPreview.style.top = (evt.clientY + 12) + "px";
    };
    
    const cleanup = () => {
      dragPreview.remove();
      document.removeEventListener("dragover", movePreview);
      document.removeEventListener("dragend", cleanup);
    };

    document.addEventListener("dragover", movePreview);
    document.addEventListener("dragend", cleanup);
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
  menu.innerHTML = `<div class="context-item" data-action="zoom">拡大表示</div>` + options.map(count => {
    const label = action === "add" ? `+${count}枚追加` : `-${count}枚削除`;
    return `<div class="context-item" data-count="${count}">${label}</div>`;
  }).join("");

  menu.classList.remove("hidden");
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
      const actionType = item.dataset.action || "count";
      if (actionType === "zoom") {
        showCardZoom(id);
      } else {
        const count = Number(item.dataset.count);
        if (action === "add") {
          for (let i = 0; i < count; i++) addCard(id);
        } else {
          for (let i = 0; i < count; i++) removeCard(id);
        }
      }
      hideDeckContextMenu();
    });
  });
}

function hideDeckContextMenu() {
  const menu = document.getElementById("deckContextMenu");
  if (menu) {
    menu.style.display = "none";
    menu.classList.add("hidden");
  }
}

function showCardZoom(id) {
  const card = getCardData(id);
  if (!card) return;
  const modal = document.getElementById("cardZoomModal");
  if (!modal) return;
  const image = document.getElementById("cardZoomImage");
  const info = document.getElementById("cardZoomInfo");
  image.src = card.image ? encodeURI(card.image) : "assets/404.png";
  image.onerror = () => { image.src = "assets/404.png"; };
  const tags = Array.isArray(card.tags) ? card.tags.join(" ") : String(card.tags || "");
  info.textContent = `ID: ${card.id} │ ${card.attribute || "近接"} / ${card.type || "アタッカー"}${tags ? ` │ ${tags}` : ""}`;
  modal.classList.remove("hidden");
}

function hideCardZoom() {
  const modal = document.getElementById("cardZoomModal");
  if (modal) modal.classList.add("hidden");
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideCardZoom();
});

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
  const cardIds = getFilteredCardIds();
  const deckEntries = getDeckEntries();

  cardsDiv.innerHTML = "";
  deckDiv.innerHTML = "";

  cardIds.forEach(id => cardsDiv.appendChild(createCardElement(id, 0, "cards")));
  deckEntries.forEach(entry => deckDiv.appendChild(createCardElement(entry.id, entry.count, "deck")));

  const code = encodeDeck(deck);
  saveCurrentDeckCode(code);
  const codeInput = document.getElementById("deckCodeInput");
  if (codeInput) codeInput.value = code;

  updateCardsScrollButtons();
  updateDeckScrollButtons();
}

function scrollContainer(container, amount) {
  if (!container) return;
  container.scrollBy({
    left: amount,
    behavior: "smooth"
  });
}

function updateCardsScrollButtons() {
  const cardsDiv = document.getElementById("cards");
  const cardsPrev = document.getElementById("cardsPrev");
  const cardsNext = document.getElementById("cardsNext");
  if (!cardsDiv || !cardsPrev || !cardsNext) return;
  const max = cardsDiv.scrollWidth - cardsDiv.clientWidth;
  cardsPrev.disabled = cardsDiv.scrollLeft <= 0;
  cardsNext.disabled = cardsDiv.scrollLeft >= max - 1;
}

function updateDeckScrollButtons() {
  const deckDiv = document.getElementById("deck");
  const deckPrev = document.getElementById("deckPrev");
  const deckNext = document.getElementById("deckNext");
  if (!deckDiv || !deckPrev || !deckNext) return;
  const max = deckDiv.scrollWidth - deckDiv.clientWidth;
  deckPrev.disabled = deckDiv.scrollLeft <= 0;
  deckNext.disabled = deckDiv.scrollLeft >= max - 1;
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
function setupFilters() {
  const tagInput = document.getElementById("filterTagInput");
  if (tagInput) {
    tagInput.addEventListener("input", (e) => {
      cardFilters.tag = e.target.value;
      render();
    });
  }

  const filterToggle = document.getElementById("toggleFilterButton");
  const filterPanel = document.getElementById("filterPanel");
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener("click", () => {
      const isHidden = filterPanel.classList.toggle("hidden");
      filterToggle.setAttribute("aria-expanded", String(!isHidden));
    });
  }

  document.querySelectorAll('input[name="filterAttribute"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      cardFilters.attribute = e.target.value;
      render();
    });
  });

  document.querySelectorAll('input[name="filterType"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      cardFilters.type = e.target.value;
      render();
    });
  });
}

function setupDeckBuilder() {
  const cardsDiv = document.getElementById("cards");
  const deckDiv = document.getElementById("deck");
  const cardsPrev = document.getElementById("cardsPrev");
  const cardsNext = document.getElementById("cardsNext");
  const deckPrev = document.getElementById("deckPrev");
  const deckNext = document.getElementById("deckNext");

  if (cardsPrev && cardsDiv) {
    cardsPrev.onclick = () => scrollContainer(cardsDiv, -Math.max(cardsDiv.clientWidth * 0.75, 240));
  }
  if (cardsNext && cardsDiv) {
    cardsNext.onclick = () => scrollContainer(cardsDiv, Math.max(cardsDiv.clientWidth * 0.75, 240));
  }
  if (deckPrev && deckDiv) {
    deckPrev.onclick = () => scrollContainer(deckDiv, -Math.max(deckDiv.clientWidth * 0.75, 240));
  }
  if (deckNext && deckDiv) {
    deckNext.onclick = () => scrollContainer(deckDiv, Math.max(deckDiv.clientWidth * 0.75, 240));
  }

  if (cardsDiv) {
    cardsDiv.addEventListener("scroll", updateCardsScrollButtons);
  }
  if (deckDiv) {
    deckDiv.addEventListener("scroll", updateDeckScrollButtons);
  }
  window.addEventListener("resize", () => {
    updateCardsScrollButtons();
    updateDeckScrollButtons();
  });

  setupFilters();

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
  const source = dataUrl || "assets/404.png";
  img.onerror = () => {
    img.src = "assets/404.png";
    img.onerror = null;
  };
  img.src = source;
  img.style.display = "";
  none.style.display = "none";
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

  const copyBtn = document.getElementById("copyDeckCodeBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const codeInput = document.getElementById("deckCodeInput");
      if (!codeInput) return;
      codeInput.select();
      codeInput.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(codeInput.value).then(() => {
        copyBtn.textContent = "コピー済み";
        setTimeout(() => { copyBtn.textContent = "コードをコピー"; }, 1200);
      }).catch(() => {
        document.execCommand("copy");
      });
    });
  }
