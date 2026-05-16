/**
 * statusBlocks.js
 * フィールド上およびUI上のステータスブロックをレンダリングする
 */

const SB_FIELD_W = 3000;
const SB_FIELD_H = 2000;

function getFieldTransform() {
  return {
    zoom: (typeof fieldZoom !== 'undefined') ? fieldZoom : 1,
    panX: (typeof fieldPanX !== 'undefined') ? fieldPanX : 0,
    panY: (typeof fieldPanY !== 'undefined') ? fieldPanY : 0
  };
}

window.renderStatusBlocks = function() {
  const p1Blocks = state.player1?.statusBlocks || [];
  const p2Blocks = state.player2?.statusBlocks || [];
  const allBlocks = [...p1Blocks, ...p2Blocks];
  
  ensureLayers();

  const fieldLayer = document.getElementById("fieldStatusBlocksLayer");
  const uiLayer = document.getElementById("uiStatusBlocksLayer");

  const existingElements = new Set(document.querySelectorAll(".status-block"));
  const activeIds = new Set(allBlocks.map(b => b.id));

  existingElements.forEach(el => {
    if (!activeIds.has(el.id)) el.remove();
  });

  const uiBlocks = allBlocks.filter(b => b.type === "ui");
  const myRole = window.myRole || "player1";
  uiBlocks.sort((a, b) => {
    if (a.owner === b.owner) {
      const list = state[a.owner].statusBlocks;
      return list.indexOf(a) - list.indexOf(b);
    }
    return a.owner === myRole ? -1 : 1;
  });

  uiBlocks.forEach((block, index) => {
    renderSingleBlock(block, uiLayer, index);
  });

  const fieldBlocks = allBlocks.filter(b => b.type === "field");
  fieldBlocks.forEach(block => {
    renderSingleBlock(block, fieldLayer);
  });
};

function ensureLayers() {
  let fieldLayer = document.getElementById("fieldStatusBlocksLayer");
  if (!fieldLayer) {
    fieldLayer = document.createElement("div");
    fieldLayer.id = "fieldStatusBlocksLayer";
    fieldLayer.style.cssText = `position:absolute;top:0;left:0;width:${SB_FIELD_W}px;height:${SB_FIELD_H}px;pointer-events:none;z-index:50;`;
    const content = document.getElementById("fieldContent");
    if (content) content.appendChild(fieldLayer);
  }

  let uiLayer = document.getElementById("uiStatusBlocksLayer");
  if (!uiLayer) {
    uiLayer = document.createElement("div");
    uiLayer.id = "uiStatusBlocksLayer";
    uiLayer.style.cssText = `position:fixed;top:0;left:0;padding:5px;display:flex;flex-direction:column;gap:5px;pointer-events:none;z-index:10000;width:fit-content;`;
    document.body.appendChild(uiLayer);
  }
}

function renderSingleBlock(block, parent, index) {
  let el = document.getElementById(block.id);
  const myRole = window.myRole || "player1";
  const isMine = block.owner === myRole;
  const isShared = block.ownerType === "shared";
  const canEditContent = isMine || isShared;

  if (!el) {
    el = document.createElement("div");
    el.id = block.id;
    parent.appendChild(el);
  } else if (el.parentElement !== parent) {
    parent.appendChild(el);
  }

  el.className = `status-block premium-glass ${block.type === "ui" ? "sb-ui-mode" : "sb-field-mode"}`;
  
  // 位置とサイズの取得
  let { x, y, w, h } = block;
  if (!isShared) {
    const local = getLocalPresentation(block.id);
    if (local) {
      x = local.x ?? x; y = local.y ?? y;
      w = local.w ?? w; h = local.h ?? h;
    }
  }
  // デフォルトサイズ
  if (!w) w = block.type === "ui" ? 560 : 140;
  if (!h) h = block.type === "ui" ? 52 : 140;

  if (block.type === "field" && isShared && !isMine) {
    // フィールドの座標反転 (サイズも考慮)
    x = SB_FIELD_W - x - w;
    y = SB_FIELD_H - y - h;
  }

  el.style.width = w + "px";
  el.style.height = h + "px";

  if (block.type === "field") {
    el.style.position = "absolute";
    el.style.left = (x || 0) + "px";
    el.style.top = (y || 0) + "px";
    el.style.pointerEvents = "auto";
  } else {
    el.style.position = "relative";
    el.style.left = "";
    el.style.top = "";
    el.style.order = index;
    el.style.pointerEvents = "auto";
  }

  const readonly = canEditContent ? "" : "readonly disabled";
  const iconHtml = block.icon ? `<img src="${block.icon}" class="sb-icon-main">` : `<div class="sb-icon-placeholder"></div>`;
  
  // プレイヤー名のピルタグ
  const ownerAccountName = state[block.owner]?.username || state[block.owner]?.name || (block.owner === 'player1' ? 'Player1' : 'Player2');
  const playerPill = `<span class="sb-player-pill">${ownerAccountName}</span>`;

  let numScale = 1;
  if (block.type === "field") {
    numScale = Math.min(w / 140, h / 140);
  }
  const numSize = Math.max(10, 13 * numScale);
  const maxSize = Math.max(9, 11 * numScale);
  const btnSize = Math.max(12, 16 * numScale);
  const sepSize = Math.max(8, 10 * numScale);

  const numStyle = `font-size: ${numSize}px;`;
  const maxStyle = `font-size: ${maxSize}px;`;
  const btnStyle = `font-size: ${btnSize}px; width: ${Math.max(16, 22*numScale)}px; height: ${Math.max(16, 22*numScale)}px;`;
  const sepStyle = `font-size: ${sepSize}px;`;

  const valHtml = `
    <div class="sb-val-controls">
      <button onclick="adjustCurrent('${block.id}', -1)" class="sb-adjust-btn" style="${btnStyle}">−</button>
      <div class="sb-val-display">
        <input type="number" value="${block.current || 0}" class="sb-val-input" style="${numStyle}" onchange="updateBlockData('${block.id}', 'current', this.value)">
        <span class="sb-sep" style="${sepStyle}">/</span>
        <input type="number" value="${block.max || 10}" class="sb-max-input" style="${maxStyle}" onchange="updateBlockData('${block.id}', 'max', this.value)">
      </div>
      <button onclick="adjustCurrent('${block.id}', 1)" class="sb-adjust-btn" style="${btnStyle}">＋</button>
    </div>
  `;

  let html = "";
  if (block.type === "ui") {
    html = `
      <div class="sb-ui-inner">
        <div class="sb-icon-wrapper">
          ${iconHtml}
          ${isMine ? `
            <div class="sb-reorder-btns-overlay sb-hover-only">
              <button onclick="reorderBlock('${block.id}', -1)" class="sb-mini-btn">▲</button>
              <button onclick="reorderBlock('${block.id}', 1)" class="sb-mini-btn">▼</button>
            </div>
          ` : ''}
        </div>
        <div class="sb-ui-main">
          <div class="sb-ui-top-row">
            ${playerPill}
            <input type="text" value="${block.name || ''}" class="sb-name-input" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
            ${valHtml}
          </div>
          <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        </div>
        <div class="sb-ui-memo-wrapper">
          <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ..." title="${block.memo || ''}">${block.memo || ''}</textarea>
        </div>
      </div>
    `;
  } else {
    html = `
      <div class="sb-field-inner">
        <div class="sb-icon-bg">${iconHtml}</div>
        <div class="sb-field-val-overlay">
          ${valHtml}
        </div>
        <div class="sb-field-hover-stack sb-hover-only" style="top: ${Math.max(18, 22 * numScale + 4)}px;">
          <div class="sb-header">
            ${playerPill}
            <input type="text" value="${block.name || ''}" class="sb-name-input sb-field-name-small" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
          </div>
          <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ..." title="${block.memo || ''}">${block.memo || ''}</textarea>
        </div>
        <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        <div class="sb-resize-handle sb-hover-only" onpointerdown="startResizing(event, '${block.id}')"></div>
      </div>
    `;
  }

  if (el.innerHTML !== html) {
    el.innerHTML = html;
    if (block.type === "field") {
      el.onpointerdown = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.classList.contains("sb-resize-handle") || e.target.classList.contains("sb-adjust-btn")) return;
        e.stopPropagation();
        startDragging(e, block.id);
      };
    }
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showStatusBlockMenu(e, block.id);
    };
  }
}

function showStatusBlockMenu(e, id) {
  const existing = document.getElementById("sb-context-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "sb-context-menu";
  menu.className = "sb-context-menu premium-glass";
  menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:30000;`;
  
  const block = findBlockById(id);
  const myRole = window.myRole || "player1";

  menu.innerHTML = `
    <div class="sb-menu-item" onclick="openStatusBlockEditor('${id}'); document.getElementById('sb-context-menu').remove();">詳細編集...</div>
    <div class="sb-menu-item" onclick="duplicateBlock('${id}', 'player1'); document.getElementById('sb-context-menu').remove();">自分用に複製</div>
    <div class="sb-menu-item" onclick="duplicateBlock('${id}', 'player2'); document.getElementById('sb-context-menu').remove();">相手用に複製</div>
    ${block.owner === myRole ? `<div class="sb-menu-item sb-menu-delete" onclick="if(confirm('削除しますか？')) removeStatusBlock('${id}'); document.getElementById('sb-context-menu').remove();">削除</div>` : ''}
  `;

  document.body.appendChild(menu);
  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("pointerdown", closeMenu); }
  };
  setTimeout(() => document.addEventListener("pointerdown", closeMenu), 10);
}

window.duplicateBlock = function(id, targetOwner) {
  const original = findBlockById(id);
  if (!original) return;
  const copy = JSON.parse(JSON.stringify(original));
  copy.id = "sb_" + Date.now();
  copy.owner = targetOwner;
  
  // 個人の場合の名前自動追記は、ピル表示になるため不要かもしれないが、一応残す
  if (copy.ownerType === "self") {
    const ownerName = state[targetOwner]?.name || (targetOwner === 'player1' ? 'Player1' : 'Player2');
    const prefix = `${ownerName}の `;
    if (!copy.name.startsWith(prefix)) copy.name = prefix + copy.name;
  }

  if (!state[targetOwner].statusBlocks) state[targetOwner].statusBlocks = [];
  state[targetOwner].statusBlocks.push(copy);
  updateAndSync();
};

window.addStatusBlockData = function(blockData) {
  const targetOwner = blockData.owner || window.myRole || "player1";
  if (!state[targetOwner].statusBlocks) state[targetOwner].statusBlocks = [];
  
  // 重複チェック (同名・同所有者)
  const isDuplicate = state[targetOwner].statusBlocks.some(b => b.name === blockData.name);
  if (isDuplicate) return false;
  
  const newBlock = { ...blockData };
  if (!newBlock.id) newBlock.id = "sb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  
  state[targetOwner].statusBlocks.push(newBlock);
  updateAndSyncBlockOwner(targetOwner);
  return true;
};

window.openStatusBlockEditor = function(id, isNew = false, x = 100, y = 100) {
  let block = isNew ? {
    id: "sb_" + Date.now(),
    name: "新規ステータス",
    type: "field",
    ownerType: "self",
    current: 0,
    max: 10,
    memo: "",
    icon: "",
    w: 0, h: 0,
    x, y,
    owner: window.myRole || "player1"
  } : findBlockById(id);

  if (!block) return;

  const overlay = document.createElement("div");
  overlay.className = "sb-editor-overlay";
  overlay.innerHTML = `
    <div class="sb-editor-modal premium-glass">
      <h3 style="color: white; margin: 0 0 10px 0;">ステータスブロック編集</h3>
      <div class="sb-editor-grid">
        <label>名称</label>
        <input type="text" id="ed_name" value="${block.name}">
        
        <label>所属層</label>
        <select id="ed_type">
          <option value="field" ${block.type==='field'?'selected':''}>盤面 (Field)</option>
          <option value="ui" ${block.type==='ui'?'selected':''}>UI層 (Screen)</option>
        </select>

        <label>所有者タイプ</label>
        <select id="ed_ownerType">
          <option value="self" ${block.ownerType==='self'?'selected':''}>個人 (Personal)</option>
          <option value="shared" ${block.ownerType==='shared'?'selected':''}>共有 (Shared)</option>
        </select>

        <label>現在値</label>
        <input type="number" id="ed_current" value="${block.current}">

        <label>最大値</label>
        <input type="number" id="ed_max" value="${block.max}">

        <label>アイコン画像</label>
        <div class="sb-editor-upload">
          <button type="button" class="sb-mini-btn" style="height: 32px; flex: 1;" onclick="document.getElementById('ed_icon_file').click()">画像をアップロード</button>
          <input type="file" id="ed_icon_file" style="display:none" accept="image/*">
          <input type="text" id="ed_icon_url" value="${(block.icon && !block.icon.startsWith('data:')) ? block.icon : ''}" placeholder="URL..." style="flex: 1;">
          <img id="ed_icon_preview" src="${block.icon || ''}" style="width:32px; height:32px; object-fit:contain; background:#000; border-radius:4px; ${block.icon?'':'display:none'}">
        </div>

        <label>メモ</label>
        <textarea id="ed_memo">${block.memo || ''}</textarea>
      </div>
      <div class="sb-editor-footer">
        <button class="sb-btn-cancel" onclick="this.closest('.sb-editor-overlay').remove()">キャンセル</button>
        <button class="sb-btn-save">保存</button>
      </div>
    </div>
  `;

  const fileInput = overlay.querySelector("#ed_icon_file");
  const preview = overlay.querySelector("#ed_icon_preview");
  const urlInput = overlay.querySelector("#ed_icon_url");
  let currentIconData = block.icon || "";

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1024) { alert("上限200KB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      currentIconData = ev.target.result;
      preview.src = currentIconData; preview.style.display = "block";
      urlInput.value = "";
    };
    reader.readAsDataURL(file);
  };

  overlay.querySelector(".sb-btn-save").onclick = () => {
    const oldType = block.type;
    block.name = document.getElementById("ed_name").value;
    block.type = document.getElementById("ed_type").value;
    block.ownerType = document.getElementById("ed_ownerType").value;
    block.current = parseInt(document.getElementById("ed_current").value) || 0;
    block.max = parseInt(document.getElementById("ed_max").value) || 10;
    block.memo = document.getElementById("ed_memo").value;
    block.icon = urlInput.value || currentIconData;

    if (oldType !== block.type) {
      if (block.type === 'field') {
        // UIから盤面へ変換: 画面中央左寄りに配置
        const { zoom, panX, panY } = getFieldTransform();
        const field = document.getElementById("field");
        if (field) {
          const rect = field.getBoundingClientRect();
          // 中央左寄り (幅の25%位置)
          const screenLeftCenterX = rect.left + (rect.width * 0.25);
          const screenCenterY = rect.top + (rect.height / 2);
          block.x = (screenLeftCenterX - rect.left - panX) / zoom - 70;
          block.y = (screenCenterY - rect.top - panY) / zoom - 70;
        } else {
          block.x = SB_FIELD_W / 2 - 500;
          block.y = SB_FIELD_H / 2 - 70;
        }
        block.w = 140;
        block.h = 140;
      } else if (block.type === 'ui') {
        // 盤面からUIへ変換: デフォルトサイズにリセット
        block.w = 560;
        block.h = 52;
      }
      
      // ローカルの見た目設定(presentation)もリセットする
      try {
        const saved = JSON.parse(localStorage.getItem("sb_presentation") || "{}");
        if (saved[block.id]) {
          delete saved[block.id];
          localStorage.setItem("sb_presentation", JSON.stringify(saved));
        }
      } catch (e) {}
    }

    if (isNew) {
      window.addStatusBlockData(block);
    } else {
      updateAndSyncBlockOwner(block.owner);
    }
    overlay.remove();
  };
  document.body.appendChild(overlay);
};

// --- ドラッグ & 自由リサイズ ---

let draggingBlockId = null;
let dragOffset = { x: 0, y: 0 };
let resizingBlockId = null;
let resizeStartSize = { w: 0, h: 0 };
let resizeStartPos = { x: 0, y: 0 };

function startDragging(e, id) {
  const block = findBlockById(id);
  if (!block) return;
  draggingBlockId = id;
  const { zoom, panX, panY } = getFieldTransform();
  const field = document.getElementById("field");
  const fieldRect = field.getBoundingClientRect();
  const cursorFieldX = (e.clientX - fieldRect.left - panX) / zoom;
  const cursorFieldY = (e.clientY - fieldRect.top - panY) / zoom;
  
  let bx = block.x || 0, by = block.y || 0, bw = block.w || 140, bh = block.h || 140;
  if (!isSharedBlock(block)) {
    const local = getLocalPresentation(id);
    if (local) { bx = local.x ?? bx; by = local.y ?? by; bw = local.w ?? bw; bh = local.h ?? bh; }
  }
  const myRole = window.myRole || "player1";
  if (isSharedBlock(block) && block.owner !== myRole) {
    // 相手オーナーの共有ブロックは座標が反転して表示されている
    const invX = SB_FIELD_W - bx - bw;
    const invY = SB_FIELD_H - by - bh;
    dragOffset.x = cursorFieldX - invX; dragOffset.y = cursorFieldY - invY;
  } else {
    dragOffset.x = cursorFieldX - bx; dragOffset.y = cursorFieldY - by;
  }
  document.addEventListener("pointermove", onPointerMove);
  window.DragManager.register(onPointerUp);
  const el = document.getElementById(id);
  el.setPointerCapture(e.pointerId);
}

function startResizing(e, id) {
  e.stopPropagation();
  const block = findBlockById(id);
  if (!block) return;
  resizingBlockId = id;
  const isShared = isSharedBlock(block);
  const local = !isShared ? getLocalPresentation(id) : null;
  resizeStartSize.w = local?.w ?? (block.w || (block.type === "ui" ? 560 : 140));
  resizeStartSize.h = local?.h ?? (block.h || (block.type === "ui" ? 52 : 140));
  resizeStartPos = { x: e.clientX, y: e.clientY };
  document.addEventListener("pointermove", onPointerMove);
  window.DragManager.register(onPointerUp);
  const handle = e.target;
  handle.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (draggingBlockId) {
    const block = findBlockById(draggingBlockId);
    if (!block) return;
    const { zoom, panX, panY } = getFieldTransform();
    const fieldRect = document.getElementById("field").getBoundingClientRect();
    const cursorFieldX = (e.clientX - fieldRect.left - panX) / zoom;
    const cursorFieldY = (e.clientY - fieldRect.top - panY) / zoom;
    let nx = cursorFieldX - dragOffset.x;
    let ny = cursorFieldY - dragOffset.y;
    const myRole = window.myRole || "player1";
    if (isSharedBlock(block)) {
      if (block.owner === myRole) { block.x = nx; block.y = ny; }
      else { 
        // 相手オーナーの共有ブロックを動かす場合、反転させてから保存
        let bw = block.w || 140, bh = block.h || 140;
        block.x = SB_FIELD_W - nx - bw;
        block.y = SB_FIELD_H - ny - bh;
      }
    } else { setLocalPresentation(draggingBlockId, { x: nx, y: ny }); }
    const el = document.getElementById(draggingBlockId);
    if (el) { el.style.left = nx + "px"; el.style.top = ny + "px"; }
  }
  if (resizingBlockId) {
    const block = findBlockById(resizingBlockId);
    if (!block) return;
    const { zoom } = getFieldTransform();
    const dx = (e.clientX - resizeStartPos.x) / zoom;
    const dy = (e.clientY - resizeStartPos.y) / zoom;
    let nw = Math.max(50, resizeStartSize.w + dx);
    let nh = Math.max(30, resizeStartSize.h + dy);
    
    if (e.shiftKey) {
      let ratio = 1;
      const img = document.querySelector(`#${resizingBlockId} .sb-icon-main`);
      if (img && img.naturalHeight) {
        ratio = img.naturalWidth / img.naturalHeight;
      }
      nh = nw / ratio;
    }
    
    if (isSharedBlock(block)) { block.w = nw; block.h = nh; }
    else { setLocalPresentation(resizingBlockId, { w: nw, h: nh }); }
    
    const el = document.getElementById(resizingBlockId);
    if (el) { el.style.width = nw + "px"; el.style.height = nh + "px"; }
  }
}

function onPointerUp(e) {
  if (draggingBlockId || resizingBlockId) {
    const block = findBlockById(draggingBlockId || resizingBlockId);
    if (block && isSharedBlock(block)) if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
    renderStatusBlocks(); 
  }
  draggingBlockId = null; resizingBlockId = null;
  document.removeEventListener("pointermove", onPointerMove);
  window.DragManager.unregister(onPointerUp);
}

function findBlockById(id) {
  const p1 = state.player1?.statusBlocks || [];
  const p2 = state.player2?.statusBlocks || [];
  return p1.find(b => b.id === id) || p2.find(b => b.id === id);
}

function isSharedBlock(block) { return block.ownerType === "shared"; }

function getLocalPresentation(id) {
  try { const saved = JSON.parse(localStorage.getItem("sb_presentation") || "{}"); return saved[id] || null; } catch { return null; }
}

function setLocalPresentation(id, data) {
  try {
    const saved = JSON.parse(localStorage.getItem("sb_presentation") || "{}");
    saved[id] = { ...(saved[id] || {}), ...data };
    localStorage.setItem("sb_presentation", JSON.stringify(saved));
  } catch {}
}

window.adjustCurrent = function(id, delta) {
  const block = findBlockById(id);
  if (block) { block.current = (block.current || 0) + delta; updateAndSyncBlockOwner(block.owner); }
};

window.reorderBlock = function(id, direction) {
  const myRole = window.myRole || "player1";
  const list = state[myRole].statusBlocks || [];
  const uiBlocks = list.filter(b => b.type === "ui");
  const subIdx = uiBlocks.findIndex(b => b.id === id);
  if (subIdx === -1) return;
  const targetSubIdx = subIdx + direction;
  if (targetSubIdx < 0 || targetSubIdx >= uiBlocks.length) return;
  const blockA = uiBlocks[subIdx]; const blockB = uiBlocks[targetSubIdx];
  const realIdxA = list.indexOf(blockA); const realIdxB = list.indexOf(blockB);
  [list[realIdxA], list[realIdxB]] = [list[realIdxB], list[realIdxA]];
  updateAndSyncBlockOwner(myRole);
};

window.updateBlockData = function(id, key, value) {
  const block = findBlockById(id);
  if (block) {
    if (key === 'current' || key === 'max') block[key] = Number(value);
    else block[key] = value;
    updateAndSyncBlockOwner(block.owner);
  }
};

function removeStatusBlock(id) {
  const block = findBlockById(id);
  if (!block) return;
  const owner = block.owner;
  state[owner].statusBlocks = state[owner].statusBlocks.filter(b => b.id !== id);
  updateAndSyncBlockOwner(owner);
}

function updateAndSync() {
  if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  renderStatusBlocks();
}

function updateAndSyncBlockOwner(owner) {
  const myRole = window.myRole || "player1";
  if (owner === myRole) {
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  } else {
    // 双方向編集のため相手のstateを直接Push
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && typeof firebaseClient !== "undefined" && firebaseClient.db) {
      firebaseClient.writeMyState(gameRoom, owner, state[owner]).catch(e => console.error(e));
    }
  }
  renderStatusBlocks();
}

const style = document.createElement("style");
style.textContent = `
  .status-block {
    background: rgba(15, 12, 25, 0.9);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(199, 179, 119, 0.4);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    user-select: none;
    box-sizing: border-box;
    overflow: visible;
  }
  .sb-ui-mode { min-width: 300px; padding: 6px; }
  .sb-field-mode { padding: 0; }
  
  .sb-ui-inner { display: flex; align-items: center; gap: 8px; position: relative; width: 100%; height: 100%; }
  .sb-icon-wrapper { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
  .sb-icon-main { width: 100%; height: 100%; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3); }
  .sb-icon-placeholder { width: 100%; height: 100%; }
  
  .sb-ui-main { flex: 0 1 auto; display: flex; flex-direction: column; gap: 4px; }
  .sb-ui-top-row { display: flex; align-items: center; gap: 6px; }
  
  .sb-player-pill {
    background: #f0d080; color: #000; font-size: 10px; font-weight: bold;
    padding: 2px 8px; border-radius: 10px; white-space: nowrap; flex-shrink: 0;
  }

  input[type="text"].sb-name-input { 
    background-color: #111 !important; 
    border: 1px solid #666 !important; 
    border-radius: 4px; 
    color: white !important; 
    font-weight: bold; font-size: 13px; outline: none; padding: 2px 6px; box-sizing: border-box;
    -webkit-box-shadow: 0 0 0 1000px #111 inset !important;
    -webkit-text-fill-color: white !important;
  }
  .sb-ui-mode input[type="text"].sb-name-input { width: 110px; }
  .sb-field-mode input[type="text"].sb-field-name-small { font-size: 10px !important; width: 80px !important; }
  
  .sb-val-controls { display: flex; align-items: center; background: rgba(0,0,0,0.6); border-radius: 4px; border: 1px solid rgba(255,255,255,0.25); overflow: hidden; }
  .sb-adjust-btn { 
    background: rgba(255,255,255,0.05); border: none; border-right: 1px solid rgba(255,255,255,0.1);
    color: #f0d080; cursor: pointer; display: flex; align-items: center; justify-content: center; 
  }
  .sb-adjust-btn:last-child { border-right: none; border-left: 1px solid rgba(255,255,255,0.1); }
  .sb-adjust-btn:hover { background: rgba(255,255,255,0.15); }
  
  .sb-val-display { display: flex; align-items: center; gap: 1px; padding: 0 4px; }
  .sb-val-input { background: transparent; border: none; color: #fff; text-align: center; font-weight: bold; outline: none; width: auto; max-width: 40px; }
  .sb-sep { color: #666; }
  .sb-max-input { background: transparent; border: none; color: #aaa; text-align: center; outline: none; width: auto; max-width: 34px; }
  
  .sb-bar-bg { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; border: 1px solid rgba(0,0,0,0.3); }
  .sb-bar-fill { height: 100%; background: linear-gradient(90deg, #c89b3c, #f0d080); transition: width 0.3s; }
  
  .sb-ui-memo-wrapper { position: relative; flex: 1; height: 36px; min-width: 50px; }
  .sb-ui-mode .sb-memo { 
    position: absolute; top: 0; left: 0; width: 100%; height: 36px;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #ccc; font-size: 10px; border-radius: 4px; padding: 4px; resize: none; outline: none; box-sizing: border-box; font-family: inherit;
    transition: all 0.2s; z-index: 10;
  }
  .sb-ui-mode .sb-memo:hover { height: 100px; z-index: 100; min-width: 150px; }
  .sb-field-mode .sb-memo { 
    width: 100%; height: 40px; margin-top: 4px;
    background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #ccc; font-size: 10px; border-radius: 4px; padding: 4px; resize: none; outline: none; box-sizing: border-box; font-family: inherit;
  }
  .sb-field-mode .sb-memo:hover { height: auto; min-height: 80px; z-index: 100; }

  .sb-field-inner { position: relative; width: 100%; height: 100%; overflow: visible; border-radius: 7px; display: flex; flex-direction: column; }
  .sb-icon-bg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; }
  .sb-icon-bg .sb-icon-main { width: 100%; height: 100%; }
  
  .sb-field-val-overlay { position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 5; }
  .sb-field-hover-stack { 
    position: absolute; top: 26px; left: 4px; right: 4px; 
    display: flex; flex-direction: column; gap: 4px; padding: 4px;
    background: rgba(0,0,0,0.8); border-radius: 4px; pointer-events: none;
    z-index: 10;
  }
  .status-block:hover .sb-field-hover-stack { pointer-events: auto; }

  .sb-field-mode .sb-bar-bg { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 0; z-index: 5; }
  .sb-resize-handle { position: absolute; bottom: -2px; right: -2px; width: 20px; height: 20px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 60%, rgba(199, 179, 119, 0.6) 60%); z-index: 10; }

  .sb-hover-only { visibility: hidden; opacity: 0; transition: opacity 0.2s; }
  .status-block:hover .sb-hover-only { visibility: visible; opacity: 1; }

  .sb-reorder-btns-overlay {
    position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px;
    background: rgba(0,0,0,0.5); border-radius: 4px; z-index: 100;
  }

  .sb-context-menu { background: rgba(20, 18, 30, 0.98); border: 1px solid #f0d080; border-radius: 8px; min-width: 140px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
  .sb-menu-item { padding: 10px 15px; color: #eee; cursor: pointer; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .sb-menu-item:hover { background: rgba(240, 208, 128, 0.2); color: #f0d080; }

  .sb-editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; align-items: center; justify-content: center; pointer-events: all; }
  .sb-editor-modal { width: 440px; padding: 20px; border: 1px solid #f0d080; border-radius: 12px; display: flex; flex-direction: column; gap: 14px; }
  .sb-editor-grid { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; }
  .sb-editor-grid label { font-size: 13px; color: #f0d080; font-weight: bold; }
  .sb-editor-grid input, .sb-editor-grid select, .sb-editor-grid textarea { 
    background-color: #000 !important; 
    border: 1px solid #444 !important; 
    color: #fff !important; 
    padding: 8px; border-radius: 4px; outline: none; font-family: inherit; 
    -webkit-box-shadow: 0 0 0 1000px #000 inset !important;
    -webkit-text-fill-color: #fff !important;
  }
`;
document.head.appendChild(style);
