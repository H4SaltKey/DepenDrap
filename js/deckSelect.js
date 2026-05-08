// ===== デッキリスト管理 =====
// localStorage "deckList" に [{id, name, code}] を保存
const MAX_DECKS = 50;

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

function createNewDeck() {
  const list = loadDeckList();
  if (list.length >= MAX_DECKS) return null;

  const id = "deck_" + Date.now();
  const entry = { id, name: "新しいデッキ", code: "empty" };
  list.push(entry);
  saveDeckList(list);
  return entry;
}

function deleteDeck(id) {
  const list = loadDeckList().filter(d => d.id !== id);
  saveDeckList(list);
}

function updateDeckName(id, name) {
  const list = loadDeckList();
  const deck = list.find(d => d.id === id);
  if (deck) {
    deck.name = name;
    saveDeckList(list);
  }
}

// ===== 状態 =====
let selectedDeckId = null;

// ===== 初期化 =====
const btnImport = document.getElementById("btnImportDeck");
btnImport.disabled = true;

loadCardData()
  .catch(() => {
    console.warn("カードデータの読み込みに失敗しました。サーバー経由で開いてください。");
  })
  .finally(() => {
    btnImport.disabled = false;
    renderGrid();
  });

// ===== グリッド描画 =====
function renderGrid() {
  const grid = document.getElementById("deckGrid");
  grid.innerHTML = "";

  const list = loadDeckList();

  list.forEach(deck => {
    const el = createDeckThumb(deck);
    grid.appendChild(el);
  });

  // 「新規作成」スロット
  if (list.length < MAX_DECKS) {
    const addEl = document.createElement("div");
    addEl.className = "deckThumb addNew";
    addEl.title = "新しいデッキを作成";
    addEl.textContent = "+";
    addEl.addEventListener("click", () => {
      const newDeck = createNewDeck();
      if (newDeck) {
        renderGrid();
        selectDeck(newDeck.id);
      }
    });
    grid.appendChild(addEl);
  }
}

function createDeckThumb(deck) {
  const el = document.createElement("div");
  el.className = "deckThumb" + (deck.id === selectedDeckId ? " selected" : "");
  el.dataset.id = deck.id;

  // デッキの裏面画像がある場合は優先
  let thumbHtml = "";
  if (deck.backImage && deck.backImage.length > 0) {
    thumbHtml = `
      <div class="deckThumbCards">
        <div class="deckThumbCard" style="border:none; background:transparent;">
          <img src="${deck.backImage}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:2px;">
        </div>
      </div>`;
  } else {
    // ない場合は従来通りのカードスタック表示
    let cards = [];
    try {
      cards = decodeDeck(deck.code);
    } catch {}
    const uniqueIds = [...new Set(cards)].slice(0, 3);
    thumbHtml = buildThumbStack(uniqueIds);
  }

  el.innerHTML = `
    ${thumbHtml}
    <div class="deckThumbName">${escapeHtml(deck.name)}</div>
  `;

  el.addEventListener("click", () => selectDeck(deck.id));
  return el;
}

function buildThumbStack(ids) {
  if (ids.length === 0) {
    return `<div class="deckThumbCards"><div class="deckThumbCard" style="background:#eee;"></div></div>`;
  }

  const cards = ids.map(id => getCardData(id)).filter(Boolean);
  const stackItems = cards.map((card, i) => {
    const offset = i * 4;
    return `<div class="deckThumbCard" style="top:${offset}px;left:${offset}px;width:calc(100% - ${offset}px);height:calc(100% - ${offset}px);">
      <img src="${card.image}" alt="">
    </div>`;
  }).reverse().join("");

  return `<div class="deckThumbCards">${stackItems}</div>`;
}

// ===== デッキ選択 =====
function selectDeck(id) {
  selectedDeckId = id;

  // グリッドのselectedクラスを更新
  document.querySelectorAll(".deckThumb").forEach(el => {
    el.classList.toggle("selected", el.dataset.id === id);
  });

  const list = loadDeckList();
  const deck = list.find(d => d.id === id);
  if (!deck) return;

  // 詳細パネルを表示
  document.getElementById("deckDetailEmpty").classList.add("hidden");
  const content = document.getElementById("deckDetailContent");
  content.classList.remove("hidden");
  content.style.display = "contents";

  // デッキ名
  const nameInput = document.getElementById("detailName");
  nameInput.value = deck.name;

  // デッキコード
  document.getElementById("detailCode").textContent = "コード: " + deck.code;

  // カバー画像（裏面画像を優先、ない場合はデッキ先頭のカード）
  const coverImg = document.getElementById("detailCoverImg");
  if (deck.backImage) {
    coverImg.src = deck.backImage;
    coverImg.style.display = "";
  } else {
    let cards = [];
    try { cards = decodeDeck(deck.code); } catch {}
    const firstCard = cards.length > 0 ? getCardData(cards[0]) : null;
    if (firstCard) {
      coverImg.src = firstCard.image;
      coverImg.style.display = "";
    } else {
      coverImg.src = "";
      coverImg.style.display = "none";
    }
  }

  // カード一覧
  renderDetailCards(cards);
}

function renderDetailCards(cards) {
  const list = document.getElementById("detailCardList");
  list.innerHTML = "";

  // id → 枚数
  const countMap = {};
  cards.forEach(id => { countMap[id] = (countMap[id] || 0) + 1; });

  const uniqueIds = [...new Set(cards)];
  uniqueIds.forEach(id => {
    const card = getCardData(id);
    if (!card) return;

    const el = document.createElement("div");
    el.className = "deckDetailCardItem";
    el.innerHTML = `
      <img src="${card.image}" alt="${escapeHtml(card.name)}">
      ${countMap[id] > 1 ? `<div class="deckDetailCardCount">×${countMap[id]}</div>` : ""}
    `;
    list.appendChild(el);
  });

  if (uniqueIds.length === 0) {
    list.innerHTML = `<div style="color:#aaa;font-size:13px;grid-column:1/-1;">カードなし</div>`;
  }
}

// ===== デッキ名の変更 =====
document.getElementById("detailName").addEventListener("change", () => {
  if (!selectedDeckId) return;
  updateDeckName(selectedDeckId, document.getElementById("detailName").value);
  renderGrid();
});

// ===== 編集ボタン =====
document.getElementById("btnEdit").addEventListener("click", () => {
  if (!selectedDeckId) return;
  location.href = "deck.html?deckId=" + encodeURIComponent(selectedDeckId);
});

// ===== 削除ボタン =====
document.getElementById("btnDelete").addEventListener("click", () => {
  if (!selectedDeckId) return;
  const list = loadDeckList();
  const deck = list.find(d => d.id === selectedDeckId);
  if (!deck) return;

  if (!confirm(`「${deck.name}」を削除しますか？`)) return;

  deleteDeck(selectedDeckId);
  selectedDeckId = null;

  document.getElementById("deckDetailEmpty").classList.remove("hidden");
  const content = document.getElementById("deckDetailContent");
  content.classList.add("hidden");
  content.style.display = "none";

  renderGrid();
});

// ===== ユーティリティ =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== コードからデッキ作成（デッキ選択画面） =====
document.getElementById("btnImportDeck").addEventListener("click", () => {
  document.getElementById("importCodeInput").value = "";
  document.getElementById("importError").textContent = "";
  document.getElementById("importModal").classList.remove("hidden");
  document.getElementById("importCodeInput").focus();
});

document.getElementById("importCancel").addEventListener("click", () => {
  document.getElementById("importModal").classList.add("hidden");
});

document.getElementById("importModal").addEventListener("click", (e) => {
  if (e.target.id === "importModal") {
    document.getElementById("importModal").classList.add("hidden");
  }
});

document.getElementById("importConfirm").addEventListener("click", () => {
  const code = document.getElementById("importCodeInput").value.trim();
  const errorEl = document.getElementById("importError");

  if (!code) {
    errorEl.textContent = "コードを入力してください。";
    return;
  }

  if (getDeckCardIds().length === 0) {
    errorEl.textContent = "カードデータが読み込まれていません。ページを再読み込みしてください。";
    return;
  }

  try {
    decodeDeck(code); // バリデーションのみ
  } catch (e) {
    if (e.message === "OLD_DECK_CODE") {
      errorEl.textContent = "古いデッキコードです。現在のカード構成と合いません。";
    } else {
      errorEl.textContent = "無効なデッキコードです。";
    }
    return;
  }

  // 新規デッキとして追加
  const list = loadDeckList();
  if (list.length >= MAX_DECKS) {
    errorEl.textContent = "デッキ数が上限（50）に達しています。";
    return;
  }

  const id = "deck_" + Date.now();
  const entry = { id, name: "インポートデッキ", code };
  list.push(entry);
  saveDeckList(list);

  document.getElementById("importModal").classList.add("hidden");
  renderGrid();
  selectDeck(id);
});

// Enterキーで確定
document.getElementById("importCodeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("importConfirm").click();
  if (e.key === "Escape") document.getElementById("importModal").classList.add("hidden");
});
