/**
 * statusBlocks.js
 * フィールド上およびUI上のステータスブロックをレンダリングする
 */

window.renderStatusBlocks = function() {
  const p1Blocks = state.player1?.statusBlocks || [];
  const p2Blocks = state.player2?.statusBlocks || [];
  const allBlocks = [...p1Blocks, ...p2Blocks];
  
  // 1. レイヤーの準備
  ensureLayers();

  const fieldLayer = document.getElementById("fieldStatusBlocksLayer");
  const uiLayer = document.getElementById("uiStatusBlocksLayer");

  // 既存のDOM要素を取得して、不要なものを消す
  const existingElements = new Set(document.querySelectorAll(".status-block"));
  const activeIds = new Set(allBlocks.map(b => b.id));

  existingElements.forEach(el => {
    if (!activeIds.has(el.id)) el.remove();
  });

  // 2. ブロックの描画
  // UIブロック
  const uiBlocks = allBlocks.filter(b => b.type === "ui");
  // UIブロックの順序：player1のあとにplayer2を並べる（または逆）。
  // ここでは owner ごとに並べる
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
  // フィールドレイヤー
  let fieldLayer = document.getElementById("fieldStatusBlocksLayer");
  if (!fieldLayer) {
    fieldLayer = document.createElement("div");
    fieldLayer.id = "fieldStatusBlocksLayer";
    fieldLayer.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 3000px; height: 2000px;
      pointer-events: none;
      z-index: 50;
    `;
    const content = document.getElementById("fieldContent");
    if (content) content.appendChild(fieldLayer);
  }

  // UIレイヤー
  let uiLayer = document.getElementById("uiStatusBlocksLayer");
  if (!uiLayer) {
    uiLayer = document.createElement("div");
    uiLayer.id = "uiStatusBlocksLayer";
    uiLayer.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      z-index: 1000;
      width: fit-content;
    `;
    // チャット欄の下に追加（gameUiPlayer 内）
    const chatArea = document.getElementById("chatArea");
    if (chatArea && chatArea.parentElement) {
      chatArea.parentElement.appendChild(uiLayer);
    } else {
      document.body.appendChild(uiLayer);
    }
  }
}

function renderSingleBlock(block, parent, index) {
  let el = document.getElementById(block.id);
  const myRole = window.myRole || "player1";
  const isMine = block.owner === myRole;

  if (!el) {
    el = document.createElement("div");
    el.id = block.id;
    el.className = "status-block premium-glass";
    parent.appendChild(el);
  } else if (el.parentElement !== parent) {
    parent.appendChild(el);
  }

  // 位置とスケールの適用
  if (block.type === "field") {
    el.style.position = "absolute";
    el.style.left = (block.x || 0) + "px";
    el.style.top = (block.y || 0) + "px";
    el.style.pointerEvents = "all";
  } else {
    el.style.position = "relative";
    el.style.left = "0";
    el.style.top = "0";
    el.style.pointerEvents = "all";
    el.style.order = index; 
  }

  const scale = block.scale || 1.0;
  el.style.transform = `scale(${scale})`;
  el.style.transformOrigin = "top left";
  
  // スケールによる専有面積の調整（UIスタック用）
  if (block.type === "ui") {
    el.style.marginBottom = (200 * (scale - 1)) + "px";
    el.style.marginRight = (200 * (scale - 1)) + "px";
  }

  const isField = block.type === "field";
  const upDownBtns = (!isField && isMine) ? `
    <div class="sb-reorder-btns">
      <button onclick="reorderBlock('${block.id}', -1)" class="sb-mini-btn">▲</button>
      <button onclick="reorderBlock('${block.id}', 1)" class="sb-mini-btn">▼</button>
    </div>
  ` : '';

  const deleteBtn = isMine ? `
    <button class="sb-delete-btn" onpointerdown="handleDeleteDown(event, '${block.id}')" onpointerup="handleDeleteUp(event)" onpointerleave="handleDeleteUp(event)">✕</button>
  ` : `<span style="font-size:10px; color:#555;">${block.owner === 'player1' ? 'P1' : 'P2'}</span>`;

  const readonly = isMine ? "" : "readonly disabled";

  const html = `
    <div class="sb-header">
      <input type="text" value="${block.name || ''}" class="sb-name-input" 
        ${readonly}
        onchange="updateBlockData('${block.id}', 'name', this.value)">
      <div style="display:flex; gap:4px; align-items:center;">
        ${upDownBtns}
        ${deleteBtn}
      </div>
    </div>
    <div class="sb-body">
      <div class="sb-val-row">
        <div class="sb-val-controls">
          <button onclick="adjustCurrent('${block.id}', -1)" class="sb-adjust-btn" ${readonly}>−</button>
          <input type="number" value="${block.current || 0}" class="sb-val-input"
            ${readonly}
            onchange="updateBlockData('${block.id}', 'current', this.value)">
          <button onclick="adjustCurrent('${block.id}', 1)" class="sb-adjust-btn" ${readonly}>＋</button>
        </div>
        <span class="sb-sep">/</span>
        <input type="number" value="${block.max || 10}" class="sb-max-input"
          ${readonly}
          onchange="updateBlockData('${block.id}', 'max', this.value)">
      </div>
      <div class="sb-bar-bg">
        <div class="sb-bar-fill" style="width:${Math.min(100, (block.current / block.max) * 100)}%;"></div>
      </div>
    </div>
    <textarea class="sb-memo" onchange="updateBlockData('${block.id}', 'memo', this.value)"
      ${readonly}
      placeholder="メモ...">${block.memo || ''}</textarea>
    ${isMine ? `<div class="sb-resize-handle" onpointerdown="startResizing(event, '${block.id}')"></div>` : ''}
  `;

  if (el.innerHTML !== html) {
    el.innerHTML = html;
    // イベント競合回避
    if (isField && isMine) {
      el.onpointerdown = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.classList.contains("sb-resize-handle") || e.target.classList.contains("sb-delete-btn") || e.target.classList.contains("sb-adjust-btn")) return;
        e.stopPropagation();
        startDragging(e, block.id);
      };
    }
  }
}

// --- ドラッグ & リサイズ ---

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
  resizeStartScale = block.scale || 1.0;
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

    block.x = (e.clientX - rect.left - panX) / zoom - dragOffset.x;
    block.y = (e.clientY - rect.top - panY) / zoom - dragOffset.y;
    
    const el = document.getElementById(draggingBlockId);
    el.style.left = block.x + "px";
    el.style.top = block.y + "px";
  }
  
  if (resizingBlockId) {
    const block = findBlockById(resizingBlockId);
    if (!block) return;
    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;
    const delta = (dx + dy) / 200;
    const newScale = Math.max(0.5, Math.min(4.0, resizeStartScale + delta));
    block.scale = newScale;
    
    const el = document.getElementById(resizingBlockId);
    el.style.transform = `scale(${newScale})`;
    
    if (block.type === "ui") {
       el.style.marginBottom = (200 * (newScale - 1)) + "px";
       el.style.marginRight = (200 * (newScale - 1)) + "px";
    }
  }
}

function onPointerUp(e) {
  if (draggingBlockId || resizingBlockId) {
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  }
  draggingBlockId = null;
  resizingBlockId = null;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
}

// --- 各種アクション ---

function findBlockById(id) {
  const p1 = state.player1?.statusBlocks || [];
  const p2 = state.player2?.statusBlocks || [];
  return p1.find(b => b.id === id) || p2.find(b => b.id === id);
}

window.adjustCurrent = function(id, delta) {
  const block = findBlockById(id);
  if (block && block.owner === window.myRole) {
    block.current = (block.current || 0) + delta;
    updateAndSync();
  }
};

window.reorderBlock = function(id, direction) {
  const myRole = window.myRole || "player1";
  const list = state[myRole].statusBlocks;
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
  if (block && block.owner === window.myRole) {
    if (key === 'current' || key === 'max') {
      block[key] = Number(value);
    } else {
      block[key] = value;
    }
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
  if (deleteTimer) {
    clearTimeout(deleteTimer);
    deleteTimer = null;
  }
  if (e.target && e.target.classList) {
    e.target.classList.remove("deleting");
  }
};

function removeStatusBlock(id) {
  const myRole = window.myRole || "player1";
  state[myRole].statusBlocks = state[myRole].statusBlocks.filter(b => b.id !== id);
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
    width: 200px;
    background: rgba(15, 12, 25, 0.9);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(199, 179, 119, 0.4);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    user-select: none;
    transition: border-color 0.3s, box-shadow 0.3s;
    box-sizing: border-box;
  }
  .status-block:hover {
    border-color: rgba(199, 179, 119, 0.8);
  }
  .sb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    gap: 8px;
  }
  .sb-name-input {
    background: transparent;
    border: none;
    color: #f0d080;
    font-weight: bold;
    font-size: 15px;
    width: 100%;
    outline: none;
  }
  .sb-val-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .sb-val-controls {
    display: flex;
    align-items: center;
    background: rgba(0,0,0,0.4);
    border-radius: 6px;
    border: 1px solid #555;
    overflow: hidden;
  }
  .sb-adjust-btn {
    background: transparent;
    border: none;
    color: #f0d080;
    width: 26px;
    height: 26px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sb-adjust-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
  .sb-adjust-btn:disabled { opacity: 0.3; cursor: default; }
  
  .sb-val-input {
    width: 40px;
    background: transparent;
    border: none;
    color: #fff;
    text-align: center;
    font-size: 16px;
    font-weight: bold;
    outline: none;
  }
  .sb-max-input {
    width: 40px;
    background: rgba(0,0,0,0.3);
    border: 1px solid #444;
    border-radius: 4px;
    color: #aaa;
    text-align: center;
    font-size: 13px;
  }
  .sb-sep { color: #666; font-size: 14px; }
  .sb-bar-bg {
    height: 8px;
    background: rgba(255,255,255,0.08);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
    border: 1px solid rgba(0,0,0,0.3);
  }
  .sb-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #c89b3c, #f0d080);
    box-shadow: 0 0 8px rgba(200, 155, 60, 0.4);
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sb-memo {
    width: 100%;
    background: rgba(0,0,0,0.3);
    border: 1px solid #444;
    color: #ccc;
    font-size: 12px;
    border-radius: 6px;
    padding: 8px;
    resize: none;
    height: 52px;
    box-sizing: border-box;
    outline: none;
    font-family: inherit;
  }
  .sb-delete-btn {
    background: none;
    border: none;
    color: #777;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
    line-height: 1;
  }
  .sb-delete-btn:hover { color: #ff5555; background: rgba(255,0,0,0.15); }
  .sb-delete-btn.deleting {
    background: #ff4a4a !important;
    color: white !important;
    transform: scale(1.3);
    box-shadow: 0 0 15px rgba(255,74,74,0.5);
  }
  .sb-reorder-btns {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sb-mini-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid #444;
    color: #888;
    font-size: 9px;
    padding: 0 3px;
    cursor: pointer;
    border-radius: 2px;
    line-height: 10px;
  }
  .sb-mini-btn:hover { background: rgba(255,255,255,0.15); color: #ddd; }
  
  .sb-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 18px;
    height: 18px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 60%, rgba(199, 179, 119, 0.5) 60%);
    border-radius: 0 0 12px 0;
  }
  
  .sb-val-input::-webkit-inner-spin-button, 
  .sb-val-input::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }
`;
document.head.appendChild(style);
