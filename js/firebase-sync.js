/**
 * firebase-sync.js v2.0
 * Firebase Realtime Database ベースのマルチプレイヤー同期
 * 最適化版：接続状態監視、タイムアウト処理、オフラインモード対応
 */

// ===== グローバル状態 =====

let _db = null;
let _isConnected = false;
let _isInRoom = false;
let _myRole = null;
let _callbacks = {};
let _roomId = null;
let _roomName = null;
let _mySessionId = null;
let _roomUnsubscribe = null;
let _onlineStatusRef = null;
let _username = null;
let _connectionTimeout = null;
let _lastHeartbeat = null;
let _offlineMode = false;

// ===== Firebase 初期化 =====

/**
 * Firebase を初期化
 * @param {Object} callbacks - コールバック関数
 *   - onStateChange(stateName): 接続状態が変わった
 *   - onJoinedRoom(roomName, role): ルームに参加した
 *   - onOpponentJoined(actor): 相手が参加した
 *   - onOpponentLeft(actor): 相手が退出した
 *   - onRoomList(rooms): ルーム一覧が更新された
 *   - onPlayerReady(data): プレイヤーが Ready になった
 *   - onBothReady(data): 両者が Ready になった
 */
function initFirebase(callbacks = {}) {
  _callbacks = callbacks;
  _username = localStorage.getItem("username") || "Player";
  _mySessionId = Math.random().toString(36).substr(2, 9);

  const firebaseConfig = window.FIREBASE_CONFIG;
  
  if (!firebaseConfig) {
    console.error("[Firebase] ❌ Firebase config が設定されていません");
    console.error("[Firebase] window.FIREBASE_CONFIG を <head> に設定してください");
    _offlineMode = true;
    if (_callbacks.onStateChange) _callbacks.onStateChange("offline");
    return;
  }

  if (typeof firebase === 'undefined') {
    console.error("[Firebase] ❌ Firebase SDK が読み込まれていません");
    console.error("[Firebase] firebase-app-compat.js と firebase-database-compat.js を確認してください");
    _offlineMode = true;
    if (_callbacks.onStateChange) _callbacks.onStateChange("offline");
    return;
  }

  try {
    console.log("[Firebase] 初期化中...");
    const app = firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    
    // 接続状態を監視
    setupConnectionMonitoring();
    
    console.log("[Firebase] ✅ 初期化成功");
    console.log("[Firebase] Project ID:", firebaseConfig.projectId);
    console.log("[Firebase] Database URL:", firebaseConfig.databaseURL);
    
    _isConnected = true;
    _offlineMode = false;
    if (_callbacks.onStateChange) _callbacks.onStateChange("connected");
    
    // オンライン状態を設定
    setOnlineStatus(true);
    
    // ルーム一覧を監視
    watchRoomList();
    
  } catch (e) {
    console.error("[Firebase] ❌ 初期化エラー:", e.message);
    _offlineMode = true;
    if (_callbacks.onStateChange) _callbacks.onStateChange("error");
  }
}

/**
 * Firebase の接続状態を監視
 */
function setupConnectionMonitoring() {
  if (!_db) return;

  const connectedRef = _db.ref('.info/connected');
  connectedRef.on('value', (snapshot) => {
    if (snapshot.val() === true) {
      console.log("[Firebase] ✅ サーバーに接続しました");
      _isConnected = true;
      _offlineMode = false;
      if (_callbacks.onStateChange) _callbacks.onStateChange("connected");
      
      // ハートビート開始
      startHeartbeat();
    } else {
      console.warn("[Firebase] ⚠️ サーバーから切断されました");
      _isConnected = false;
      if (_callbacks.onStateChange) _callbacks.onStateChange("disconnected");
      
      // ハートビート停止
      stopHeartbeat();
    }
  });
}

/**
 * ハートビート（定期的な接続確認）
 */
function startHeartbeat() {
  if (_connectionTimeout) clearInterval(_connectionTimeout);
  
  _connectionTimeout = setInterval(() => {
    if (!_db || !_isConnected) return;
    
    _lastHeartbeat = Date.now();
    const heartbeatRef = _db.ref('.info/connected');
    heartbeatRef.once('value', (snapshot) => {
      if (snapshot.val() !== true) {
        console.warn("[Firebase] ⚠️ ハートビート失敗");
        _isConnected = false;
        if (_callbacks.onStateChange) _callbacks.onStateChange("disconnected");
      }
    }).catch((e) => {
      console.error("[Firebase] ハートビートエラー:", e.message);
    });
  }, 30000); // 30秒ごと
}

function stopHeartbeat() {
  if (_connectionTimeout) {
    clearInterval(_connectionTimeout);
    _connectionTimeout = null;
  }
}

// ===== ルーム操作 =====

function createRoom(roomName) {
  if (!_db || !_isConnected) {
    console.error("[Firebase] ❌ Firebase に接続していません");
    return;
  }

  const finalRoomName = (roomName && roomName.trim() !== "") ? roomName : generateRoomName();
  console.log("[Firebase] ルーム作成中:", finalRoomName);

  const roomRef = _db.ref(`rooms/${finalRoomName}`);
  
  roomRef.once('value', (snapshot) => {
    if (snapshot.exists()) {
      console.error("[Firebase] ❌ ルームは既に存在します");
      return;
    }

    const roomData = {
      name: finalRoomName,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      maxPlayers: 2,
      status: "waiting",
      players: {
        player1: {
          sessionId: _mySessionId,
          username: _username,
          ready: false,
          joinedAt: firebase.database.ServerValue.TIMESTAMP
        }
      }
    };

    roomRef.set(roomData, (error) => {
      if (error) {
        console.error("[Firebase] ❌ ルーム作成エラー:", error.message);
      } else {
        _roomId = finalRoomName;
        _roomName = finalRoomName;
        _myRole = "player1";
        _isInRoom = true;
        window.myRole = _myRole;
        document.body.dataset.role = _myRole;
        
        console.log("[Firebase] ✅ ルーム作成成功:", finalRoomName);
        watchRoom(finalRoomName);
        
        if (_callbacks.onJoinedRoom) {
          _callbacks.onJoinedRoom(finalRoomName, "player1");
        }
      }
    });
  }).catch((e) => {
    console.error("[Firebase] ルーム確認エラー:", e.message);
  });
}

function joinRoom(roomName) {
  if (!_db || !_isConnected) {
    console.error("[Firebase] ❌ Firebase に接続していません");
    return;
  }

  if (!roomName || roomName.trim() === "") {
    console.error("[Firebase] ❌ ルーム名が必要です");
    return;
  }

  console.log("[Firebase] ルーム参加中:", roomName);

  const roomRef = _db.ref(`rooms/${roomName}`);
  
  roomRef.once('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.error("[Firebase] ❌ ルームが見つかりません");
      return;
    }

    const roomData = snapshot.val();
    const playerCount = Object.keys(roomData.players || {}).length;
    
    if (playerCount >= 2) {
      console.error("[Firebase] ❌ ルームは満杯です");
      return;
    }

    const playerKey = playerCount === 0 ? "player1" : "player2";
    const playerRef = roomRef.child(`players/${playerKey}`);
    
    playerRef.set({
      sessionId: _mySessionId,
      username: _username,
      ready: false,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    }, (error) => {
      if (error) {
        console.error("[Firebase] ❌ ルーム参加エラー:", error.message);
      } else {
        _roomId = roomName;
        _roomName = roomName;
        _myRole = playerKey;
        _isInRoom = true;
        window.myRole = _myRole;
        document.body.dataset.role = _myRole;
        
        console.log("[Firebase] ✅ ルーム参加成功:", roomName, "as", playerKey);
        watchRoom(roomName);
        
        if (_callbacks.onJoinedRoom) {
          _callbacks.onJoinedRoom(roomName, playerKey);
        }
      }
    });
  }).catch((e) => {
    console.error("[Firebase] ルーム確認エラー:", e.message);
  });
}

function leaveRoom() {
  if (!_isInRoom || !_roomName) {
    console.error("[Firebase] ❌ ルームに参加していません");
    return;
  }

  console.log("[Firebase] ルーム退出中:", _roomName);

  const roomRef = _db.ref(`rooms/${_roomName}`);
  const playerRef = roomRef.child(`players/${_myRole}`);
  
  playerRef.remove((error) => {
    if (error) {
      console.error("[Firebase] ❌ ルーム退出エラー:", error.message);
    } else {
      _isInRoom = false;
      _myRole = null;
      _roomId = null;
      _roomName = null;
      
      if (_roomUnsubscribe) {
        _roomUnsubscribe();
        _roomUnsubscribe = null;
      }
      
      console.log("[Firebase] ✅ ルーム退出完了");
    }
  });
}

function markReady(isReady) {
  if (!_isInRoom || !_roomName || !_myRole) {
    console.error("[Firebase] ❌ ルームに参加していません");
    return;
  }

  const readyRef = _db.ref(`rooms/${_roomName}/players/${_myRole}/ready`);
  readyRef.set(isReady, (error) => {
    if (error) {
      console.error("[Firebase] ❌ Ready 状態更新エラー:", error.message);
    } else {
      console.log("[Firebase] ✅ Ready 状態:", isReady);
    }
  });
}

// ===== 監視 =====

function watchRoom(roomName) {
  const roomRef = _db.ref(`rooms/${roomName}`);
  
  _roomUnsubscribe = roomRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.log("[Firebase] ⚠️ ルームが削除されました");
      _isInRoom = false;
      return;
    }

    const roomData = snapshot.val();
    const players = roomData.players || {};
    const playerCount = Object.keys(players).length;

    console.log("[Firebase] ルーム状態更新:", roomName, "プレイヤー数:", playerCount);

    // 自分の状態を確認
    const myPlayerData = players[_myRole];
    if (!myPlayerData) {
      console.log("[Firebase] ⚠️ ルームから削除されました");
      _isInRoom = false;
      return;
    }

    // 相手の状態を確認
    const opRole = _myRole === "player1" ? "player2" : "player1";
    const opPlayerData = players[opRole];

    // 相手が参加したか確認
    if (opPlayerData && !opPlayerData.hasJoined) {
      console.log("[Firebase] 相手が参加しました:", opPlayerData.username);
      if (_callbacks.onOpponentJoined) {
        _callbacks.onOpponentJoined({
          name: opPlayerData.username,
          role: opRole
        });
      }
      _db.ref(`rooms/${roomName}/players/${opRole}/hasJoined`).set(true);
    }

    // 相手が退出したか確認
    if (!opPlayerData && opPlayerData !== undefined) {
      console.log("[Firebase] 相手が退出しました");
      if (_callbacks.onOpponentLeft) {
        _callbacks.onOpponentLeft({
          name: "Opponent",
          role: opRole
        });
      }
    }

    // Ready 状態を確認
    if (opPlayerData && opPlayerData.ready !== undefined) {
      console.log("[Firebase] 相手の Ready 状態:", opPlayerData.ready);
      if (_callbacks.onPlayerReady) {
        _callbacks.onPlayerReady({
          role: opRole,
          ready: opPlayerData.ready
        });
      }
    }

    // 両者が Ready か確認
    if (myPlayerData.ready && opPlayerData && opPlayerData.ready) {
      console.log("[Firebase] ✅ 両者が Ready になりました");
      if (_callbacks.onBothReady) {
        _callbacks.onBothReady({});
      }
    }
  }, (error) => {
    console.error("[Firebase] ルーム監視エラー:", error.message);
  });
}

function watchRoomList() {
  if (!_db) return;
  
  const roomsRef = _db.ref('rooms');
  
  roomsRef.on('value', (snapshot) => {
    const rooms = [];
    
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const roomData = childSnapshot.val();
        const playerCount = Object.keys(roomData.players || {}).length;
        
        if (playerCount < 2) {
          rooms.push({
            name: roomData.name,
            playerCount: playerCount,
            maxPlayers: 2,
            status: roomData.status || "waiting"
          });
        }
      });
    }

    console.log("[Firebase] ルーム一覧更新:", rooms.length, "個のルーム");
    if (_callbacks.onRoomList) {
      _callbacks.onRoomList(rooms);
    }
  }, (error) => {
    console.error("[Firebase] ルーム一覧監視エラー:", error.message);
  });
}

// ===== ヘルパー関数 =====

function generateRoomName() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `ROOM_${timestamp}_${random}`;
}

function setOnlineStatus(isOnline) {
  if (!_db || !_username) return;
  
  const statusRef = _db.ref(`players/${_username}/status`);
  const statusData = {
    isOnline: isOnline,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    sessionId: _mySessionId
  };
  
  statusRef.set(statusData, (error) => {
    if (error) {
      console.error("[Firebase] ❌ オンライン状態更新エラー:", error.message);
    } else {
      console.log("[Firebase] ✅ オンライン状態:", isOnline);
      localStorage.setItem("isOnline", isOnline ? "true" : "false");
    }
  });
}

// ===== 状態確認 =====

function isConnected() {
  return _isConnected && !_offlineMode;
}

function isInRoom() {
  return _isInRoom;
}

function isHost() {
  return _myRole === "player1";
}

function getConnectionStatus() {
  if (_offlineMode) return "offline";
  if (_isConnected) return "connected";
  return "disconnected";
}

// ===== 公開 API =====
window.FirebaseSync = {
  init:                initFirebase,
  createRoom:          createRoom,
  joinRoom:            joinRoom,
  leaveRoom:           leaveRoom,
  markReady:           markReady,
  isConnected:         isConnected,
  isInRoom:            isInRoom,
  isHost:              isHost,
  setOnlineStatus:     setOnlineStatus,
  getConnectionStatus: getConnectionStatus
};
