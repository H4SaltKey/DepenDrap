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
  player1: true,  // デフォルトは展開状態
  player2: true   // デフォルトは展開状態
};

// 手札パネル表示高さ設定
const HAND_PANEL_HEIGHT_COLLAPSED = 100;   // 折りたたみ時（アイコンバーのみ）
const HAND_PANEL_HEIGHT_EXPANDED = 600;    // 展開時（全幅全高表示）

window.organizeHands = function() {
  // ドラッグ中は実行しない（干渉を防ぐ）
  if (window._isDraggingCard) return;
  
  const content = (typeof getFieldContent === "function") ? getFieldContent() : document.getElementById("field");
  if (!content) return;
  const myRole = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole) || localStorage.getItem("gamePlayerKey") || "player1";
  const opRole = myRole === "player1" ? "player2" : "player1";

  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  
  // 手札判定Y座標：展開状態に応じて変更
  const myExpanded = window.handPanelExpanded?.[myRole] ?? true;
  const opExpanded = window.handPanelExpanded?.[opRole] ?? true;
  
  // 折りたたみ時は手札非表示、展開時は表示（HAND_ZONE_Y_MIN ≤ y ≤ 2000）
  const handMin = myExpanded ? 1400 : 2000;
  const handMaxTop = opExpanded ? 600 : 0;
  const myHandCards = cards.filter((c) => c.dataset.owner === myRole && !c.dataset.zoneType && Number(c.dataset.y) >= handMin);
  const opHandCards = cards.filter((c) => c.dataset.owner === opRole && !c.dataset.zoneType && Number(c.dataset.y) <= handMaxTop);

  if (window.debugMode) {
    console.log(`[organizeHands] myExpanded=${myExpanded}, opExpanded=${opExpanded}, myHandCards=${myHandCards.length}, opHandCards=${opHandCards.length}`);
  }

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
    
    // 均等配置：カード間隔を動的に調整（-70% ～ +50%）
    const baseGapWidth = 15; // デフォルト隙間（px）
    const minGapRatio = 0.3;  // 最小: -70% = 0.3倍
    const maxGapRatio = 1.5;  // 最大: +50% = 1.5倍
    const minGapWidth = baseGapWidth * minGapRatio;
    const maxGapWidth = baseGapWidth * maxGapRatio;
    
    const maxHandWidth = fieldW - 100;
    const numCards = myHandCards.length;
    
    // スペーシングを計算：カード数に応じて間隔を動的に調整
    let actualSpacing;
    if (numCards === 1) {
      // 1枚の場合は固定
      actualSpacing = cardW;
    } else {
      const availableWidth = maxHandWidth - cardW;
      const baseSpacing = cardW + baseGapWidth;
      const minSpacing = cardW + minGapWidth;
      const maxSpacing = cardW + maxGapWidth;
      
      // 必要な総幅を計算
      const minTotalWidth = (numCards - 1) * minSpacing + cardW;
      
      if (minTotalWidth > maxHandWidth) {
        // 最小でも超える場合：最小隙間を使用
        actualSpacing = (availableWidth / (numCards - 1));
      } else {
        // 最大限度内で調整：カード数に応じて隙間を増やす
        const maxTotalWidth = (numCards - 1) * maxSpacing + cardW;
        if (maxTotalWidth <= maxHandWidth) {
          // 最大隙間でも収納可能：最大隙間を使用
          actualSpacing = maxSpacing;
        } else {
          // その中間：利用可能な幅に合わせて調整
          actualSpacing = (availableWidth / (numCards - 1));
          // 最小値と最大値の範囲内に制限
          actualSpacing = Math.max(minSpacing, Math.min(maxSpacing, actualSpacing));
        }
      }
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
    
    // 均等配置：カード間隔を動的に調整（-70% ～ +50%）
    const baseGapWidth = 15; // デフォルト隙間（px）
    const minGapRatio = 0.3;  // 最小: -70% = 0.3倍
    const maxGapRatio = 1.5;  // 最大: +50% = 1.5倍
    const minGapWidth = baseGapWidth * minGapRatio;
    const maxGapWidth = baseGapWidth * maxGapRatio;
    
    const maxHandWidth = fieldW - 100;
    const numCards = opHandCards.length;
    
    // スペーシングを計算：カード数に応じて間隔を動的に調整
    let actualSpacing;
    if (numCards === 1) {
      // 1枚の場合は固定
      actualSpacing = cardW;
    } else {
      const availableWidth = maxHandWidth - cardW;
      const baseSpacing = cardW + baseGapWidth;
      const minSpacing = cardW + minGapWidth;
      const maxSpacing = cardW + maxGapWidth;
      
      // 必要な総幅を計算
      const minTotalWidth = (numCards - 1) * minSpacing + cardW;
      
      if (minTotalWidth > maxHandWidth) {
        // 最小でも超える場合：最小隙間を使用
        actualSpacing = (availableWidth / (numCards - 1));
      } else {
        // 最大限度内で調整：カード数に応じて隙間を増やす
        const maxTotalWidth = (numCards - 1) * maxSpacing + cardW;
        if (maxTotalWidth <= maxHandWidth) {
          // 最大隙間でも収納可能：最大隙間を使用
          actualSpacing = maxSpacing;
        } else {
          // その中間：利用可能な幅に合わせて調整
          actualSpacing = (availableWidth / (numCards - 1));
          // 最小値と最大値の範囲内に制限
          actualSpacing = Math.max(minSpacing, Math.min(maxSpacing, actualSpacing));
        }
      }
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

  // ホバー動作を設定
  if (typeof window.setupHandCardHoverBehavior === "function") {
    window.setupHandCardHoverBehavior();
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
  console.log("[setupHandPanels] START");
  const fieldContent = document.getElementById("fieldContent");
  if (!fieldContent) {
    console.warn("[setupHandPanels] fieldContent not found!");
    return;
  }
  console.log("[setupHandPanels] fieldContent found, rect:", fieldContent.getBoundingClientRect());

  // 相手の手札背景パネル（上部）
  let opHandBg = document.getElementById("opHandZoneBg");
  if (!opHandBg) {
    console.log("[setupHandPanels] Creating opHandZoneBg");
    opHandBg = document.createElement("div");
    opHandBg.id = "opHandZoneBg";
    opHandBg.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      right: auto;
      bottom: auto;
      width: 3000px;
      height: 600px;
      background: rgba(80, 70, 50, 0.2);
      border-bottom: 2px solid rgba(199, 179, 119, 0.4);
      cursor: pointer;
      transition: background-color 0.3s ease;
      z-index: 150;
      pointer-events: auto;
    `;
    opHandBg.addEventListener("click", () => {
      console.log("[opHandBg] clicked - toggleHandPanel player2");
      window.toggleHandPanel("player2");
    });
    opHandBg.addEventListener("mouseenter", () => {
      opHandBg.style.backgroundColor = "rgba(150, 120, 80, 0.3)";
    });
    opHandBg.addEventListener("mouseleave", () => {
      opHandBg.style.backgroundColor = "rgba(80, 70, 50, 0.2)";
    });
    fieldContent.appendChild(opHandBg);
    console.log("[setupHandPanels] opHandZoneBg created, rect:", opHandBg.getBoundingClientRect());
  }

  // 自分の手札背景パネル（下部）
  let myHandBg = document.getElementById("myHandZoneBg");
  if (!myHandBg) {
    console.log("[setupHandPanels] Creating myHandZoneBg");
    myHandBg = document.createElement("div");
    myHandBg.id = "myHandZoneBg";
    myHandBg.style.cssText = `
      position: absolute;
      left: 0;
      top: auto;
      right: auto;
      bottom: 0;
      width: 3000px;
      height: 600px;
      background: rgba(80, 70, 50, 0.2);
      border-top: 2px solid rgba(199, 179, 119, 0.4);
      cursor: pointer;
      transition: background-color 0.3s ease;
      z-index: 150;
      pointer-events: auto;
    `;
    myHandBg.addEventListener("click", () => {
      console.log("[myHandBg] clicked - toggleHandPanel player1");
      window.toggleHandPanel("player1");
    });
    myHandBg.addEventListener("mouseenter", () => {
      myHandBg.style.backgroundColor = "rgba(150, 120, 80, 0.3)";
    });
    myHandBg.addEventListener("mouseleave", () => {
      myHandBg.style.backgroundColor = "rgba(80, 70, 50, 0.2)";
    });
    fieldContent.appendChild(myHandBg);
    console.log("[setupHandPanels] myHandZoneBg created, rect:", myHandBg.getBoundingClientRect());
  }
  
  console.log("[setupHandPanels] COMPLETE");
};

/**
 * 手札カードのホバー動作を設定
 * ホバーされたカードが最前面に移動し、左右のカードが離れる方向に動く
 */
window.setupHandCardHoverBehavior = function() {
  const content = document.getElementById("field");
  if (!content) return;

  const cardW = 320;  // CARD_W
  const minSpacing = 4.5;   // 最小間隔 (gap * -70%)
  const maxSpacing = 22.5;  // 最大間隔 (gap * +50%)
  const offsets = [0.4, 0.2]; // 隣接カードのオフセット比率 [1番目: 40%, 2番目: 20%]

  // 既存のイベントリスナーを削除（重複登録を防ぐ）
  const allCards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  allCards.forEach(card => {
    const clone = card.cloneNode(true);
    card.parentNode.replaceChild(clone, card);
  });

  // 再度DOM取得してイベントリスナーを追加
  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  
  cards.forEach((card) => {
    // ホバー開始時
    card.addEventListener("mouseenter", function() {
      // ホバーカードを最前面に
      const originalZIndex = this.style.zIndex;
      this.style.zIndex = "10000";
      this.dataset.originalZIndex = originalZIndex || "auto";
      
      // 手札内で同じオーナーのカードを手Order でソート
      const owner = this.dataset.owner;
      const handCards = Array.from(content.querySelectorAll(
        `.card:not(.deckObject)[data-owner="${owner}"][data-zone-type=""]`
      )).filter(c => c.dataset.zoneType === undefined || c.dataset.zoneType === "");
      
      if (handCards.length <= 1) return;

      // handOrder でソート
      handCards.sort((a, b) => {
        const oa = Number(a.dataset.handOrder || 0);
        const ob = Number(b.dataset.handOrder || 0);
        return oa - ob;
      });

      // このカードのインデックスを取得
      const currentIndex = handCards.indexOf(this);
      
      // 現在の整列間隔を計算（organizeHands() の計算と同じ）
      const numCards = handCards.length;
      const fieldW = 3000; // FIELD_W
      const maxHandWidth = fieldW - 100;
      const cardW = 320;
      const baseGap = 15;
      
      let actualSpacing = baseGap;
      if (numCards > 1) {
        const totalW = (numCards - 1) * baseGap + cardW;
        if (totalW > maxHandWidth) {
          const availableWidth = maxHandWidth - cardW;
          const minTotalWidth = (numCards - 1) * minSpacing + cardW;
          if (minTotalWidth <= maxHandWidth) {
            const maxTotalWidth = (numCards - 1) * maxSpacing + cardW;
            if (maxTotalWidth <= maxHandWidth) {
              actualSpacing = maxSpacing;
            } else {
              actualSpacing = Math.max(minSpacing, Math.min(maxSpacing, availableWidth / (numCards - 1)));
            }
          } else {
            actualSpacing = availableWidth / (numCards - 1);
          }
        }
      }
      
      // ホバー展開量を整列間隔の最大値に制限
      const maxDisplacement = maxSpacing;
      
      // 左側のカード（最大2枚）にオフセットを適用
      for (let i = 1; i <= Math.min(2, currentIndex); i++) {
        const leftCard = handCards[currentIndex - i];
        if (!leftCard) break;
        const offsetRatio = offsets[i - 1] || offsets[offsets.length - 1];
        const hoverDisplacement = -(cardW * offsetRatio);
        // 展開量と整列間隔の合計が maxDisplacement を超えない
        const displacement = Math.max(hoverDisplacement, -maxDisplacement);
        leftCard.style.transform = `translateX(${displacement}px)`;
        leftCard.style.zIndex = String(10000 - i);
      }

      // 右側のカード（最大2枚）にオフセットを適用
      for (let i = 1; i <= Math.min(2, handCards.length - currentIndex - 1); i++) {
        const rightCard = handCards[currentIndex + i];
        if (!rightCard) break;
        const offsetRatio = offsets[i - 1] || offsets[offsets.length - 1];
        const hoverDisplacement = cardW * offsetRatio;
        // 展開量と整列間隔の合計が maxDisplacement を超えない
        const displacement = Math.min(hoverDisplacement, maxDisplacement);
        rightCard.style.transform = `translateX(${displacement}px)`;
        rightCard.style.zIndex = String(10000 - i);
      }
    });

    // ホバー終了時
    card.addEventListener("mouseleave", function() {
      // ホバーカードを元のz-indexに戻す
      this.style.zIndex = this.dataset.originalZIndex || "auto";
      delete this.dataset.originalZIndex;

      // 手札内で同じオーナーのカードをリセット
      const owner = this.dataset.owner;
      const handCards = Array.from(content.querySelectorAll(
        `.card:not(.deckObject)[data-owner="${owner}"][data-zone-type=""]`
      )).filter(c => c.dataset.zoneType === undefined || c.dataset.zoneType === "");

      handCards.forEach(card => {
        card.style.transform = "";
        card.style.zIndex = "auto";
      });
    });
  });
};

