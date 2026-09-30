const CARD_DATA_URL = new URL("data/cards.json", document.baseURI).href;
let CARD_DB = [];
let CARD_INDEX = {};

async function loadCardData(){
  const res = await fetch(CARD_DATA_URL);
  if(!res.ok) throw new Error("cards.json の読み込みに失敗しました");
  const cards = await res.json();

  CARD_DB = cards.map(card => {
    const normalized = {
      ...card,
      name: card.name || "",
      attribute: card.attribute || "近接",
      type: card.type || "アタッカー",
      attack: normalizeCardAttack(card.attack),
      effectText: String(card.effectText || "").trim(),
      effects: normalizeCardEffects(card.effects),
      tags: normalizeCardTags(card.tags),
      image: normalizeCardImagePath(card.image || "")
    };
    ["effectDsl", "effectDslText", "effectGraph", "effectBlocks", "useEffectDslText"].forEach((key) => delete normalized[key]);
    return normalized;
  });
  CARD_INDEX = Object.fromEntries(CARD_DB.map(card => [card.id, card]));
}

function normalizeCardImagePath(path) {
  let p = String(path || "").trim();
  if (!p) return "assets/System/404.png";
  p = p.normalize ? p.normalize("NFC") : p;
  if (p.startsWith("asset/")) {
    p = p.replace(/^asset\//, "assets/");
  }
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/") || p.startsWith("assets/")) {
    return p;
  }
  return "assets/cards/" + p;
}

function normalizeCardTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag || "").trim()).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags.split(/[,、\s]+/).map(tag => tag.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCardAttack(attack) {
  const val = Number(attack);
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.floor(val));
}

function normalizeCardEffects(effects) {
  return Array.isArray(effects) ? effects : [];
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
