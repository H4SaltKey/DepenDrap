let deck = [];
let cardFilters = {
  tag: "",
  attribute: "all",
  type: "all"
};
const DECK_MIN_SIZE = 30;
const DECK_MAX_SIZE = 40;

function getDeckEditorSettingsKey() {
  const username = window.myUsername || localStorage.getItem("username") || "guest";
  const safeUser = String(username || "guest").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `deckEditorSettings:${safeUser}`;
}

function loadDeckEditorSettings() {
  try {
    return JSON.parse(localStorage.getItem(getDeckEditorSettingsKey()) || "{}") || {};
  } catch {
    return {};
  }
}

function saveDeckEditorSettings(settings) {
  try {
    localStorage.setItem(getDeckEditorSettingsKey(), JSON.stringify(settings || {}));
  } catch {
    // ignore storage failures
  }
}

function updateDeckEditorSettings(updates) {
  const current = loadDeckEditorSettings();
  const merged = Object.assign({}, current, updates);
  saveDeckEditorSettings(merged);
  return merged;
}

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
function canAddCard(id) {
  if (getDeckLength() >= DECK_MAX_SIZE) {
    showDeckMessage(`デッキは最大 ${DECK_MAX_SIZE} 枚です`);
    return false;
  }
  const currentCount = deck.filter(c => c === id).length;
  if (currentCount >= 3) {
    showDeckMessage(`同名カードは3枚までしか入れられません`);
    return false;
  }
  return true;
}

function addCard(id) {
  if (!canAddCard(id)) return;
  deck.push(id);
  sortDeck();
  render();
}

function canRemoveCard(id) {
  return deck.indexOf(id) !== -1;
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

function getDeckLength() {
  return deck.length;
}

function showDeckMessage(text) {
  const deckMessage = document.getElementById("deckMessage");
  if (!deckMessage) return;
  deckMessage.innerText = text;
  deckMessage.classList.add("deckMessageActive");
  setTimeout(() => {
    if (deckMessage.innerText === text) {
      deckMessage.innerText = "";
      deckMessage.classList.remove("deckMessageActive");
    }
  }, 1600);
}

function updateDeckStats() {
  const count = getDeckLength();
  const countLabel = document.getElementById("deckCountLabel");
  const countHint = document.getElementById("deckCountHint");
  const progressBar = document.getElementById("deckProgressBar");
  const thresholdText = document.getElementById("deckThresholdText");
  const deckStats = document.getElementById("deckStats");

  if (countLabel) countLabel.textContent = String(count);
  if (countHint) countHint.textContent = `${DECK_MIN_SIZE}〜${DECK_MAX_SIZE} 枚`; 
  if (thresholdText) {
    if (count < DECK_MIN_SIZE) {
      thresholdText.textContent = `あと ${DECK_MIN_SIZE - count} 枚必要です`;
    } else if (count > DECK_MAX_SIZE) {
      thresholdText.textContent = `最大を ${count - DECK_MAX_SIZE} 枚超過しています`;
    } else {
      thresholdText.textContent = "デッキサイズが適正です";
    }
  }

  if (progressBar) {
    const progress = Math.min(100, Math.max(0, (count / DECK_MAX_SIZE) * 100));
    progressBar.style.width = `${progress}%`;
    const progressLabel = document.getElementById("deckProgressLabel");
    if (progressLabel) progressLabel.textContent = `${count} / ${DECK_MAX_SIZE}`;
  }

  if (deckStats) {
    deckStats.classList.toggle("deckStatsWarning", count < DECK_MIN_SIZE || count > DECK_MAX_SIZE);
    deckStats.classList.toggle("deckStatsReady", count >= DECK_MIN_SIZE && count <= DECK_MAX_SIZE);
  }
}

function animateCardTransition(sourceEl, targetRect, onFinish) {
  if (!sourceEl || !targetRect) {
    onFinish();
    return;
  }

  const srcRect = sourceEl.getBoundingClientRect();
  const clone = sourceEl.cloneNode(true);
  clone.style.position = "fixed";
  clone.style.left = `${srcRect.left}px`;
  clone.style.top = `${srcRect.top}px`;
  clone.style.width = `${srcRect.width}px`;
  clone.style.height = `${srcRect.height}px`;
  clone.style.margin = "0";
  clone.style.padding = "0";
  clone.style.boxSizing = "border-box";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "100000";
  clone.style.transition = "transform 220ms ease, opacity 220ms ease";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  document.body.appendChild(clone);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clone.remove();
    onFinish();
  };

  requestAnimationFrame(() => {
    const deltaX = targetRect.left - srcRect.left;
    const deltaY = targetRect.top - srcRect.top;
    clone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    clone.style.opacity = "0.92";
  });

  const timeoutId = setTimeout(finish, 260);
  clone.addEventListener("transitionend", () => {
    clearTimeout(timeoutId);
    finish();
  }, { once: true });
}

function animateCountActions(sourceEl, targetRect, count, action) {
  if (!sourceEl || !targetRect || count <= 1) {
    action();
    return;
  }

  let current = 0;
  const step = () => {
    animateCardTransition(sourceEl, targetRect, () => {
      action();
      current += 1;
      if (current < count) {
        setTimeout(step, 90);
      }
    });
  };
  step();
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

    // Hide default ghost image with transparent image
    const emptyImage = new Image();
    emptyImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent gif
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
    // Scale images inside the preview
    dragPreview.querySelectorAll('img').forEach(img => {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
    });
    dragPreview.style.display = "block";
    document.body.appendChild(dragPreview);

    // Update position on drag
    const movePreview = (evt) => {
      const offsetX = Math.round(dragPreview.offsetWidth / 2);
      const offsetY = Math.round(dragPreview.offsetHeight / 2);
      dragPreview.style.left = (evt.clientX - offsetX) + "px";
      dragPreview.style.top = (evt.clientY - offsetY) + "px";
    };
    
    const cleanup = () => {
      const current = document.getElementById("dragPreview");
      if (current) current.remove();
      document.removeEventListener("drag", movePreview);
      document.removeEventListener("dragover", movePreview);
      document.removeEventListener("dragend", cleanup);
      document.removeEventListener("drop", cleanup);
      document.removeEventListener("dragleave", cleanup);
      document.removeEventListener("dragcancel", cleanup);
      el.removeEventListener("dragend", cleanup);
    };

    document.addEventListener("drag", movePreview);
    document.addEventListener("dragover", movePreview);
    document.addEventListener("dragend", cleanup);
    document.addEventListener("drop", cleanup);
    document.addEventListener("dragleave", cleanup);
    document.addEventListener("dragcancel", cleanup);
    el.addEventListener("dragend", cleanup);
  });

  el.addEventListener("click", (e) => {
    if (e.button !== 0) return;
    const deckRow = document.getElementById("deck");
    const cardsRow = document.getElementById("cards");
    if (source === "cards") {
      if (!canAddCard(id)) return; // アニメーション前にチェック
      const deckRect = deckRow ? deckRow.getBoundingClientRect() : null;
      const targetRect = deckRect ? {
        left: deckRect.left + Math.max(0, (deckRect.width - el.offsetWidth) / 2),
        top: deckRect.top + Math.max(10, deckRect.height - el.offsetHeight - 10),
        width: el.offsetWidth,
        height: el.offsetHeight
      } : null;
      animateCardTransition(el, targetRect, () => {
        addCard(id);
        hideDeckContextMenu();
      });
    } else {
      if (!canRemoveCard(id)) return; // アニメーション前にチェック
      const cardsRect = cardsRow ? cardsRow.getBoundingClientRect() : null;
      const targetRect = cardsRect ? {
        left: cardsRect.left + Math.max(0, (cardsRect.width - el.offsetWidth) / 2),
        top: cardsRect.top + Math.max(10, 10),
        width: el.offsetWidth,
        height: el.offsetHeight
      } : null;
      animateCardTransition(el, targetRect, () => {
        removeCard(id);
        hideDeckContextMenu();
      });
    }
  });

  el.addEventListener("mouseenter", () => {
    updateDeckCardPreview(id);
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (source === "cards") {
      openDeckContextMenu(e.pageX, e.pageY, id, "add", el);
    } else {
      openDeckContextMenu(e.pageX, e.pageY, id, "remove", el);
    }
  });

  return el;
}

function openDeckContextMenu(x, y, id, action, sourceEl = null) {
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
        const performAction = () => {
          if (action === "add") {
            const currentCount = getDeckCount(id);
            const remainingForCard = Math.max(0, 3 - currentCount);
            const toAdd = Math.min(count, remainingForCard);
            for (let i = 0; i < toAdd; i++) addCard(id);
          } else {
            for (let i = 0; i < count; i++) removeCard(id);
          }
        };

        if (sourceEl && count > 0) {
          const targetRow = action === "add" ? document.getElementById("deck") : document.getElementById("cards");
          
          // 実際に追加/削除可能な枚数を計算
          let actualCount = 0;
          if (action === "add") {
            const currentLen = getDeckLength();
            const currentCount = getDeckCount(id);
            const remainingForCard = Math.max(0, 3 - currentCount);
            const remainingForDeck = Math.max(0, DECK_MAX_SIZE - currentLen);
            actualCount = Math.min(count, remainingForCard, remainingForDeck);
            if (actualCount <= 0) {
              canAddCard(id); // メッセージ表示のため
              return;
            }
          } else {
            const currentCount = getDeckCount(id);
            actualCount = Math.min(count, currentCount);
            if (actualCount <= 0) return;
          }

          const targetRect = targetRow ? {
            left: targetRow.getBoundingClientRect().left + Math.max(0, (targetRow.getBoundingClientRect().width - sourceEl.offsetWidth) / 2),
            top: action === "add"
              ? targetRow.getBoundingClientRect().top + Math.max(10, targetRow.getBoundingClientRect().height - sourceEl.offsetHeight - 10)
              : targetRow.getBoundingClientRect().top + Math.max(10, 10),
            width: sourceEl.offsetWidth,
            height: sourceEl.offsetHeight
          } : null;
          
          const performActualAction = () => {
            if (action === "add") {
              addCard(id);
            } else {
              removeCard(id);
            }
          };
          animateCountActions(sourceEl, targetRect, actualCount, performActualAction);
        } else {
          performAction();
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

function updateDeckCardPreview(id) {
  const card = getCardData(id);
  const previewDiv = document.getElementById("deckCardPreview");
  if (!card || !previewDiv) return;

  const imageSrc = card.image ? encodeURI(card.image) : "assets/404.png";
  const tags = Array.isArray(card.tags) ? card.tags.join(" ") : String(card.tags || "");

  previewDiv.innerHTML = `
    <div class="deckCardPreviewContainer">
      <img src="${imageSrc}" alt="" class="deckCardPreviewImg" onerror="this.src='assets/404.png'">
      <div class="deckCardPreviewDetails">
        <div class="deckCardPreviewName">${card.name || ""}</div>
        <div class="deckCardPreviewMeta">ID: ${card.id}</div>
        <div class="deckCardPreviewMeta">属性: ${card.attribute || "近接"} │ タイプ: ${card.type || "アタッカー"}</div>
        ${tags ? `<div class="deckCardPreviewTags">タグ: ${tags}</div>` : ""}
      </div>
    </div>
  `;
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

  if (cardsDiv) cardsDiv.innerHTML = "";
  if (deckDiv) deckDiv.innerHTML = "";

  cardIds.forEach(id => cardsDiv.appendChild(createCardElement(id, 0, "cards")));
  deckEntries.forEach(entry => deckDiv.appendChild(createCardElement(entry.id, entry.count, "deck")));

  const code = encodeDeck(deck);
  saveCurrentDeckCode(code);
  const codeInput = document.getElementById("deckCodeInput");
  if (codeInput) codeInput.value = code;

  updateDeckStats();
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
  if (!cardsDiv) return;
  const container = cardsDiv.closest(".cardListScroll");
  const cardsPrev = document.getElementById("cardsPrev");
  const cardsNext = document.getElementById("cardsNext");
  if (!container || !cardsPrev || !cardsNext) return;
  const max = container.scrollWidth - container.clientWidth;
  cardsPrev.disabled = container.scrollLeft <= 0;
  cardsNext.disabled = container.scrollLeft >= max - 1;
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
      if (!isHidden) {
        requestAnimationFrame(() => {
          const rect = filterToggle.getBoundingClientRect();
          const panelWidth = filterPanel.offsetWidth;
          const panelHeight = filterPanel.offsetHeight;
          let left = rect.left;
          if (left + panelWidth > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - panelWidth - 10);
          }
          let top = rect.bottom + 8;
          if (top + panelHeight > window.innerHeight - 10) {
            top = Math.max(10, rect.top - panelHeight - 8);
          }
          filterPanel.style.left = `${left}px`;
          filterPanel.style.top = `${top}px`;
          filterPanel.style.right = "auto";
        });
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!filterPanel.classList.contains("hidden") && !filterPanel.contains(event.target) && event.target !== filterToggle) {
      filterPanel.classList.add("hidden");
      filterToggle.setAttribute("aria-expanded", "false");
    }
  });

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

function updateCardSizes() {
  const catalogCol = document.getElementById("cardCatalogSection");
  const deckArea = document.getElementById("deckDropZone");
  if (!catalogCol || !deckArea) return;

  const topHeight = catalogCol.getBoundingClientRect().height;
  const bottomHeight = deckArea.getBoundingClientRect().height;
  const catalogZoom = window.deckCatalogLocalZoom || 1;
  const areaZoom = window.deckAreaLocalZoom || 1;

  const topCardHeight = Math.round(Math.max(80, Math.min(220, topHeight * 0.55)) * catalogZoom);
  const deckCardHeight = Math.round(Math.max(120, Math.min(340, bottomHeight * 0.72)) * areaZoom);
  const topCardWidth = Math.round(topCardHeight * (118 / 168));
  const deckCardWidth = Math.round(deckCardHeight * (118 / 168));

  const root = document.documentElement;
  root.style.setProperty("--cards-card-width", `${topCardWidth}px`);
  root.style.setProperty("--deck-card-width", `${deckCardWidth}px`);
  root.style.setProperty("--deck-card-height", `${deckCardHeight}px`);
  // If cards become small, add a class so CSS can disable rounded corners
  const compact = (topCardWidth || 0) < 90 || (deckCardWidth || 0) < 160;
  document.documentElement.classList.toggle('cards-compact', compact);
}

function setupDeckBuilder() {
  const cardsDiv = document.getElementById("cards");
  const deckDiv = document.getElementById("deck");
  const cardsPrev = document.getElementById("cardsPrev");
  const cardsNext = document.getElementById("cardsNext");
  const deckPrev = document.getElementById("deckPrev");
  const deckNext = document.getElementById("deckNext");

  if (cardsPrev && cardsDiv) {
    const scrollTarget = cardsDiv.closest(".cardListScroll") || cardsDiv;
    cardsPrev.onclick = () => scrollContainer(scrollTarget, -Math.max(scrollTarget.clientWidth * 0.75, 240));
  }
  if (cardsNext && cardsDiv) {
    const scrollTarget = cardsDiv.closest(".cardListScroll") || cardsDiv;
    cardsNext.onclick = () => scrollContainer(scrollTarget, Math.max(scrollTarget.clientWidth * 0.75, 240));
  }
  if (deckPrev && deckDiv) {
    deckPrev.onclick = () => scrollContainer(deckDiv, -Math.max(deckDiv.clientWidth * 0.75, 240));
  }
  if (deckNext && deckDiv) {
    deckNext.onclick = () => scrollContainer(deckDiv, Math.max(deckDiv.clientWidth * 0.75, 240));
  }

  if (cardsDiv) {
    const scrollTarget = cardsDiv.closest(".cardListScroll");
    if (scrollTarget) scrollTarget.addEventListener("scroll", updateCardsScrollButtons);
    else cardsDiv.addEventListener("scroll", updateCardsScrollButtons);
  }
  if (deckDiv) {
    deckDiv.addEventListener("scroll", updateDeckScrollButtons);
  }
  window.addEventListener("resize", () => {
    updateCardsScrollButtons();
    updateDeckScrollButtons();
    updateCardSizes();
  });

  window.deckGlobalZoom = 1;
  window.deckCatalogLocalZoom = 1;
  window.deckAreaLocalZoom = 1;

  const editorSettings = loadDeckEditorSettings();

  const previewCol = document.getElementById("deckPreviewCol");
  if (previewCol && editorSettings.previewWidth) {
    const width = Math.max(180, Number(editorSettings.previewWidth) || 180);
    previewCol.style.width = `${width}px`;
    previewCol.style.minWidth = `${width}px`;
    previewCol.style.maxWidth = `${width}px`;
    previewCol.style.flexBasis = `${width}px`;
  }

  const catalogCol = document.getElementById("cardCatalogSection");
  const deckArea = document.getElementById("deckDropZone");
  if (catalogCol && deckArea && editorSettings.verticalRatio) {
    const ratio = Number(editorSettings.verticalRatio);
    if (ratio > 0) {
      catalogCol.style.flex = `${ratio} 0 0px`;
      catalogCol.style.maxHeight = "none";
      catalogCol.style.minHeight = "150px";
      deckArea.style.flex = "1 0 0px";
      deckArea.style.maxHeight = "none";
      deckArea.style.minHeight = "150px";
    }
  }

  // Deck area size slider
  const areaZoomSlider = document.getElementById("deckAreaZoomSlider");
  if (areaZoomSlider) {
    if (editorSettings.deckAreaZoom !== undefined) {
      areaZoomSlider.value = String(editorSettings.deckAreaZoom);
    }
    window.deckAreaLocalZoom = parseFloat(areaZoomSlider.value) || 1;
    // Apply initial sizes after reading saved value
    updateCardSizes();
    areaZoomSlider.addEventListener("input", (e) => {
      window.deckAreaLocalZoom = parseFloat(e.target.value) || 1;
      updateCardSizes();
      // ensure deck DOM reflow if necessary
      if (typeof render === 'function') render();
      updateDeckEditorSettings({ deckAreaZoom: window.deckAreaLocalZoom });
    });
  }

  const zoomSlider = document.getElementById("deckZoomSlider");
  if (zoomSlider) {
    if (editorSettings.zoom !== undefined) {
      zoomSlider.value = String(editorSettings.zoom);
    }
    window.deckCatalogLocalZoom = parseFloat(zoomSlider.value) || 1;
    zoomSlider.addEventListener("input", (e) => {
      window.deckCatalogLocalZoom = parseFloat(e.target.value) || 1;
      updateCardSizes();
      updateDeckEditorSettings({ zoom: window.deckCatalogLocalZoom });
    });
  }

  setupFilters();

  setupDropZone(document.getElementById("deck"), (id, source) => {
    if (source === "cards") addCard(id);
  });
  setupDropZone(document.getElementById("cards"), (id, source) => {
    if (source === "deck") removeCard(id);
  });

  setupPreviewResizer();
  setupVerticalResizer();
  updateCardSizes();
}

// ===== デッキ名表示 =====
function showDeckTitle() {
  const entry = getCurrentDeckEntry();
  const titleEl = document.getElementById("deckTitle");
  if (titleEl && entry) titleEl.textContent = entry.name;
}

// ===== 起動 =====
loadCardData()
  .catch(() => {})
  .then(() => loadDeck())
  .then(() => {
    sortDeck();
    setupDeckBuilder();
    showDeckTitle();
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

// ===== プレビュー枠のリサイズ機能 =====
function setupPreviewResizer() {
  const resizer = document.getElementById("previewResizer");
  const previewCol = document.getElementById("deckPreviewCol");
  if (!resizer || !previewCol) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault(); // ブラウザ標準のドラッグ等の動作を無効化
    isResizing = true;
    startX = e.clientX;
    startWidth = previewCol.offsetWidth;
    resizer.classList.add("resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    
    // Preview is on the right side. Dragging left increases width.
    const dx = startX - e.clientX; 
    let newWidth = startWidth + dx;

    // Maximum width is about half of the screen as requested
    const maxWidth = Math.floor(window.innerWidth * 0.5);
    const minWidth = 180;

    if (newWidth > maxWidth) newWidth = maxWidth;
    if (newWidth < minWidth) newWidth = minWidth;

    // Flexboxの制約を確実に上書きするために複数プロパティを指定
    previewCol.style.width = newWidth + "px";
    previewCol.style.minWidth = newWidth + "px";
    previewCol.style.maxWidth = newWidth + "px";
    previewCol.style.flexBasis = newWidth + "px";
  });

  window.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      updateDeckEditorSettings({ previewWidth: parseInt(previewCol.style.width || previewCol.offsetWidth, 10) || previewCol.offsetWidth });
    }
  });
}

function setupVerticalResizer() {
  const vResizer = document.getElementById("verticalResizer");
  const catalogCol = document.getElementById("cardCatalogSection");
  const deckArea = document.getElementById("deckDropZone");
  if (!vResizer || !catalogCol || !deckArea) return;

  let isResizingV = false;
  let startY = 0;
  let startCatalogHeight = 0;
  let startDeckHeight = 0;

  // 基準の高さを記録して拡縮比率のベースにする
  const baseCatalogHeight = catalogCol.offsetHeight || (window.innerHeight * 0.56);
  const baseDeckHeight = deckArea.offsetHeight || (window.innerHeight * 0.36);

  vResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizingV = true;
    startY = e.clientY;
    startCatalogHeight = catalogCol.offsetHeight;
    startDeckHeight = deckArea.offsetHeight;
    vResizer.classList.add("resizing");
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isResizingV) return;
    
    const dy = e.clientY - startY;
    let newCatalogHeight = startCatalogHeight + dy;
    let newDeckHeight = startDeckHeight - dy;

    const minHeight = 150;
    const totalHeight = startCatalogHeight + startDeckHeight;

    if (newCatalogHeight < minHeight) {
      newCatalogHeight = minHeight;
      newDeckHeight = totalHeight - minHeight;
    } else if (newDeckHeight < minHeight) {
      newDeckHeight = minHeight;
      newCatalogHeight = totalHeight - minHeight;
    }

    const ratio = newCatalogHeight / newDeckHeight;
    catalogCol.style.flex = `${ratio} 0 0px`;
    catalogCol.style.maxHeight = "none";
    catalogCol.style.minHeight = minHeight + "px";

    deckArea.style.flex = `1 0 0px`;
    deckArea.style.maxHeight = "none";
    deckArea.style.minHeight = minHeight + "px";

    updateCardSizes();
  });

  window.addEventListener("mouseup", () => {
    if (isResizingV) {
      isResizingV = false;
      vResizer.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const currentCatalogHeight = catalogCol.offsetHeight;
      const currentDeckHeight = deckArea.offsetHeight;
      if (currentCatalogHeight > 0 && currentDeckHeight > 0) {
        updateDeckEditorSettings({ verticalRatio: currentCatalogHeight / currentDeckHeight });
      }
      updateCardSizes();
    }
  });
}

