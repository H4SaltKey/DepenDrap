function encodeDeck(deck){
  // 新形式 v3: ID と枚数をセットで保存（より短く、順序依存を排除）
  const counts = {};
  deck.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const entries = Object.keys(counts)
    .filter(id => counts[id] > 0)
    .map(id => {
      const count = counts[id];
      return count === 1 ? encodeURIComponent(id) : `${encodeURIComponent(id)}*${count}`;
    });
  return `v3|${entries.join(",")}`;
}

function decodeDeck(code){
  // 空デッキの特別値
  if(code === "empty") return [];
  if(!code) return [];

  const value = String(code);

  // 新形式 v3: id*count, id... のリスト
  if(value.startsWith("v3|")){
    const payload = value.slice(3);
    if(payload === "") return [];
    const deck = [];
    payload.split(",").forEach(item => {
      const [encId, countStr] = item.split("*");
      const id = decodeURIComponent(encId);
      const count = countStr ? parseInt(countStr, 10) : 1;
      if (!id || !Number.isFinite(count) || count <= 0) return;
      for(let i = 0; i < count; i++) deck.push(id);
    });
    return deck;
  }

  // 旧形式 v2: 直接 ID を保持
  if(value.startsWith("v2|")){
    const payload = value.slice(3);
    if(payload === "") return [];
    return payload.split(",").map(part => decodeURIComponent(part));
  }

  // 旧旧形式: cardId の順序に依存するカウントコード
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
