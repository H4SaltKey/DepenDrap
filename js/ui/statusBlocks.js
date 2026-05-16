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
  if (block.icon && block.type === "field") el.classList.add("sb-has-bg");

  let { x, y, scale } = block;
  if (!isShared) {
    const local = getLocalPresentation(block.id);
    if (local) { x = local.x ?? x; y = local.y ?? y; scale = local.scale ?? scale; }
  }

  if (block.type === "field" && isShared && !isMine) {
    const inv = getInvertedCoords(x, y, scale || 1);
    x = inv.x; y = inv.y;
  }

  if (block.type === "field") {
    el.style.position = "absolute";
    el.style.left = (x || 0) + "px";
    el.style.top = (y || 0) + "px";
    el.style.pointerEvents = "auto";
  } else {
    el.style.position = "relative";
    el.style.order = index;
    el.style.pointerEvents = "auto";
  }

  const s = scale || 1.0;
  el.style.transform = `scale(${s})`;
  el.style.transformOrigin = "top left";
  
  if (block.type === "ui") {
    el.style.marginBottom = (40 * (s - 1)) + "px"; 
    el.style.marginRight = (400 * (s - 1)) + "px"; // UIは常時表示に戻るため広げ直す
  } else if (block.icon) {
    el.style.backgroundImage = `url("${block.icon}")`;
  }

  const deleteBtn = isMine ? `
    <button class="sb-delete-btn-corner sb-hover-only" title="長押しで削除" onpointerdown="handleDeleteDown(event, '${block.id}')" onpointerup="handleDeleteUp(event)" onpointerleave="handleDeleteUp(event)">✕</button>
  ` : `<span class="sb-owner-tag-corner sb-hover-only">${(state[block.owner]?.name || (block.owner === 'player1' ? 'P1' : 'P2')).slice(0,2)}</span>`;

  const readonly = canEditContent ? "" : "readonly disabled";
  const valReadonly = ""; 

  const iconHtml = block.icon ? `<img src="${block.icon}" class="sb-icon-small">` : `<div class="sb-icon-placeholder"></div>`;

  const valHtml = `
    <div class="sb-val-controls">
      <button onclick="adjustCurrent('${block.id}', -1)" class="sb-adjust-btn" ${valReadonly}>−</button>
      <div class="sb-val-display">
        <input type="number" value="${block.current || 0}" class="sb-val-input" ${valReadonly} onchange="updateBlockData('${block.id}', 'current', this.value)">
        <span class="sb-sep">/</span>
        <input type="number" value="${block.max || 10}" class="sb-max-input" ${valReadonly} onchange="updateBlockData('${block.id}', 'max', this.value)">
      </div>
      <button onclick="adjustCurrent('${block.id}', 1)" class="sb-adjust-btn" ${valReadonly}>＋</button>
    </div>
  `;

  let html = "";
  if (block.type === "ui") {
    // UI: 上下移動ボタンのみホバー表示（アイコンに重ねる）。他は常時表示。
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
            <input type="text" value="${block.name || ''}" class="sb-name-input" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
            ${valHtml}
          </div>
          <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        </div>
        <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ..." title="${block.memo || ''}">${block.memo || ''}</textarea>
        ${deleteBtn}
        <div class="sb-resize-handle sb-hover-only" onpointerdown="startResizing(event, '${block.id}')"></div>
      </div>
    `;
  } else {
    // 盤面: ホバー時に 数値 / 名称 / メモ の順で表示
    html = `
      <div class="sb-field-inner">
        <div class="sb-field-val-overlay">
          ${valHtml}
        </div>
        <div class="sb-field-hover-stack sb-hover-only">
          <div class="sb-header">
            <input type="text" value="${block.name || ''}" class="sb-name-input" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
          </div>
          <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ..." title="${block.memo || ''}">${block.memo || ''}</textarea>
        </div>
        <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        ${deleteBtn}
        <div class="sb-resize-handle sb-hover-only" onpointerdown="startResizing(event, '${block.id}')"></div>
      </div>
    `;
  }

  if (el.innerHTML !== html) {
    el.innerHTML = html;
    if (block.type === "field") {
      el.onpointerdown = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.classList.contains("sb-delete-btn-corner") || e.target.classList.contains("sb-resize-handle") || e.target.classList.contains("sb-adjust-btn")) return;
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
  
  if (copy.ownerType === "self") {
    const ownerName = state[targetOwner]?.name || (targetOwner === 'player1' ? 'Player1' : 'Player2');
    const prefix = `${ownerName}の `;
    if (!copy.name.startsWith(prefix)) copy.name = prefix + copy.name;
  }

  if (!state[targetOwner].statusBlocks) state[targetOwner].statusBlocks = [];
  state[targetOwner].statusBlocks.push(copy);
  updateAndSync();
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
    scale: 1.0,
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

        <label>大きさ倍率 (%)</label>
        <input type="number" id="ed_scale" step="5" value="${Math.floor((block.scale || 1.0) * 100)}">

        <label>現在値</label>
        <input type="number" id="ed_current" value="${block.current}">

        <label>最大値</label>
        <input type="number" id="ed_max" value="${block.max}">

        <label>アイコン画像</label>
        <div class="sb-editor-upload">
          <button type="button" class="sb-mini-btn" style="height: 32px; flex: 1;" onclick="document.getElementById('ed_icon_file').click()">画像をアップロード</button>
          <input type="file" id="ed_icon_file" style="display:none" accept="image/*">
          <input type="text" id="ed_icon_url" value="${(block.icon && !block.icon.startsWith('data:')) ? block.icon : ''}" placeholder="またはURLを入力..." style="flex: 1;">
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
    if (file.size > 200 * 1024) { alert("画像サイズが大きすぎます(上限200KB)。"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      currentIconData = ev.target.result;
      preview.src = currentIconData; preview.style.display = "block";
      urlInput.value = "";
    };
    reader.readAsDataURL(file);
  };

  overlay.querySelector(".sb-btn-save").onclick = () => {
    block.name = document.getElementById("ed_name").value;
    block.type = document.getElementById("ed_type").value;
    block.ownerType = document.getElementById("ed_ownerType").value;
    const sInput = parseInt(document.getElementById("ed_scale").value) || 100;
    block.scale = sInput / 100;
    block.current = parseInt(document.getElementById("ed_current").value) || 0;
    block.max = parseInt(document.getElementById("ed_max").value) || 10;
    block.memo = document.getElementById("ed_memo").value;

    if (urlInput.value) block.icon = urlInput.value;
    else block.icon = currentIconData;

    if (block.ownerType === "self") {
      const ownerName = state[block.owner]?.name || (block.owner === 'player1' ? 'Player1' : 'Player2');
      const prefix = `${ownerName}の `;
      if (!block.name.startsWith(prefix)) block.name = prefix + block.name;
    }

    if (isNew) {
      const me = window.myRole || "player1";
      if (!state[me].statusBlocks) state[me].statusBlocks = [];
      state[me].statusBlocks.push(block);
    }
    updateAndSync();
    overlay.remove();
  };
  document.body.appendChild(overlay);
};

let draggingBlockId = null;
let dragOffset = { x: 0, y: 0 };
let resizingBlockId = null;
let resizeStartScale = 1;
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
  let bx = block.x || 0; let by = block.y || 0; let bs = block.scale || 1.0;
  if (!isSharedBlock(block)) {
    const local = getLocalPresentation(id);
    if (local) { bx = local.x ?? bx; by = local.y ?? by; bs = local.scale ?? bs; }
  }
  const myRole = window.myRole || "player1";
  if (isSharedBlock(block) && block.owner !== myRole) {
    const inv = getInvertedCoords(bx, by, bs);
    dragOffset.x = cursorFieldX - inv.x; dragOffset.y = cursorFieldY - inv.y;
  } else {
    dragOffset.x = cursorFieldX - bx; dragOffset.y = cursorFieldY - by;
  }
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
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
  resizeStartScale = local?.scale ?? (block.scale || 1.0);
  resizeStartPos = { x: e.clientX, y: e.clientY };
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  const handle = e.target;
  handle.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (draggingBlockId) {
    const block = findBlockById(draggingBlockId);
    if (!block) return;
    const { zoom, panX, panY } = getFieldTransform();
    const field = document.getElementById("field");
    const fieldRect = field.getBoundingClientRect();
    const cursorFieldX = (e.clientX - fieldRect.left - panX) / zoom;
    const cursorFieldY = (e.clientY - fieldRect.top - panY) / zoom;
    let nx = cursorFieldX - dragOffset.x;
    let ny = cursorFieldY - dragOffset.y;
    const myRole = window.myRole || "player1";
    if (isSharedBlock(block)) {
      if (block.owner === myRole) { block.x = nx; block.y = ny; }
      else { let bs = block.scale || 1.0; const rev = getInvertedCoords(nx, ny, bs); block.x = rev.x; block.y = rev.y; }
    } else { setLocalPresentation(draggingBlockId, { x: nx, y: ny }); }
    const el = document.getElementById(draggingBlockId);
    if (el) { el.style.left = nx + "px"; el.style.top = ny + "px"; }
  }
  if (resizingBlockId) {
    const block = findBlockById(resizingBlockId);
    if (!block) return;
    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;
    const { zoom } = getFieldTransform();
    const delta = (dx + dy) / (300 * zoom);
    const newScale = Math.max(0.2, Math.min(6.0, resizeStartScale + delta));
    if (isSharedBlock(block)) block.scale = newScale;
    else setLocalPresentation(resizingBlockId, { scale: newScale });
    const el = document.getElementById(resizingBlockId);
    if (el) {
      el.style.transform = `scale(${newScale})`;
      if (block.type === "ui") { el.style.marginBottom = (40 * (newScale - 1)) + "px"; el.style.marginRight = (400 * (newScale - 1)) + "px"; }
    }
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
  document.removeEventListener("pointerup", onPointerUp);
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

function getInvertedCoords(x, y, scale) {
  const BLOCK_W = 200 * scale; const BLOCK_H = 120 * scale;
  return { x: SB_FIELD_W - x - BLOCK_W, y: SB_FIELD_H - y - BLOCK_H };
}

window.adjustCurrent = function(id, delta) {
  const block = findBlockById(id);
  if (block) { block.current = (block.current || 0) + delta; updateAndSync(); }
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
  updateAndSync();
};

window.updateBlockData = function(id, key, value) {
  const block = findBlockById(id);
  if (block) {
    if (key === 'current' || key === 'max') block[key] = Number(value);
    else block[key] = value;
    updateAndSync();
  }
};

let deleteTimer = null;
window.handleDeleteDown = function(e, id) {
  e.stopPropagation(); const btn = e.target; btn.classList.add("deleting");
  deleteTimer = setTimeout(() => {
    btn.classList.remove("deleting"); if (confirm("このステータスブロックを削除しますか？")) removeStatusBlock(id);
  }, 800); 
};

window.handleDeleteUp = function(e) {
  if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
  if (e.target && e.target.classList) e.target.classList.remove("deleting");
};

function removeStatusBlock(id) {
  const block = findBlockById(id);
  if (!block) return;
  const owner = block.owner;
  state[owner].statusBlocks = state[owner].statusBlocks.filter(b => b.id !== id);
  updateAndSync();
}

function updateAndSync() {
  if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
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
  .sb-ui-mode { width: 560px; padding: 6px; }
  .sb-field-mode { width: 140px; height: 140px; padding: 0; }
  .sb-has-bg { background-size: cover; background-position: center; border-color: rgba(255,255,255,0.2); }
  
  .sb-ui-inner { display: flex; align-items: center; gap: 8px; position: relative; width: 100%; }
  .sb-icon-wrapper { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
  .sb-icon-small { width: 100%; height: 100%; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3); }
  .sb-icon-placeholder { width: 100%; height: 100%; }
  
  .sb-ui-main { flex: 0 1 280px; display: flex; flex-direction: column; gap: 4px; }
  .sb-ui-top-row { display: flex; align-items: center; gap: 6px; }
  
  .sb-name-input { 
    background: rgba(0,0,0,0.6) !important; 
    border: 1px solid rgba(255,255,255,0.2) !important; 
    border-radius: 4px; 
    color: #f0d080 !important; 
    font-weight: bold; font-size: 13px; outline: none; padding: 2px 6px; box-sizing: border-box;
  }
  .sb-ui-mode .sb-name-input { width: 110px; }
  .sb-field-mode .sb-name-input { width: 100%; }
  
  .sb-val-controls { display: flex; align-items: center; background: rgba(0,0,0,0.6); border-radius: 4px; border: 1px solid rgba(255,255,255,0.25); overflow: hidden; }
  .sb-adjust-btn { 
    background: rgba(255,255,255,0.05); border: none; border-right: 1px solid rgba(255,255,255,0.1);
    color: #f0d080; width: 22px; height: 22px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; 
  }
  .sb-adjust-btn:last-child { border-right: none; border-left: 1px solid rgba(255,255,255,0.1); }
  .sb-adjust-btn:hover { background: rgba(255,255,255,0.15); }
  
  .sb-val-display { display: flex; align-items: center; gap: 1px; padding: 0 4px; }
  .sb-val-input { width: 30px; background: transparent; border: none; color: #fff; text-align: center; font-size: 13px; font-weight: bold; outline: none; }
  .sb-sep { color: #666; font-size: 10px; }
  .sb-max-input { width: 30px; background: transparent; border: none; color: #999; text-align: center; font-size: 11px; outline: none; }
  
  .sb-bar-bg { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; border: 1px solid rgba(0,0,0,0.3); }
  .sb-bar-fill { height: 100%; background: linear-gradient(90deg, #c89b3c, #f0d080); transition: width 0.3s; }
  
  .sb-memo { 
    background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #ccc; font-size: 10px; border-radius: 4px; padding: 4px; resize: none; outline: none; box-sizing: border-box; font-family: inherit;
    transition: height 0.2s;
  }
  .sb-ui-mode .sb-memo { width: 120px; height: 36px; }
  .sb-ui-mode .sb-memo:hover { height: 80px; z-index: 100; position: relative; }
  .sb-field-mode .sb-memo { width: 100%; height: 40px; margin-top: 4px; }

  .sb-field-inner { position: relative; width: 100%; height: 100%; overflow: visible; border-radius: 7px; }
  .sb-field-val-overlay { position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 5; }
  .sb-field-hover-stack { 
    position: absolute; top: 26px; left: 0; right: 0; 
    display: flex; flex-direction: column; gap: 4px; padding: 4px;
    background: rgba(0,0,0,0.7); border-radius: 4px; pointer-events: none;
  }
  .status-block:hover .sb-field-hover-stack { pointer-events: auto; }

  .sb-field-mode .sb-bar-bg { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 0; }
  
  .sb-delete-btn-corner { 
    position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; border-radius: 50%;
    background: #111; border: 1px solid rgba(199, 179, 119, 0.6); color: #999; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 20;
  }
  .sb-owner-tag-corner { position: absolute; top: -8px; right: -8px; background: #000; border: 1px solid #333; color: #555; font-size: 8px; padding: 1px 3px; border-radius: 3px; z-index: 20; }
  .sb-resize-handle { position: absolute; bottom: -2px; right: -2px; width: 16px; height: 16px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 60%, rgba(199, 179, 119, 0.6) 60%); z-index: 10; }

  .sb-hover-only { visibility: hidden; opacity: 0; transition: opacity 0.2s; }
  .status-block:hover .sb-hover-only { visibility: visible; opacity: 1; }

  .sb-reorder-btns-overlay {
    position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px;
    background: rgba(0,0,0,0.5); border-radius: 4px;
  }

  .sb-context-menu { background: rgba(20, 18, 30, 0.98); border: 1px solid #f0d080; border-radius: 8px; min-width: 140px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
  .sb-menu-item { padding: 10px 15px; color: #eee; cursor: pointer; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .sb-menu-item:hover { background: rgba(240, 208, 128, 0.2); color: #f0d080; }

  .sb-editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 20000; display: flex; align-items: center; justify-content: center; pointer-events: all; }
  .sb-editor-modal { width: 440px; padding: 20px; border: 1px solid #f0d080; border-radius: 12px; display: flex; flex-direction: column; gap: 14px; }
  .sb-editor-grid { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; }
  .sb-editor-grid label { font-size: 13px; color: #f0d080; font-weight: bold; }
  .sb-editor-grid input, .sb-editor-grid select, .sb-editor-grid textarea { background: #000; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; outline: none; font-family: inherit; }
`;
document.head.appendChild(style);
