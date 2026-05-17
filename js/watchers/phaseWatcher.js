/**
 * phaseWatcher.js
 * matchData の変更を監視する
 */

window.setupPhaseWatcher = function(gameRoom) {
  if (!gameRoom || !firebaseClient || !firebaseClient.db) {
    console.warn("[PhaseWatcher] 開始できません");
    return;
  }

  console.log("[PhaseWatcher] 監視開始:", gameRoom);

  const db = firebaseClient.db;
  const matchDataRef = db.ref(`rooms/${gameRoom}/matchData`);

  const listener = (snap) => {
    if (!snap || !snap.val()) return;
    const incoming = snap.val();

    // winner が含まれている場合、stale チェックを行う
    if (incoming.winner) {
      const winnerSetAt = incoming.winnerSetAt || 0;
      const gameStartedAt = window._gameStartedAt || 0;
      const isStale = winnerSetAt < gameStartedAt;
      const isDismissed = !!window._resultDismissed;

      if (isStale || isDismissed) {
        if (isStale) console.warn("[matchDataWatcher] stale winner を無視:", incoming.winner,
          "winnerSetAt=", winnerSetAt, "< gameStartedAt=", gameStartedAt);
        if (isDismissed) console.log("[matchDataWatcher] dismissed winner を無視:", incoming.winner);
        // winner だけ除いて適用
        const { winner: _w, winnerSetAt: _ws, ...rest } = incoming;
        state.matchData = { ...state.matchData, ...rest };
        update();
        return;
      }
    }

    // matchData は丸ごと上書き（ターン権を持つプレイヤーが書いた値が正）
    state.matchData = { ...state.matchData, ...incoming };
    update();
  };

  const unsubscribe = () => {
    matchDataRef.off('value', listener);
  };

  if (typeof window.registerWatcher === "function") {
    window.registerWatcher("phase", unsubscribe);
  }

  // Firebase 監視を開始（この行が抜けていたため待機側に status 変更が届かなかった）
  matchDataRef.on('value', listener);
};
