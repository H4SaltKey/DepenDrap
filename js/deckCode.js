function encodeDeck(deck){
  const ids = getDeckCardIds();
  const counts = ids.map(id => deck.filter(cardId => cardId === id).length);
  const countCode = counts.map(count => count.toString(16)).join("");

  return ids.length + "-" + countCode;
}

function decodeDeck(code){
  // 空デッキの特別値
  if(code === "empty") return [];

  const ids = getDeckCardIds();
  const parts = String(code || "").split("-");
  const total = Number(parts[0]);
  const countCode = parts[1] || "";

  if(total !== ids.length){
    throw new Error("OLD_DECK_CODE");
  }

  const deck = [];
  ids.forEach((id, index)=>{
    const count = parseInt(countCode[index] || "0", 16);
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
