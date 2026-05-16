window.openStatusBlockPresetModal = function(fieldX, fieldY) {
  const presets = window.StatusBlockPresets ? window.StatusBlockPresets.get() : [];
  if (!presets || presets.length === 0) {
    alert("プリセットが存在しません。dev.htmlから設定してください。");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "sb-editor-overlay";
  
  let html = `
    <div class="sb-editor-modal premium-glass" style="width: 500px;">
      <h3 style="color: white; margin: 0 0 10px 0;">ステータスブロック（プリセット）追加</h3>
      <div style="max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
        <table style="width:100%; border-collapse: collapse; color: white; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 1px solid #666; text-align: left;">
              <th style="padding: 6px; width: 40px;">選択</th>
              <th style="padding: 6px;">名称</th>
              <th style="padding: 6px;">層</th>
              <th style="padding: 6px;">対象</th>
              <th style="padding: 6px;">最大値</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  presets.forEach((p, idx) => {
    const targetText = p.target === "opponent" ? "相手" : p.target === "both" ? "両方" : "自分";
    const typeText = p.type === "ui" ? "UI" : "盤面";
    html += `
      <tr style="border-bottom: 1px solid #333;">
        <td style="padding: 6px; text-align: center;"><input type="checkbox" class="preset-cb" data-idx="${idx}"></td>
        <td style="padding: 6px; font-weight: bold; color: #f0d080;">${p.name}</td>
        <td style="padding: 6px;">${typeText}</td>
        <td style="padding: 6px;">${targetText}</td>
        <td style="padding: 6px;">${p.max}</td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button id="sbPresetCancel" style="padding:8px 16px; border-radius:4px; border:none; background:#444; color:white; cursor:pointer;">キャンセル</button>
        <button id="sbPresetConfirm" style="padding:8px 16px; border-radius:4px; border:none; background:#c89b3c; color:#1a172c; font-weight:bold; cursor:pointer;">確定</button>
      </div>
    </div>
  `;
  overlay.innerHTML = html;
  
  document.body.appendChild(overlay);

  overlay.querySelector("#sbPresetCancel").onclick = () => overlay.remove();
  
  overlay.querySelector("#sbPresetConfirm").onclick = () => {
    const checkboxes = overlay.querySelectorAll(".preset-cb:checked");
    if (checkboxes.length === 0) {
      alert("プリセットが選択されていません");
      return;
    }
    
    let addedCount = 0;
    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.idx, 10);
      const preset = presets[idx];
      if (!preset) return;
      
      const targets = [];
      const myRole = window.myRole || "player1";
      const opRole = myRole === "player1" ? "player2" : "player1";
      
      if (preset.target === "opponent") targets.push(opRole);
      else if (preset.target === "both") { targets.push(myRole); targets.push(opRole); }
      else targets.push(myRole);
      
      targets.forEach(targetOwner => {
        const nx = fieldX + (addedCount * 30);
        const ny = fieldY + (addedCount * 20);
        
        const newBlock = {
          name: preset.name,
          type: preset.type || "field",
          ownerType: preset.ownerType || "self",
          current: preset.current || 0,
          max: preset.max || 10,
          memo: preset.memo || "",
          icon: preset.icon || "",
          w: 0, h: 0,
          x: nx, y: ny,
          owner: targetOwner
        };
        
        if (newBlock.ownerType === "self") {
          const ownerName = state[targetOwner]?.name || (targetOwner === 'player1' ? 'Player1' : 'Player2');
          const prefix = `${ownerName}の `;
          if (!newBlock.name.startsWith(prefix)) newBlock.name = prefix + newBlock.name;
        }

        const success = window.addStatusBlockData(newBlock);
        if (success) addedCount++;
      });
    });
    
    overlay.remove();
  };
};
