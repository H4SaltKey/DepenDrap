/**
 * ルームの状態を監視して、両プレイヤーが退出したかチェック
 */
let roomWatcherUnsubscribe = null;
let playerDiceWatcherUnsubscribe = null;
window._bothPlayersConnected = false;

function setupRoomWatcher() {
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom) {
    console.warn("[Game] ゲームルーム情報がありません");
    return;
  }

  if (!firebaseClient || !firebaseClient.db) {
    console.warn("[Game] Firebase 未初期化 - setupRoomWatcher をスキップ");
    return;
  }

  if (roomWatcherUnsubscribe) {
    roomWatcherUnsubscribe();
  }
  if (playerDiceWatcherUnsubscribe) {
    playerDiceWatcherUnsubscribe();
  }

  const myKey   = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const opKey   = myKey === "player1" ? "player2" : "player1";
  const db      = firebaseClient.db;

  console.log("[Game] ルーム監視開始:", gameRoom, "自分:", myKey);

  // ── 1. players ノード監視（接続/切断・username 取得）──────────────────
  const playersRef = db.ref(`rooms/${gameRoom}/players`);
  const playersListener = playersRef.on('value', (snap) => {
    if (!snap) return;
    const players = snap.val() || {};
    if (players.player1?.username) state.player1.username = players.player1.username;
    if (players.player2?.username) state.player2.username = players.player2.username;
    window._bothPlayersConnected = !!players.player1 && !!players.player2;
    applyInteractionLockState();

    // 両プレイヤーが接続したら、ready_check から次のフェーズへ
    // 新規入室のみsetup_diceへ遷移。再接続時は既存statusを維持（Firebase復元値を尊重）
    if (window._bothPlayersConnected && state.matchData.status === "ready_check") {
      if (!window._isReload) {
        state.matchData.status = "setup_dice";
        firebaseClient.writeMatchData(gameRoom, state.matchData);
      }
      // 再接続時は何もしない（既にFirebaseから正しいstatusが復元されている）
    }

    const playerCount = Object.keys(players).length;
    if (playerCount === 0) {
      console.log("[Game] 両プレイヤーが退出");
      resetAllGameVariables();
      stopAllWatchers();
      firebaseClient.resetRoomGameState(gameRoom);
    }
    update();
  });

  // ── 2. 相手の playerState 監視（相手のデータのみ受信）────────────────
  const opStateRef = db.ref(`rooms/${gameRoom}/playerState/${opKey}`);
  const opStateListener = opStateRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const opData = snap.val();
    // diceValue は playerDice で管理、username は players で管理するため除外
    // deck の内容は同期しないが、枚数（length）は同期する
    const { diceValue: _d, username: _u, deck: opDeck, deckCount: opDeckCount, ...rest } = opData;
    // 相手のデータを自分の state に反映
    Object.assign(state[opKey], rest);
    
    // backImage も同期
    if (opData.backImage) {
      state[opKey].backImage = opData.backImage;
    }
    
    // デッキ枚数のみ同期（内容は同期しない）
    if (Array.isArray(opDeck)) {
      // 相手のデッキ内容は見えないが、枚数だけ反映
      if (!Array.isArray(state[opKey].deck)) {
        state[opKey].deck = [];
      }
      // 枚数を合わせる（ダミーデータで埋める）
      const currentLen = state[opKey].deck.length;
      const targetLen = opDeck.length;
      if (currentLen < targetLen) {
        // 足りない分を追加
        for (let i = currentLen; i < targetLen; i++) {
          state[opKey].deck.push("DUMMY");
        }
      } else if (currentLen > targetLen) {
        // 多い分を削除
        state[opKey].deck.splice(targetLen);
      }
    }
    if (Number.isFinite(Number(opDeckCount))) {
      state[opKey].deckCount = Number(opDeckCount);
    }
    
    // username は players watcher が管理するため上書きしない
    normalizeState();
    applyLevelStats(opKey);
    updateDeckObject(); // デッキ枚数表示を更新
    update();
  });

  // ── 3. matchData 監視（共有ターン情報）──────────────────────────────
  const matchDataRef = db.ref(`rooms/${gameRoom}/matchData`);
  const matchDataListener = matchDataRef.on('value', (snap) => {
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
  });

  // ── 4. logs 監視──────────────────────────────────────────────────
  const logsRef = db.ref(`rooms/${gameRoom}/logs`);
  const logsListener = logsRef.on('value', (snap) => {
    if (!snap || !snap.val()) {
      // ログがクリアされた場合
      state.logs = [];
      update(true); // skipLogCheck = true
      return;
    }
    const logsObj = snap.val();
    const receivedLogs = Object.values(logsObj);
    
    // 受信したログを state.logs にマージ（重複を避ける）
    receivedLogs.forEach(log => {
      if (!state.logs.includes(log)) {
        state.logs.push(log);
      }
    });
    
    // 最大50件に制限
    if (state.logs.length > 50) {
      state.logs = state.logs.slice(-50);
    }
    
    update(true); // skipLogCheck = true（ログ監視からの更新なので、checkAndLogStateChanges をスキップ）
  });

  // ── 5. 相手のフィールドカード監視 ────────────────────────────────
  const opCardsRef = db.ref(`rooms/${gameRoom}/fieldCards/${opKey}`);
  const opCardsListener = opCardsRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const opCards = snap.val();
    // 相手の fieldCards（相手オーナーのカードのみ）を適用。applyFieldCardsFromServer は部分同期時に自席 DOM を消さない。
    if (typeof window.applyFieldCardsFromServer === "function") {
      window.applyFieldCardsFromServer(opCards);
    }
  });

  // ── 6. 相手からの変更リクエスト監視 ──────────────────────────────  // 相手が自分のステータスを変更したい時、pendingChange/{opKey} に書いてくる
  const pendingRef = db.ref(`rooms/${gameRoom}/pendingChange/${opKey}`);
  const pendingListener = pendingRef.on('value', (snap) => {
    if (!snap || !snap.val()) return;
    const req = snap.val();
    // 自分のステータスへのリクエストのみ処理
    if (req.target !== myKey) return;

    console.log("[PendingChange] 変更リクエスト受信:", req);

    const s = state[myKey];
    if (!s) return;

    // リクエストを適用
    if (req.type === "set") {
      if (req.key === "_bulk" && typeof req.value === "object") {
        // 複数フィールドを一括適用（ダメージ計算後の確定値）
        Object.assign(s, req.value);
      } else {
        s[req.key] = req.value;
      }
    } else if (req.type === "add") {
      s[req.key] = (Number(s[req.key]) || 0) + req.value;
    }

    // 派生ステータスを再計算
    if (req.key === "exp") checkLevelUp(myKey);
    syncDerivedStats(myKey);
    normalizeState();
    applyLevelStats(myKey);

    // 自分のパスに書き込んで確定
    pushMyStateDebounced();

    // リクエストをクリア（処理済み）
    firebaseClient.clearChangeRequest(gameRoom, opKey);

    update();
  });

  // ── クリーンアップ関数 ────────────────────────────────────────────
  roomWatcherUnsubscribe = () => {
    playersRef.off('value', playersListener);
    opStateRef.off('value', opStateListener);
    matchDataRef.off('value', matchDataListener);
    logsRef.off('value', logsListener);
    opCardsRef.off('value', opCardsListener);
    pendingRef.off('value', pendingListener);
    roomWatcherUnsubscribe = null;
  };

  // ── 5. playerDice 監視（ダイスフェーズ専用）──────────────────────
  setupPlayerDiceWatcher(gameRoom);
}

function stopAllWatchers() {
  if (roomWatcherUnsubscribe) { roomWatcherUnsubscribe(); roomWatcherUnsubscribe = null; }
  if (playerDiceWatcherUnsubscribe) { playerDiceWatcherUnsubscribe(); playerDiceWatcherUnsubscribe = null; }
  window._bothPlayersConnected = false;
  applyInteractionLockState();
}
window.startSoloGame = async function() {
  if (window._bothPlayersConnected) return;
  window._soloStartMode = true;
  window._bothPlayersConnected = true;
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const op = me === "player1" ? "player2" : "player1";
  if (!state[op].username) state[op].username = "CPU";
  if (state.matchData?.status === "setup_dice" && (state[op].diceValue === undefined || state[op].diceValue < 0)) {
    state[op].diceValue = Math.floor(Math.random() * 100) + 1;
  }
  applyInteractionLockState();
  update();
};

/**
 * playerDice の変更を監視する唯一の場所。
 * ここだけが state.player*.diceValue を更新し update() を呼ぶ。
 *
 * 手順:
 *   1. 片方の値が届く → state に反映 → update() → UI に値表示
 *   2. 両方の値が届く → state に反映 → update() → 結果画面表示
 *      （勝者は選択ボタン、敗者は待機メッセージ）
 *   3. 値が消える（引き分け振り直し）→ state をリセット → update()
 */
function setupPlayerDiceWatcher(gameRoom) {
  if (!gameRoom || !firebaseClient || !firebaseClient.db) {
    console.warn("[DiceWatcher] 開始できません");
    return;
  }

  console.log("[DiceWatcher] 監視開始:", gameRoom);

  const diceRef = firebaseClient.db.ref(`rooms/${gameRoom}/playerDice`);

  const listener = (snapshot) => {
    // snapshot の null チェック
    if (!snapshot) return;

    // ダイスフェーズ以外は無視
    if (state.matchData.status !== "setup_dice") return;

    const raw = snapshot.val() || {};
    const p1 = (raw.player1 !== null && raw.player1 !== undefined && raw.player1 >= 0)
      ? raw.player1 : -1;
    const p2 = (raw.player2 !== null && raw.player2 !== undefined && raw.player2 >= 0)
      ? raw.player2 : -1;

    console.log("[DiceWatcher] 受信 p1:", p1, "p2:", p2);

    // state に反映
    state.player1.diceValue = p1;
    state.player2.diceValue = p2;

    // rolling フェーズ中なら相手の欄を直接更新（DOM が存在する場合）
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
    update();
  };

  diceRef.on('value', listener);

  // クリーンアップ関数を返す（roomWatcherUnsubscribe と同じパターン）
  playerDiceWatcherUnsubscribe = () => {
    diceRef.off('value', listener);
    playerDiceWatcherUnsubscribe = null;
  };
}