/**
 * firebase-client.js v3.2
 * シンプルで堅牢な Firebase Realtime Database クライアント
 * Compat: onAuthStateChanged で user 確定後にのみ DB 接続（authStateReady は使用しない）
 */

class FirebaseClient {
  constructor() {
    this.db = null;
    this.auth = null;
    this.isConnected = false;
    this.username = null;
    this.sessionId = this.generateSessionId();
    this.listeners = new Map();
    this.connectionCheckInterval = null;
  }

  /**
   * signInAnonymously（必要時）→ onAuthStateChanged で user 確定後にのみ Database を接続する
   */
  async ensureAnonymousAuthThenDatabase(app) {
    if (typeof firebase.auth !== "function") {
      console.error("[FirebaseClient] firebase-auth-compat.js を HTML で firebase-database より前に読み込んでください");
      return false;
    }

    const auth = firebase.auth(app);

    try {
      await new Promise((resolve, reject) => {
        let finished = false;
        let unsub = () => {};

        const finishOk = () => {
          if (finished) return;
          finished = true;
          unsub();
          this.auth = auth;
          this.db = firebase.database(app);
          resolve();
        };

        const finishErr = (err) => {
          if (finished) return;
          finished = true;
          unsub();
          reject(err);
        };

        unsub = auth.onAuthStateChanged(
          (user) => {
            if (user) finishOk();
          },
          (error) => finishErr(error)
        );

        if (!auth.currentUser) {
          auth.signInAnonymously().catch((e) => finishErr(e));
        }
      });
      return true;
    } catch (e) {
      console.error("[FirebaseClient] 匿名ログイン失敗:", e.code || "", e.message);
      console.error("[FirebaseClient] Firebase Console → Authentication → 匿名 を有効にしてください。");
      return false;
    }
  }

  /**
   * Firebase を初期化（認証成功後にのみ DB 接続・リスナー開始）
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
      
      let app;
      try {
        app = firebase.app();
      } catch (e) {
        app = firebase.initializeApp(config);
      }

      const authed = await this.ensureAnonymousAuthThenDatabase(app);
      if (!authed) {
        this.db = null;
        this.auth = null;
        return false;
      }

      this.username = localStorage.getItem("username") || "Player";

      this.setupConnectionMonitoring();

      console.log("[FirebaseClient] ✅ 初期化成功（匿名 UID:", this.auth.currentUser?.uid, ")");
      console.log("[FirebaseClient] Project:", config.projectId);
      console.log("[FirebaseClient] Database:", config.databaseURL);

      return true;
    } catch (error) {
      console.error("[FirebaseClient] 初期化エラー:", error.message);
      this.db = null;
      this.auth = null;
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
      this.cleanupStaleRooms(snapshot);

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
   * ゴースト/放置ルームをクリーンアップ
   * - プレイヤー0人: 即削除
   * - waiting かつ 1人部屋で24時間超: 削除
   */
  cleanupStaleRooms(snapshot) {
    if (!snapshot || !snapshot.exists()) return;
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    snapshot.forEach((childSnapshot) => {
      const roomName = childSnapshot.key;
      const roomData = childSnapshot.val() || {};
      const players = roomData.players || {};
      const playerEntries = Object.entries(players).filter(([, v]) => !!v);
      const playerCount = playerEntries.length;

      if (playerCount === 0) {
        this.db.ref(`rooms/${roomName}`).remove();
        return;
      }

      const status = roomData.status || "waiting";
      const createdAt = Number(roomData.createdAt) || 0;
      const isOldWaitingSingle = status === "waiting" && playerCount === 1 && createdAt > 0 && (now - createdAt) > ONE_DAY_MS;
      if (isOldWaitingSingle) {
        this.db.ref(`rooms/${roomName}`).remove();
      }
    });
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
   * 切断時に自動退出するよう onDisconnect を設定
   * （ブラウザを閉じた時・ネットワーク切断時に Firebase サーバーが自動実行）
   */
  async setupOnDisconnect(roomName, playerKey) {
    if (!this.db) return;
    try {
      const playerRef = this.db.ref(`rooms/${roomName}/players/${playerKey}`);
      await playerRef.onDisconnect().remove();
      console.log("[FirebaseClient] ✅ onDisconnect 設定完了:", roomName, playerKey);
    } catch (e) {
      console.warn("[FirebaseClient] onDisconnect 設定エラー:", e.message);
    }
  }

  /**
   * onDisconnect をキャンセル（リロード前に呼ぶ）
   */
  async cancelOnDisconnect(roomName, playerKey) {
    if (!this.db) return;
    try {
      const playerRef = this.db.ref(`rooms/${roomName}/players/${playerKey}`);
      await playerRef.onDisconnect().cancel();
      console.log("[FirebaseClient] ✅ onDisconnect キャンセル完了");
    } catch (e) {
      console.warn("[FirebaseClient] onDisconnect キャンセルエラー:", e.message);
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
   * 自分のプレイヤー状態を書き込む（自分のパスのみ）
   */
  async writeMyState(roomName, playerKey, playerState) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/playerState/${playerKey}`).set(playerState);
      return true;
    } catch (e) {
      console.error("[FirebaseClient] writeMyState エラー:", e.message);
      return false;
    }
  }

  /**
   * matchData を書き込む（ターン権を持つプレイヤーのみ呼ぶ）
   */
  async writeMatchData(roomName, matchData) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/matchData`).set(matchData);
      return true;
    } catch (e) {
      console.error("[FirebaseClient] writeMatchData エラー:", e.message);
      return false;
    }
  }

  /**
   * ログを追記する
   */
  async appendLog(roomName, logEntry) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/logs`).push(logEntry);
      return true;
    } catch (e) {
      console.error("[FirebaseClient] appendLog エラー:", e.message);
      return false;
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
      // 旧 gameState パスと新パスの両方をクリア
      await this.db.ref(`rooms/${roomName}/gameState`).remove();
      await this.db.ref(`rooms/${roomName}/playerState`).remove();
      await this.db.ref(`rooms/${roomName}/matchData`).remove();
      await this.db.ref(`rooms/${roomName}/logs`).remove();
      console.log("[FirebaseClient] ✅ ゲーム状態をリセット:", roomName);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] ゲーム状態リセットエラー:", error.message);
      return false;
    }
  }

  /**
   * ルームのゲーム状態を更新（後方互換 - 新設計では使わない）
   * @deprecated writeMyState / writeMatchData を使うこと
   */
  async updateRoomGameState(roomName, gameState) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/matchData`).set(gameState.matchData);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] updateRoomGameState エラー:", error.message);
      return false;
    }
  }

  /**
   * フィールドカードデータを書き込む（自分のカードのみ）
   */
  async writeFieldCards(roomName, playerKey, cardData) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/fieldCards/${playerKey}`).set(cardData);
      return true;
    } catch (e) {
      console.error("[FirebaseClient] writeFieldCards エラー:", e.message);
      return false;
    }
  }

  /**
   * ステータス変更リクエストを送信
   * 相手のステータスを変更したい時に使う
   */
  async sendChangeRequest(roomName, fromKey, target, key, type, value) {
    if (!this.db) return false;
    try {
      await this.db.ref(`rooms/${roomName}/pendingChange/${fromKey}`).set({
        target, key, type, value,
        ts: firebase.database.ServerValue.TIMESTAMP
      });
      return true;
    } catch (e) {
      console.error("[FirebaseClient] sendChangeRequest エラー:", e.message);
      return false;
    }
  }

  /**
   * ステータス変更リクエストをクリア
   */
  async clearChangeRequest(roomName, fromKey) {
    if (!this.db) return;
    try {
      await this.db.ref(`rooms/${roomName}/pendingChange/${fromKey}`).remove();
    } catch (e) {}
  }
  async setPlayerDice(roomName, playerKey, diceValue) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      console.log("[FirebaseClient] プレイヤーダイス値を保存:", roomName, playerKey, diceValue);
      const diceRef = this.db.ref(`rooms/${roomName}/playerDice/${playerKey}`);
      await diceRef.set(diceValue);
      console.log("[FirebaseClient] ✅ プレイヤーダイス値保存完了");
      return true;
    } catch (error) {
      console.error("[FirebaseClient] プレイヤーダイス値保存エラー:", error.message);
      return false;
    }
  }

  /**
   * プレイヤーのダイス値を取得
   */
  async getPlayerDice(roomName, playerKey) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    try {
      const diceRef = this.db.ref(`rooms/${roomName}/playerDice/${playerKey}`);
      const snapshot = await diceRef.once('value');
      return snapshot.val();
    } catch (error) {
      console.error("[FirebaseClient] プレイヤーダイス値取得エラー:", error.message);
      return null;
    }
  }

  /**
   * すべてのプレイヤーのダイス値を取得
   */
  async getAllPlayerDice(roomName) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    try {
      const diceRef = this.db.ref(`rooms/${roomName}/playerDice`);
      const snapshot = await diceRef.once('value');
      return snapshot.val() || {};
    } catch (error) {
      console.error("[FirebaseClient] すべてのプレイヤーダイス値取得エラー:", error.message);
      return {};
    }
  }

  /**
   * プレイヤーのダイス値をリセット
   */
  async resetPlayerDice(roomName) {
    if (!this.db) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      console.log("[FirebaseClient] プレイヤーダイス値をリセット:", roomName);
      const diceRef = this.db.ref(`rooms/${roomName}/playerDice`);
      await diceRef.remove();
      console.log("[FirebaseClient] ✅ プレイヤーダイス値リセット完了");
      return true;
    } catch (error) {
      console.error("[FirebaseClient] プレイヤーダイス値リセットエラー:", error.message);
      return false;
    }
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
