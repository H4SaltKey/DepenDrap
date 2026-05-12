function encodeDeck(deck){
  // 新形式: IDリストを明示的に保存
  return "v2|" + deck.map(id => encodeURIComponent(id)).join(",");
}

function decodeDeck(code){
  // 空デッキの特別値
  if(code === "empty") return [];
  if(!code) return [];

  const value = String(code);

  // 新形式 v2: 直接 ID を保持
  if(value.startsWith("v2|")){
    const payload = value.slice(3);
    if(payload === "") return [];
    return payload.split(",").map(part => decodeURIComponent(part));
  }

  // 旧形式: cardId の順序に依存するカウントコード
  const ids = getDeckCardIds();
  const parts = value.split("-");
  const countCode = parts[1] || "";

  const deck = [];
  ids.forEach((id, index) => {
    const count = parseInt(countCode[index] || "0", 16);
    if (!Number.isFinite(count) || count <= 0) return;
    for(let i = 0; i < count; i++){
      deck.push(id);
    }
  });

  return deck;
}

async function loadDefaultDeckCode(){
  const res = await fetch("data/decks.json");
  const data = await res.json();
  return data.defaultDeckCode;
}
