window.openPresetStorageUI = async function() {
  const overlay = document.createElement("div");
  overlay.className = "dev-overlay premium-glass";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; flex-direction:column; padding:20px; color:white; overflow-y:auto;";
  
  if (window.StatusBlockPresets && typeof window.StatusBlockPresets.load === 'function') {
    await window.StatusBlockPresets.load();
  }
  let presets = window.StatusBlockPresets ? [...window.StatusBlockPresets.get()] : [];

  const renderUI = () => {
    overlay.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto; width: 100%;">
        <h2 style="color: #f0d080; border-bottom: 2px solid #555; padding-bottom: 10px;">ステータスブロック プリセット一覧</h2>
        
        <div style="margin: 20px 0; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button id="devPresetDownloadBtn" style="padding:10px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⬇ JSON保存</button>
          <button id="devPresetCloseBtn" style="padding:10px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:auto;">閉じる</button>
        </div>

        <div style="overflow-x:auto; background: #111; border: 1px solid #444; border-radius: 10px;">
          <table style="width:100%; border-collapse: collapse; min-width: 620px;">
            <thead>
              <tr style="background: #222; border-bottom: 1px solid #555; text-align: left;">
                <th style="padding: 12px;">#</th>
                <th style="padding: 12px;">名称</th>
                <th style="padding: 12px;">層</th>
                <th style="padding: 12px;">対象</th>
                <th style="padding: 12px;">初期</th>
                <th style="padding: 12px;">最大</th>
                <th style="padding: 12px;">メモ</th>
              </tr>
            </thead>
            <tbody>
              ${presets.map((p, i) => `
                <tr style="border-bottom: 1px solid #333;">
                  <td style="padding: 12px; color:#ccc;">${i + 1}</td>
                  <td style="padding: 12px; color:#f0d080;">${p.name || '（無名）'}</td>
                  <td style="padding: 12px;">${p.type === 'ui' ? 'UI' : '盤面'}</td>
                  <td style="padding: 12px;">${p.target === 'opponent' ? '相手' : p.target === 'both' ? '両方' : '自分'}</td>
                  <td style="padding: 12px;">${p.current ?? ''}</td>
                  <td style="padding: 12px;">${p.max ?? ''}</td>
                  <td style="padding: 12px; color:#ccc;">${String(p.memo || '').slice(0, 80)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    overlay.querySelector("#devPresetCloseBtn").onclick = () => overlay.remove();
    overlay.querySelector("#devPresetDownloadBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "statusBlockPresets.json";
      a.click();
      URL.revokeObjectURL(url);
    };
  };

  document.body.appendChild(overlay);
  renderUI();
};
