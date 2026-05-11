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
    const defVal = (Array.isArray(stats.def) ? stats.def[idx] : 0) || 0;
    const idVal  = (Array.isArray(stats.instantDef) ? stats.instantDef[idx] : 1) || 0;
    const tr = document.createElement("tr");
    tr.style = "border-bottom:1px solid #333;";
    tr.innerHTML = `
      <td style="padding:10px;font-weight:bold;">${lv}</td>
      <td style="padding:5px;"><input type="number" data-lv="${lv}" data-key="def" value="${defVal}" style="width:60px;background:#333;color:white;border:1px solid #555;padding:4px;"></td>
      <td style="padding:5px;"><input type="number" data-lv="${lv}" data-key="instantDef" value="${idVal}" style="width:60px;background:#333;color:white;border:1px solid #555;padding:4px;"></td>
    `;
    tbody.appendChild(tr);
  }
  
  modal.querySelector("#devCancelBtn").onclick = () => overlay.remove();
  modal.querySelector("#devSaveBtn").onclick = async () => {
    const newStats = { def: [], instantDef: [] };
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
