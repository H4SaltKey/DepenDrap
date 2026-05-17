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
  const myRole = window.myRole || "player1";
  const opRole = myRole === "player1" ? "player2" : "player1";

  const cards = Array.from(content.querySelectorAll(".card:not(.deckObject)"));
  const handMin = window.HAND_ZONE_Y_MIN || 1460;
  
  const myHandCards = cards.filter((c) => c.dataset.owner === myRole && Number(c.dataset.y) >= handMin);
  const opHandCards = cards.filter((c) => c.dataset.owner === opRole && Number(c.dataset.y) >= handMin);

  if (myHandCards.length > 0) {
    myHandCards.sort((a, b) => {
      const oa = Number(a.dataset.handOrder || 0);
      const ob = Number(b.dataset.handOrder || 0);
      return oa - ob;
    });

    const handY = 2000 - 240 - 20; // FIELD_H - CARD_H - 20 (assuming FIELD_H=2000, CARD_H=240)
    const fieldW = 1500; // Assuming FIELD_W=1500
    const cardW = 170; // Assuming CARD_W=170
    
    // 中央寄せの計算
    const totalW = myHandCards.length * (cardW + 10) - 10;
    let startX = (fieldW - totalW) / 2;
    if (startX < 20) startX = 20;

    myHandCards.forEach((c, idx) => {
      const targetX = startX + idx * (cardW + 10);
      c.style.left = targetX + "px";
      c.style.top = handY + "px";
      c.dataset.x = String(targetX);
      c.dataset.y = String(handY);
    });
  }

  // 相手の手札も同様に整列（必要であれば）
  // ...
};
