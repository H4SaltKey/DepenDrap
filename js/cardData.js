const CARD_DATA_URL = new URL("../data/cards.json", document.baseURI).href;
let CARD_DB = [];
let CARD_INDEX = {};

async function loadCardData(){
  const res = await fetch(CARD_DATA_URL);
  if(!res.ok) throw new Error("cards.json の読み込みに失敗しました");
  const cards = await res.json();

  CARD_DB = cards.map(card => ({
    ...card,
    name: card.name || "",
    image: normalizeCardImagePath(card.image || "")
  }));
  CARD_INDEX = Object.fromEntries(CARD_DB.map(card => [card.id, card]));
}

function normalizeCardImagePath(path) {
  let p = String(path || "").trim();
  if (!p) return "assets/404.png";
  p = p.normalize ? p.normalize("NFC") : p;
  if (p.startsWith("asset/")) {
    p = p.replace(/^asset\//, "assets/");
  }
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/") || p.startsWith("assets/")) {
    return p;
  }
  return "assets/cards/" + p;
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
