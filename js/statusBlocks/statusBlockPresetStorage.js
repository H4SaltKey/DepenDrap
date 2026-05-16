window.openPresetStorageUI = function() {
  const overlay = document.createElement("div");
  overlay.className = "dev-overlay premium-glass";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; flex-direction:column; padding:20px; color:white; overflow-y:auto;";
  
  let presets = window.StatusBlockPresets ? [...window.StatusBlockPresets.get()] : [];

  const renderUI = () => {
    overlay.innerHTML = `
      <div style="max-width: 800px; margin: 0 auto; width: 100%;">
        <h2 style="color: #f0d080; border-bottom: 2px solid #555; padding-bottom: 10px;">ステータスブロック プリセット管理</h2>
        
        <div style="margin: 20px 0; display:flex; gap:10px;">
          <button id="devPresetAddBtn" style="padding:10px; background:#2f80ed; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">＋ 新規作成</button>
          <button id="devPresetDownloadBtn" style="padding:10px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⬇ JSON保存</button>
          <label style="padding:10px; background:#8e44ad; color:white; border-radius:4px; cursor:pointer; font-weight:bold;">
            ⬆ JSON読込
            <input type="file" id="devPresetUpload" accept=".json" style="display:none;">
          </label>
          <button id="devPresetCloseBtn" style="padding:10px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:auto;">閉じる</button>
        </div>

        <table style="width:100%; border-collapse: collapse; background: #111; border: 1px solid #444;">
          <thead>
            <tr style="background: #222; border-bottom: 1px solid #555; text-align: left;">
              <th style="padding: 10px;">順序</th>
              <th style="padding: 10px;">名称</th>
              <th style="padding: 10px;">層</th>
              <th style="padding: 10px;">対象</th>
              <th style="padding: 10px;">初期/最大</th>
              <th style="padding: 10px;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${presets.map((p, i) => `
              <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 10px;">
                  <button class="dev-move-up" data-idx="${i}" style="background:transparent; border:none; color:white; cursor:pointer;">▲</button>
                  <button class="dev-move-down" data-idx="${i}" style="background:transparent; border:none; color:white; cursor:pointer;">▼</button>
                </td>
                <td style="padding: 10px; color:#f0d080;">${p.name}</td>
                <td style="padding: 10px;">${p.type === "ui" ? "UI" : "盤面"}</td>
                <td style="padding: 10px;">${p.target === "opponent" ? "相手" : p.target === "both" ? "両方" : "自分"}</td>
                <td style="padding: 10px;">${p.current} / ${p.max}</td>
                <td style="padding: 10px;">
                  <button class="dev-edit-btn" data-idx="${i}" style="background:#d35400; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">編集</button>
                  <button class="dev-del-btn" data-idx="${i}" style="background:#c0392b; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">削除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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

    overlay.querySelector("#devPresetUpload").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          presets = JSON.parse(ev.target.result);
          renderUI();
        } catch (err) {
          alert("JSONの読み込みに失敗しました");
        }
      };
      reader.readAsText(file);
    };

    overlay.querySelector("#devPresetAddBtn").onclick = () => {
      openEditor();
    };

    overlay.querySelectorAll(".dev-move-up").forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.idx);
        if (i > 0) {
          [presets[i-1], presets[i]] = [presets[i], presets[i-1]];
          renderUI();
        }
      };
    });

    overlay.querySelectorAll(".dev-move-down").forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.idx);
        if (i < presets.length - 1) {
          [presets[i+1], presets[i]] = [presets[i], presets[i+1]];
          renderUI();
        }
      };
    });

    overlay.querySelectorAll(".dev-del-btn").forEach(btn => {
      btn.onclick = () => {
        if(confirm("削除しますか？")) {
          presets.splice(parseInt(btn.dataset.idx), 1);
          renderUI();
        }
      };
    });

    overlay.querySelectorAll(".dev-edit-btn").forEach(btn => {
      btn.onclick = () => {
        openEditor(parseInt(btn.dataset.idx));
      };
    });
  };

  const openEditor = (idx = -1) => {
    let p = idx >= 0 ? presets[idx] : { name: "新規", type: "field", target: "self", ownerType: "self", current: 0, max: 10, memo: "", icon: "" };
    
    const editor = document.createElement("div");
    editor.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:20000; display:flex; align-items:center; justify-content:center;";
    editor.innerHTML = `
      <div style="background:#222; padding:20px; border-radius:8px; width:400px; display:flex; flex-direction:column; gap:10px; border: 1px solid #555;">
        <h3 style="margin:0 0 10px;">${idx >= 0 ? '編集' : '新規'}</h3>
        
        <label>名称</label>
        <input type="text" id="ed_p_name" value="${p.name}" style="background:#000; border:1px solid #444; color:white; padding:6px; user-select:text;">
        
        <label>層</label>
        <select id="ed_p_type" style="background:#000; border:1px solid #444; color:white; padding:6px;">
          <option value="field" ${p.type === 'field' ? 'selected' : ''}>盤面</option>
          <option value="ui" ${p.type === 'ui' ? 'selected' : ''}>UI</option>
        </select>
        
        <label>追加対象</label>
        <select id="ed_p_target" style="background:#000; border:1px solid #444; color:white; padding:6px;">
          <option value="self" ${p.target === 'self' ? 'selected' : ''}>自分</option>
          <option value="opponent" ${p.target === 'opponent' ? 'selected' : ''}>相手</option>
          <option value="both" ${p.target === 'both' ? 'selected' : ''}>両方</option>
        </select>
        
        <label>所有者タイプ</label>
        <select id="ed_p_ownerType" style="background:#000; border:1px solid #444; color:white; padding:6px;">
          <option value="self" ${p.ownerType === 'self' ? 'selected' : ''}>個人</option>
          <option value="shared" ${p.ownerType === 'shared' ? 'selected' : ''}>共有</option>
        </select>

        <div style="display:flex; gap:10px;">
          <div style="flex:1;"><label>初期値</label><input type="number" id="ed_p_cur" value="${p.current}" style="width:100%; background:#000; border:1px solid #444; color:white; padding:6px; user-select:text;"></div>
          <div style="flex:1;"><label>最大値</label><input type="number" id="ed_p_max" value="${p.max}" style="width:100%; background:#000; border:1px solid #444; color:white; padding:6px; user-select:text;"></div>
        </div>
        
        <label>メモ</label>
        <textarea id="ed_p_memo" style="background:#000; border:1px solid #444; color:white; padding:6px; min-height:60px; user-select:text;">${p.memo}</textarea>

        <label>アイコンBase64 (任意)</label>
        <textarea id="ed_p_icon" style="background:#000; border:1px solid #444; color:white; padding:6px; min-height:40px; user-select:text;">${p.icon}</textarea>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
          <button id="ed_p_cancel" style="padding:6px 12px; background:#444; border:none; color:white; border-radius:4px; cursor:pointer;">キャンセル</button>
          <button id="ed_p_save" style="padding:6px 12px; background:#2980b9; border:none; color:white; border-radius:4px; cursor:pointer;">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(editor);

    editor.querySelector("#ed_p_cancel").onclick = () => editor.remove();
    editor.querySelector("#ed_p_save").onclick = () => {
      p.name = editor.querySelector("#ed_p_name").value;
      p.type = editor.querySelector("#ed_p_type").value;
      p.target = editor.querySelector("#ed_p_target").value;
      p.ownerType = editor.querySelector("#ed_p_ownerType").value;
      p.current = Number(editor.querySelector("#ed_p_cur").value);
      p.max = Number(editor.querySelector("#ed_p_max").value);
      p.memo = editor.querySelector("#ed_p_memo").value;
      p.icon = editor.querySelector("#ed_p_icon").value;

      if (idx >= 0) presets[idx] = p;
      else presets.push(p);

      renderUI();
      editor.remove();
    };
  };

  document.body.appendChild(overlay);
  renderUI();
};
