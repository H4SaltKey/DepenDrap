/**
 * timerUI.js
 * タイマーの表示更新を担当
 */

window.onTimerTick = function() {
  if (typeof GameTimer === "undefined") return;

  const diceRemaining = GameTimer.getRemainingMs('dice');
  const statusMsg = document.getElementById("dice-status-msg");
  
  if (statusMsg) {
    if (diceRemaining > 0) {
      statusMsg.innerHTML = `<span style="color:#00ffcc;animation:pulse 2s infinite;display:inline-block;">ダイスロール開始まで: ${Math.ceil(diceRemaining / 1000)} 秒</span>`;
    } else if (state.matchData.status === "setup_dice") {
      const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
      const s = state[myKey];
      if (s && (s.diceValue === undefined || s.diceValue < 0)) {
        statusMsg.innerHTML = `<span style="color:#ffcc00;animation:pulse 1s infinite;display:inline-block;">ダイスを振ってください！</span>`;
      }
    }
  }
};
