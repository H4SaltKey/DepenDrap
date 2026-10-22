(async function() {
  const grid = document.getElementById("soloDeckGrid");
  const message = document.getElementById("soloDeckMessage");
  let selectedId = "";
  await window.loadCardData?.();
  const decks = (() => {
    try { return JSON.parse(localStorage.getItem("deckList") || "[]"); }
    catch { return []; }
  })();
  if (!decks.length) {
    message.textContent = "デッキがありません。先にデッキを作成してください。";
  }
  decks.forEach((deck, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "soloDeck";
    button.dataset.id = deck.id;
    const count = (() => { try { return window.decodeDeck(deck.code || "empty").length; } catch { return 0; } })();
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector("strong").textContent = deck.name || "名称未設定デッキ";
    button.querySelector("span").textContent = `${count}枚`;
    button.addEventListener("click", () => {
      selectedId = deck.id;
      grid.querySelectorAll(".soloDeck").forEach(item => item.classList.toggle("selected", item === button));
      message.textContent = "";
    });
    grid.appendChild(button);
    if (index === 0) button.click();
  });
  document.getElementById("soloStartButton").addEventListener("click", () => {
    const selected = decks.find(deck => deck.id === selectedId);
    if (!selected) {
      message.textContent = "使用するデッキを選択してください。";
      return;
    }
    const username = localStorage.getItem("username") || "プレイヤー";
    const setup = { role: "player1", self: username, username, deckId: selected.id, deckCode: selected.code || "empty", mode: "solo" };
    localStorage.setItem("matchSetup", JSON.stringify(setup));
    localStorage.setItem("deckCode", setup.deckCode);
    localStorage.setItem("gamePlayerKey", "player1");
    localStorage.setItem("gameRoom", `solo_${Date.now()}`);
    localStorage.setItem("soloMode", "true");
    sessionStorage.removeItem("wasInGame");
    location.href = "game.html";
  });
})();
