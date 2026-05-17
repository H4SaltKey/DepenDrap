/**
 * timerUI.js
 * タイマーの表示更新を担当
 */

let _lastDiceStatusText = null;

window.onTimerTick = function() {
  if (typeof GameTimer === "undefined") return;

  const statusMsg = document.getElementById("dice-status-msg");
  if (!statusMsg) return;

  const diceRemaining = GameTimer.getRemainingMs('dice');

  let newText = null;

  if (diceRemaining > 0) {
    const secs = Math.ceil(diceRemaining / 1000);
    newText = `COUNTDOWN:${secs}`;
    if (_lastDiceStatusText !== newText) {
      _lastDiceStatusText = newText;
      statusMsg.innerHTML = `<span style="color:#00ffcc;display:inline-block;">ダイスロール開始まで: ${secs} 秒</span>`;
    }
  } else if (typeof state !== "undefined" && state.matchData?.status === "setup_dice") {
    const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
    const s = state[myKey];
    if (s && (s.diceValue === undefined || s.diceValue < 0)) {
      newText = "PROMPT";
      if (_lastDiceStatusText !== newText) {
        _lastDiceStatusText = newText;
        statusMsg.innerHTML = `<span style="color:#ffcc00;animation:pulse 1s infinite;display:inline-block;">ダイスを振ってください！</span>`;
      }
    } else {
      // 自分がもう振った → 何も書かない（diceWatcher が管理）
      _lastDiceStatusText = null;
    }
  } else {
    // ダイスフェーズ外 → リセット
    _lastDiceStatusText = null;
  }
};
