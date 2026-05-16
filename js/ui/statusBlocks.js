/**
 * statusBlocks.js
 * フィールド上およびUI上のステータスブロックをレンダリングする
 * [自分/相手/共有] の所有権、アイコン表示、反転表示、エディタ機能をサポート
 */

const SB_FIELD_W = 3000;
const SB_FIELD_H = 2000;

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

  // UIブロックの描画
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

  // フィールドブロック
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
    fieldLayer.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: ${SB_FIELD_W}px; height: ${SB_FIELD_H}px;
      pointer-events: none;
      z-index: 50;
    `;
    const content = document.getElementById("fieldContent");
    if (content) content.appendChild(fieldLayer);
  }

  let uiLayer = document.getElementById("uiStatusBlocksLayer");
  if (!uiLayer) {
    uiLayer = document.createElement("div");
    uiLayer.id = "uiStatusBlocksLayer";
    uiLayer.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      padding: 5px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      pointer-events: none;
      z-index: 10000;
      width: fit-content;
    `;
    document.body.appendChild(uiLayer);
  }
}

function renderSingleBlock(block, parent, index) {
  let el = document.getElementById(block.id);
  const myRole = window.myRole || "player1";
  const isMine = block.owner === myRole;
  const isShared = block.ownerType === "shared";
  const canEdit = isMine || isShared;

  if (!el) {
    el = document.createElement("div");
    el.id = block.id;
    parent.appendChild(el);
  } else if (el.parentElement !== parent) {
    parent.appendChild(el);
  }

  // クラスの適用
  el.className = `status-block premium-glass ${block.type === "ui" ? "sb-ui-mode" : "sb-field-mode"}`;
  if (block.icon && block.type === "field") el.classList.add("sb-has-bg");

  // 位置とスケールの取得 (自分用はローカルストレージ優先、共有用はシンク値)
  let { x, y, scale } = block;
  if (!isShared) {
    const local = getLocalPresentation(block.id);
    if (local) {
      x = local.x ?? x;
      y = local.y ?? y;
      scale = local.scale ?? scale;
    }
  }

  // フィールドの座標反転 (共有かつ相手オーナーの場合)
  if (block.type === "field" && isShared && !isMine) {
    const inv = getInvertedCoords(x, y, scale || 1);
    x = inv.x;
    y = inv.y;
  }

  // スタイルの適用
  if (block.type === "field") {
    el.style.position = "absolute";
    el.style.left = (x || 0) + "px";
    el.style.top = (y || 0) + "px";
    el.style.pointerEvents = "auto"; // 追加
  } else {
    el.style.position = "relative";
    el.style.order = index;
    el.style.pointerEvents = "auto"; // 追加
  }

  const s = scale || 1.0;
  el.style.transform = `scale(${s})`;
  el.style.transformOrigin = "top left";
  
  if (block.type === "ui") {
    // UIモードは横長。高さは固定気味
    el.style.marginBottom = (40 * (s - 1)) + "px"; 
    el.style.marginRight = (400 * (s - 1)) + "px";
  } else if (block.icon) {
    el.style.backgroundImage = `url("${block.icon}")`;
  }

  const deleteBtn = isMine ? `
    <button class="sb-delete-btn" onpointerdown="handleDeleteDown(event, '${block.id}')" onpointerup="handleDeleteUp(event)" onpointerleave="handleDeleteUp(event)">✕</button>
  ` : `<span class="sb-owner-tag">${block.owner === 'player1' ? 'P1' : 'P2'}</span>`;

  const readonly = canEdit ? "" : "readonly disabled";
  const iconHtml = block.icon ? `<img src="${block.icon}" class="sb-icon-small">` : `<div class="sb-icon-placeholder"></div>`;

  let html = "";
  if (block.type === "ui") {
    // 横長レイアウト [移動] [アイコン] [名] [数値系] [メモ] [削除]
    html = `
      <div class="sb-ui-inner">
        ${isMine ? `
          <div class="sb-reorder-btns">
            <button onclick="reorderBlock('${block.id}', -1)" class="sb-mini-btn">▲</button>
            <button onclick="reorderBlock('${block.id}', 1)" class="sb-mini-btn">▼</button>
          </div>
        ` : '<div style="width:16px;"></div>'}
        ${iconHtml}
        <div class="sb-ui-main">
          <div class="sb-ui-top-row">
            <input type="text" value="${block.name || ''}" class="sb-name-input" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
            <div class="sb-val-controls">
              <button onclick="adjustCurrent('${block.id}', -1)" class="sb-adjust-btn" ${readonly}>−</button>
              <input type="number" value="${block.current || 0}" class="sb-val-input" ${readonly} onchange="updateBlockData('${block.id}', 'current', this.value)">
              <button onclick="adjustCurrent('${block.id}', 1)" class="sb-adjust-btn" ${readonly}>＋</button>
              <span class="sb-sep">/</span>
              <input type="number" value="${block.max || 10}" class="sb-max-input" ${readonly} onchange="updateBlockData('${block.id}', 'max', this.value)">
            </div>
          </div>
          <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        </div>
        <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ...">${block.memo || ''}</textarea>
        <div class="sb-actions">
          <button class="sb-edit-trigger" onclick="openStatusBlockEditor('${block.id}')">⚙</button>
          ${deleteBtn}
        </div>
      </div>
    `;
  } else {
    // フィールドレイアウト (従来ベース or 画像上層)
    html = `
      <div class="sb-field-inner">
        <div class="sb-header">
          <input type="text" value="${block.name || ''}" class="sb-name-input" ${readonly} onchange="updateBlockData('${block.id}', 'name', this.value)">
          <div class="sb-header-btns">
            <button class="sb-edit-trigger" onclick="openStatusBlockEditor('${block.id}')">⚙</button>
            ${deleteBtn}
          </div>
        </div>
        <div class="sb-val-row">
          <div class="sb-val-controls">
            <button onclick="adjustCurrent('${block.id}', -1)" class="sb-adjust-btn" ${readonly}>−</button>
            <input type="number" value="${block.current || 0}" class="sb-val-input" ${readonly} onchange="updateBlockData('${block.id}', 'current', this.value)">
            <button onclick="adjustCurrent('${block.id}', 1)" class="sb-adjust-btn" ${readonly}>＋</button>
          </div>
          <span class="sb-sep">/</span>
          <input type="number" value="${block.max || 10}" class="sb-max-input" ${readonly} onchange="updateBlockData('${block.id}', 'max', this.value)">
        </div>
        <div class="sb-bar-bg"><div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div></div>
        <textarea class="sb-memo" ${readonly} onchange="updateBlockData('${block.id}', 'memo', this.value)" placeholder="メモ...">${block.memo || ''}</textarea>
        ${canEdit ? `<div class="sb-resize-handle" onpointerdown="startResizing(event, '${block.id}')"></div>` : ''}
      </div>
    `;
  }

  if (el.innerHTML !== html) {
    el.innerHTML = html;
    if (block.type === "field") {
      el.onpointerdown = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.closest(".sb-actions") || e.target.closest(".sb-header-btns") || e.target.classList.contains("sb-resize-handle") || e.target.classList.contains("sb-adjust-btn")) return;
        e.stopPropagation();
        startDragging(e, block.id);
      };
    }
    // 右クリックで編集画面を開く機能を追加
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openStatusBlockEditor(block.id);
    };
  }
}

// --- エディタモーダル ---

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
      <h3>ステータスブロック編集</h3>
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
          <option value="self" ${block.ownerType==='self'?'selected':''}>自分 (Personal)</option>
          <option value="shared" ${block.ownerType==='shared'?'selected':''}>共有 (Shared)</option>
        </select>

        <label>大きさ倍率</label>
        <input type="number" id="ed_scale" step="0.1" value="${block.scale || 1.0}">

        <label>現在値</label>
        <input type="number" id="ed_current" value="${block.current}">

        <label>最大値</label>
        <input type="number" id="ed_max" value="${block.max}">

        <label>アイコンURL</label>
        <input type="text" id="ed_icon" value="${block.icon || ''}" placeholder="assets/icons/xxx.png">

        <label>メモ</label>
        <textarea id="ed_memo">${block.memo || ''}</textarea>
      </div>
      <div class="sb-editor-footer">
        <button class="sb-btn-cancel" onclick="this.closest('.sb-editor-overlay').remove()">キャンセル</button>
        <button class="sb-btn-save">保存</button>
      </div>
    </div>
  `;

  overlay.querySelector(".sb-btn-save").onclick = () => {
    block.name = document.getElementById("ed_name").value;
    block.type = document.getElementById("ed_type").value;
    block.ownerType = document.getElementById("ed_ownerType").value;
    block.scale = parseFloat(document.getElementById("ed_scale").value) || 1.0;
    block.current = parseInt(document.getElementById("ed_current").value) || 0;
    block.max = parseInt(document.getElementById("ed_max").value) || 10;
    block.icon = document.getElementById("ed_icon").value;
    block.memo = document.getElementById("ed_memo").value;

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

// --- ドラッグ & リサイズ (Local Presentation対応) ---

let draggingBlockId = null;
let dragOffset = { x: 0, y: 0 };
let resizingBlockId = null;
let resizeStartScale = 1;
let resizeStartPos = { x: 0, y: 0 };

function startDragging(e, id) {
  draggingBlockId = id;
  const el = document.getElementById(id);
  const rect = el.getBoundingClientRect();
  const zoom = window.fieldZoom || 1;
  dragOffset.x = (e.clientX - rect.left) / zoom;
  dragOffset.y = (e.clientY - rect.top) / zoom;
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  el.setPointerCapture(e.pointerId);
}

function startResizing(e, id) {
  e.stopPropagation();
  const block = findBlockById(id);
  if (!block) return;
  resizingBlockId = id;
  const local = !isSharedBlock(block) ? getLocalPresentation(id) : null;
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
    const field = document.getElementById("field");
    const rect = field.getBoundingClientRect();
    const zoom = window.fieldZoom || 1;
    const panX = window.fieldPanX || 0;
    const panY = window.fieldPanY || 0;

    let nx = (e.clientX - rect.left - panX) / zoom - dragOffset.x;
    let ny = (e.clientY - rect.top - panY) / zoom - dragOffset.y;
    
    if (isSharedBlock(block)) {
      block.x = nx;
      block.y = ny;
    } else {
      setLocalPresentation(draggingBlockId, { x: nx, y: ny });
    }
    
    const el = document.getElementById(draggingBlockId);
    el.style.left = nx + "px";
    el.style.top = ny + "px";
  }
  
  if (resizingBlockId) {
    const block = findBlockById(resizingBlockId);
    if (!block) return;
    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;
    const delta = (dx + dy) / 200;
    const newScale = Math.max(0.3, Math.min(5.0, resizeStartScale + delta));
    
    if (isSharedBlock(block)) {
      block.scale = newScale;
    } else {
      setLocalPresentation(resizingBlockId, { scale: newScale });
    }
    
    const el = document.getElementById(resizingBlockId);
    el.style.transform = `scale(${newScale})`;
  }
}

function onPointerUp(e) {
  if (draggingBlockId || resizingBlockId) {
    const block = findBlockById(draggingBlockId || resizingBlockId);
    if (block && isSharedBlock(block)) {
      if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
    }
    renderStatusBlocks(); 
  }
  draggingBlockId = null;
  resizingBlockId = null;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
}

// --- ユーティリティ ---

function findBlockById(id) {
  const p1 = state.player1?.statusBlocks || [];
  const p2 = state.player2?.statusBlocks || [];
  return p1.find(b => b.id === id) || p2.find(b => b.id === id);
}

function isSharedBlock(block) {
  return block.ownerType === "shared";
}

function getLocalPresentation(id) {
  try {
    const saved = JSON.parse(localStorage.getItem("sb_presentation") || "{}");
    return saved[id] || null;
  } catch { return null; }
}

function setLocalPresentation(id, data) {
  try {
    const saved = JSON.parse(localStorage.getItem("sb_presentation") || "{}");
    saved[id] = { ...(saved[id] || {}), ...data };
    localStorage.setItem("sb_presentation", JSON.stringify(saved));
  } catch {}
}

function getInvertedCoords(x, y, scale) {
  const BLOCK_W = 200 * scale;
  const BLOCK_H = 120 * scale;
  return {
    x: SB_FIELD_W - x - BLOCK_W,
    y: SB_FIELD_H - y - BLOCK_H
  };
}

window.adjustCurrent = function(id, delta) {
  const block = findBlockById(id);
  if (block && (block.owner === window.myRole || isSharedBlock(block))) {
    block.current = (block.current || 0) + delta;
    updateAndSync();
  }
};

window.reorderBlock = function(id, direction) {
  const myRole = window.myRole || "player1";
  const list = state[myRole].statusBlocks || [];
  const uiBlocks = list.filter(b => b.type === "ui");
  const subIdx = uiBlocks.findIndex(b => b.id === id);
  if (subIdx === -1) return;
  const targetSubIdx = subIdx + direction;
  if (targetSubIdx < 0 || targetSubIdx >= uiBlocks.length) return;
  const blockA = uiBlocks[subIdx];
  const blockB = uiBlocks[targetSubIdx];
  const realIdxA = list.indexOf(blockA);
  const realIdxB = list.indexOf(blockB);
  [list[realIdxA], list[realIdxB]] = [list[realIdxB], list[realIdxA]];
  updateAndSync();
};

window.updateBlockData = function(id, key, value) {
  const block = findBlockById(id);
  if (block && (block.owner === window.myRole || isSharedBlock(block))) {
    if (key === 'current' || key === 'max') block[key] = Number(value);
    else block[key] = value;
    updateAndSync();
  }
};

let deleteTimer = null;
window.handleDeleteDown = function(e, id) {
  e.stopPropagation();
  const btn = e.target;
  btn.classList.add("deleting");
  deleteTimer = setTimeout(() => {
    btn.classList.remove("deleting");
    if (confirm("このステータスブロックを削除しますか？")) {
      removeStatusBlock(id);
    }
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

// --- スタイル定義 ---
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
    overflow: hidden;
  }
  .sb-ui-mode {
    width: 500px;
    padding: 6px 10px;
  }
  .sb-field-mode {
    width: 200px;
    padding: 10px;
  }
  .sb-has-bg {
    background-size: cover;
    background-position: center;
    border-color: rgba(255,255,255,0.2);
  }
  .sb-field-inner { position: relative; z-index: 1; }
  .sb-has-bg .sb-field-inner { background: rgba(0,0,0,0.5); padding: 5px; border-radius: 4px; }

  .sb-ui-inner {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sb-icon-small { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; background: rgba(0,0,0,0.3); }
  .sb-icon-placeholder { width: 32px; height: 32px; }
  
  .sb-ui-main { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .sb-ui-top-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  
  .sb-name-input { background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 4px; color: #f0d080; font-weight: bold; font-size: 14px; outline: none; padding: 2px 6px; }
  .sb-ui-mode .sb-name-input { width: 120px; }
  
  .sb-val-controls { display: flex; align-items: center; background: rgba(0,0,0,0.4); border-radius: 4px; border: 1px solid #555; height: 24px; }
  .sb-adjust-btn { background: transparent; border: none; color: #f0d080; width: 22px; height: 22px; cursor: pointer; font-size: 16px; }
  .sb-val-input { width: 32px; background: transparent; border: none; color: #fff; text-align: center; font-size: 14px; font-weight: bold; outline: none; }
  .sb-max-input { width: 32px; background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 3px; color: #aaa; text-align: center; font-size: 11px; }
  
  .sb-bar-bg { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
  .sb-bar-fill { height: 100%; background: linear-gradient(90deg, #c89b3c, #f0d080); transition: width 0.3s; }
  
  .sb-memo { background: rgba(0,0,0,0.3); border: 1px solid #444; color: #ccc; font-size: 11px; border-radius: 4px; padding: 4px; resize: none; outline: none; }
  .sb-ui-mode .sb-memo { width: 100px; height: 32px; }
  .sb-field-mode .sb-memo { width: 100%; height: 40px; margin-top: 6px; }

  .sb-actions { display: flex; align-items: center; gap: 6px; }
  .sb-edit-trigger { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; }
  .sb-edit-trigger:hover { color: #f0d080; }
  .sb-delete-btn { background: none; border: none; color: #777; cursor: pointer; font-size: 16px; transition: all 0.2s; }
  .sb-delete-btn:hover { color: #ff5555; }
  .sb-delete-btn.deleting { background: #ff4a4a !important; color: white !important; transform: scale(1.2); }

  .sb-editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 20000; display: flex; align-items: center; justify-content: center; pointer-events: all; }
  .sb-editor-modal { width: 400px; padding: 20px; border: 1px solid #f0d080; border-radius: 12px; display: flex; flex-direction: column; gap: 15px; }
  .sb-editor-grid { display: grid; grid-template-columns: 100px 1fr; gap: 10px; align-items: center; }
  .sb-editor-grid label { font-size: 13px; color: #f0d080; }
  .sb-editor-grid input, .sb-editor-grid select, .sb-editor-grid textarea { background: #222; border: 1px solid #444; color: #fff; padding: 6px; border-radius: 4px; outline: none; resize: none; }
  .sb-editor-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
  .sb-editor-footer button { padding: 8px 16px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; }
  .sb-btn-save { background: #f0d080; color: #000; }
  .sb-btn-cancel { background: #444; color: #fff; }

  .sb-resize-handle { position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, rgba(199, 179, 119, 0.5) 50%); }
`;
document.head.appendChild(style);
