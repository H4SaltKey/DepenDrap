window.openPatchNotesEditor = async function() {
  await window.PatchNotesLoader.loadIndex();
  let indexData = window.PatchNotesLoader.index || { showPastVersions: true, versions: [] };
  let currentEditingVersion = null;

  const overlay = document.createElement("div");
  overlay.className = "dev-overlay premium-glass";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:10000; display:flex; flex-direction:column; padding:20px; color:white; overflow-y:auto;";

  const renderUI = () => {
    overlay.innerHTML = \`
      <div style="max-width: 900px; margin: 0 auto; width: 100%;">
        <h2 style="color: #f0d080; border-bottom: 2px solid #555; padding-bottom: 10px;">Patch Notes Editor</h2>
        
        <div style="background:#111; padding:15px; border-radius:8px; border:1px solid #444; margin-bottom:20px;">
          <h3 style="margin-top:0;">Index 管理</h3>
          <div style="display:flex; gap:15px; align-items:center; margin-bottom:15px;">
            <label style="cursor:pointer;">
              <input type="checkbox" id="devPnShowPast" \${indexData.showPastVersions ? "checked" : ""}> 過去バージョンを一般公開
            </label>
            <button id="devPnIndexDownload" style="padding:6px 12px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">⬇ index.json 保存</button>
            <label style="padding:6px 12px; background:#8e44ad; color:white; border-radius:4px; cursor:pointer;">
              ⬆ index.json 読込
              <input type="file" id="devPnIndexUpload" accept=".json" style="display:none;">
            </label>
          </div>
          <table style="width:100%; border-collapse:collapse; background:#222; border:1px solid #444; margin-bottom:10px;">
            <thead>
              <tr style="background:#333; text-align:left;">
                <th style="padding:8px;">ID</th>
                <th style="padding:8px;">Version</th>
                <th style="padding:8px;">Date</th>
                <th style="padding:8px;">Status</th>
                <th style="padding:8px;">操作</th>
              </tr>
            </thead>
            <tbody>
              \${indexData.versions.map((v, i) => \`
                <tr style="border-top:1px solid #444;">
                  <td style="padding:8px;">\${v.id}</td>
                  <td style="padding:8px;">\${v.number}</td>
                  <td style="padding:8px;">\${v.date}</td>
                  <td style="padding:8px;">
                    <select class="dev-pn-status-sel" data-idx="\${i}" style="background:#000; color:white; border:1px solid #555;">
                      <option value="draft" \${v.status === 'draft' ? 'selected' : ''}>Draft</option>
                      <option value="public" \${v.status === 'public' ? 'selected' : ''}>Public</option>
                    </select>
                  </td>
                  <td style="padding:8px;">
                    <button class="dev-pn-del-btn" data-idx="\${i}" style="background:#c0392b; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">削除</button>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
          <button id="devPnAddIndexBtn" style="padding:6px 12px; background:#2980b9; color:white; border:none; border-radius:4px; cursor:pointer;">＋ 新規バージョンをIndexに追加</button>
        </div>

        <div style="background:#111; padding:15px; border-radius:8px; border:1px solid #444; margin-bottom:20px;">
          <h3 style="margin-top:0;">Version File 編集 (vX_Y_Z.json)</h3>
          <div style="display:flex; gap:15px; align-items:center; margin-bottom:15px;">
            <button id="devPnVersionNew" style="padding:6px 12px; background:#2f80ed; color:white; border:none; border-radius:4px; cursor:pointer;">新規作成</button>
            <button id="devPnVersionDownload" style="padding:6px 12px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">⬇ JSON保存</button>
            <label style="padding:6px 12px; background:#8e44ad; color:white; border-radius:4px; cursor:pointer;">
              ⬆ JSON読込
              <input type="file" id="devPnVersionUpload" accept=".json" style="display:none;">
            </label>
            <span id="devPnLoadedStatus" style="color:#aaa;">未読み込み</span>
          </div>
          
          <div id="devPnEditorArea" style="display:none; border-top:1px solid #333; padding-top:15px;">
            <div style="display:flex; gap:10px; margin-bottom:15px;">
              <label>ID: <input type="text" id="ev_id" style="background:#000; color:white; border:1px solid #444; padding:4px;"></label>
              <label>Version: <input type="text" id="ev_num" style="background:#000; color:white; border:1px solid #444; padding:4px;"></label>
              <label>Date: <input type="text" id="ev_date" style="background:#000; color:white; border:1px solid #444; padding:4px;"></label>
            </div>
            
            <div style="margin-bottom:15px;">
              <strong>🔔 Bell-Dot 設定:</strong> 
              <label style="margin-left:10px;"><input type="checkbox" id="ev_bell_cards"> カード調整</label>
              <label style="margin-left:10px;"><input type="checkbox" id="ev_bell_rules"> ルール変更</label>
            </div>
            
            <div style="display:flex; gap:20px;">
              <!-- Cards -->
              <div style="flex:1; border:1px solid #444; border-radius:4px; padding:10px; background:#1a1a1a;">
                <h4>カード調整 <button id="ev_add_card" style="float:right; cursor:pointer; background:#555; color:white; border:none; border-radius:3px;">追加</button></h4>
                <div id="ev_cards_list" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;"></div>
              </div>
              
              <!-- Rules -->
              <div style="flex:1; border:1px solid #444; border-radius:4px; padding:10px; background:#1a1a1a;">
                <h4>ゲームルール変更 <button id="ev_add_rule" style="float:right; cursor:pointer; background:#555; color:white; border:none; border-radius:3px;">追加</button></h4>
                <div id="ev_rules_list" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;"></div>
              </div>
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <button id="devPnClose" style="padding:10px 20px; background:#c0392b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">閉じる</button>
        </div>
      </div>
    \`;

    bindEvents();
    if (currentEditingVersion) renderEditorFields();
  };

  const bindEvents = () => {
    overlay.querySelector("#devPnClose").onclick = () => overlay.remove();

    // Index events
    overlay.querySelector("#devPnShowPast").onchange = (e) => {
      indexData.showPastVersions = e.target.checked;
    };
    
    overlay.querySelectorAll(".dev-pn-status-sel").forEach(sel => {
      sel.onchange = (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        indexData.versions[idx].status = e.target.value;
      };
    });

    overlay.querySelectorAll(".dev-pn-del-btn").forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if(confirm("削除しますか？")) {
          indexData.versions.splice(idx, 1);
          renderUI();
        }
      };
    });

    overlay.querySelector("#devPnAddIndexBtn").onclick = () => {
      indexData.versions.push({
        id: "vX_Y_Z",
        number: "X.Y.Z",
        date: new Date().toISOString().split('T')[0],
        status: "draft"
      });
      renderUI();
    };

    overlay.querySelector("#devPnIndexDownload").onclick = () => {
      window.PatchNotesStorage.downloadJson(indexData, "index.json");
    };

    overlay.querySelector("#devPnIndexUpload").onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      window.PatchNotesStorage.uploadJson(file, (err, data) => {
        if(err) alert("Failed to read JSON");
        else {
          indexData = data;
          renderUI();
        }
      });
    };

    // Version events
    overlay.querySelector("#devPnVersionNew").onclick = () => {
      currentEditingVersion = {
        id: "vX_Y_Z", number: "X.Y.Z", date: new Date().toISOString().split('T')[0],
        status: "public",
        bellDot: { cards: false, rules: false },
        cards: [], rules: []
      };
      renderUI();
    };

    overlay.querySelector("#devPnVersionDownload").onclick = () => {
      if(!currentEditingVersion) return;
      syncEditorFields();
      window.PatchNotesStorage.downloadJson(currentEditingVersion, \`\${currentEditingVersion.id}.json\`);
    };

    overlay.querySelector("#devPnVersionUpload").onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      window.PatchNotesStorage.uploadJson(file, (err, data) => {
        if(err) alert("Failed to read JSON");
        else {
          currentEditingVersion = data;
          if(!currentEditingVersion.cards) currentEditingVersion.cards = [];
          if(!currentEditingVersion.rules) currentEditingVersion.rules = [];
          if(!currentEditingVersion.bellDot) currentEditingVersion.bellDot = { cards:false, rules:false };
          renderUI();
        }
      });
    };
  };

  const syncEditorFields = () => {
    if(!currentEditingVersion) return;
    currentEditingVersion.id = overlay.querySelector("#ev_id").value;
    currentEditingVersion.number = overlay.querySelector("#ev_num").value;
    currentEditingVersion.date = overlay.querySelector("#ev_date").value;
    currentEditingVersion.bellDot.cards = overlay.querySelector("#ev_bell_cards").checked;
    currentEditingVersion.bellDot.rules = overlay.querySelector("#ev_bell_rules").checked;

    // sync cards
    const cards = [];
    overlay.querySelectorAll(".ev-card-item").forEach(item => {
      cards.push({
        name: item.querySelector(".ev-c-name").value,
        type: item.querySelector(".ev-c-type").value,
        beforeImg: item.querySelector(".ev-c-bimg").value,
        afterImg: item.querySelector(".ev-c-aimg").value,
        comment: item.querySelector(".ev-c-comment").value
      });
    });
    currentEditingVersion.cards = cards;

    // sync rules
    const rules = [];
    overlay.querySelectorAll(".ev-rule-item").forEach(item => {
      rules.push({
        title: item.querySelector(".ev-r-title").value,
        text: item.querySelector(".ev-r-text").value
      });
    });
    currentEditingVersion.rules = rules;
  };

  const renderEditorFields = () => {
    overlay.querySelector("#devPnLoadedStatus").textContent = \`[\${currentEditingVersion.id} 編集中]\`;
    overlay.querySelector("#devPnEditorArea").style.display = "block";

    overlay.querySelector("#ev_id").value = currentEditingVersion.id || "";
    overlay.querySelector("#ev_num").value = currentEditingVersion.number || "";
    overlay.querySelector("#ev_date").value = currentEditingVersion.date || "";
    overlay.querySelector("#ev_bell_cards").checked = !!currentEditingVersion.bellDot.cards;
    overlay.querySelector("#ev_bell_rules").checked = !!currentEditingVersion.bellDot.rules;

    const cardsList = overlay.querySelector("#ev_cards_list");
    cardsList.innerHTML = "";
    currentEditingVersion.cards.forEach((c, idx) => {
      const div = document.createElement("div");
      div.className = "ev-card-item";
      div.style.cssText = "background:#222; padding:10px; border:1px solid #444; position:relative;";
      div.innerHTML = \`
        <button class="ev-c-del" style="position:absolute; top:5px; right:5px; background:red; color:white; border:none; cursor:pointer;">X</button>
        <div style="display:flex; gap:5px; margin-bottom:5px;">
          <input type="text" class="ev-c-name" value="\${c.name}" placeholder="カード名" style="flex:1; background:#000; color:white; border:1px solid #555;">
          <select class="ev-c-type" style="background:#000; color:white; border:1px solid #555;">
            <option value="buff" \${c.type==='buff'?'selected':''}>Buff</option>
            <option value="debuff" \${c.type==='debuff'?'selected':''}>Debuff</option>
            <option value="adjust" \${c.type==='adjust'?'selected':''}>調整</option>
            <option value="text" \${c.type==='text'?'selected':''}>テキスト</option>
          </select>
        </div>
        <div style="display:flex; gap:5px; margin-bottom:5px;">
          <input type="text" class="ev-c-bimg" value="\${c.beforeImg||''}" placeholder="変更前画像パス" style="flex:1; background:#000; color:white; border:1px solid #555;">
          <input type="text" class="ev-c-aimg" value="\${c.afterImg||''}" placeholder="変更後画像パス" style="flex:1; background:#000; color:white; border:1px solid #555;">
        </div>
        <textarea class="ev-c-comment" placeholder="コメント" style="width:100%; height:50px; background:#000; color:white; border:1px solid #555; box-sizing:border-box;">\${c.comment}</textarea>
      \`;
      cardsList.appendChild(div);
    });

    const rulesList = overlay.querySelector("#ev_rules_list");
    rulesList.innerHTML = "";
    currentEditingVersion.rules.forEach((r, idx) => {
      const div = document.createElement("div");
      div.className = "ev-rule-item";
      div.style.cssText = "background:#222; padding:10px; border:1px solid #444; position:relative;";
      div.innerHTML = \`
        <button class="ev-r-del" style="position:absolute; top:5px; right:5px; background:red; color:white; border:none; cursor:pointer;">X</button>
        <input type="text" class="ev-r-title" value="\${r.title}" placeholder="セクションタイトル" style="width:100%; box-sizing:border-box; background:#000; color:white; border:1px solid #555; margin-bottom:5px;">
        <textarea class="ev-r-text" placeholder="本文" style="width:100%; box-sizing:border-box; height:60px; background:#000; color:white; border:1px solid #555;">\${r.text}</textarea>
      \`;
      rulesList.appendChild(div);
    });

    // delete buttons
    overlay.querySelectorAll(".ev-c-del").forEach((btn, i) => {
      btn.onclick = () => { syncEditorFields(); currentEditingVersion.cards.splice(i,1); renderEditorFields(); };
    });
    overlay.querySelectorAll(".ev-r-del").forEach((btn, i) => {
      btn.onclick = () => { syncEditorFields(); currentEditingVersion.rules.splice(i,1); renderEditorFields(); };
    });

    // add buttons
    overlay.querySelector("#ev_add_card").onclick = () => {
      syncEditorFields();
      currentEditingVersion.cards.push({name:"", type:"buff", beforeImg:"", afterImg:"", comment:""});
      renderEditorFields();
    };
    overlay.querySelector("#ev_add_rule").onclick = () => {
      syncEditorFields();
      currentEditingVersion.rules.push({title:"", text:""});
      renderEditorFields();
    };
  };

  document.body.appendChild(overlay);
  renderUI();
};
