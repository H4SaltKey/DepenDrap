/**
 * roomWatcher.js
 * ルームの状態を監視して、両プレイヤーが退出したかチェック
 */
window.roomWatcherUnsubscribe = window.roomWatcherUnsubscribe || null;
window.playerDiceWatcherUnsubscribe = window.playerDiceWatcherUnsubscribe || null;
window._bothPlayersConnected = false;

window.setupRoomWatcher = function() {
  if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher", "start");
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom) {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher", "failure", "gameRoom missing");
    console.warn("[Game] ゲームルーム情報がありません");
    return;
  }

  if (!firebaseClient || !firebaseClient.db) {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher", "failure", "firebase db missing");
    console.warn("[Game] Firebase 未初期化 - setupRoomWatcher をスキップ");
    return;
  }

  // Prevent duplicate listeners by cleaning up first
  if (typeof window.roomWatcherUnsubscribe === "function") {
    console.log("[Game] Cleaning up existing roomWatcher before setup");
    window.roomWatcherUnsubscribe();
    window.roomWatcherUnsubscribe = null;
  }

  const myKey   = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const opKey   = myKey === "player1" ? "player2" : "player1";
  const db      = firebaseClient.db;

  const unsubscribe = () => {
    playersRef.off('value', playersListener);
    opStateRef.off('value', opStateListener);
    if (typeof window.phaseWatcherUnsubscribe === "function") window.phaseWatcherUnsubscribe();
    logsRef.off('value', logsListener);
    opCardsRef.off('value', opCardsListener);
    pendingRef.off('value', pendingListener);
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher", "end");
  };

  window.roomWatcherUnsubscribe = unsubscribe;

  if (typeof window.registerWatcher === "function") {
    window.registerWatcher("room", unsubscribe);
  }

  console.log("[Game] ルーム監視開始:", gameRoom, "自分:", myKey);

  // ── 1. players ノード監視（接続/切断・username 取得）──────────────────
  const playersRef = db.ref(`rooms/${gameRoom}/players`);
  const playersListener = playersRef.on('value', (snap) => {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.players", "start");
    if (!snap) return;
    const players = snap.val() || {};
    if (players.player1?.username) state.player1.username = players.player1.username;
    if (players.player2?.username) state.player2.username = players.player2.username;
    const prevBothConnected = !!window._bothPlayersConnected;
    window._bothPlayersConnected = !!players.player1 && !!players.player2;
    if (typeof window.notifySyncGate === "function") {
      window.notifySyncGate("playersReady", window._bothPlayersConnected);
    }
    if (prevBothConnected !== window._bothPlayersConnected && typeof window.traceFlow === "function") {
      window.traceFlow("bothConnected", "set", window._bothPlayersConnected);
    }
    applyInteractionLockState();



    const playerCount = Object.keys(players).length;
    if (playerCount === 0) {
      console.log("[Game] 両プレイヤーが退出");
      resetAllGameVariables();
      stopAllWatchers();
      firebaseClient.resetRoomGameState(gameRoom);
    }
    if (typeof update === "function") {
      update();
      if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.players", "success", "update");
    } else {
      if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.players", "failure", "update missing");
    }
  });

  // ── 2. 相手の playerState 監視（相手のデータのみ受信）────────────────
  const opStateRef = db.ref(`rooms/${gameRoom}/playerState/${opKey}`);
  const opStateListener = opStateRef.on('value', (snap) => {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.opState", "start");
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
    if (typeof update === "function") update();
    else if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.opState", "failure", "update missing");
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.opState", "end");
  });

  // ── 3. matchData 監視（共有ターン情報）──────────────────────────────
  if (typeof window.setupPhaseWatcher === "function") window.setupPhaseWatcher(gameRoom);
  if (typeof window.notifySyncGate === "function") window.notifySyncGate("roomWatcherReady");

  // ── 4. logs 監視──────────────────────────────────────────────────
  const logsRef = db.ref(`rooms/${gameRoom}/logs`);
  const logsListener = logsRef.on('value', (snap) => {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.logs", "start");
    if (!snap || !snap.val()) {
      // ログがクリアされた場合
      state.logs = [];
      if (typeof update === "function") update(true); // skipLogCheck = true
      else if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.logs", "failure", "update missing");
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
    
    if (typeof update === "function") update(true); // skipLogCheck = true（ログ監視からの更新なので、checkAndLogStateChanges をスキップ）
    else if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.logs", "failure", "update missing");
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.logs", "end");
  });

  // ── 5. 相手のフィールドカード監視 ────────────────────────────────
  const opCardsRef = db.ref(`rooms/${gameRoom}/fieldCards/${opKey}`);
  const opCardsListener = opCardsRef.on('value', (snap) => {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.opCards", "start");
    if (!snap || !snap.val()) return;
    const opCards = snap.val();
    // 相手の fieldCards（相手オーナーのカードのみ）を適用。applyFieldCardsFromServer は部分同期時に自席 DOM を消さない。
    if (typeof window.applyFieldCardsFromServer === "function") {
      window.applyFieldCardsFromServer(opCards);
      if (typeof window.organizeHands === "function") window.organizeHands();
      if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.opCards", "success", "applyFieldCardsFromServer");
    } else if (typeof window.traceFlow === "function") {
      window.traceFlow("roomWatcher.opCards", "failure", "applyFieldCardsFromServer missing");
    }
  });

  // ── 6. 相手からの変更リクエスト監視 ──────────────────────────────
  const pendingRef = db.ref(`rooms/${gameRoom}/pendingChange/${opKey}`);
  const pendingListener = pendingRef.on('value', (snap) => {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.pending", "start");
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
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();
    else if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.pending", "failure", "pushMyStateDebounced missing");

    // リクエストをクリア（処理済み）
    firebaseClient.clearChangeRequest(gameRoom, opKey);

    if (typeof update === "function") update();
    else if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.pending", "failure", "update missing");
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher.pending", "end");
  });



  // ── 5. playerDice 監視（ダイスフェーズ専用）──────────────────────
  if (typeof window.setupPlayerDiceWatcher === "function") {
    if (typeof window.traceFlow === "function") window.traceFlow("roomWatcher", "call", "setupPlayerDiceWatcher");
    window.setupPlayerDiceWatcher(gameRoom);
  } else if (typeof window.traceFlow === "function") {
    window.traceFlow("roomWatcher", "failure", "setupPlayerDiceWatcher missing");
  }
};

window.stopAllWatchers = function() {
  if (typeof window.roomWatcherUnsubscribe === "function") { window.roomWatcherUnsubscribe(); window.roomWatcherUnsubscribe = null; }
  if (typeof window.playerDiceWatcherUnsubscribe === "function") { window.playerDiceWatcherUnsubscribe(); window.playerDiceWatcherUnsubscribe = null; }
  if (typeof window.phaseWatcherUnsubscribe === "function") { window.phaseWatcherUnsubscribe(); window.phaseWatcherUnsubscribe = null; }
  if (typeof window.clearAllWatchers === "function") window.clearAllWatchers();
  window._bothPlayersConnected = false;
  applyInteractionLockState();
};

// ===== 再接続ハンドラ =====
// Firebase SDK は自動再接続するが、onDisconnect().remove() でプレイヤーノードが
// 削除されているため、再接続時に自分を players に再登録する必要がある。
(function setupReconnectHandler() {
  let _wasDisconnected = false;
  let _reconnectTimer = null;

  firebaseClient.on('disconnected', () => {
    _wasDisconnected = true;
    console.log("[RoomWatcher] 切断を検知。再接続を待機中...");
  });

  firebaseClient.on('connected', () => {
    if (!_wasDisconnected) return;
    _wasDisconnected = false;

    // 複数回発火しないようにデバウンス
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(async () => {
      _reconnectTimer = null;
      const gameRoom = localStorage.getItem("gameRoom");
      const myKey = localStorage.getItem("gamePlayerKey") || window.myRole || "player1";
      if (!gameRoom || !firebaseClient?.db) return;

      console.log("[RoomWatcher] 再接続。players ノードに再登録します:", myKey);

      try {
        // players ノードに自分を再登録（onDisconnect で削除されていた場合の復旧）
        const playerRef = firebaseClient.db.ref(`rooms/${gameRoom}/players/${myKey}`);
        const snap = await playerRef.once('value');
        if (!snap.exists()) {
          await playerRef.set({
            username: window.myUsername || localStorage.getItem("username") || myKey,
            sessionId: firebaseClient.sessionId,
            ready: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
          });
          console.log("[RoomWatcher] ✅ players 再登録完了:", myKey);
        }

        // onDisconnect を再設定（再接続後はリセットされるため）
        await firebaseClient.setupOnDisconnect(gameRoom, myKey);

        // 自分の状態を再送信（切断中の変更を相手に届ける）
        if (typeof pushMyStateDebounced === "function") {
          pushMyStateDebounced();
        }

        // watcher が生きているか確認し、死んでいれば再設定
        // Firebase SDK は自動再接続後にリスナーを自動復旧するが、
        // 念のため roomWatcher が登録されていなければ再設定する
        if (!window._activeWatchers?.room) {
          console.log("[RoomWatcher] watcher が未登録のため再設定します");
          window.setupRoomWatcher();
        }
      } catch (e) {
        console.warn("[RoomWatcher] 再接続処理エラー:", e.message);
      }
    }, 1500); // 1.5秒待ってから実行（Firebase の自動再接続が完了するのを待つ）
  });
})();

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
