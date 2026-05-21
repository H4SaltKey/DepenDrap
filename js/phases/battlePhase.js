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
  const me = (window.getMyRole ? window.getMyRole() : window.myRole || "player1");

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

  // ===== ターン終了前フック =====
  if (Array.isArray(window._beforeTurnEndHooks)) {
    for (const fn of window._beforeTurnEndHooks) {
      try { fn(); } catch (e) { console.warn("[beforeTurnEndHook] error:", e); }
    }
  }

  const op          = me === "player1" ? "player2" : "player1";

  // calcNextTurn（gameRules.js）でターン計算（純粋関数）
  const next = (typeof window.calcNextTurn === "function")
    ? window.calcNextTurn(m)
    : null;

  if (next) {
    m.turnPlayer = next.turnPlayer;
    m.turn       = next.turn;
    m.round      = next.round;
    if (next.roundChanged) {
      addGameLog(`[MATCH] 第 ${m.round} ラウンド開始！`);
    }
  } else {
    // フォールバック（calcNextTurn が未定義の場合）
    const firstPlayer = m.firstPlayer || "player1";
    if (m.turnPlayer === firstPlayer) {
      m.turnPlayer = op;
    } else {
      m.turnPlayer = firstPlayer;
      m.turn += 1;
      if (m.turn > (window.TURNS_PER_ROUND || 5)) {
        m.turn = 1;
        m.round += 1;
        addGameLog(`[MATCH] 第 ${m.round} ラウンド開始！`);
      }
    }
  }

  const nextPlayerName = m.turnPlayer === "player1"
    ? (state.player1.username || "プレイヤー1")
    : (state.player2.username || "プレイヤー2");
  addGameLog(`[TURN] ${window.myUsername || state[me]?.username || me} がターンを終了。次: ${nextPlayerName}`);

  // 進化の道のターン依存変数をリセット
  state[me].evoContinuousDmgCount = 0;
  state[me].evoBackwaterExpGained = false;
  window._turnDmgHistory = {};

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    const matchOk = await firebaseClient.writeMatchData(gameRoom, state.matchData);
    if (!matchOk) {
      console.warn("[handleTurnEnd] writeMatchData 失敗。リトライ済みだが同期できませんでした。");
    }
    if (typeof _getMyStateForSync === "function") {
      const stateOk = await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
      if (!stateOk) {
        console.warn("[handleTurnEnd] writeMyState 失敗。リトライ済みだが同期できませんでした。");
      }
    }
  }

  update();

  // ===== ターン終了後フック =====
  if (Array.isArray(window._afterTurnEndHooks)) {
    for (const fn of window._afterTurnEndHooks) {
      try { fn(); } catch (e) { console.warn("[afterTurnEndHook] error:", e); }
    }
  }
};
