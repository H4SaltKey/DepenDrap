/**
 * photon-sync.js  v2.0
 * GitHub Pages + Photon Realtime による完全オンライン対応。
 * serve_secure.py を完全廃止し、全通信を Photon に移行。
 *
 * 設計方針：
 *   - 既存の state 構造・UI・ロジックを変更しない
 *   - saveImmediate / saveDebounced / saveFieldCards → Photon RaiseEvent に差し替え
 *   - Room CustomProperties で状態をキャッシュ（再接続・途中参加対応）
 *   - ActorNumber 最小 = player1（ホスト）、もう一方 = player2
 */

// ===== Photon イベントコード =====
const EV = {
  PLAYER_STATE:    1,  // 自分のステータス変化（HP/EXP/etc）
  MATCH_DATA:      2,  // matchData 変化（ターン/ダイス/etc）
  FIELD_CARDS:     3,  // フィールドカード全体（自分のカードのみ）
  CARD_MOVE:       4,  // カード1枚の移動（高頻度）
  CARD_REMOVE:     5,  // カード削除
  CARD_VISIBILITY: 6,  // カード表示状態変化
  GAME_LOG:        7,  // ゲームログ追加
  RESET:           8,  // 盤面リセット
  TIMER_START:     9,  // タイマー開始（endTimestamp 同期）
  FULL_STATE:      10, // 全状態送信（入室直後・再接続）
};

// ==========================================
// 1. Photon 初期設定
// ==========================================
const PHOTON_APP_ID      = "50e5751a-bf8b-41db-8059-dd637bbe0076";
const PHOTON_APP_VERSION = "1.0";
const PHOTON_REGION      = "jp"; // jp / eu / us / asia

// ===== 内部状態 =====
let _client   = null;
let _isHost   = false;
let _callbacks = {};  // 外部コールバック

// ===== 初期化 =====
/**
 * @param {Object} callbacks
 *   onStateChange(stateName)
 *   onJoinedRoom(roomName, role)
 *   onOpponentJoined(actor)
 *   onOpponentLeft(actor)
 *   onRoomList(rooms)
 */
function initPhoton(callbacks = {}) {
  _callbacks = callbacks;

  if (typeof Photon === "undefined") {
    console.error("[Photon] SDK が読み込まれていません。window.Photon is undefined.");
    return;
  }
  
  // 互換性レイヤー: SDK によっては Photon.LoadBalancing にクラスがある
  if (!Photon.Realtime && Photon.LoadBalancing) {
    console.log("[Photon] Using LoadBalancing namespace instead of Realtime.");
    Photon.Realtime = Photon.LoadBalancing;
  }

  if (!Photon.Realtime || !Photon.Realtime.LoadBalancingClient) {
    console.error("[Photon] LoadBalancingClient が見つかりません。SDK の形式が正しくない可能性があります。");
    console.log("[Photon] Available namespaces:", Object.keys(Photon));
    return;
  }

  _client = new Photon.Realtime.LoadBalancingClient(
    Photon.ConnectionProtocol.Wss,
    PHOTON_APP_ID,
    PHOTON_APP_VERSION
  );
  console.log("[Photon] Initializing with AppID:", PHOTON_APP_ID.substring(0, 8) + "...");

  // ===== コールバック =====

  _client.onStateChange = (stateCode) => {
    const name = Photon.Realtime.LoadBalancingClient.StateToName(stateCode);
    console.log("[Photon] State:", name);
    if (name === "ConnectingToMasterserver") console.log("[Photon] connecting...");
    if (name === "ConnectedToMaster") console.log("[Photon] connected");
    if (_callbacks.onStateChange) _callbacks.onStateChange(name);
  };

  _client.onConnectedToMaster = () => {
    console.log("[Photon] Connected to Master");
    // ロビーに参加してルーム一覧を取得
    _client.joinLobby();
  };

  _client.onRoomListUpdate = () => {
    const rooms = _client.availableRooms();
    if (_callbacks.onRoomList) _callbacks.onRoomList(rooms);
  };

  _client.onJoinRoom = () => {
    const room   = _client.currentRoom;
    const actors = room.getActors();
    const minNr  = Math.min(...actors.map(a => a.actorNr));
    _isHost = (_client.myActor().actorNr === minNr);

    window.myRole     = _isHost ? "player1" : "player2";
    window.myUsername = _client.myActor().name || localStorage.getItem("username") || "Player";

    if (_isHost) {
      console.log("[Photon] room created");
    }
    console.log("[Photon] joined room");
    console.log(`[Photon] Joined: ${room.name}, role: ${window.myRole}, host: ${_isHost}`);

    if (typeof applyRotationVars === "function") applyRotationVars();
    document.body.dataset.role = window.myRole;

    // Room CustomProperties から状態を復元（再接続・途中参加）
    _restoreFromRoomProps();

    if (_callbacks.onJoinedRoom) _callbacks.onJoinedRoom(room.name, window.myRole);
  };

  _client.onActorJoin = (actor) => {
    console.log("[Photon] Actor joined:", actor.actorNr, actor.name);
    if (_callbacks.onOpponentJoined) _callbacks.onOpponentJoined(actor);
    // 相手が入室したら自分の全状態を送る
    _sendFullState();
  };

  _client.onActorLeave = (actor, cleanup) => {
    console.log("[Photon] Actor left:", actor.actorNr);
    if (_callbacks.onOpponentLeft) _callbacks.onOpponentLeft(actor);
  };

  _client.onEvent = (code, content, actorNr) => {
    _handleEvent(code, content, actorNr);
  };

  _client.onError = (errorCode, errorMsg) => {
    console.error("[Photon] operation error:", errorCode, errorMsg);
    // 状態（state）とエラーは同一扱いしないため、ここで onStateChange を呼ばない
  };

  _client.onOperationResponse = (errorCode, errorMsg, code, content) => {
    if (errorCode !== 0) {
      console.error("[Photon] operation error:", errorCode, errorMsg, "Code:", code);
    }
  };

  // ユーザー名をセット
  const name = localStorage.getItem("username") || "Player";
  if (_client.myActor()) {
    _client.myActor().setName(name);
  }

  // Photon Cloud に接続
  console.log("[Photon] connecting...");
  console.log("[Photon] Connecting to region:", PHOTON_REGION);
  _client.connectToRegionMaster(PHOTON_REGION);
}

// ===== ルーム操作 =====

function photonCreateRoom(roomName) {
  if (!_client) return;
  if (!_client.isConnectedToMaster()) {
    console.error("[Photon] Cannot create room: Not connected to master.");
    return;
  }
  console.log("[Photon] creating room...");
  
  const opts = {
    maxPlayers: 2,
    isVisible: true,
    isOpen: true
  };
  // 部屋名が空の場合はクライアント側で確実に生成して渡す（SDKのGUID同期バグ回避のため）
  const finalRoomName = roomName || _genRoomName();
  _client.createRoom(finalRoomName, opts);
}

function photonJoinRoom(roomName) {
  if (!_client) return;
  if (!_client.isConnectedToMaster()) {
    console.error("[Photon] Cannot join room: Not connected to master.");
    return;
  }
  console.log("[Photon] joining room...");
  _client.joinRoom(roomName);
}

function photonLeaveRoom() {
  if (!_client) return;
  _client.leaveRoom();
  window.myRole = null;
  _isHost = false;
}

function photonGetRoomList() {
  if (!_client) return [];
  return _client.availableRooms() || [];
}

function photonIsConnected() {
  return _client !== null && _client.isJoinedToRoom();
}

function photonIsHost() { return _isHost; }

// ===== イベント送信 =====

/** 自分のプレイヤーステータスを送信（timeLeft は除外） */
function photonSendPlayerState(customData = null) {
  if (!photonIsConnected()) return;
  const myRole = window.myRole;
  if (!myRole) return;

  const dataToUse = customData || (typeof state !== "undefined" ? state[myRole] : null);
  if (!dataToUse) return;

  const { timeLeft: _t, _lastAppliedLv: _lv, ...myData } = dataToUse;
  _raise(EV.PLAYER_STATE, { role: myRole, data: myData });

  // Room CustomProperties にキャッシュ（再接続対応）
  _setRoomProp(`ps_${myRole}`, JSON.stringify(myData));
}

/** matchData を送信 */
function photonSendMatchData() {
  if (!photonIsConnected() || typeof state === "undefined") return;
  _raise(EV.MATCH_DATA, state.matchData);
  _setRoomProp("matchData", JSON.stringify(state.matchData));
}

/** フィールドカード全体を送信（自分のカードのみ） */
function photonSendFieldCards(fieldData) {
  if (!photonIsConnected()) return;
  const myRole = window.myRole;
  if (!myRole) return;
  const myCards = (fieldData || []).filter(c => !c.isDeck || c.owner === myRole);
  _raise(EV.FIELD_CARDS, { owner: myRole, cards: myCards });
}

/** カード1枚の移動（高頻度） */
function photonSendCardMove(instanceId, x, y) {
  if (!photonIsConnected()) return;
  _raise(EV.CARD_MOVE, { instanceId, x, y });
}

/** カード削除 */
function photonSendCardRemove(instanceId) {
  if (!photonIsConnected()) return;
  _raise(EV.CARD_REMOVE, { instanceId });
}

/** カード表示状態変化 */
function photonSendCardVisibility(instanceId, visibility) {
  if (!photonIsConnected()) return;
  _raise(EV.CARD_VISIBILITY, { instanceId, visibility });
}

/** ゲームログ */
function photonSendGameLog(entry) {
  if (!photonIsConnected()) return;
  _raise(EV.GAME_LOG, { entry });
}

/** 盤面リセット */
function photonSendReset(newState) {
  if (!photonIsConnected()) return;
  _raise(EV.RESET, { matchData: newState.matchData });
  // Room CustomProperties もリセット
  const props = {
    matchData: JSON.stringify(newState.matchData),
    ps_player1: null,
    ps_player2: null
  };
  _client.currentRoom.setCustomProperties(props);
}

/** タイマー開始（endTimestamp 同期） */
function photonSendTimerStart(timerKey, endTimestamp, seq) {
  if (!photonIsConnected()) return;
  _raise(EV.TIMER_START, { key: timerKey, endTimestamp, seq });
}

// ===== イベント受信 =====

function _handleEvent(code, content, actorNr) {
  // 自分が送ったイベントは無視
  if (_client && actorNr === _client.myActor().actorNr) return;

  switch (code) {

    case EV.PLAYER_STATE: {
      const { role, data } = content;
      if (!role || role === window.myRole) break;
      
      // state がなくても外部から参照できるようにグローバルに保持
      if (!window._photonPlayerData) window._photonPlayerData = {};
      window._photonPlayerData[role] = data;

      if (typeof state !== "undefined" && state[role]) {
        const { timeLeft: _, ...rest } = data;
        state[role] = { ...state[role], ...rest };
        if (typeof normalizeState    === "function") normalizeState();
        if (typeof applyLevelStats   === "function") applyLevelStats(role);
        if (typeof update            === "function") update();
      }
      break;
    }

    case EV.MATCH_DATA: {
      const md = content;
      if (!md || typeof state === "undefined") break;
      const myRole = window.myRole;
      const iAmTurn = (md.turnPlayer === myRole);

      state.matchData = {
        ...state.matchData,
        round: md.round, turn: md.turn,
        turnPlayer: md.turnPlayer, status: md.status,
        dice: md.dice, winner: md.winner, firstPlayer: md.firstPlayer,
        diceTimeLeft: md.diceTimeLeft, choiceTimeLeft: md.choiceTimeLeft,
        player1_endTimestamp: md.player1_endTimestamp,
        player1_timerSeq:     md.player1_timerSeq,
        player2_endTimestamp: md.player2_endTimestamp,
        player2_timerSeq:     md.player2_timerSeq,
      };

      if (!iAmTurn && typeof GameTimer !== "undefined") {
        const tp    = md.turnPlayer;
        const endTs = md[tp + '_endTimestamp'];
        const seq   = md[tp + '_timerSeq'] || 0;
        if (endTs) GameTimer.applyFromServer(tp, endTs, seq, false, null);
      }

      if (typeof update === "function") update();
      break;
    }

    case EV.FIELD_CARDS: {
      const { owner, cards } = content;
      if (owner === window.myRole) break;
      if (typeof applyFieldCardsFromServer === "function") applyFieldCardsFromServer(cards);
      break;
    }

    case EV.CARD_MOVE: {
      const { instanceId, x, y } = content;
      if (typeof findFieldElementByInstanceId !== "function") break;
      const el = findFieldElementByInstanceId(instanceId);
      if (el && el.dataset.owner !== window.myRole) {
        const lx = typeof toLocalX === "function" ? toLocalX(x) : x;
        const ly = typeof toLocalY === "function" ? toLocalY(y) : y;
        el.style.left = lx + "px";
        el.style.top  = ly + "px";
        el.dataset.x  = lx;
        el.dataset.y  = ly;
      }
      break;
    }

    case EV.CARD_REMOVE: {
      const { instanceId } = content;
      if (typeof findFieldElementByInstanceId !== "function") break;
      const el = findFieldElementByInstanceId(instanceId);
      if (el && el.dataset.owner !== window.myRole) el.remove();
      break;
    }

    case EV.CARD_VISIBILITY: {
      const { instanceId, visibility } = content;
      if (typeof findFieldElementByInstanceId !== "function") break;
      const el = findFieldElementByInstanceId(instanceId);
      if (el) {
        el.dataset.visibility = visibility;
        if (typeof applyCardFace === "function") applyCardFace(el, visibility);
      }
      break;
    }

    case EV.GAME_LOG: {
      const { entry } = content;
      if (!entry || typeof state === "undefined") break;
      if (!state.logs.includes(entry)) {
        state.logs.push(entry);
        if (state.logs.length > 50) state.logs.shift();
        if (typeof updateGameLogs === "function") updateGameLogs(state.logs);
      }
      break;
    }

    case EV.RESET: {
      const { matchData } = content;
      if (typeof state !== "undefined" && matchData) state.matchData = matchData;
      // 両プレイヤーのステータスをリセット（HP/EXP等）
      if (typeof state !== "undefined") {
        ["player1", "player2"].forEach(owner => {
          if (typeof resetPlayerState === "function") {
            resetPlayerState(owner);
          }
        });
      }
      if (typeof GameTimer !== "undefined") {
        ["player1","player2","dice","choice"].forEach(k => GameTimer.stop(k));
      }
      if (typeof initDeckFromCode  === "function") initDeckFromCode();
      if (typeof shuffleDeck       === "function") shuffleDeck();
      if (typeof createDeckObject  === "function") createDeckObject(true);
      if (typeof update            === "function") update();
      break;
    }

    case EV.TIMER_START: {
      const { key, endTimestamp, seq } = content;
      if (typeof GameTimer !== "undefined") {
        GameTimer.applyFromServer(key, endTimestamp, seq, false, null);
      }
      break;
    }

    case EV.FULL_STATE: {
      // 相手の全状態を受け取る（入室直後・再接続）
      const { role, playerData, matchData, fieldCards } = content;
      if (!role || role === window.myRole || typeof state === "undefined") break;
      if (playerData) {
        const { timeLeft: _, ...rest } = playerData;
        state[role] = { ...state[role], ...rest };
      }
      if (matchData) {
        state.matchData = { ...state.matchData, ...matchData };
        if (typeof GameTimer !== "undefined") {
          ["player1","player2"].forEach(tp => {
            const endTs = matchData[tp + '_endTimestamp'];
            const seq   = matchData[tp + '_timerSeq'] || 0;
            if (endTs && !GameTimer.serialize(tp)) {
              GameTimer.applyFromServer(tp, endTs, seq, false, null);
            }
          });
        }
      }
      if (fieldCards && typeof applyFieldCardsFromServer === "function") {
        applyFieldCardsFromServer(fieldCards);
      }
      if (typeof normalizeState  === "function") normalizeState();
      if (typeof applyLevelStats === "function") {
        applyLevelStats("player1");
        applyLevelStats("player2");
      }
      if (typeof update === "function") update();
      break;
    }
  }
}

// ===== 再接続・途中参加時の状態復元 =====

function _restoreFromRoomProps() {
  if (!photonIsConnected() || typeof state === "undefined") return;
  const props  = _client.currentRoom.customProperties || {};
  const myRole = window.myRole;
  const opRole = myRole === "player1" ? "player2" : "player1";

  // 相手のプレイヤーデータ
  try {
    const raw = props[`ps_${opRole}`];
    if (raw) {
      const { timeLeft: _, ...rest } = JSON.parse(raw);
      state[opRole] = { ...state[opRole], ...rest };
    }
  } catch {}

  // matchData
  try {
    const raw = props["matchData"];
    if (raw) {
      const md = JSON.parse(raw);
      state.matchData = { ...state.matchData, ...md };
      if (typeof GameTimer !== "undefined") {
        ["player1","player2"].forEach(tp => {
          const endTs = md[tp + '_endTimestamp'];
          const seq   = md[tp + '_timerSeq'] || 0;
          if (endTs && !GameTimer.serialize(tp)) {
            GameTimer.applyFromServer(tp, endTs, seq, false, null);
          }
        });
      }
    }
  } catch {}

  if (typeof normalizeState  === "function") normalizeState();
  if (typeof applyLevelStats === "function") {
    applyLevelStats("player1");
    applyLevelStats("player2");
  }
  if (typeof update === "function") update();
}

// ===== 自分の全状態を送信（相手入室時） =====

function _sendFullState() {
  if (!photonIsConnected() || typeof state === "undefined") return;
  const myRole = window.myRole;
  if (!myRole) return;

  const { timeLeft: _t, _lastAppliedLv: _lv, ...playerData } = state[myRole];
  const fieldCards = typeof getFieldData === "function" ? getFieldData() : [];

  _raise(EV.FULL_STATE, {
    role:       myRole,
    playerData,
    matchData:  state.matchData,
    fieldCards: fieldCards.filter(c => !c.isDeck || c.owner === myRole)
  });
}

// ===== Photon ServerTime を ClockSync に統合 =====

function getPhotonServerTime() {
  if (_client && typeof _client.serverTime !== "undefined") {
    return _client.serverTime;
  }
  return Date.now();
}

function overrideClockSyncWithPhoton() {
  if (typeof window.ClockSync === "undefined") return;
  window.ClockSync = {
    ...window.ClockSync,
    now:      () => getPhotonServerTime(),
    isSynced: () => photonIsConnected(),
    sync:     async () => { /* Photon.ServerTime を使うので NTP 不要 */ }
  };
  console.log("[ClockSync] Overridden with Photon.ServerTime");
}

// ===== 内部ヘルパー =====

function _raise(code, content) {
  if (!_client || !_client.isJoinedToRoom()) return;
  const opts = { receivers: 0 }; // 0 = Others
  _client.raiseEvent(code, content, opts);
}

function _setRoomProp(key, value) {
  if (!_client || !_client.isJoinedToRoom()) return;
  const props = {};
  props[key] = value;
  _client.currentRoom.setCustomProperties(props);
}

function _genRoomName() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ===== 公開 API =====
window.PhotonSync = {
  init:               initPhoton,
  createRoom:         photonCreateRoom,
  joinRoom:           photonJoinRoom,
  leaveRoom:          photonLeaveRoom,
  getRoomList:        photonGetRoomList,
  isConnected:        photonIsConnected,
  isHost:             photonIsHost,
  sendPlayerState:    photonSendPlayerState,
  sendMatchData:      photonSendMatchData,
  sendFieldCards:     photonSendFieldCards,
  sendCardMove:       photonSendCardMove,
  sendCardRemove:     photonSendCardRemove,
  sendCardVisibility: photonSendCardVisibility,
  sendGameLog:        photonSendGameLog,
  sendReset:          photonSendReset,
  sendTimerStart:     photonSendTimerStart,
  getServerTime:      getPhotonServerTime,
  overrideClockSync:  overrideClockSyncWithPhoton,
};
