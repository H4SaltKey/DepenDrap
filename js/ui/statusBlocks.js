/**
 * statusBlocks.js
 * フィールド上のステータスブロック（バフ・デバフ、メモなど）をレンダリングする
 */

window.renderStatusBlocks = function() {
  const containerId = "statusBlocksLayer";
  let layer = document.getElementById(containerId);
  
  if (!layer) {
    layer = document.createElement("div");
    layer.id = containerId;
    layer.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 3000px; height: 2000px;
      pointer-events: none;
      z-index: 50;
    `;
    const fieldContent = document.getElementById("fieldContent");
    if (fieldContent) {
      fieldContent.appendChild(layer);
    } else {
      document.body.appendChild(layer);
    }
  }

  const blocks = state.statusBlocks || [];
  
  // 既存のブロックIDリストを取得
  const existingIds = Array.from(layer.querySelectorAll(".status-block")).map(el => el.id);
  const currentIds = blocks.map(b => b.id);
  
  // 削除されたブロックをクリーンアップ
  existingIds.forEach(id => {
    if (!currentIds.includes(id)) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  });

  // 各ブロックを描画/更新
  blocks.forEach(block => {
    let el = document.getElementById(block.id);
    if (!el) {
      el = document.createElement("div");
      el.id = block.id;
      el.className = "status-block premium-glass";
      el.style.position = "absolute";
      el.style.pointerEvents = "all";
      layer.appendChild(el);
      
      // ドラッグ機能の追加（シンプル版）
      el.onmousedown = (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        const startX = e.pageX - block.x;
        const startY = e.pageY - block.y;
        
        const onMouseMove = (moveE) => {
          block.x = moveE.pageX - startX;
          block.y = moveE.pageY - startY;
          el.style.left = block.x + "px";
          el.style.top = block.y + "px";
        };
        
        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
        };
        
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      };
    }

    el.style.left = (block.x || 0) + "px";
    el.style.top = (block.y || 0) + "px";

    // 内容の更新（パフォーマンスのため変更時のみが理想だが、一旦シンプルに）
    const html = `
      <div class="sb-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <input type="text" value="${block.name || ''}" class="sb-name-input" 
          onchange="updateBlockData('${block.id}', 'name', this.value)"
          style="background:transparent; border:none; color:#f0d080; font-weight:bold; font-size:14px; width:120px;">
        <button onclick="removeStatusBlock('${block.id}')" style="background:none; border:none; color:#e24a4a; cursor:pointer; font-size:16px;">✕</button>
      </div>
      <div class="sb-body" style="display:flex; align-items:center; gap:8px;">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
            <input type="number" value="${block.current || 0}" class="sb-val-input"
              onchange="updateBlockData('${block.id}', 'current', this.value)"
              style="width:40px; background:rgba(0,0,0,0.3); border:1px solid #444; color:#fff; border-radius:4px; text-align:center;">
            <span style="color:#888;">/</span>
            <input type="number" value="${block.max || 10}" class="sb-val-input"
              onchange="updateBlockData('${block.id}', 'max', this.value)"
              style="width:40px; background:rgba(0,0,0,0.3); border:1px solid #444; color:#888; border-radius:4px; text-align:center;">
          </div>
          <div class="sb-bar-bg" style="height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
            <div class="sb-bar-fill" style="height:100%; width:${Math.min(100, (block.current / block.max) * 100)}%; background:#c89b3c; transition:width 0.3s;"></div>
          </div>
        </div>
      </div>
      <textarea class="sb-memo" onchange="updateBlockData('${block.id}', 'memo', this.value)"
        placeholder="メモ..."
        style="width:100%; margin-top:8px; background:rgba(0,0,0,0.2); border:1px solid #333; color:#aaa; font-size:11px; border-radius:4px; resize:none; height:40px;">${block.memo || ''}</textarea>
    `;
    
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  });
};

window.updateBlockData = function(id, key, value) {
  const block = state.statusBlocks.find(b => b.id === id);
  if (block) {
    if (key === 'current' || key === 'max') {
      block[key] = Number(value);
    } else {
      block[key] = value;
    }
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
    renderStatusBlocks(); // 即時反映
  }
};

window.removeStatusBlock = function(id) {
  state.statusBlocks = state.statusBlocks.filter(b => b.id !== id);
  if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
  renderStatusBlocks();
};

// スタイル追加
const style = document.createElement("style");
style.textContent = `
  .premium-glass {
    background: rgba(15, 12, 25, 0.85);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(199, 179, 119, 0.3);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    width: 180px;
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .premium-glass:hover {
    border-color: rgba(199, 179, 119, 0.6);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
  }
  .sb-val-input::-webkit-inner-spin-button, 
  .sb-val-input::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }
`;
document.head.appendChild(style);
