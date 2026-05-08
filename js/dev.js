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
      name: c.name || ""
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
  devCards.push({ id, image: "", name: "" });
  devPage = Math.floor((devCards.length - 1) / PAGE_SIZE);
  renderDevCards();
  selectCard(id);
});

function generateId() {
  const nums = devCards
    .map(c => c.id)
    .filter(id => /^cd\d{4}$/.test(id))
    .map(id => parseInt(id.slice(2), 10));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 0;
  return "cd" + String(next).padStart(4, "0");
}

// ===== カード選択 =====
function selectCard(id) {
  selectedId = id;
  const card = devCards.find(c => c.id === id);
  if (!card) return;

  document.getElementById("editPanel").classList.remove("hidden");
  document.getElementById("editId").value = card.id;
  document.getElementById("editName").value = card.name || "";

  const pending = pendingImages[id];
  if (pending) {
    showPreview(pending.dataUrl);
    document.getElementById("editImageName").value = pending.fileName;
  } else if (card.image) {
    showPreview("assets/cards/" + card.image);
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

// ===== カード名の変更を即時反映 =====
document.getElementById("editName").addEventListener("input", () => {
  if (!selectedId) return;
  const card = devCards.find(c => c.id === selectedId);
  if (card) {
    card.name = document.getElementById("editName").value;
    renderDevCards();
  }
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
    const imgSrc = pending
      ? pending.dataUrl
      : card.image
        ? "assets/cards/" + card.image
        : "";

    el.innerHTML = imgSrc
      ? `<img src="${imgSrc}" alt=""><div class="deckCardName">${card.name || card.id}</div>`
      : `<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;min-height:0;">画像なし</div><div class="deckCardName">${card.name || card.id}</div>`;

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
    const entry = { id: c.id, image: c.image || "" };
    if (c.name) entry.name = c.name;
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
