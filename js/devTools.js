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

    const rootFolderName = getRootFolderNameFromFiles(files);
    const isDirectBlock = rootFolderName && /^block\d+$/i.test(rootFolderName);

    let blockFolders;
    if (isDirectBlock) {
      // 直接 block999 フォルダーが選択された場合
      blockFolders = [{ name: rootFolderName, files }];
    } else {
      // サブフォルダーから block999 を検索
      blockFolders = getBlockFoldersFromFiles(files);
      if (blockFolders.length === 0) {
        alert("選択したフォルダー内に 'block999' 形式のフォルダーが見つかりませんでした。");
        return;
      }
    }

    const totalImages = blockFolders.reduce((sum, folder) => sum + folder.files.length, 0);
    const confirmed = confirm(`${blockFolders.length} 個のブロックフォルダーから ${totalImages} 枚の画像をカードデータに追加/更新します。よろしいですか？`);
    if (!confirmed) return;

    await uploadCardsToServerFromBlocks(blockFolders);
  });

  fileInput.click();
}

function getRootFolderNameFromFiles(files) {
  const first = files[0];
  const relPath = first.webkitRelativePath || first.name;
  const parts = relPath.split("/");
  return parts.length >= 1 ? parts[0] : null;
}

function getBlockFoldersFromFiles(files) {
  const folderMap = {};
  files.forEach(file => {
    const relPath = file.webkitRelativePath || file.name;
    const parts = relPath.split("/");
    if (parts.length >= 2) {
      const subFolder = parts[1];
      const blockMatch = subFolder.match(/^block(\d+)$/i);
      if (blockMatch) {
        const blockNum = blockMatch[1];
        if (!folderMap[blockNum]) {
          folderMap[blockNum] = { name: subFolder, files: [] };
        }
        folderMap[blockNum].files.push(file);
      }
    }
  });
  return Object.values(folderMap);
}

async function uploadCardsToServerFromBlocks(blockFolders) {
  let cardData = [];
  try {
    const response = await fetch(CARD_DATA_URL);
    cardData = await response.json();
  } catch (e) {
    console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    cardData = [];
  }

  // 既存カードを image でマップ化
  const cardMap = {};
  cardData.forEach(card => {
    cardMap[card.image] = card;
  });

  let updatedCount = 0;
  let addedCount = 0;

  for (const folder of blockFolders) {
    const blockNumStr = folder.name.match(/^block(\d+)$/i)[1].padStart(3, "0");
    const sortedFiles = folder.files.slice().sort((a, b) => {
      const aPath = a.webkitRelativePath || a.name;
      const bPath = b.webkitRelativePath || b.name;
      return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedFiles.forEach((file, index) => {
      const imageName = (file.webkitRelativePath || file.name).split("/").pop();
      const imagePath = `${folder.name}/${imageName}`;
      const cardIdxStr = String(index + 1).padStart(3, "0");
      const cardId = `cd${blockNumStr}-${cardIdxStr}`;

      if (cardMap[imagePath]) {
        // 上書き
        cardMap[imagePath].id = cardId; // IDも更新（必要に応じて）
        updatedCount++;
        console.log(`[Dev] カード更新: ${cardId} (${imagePath})`);
      } else {
        // 新規追加
        const newCard = { id: cardId, image: imagePath };
        cardData.push(newCard);
        cardMap[imagePath] = newCard;
        addedCount++;
        console.log(`[Dev] カード追加: ${cardId} (${imagePath})`);
      }
    });
  }

  const useFirebase = !!window.firebaseClient?.db;
  if (useFirebase) {
    try {
      await window.firebaseClient.db.ref(`cardDatabase/cards`).set(cardData);
      console.log(`[Dev] カードデータをサーバーに保存しました (追加: ${addedCount}, 更新: ${updatedCount})`);
    } catch (e) {
      console.warn(`[Dev] Firebase保存エラー、localStorageに保存します:`, e);
    }
  } else {
    console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
  }

  localStorage.setItem("cardDatabase", JSON.stringify(cardData));

  if (typeof loadCardData === 'function') {
    try {
      await loadCardData();
    } catch (e) {
      console.warn("[Dev] カードデータリロード失敗:", e);
    }
  }

  // cards.json をダウンロード
  const jsonBlob = new Blob([JSON.stringify(cardData, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'cards.json';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);

  alert(`カードデータを更新しました (追加: ${addedCount}, 更新: ${updatedCount})。cards.json がダウンロードされました。`);
}


