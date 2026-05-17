/**
 * battlePhase.js
 * バトルフェーズ（ターン終了処理など）
 */

window.handleTurnEnd = async function(skipHandLimitCheck = false) {
  // skipHandLimitCheck が明示的に true でない場合は false として扱う
  // (onclick 等から Event オブジェクトが渡された場合の誤作動防止)
  if (skipHandLimitCheck !== true) skipHandLimitCheck = false;

  if (window.isGameInteractionLocked()) return;
  const m  = state.matchData;
  const me = window.myRole || "player1";

  if (m.turnPlayer !== me) return;
  if (m.winner) return;

  // 手札枚数上限のチェック
  if (!skipHandLimitCheck) {
    const handLimit = (typeof window.getHandLimit === "function") ? window.getHandLimit(me) : 6;
    const myHandCount = (typeof countOwnerHandCardsOnField === "function") ? countOwnerHandCardsOnField(me) : 0;
    if (myHandCount > handLimit) {
      const need = myHandCount - handLimit;
      if (typeof showHandOverflowDiscardModal === "function") {
        showHandOverflowDiscardModal(me, need);
      } else {
        alert(`手札が上限を超えています。${need}枚捨ててください。`);
      }
      return;
    }
  }

  const op          = me === "player1" ? "player2" : "player1";
  const firstPlayer = m.firstPlayer || "player1";

  if (m.turnPlayer === firstPlayer) {
    m.turnPlayer = op;
  } else {
    m.turnPlayer = firstPlayer;
    m.turn += 1;
    if (m.turn > 5) {
      m.turn = 1;
      m.round += 1;
      addGameLog(`[MATCH] 第 \${m.round} ラウンド開始！`);
    }
  }

  const nextPlayerName = m.turnPlayer === "player1"
    ? (state.player1.username || "プレイヤー1")
    : (state.player2.username || "プレイヤー2");
  addGameLog(`[TURN] \${window.myUsername || state[me]?.username || me} がターンを終了。次: \${nextPlayerName}`);

  // 進化の道のターン依存変数をリセット
  state[me].evoContinuousDmgCount = 0;
  state[me].evoBackwaterExpGained = false;
  window._turnDmgHistory = {};

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    // matchData のみ書く（自分の playerState も更新）
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
    if (typeof _getMyStateForSync === "function") {
      await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
    }
  }

  update();
};
