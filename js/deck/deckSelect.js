// ===== デッキリスト管理 =====
// localStorage "deckList" に [{id, name, code}] を保存

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

function createNewDeck(name) {
  const list = loadDeckList();
  const id = "deck_" + Date.now();
  const entry = { id, name: name || "新しいデッキ", code: "empty", backImage: "" };
  list.push(entry);
  saveDeckList(list);
  return entry;
}

// ===== 新規デッキ作成モーダル =====
function openCreateDeckModal() {
  const input = document.getElementById("createDeckNameInput");
  const errorEl = document.getElementById("createDeckError");
  input.value = "";
  errorEl.textContent = "";
  document.getElementById("createDeckModal").classList.remove("hidden");
  input.focus();
}

function closeCreateDeckModal() {
  document.getElementById("createDeckModal").classList.add("hidden");
}

document.getElementById("createDeckCancel").addEventListener("click", closeCreateDeckModal);
document.getElementById("createFromCodeBtn")?.addEventListener("click", () => {
  closeCreateDeckModal();
  document.getElementById("importCodeInput").value = "";
  document.getElementById("importError").textContent = "";
  document.getElementById("importModal").classList.remove("hidden");
  document.getElementById("importCodeInput").focus();
});
document.getElementById("createFromPublicBtn")?.addEventListener("click", async () => {
  closeCreateDeckModal();
  await openPublicDeckModal();
});

// モーダル背景クリックでキャンセル
document.getElementById("createDeckModal").addEventListener("click", (e) => {
  if (e.target.id === "createDeckModal") closeCreateDeckModal();
});

document.getElementById("createDeckConfirm").addEventListener("click", () => {
  const input = document.getElementById("createDeckNameInput");
  const errorEl = document.getElementById("createDeckError");
  const name = input.value.trim();

  if (!name) {
    errorEl.textContent = "デッキ名を入力してください。";
    input.focus();
    return;
  }

  const newDeck = createNewDeck(name);
  closeCreateDeckModal();
  renderGrid();
  selectDeck(newDeck.id);
});

document.getElementById("createDeckNameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("createDeckConfirm").click();
  if (e.key === "Escape") closeCreateDeckModal();
});

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

/**
 * deckList に保存されている v2 / 旧旧形式コードを v3 に一括変換する。
 * renderGrid() の前に一度だけ呼ぶ。
 */
function migrateDeckListToV3() {
  const list = loadDeckList();
  let changed = false;
  list.forEach(entry => {
    if (!entry.code || entry.code === "empty" || entry.code.startsWith("v3|")) return;
    try {
      const decoded = decodeDeck(entry.code);
      entry.code = encodeDeck(decoded);
      changed = true;
    } catch {
      // 旧旧形式など変換不能なコードは "empty" にリセット
      entry.code = "empty";
      changed = true;
    }
  });
  if (changed) saveDeckList(list);
}

// ===== 状態 =====
let selectedDeckId = null;

// ===== 初期化 =====
const btnImport = document.getElementById("btnImportDeck");
const btnImportPublic = document.getElementById("btnImportPublicDeck");
btnImport.disabled = true;
if (btnImportPublic) btnImportPublic.disabled = true;

loadCardData()
  .catch(() => {
    console.warn("カードデータの読み込みに失敗しました。サーバー経由で開いてください。");
  })
  .finally(() => {
    btnImport.disabled = false;
    if (btnImportPublic) btnImportPublic.disabled = false;
    migrateDeckListToV3();
    renderGrid();
  });

// Firebase 初期化（公開デッキ機能用）
window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyDNe58gGvJ3-09brUHkoorkQalrS8jkPAw",
  authDomain: "dependrap-c30b4.firebaseapp.com",
  databaseURL: "https://dependrap-c30b4-default-rtdb.firebaseio.com",
  projectId: "dependrap-c30b4",
  storageBucket: "dependrap-c30b4.firebasestorage.app",
  messagingSenderId: "536531285865",
  appId: "1:536531285865:web:0d53a2c4fd8fae7ff32ff8"
};
if (window.firebaseClient && !window.firebaseClient.db) {
  window.firebaseClient.initialize(window.FIREBASE_CONFIG).catch(() => {});
}

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
  const addEl = document.createElement("div");
  addEl.className = "deckThumb addNew";
  addEl.title = "新しいデッキを作成";
  addEl.textContent = "+";
  addEl.addEventListener("click", () => {
    openCreateDeckModal();
  });
  grid.appendChild(addEl);
  updateSelectionLayout();
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
    const imageSrc = card.image ? encodeURI(card.image) : "assets/System/404.png";
    return `<div class="deckThumbCard" style="top:${offset}px;left:${offset}px;width:calc(100% - ${offset}px);height:calc(100% - ${offset}px);">
      <img src="${imageSrc}" alt="">
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

  // カード一覧データを共通で確保
  let cards = [];
  try {
    cards = decodeDeck(deck.code);
  } catch {
    cards = [];
  }

  // カバー画像（裏面画像を優先、ない場合はデッキ先頭のカード）
  const coverImg = document.getElementById("detailCoverImg");
  if (deck.backImage) {
    coverImg.src = deck.backImage;
    coverImg.style.display = "";
  } else {
    const firstCard = cards.length > 0 ? getCardData(cards[0]) : null;
    if (firstCard) {
      coverImg.src = encodeURI(firstCard.image);
      coverImg.style.display = "";
    } else {
      coverImg.src = "";
      coverImg.style.display = "none";
    }
  }

  // カード一覧
  renderDetailCards(cards);
  updateSelectionLayout();
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
    const imageSrc = card.image ? encodeURI(card.image) : "assets/System/404.png";
    el.innerHTML = `
      <img src="${imageSrc}" alt="${escapeHtml(card.name)}">
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
  updateSelectionLayout();
});

function updateSelectionLayout() {
  const main = document.querySelector(".selectMain");
  if (!main) return;
  main.classList.toggle("noSelection", !selectedDeckId);
}

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

  // v2 以前のコードは v3 形式に変換してから保存
  const normalizedCode = code.startsWith("v3|") ? code : encodeDeck(decodeDeck(code));

  // 新規デッキとして追加
  const list = loadDeckList();

  const id = "deck_" + Date.now();
  const entry = { id, name: "インポートデッキ", code: normalizedCode, backImage: "" };
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

// ===== 公開デッキ =====
document.getElementById("btnPublishDeck")?.addEventListener("click", async () => {
  if (!selectedDeckId) return;
  const username = localStorage.getItem("username");
  if (!username || !window.firebaseClient?.db) {
    alert("公開機能を利用するにはオンライン接続が必要です。");
    return;
  }
  const deck = loadDeckList().find(d => d.id === selectedDeckId);
  if (!deck || !deck.code || deck.code === "empty") {
    alert("公開するデッキが選択されていないか、デッキが空です。");
    return;
  }
  const payload = {
    name: deck.name || "公開デッキ",
    code: deck.code,
    author: username,
    updatedAt: Date.now()
  };
  try {
    await firebaseClient.db.ref(`accounts/${username}/publicDeck`).set(payload);
    alert("公開デッキを更新しました。");
  } catch (e) {
    alert("公開デッキの更新に失敗しました。");
  }
});

async function openPublicDeckModal() {
  const modal = document.getElementById("publicDeckModal");
  const listEl = document.getElementById("publicDeckList");
  if (!modal || !listEl) return;
  modal.classList.remove("hidden");
  listEl.innerHTML = `<div style="color:#aaa;font-size:13px;padding:8px;">読み込み中...</div>`;
  if (!window.firebaseClient?.db) {
    listEl.innerHTML = `<div style="color:#ff6b6b;font-size:13px;padding:8px;">オンライン接続が必要です。</div>`;
    return;
  }
  try {
    const snap = await firebaseClient.db.ref("accounts").once("value");
    const accounts = snap.val() || {};
    const rows = [];
    Object.keys(accounts).forEach((key) => {
      const d = accounts[key]?.publicDeck;
      if (!d?.code) return;
      rows.push({ deckName: d.name || "公開デッキ", code: d.code, author: d.author || key });
    });
    if (rows.length === 0) {
      listEl.innerHTML = `<div style="color:#aaa;font-size:13px;padding:8px;">公開デッキがありません。</div>`;
      return;
    }
    listEl.innerHTML = "";
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:rgba(0,0,0,0.28);border:1px solid #5a4b27;border-radius:6px;";
      const info = document.createElement("button");
      info.type = "button";
      info.className = "btnEdit";
      info.style.cssText = "text-align:left;white-space:normal;flex:1;";
      info.textContent = `[${r.deckName}] 作成者:[${r.author}]`;
      info.addEventListener("click", () => {
        try { decodeDeck(r.code); } catch { alert("公開デッキコードが無効です。"); return; }
        const list = loadDeckList();
        const id = "deck_" + Date.now();
        list.push({ id, name: `${r.deckName} (公開)`, code: r.code, backImage: "" });
        saveDeckList(list);
        renderGrid();
        selectDeck(id);
        modal.classList.add("hidden");
      });
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btnEdit";
      copyBtn.style.cssText = "padding:8px 10px;white-space:nowrap;font-size:12px;";
      copyBtn.textContent = "コードをコピー";
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(r.code);
          copyBtn.textContent = "コピー済み";
          setTimeout(() => { copyBtn.textContent = "コードをコピー"; }, 1200);
        } catch {
          alert("コピーに失敗しました。");
        }
      });
      row.appendChild(info);
      row.appendChild(copyBtn);
      listEl.appendChild(row);
    });
  } catch {
    listEl.innerHTML = `<div style="color:#ff6b6b;font-size:13px;padding:8px;">公開デッキの取得に失敗しました。</div>`;
  }
}

document.getElementById("btnImportPublicDeck")?.addEventListener("click", openPublicDeckModal);
document.getElementById("publicDeckClose")?.addEventListener("click", () => {
  document.getElementById("publicDeckModal")?.classList.add("hidden");
});
document.getElementById("publicDeckModal")?.addEventListener("click", (e) => {
  if (e.target.id === "publicDeckModal") e.target.classList.add("hidden");
});

// ===== 画面サイズ変更時のグリッド調整 =====
function updateGridColumns() {
  const deckGrid = document.querySelector('.deckGrid');
  const cardList = document.querySelector('.deckDetailCardList');
  
  if (!deckGrid || !cardList) return;
  
  // デッキグリッドの列数調整（最小2列、最大8列）
  const deckGridWidth = deckGrid.offsetWidth;
  const minDeckCardWidth = 120; // デッキカードの最小幅
  const deckCols = Math.max(2, Math.min(8, Math.floor(deckGridWidth / minDeckCardWidth)));
  deckGrid.style.gridTemplateColumns = `repeat(${deckCols}, 1fr)`;
  
  // カード一覧の列数調整（最小3列、最大10列）
  const cardListWidth = cardList.offsetWidth;
  const minCardWidth = 60; // カード一覧の最小幅
  const cardCols = Math.max(3, Math.min(10, Math.floor(cardListWidth / minCardWidth)));
  cardList.style.gridTemplateColumns = `repeat(${cardCols}, 1fr)`;
}

function saveBackImage(dataUrl) {
  if (!selectedDeckId) return;
  const list = loadDeckList();
  const deck = list.find(d => d.id === selectedDeckId);
  if (deck) {
    deck.backImage = dataUrl || "";
    saveDeckList(list);
    selectDeck(selectedDeckId);
  }
}

function setupBackImageUI() {
  document.getElementById("btnSetBackImage").addEventListener("click", () => {
    document.getElementById("backImageInput").click();
  });

  document.getElementById("backImageInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      saveBackImage(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });
}

// 初期化時とリサイズ時に列数を更新
window.addEventListener('resize', updateGridColumns);
window.addEventListener('load', () => {
  setTimeout(updateGridColumns, 100); // DOMが完全にレンダリングされた後に実行
  setupBackImageUI();
  updateSelectionLayout();
});
