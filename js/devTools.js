async function openLevelStatsEditor() {
  const overlay = document.createElement("div");
  overlay.className = "devModalOverlay";
  overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;";
  
  const modal = document.createElement("div");
  modal.style = "background:#222;padding:20px;border-radius:10px;width:90%;max-width:800px;max-height:90%;overflow-y:auto;border:1px solid #444;";
  
  modal.innerHTML = `
    <h2 style="margin-top:0">レベルステータス編集 (Dev)</h2>
    <p style="color:#aaa;font-size:0.9em;margin-bottom:20px;">各レベルにおける基礎ステータスを定義します。保存するとサーバーの levelStats.json が書き換わります。</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="border-bottom:1px solid #666;">
          <th style="padding:10px;text-align:left;">Lv</th>
          <th style="padding:10px;text-align:left;">基礎攻撃力</th>
          <th style="padding:10px;text-align:left;">基礎防御</th>
          <th style="padding:10px;text-align:left;">瞬間防御</th>
        </tr>
      </thead>
      <tbody id="lvlStatsTbody"></tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button id="devCancelBtn" style="padding:8px 20px;background:#555;color:white;border:none;border-radius:4px;cursor:pointer;">キャンセル</button>
      <button id="devSaveBtn" style="padding:8px 20px;background:#2f80ed;color:white;border:none;border-radius:4px;cursor:pointer;">サーバーに保存</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  const tbody = modal.querySelector("#lvlStatsTbody");
  const stats = LEVEL_STATS; // core.js のグローバル
  
  for (let lv = 1; lv <= 6; lv++) {
    const idx = lv - 1;
    const atkVal = (Array.isArray(stats.atk) ? stats.atk[idx] : 0) || 0;
    const defVal = (Array.isArray(stats.def) ? stats.def[idx] : 0) || 0;
    const idVal  = (Array.isArray(stats.instantDef) ? stats.instantDef[idx] : 1) || 0;
    const tr = document.createElement("tr");
    tr.style = "border-bottom:1px solid #333;";
    tr.innerHTML = `
      <td style="padding:10px;font-weight:bold;">${lv}</td>
      <td style="padding:5px;"><input type="number" data-lv="${lv}" data-key="atk" value="${atkVal}" style="width:60px;background:#333;color:white;border:1px solid #555;padding:4px;"></td>
      <td style="padding:5px;"><input type="number" data-lv="${lv}" data-key="def" value="${defVal}" style="width:60px;background:#333;color:white;border:1px solid #555;padding:4px;"></td>
      <td style="padding:5px;"><input type="number" data-lv="${lv}" data-key="instantDef" value="${idVal}" style="width:60px;background:#333;color:white;border:1px solid #555;padding:4px;"></td>
    `;
    tbody.appendChild(tr);
  }
  
  modal.querySelector("#devCancelBtn").onclick = () => overlay.remove();
  modal.querySelector("#devSaveBtn").onclick = async () => {
    const newStats = { atk: [], def: [], instantDef: [] };
    modal.querySelectorAll("input").forEach(input => {
      const lv = Number(input.dataset.lv);
      const idx = lv - 1;
      const key = input.dataset.key;
      newStats[key][idx] = Number(input.value);
    });
    
    if (typeof saveLevelStats === "function") {
      await saveLevelStats(newStats);
    }
    overlay.remove();
    
    // 全プレイヤーのステータスを即時再適用
    ["player1", "player2"].forEach(owner => {
      if (typeof applyLevelStats === "function") applyLevelStats(owner);
    });
    if (typeof update === "function") update();
  };
}

// ===== カード一括作成プロトコル =====

async function openCardBatchUploader() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.webkitdirectory = true;
  fileInput.multiple = true;
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
    document.body.removeChild(fileInput);
    if (files.length === 0) {
      alert("フォルダ内に画像ファイルが見つかりませんでした。");
      return;
    }

    const folderName = getFolderNameFromFiles(files);
    if (!folderName) {
      alert("フォルダ名を取得できませんでした。assets/cards内のblockXXXフォルダを選択してください。");
      return;
    }

    const blockMatch = folderName.match(/block(?:x)?(\d+)/i);
    const blockNumStr = blockMatch ? String(parseInt(blockMatch[1], 10)).padStart(3, "0") : null;
    const targetLabel = blockNumStr ? `block${blockNumStr}` : folderName;
    const count = files.length;
    const confirmed = confirm(`フォルダ "${targetLabel}" の画像 ${count} 枚を新規カードとして追加します。よろしいですか？`);
    if (!confirmed) return;

    await uploadCardsToServer(files, folderName, blockNumStr);
  });

  fileInput.click();
}

function getFolderNameFromFiles(files) {
  const first = files[0];
  const relPath = first.webkitRelativePath || first.name;
  const folder = relPath.split("/")[0];
  return folder || null;
}

async function uploadCardsToServer(files, folderName, blockNumStrOverride) {
  if (files.length === 0) {
    alert("画像ファイルが選択されていません。");
    return;
  }

  let cardData = [];
  try {
    const response = await fetch("data/cards.json");
    cardData = await response.json();
  } catch (e) {
    console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    cardData = [];
  }

  const blockMatch = folderName.match(/block(?:x)?(\d+)/i);
  let blockNum = blockMatch ? parseInt(blockMatch[1], 10) : null;

  if (!blockNum && blockNumStrOverride) {
    blockNum = parseInt(blockNumStrOverride, 10);
  }

  if (!blockNum) {
    let maxBlockNum = 0;
    cardData.forEach(card => {
      const match = card.id.match(/^cd(\d{3})-/);
      if (match) {
        maxBlockNum = Math.max(maxBlockNum, parseInt(match[1], 10));
      }
    });
    blockNum = maxBlockNum + 1;
  }

  const blockNumStr = String(blockNum).padStart(3, "0");
  const folderLabel = blockMatch ? `block${blockNumStr}` : folderName;

  const existingBlockCards = cardData.filter(c => c.id.startsWith(`cd${blockNumStr}-`));
  if (existingBlockCards.length > 0) {
    const continueConfirm = confirm(`同じブロック番号 cd${blockNumStr} のカードが既に ${existingBlockCards.length} 件存在します。続行しますか？`);
    if (!continueConfirm) return;
  }

  const sortedFiles = files.slice().sort((a, b) => {
    const aPath = a.webkitRelativePath || a.name;
    const bPath = b.webkitRelativePath || b.name;
    return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: 'base' });
  });

  const newCards = [];
  sortedFiles.forEach((file, index) => {
    const cardIdxStr = String(index + 1).padStart(3, "0");
    const cardId = `cd${blockNumStr}-${cardIdxStr}`;
    const imageName = (file.webkitRelativePath || file.name).split("/").pop();
    const imagePath = `${folderLabel}/${imageName}`;
    newCards.push({ id: cardId, image: imagePath });
    console.log(`[Dev] カード追加: ${cardId} (${imagePath})`);
  });

  const updatedCards = [...cardData, ...newCards];

  const useFirebase = !!window.firebaseClient?.db;
  if (useFirebase) {
    try {
      await window.firebaseClient.db.ref(`cardDatabase/cards`).set(updatedCards);
      console.log(`[Dev] ${newCards.length} 枚のカードをサーバーに保存しました`);
    } catch (e) {
      console.warn(`[Dev] Firebase保存エラー、localStorageに保存します:`, e);
    }
  } else {
    console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
  }

  localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));

  if (typeof loadCardData === 'function') {
    try {
      await loadCardData();
    } catch (e) {
      console.warn("[Dev] カードデータリロード失敗:", e);
    }
  }

  alert(`✅ ${newCards.length} 枚のカードを追加しました！\n\n【フォルダ】\n${folderLabel}\n\n【カードID】\n${newCards[0].id} 〜 ${newCards[newCards.length - 1].id}`);
}
