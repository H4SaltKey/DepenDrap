/**
 * diceWatcher.js
 * playerDice の変更を監視する
 */

window.setupPlayerDiceWatcher = function(gameRoom) {
  if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher", "start", { gameRoom });
  if (!gameRoom || !firebaseClient || !firebaseClient.db) {
    if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher", "failure", "missing gameRoom/firebase db");
    console.warn("[DiceWatcher] 開始できません");
    return;
  }

  console.log("[DiceWatcher] 監視開始:", gameRoom);

  const diceRef = firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`);

  const listener = (snapshot) => {
    if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher.callback", "start");
    if (!snapshot) return;

    // ダイスフェーズ以外は無視
    if (state.matchData.status !== "setup_dice") {
      if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher.callback", "return", `status=${state.matchData.status}`);
      return;
    }

    const raw = snapshot.val() || {};
    const p1 = (raw.player1 !== null && raw.player1 !== undefined && raw.player1 >= 0)
      ? raw.player1 : -1;
    const p2 = (raw.player2 !== null && raw.player2 !== undefined && raw.player2 >= 0)
      ? raw.player2 : -1;

    console.log("[DiceWatcher] 受信 p1:", p1, "p2:", p2);

    // state に反映
    state.player1.diceValue = p1;
    state.player2.diceValue = p2;

    // rolling フェーズ中なら相手の欄を直接更新
    const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
    const opKey = playerKey === "player1" ? "player2" : "player1";
    const opDice = opKey === "player1" ? p1 : p2;
    const opEl = document.getElementById(`dice-val-${opKey}`);
    if (opEl) {
      const newText = opDice >= 0 ? String(opDice) : "?";
      if (opEl.textContent !== newText) {
        opEl.style.animation = "none";
        opEl.textContent = newText;
        void opEl.offsetWidth;
        if (opDice >= 0) {
          opEl.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
        }
      }
    }

    // ステータスメッセージも更新
    const statusMsg = document.getElementById("dice-status-msg");
    if (statusMsg) {
      const p1Name = state.player1.username || "Player1";
      const p2Name = state.player2.username || "Player2";
      if (p1 >= 0 && p2 < 0) {
        statusMsg.innerHTML = `<span style="color:#00ffcc;animation:pulse 2s infinite;display:inline-block;">${p2Name} がダイスを振るのを待っています...</span>`;
      } else if (p2 >= 0 && p1 < 0) {
        statusMsg.innerHTML = `<span style="color:#e24a4a;animation:pulse 2s infinite;display:inline-block;">${p1Name} がダイスを振るのを待っています...</span>`;
      }
    }

    // UI を更新
    if (typeof update === "function") {
      update();
      if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher.callback", "success", "update");
    } else if (typeof window.traceFlow === "function") {
      window.traceFlow("diceWatcher.callback", "failure", "update missing");
    }
  };

  diceRef.on('value', listener);

  const unsubscribe = () => {
    diceRef.off('value', listener);
    if (typeof window.traceFlow === "function") window.traceFlow("diceWatcher", "end");
  };

  window.playerDiceWatcherUnsubscribe = unsubscribe;

  if (typeof window.registerWatcher === "function") {
    window.registerWatcher("dice", unsubscribe);
  }
};
