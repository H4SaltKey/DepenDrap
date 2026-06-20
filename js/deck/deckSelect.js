// ===== デッキリスト管理 =====
// localStorage "deckList" に [{id, name, code}] を保存
// 画像は IndexedDB に保存（localStorage の容量節約）
// IndexedDB 関数は js/shared/deckImageDB.js で定義

function loadDeckList() {
  try {
    const list = JSON.parse(localStorage.getItem("deckList")) || [];
    // 古いデータから backImage フィールドを削除
    list.forEach(deck => {
      if (deck.backImage) {
        saveBackImageToDB(deck.id, deck.backImage).catch(() => {});
        delete deck.backImage;
      }
    });
    return list;
  } catch {
    return [];
  }
}

function saveDeckList(list) {
  // backImage フィールドは保存しない（IndexedDB に保存される）
  const cleanList = list.map(d => ({
    id: d.id,
    name: d.name,
    code: d.code
  }));
  localStorage.setItem("deckList", JSON.stringify(cleanList));
  
  // Firebase に保存（async、エラーは無視）
  if (window.firebaseClient && window.firebaseClient.db) {
    window.firebaseClient.saveDeckListToFirebase(cleanList).catch(() => {});
  }
}

function createNewDeck(name) {
  const list = loadDeckList();
  const id = "deck_" + Date.now();
  const entry = { id, name: name || "新しいデッキ", code: "empty" };
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
  // IndexedDB からも削除
  deleteBackImageFromDB(id).catch(() => {});
  
  // Firebase からも削除
  if (window.firebaseClient && window.firebaseClient.db) {
    window.firebaseClient.deleteDeckFromFirebase(id).catch(() => {});
  }
}

function updateDeckName(id, name) {
  const list = loadDeckList();
  const deck = list.find(d => d.id === id);
  if (deck) {
    deck.name = name;
    saveDeckList(list);
    
    // Firebase に更新
    if (window.firebaseClient && window.firebaseClient.db) {
      window.firebaseClient.updateDeckOnFirebase(id, { name, code: deck.code }).catch(() => {});
    }
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
let activeDeckId = null;

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
    initDeckImageDB().catch(() => {});
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

/**
 * Firebase からデッキリストを読み込む（ロード時）
 * Firebase が利用可能で、Firebaseにデータがあれば使用
 * そうでなければ localStorage を使用
 */
async function loadDeckListFromFirebaseOrLocal() {
  // Firebase が利用可能か確認
  if (window.firebaseClient && window.firebaseClient.db && window.firebaseClient.username) {
    try {
      const firebaseList = await window.firebaseClient.loadDeckListFromFirebase();
      if (firebaseList && firebaseList.length > 0) {
        // Firebase にデータがある場合は、そちらを使用してlocalStorageも更新
        const cleanList = firebaseList.map(d => ({
          id: d.id,
          name: d.name,
          code: d.code
        }));
        localStorage.setItem("deckList", JSON.stringify(cleanList));
        console.log("[DeckSelect] Firebase からデッキリストを読み込みました:", firebaseList.length, "件");
        return firebaseList;
      }
    } catch (err) {
      console.warn("[DeckSelect] Firebase からの読み込みに失敗、localStorage を使用:", err.message);
    }
  }
  
  // Firebase が利用不可またはデータがない場合は localStorage を使用
  return loadDeckList();
}

// ===== グリッド描画 =====
async function renderGridAsync() {
  const grid = document.getElementById("deckGrid");
  grid.innerHTML = "";

  const list = await loadDeckListFromFirebaseOrLocal();

  list.forEach(deck => {
    const el = createDeckThumb(deck);
    grid.appendChild(el);
    
    // 画像を非同期に読み込んで更新
    loadAndUpdateDeckThumbnail(deck.id);
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
}

// renderGrid() は保持（互換性のため）、実際には renderGridAsync() を使用
function renderGrid() {
  renderGridAsync().catch(err => {
    console.error("renderGrid エラー:", err);
    // エラー時は localStorage のみで表示
    const grid = document.getElementById("deckGrid");
    grid.innerHTML = "";
    const list = loadDeckList();
    list.forEach(deck => {
      const el = createDeckThumb(deck);
      grid.appendChild(el);
      loadAndUpdateDeckThumbnail(deck.id);
    });
    const addEl = document.createElement("div");
    addEl.className = "deckThumb addNew";
    addEl.textContent = "+";
    addEl.addEventListener("click", openCreateDeckModal);
    grid.appendChild(addEl);
  });
}

async function loadAndUpdateDeckThumbnail(deckId) {
  const el = document.querySelector(`[data-id="${deckId}"]`);
  if (!el) return;
  
  try {
    const backImage = await getBackImageFromDB(deckId);
    if (backImage) {
      const thumbCardsEl = el.querySelector(".deckThumbCards");
      if (thumbCardsEl) {
        thumbCardsEl.innerHTML = `<div class="deckThumbCard" style="border:none; background:transparent;">
          <img src="${backImage}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:2px;">
        </div>`;
      }
    }
  } catch (err) {
    console.warn("Failed to update deck thumbnail:", err);
  }
}

function createDeckThumb(deck) {
  const el = document.createElement("div");
  el.className = "deckThumb" + (deck.id === selectedDeckId ? " selected" : "");
  el.dataset.id = deck.id;

  // デッキのカードスタック表示（画像は後で非同期に読み込まれる）
  let cards = [];
  try {
    cards = decodeDeck(deck.code);
  } catch {}
  const uniqueIds = [...new Set(cards)].slice(0, 3);
  const thumbHtml = buildThumbStack(uniqueIds);

  el.innerHTML = `
    ${thumbHtml}
    <div class="deckThumbName">${escapeHtml(deck.name)}</div>
  `;

  el.addEventListener("click", () => {
    selectedDeckId = deck.id;
    activeDeckId = deck.id;
    document.querySelectorAll(".deckThumb").forEach(n => n.classList.toggle("selected", n.dataset.id === deck.id));
    showDeckHoverDetail(deck);
  });
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
  const content = document.getElementById("deckDetailContent");
  if (content) { content.classList.add("hidden"); content.style.display = "none"; }

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

  // カバー画像（IndexedDB から読み込み）
  const coverImg = document.getElementById("detailCoverImg");
  getBackImageFromDB(deck.id).then(backImage => {
    if (backImage) {
      coverImg.src = backImage;
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
  }).catch(err => {
    console.warn("Failed to load back image:", err);
    const firstCard = cards.length > 0 ? getCardData(cards[0]) : null;
    if (firstCard) {
      coverImg.src = encodeURI(firstCard.image);
    }
  });

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

function openPublishConfirmModal(options) {
  const currentName = String(options?.currentPublicDeckName || "").trim();
  const nextName = String(options?.nextDeckName || "公開デッキ").trim();
  const onConfirm = typeof options?.onConfirm === "function" ? options.onConfirm : () => {};

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:120000;background:rgba(0,0,0,0.66);display:flex;align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML = `
    <div style="width:min(520px,94vw);background:#1a172c;border:1px solid #c7b377;border-radius:10px;padding:16px;color:#e0d0a0;box-shadow:0 16px 40px rgba(0,0,0,0.45);">
      <div style="font-size:18px;font-weight:700;margin-bottom:10px;">デッキ公開の確認</div>
      <div style="font-size:13px;line-height:1.6;color:#d7cda8;">
        <div>現在公開中: <span style="color:#8fe3ff;font-weight:700;">${escapeHtml(currentName || "なし")}</span></div>
        <div style="margin-top:6px;">更新対象: <span style="color:#8fe3ff;font-weight:700;">${escapeHtml(nextName)}</span></div>
        <div style="margin-top:10px;color:#ffcf9f;">この操作を実行すると、現在公開中のデッキはこの内容で上書き更新されます。</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
        <button type="button" id="publishConfirmCancelBtn" class="btnDelete" style="padding:8px 14px;">キャンセル</button>
        <button type="button" id="publishConfirmOkBtn" class="btnEdit" style="padding:8px 14px;background:linear-gradient(to bottom,#69d8ff,#3baed6);border-color:#3aa8ce;color:#042a3a;font-weight:700;">公開して上書き</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("#publishConfirmCancelBtn")?.addEventListener("click", close);
  overlay.querySelector("#publishConfirmOkBtn")?.addEventListener("click", async () => {
    try {
      await onConfirm();
    } finally {
      close();
    }
  });
}

async function handlePublishDeck() {
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

  let currentPublicDeckName = "";
  try {
    const snap = await firebaseClient.db.ref(`accounts/${username}/publicDeck`).once("value");
    const current = snap.val() || null;
    currentPublicDeckName = String(current?.name || "").trim();
  } catch (_) {
    currentPublicDeckName = "";
  }

  const payload = {
    name: deck.name || "公開デッキ",
    code: deck.code,
    author: username,
    updatedAt: Date.now()
  };

  openPublishConfirmModal({
    currentPublicDeckName,
    nextDeckName: payload.name,
    onConfirm: async () => {
      try {
        await firebaseClient.db.ref(`accounts/${username}/publicDeck`).set(payload);
        alert("公開デッキを更新しました。");
      } catch (e) {
        alert("公開デッキの更新に失敗しました。");
      }
    }
  });
}

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

document.addEventListener("click", (e) => {
  const panel = document.getElementById("deckHoverDetail");
  if (!panel) return;
  if (panel.contains(e.target)) return;
  if (e.target.closest(".deckThumb")) return;
  hideDeckHoverDetail();
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
  await handlePublishDeck();
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
  
  // カード一覧の列数調整（最小3列、最大10列）
  const cardListWidth = cardList.offsetWidth;
  const minCardWidth = 60; // カード一覧の最小幅
  const cardCols = Math.max(3, Math.min(10, Math.floor(cardListWidth / minCardWidth)));
  cardList.style.gridTemplateColumns = `repeat(${cardCols}, 1fr)`;
}

function saveBackImage(dataUrl) {
  if (!selectedDeckId) return;
  // IndexedDB に保存
  saveBackImageToDB(selectedDeckId, dataUrl).then(() => {
    const list = loadDeckList();
    const deck = list.find(d => d.id === selectedDeckId);
    if (deck) {
      selectDeck(selectedDeckId);
      // ホバー詳細パネルも更新
      if (activeDeckId === selectedDeckId) {
        showDeckHoverDetail(deck);
      }
      // グリッドのサムネイルも更新
      loadAndUpdateDeckThumbnail(selectedDeckId);
    }
  }).catch(err => {
    console.error("Failed to save back image:", err);
  });
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
});

function showDeckHoverDetail(deck) {
  const panel = document.getElementById("deckHoverDetail");
  if (!panel || !deck) return;
  activeDeckId = deck.id;
  let cards = [];
  try { cards = decodeDeck(deck.code); } catch {}
  const countMap = {};
  cards.forEach(id => { countMap[id] = (countMap[id] || 0) + 1; });
  const uniqueIds = [...new Set(cards)];
  const listHtml = uniqueIds.slice(0, 30).map((id) => {
    const card = getCardData(id);
    if (!card) return "";
    const src = card.image ? encodeURI(card.image) : "assets/System/404.png";
    return `<div style="position:relative;aspect-ratio:210/297;border:1px solid #5a4b27;background:#000;border-radius:2px;overflow:hidden;">
      <img src="${src}" style="width:100%;height:100%;object-fit:contain;">
      ${countMap[id] > 1 ? `<div style="position:absolute;right:2px;top:2px;background:#111;color:#fff;font-size:10px;font-weight:bold;padding:1px 3px;">×${countMap[id]}</div>` : ""}
    </div>`;
  }).join("");
  
  // パネル内容をクリア（古いリスナーを削除）
  panel.innerHTML = "";
  
  panel.innerHTML = `
    <div style="display:grid;grid-template-columns:84px 1fr;gap:10px;align-items:start;margin-bottom:10px;">
      <div style="width:84px;aspect-ratio:210/297;border:1px solid #5a4b27;background:#000;border-radius:4px;overflow:hidden;">
        <img id="hoverCoverImg" src="" style="width:100%;height:100%;object-fit:contain;">
      </div>
      <div style="flex:1;">
        <input type="text" id="hoverDeckName" value="${escapeHtml(deck.name)}" style="font-size:14px;font-weight:bold;width:100%;border:1px solid #5a4b27;background:#000;color:#e0d0a0;-webkit-text-fill-color:#e0d0a0;-webkit-box-shadow:0 0 0 1000px #000 inset;padding:4px 6px;border-radius:4px;box-sizing:border-box;">
        <div style="font-size:11px;color:#888;word-break:break-all;margin-top:6px;">コード: ${deck.code}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-height:52vh;overflow:auto;">${listHtml || '<div style="color:#aaa;font-size:12px;grid-column:1/-1;">カードなし</div>'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
      <button type="button" id="hoverSleeveBtn" class="btnEdit" style="padding:8px 8px;font-size:12px;">スリーブ変更</button>
      <button type="button" id="hoverEditBtn" class="btnEdit" style="padding:8px 8px;font-size:12px;">デッキを編集</button>
      <button type="button" id="hoverDeleteBtn" class="btnDelete" style="padding:8px 8px;font-size:12px;">削除</button>
      <button type="button" id="hoverPublishBtn" class="btnEdit" style="padding:8px 8px;font-size:12px;background:linear-gradient(to bottom,#69d8ff,#3baed6);border-color:#3aa8ce;color:#042a3a;font-weight:700;">デッキを公開</button>
    </div>
  `;
  
  // イベントリスナーを登録
  panel.querySelector("#hoverDeleteBtn")?.addEventListener("click", () => {
    if (!activeDeckId) return;
    selectedDeckId = activeDeckId;
    document.getElementById("btnDelete")?.click();
    hideDeckHoverDetail();
  });
  panel.querySelector("#hoverPublishBtn")?.addEventListener("click", () => {
    if (!activeDeckId) return;
    selectedDeckId = activeDeckId;
    document.getElementById("btnPublishDeck")?.click();
  });
  panel.querySelector("#hoverSleeveBtn")?.addEventListener("click", () => {
    if (!activeDeckId) return;
    selectedDeckId = activeDeckId;
    document.getElementById("btnSetBackImage")?.click();
  });
  panel.querySelector("#hoverEditBtn")?.addEventListener("click", () => {
    if (!activeDeckId) return;
    selectedDeckId = activeDeckId;
    document.getElementById("btnEdit")?.click();
  });

  // デッキ名の編集処理
  const nameInput = panel.querySelector("#hoverDeckName");
  if (nameInput) {
    nameInput.addEventListener("change", () => {
      const newName = nameInput.value.trim();
      if (newName && activeDeckId) {
        updateDeckName(activeDeckId, newName);
        renderGrid();
        const list = loadDeckList();
        const updatedDeck = list.find(d => d.id === activeDeckId);
        if (updatedDeck) {
          showDeckHoverDetail(updatedDeck);
        }
      }
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        nameInput.blur();
      } else if (e.key === "Escape") {
        const list = loadDeckList();
        const currentDeck = list.find(d => d.id === activeDeckId);
        if (currentDeck) nameInput.value = currentDeck.name;
      }
    });
  }

  // IndexedDB から画像を読み込んで設定
  const coverImg = panel.querySelector("#hoverCoverImg");
  if (coverImg) {
    getBackImageFromDB(deck.id).then(backImage => {
      if (backImage) {
        coverImg.src = backImage;
      } else {
        const firstCard = cards.length > 0 ? getCardData(cards[0]) : null;
        if (firstCard) {
          coverImg.src = encodeURI(firstCard.image);
        }
      }
    }).catch(err => {
      console.warn("Failed to load back image from DB:", err);
      const firstCard = cards.length > 0 ? getCardData(cards[0]) : null;
      if (firstCard) {
        coverImg.src = encodeURI(firstCard.image);
      }
    });
  }

  panel.classList.add("visible");
}

function hideDeckHoverDetail() {
  const panel = document.getElementById("deckHoverDetail");
  if (!panel) return;
  panel.classList.remove("visible");
}
