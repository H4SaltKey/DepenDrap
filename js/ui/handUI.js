/**
 * handUI.js
 * 手札の整列や管理
 */

let handOrderCounter = 0;

window.nextHandOrder = function() {
  handOrderCounter += 1;
  return (Date.now() * 1000) + handOrderCounter;
};

window.prevMyHandCount = -1;

// 手札パネルの展開状態（グローバル）
window.handPanelExpanded = {
  player1: false,
  player2: false
};

// 手札パネル表示高さ設定
const HAND_PANEL_HEIGHT_COLLAPSED = 100;   // 折りたたみ時（アイコンバーのみ）
const HAND_PANEL_HEIGHT_EXPANDED = 600;    // 展開時（全幅全高表示）

window.organizeHands = function() {
  const content = (typeof getFieldContent === "function") ? getFieldContent() : document.getElementById("field");
  if (!content) return;
  const myRole = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole) || localStorage.getItem("gamePlayerKey") || "player1";
  const opRole = myRole === "player1" ? "player2" : "player1";

  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  
  // 手札判定Y座標：展開状態に応じて変更
  const myExpanded = window.handPanelExpanded[myRole];
  const opExpanded = window.handPanelExpanded[opRole];
  
  // 折りたたみ時は手札非表示、展開時は表示（HAND_ZONE_Y_MIN ≤ y ≤ 2000）
  const handMin = myExpanded ? 1400 : 2000;
  const handMaxTop = opExpanded ? 600 : 0;
  const myHandCards = cards.filter((c) => c.dataset.owner === myRole && !c.dataset.zoneType && Number(c.dataset.y) >= handMin);
  const opHandCards = cards.filter((c) => c.dataset.owner === opRole && !c.dataset.zoneType && Number(c.dataset.y) <= handMaxTop);

  // プレイフェーズ中はファーストドローによる非表示制限を自動解除する
  const isPlaying = state?.matchData?.status === "playing";
  if (isPlaying) {
    myHandCards.forEach(c => c.classList.remove("firstDrawHideVisLabel"));
    opHandCards.forEach(c => c.classList.remove("firstDrawHideVisLabel"));
  }

  const fieldW = 3000; // FIELD_W
  const cardW = 320;  // CARD_W
  const cardH = 453;  // CARD_H
  const myOffsetX = (typeof window.getMonsterFieldLayoutOffsetX === "function")
    ? window.getMonsterFieldLayoutOffsetX(myRole)
    : 0;

  // 1. 自分の手札を整列
  if (myHandCards.length > 0) {
    myHandCards.sort((a, b) => {
      const oa = Number(a.dataset.handOrder || 0);
      const ob = Number(b.dataset.handOrder || 0);
      return oa - ob;
    });

    // 展開時：カード下部配置、折りたたみ時：非表示
    const handY = myExpanded ? (2000 - cardH - 20) : 2000;
    
    // 中央寄せの計算
    const spacing = cardW + 15;
    const maxHandWidth = fieldW - 100;
    let actualSpacing = spacing;
    if (myHandCards.length * spacing > maxHandWidth) {
      actualSpacing = maxHandWidth / myHandCards.length;
    }
    
    const totalW = (myHandCards.length - 1) * actualSpacing + cardW;
    let startX = (fieldW - totalW) / 2;
    if (startX < 50) startX = 50;

    myHandCards.forEach((c, idx) => {
      const targetX = startX + idx * actualSpacing + myOffsetX;
      c.style.left = targetX + "px";
      c.style.top = handY + "px";
      c.dataset.x = String(targetX);
      c.dataset.y = String(handY);
    });
  }

  // 2. 相手の手札も同様に整列
  if (opHandCards.length > 0) {
    opHandCards.sort((a, b) => {
      const oa = Number(a.dataset.handOrder || 0);
      const ob = Number(b.dataset.handOrder || 0);
      return oa - ob;
    });

    const handY = opExpanded ? 20 : 0;
    
    const spacing = cardW + 15;
    const maxHandWidth = fieldW - 100;
    let actualSpacing = spacing;
    if (opHandCards.length * spacing > maxHandWidth) {
      actualSpacing = maxHandWidth / opHandCards.length;
    }
    
    const totalW = (opHandCards.length - 1) * actualSpacing + cardW;
    let startX = (fieldW - totalW) / 2;
    if (startX < 50) startX = 50;

    opHandCards.forEach((c, idx) => {
      const targetX = startX + idx * actualSpacing;
      c.style.left = targetX + "px";
      c.style.top = handY + "px";
      c.dataset.x = String(targetX);
      c.dataset.y = String(handY);
    });
  }

  // 常に相手手札側も昇順で再採番し、同期タイミング差で順序が反転し続けるのを防ぐ
  if (opHandCards.length > 0) {
    opHandCards.forEach((c, idx) => {
      c.dataset.handOrder = String((idx + 1) * 1000);
    });
  }
};

// 手札パネルの展開/折りたたみを切り替え
window.toggleHandPanel = function(playerKey) {
  if (!window.handPanelExpanded) window.handPanelExpanded = {};
  window.handPanelExpanded[playerKey] = !window.handPanelExpanded[playerKey];
  
  // レイアウト再計算
  if (typeof window.organizeHands === "function") {
    window.organizeHands();
  }
  if (typeof window.update === "function") {
    window.update(true);
  }
};

// 手札背景パネルの初期化
window.setupHandPanels = function() {
  const fieldContent = document.getElementById("fieldContent");
  if (!fieldContent) return;

  // 相手の手札背景パネル（上部）
  let opHandBg = document.getElementById("opHandZoneBg");
  if (!opHandBg) {
    opHandBg = document.createElement("div");
    opHandBg.id = "opHandZoneBg";
    opHandBg.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: 3000px; height: 600px;
      background: rgba(80, 70, 50, 0.08);
      border-bottom: 1px solid rgba(199, 179, 119, 0.15);
      cursor: pointer;
      transition: background-color 0.3s ease;
      z-index: 100;
    `;
    opHandBg.addEventListener("click", () => window.toggleHandPanel("player2"));
    opHandBg.addEventListener("mouseenter", () => {
      opHandBg.style.backgroundColor = "rgba(100, 90, 60, 0.15)";
    });
    opHandBg.addEventListener("mouseleave", () => {
      opHandBg.style.backgroundColor = "rgba(80, 70, 50, 0.08)";
    });
    fieldContent.appendChild(opHandBg);
  }

  // 自分の手札背景パネル（下部）
  let myHandBg = document.getElementById("myHandZoneBg");
  if (!myHandBg) {
    myHandBg = document.createElement("div");
    myHandBg.id = "myHandZoneBg";
    myHandBg.style.cssText = `
      position: absolute;
      left: 0; bottom: 0;
      width: 3000px; height: 600px;
      background: rgba(80, 70, 50, 0.08);
      border-top: 1px solid rgba(199, 179, 119, 0.15);
      cursor: pointer;
      transition: background-color 0.3s ease;
      z-index: 100;
    `;
    myHandBg.addEventListener("click", () => window.toggleHandPanel("player1"));
    myHandBg.addEventListener("mouseenter", () => {
      myHandBg.style.backgroundColor = "rgba(100, 90, 60, 0.15)";
    });
    myHandBg.addEventListener("mouseleave", () => {
      myHandBg.style.backgroundColor = "rgba(80, 70, 50, 0.08)";
    });
    fieldContent.appendChild(myHandBg);
  }
};
