/**
 * socket-sync.js v1.0
 * Socket.io ベースのマルチプレイヤー同期
 * Photon の代替実装
 */

// ===== Socket.io クライアント初期化 =====

let _socket = null;
let _isConnected = false;
let _isInRoom = false;
let _myRole = null;
let _callbacks = {};
let _roomId = null;
let _roomName = null;

/**
 * @param {Object} callbacks
 *   onStateChange(stateName)
 *   onJoinedRoom(roomName, role)
 *   onOpponentJoined(actor)
 *   onOpponentLeft(actor)
 *   onRoomList(rooms)
 */
function initSocket(callbacks = {}) {
  _callbacks = callbacks;

  // Socket.io スクリプトが読み込まれているか確認
  if (typeof io === "undefined") {
    console.error("[Socket] Socket.io が読み込まれていません。");
    return;
  }

  // サーバーURL を決定
  let serverUrl = window.location.origin;
  
  // GitHub Pages の場合はローカルサーバーに接続
  if (window.location.hostname.includes("github.io")) {
    serverUrl = "http://localhost:5000";
    console.warn("[Socket] GitHub Pages detected. Connecting to local server:", serverUrl);
  }

  // Socket.io に接続
  _socket = io(serverUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  console.log("[Socket] Connecting to server:", serverUrl);

  // ===== コールバック =====

  _socket.on('connect', () => {
    console.log("[Socket] Connected to server");
    _isConnected = true;
    if (_callbacks.onStateChange) _callbacks.onStateChange("connected");
  });

  _socket.on('disconnect', () => {
    console.log("[Socket] Disconnected from server");
    _isConnected = false;
    _isInRoom = false;
    _myRole = null;
    if (_callbacks.onStateChange) _callbacks.onStateChange("disconnected");
  });

  _socket.on('connect_error', (error) => {
    console.error("[Socket] Connection error:", error);
    if (_callbacks.onStateChange) _callbacks.onStateChange("error");
  });

  _socket.on('room_created', (data) => {
    console.log("[Socket] Room created:", data);
    _roomId = data.room_id;
    _roomName = data.room_name;
    _myRole = data.role;
    _isInRoom = true;
    window.myRole = _myRole;
    document.body.dataset.role = _myRole;
    if (_callbacks.onJoinedRoom) _callbacks.onJoinedRoom(_roomName, _myRole);
  });

  _socket.on('room_joined', (data) => {
    console.log("[Socket] Room joined:", data);
    _roomId = data.room_id;
    _roomName = data.room_name;
    _myRole = data.role;
    _isInRoom = true;
    window.myRole = _myRole;
    document.body.dataset.role = _myRole;
    if (_callbacks.onJoinedRoom) _callbacks.onJoinedRoom(_roomName, _myRole);
  });

  _socket.on('player_joined', (data) => {
    console.log("[Socket] Player joined:", data);
    if (data.role !== _myRole) {
      if (_callbacks.onOpponentJoined) {
        _callbacks.onOpponentJoined({
          name: data.username,
          role: data.role
        });
      }
    }
  });

  _socket.on('opponent_left', (data) => {
    console.log("[Socket] Opponent left:", data);
    _isInRoom = false;
    if (_callbacks.onOpponentLeft) {
      _callbacks.onOpponentLeft({
        name: "Opponent",
        role: _myRole === "player1" ? "player2" : "player1"
      });
    }
  });

  _socket.on('room_list', (data) => {
    console.log("[Socket] Room list received:", data.rooms);
    if (_callbacks.onRoomList) _callbacks.onRoomList(data.rooms);
  });

  _socket.on('player_ready_status', (data) => {
    console.log("[Socket] Player ready status:", data);
    if (_callbacks.onPlayerReady) _callbacks.onPlayerReady(data);
  });

  _socket.on('both_ready', (data) => {
    console.log("[Socket] Both players ready!");
    if (_callbacks.onBothReady) _callbacks.onBothReady(data);
  });

  _socket.on('receive_game_state', (data) => {
    console.log("[Socket] Received game state");
    if (_callbacks.onReceiveGameState) _callbacks.onReceiveGameState(data);
  });

  _socket.on('receive_action', (data) => {
    console.log("[Socket] Received action");
    if (_callbacks.onReceiveAction) _callbacks.onReceiveAction(data);
  });

  _socket.on('error', (data) => {
    console.error("[Socket] Error:", data.message);
    if (_callbacks.onError) _callbacks.onError(data.message);
  });
}

// ===== ルーム操作 =====

function socketCreateRoom(roomName) {
  if (!_socket || !_isConnected) {
    console.error("[Socket] Not connected to server");
    return;
  }
  const username = localStorage.getItem("username") || "Player";
  console.log("[Socket] Creating room:", roomName || "auto-generated");
  _socket.emit('create_room', {
    room_name: roomName || "",
    username: username
  });
}

function socketJoinRoom(roomName) {
  if (!_socket || !_isConnected) {
    console.error("[Socket] Not connected to server");
    return;
  }
  if (!roomName || roomName.trim() === "") {
    console.error("[Socket] Room name is required");
    return;
  }
  const username = localStorage.getItem("username") || "Player";
  console.log("[Socket] Joining room:", roomName);
  _socket.emit('join_room', {
    room_name: roomName,
    username: username
  });
}

function socketLeaveRoom() {
  if (!_socket || !_isInRoom) {
    console.error("[Socket] Not in a room");
    return;
  }
  console.log("[Socket] Leaving room");
  _socket.emit('leave_room');
  _isInRoom = false;
  _myRole = null;
  _roomId = null;
  _roomName = null;
}

function socketGetRoomList() {
  if (!_socket || !_isConnected) {
    console.error("[Socket] Not connected to server");
    return;
  }
  _socket.emit('get_room_list');
}

function socketIsConnected() {
  return _isConnected;
}

function socketIsInRoom() {
  return _isInRoom;
}

function socketIsHost() {
  return _myRole === "player1";
}

// ===== ゲーム状態送信 =====

function socketSendPlayerState(customData = null) {
  if (!_socket || !_isInRoom) return;
  const myRole = _myRole;
  if (!myRole) return;

  const dataToUse = customData || (typeof state !== "undefined" ? state[myRole] : null);
  if (!dataToUse) return;

  const { timeLeft: _t, _lastAppliedLv: _lv, ...myData } = dataToUse;
  _socket.emit('send_game_state', {
    type: 'player_state',
    role: myRole,
    data: myData
  });
}

function socketSendMatchData() {
  if (!_socket || !_isInRoom || typeof state === "undefined") return;
  _socket.emit('send_game_state', {
    type: 'match_data',
    data: state.matchData
  });
}

function socketSendFieldCards(fieldData) {
  if (!_socket || !_isInRoom) return;
  const myRole = _myRole;
  if (!myRole) return;
  const myCards = (fieldData || []).filter(c => !c.isDeck || c.owner === myRole);
  _socket.emit('send_game_state', {
    type: 'field_cards',
    owner: myRole,
    cards: myCards
  });
}

function socketSendCardMove(instanceId, x, y) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_action', {
    type: 'card_move',
    instanceId,
    x,
    y
  });
}

function socketSendCardRemove(instanceId) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_action', {
    type: 'card_remove',
    instanceId
  });
}

function socketSendCardVisibility(instanceId, visibility) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_action', {
    type: 'card_visibility',
    instanceId,
    visibility
  });
}

function socketSendGameLog(entry) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_action', {
    type: 'game_log',
    entry
  });
}

function socketSendReset(newState) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_game_state', {
    type: 'reset',
    matchData: newState.matchData
  });
}

function socketSendTimerStart(timerKey, endTimestamp, seq) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('send_action', {
    type: 'timer_start',
    key: timerKey,
    endTimestamp,
    seq
  });
}

function socketMarkReady(isReady) {
  if (!_socket || !_isInRoom) return;
  _socket.emit('mark_ready', {
    ready: isReady
  });
}

// ===== 公開 API =====
window.SocketSync = {
  init:               initSocket,
  createRoom:         socketCreateRoom,
  joinRoom:           socketJoinRoom,
  leaveRoom:          socketLeaveRoom,
  getRoomList:        socketGetRoomList,
  isConnected:        socketIsConnected,
  isInRoom:           socketIsInRoom,
  isHost:             socketIsHost,
  sendPlayerState:    socketSendPlayerState,
  sendMatchData:      socketSendMatchData,
  sendFieldCards:     socketSendFieldCards,
  sendCardMove:       socketSendCardMove,
  sendCardRemove:     socketSendCardRemove,
  sendCardVisibility: socketSendCardVisibility,
  sendGameLog:        socketSendGameLog,
  sendReset:          socketSendReset,
  sendTimerStart:     socketSendTimerStart,
  markReady:          socketMarkReady
};
