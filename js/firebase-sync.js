/**
 * firebase-sync.js v1.0
 * Firebase Realtime Database ベースのマルチプレイヤー同期
 */

// ===== Firebase 初期化 =====

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

/**
 * @param {Object} callbacks
 *   onStateChange(stateName)
 *   onJoinedRoom(roomName, role)
 *   onOpponentJoined(actor)
 *   onOpponentLeft(actor)
 *   onRoomList(rooms)
 *   onPlayerReady(data)
 *   onBothReady(data)
 */
function initFirebase(callbacks = {}) {
  _callbacks = callbacks;
  _username = localStorage.getItem("username") || "Player";

  // Firebase 設定（ユーザーが設定する必要があります）
  const firebaseConfig = window.FIREBASE_CONFIG;
  
  if (!firebaseConfig) {
    console.error("[Firebase] Firebase config が設定されていません。");
    console.error("[Firebase] window.FIREBASE_CONFIG を <head> セクションに設定してください。");
    console.error("[Firebase] 例:");
    console.error("[Firebase] <script>");
    console.error("[Firebase]   window.FIREBASE_CONFIG = {");
    console.error("[Firebase]     apiKey: 'YOUR_API_KEY',");
    console.error("[Firebase]     authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',");
    console.error("[Firebase]     databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.asia-northeast1.firebasedatabase.app',");
    console.error("[Firebase]     projectId: 'YOUR_PROJECT_ID',");
    console.error("[Firebase]     storageBucket: 'YOUR_PROJECT_ID.appspot.com',");
    console.error("[Firebase]     messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',");
    console.error("[Firebase]     appId: 'YOUR_APP_ID'");
    console.error("[Firebase]   };");
    console.error("[Firebase] </script>");
    if (_callbacks.onStateChange) _callbacks.onStateChange("error");
    return;
  }

  // Check if firebase SDK is loaded
  if (typeof firebase === 'undefined') {
    console.error("[Firebase] Firebase SDK not loaded. Make sure firebase-app-compat.js and firebase-database-compat.js are loaded.");
    if (_callbacks.onStateChange) _callbacks.onStateChange("error");
    return;
  }

  try {
    const app = firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    _isConnected = true;
    _mySessionId = Math.random().toString(36).substr(2, 9);
    
    console.log("[Firebase] ✅ Initialized successfully");
    console.log("[Firebase] Project ID:", firebaseConfig.projectId);
    if (_callbacks.onStateChange) _callbacks.onStateChange("connected");
    
    // オンライン状態を設定
    setOnlineStatus(true);
    
    // ルーム一覧を監視
    watchRoomList();
  } catch (e) {
    console.error("[Firebase] ❌ Initialization error:", e);
    console.error("[Firebase] Error details:", e.message);
    if (_callbacks.onStateChange) _callbacks.onStateChange("error");
  }
}

// ===== ルーム操作 =====

function createRoom(roomName) {
  if (!_db || !_isConnected) {
    console.error("[Firebase] Not connected");
    return;
  }

  const finalRoomName = (roomName && roomName.trim() !== "") ? roomName : generateRoomName();
  console.log("[Firebase] Creating room:", finalRoomName);

  const roomRef = _db.ref(`rooms/${finalRoomName}`);
  
  roomRef.once('value', (snapshot) => {
    if (snapshot.exists()) {
      console.error("[Firebase] Room already exists");
      return;
    }

    // ルームを作成
    const roomData = {
      name: finalRoomName,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      maxPlayers: 2,
      players: {
        player1: {
          sessionId: _mySessionId,
          username: localStorage.getItem("username") || "Player",
          ready: false,
          joinedAt: firebase.database.ServerValue.TIMESTAMP
        }
      }
    };

    roomRef.set(roomData, (error) => {
      if (error) {
        console.error("[Firebase] Error creating room:", error);
      } else {
        _roomId = finalRoomName;
        _roomName = finalRoomName;
        _myRole = "player1";
        _isInRoom = true;
        window.myRole = _myRole;
        document.body.dataset.role = _myRole;
        
        // ルームを監視
        watchRoom(finalRoomName);
        
        if (_callbacks.onJoinedRoom) {
          _callbacks.onJoinedRoom(finalRoomName, "player1");
        }
      }
    });
  });
}

function joinRoom(roomName) {
  if (!_db || !_isConnected) {
    console.error("[Firebase] Not connected");
    return;
  }

  if (!roomName || roomName.trim() === "") {
    console.error("[Firebase] Room name is required");
    return;
  }

  console.log("[Firebase] Joining room:", roomName);

  const roomRef = _db.ref(`rooms/${roomName}`);
  
  roomRef.once('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.error("[Firebase] Room not found");
      return;
    }

    const roomData = snapshot.val();
    
    // ルームが満杯でないか確認
    if (Object.keys(roomData.players || {}).length >= 2) {
      console.error("[Firebase] Room is full");
      return;
    }

    // player2 として参加
    const playerKey = Object.keys(roomData.players || {}).length === 0 ? "player1" : "player2";
    const playerRef = roomRef.child(`players/${playerKey}`);
    
    playerRef.set({
      sessionId: _mySessionId,
      username: localStorage.getItem("username") || "Player",
      ready: false,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    }, (error) => {
      if (error) {
        console.error("[Firebase] Error joining room:", error);
      } else {
        _roomId = roomName;
        _roomName = roomName;
        _myRole = playerKey;
        _isInRoom = true;
        window.myRole = _myRole;
        document.body.dataset.role = _myRole;
        
        // ルームを監視
        watchRoom(roomName);
        
        if (_callbacks.onJoinedRoom) {
          _callbacks.onJoinedRoom(roomName, playerKey);
        }
      }
    });
  });
}

function leaveRoom() {
  if (!_isInRoom || !_roomName) {
    console.error("[Firebase] Not in a room");
    return;
  }

  console.log("[Firebase] Leaving room:", _roomName);

  const roomRef = _db.ref(`rooms/${_roomName}`);
  const playerRef = roomRef.child(`players/${_myRole}`);
  
  playerRef.remove((error) => {
    if (error) {
      console.error("[Firebase] Error leaving room:", error);
    } else {
      _isInRoom = false;
      _myRole = null;
      _roomId = null;
      _roomName = null;
      
      if (_roomUnsubscribe) {
        _roomUnsubscribe();
        _roomUnsubscribe = null;
      }
    }
  });
}

function markReady(isReady) {
  if (!_isInRoom || !_roomName || !_myRole) {
    console.error("[Firebase] Not in a room");
    return;
  }

  const readyRef = _db.ref(`rooms/${_roomName}/players/${_myRole}/ready`);
  readyRef.set(isReady, (error) => {
    if (error) {
      console.error("[Firebase] Error marking ready:", error);
    }
  });
}

// ===== 監視 =====

function watchRoom(roomName) {
  const roomRef = _db.ref(`rooms/${roomName}`);
  
  _roomUnsubscribe = roomRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.log("[Firebase] Room deleted");
      _isInRoom = false;
      return;
    }

    const roomData = snapshot.val();
    const players = roomData.players || {};
    const playerCount = Object.keys(players).length;

    // プレイヤー状態を確認
    const myPlayerData = players[_myRole];
    if (!myPlayerData) {
      console.log("[Firebase] I was removed from room");
      _isInRoom = false;
      return;
    }

    // 相手の状態を確認
    const opRole = _myRole === "player1" ? "player2" : "player1";
    const opPlayerData = players[opRole];

    if (opPlayerData && !opPlayerData.hasJoined) {
      // 相手が入室
      if (_callbacks.onOpponentJoined) {
        _callbacks.onOpponentJoined({
          name: opPlayerData.username,
          role: opRole
        });
      }
      // フラグを立てる
      _db.ref(`rooms/${roomName}/players/${opRole}/hasJoined`).set(true);
    }

    if (!opPlayerData && opPlayerData !== undefined) {
      // 相手が退室
      if (_callbacks.onOpponentLeft) {
        _callbacks.onOpponentLeft({
          name: "Opponent",
          role: opRole
        });
      }
    }

    // Ready 状態を確認
    if (opPlayerData && opPlayerData.ready !== undefined) {
      if (_callbacks.onPlayerReady) {
        _callbacks.onPlayerReady({
          role: opRole,
          ready: opPlayerData.ready
        });
      }
    }

    // 両者が Ready か確認
    if (myPlayerData.ready && opPlayerData && opPlayerData.ready) {
      if (_callbacks.onBothReady) {
        _callbacks.onBothReady({});
      }
    }
  });
}

function watchRoomList() {
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
            maxPlayers: 2
          });
        }
      });
    }

    if (_callbacks.onRoomList) {
      _callbacks.onRoomList(rooms);
    }
  });
}

// ===== ヘルパー =====

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
      console.error("[Firebase] Error setting online status:", error);
    } else {
      console.log("[Firebase] Online status set to:", isOnline);
      localStorage.setItem("isOnline", isOnline ? "true" : "false");
    }
  });
}

function isConnected() {
  return _isConnected;
}

function isInRoom() {
  return _isInRoom;
}

function isHost() {
  return _myRole === "player1";
}

// ===== 公開 API =====
window.FirebaseSync = {
  init:        initFirebase,
  createRoom:  createRoom,
  joinRoom:    joinRoom,
  leaveRoom:   leaveRoom,
  markReady:   markReady,
  isConnected: isConnected,
  isInRoom:    isInRoom,
  isHost:      isHost,
  setOnlineStatus: setOnlineStatus
};
