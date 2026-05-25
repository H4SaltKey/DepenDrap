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

window.organizeHands = function() {
  const content = (typeof getFieldContent === "function") ? getFieldContent() : document.getElementById("field");
  if (!content) return;
  const myRole = (typeof window.getMyRole === "function" ? window.getMyRole() : window.myRole) || localStorage.getItem("gamePlayerKey") || "player1";
  const opRole = myRole === "player1" ? "player2" : "player1";

  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  
  const handMin = window.HAND_ZONE_Y_MIN || 1460;
  const handMaxTop = 2000 - handMin;
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

    const handY = 2000 - cardH - 20; // 1527px
    
    // 中央寄せの計算
    // カード同士の標準的な間隔（少し重ねる）
    const spacing = cardW + 15;
    const maxHandWidth = fieldW - 100;
    let actualSpacing = spacing;
    // 手札枚数が多くて領域からはみ出る場合、重なりを強める
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

    const handY = 20; // 画面上部 20px
    
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
