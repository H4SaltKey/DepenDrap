/**
 * firebase-client.js v3.0
 * シンプルで堅牢な Firebase Realtime Database クライアント
 * 既存コードの問題を排除した完全新規実装
 */

class FirebaseClient {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.username = null;
    this.sessionId = this.generateSessionId();
    this.listeners = new Map();
    this.connectionCheckInterval = null;
  }

  /**
   * Firebase を初期化
   */
  async initialize(config) {
    if (!config) {
      console.error("[FirebaseClient] Config が必要です");
      return false;
    }

    if (typeof firebase === 'undefined') {
      console.error("[FirebaseClient] Firebase SDK が読み込まれていません");
      return false;
    }

    try {
      console.log("[FirebaseClient] 初期化中...");
      
      // 既に初期化されている場合はスキップ
      let app;
      try {
        app = firebase.app();
      } catch (e) {
        app = firebase.initializeApp(config);
      }

      this.db = firebase.database(app);
      this.username = localStorage.getItem("username") || "Player";

      // 接続状態を監視
      this.setupConnectionMonitoring();

      console.log("[FirebaseClient] ✅ 初期化成功");
      console.log("[FirebaseClient] Project:", config.projectId);
      console.log("[FirebaseClient] Database:", config.databaseURL);

      return true;
    } catch (error) {
      console.error("[FirebaseClient] 初期化エラー:", error.message);
      return false;
    }
  }

  /**
   * 接続状態を監視
   */
  setupConnectionMonitoring() {
    if (!this.db) return;

    const connectedRef = this.db.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
      if (snapshot.val() === true) {
        console.log("[FirebaseClient] ✅ サーバーに接続");
        this.isConnected = true;
        this.emit('connected');
      } else {
        // 切断時はログを出さない（ネットワーク問題の場合、大量のログが出るため）
        this.isConnected = false;
        this.emit('disconnected');
      }
    }, (error) => {
      // 接続エラーは無視（ネットワーク問題の場合、自動的にリトライされる）
      console.debug("[FirebaseClient] 接続監視エラー（無視）:", error.code);
    });
  }

  /**
   * ルームを作成
   */
  async createRoom(roomName) {
    if (!this.db || !this.isConnected) {
      console.error("[FirebaseClient] Firebase に接続していません");
      return null;
    }

    const finalName = roomName || this.generateRoomName();
    console.log("[FirebaseClient] ルーム作成:", finalName);

    try {
      const roomRef = this.db.ref(`rooms/${finalName}`);
      const snapshot = await roomRef.once('value');

      if (snapshot.exists()) {
        console.error("[FirebaseClient] ルームは既に存在します");
        return null;
      }

      const roomData = {
        name: finalName,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'waiting',
        players: {
          player1: {
            username: this.username,
            sessionId: this.sessionId,
            ready: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
          }
        }
      };

      await roomRef.set(roomData);
      console.log("[FirebaseClient] ✅ ルーム作成成功:", finalName);
      return finalName;
    } catch (error) {
      console.error("[FirebaseClient] ルーム作成エラー:", error.message);
      return null;
    }
  }

  /**
   * ルームに参加
   */
  async joinRoom(roomName) {
    if (!this.db || !this.isConnected) {
      console.error("[FirebaseClient] Firebase に接続していません");
      return null;
    }

    if (!roomName) {
      console.error("[FirebaseClient] ルーム名が必要です");
      return null;
    }

    console.log("[FirebaseClient] ルーム参加:", roomName);

    try {
      const roomRef = this.db.ref(`rooms/${roomName}`);
      const snapshot = await roomRef.once('value');

      if (!snapshot.exists()) {
        console.error("[FirebaseClient] ルームが見つかりません");
        return null;
      }

      const roomData = snapshot.val();
      const playerCount = Object.keys(roomData.players || {}).length;

      if (playerCount >= 2) {
        console.error("[FirebaseClient] ルームは満杯です");
        return null;
      }

      const playerKey = playerCount === 0 ? 'player1' : 'player2';
      const playerRef = roomRef.child(`players/${playerKey}`);

      await playerRef.set({
        username: this.username,
        sessionId: this.sessionId,
        ready: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });

      console.log("[FirebaseClient] ✅ ルーム参加成功:", roomName, "as", playerKey);
      return { roomName, playerKey };
    } catch (error) {
      console.error("[FirebaseClient] ルーム参加エラー:", error.message);
      return null;
    }
  }

  /**
   * ルームを監視
   */
  watchRoom(roomName, callback) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    console.log("[FirebaseClient] ルーム監視開始:", roomName);

    const roomRef = this.db.ref(`rooms/${roomName}`);
    const listener = roomRef.on('value', (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val());
      } else {
        console.warn("[FirebaseClient] ルームが削除されました");
        callback(null);
      }
    });

    // リスナーを保存（後で削除できるように）
    this.listeners.set(`room:${roomName}`, { ref: roomRef, listener });

    return () => {
      roomRef.off('value', listener);
      this.listeners.delete(`room:${roomName}`);
    };
  }

  /**
   * ルーム一覧を監視
   */
  watchRoomList(callback) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    console.log("[FirebaseClient] ルーム一覧監視開始");

    const roomsRef = this.db.ref('rooms');
    const listener = roomsRef.on('value', (snapshot) => {
      const rooms = [];

      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const roomData = childSnapshot.val();
          const playerCount = Object.keys(roomData.players || {}).length;

          if (playerCount < 2) {
            rooms.push({
              name: roomData.name,
              playerCount,
              status: roomData.status || 'waiting'
            });
          }
        });
      }

      callback(rooms);
    });

    this.listeners.set('roomList', { ref: roomsRef, listener });

    return () => {
      roomsRef.off('value', listener);
      this.listeners.delete('roomList');
    };
  }

  /**
   * プレイヤーの Ready 状態を設定
   */
  async setReady(roomName, playerKey, isReady) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const readyRef = this.db.ref(`rooms/${roomName}/players/${playerKey}/ready`);
      await readyRef.set(isReady);
      console.log("[FirebaseClient] Ready 状態設定:", isReady);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] Ready 状態設定エラー:", error.message);
      return false;
    }
  }

  /**
   * ルームから退出
   */
  async leaveRoom(roomName, playerKey) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const playerRef = this.db.ref(`rooms/${roomName}/players/${playerKey}`);
      await playerRef.remove();
      console.log("[FirebaseClient] ✅ ルーム退出");
      
      // ルームが空になったか確認
      this.checkAndDeleteEmptyRoom(roomName);
      
      return true;
    } catch (error) {
      console.error("[FirebaseClient] ルーム退出エラー:", error.message);
      return false;
    }
  }

  /**
   * ルームが空になったら削除
   */
  async checkAndDeleteEmptyRoom(roomName) {
    if (!this.db) return;

    try {
      const roomRef = this.db.ref(`rooms/${roomName}`);
      const snapshot = await roomRef.once('value');

      if (!snapshot.exists()) {
        console.log("[FirebaseClient] ルームは既に削除されています");
        return;
      }

      const roomData = snapshot.val();
      const playerCount = Object.keys(roomData.players || {}).length;

      if (playerCount === 0) {
        console.log("[FirebaseClient] ルームが空になったため削除:", roomName);
        await roomRef.remove();
        console.log("[FirebaseClient] ✅ 空のルームを削除しました");
        
        // ゲーム状態もリセット
        this.emit('roomEmpty', { roomName });
      }
    } catch (error) {
      console.error("[FirebaseClient] ルーム削除エラー:", error.message);
    }
  }

  /**
   * ルームのゲーム状態をリセット
   */
  async resetRoomGameState(roomName) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const gameStateRef = this.db.ref(`rooms/${roomName}/gameState`);
      await gameStateRef.remove();
      console.log("[FirebaseClient] ✅ ゲーム状態をリセット:", roomName);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] ゲーム状態リセットエラー:", error.message);
      return false;
    }
  }

  /**
   * ゲーム状態を更新
   */
  async updateGameState(roomName, gameState) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      console.log("[FirebaseClient] ゲーム状態を更新:", roomName, gameState.matchData);
      const stateRef = this.db.ref(`rooms/${roomName}/gameState`);
      await stateRef.set(gameState);
      console.log("[FirebaseClient] ✅ ゲーム状態更新完了");
      return true;
    } catch (error) {
      console.error("[FirebaseClient] ゲーム状態更新エラー:", error.message);
      return false;
    }
  }

  /**
   * ゲーム状態を監視
   */
  watchGameState(roomName, callback) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    console.log("[FirebaseClient] ゲーム状態監視開始:", roomName);

    const stateRef = this.db.ref(`rooms/${roomName}/gameState`);
    const listener = stateRef.on('value', (snapshot) => {
      console.log("[FirebaseClient] ゲーム状態変更を検知:", snapshot.val());
      callback(snapshot.val());
    });

    this.listeners.set(`gameState:${roomName}`, { ref: stateRef, listener });

    return () => {
      console.log("[FirebaseClient] ゲーム状態監視停止:", roomName);
      stateRef.off('value', listener);
      this.listeners.delete(`gameState:${roomName}`);
    };
  }

  /**
   * オンライン状態を設定
   */
  async setOnlineStatus(isOnline) {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const statusRef = this.db.ref(`players/${this.username}/status`);
      await statusRef.set({
        isOnline,
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
        sessionId: this.sessionId
      });
      console.log("[FirebaseClient] オンライン状態:", isOnline);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] オンライン状態設定エラー:", error.message);
      return false;
    }
  }

  /**
   * すべてのリスナーを削除
   */
  removeAllListeners() {
    console.log("[FirebaseClient] すべてのリスナーを削除");
    this.listeners.forEach(({ ref, listener }) => {
      ref.off('value', listener);
    });
    this.listeners.clear();
  }

  /**
   * イベントを発火
   */
  emit(event, data) {
    const event_obj = new CustomEvent(event, { detail: data });
    document.dispatchEvent(event_obj);
  }

  /**
   * イベントをリッスン
   */
  on(event, callback) {
    document.addEventListener(event, (e) => callback(e.detail));
  }

  /**
   * セッション ID を生成
   */
  generateSessionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * ルーム名を生成
   */
  generateRoomName() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `ROOM_${timestamp}_${random}`;
  }

  /**
   * 接続状態を取得
   */
  getStatus() {
    return {
      connected: this.isConnected,
      username: this.username,
      sessionId: this.sessionId
    };
  }
}

// グローバルインスタンスを作成
window.firebaseClient = new FirebaseClient();
