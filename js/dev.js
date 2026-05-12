// ===== 状態 =====
let devCards = [];
let pendingImages = {};
let selectedId = null;
let devPage = 0;

const PAGE_SIZE = 10;

// ===== 初期化 =====
async function initDev() {
  try {
    await loadCardData();
    await loadLevelStats();
    devCards = CARD_DB.map(c => ({
      id: c.id,
      image: c.image
        ? c.image.replace("assets/cards/", "")
        : "",
      name: c.name || "",
      attribute: c.attribute || "近接",
      type: c.type || "アタッカー",
      tags: Array.isArray(c.tags) ? c.tags.join(", ") : (typeof c.tags === "string" ? c.tags : "")
    }));
  } catch(e) {
    devCards = [];
  }
  renderDevCards();
  renderLevelStatsTable(); // ここで描画
}

initDev();

// ===== カード追加 =====
document.getElementById("addCardBtn").addEventListener("click", () => {
  const id = generateId();
  devCards.push({
    id,
    image: "",
    name: "",
    attribute: "近接",
    type: "アタッカー",
    tags: ""
  });
  devPage = Math.floor((devCards.length - 1) / PAGE_SIZE);
  renderDevCards();
  selectCard(id);
});

function generateId() {
  // 新しいID形式に対応：cd001-001, cd001-002, ... cd002-001, ...
  let maxBlockNum = 0;
  let maxCardInBlock = {};
  
  devCards.forEach(c => {
    const match = c.id.match(/^cd(\d{3})-(\d{3})$/);
    if (match) {
      const blockNum = parseInt(match[1], 10);
      const cardNum = parseInt(match[2], 10);
      maxBlockNum = Math.max(maxBlockNum, blockNum);
      if (!maxCardInBlock[blockNum]) maxCardInBlock[blockNum] = 0;
      maxCardInBlock[blockNum] = Math.max(maxCardInBlock[blockNum], cardNum);
    }
  });
  
  // 最後のブロックの次のカード番号、またはブロックが存在しない場合は新しいブロックを作成
  const blockNum = maxBlockNum || 1;
  const cardNum = (maxCardInBlock[blockNum] || 0) + 1;
  
  if (cardNum > 999) {
    // カード数が999を超える場合は新しいブロックを作成
    return `cd${String(blockNum + 1).padStart(3, "0")}-001`;
  }
  
  return `cd${String(blockNum).padStart(3, "0")}-${String(cardNum).padStart(3, "0")}`;
}

// ===== カード選択 =====
function selectCard(id) {
  selectedId = id;
  const card = devCards.find(c => c.id === id);
  if (!card) return;

  document.getElementById("editPanel").classList.remove("hidden");
  document.getElementById("editId").value = card.id;
  document.getElementById("editTags").value = card.tags || "";
  const attrInput = document.getElementById(`editAttribute_${card.attribute || "近接"}`);
  if (attrInput) attrInput.checked = true;
  const typeInput = document.getElementById(`editCardType_${card.type || "アタッカー"}`);
  if (typeInput) typeInput.checked = true;

  const pending = pendingImages[id];
  if (pending) {
    showPreview(pending.dataUrl);
    document.getElementById("editImageName").value = pending.fileName;
  } else if (card.image) {
    showPreview(encodeURI("assets/cards/" + card.image));
    document.getElementById("editImageName").value = card.image;
  } else {
    clearPreview();
    document.getElementById("editImageName").value = "";
  }

  document.getElementById("editMessage").innerText = "";
  renderDevCards();
}

// ===== プレビュー =====
function showPreview(src) {
  document.getElementById("previewImg").src = src;
  document.getElementById("previewImg").style.display = "";
  document.getElementById("previewPlaceholder").style.display = "none";
}

function clearPreview() {
  document.getElementById("previewImg").src = "";
  document.getElementById("previewImg").style.display = "none";
  document.getElementById("previewPlaceholder").style.display = "";
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(tag => String(tag || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,、\s]+/).map(tag => tag.trim()).filter(Boolean);
  }
  return [];
}

function updateSelectedField(key, value) {
  if (!selectedId) return;
  const card = devCards.find(c => c.id === selectedId);
  if (!card) return;
  card[key] = value;
  renderDevCards();
}

// イベント: 編集パネルの属性 / 種類 / タグ
[...document.querySelectorAll('input[name="editAttribute"]'), ...document.querySelectorAll('input[name="editCardType"]')].forEach(input => {
  input.addEventListener('change', () => {
    updateSelectedField(input.name === 'editAttribute' ? 'attribute' : 'type', input.value);
  });
});
const editTagsInput = document.getElementById('editTags');
if (editTagsInput) {
  editTagsInput.addEventListener('input', () => {
    updateSelectedField('tags', editTagsInput.value);
  });
}

// ===== 画像選択 =====
document.getElementById("selectImageBtn").addEventListener("click", () => {
  document.getElementById("imageFileInput").click();
});

document.getElementById("imageFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!selectedId) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImages[selectedId] = {
      fileName: file.name,
      dataUrl: ev.target.result
    };
    showPreview(ev.target.result);
    document.getElementById("editImageName").value = file.name;
    document.getElementById("editMessage").innerText = "※ 完了ボタンで保存されます";
    renderDevCards();
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ===== カード一覧レンダリング =====
function renderDevCards() {
  const container = document.getElementById("devCards");
  container.innerHTML = "";

  const total = devCards.length;
  devPage = clampPage(devPage, total);

  const pageItems = devCards.slice(devPage * PAGE_SIZE, (devPage + 1) * PAGE_SIZE);

  pageItems.forEach(card => {
    const el = document.createElement("div");
    el.className = "deckCard" + (card.id === selectedId ? " selected" : "");
    el.dataset.id = card.id;

    const pending = pendingImages[card.id];
    const imagePath = pending ? pending.dataUrl : (card.image ? `assets/cards/${card.image}` : "");

    if (imagePath) {
      const img = document.createElement("img");
      img.src = pending ? imagePath : encodeURI(imagePath);
      img.alt = card.name || card.id;
      img.onerror = () => { img.src = "assets/404.png"; };
      el.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style = "width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;min-height:0;";
      placeholder.textContent = "画像なし";
      el.appendChild(placeholder);
    }

    const nameDiv = document.createElement("div");
    nameDiv.className = "deckCardName";
    nameDiv.textContent = card.name || card.id;
    el.appendChild(nameDiv);

    const metaDiv = document.createElement("div");
    metaDiv.style = "font-size:11px;color:#555;margin-top:4px;line-height:1.2;text-align:center;";
    metaDiv.textContent = `${card.attribute || "近接"} / ${card.type || "アタッカー"}`;
    el.appendChild(metaDiv);

    if (card.tags) {
      const tagsDiv = document.createElement("div");
      tagsDiv.style = "font-size:10px;color:#777;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;";
      tagsDiv.textContent = card.tags;
      el.appendChild(tagsDiv);
    }

    el.addEventListener("click", () => selectCard(card.id));
    container.appendChild(el);
  });

  for (let i = pageItems.length; i < PAGE_SIZE; i++) {
    const empty = document.createElement("div");
    empty.className = "deckCard empty";
    container.appendChild(empty);
  }

  updatePager(total);
}

function clampPage(page, total) {
  const max = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  return Math.max(0, Math.min(max, page));
}

function updatePager(total) {
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  document.getElementById("devPrev").disabled = devPage <= 0;
  document.getElementById("devNext").disabled = devPage >= maxPage;
}

document.getElementById("devPrev").addEventListener("click", () => { devPage--; renderDevCards(); });
document.getElementById("devNext").addEventListener("click", () => { devPage++; renderDevCards(); });

// ===== 完了ボタン：cards.jsonをダウンロード =====
document.getElementById("doneBtn").addEventListener("click", () => {
  for (const [id, pending] of Object.entries(pendingImages)) {
    const card = devCards.find(c => c.id === id);
    if (card) card.image = pending.fileName;
  }

  const output = devCards.map(c => {
    const entry = {
      id: c.id,
      image: c.image || "",
      attribute: c.attribute || "近接",
      type: c.type || "アタッカー",
      tags: normalizeTags(c.tags)
    };
    return entry;
  });

  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cards.json";
  a.click();
  URL.revokeObjectURL(url);

  document.getElementById("editMessage").innerText = "cards.json をダウンロードしました。data/ フォルダに配置してください。";
});

// ===== レベル別ステータス編集 =====
function renderLevelStatsTable(){
  const stats = LEVEL_STATS; // core.js のグローバル
  const tbody = document.getElementById("levelStatsBody");
  if(!tbody) return;
  tbody.innerHTML = "";
  for(let lv = 1; lv <= LEVEL_MAX; lv++){
    const i = lv - 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;font-weight:bold;background:#fcfcfc;">Lv${lv}</td>
      <td>
        <input type="number" value="${(stats.atk && stats.atk[i]) ?? 0}" data-stat="atk" data-lv="${i}" class="devStatInput">
      </td>
      <td>
        <input type="number" value="${(stats.def && stats.def[i]) ?? 0}" data-stat="def" data-lv="${i}" class="devStatInput">
      </td>
      <td>
        <input type="number" value="${(stats.instantDef && stats.instantDef[i]) ?? 0}" data-stat="instantDef" data-lv="${i}" class="devStatInput">
      </td>
    `;
    tbody.appendChild(tr);
  }
}

document.getElementById("saveLevelStats").addEventListener("click", () => {
  const stats = { atk: [], def: [], instantDef: [] };
  document.querySelectorAll("#levelStatsBody input").forEach(input => {
    const stat = input.dataset.stat;
    const lv   = Number(input.dataset.lv);
    stats[stat][lv] = Number(input.value) || 0;
  });
  saveLevelStats(stats);
  const msg = document.getElementById("levelStatsMsg");
  msg.textContent = "保存しました";
  setTimeout(() => { msg.textContent = ""; }, 1500);
});

document.getElementById("resetLevelStats").addEventListener("click", () => {
  saveLevelStats(getDefaultLevelStats());
  renderLevelStatsTable();
});

renderLevelStatsTable();

// ===== カード削除機能 =====
const deleteCardBtn = document.getElementById("deleteCardBtn");
if (deleteCardBtn) {
  deleteCardBtn.addEventListener("click", async () => {
    const cardId = document.getElementById("deleteCardId").value.trim();
    const msgEl = document.getElementById("deleteCardMsg");
    
    if (!cardId) {
      msgEl.style.color = "#d9534f";
      msgEl.textContent = "❌ カードIDを入力してください";
      return;
    }
    
    // カードが存在するか確認
    const cardIndex = devCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      msgEl.style.color = "#d9534f";
      msgEl.textContent = `❌ カードID "${cardId}" が見つかりません`;
      return;
    }
  
  if (!confirm(`カード "${cardId}" を削除してもよろしいですか？`)) {
    return;
  }
  
  try {
    // ローカルから削除
    devCards.splice(cardIndex, 1);
    
    // cards.json から削除
    let cardData = [];
    try {
      const response = await fetch(CARD_DATA_URL);
      cardData = await response.json();
    } catch (e) {
      console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    }
    
    const updatedCards = cardData.filter(c => c.id !== cardId);
    
    // Firebase に保存
    if (window.firebaseClient?.db) {
      try {
        await window.firebaseClient.db.ref(`cardDatabase/cards`).set(updatedCards);
        console.log(`[Dev] カード "${cardId}" をサーバーから削除しました`);
      } catch (e) {
        console.warn(`[Dev] Firebase削除エラー、localStorageに保存します:`, e);
      }
    } else {
      console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
    }
    
    // localStorage に保存
    localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));
    
    // 画面を更新
    renderDevCards();
    document.getElementById("deleteCardId").value = "";
    
    msgEl.style.color = "#27ae60";
    msgEl.textContent = `✅ カード "${cardId}" を削除しました`;
    
    // 3秒後にメッセージを消す
    setTimeout(() => {
      msgEl.textContent = "";
    }, 3000);
    
  } catch (e) {
    console.error("[Dev] カード削除エラー:", e);
    msgEl.style.color = "#d9534f";
    msgEl.textContent = `❌ エラーが発生しました: ${e.message}`;
  }
});
}

// ===== 編集パネル内のカード削除 =====
document.getElementById("deleteSelectedCardBtn").addEventListener("click", async () => {
  const cardId = document.getElementById("editId").value.trim();
  const msgEl = document.getElementById("editMessage");
  
  if (!cardId) {
    msgEl.style.color = "#d9534f";
    msgEl.textContent = "❌ カードIDが取得できません";
    return;
  }
  
  if (!confirm(`カード "${cardId}" を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
    return;
  }
  
  try {
    // ローカルから削除
    const cardIndex = devCards.findIndex(c => c.id === cardId);
    if (cardIndex !== -1) {
      devCards.splice(cardIndex, 1);
    }
    
    // cards.json から削除
    let cardData = [];
    try {
      const response = await fetch(CARD_DATA_URL);
      cardData = await response.json();
    } catch (e) {
      console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    }
    
    const updatedCards = cardData.filter(c => c.id !== cardId);
    
    // Firebase に保存
    if (window.firebaseClient?.db) {
      try {
        await window.firebaseClient.db.ref(`cardDatabase/cards`).set(updatedCards);
        console.log(`[Dev] カード "${cardId}" をサーバーから削除しました`);
      } catch (e) {
        console.warn(`[Dev] Firebase削除エラー、localStorageに保存します:`, e);
      }
    } else {
      console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
    }
    
    // localStorage に保存
    localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));
    
    // 画面を更新
    renderDevCards();
    
    // 編集パネルを閉じる
    document.getElementById("editPanel").classList.add("hidden");
    selectedId = null;
    
    msgEl.style.color = "#27ae60";
    msgEl.textContent = `✅ カード "${cardId}" を削除しました`;
    
    // 3秒後にメッセージを消す
    setTimeout(() => {
      msgEl.textContent = "";
    }, 3000);
    
  } catch (e) {
    console.error("[Dev] カード削除エラー:", e);
    msgEl.style.color = "#d9534f";
    msgEl.textContent = `❌ エラーが発生しました: ${e.message}`;
  }
});

// ===== カード一括作成プロトコル =====
document.getElementById("openCardBatchUploader").addEventListener("click", () => {
  if (typeof openCardBatchUploader === "function") {
    openCardBatchUploader();
  } else {
    console.error("[Dev] openCardBatchUploader関数が見つかりません");
    alert("一括作成機能が利用できません。devTools.jsが正しく読み込まれているか確認してください。");
  }
});
