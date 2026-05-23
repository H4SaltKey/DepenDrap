/**
 * deckViewer.js
 * ゲーム中にデッキ内容を確認するオーバーレイUI
 */

(function() {

// ===== スタイル注入（初回のみ） =====
function injectDeckViewerStyle() {
  if (document.getElementById("deckViewerStyle")) return;
  const s = document.createElement("style");
  s.id = "deckViewerStyle";
  s.textContent = `
    #deckViewerOverlay {
      position: fixed;
      inset: 0;
      z-index: 90000;
      background: rgba(6, 5, 14, 0.88);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      animation: dvFadeIn 0.2s ease;
    }
    @keyframes dvFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    #deckViewerBox {
      background: linear-gradient(135deg, rgba(20, 18, 35, 0.98), rgba(10, 8, 20, 0.98));
      border: 1px solid rgba(199, 179, 119, 0.4);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
      width: min(900px, 92vw);
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #deckViewerHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(199, 179, 119, 0.2);
      flex-shrink: 0;
    }
    #deckViewerHeader h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #f0d080;
      letter-spacing: 1px;
    }
    #deckViewerMeta {
      font-size: 12px;
      color: #a09070;
    }
    #deckViewerClose {
      background: none;
      border: 1px solid rgba(255,255,255,0.2);
      color: #ccc;
      border-radius: 8px;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    #deckViewerClose:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    #deckViewerGrid {
      overflow-y: auto;
      padding: 16px 20px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 8px;
      align-content: start;
    }
    .dvCard {
      position: relative;
      aspect-ratio: 118 / 168;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.4);
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .dvCardEmpty {
      border: 1px dashed rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.1);
    }
    .dvCard:hover:not(.dvCardEmpty) {
      transform: translateY(-3px) scale(1.04);
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      border-color: rgba(199,179,119,0.5);
      z-index: 2;
    }
    .dvCard img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .dvCardCount {
      position: absolute;
      bottom: 3px;
      right: 4px;
      background: rgba(0,0,0,0.75);
      color: #f0d080;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 4px;
      line-height: 1.4;
    }
    .dvEmpty {
      grid-column: 1 / -1;
      text-align: center;
      color: #666;
      font-size: 14px;
      padding: 40px 0;
    }
    /* フェーズオーバーレイ内の「デッキを確認」ボタン */
    .phaseOverlayDeckBtn {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 10100;
      background: rgba(14, 12, 28, 0.85);
      border: 1px solid rgba(199, 179, 119, 0.5);
      color: #f0d080;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
      transition: background 0.15s, border-color 0.15s;
    }
    .phaseOverlayDeckBtn:hover {
      background: rgba(30, 25, 50, 0.95);
      border-color: rgba(199, 179, 119, 0.9);
    }
  `;
  document.head.appendChild(s);
}

// ===== デッキ確認オーバーレイを開く =====
window.openDeckViewer = function() {
  injectDeckViewerStyle();

  // 既に開いていれば閉じる
  if (document.getElementById("deckViewerOverlay")) {
    closeDeckViewer();
    return;
  }

  // デッキデータ取得
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const myState = (typeof state !== "undefined") ? state[me] : null;
  const deck = myState?.deck || [];
  const deckCode = localStorage.getItem("deckCode") || "";

  // カードIDリストを構築
  let cardIds = [];
  if (deck.length > 0) {
    cardIds = deck.map(id => {
      if (typeof id === "string") return id.replace(/^(TEMP:|HIDDEN)/, "");
      return id;
    });
  } else if (deckCode && typeof decodeDeck === "function") {
    try { cardIds = decodeDeck(deckCode); } catch {}
  }

  // 枚数カウント（表示用）
  const counts = {};
  cardIds.forEach(id => { if(id) counts[id] = (counts[id] || 0) + 1; });
  const uniqueIds = Object.keys(counts);

  // オーバーレイ構築
  const overlay = document.createElement("div");
  overlay.id = "deckViewerOverlay";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDeckViewer();
  });

  const box = document.createElement("div");
  box.id = "deckViewerBox";

  // ヘッダー
  const header = document.createElement("div");
  header.id = "deckViewerHeader";
  header.innerHTML = `
    <h3>デッキ確認</h3>
    <span id="deckViewerMeta">${cardIds.length} 枚</span>
    <button id="deckViewerClose">閉じる</button>
  `;

  // カードグリッド
  const grid = document.createElement("div");
  grid.id = "deckViewerGrid";

  const totalSlots = Math.max(cardIds.length, 40);
  for (let i = 0; i < totalSlots; i++) {
    const id = cardIds[i];
    const card = document.createElement("div");
    
    if (id) {
      const cardData = (typeof getCardData === "function") ? getCardData(id) : null;
      const imgSrc = cardData?.image ? encodeURI(cardData.image) : "assets/System/404.png";
      card.className = "dvCard";
      card.title = cardData?.name || id;
      card.innerHTML = `
        <img src="${imgSrc}" alt="" onerror="this.src='assets/System/404.png'">
      `;
    } else {
      card.className = "dvCard dvCardEmpty";
    }
    grid.appendChild(card);
  }

  box.appendChild(header);
  box.appendChild(grid);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("deckViewerClose").addEventListener("click", closeDeckViewer);

  overlay._keyHandler = (e) => { if (e.key === "Escape") closeDeckViewer(); };
  document.addEventListener("keydown", overlay._keyHandler);
};

function closeDeckViewer() {
  const overlay = document.getElementById("deckViewerOverlay");
  if (!overlay) return;
  document.removeEventListener("keydown", overlay._keyHandler);
  overlay.remove();
}

window.closeDeckViewer = closeDeckViewer;

/**
 * フェーズオーバーレイに「デッキを確認」ボタンを追加する
 * 既に追加済みの場合はスキップ
 */
window.injectPhaseOverlayDeckBtn = function() {
  injectDeckViewerStyle();
  if (document.getElementById("phaseOverlayDeckBtn")) return;
  const btn = document.createElement("button");
  btn.id = "phaseOverlayDeckBtn";
  btn.className = "phaseOverlayDeckBtn";
  btn.textContent = "デッキを確認";
  btn.addEventListener("click", () => window.openDeckViewer());
  document.body.appendChild(btn);
};

/**
 * フェーズオーバーレイの「デッキを確認」ボタンを削除する
 */
window.removePhaseOverlayDeckBtn = function() {
  const btn = document.getElementById("phaseOverlayDeckBtn");
  if (btn) btn.remove();
};

})();
