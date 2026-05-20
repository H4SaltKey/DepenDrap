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
      background: rgba(14, 12, 28, 0.97);
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
    .dvCard:hover {
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

  // カードIDリストを構築（ゲーム中は state.deck、なければ deckCode から）
  let cardIds = [];
  if (deck.length > 0) {
    cardIds = deck.map(id => {
      // TEMP: / HIDDEN プレフィックスを除去
      if (typeof id === "string") return id.replace(/^(TEMP:|HIDDEN)/, "");
      return id;
    }).filter(Boolean);
  } else if (deckCode && typeof decodeDeck === "function") {
    try { cardIds = decodeDeck(deckCode); } catch {}
  }

  // 枚数カウント
  const counts = {};
  cardIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
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
    <span id="deckViewerMeta">${cardIds.length} 枚 / ${uniqueIds.length} 種</span>
    <button id="deckViewerClose">閉じる</button>
  `;

  // カードグリッド
  const grid = document.createElement("div");
  grid.id = "deckViewerGrid";

  if (uniqueIds.length === 0) {
    grid.innerHTML = `<div class="dvEmpty">デッキにカードがありません</div>`;
  } else {
    uniqueIds.forEach(id => {
      const count = counts[id];
      const cardData = (typeof getCardData === "function") ? getCardData(id) : null;
      const imgSrc = cardData?.image ? encodeURI(cardData.image) : "assets/404.png";

      const card = document.createElement("div");
      card.className = "dvCard";
      card.title = cardData?.name || id;
      card.innerHTML = `
        <img src="${imgSrc}" alt="" onerror="this.src='assets/404.png'">
        ${count > 1 ? `<div class="dvCardCount">×${count}</div>` : ""}
      `;
      grid.appendChild(card);
    });
  }

  box.appendChild(header);
  box.appendChild(grid);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // 閉じるボタン
  document.getElementById("deckViewerClose").addEventListener("click", closeDeckViewer);

  // Escape キーで閉じる
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

})();
