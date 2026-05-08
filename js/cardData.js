let CARD_DB = [];
let CARD_INDEX = {};

async function loadCardData(){
  const res = await fetch("data/cards.json");
  if(!res.ok) throw new Error("cards.json の読み込みに失敗しました");
  const cards = await res.json();

  CARD_DB = cards.map(card => ({
    ...card,
    name: card.name || "",
    image: card.image.startsWith("assets/") ? card.image : "assets/cards/" + card.image
  }));

  CARD_INDEX = Object.fromEntries(CARD_DB.map(card => [card.id, card]));
}

function getCardIds(){
  return CARD_DB.map(card => card.id).sort();
}

function getDeckCardIds(){
  return getCardIds().filter(id => id !== "cd0000");
}

function getCardData(id){
  return CARD_INDEX[id] || null;
}
