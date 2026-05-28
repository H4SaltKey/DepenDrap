// JSONのダウンロード/アップロード用ローカルヘルパー
const localDownloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const localUploadJson = (file, callback) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      callback(null, data);
    } catch (err) {
      callback(err, null);
    }
  };
  reader.onerror = () => callback(new Error("File read error"), null);
  reader.readAsText(file);
};

window.openPatchNotesEditor = async function() {
  await window.PatchNotesLoader.loadIndex();
  let indexData = window.PatchNotesLoader.index || { showPastVersions: true, versions: [] };
  let currentEditingVersion = null;

  const overlay = document.createElement("div");
  overlay.className = "dev-overlay premium-glass";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,8,20,0.96); z-index:10000; display:flex; flex-direction:column; padding:30px; color:white; overflow-y:auto; font-family:'Outfit', sans-serif;";

  const renderUI = () => {
    overlay.innerHTML = `
      <div style="max-width: 1000px; margin: 0 auto; width: 100%;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid rgba(199,179,119,0.4); padding-bottom: 15px; margin-bottom:25px;">
          <h2 style="color: #f0d080; margin:0; font-size:26px; letter-spacing:1.5px; font-weight:900;">PATCH NOTES EDITOR</h2>
          <button id="devPnClose" style="padding:10px 24px; background:#c0392b; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">閉じる</button>
        </div>
        
        <!-- Index 管理セクション -->
        <div style="background:rgba(20,15,35,0.7); padding:20px; border-radius:12px; border:1px solid rgba(199,179,119,0.3); margin-bottom:25px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
          <h3 style="margin-top:0; color:#f0d080; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; font-size:18px;">Index 管理 (index.json)</h3>
          <div style="display:flex; gap:15px; align-items:center; margin-bottom:20px; flex-wrap:wrap;">
            <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-size:14px;">
              <input type="checkbox" id="devPnShowPast" ${indexData.showPastVersions ? "checked" : ""} style="width:16px; height:16px;"> 過去バージョンを一般公開
            </label>
            <div style="flex-grow:1;"></div>
            <button id="devPnIndexDownload" style="padding:8px 16px; background:#27ae60; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">⬇ index.json ダウンロード</button>
            <label style="padding:8px 16px; background:#8e44ad; color:white; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s; display:inline-block;">
              ⬆ index.json アップロード
              <input type="file" id="devPnIndexUpload" accept=".json" style="display:none;">
            </label>
          </div>
          
          <div style="overflow-x:auto; border-radius:8px; border:1px solid rgba(255,255,255,0.1); margin-bottom:15px;">
            <table style="width:100%; border-collapse:collapse; background:rgba(0,0,0,0.3); font-size:14px;">
              <thead>
                <tr style="background:rgba(199,179,119,0.15); text-align:left; color:#f0d080;">
                  <th style="padding:12px;">ID (ファイル名)</th>
                  <th style="padding:12px;">表示バージョン名</th>
                  <th style="padding:12px;">日付</th>
                  <th style="padding:12px;">公開ステータス</th>
                  <th style="padding:12px; text-align:center;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${indexData.versions.length === 0 ? `
                  <tr>
                    <td colspan="5" style="padding:20px; text-align:center; color:#aaa;">バージョンが登録されていません。</td>
                  </tr>
                ` : indexData.versions.map((v, i) => `
                  <tr style="border-top:1px solid rgba(255,255,255,0.08); transition: background 0.2s;">
                    <td style="padding:12px; font-family:monospace; font-weight:bold;">${v.id}</td>
                    <td style="padding:12px;">${v.number}</td>
                    <td style="padding:12px;">${v.date}</td>
                    <td style="padding:12px;">
                      <select class="dev-pn-status-sel" data-idx="${i}" style="background:#111; color:white; border:1px solid rgba(199,179,119,0.4); padding:4px 8px; border-radius:4px; outline:none;">
                        <option value="draft" ${v.status === 'draft' ? 'selected' : ''}>下書き (Draft)</option>
                        <option value="public" ${v.status === 'public' ? 'selected' : ''}>公開中 (Public)</option>
                      </select>
                    </td>
                    <td style="padding:12px; text-align:center;">
                      <button class="dev-pn-del-btn" data-idx="${i}" style="background:#c0392b; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; transition: background 0.2s;">削除</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <button id="devPnAddIndexBtn" style="padding:10px 20px; background:#2980b9; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">＋ 新規バージョンをIndexに追加</button>
        </div>

        <!-- Version File 編集セクション -->
        <div style="background:rgba(20,15,35,0.7); padding:20px; border-radius:12px; border:1px solid rgba(199,179,119,0.3); margin-bottom:25px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
          <h3 style="margin-top:0; color:#f0d080; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; font-size:18px;">バージョン詳細ファイル編集 (vX_Y_Z.json)</h3>
          <div style="display:flex; gap:15px; align-items:center; margin-bottom:20px; flex-wrap:wrap;">
            <button id="devPnVersionNew" style="padding:8px 18px; background:#2f80ed; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">＋ 新規ファイル作成</button>
            <button id="devPnVersionDownload" style="padding:8px 18px; background:#27ae60; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s;">⬇ JSONファイルをダウンロード</button>
            <label style="padding:8px 18px; background:#8e44ad; color:white; border-radius:6px; cursor:pointer; font-weight:bold; transition: background 0.2s; display:inline-block;">
              ⬆ JSONファイルを読み込む
              <input type="file" id="devPnVersionUpload" accept=".json" style="display:none;">
            </label>
            <div style="flex-grow:1;"></div>
            <span id="devPnLoadedStatus" style="color:#f0d080; font-weight:bold; background:rgba(199,179,119,0.15); padding:6px 12px; border-radius:6px; border:1px solid rgba(199,179,119,0.3);">ファイル未読込</span>
          </div>
          
          <div id="devPnEditorArea" style="display:none; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
            <div style="display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap; background:rgba(0,0,0,0.25); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
              <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; color:#ccc;">
                ID (ファイル名になります)
                <input type="text" id="ev_id" placeholder="例: v1_0_0" style="background:#111; color:white; border:1px solid rgba(199,179,119,0.4); padding:8px 12px; border-radius:6px; outline:none; font-family:monospace;">
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; color:#ccc;">
                表示バージョン名
                <input type="text" id="ev_num" placeholder="例: 1.0.0" style="background:#111; color:white; border:1px solid rgba(199,179,119,0.4); padding:8px 12px; border-radius:6px; outline:none;">
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; color:#ccc;">
                日付
                <input type="text" id="ev_date" placeholder="YYYY-MM-DD" style="background:#111; color:white; border:1px solid rgba(199,179,119,0.4); padding:8px 12px; border-radius:6px; outline:none;">
              </label>
              <div style="display:flex; flex-direction:column; justify-content:center; margin-left:10px;">
                <span style="font-size:12px; color:#aaa; margin-bottom:6px;">🔔 新着バッジ点灯カテゴリ:</span> 
                <div style="display:flex; gap:15px;">
                  <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:13px;">
                    <input type="checkbox" id="ev_bell_cards" style="width:15px; height:15px;"> カード調整
                  </label>
                  <label style="cursor:pointer; display:flex; align-items:center; gap:6px; font-size:13px;">
                    <input type="checkbox" id="ev_bell_rules" style="width:15px; height:15px;"> ルール変更
                  </label>
                </div>
              </div>
            </div>
            
            <div style="display:flex; gap:20px; flex-wrap:wrap;">
              <!-- Cards 編集 -->
              <div style="flex:1; min-width:320px; border:1px solid rgba(199,179,119,0.3); border-radius:8px; padding:15px; background:rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; margin-bottom:15px;">
                  <h4 style="margin:0; color:#f0d080; font-size:16px;">🎴 カード調整項目</h4>
                  <button id="ev_add_card" style="cursor:pointer; background:#2980b9; color:white; border:none; border-radius:4px; padding:6px 12px; font-size:12px; font-weight:bold; transition: background 0.2s;">＋ 追加</button>
                </div>
                <div id="ev_cards_list" style="display:flex; flex-direction:column; gap:12px; max-height:500px; overflow-y:auto; padding-right:5px;"></div>
              </div>
              
              <!-- Rules 編集 -->
              <div style="flex:1; min-width:320px; border:1px solid rgba(199,179,119,0.3); border-radius:8px; padding:15px; background:rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; margin-bottom:15px;">
                  <h4 style="margin:0; color:#f0d080; font-size:16px;">📜 ゲームルール調整項目</h4>
                  <button id="ev_add_rule" style="cursor:pointer; background:#2980b9; color:white; border:none; border-radius:4px; padding:6px 12px; font-size:12px; font-weight:bold; transition: background 0.2s;">＋ 追加</button>
                </div>
                <div id="ev_rules_list" style="display:flex; flex-direction:column; gap:12px; max-height:500px; overflow-y:auto; padding-right:5px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    if (currentEditingVersion) renderEditorFields();
  };

  const bindEvents = () => {
    overlay.querySelector("#devPnClose").onclick = () => overlay.remove();

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
        if(confirm("このバージョンをIndexから削除しますか？\n(実ファイルは削除されません)")) {
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
      localDownloadJson(indexData, "index.json");
    };

    overlay.querySelector("#devPnIndexUpload").onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      localUploadJson(file, (err, data) => {
        if(err) alert("Failed to read JSON");
        else {
          indexData = data;
          renderUI();
        }
      });
    };

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
      localDownloadJson(currentEditingVersion, `${currentEditingVersion.id}.json`);
    };

    overlay.querySelector("#devPnVersionUpload").onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      localUploadJson(file, (err, data) => {
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
    overlay.querySelector("#devPnLoadedStatus").textContent = `${currentEditingVersion.id} 編集中`;
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
      div.style.cssText = "background:rgba(20,15,35,0.8); padding:15px; border:1px solid rgba(199,179,119,0.3); border-radius:8px; position:relative; display:flex; flex-direction:column; gap:8px;";
      div.innerHTML = `
        <button class="ev-c-del" style="position:absolute; top:8px; right:8px; background:#c0392b; color:white; border:none; width:24px; height:24px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:bold;">×</button>
        <div style="display:flex; gap:8px; align-items:center; margin-right:24px;">
          <input type="text" class="ev-c-name" value="${c.name}" placeholder="カード名 (例: 閃光撃)" style="flex:1; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:13px;">
          <select class="ev-c-type" style="background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 8px; border-radius:4px; outline:none; font-size:13px;">
            <option value="buff" ${c.type==='buff'?'selected':''}>強化 (Buff)</option>
            <option value="debuff" ${c.type==='debuff'?'selected':''}>弱体 (Debuff)</option>
            <option value="adjust" ${c.type==='adjust'?'selected':''}>調整 (Adjust)</option>
            <option value="text" ${c.type==='text'?'selected':''}>テキスト調整</option>
          </select>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" class="ev-c-bimg" value="${c.beforeImg||''}" placeholder="変更前画像 (例: block001/001.png)" style="flex:1; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:12px; font-family:monospace;">
          <input type="text" class="ev-c-aimg" value="${c.afterImg||''}" placeholder="変更後画像 (例: block001/001_new.png)" style="flex:1; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:12px; font-family:monospace;">
        </div>
        <textarea class="ev-c-comment" placeholder="調整内容コメント (改行可)" style="width:100%; height:60px; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:13px; box-sizing:border-box; resize:vertical; font-family:inherit;">${c.comment}</textarea>
      `;
      cardsList.appendChild(div);
    });

    const rulesList = overlay.querySelector("#ev_rules_list");
    rulesList.innerHTML = "";
    currentEditingVersion.rules.forEach((r, idx) => {
      const div = document.createElement("div");
      div.className = "ev-rule-item";
      div.style.cssText = "background:rgba(20,15,35,0.8); padding:15px; border:1px solid rgba(199,179,119,0.3); border-radius:8px; position:relative; display:flex; flex-direction:column; gap:8px;";
      div.innerHTML = `
        <button class="ev-r-del" style="position:absolute; top:8px; right:8px; background:#c0392b; color:white; border:none; width:24px; height:24px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; font-weight:bold;">×</button>
        <div style="margin-right:24px;">
          <input type="text" class="ev-r-title" value="${r.title}" placeholder="セクションタイトル (例: PP回復量の変更)" style="width:100%; box-sizing:border-box; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:13px; font-weight:bold;">
        </div>
        <textarea class="ev-r-text" placeholder="ルール変更内容の本文 (改行可)" style="width:100%; box-sizing:border-box; height:80px; background:#111; color:white; border:1px solid rgba(255,255,255,0.15); padding:6px 10px; border-radius:4px; outline:none; font-size:13px; resize:vertical; font-family:inherit;">${r.text}</textarea>
      `;
      rulesList.appendChild(div);
    });

    overlay.querySelectorAll(".ev-c-del").forEach((btn, i) => {
      btn.onclick = () => { syncEditorFields(); currentEditingVersion.cards.splice(i,1); renderEditorFields(); };
    });
    overlay.querySelectorAll(".ev-r-del").forEach((btn, i) => {
      btn.onclick = () => { syncEditorFields(); currentEditingVersion.rules.splice(i,1); renderEditorFields(); };
    });

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
