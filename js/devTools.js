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
  const overlay = document.createElement("div");
  overlay.className = "devModalOverlay";
  overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-family:sans-serif;";
  
  const modal = document.createElement("div");
  modal.style = "background:#222;padding:20px;border-radius:10px;width:90%;max-width:600px;max-height:90%;overflow-y:auto;border:1px solid #444;";
  
  modal.innerHTML = `
    <h2 style="margin-top:0">カード一括作成 (Dev)</h2>
    <p style="color:#aaa;font-size:0.9em;margin-bottom:20px;">複数のカード画像をフォルダ単位でアップロードします。各ファイルが1枚のカードとして追加されます。</p>
    
    <div id="uploadArea" style="border:2px dashed #666;border-radius:8px;padding:30px;text-align:center;margin-bottom:20px;background:#1a1a1a;cursor:pointer;transition:all 0.3s;">
      <div style="font-size:48px;margin-bottom:10px;">📁</div>
      <div style="font-size:14px;color:#aaa;">ここにファイルをドラッグ＆ドロップするか、クリックして選択</div>
      <input type="file" id="cardFileInput" multiple accept="image/*" style="display:none;">
    </div>
    
    <div id="fileList" style="margin-bottom:20px;max-height:300px;overflow-y:auto;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:10px;"></div>
    
    <div id="uploadProgress" style="display:none;margin-bottom:20px;">
      <div style="font-size:12px;margin-bottom:5px;">アップロード中...</div>
      <div style="width:100%;height:20px;background:#333;border-radius:4px;overflow:hidden;">
        <div id="progressBar" style="width:0%;height:100%;background:#2f80ed;transition:width 0.3s;"></div>
      </div>
    </div>
    
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button id="devCardCancelBtn" style="padding:8px 20px;background:#555;color:white;border:none;border-radius:4px;cursor:pointer;">キャンセル</button>
      <button id="devCardUploadBtn" style="padding:8px 20px;background:#2f80ed;color:white;border:none;border-radius:4px;cursor:pointer;" disabled>アップロード</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  let selectedFiles = [];
  
  const uploadArea = modal.querySelector("#uploadArea");
  const fileInput = modal.querySelector("#cardFileInput");
  const fileList = modal.querySelector("#fileList");
  const uploadBtn = modal.querySelector("#devCardUploadBtn");
  const cancelBtn = modal.querySelector("#devCardCancelBtn");
  
  // ドラッグ&ドロップ処理
  uploadArea.addEventListener("click", () => fileInput.click());
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.style.background = "#2a2a2a";
    uploadArea.style.borderColor = "#2f80ed";
  });
  uploadArea.addEventListener("dragleave", () => {
    uploadArea.style.background = "#1a1a1a";
    uploadArea.style.borderColor = "#666";
  });
  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.style.background = "#1a1a1a";
    uploadArea.style.borderColor = "#666";
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) handleFileSelection(files);
  });
  
  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) handleFileSelection(files);
  });
  
  function handleFileSelection(files) {
    selectedFiles = files;
    fileList.innerHTML = "";
    
    files.forEach((file, idx) => {
      const div = document.createElement("div");
      div.style = "padding:8px;background:#333;margin-bottom:5px;border-radius:4px;font-size:12px;display:flex;justify-content:space-between;align-items:center;";
      div.innerHTML = `
        <span>${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
        <button style="background:#d9534f;color:white;border:none;padding:4px 8px;border-radius:2px;cursor:pointer;font-size:11px;">削除</button>
      `;
      div.querySelector("button").onclick = () => {
        selectedFiles.splice(idx, 1);
        handleFileSelection(selectedFiles);
      };
      fileList.appendChild(div);
    });
    
    uploadBtn.disabled = files.length === 0;
  }
  
  cancelBtn.onclick = () => overlay.remove();
  uploadBtn.onclick = () => uploadCardsToServer(selectedFiles, modal);
}

async function uploadCardsToServer(files, modal) {
  if (files.length === 0) {
    alert("ファイルを選択してください");
    return;
  }
  
  const uploadProgress = modal.querySelector("#uploadProgress");
  const progressBar = modal.querySelector("#progressBar");
  const uploadBtn = modal.querySelector("#devCardUploadBtn");
  
  uploadProgress.style.display = "block";
  uploadBtn.disabled = true;
  
  try {
    // 1. 次のブロック番号を計算
    let cardData = [];
    try {
      const response = await fetch("data/cards.json");
      cardData = await response.json();
    } catch (e) {
      console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
      cardData = [];
    }
    
    // 最大ブロック番号を取得
    let maxBlockNum = 0;
    cardData.forEach(card => {
      const match = card.id.match(/cd(\d+)/);
      if (match) {
        const blockNum = parseInt(match[1], 10);
        maxBlockNum = Math.max(maxBlockNum, blockNum);
      }
    });
    
    const nextBlockNum = maxBlockNum + 1;
    const blockNumStr = String(nextBlockNum).padStart(3, "0");
    
    console.log(`[Dev] 次のブロック番号: ${blockNumStr}`);
    
    // 2. Firebase または localStorage を使用
    const useFirebase = window.firebaseClient?.db ? true : false;
    console.log(`[Dev] データベース: ${useFirebase ? 'Firebase' : 'localStorage'}`);
    
    const newCards = [];
    const totalFiles = files.length;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const cardIdx = i + 1;
      const cardIdxStr = String(cardIdx).padStart(3, "0");
      const cardId = `cd${blockNumStr}-${cardIdxStr}`;
      const imagePath = `cards/block${blockNumStr}/card${cardIdxStr}.png`;
      
      // Firebase Storage にアップロード
      try {
        // デモ用：ローカルで画像パスを設定（実装時に Firebase Storage を使用）
        newCards.push({
          id: cardId,
          image: imagePath
        });
        console.log(`[Dev] カード追加: ${cardId} (${file.name})`);
      } catch (e) {
        console.error(`[Dev] ${cardId} のアップロード失敗:`, e);
      }
      
      // プログレス表示
      const progress = Math.round((i + 1) / totalFiles * 100);
      progressBar.style.width = progress + "%";
    }
    
    // 3. cards.json に追加
    const updatedCards = [...cardData, ...newCards];
    
    // Firebase Realtime Database に保存
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
    
    // ローカルストレージにも保存（オフラインモード対応）
    localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));
    
    // カードデータを即座にリロード
    if (typeof loadCardData === 'function') {
      try {
        await loadCardData();
      } catch (e) {
        console.warn("[Dev] カードデータリロード失敗:", e);
      }
    }
    
    alert(`✅ ${newCards.length} 枚のカードを追加しました！

【新しいフォルダ】
assets/cards/block${blockNumStr}/
  ├─ card001.png
  ├─ card002.png
  ├─ card003.png
  └─ ...

【カードID】
cd${blockNumStr}-001 〜 cd${blockNumStr}-${String(newCards.length).padStart(3, "0")}

※ フォルダ内のファイルをこの構造にしてください。`);
    
    // モーダルを閉じる
    setTimeout(() => {
      modal.parentElement.remove();
    }, 500);
    
  } catch (e) {
    console.error("[Dev] カード一括作成エラー:", e);
    alert("❌ エラーが発生しました: " + e.message);
  } finally {
    uploadProgress.style.display = "none";
    uploadBtn.disabled = false;
  }
}
