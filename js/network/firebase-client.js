/**
 * firebase-client.js v3.3
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
    this.config = null;
    this.connectedRef = null;
    this.connectedListener = null;
    this.reconnectTimer = null;
    this.reconnectInFlight = false;
    this.reconnectAttempt = 0;
    this.lastDisconnectAt = 0;
  }

  /**
   * 匿名認証が Console で無効なときの案内（auth/configuration-not-found 等）
   */
  logAnonymousAuthConsoleHint(app, err) {
    const code = err && err.code ? err.code : "";
    const projectId = app && app.options && app.options.projectId ? app.options.projectId : "(projectId)";
    if (code === "auth/configuration-not-found" || code === "auth/operation-not-allowed") {
      console.error(
        "[FirebaseClient] 原因: Firebase Authentication で「匿名」が無効です（コードではなく Console 設定）。"
      );
      console.error(
        "[FirebaseClient] 手順: Firebase Console → プロジェクト「" +
          projectId +
          "」→ Authentication → Sign-in method → 匿名（Anonymous）→ 有効化 → 保存 → ページ再読み込み"
      );
    } else {
      console.error("[FirebaseClient] Firebase Console → Authentication → Sign-in method → 匿名 を有効にしてください。");
    }
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
      this.logAnonymousAuthConsoleHint(app, e);
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
      this.config = config;
      
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

    if (this.connectedRef && this.connectedListener) {
      this.connectedRef.off('value', this.connectedListener);
    }

    const connectedRef = this.db.ref('.info/connected');
    const listener = (snapshot) => {
      if (snapshot.val() === true) {
        console.log("[FirebaseClient] ✅ サーバーに接続");
        this.isConnected = true;
        this.reconnectAttempt = 0;
        this.cancelReconnectFallback();
        this.emit('connected');
      } else {
        if (this.isConnected) {
          // 接続中→切断になった場合のみログを出す（初回の false は無視）
          console.warn("[FirebaseClient] ⚠️ サーバーから切断されました。Firebase SDK が自動再接続します。");
        }
        this.isConnected = false;
        this.lastDisconnectAt = Date.now();
        this.scheduleReconnectFallback(8000);
        this.emit('disconnected');
      }
    };
    connectedRef.on('value', listener, (error) => {
      // 接続エラーは無視（ネットワーク問題の場合、自動的にリトライされる）
      console.debug("[FirebaseClient] 接続監視エラー（無視）:", error.code);
    });

    this.connectedRef = connectedRef;
    this.connectedListener = listener;
  }

  cancelReconnectFallback() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  scheduleReconnectFallback(delayMs = 8000) {
    this.cancelReconnectFallback();
    this.reconnectTimer = setTimeout(() => {
      this.tryReconnectFallback();
    }, Math.max(2000, Number(delayMs || 8000)));
  }

  async tryReconnectFallback() {
    if (this.isConnected) return;
    if (this.reconnectInFlight) return;
    if (!this.config) return;
    this.reconnectInFlight = true;
    this.reconnectAttempt += 1;
    try {
      const downSec = this.lastDisconnectAt ? Math.floor((Date.now() - this.lastDisconnectAt) / 1000) : -1;
      console.warn(`[FirebaseClient] 再接続フォールバックを実行します (attempt=${this.reconnectAttempt}, down=${downSec}s)`);
      const ok = await this.initialize(this.config);
      if (!ok || !this.isConnected) {
        const nextDelay = Math.min(30000, 5000 * this.reconnectAttempt);
        this.scheduleReconnectFallback(nextDelay);
      }
    } catch (error) {
      console.warn("[FirebaseClient] 再接続フォールバック失敗:", error?.message || error);
      const nextDelay = Math.min(30000, 5000 * this.reconnectAttempt);
      this.scheduleReconnectFallback(nextDelay);
    } finally {
      this.reconnectInFlight = false;
    }
  }

  /**
   * players ノードから有効プレイヤーを抽出
   */
  getActivePlayerEntries(roomData) {
    const players = roomData?.players;
    if (!players || typeof players !== "object") return [];
    return Object.entries(players).filter(([, v]) => !!v && typeof v === "object");
  }

  /**
   * ルームの lifecycle 情報を更新
   */
  async touchRoomLifecycle(roomName, patch = {}) {
    if (!this.db || !roomName) return;
    try {
      await this.db.ref(`rooms/${roomName}`).update({
        ...patch,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (e) {
      console.warn("[FirebaseClient] touchRoomLifecycle エラー:", e.message);
    }
  }

  /**
   * rooms snapshot から一覧表示データへ変換
   */
  mapRoomList(snapshot) {
    const rooms = [];
    if (!snapshot || !snapshot.exists()) return rooms;

    snapshot.forEach((childSnapshot) => {
      const roomData = childSnapshot.val() || {};
      const playerCount = this.getActivePlayerEntries(roomData).length;
      if (playerCount < 2) {
        rooms.push({
          name: childSnapshot.key || roomData.name,
          playerCount,
          status: roomData.status || "waiting"
        });
      }
    });
    return rooms;
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
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        active: true,
        phase: "ready_check",
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
      await this.setupOnDisconnect(finalName, "player1");
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

      await roomRef.update({
        active: true,
        status: "waiting",
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await this.setupOnDisconnect(roomName, playerKey);

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
      this.cleanupStaleRooms(snapshot);
      const rooms = this.mapRoomList(snapshot);
      callback(rooms);
    });

    this.listeners.set('roomList', { ref: roomsRef, listener });

    return () => {
      roomsRef.off('value', listener);
      this.listeners.delete('roomList');
    };
  }

  /**
   * ルーム一覧を単発取得（手動更新ボタン向け）
   */
  async fetchRoomListOnce() {
    if (!this.db) return [];
    try {
      const snapshot = await this.db.ref("rooms").once("value");
      this.cleanupStaleRooms(snapshot);
      return this.mapRoomList(snapshot);
    } catch (e) {
      console.error("[FirebaseClient] ルーム一覧取得エラー:", e.message);
      return [];
    }
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
      const playerCount = this.getActivePlayerEntries(roomData).length;

      if (playerCount === 0) {
        this.db.ref(`rooms/${roomName}`).remove();
        return;
      }

      const status = roomData.status || "waiting";
      const updatedAt = Number(roomData.updatedAt || roomData.createdAt) || 0;
      const isOldWaitingSingle = status === "waiting" && playerCount === 1 && updatedAt > 0 && (now - updatedAt) > ONE_DAY_MS;
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
      await this.touchRoomLifecycle(roomName, { status: "waiting", active: true });
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
      await this.cancelOnDisconnect(roomName, playerKey);
      const playerRef = this.db.ref(`rooms/${roomName}/players/${playerKey}`);
      await playerRef.remove();
      console.log("[FirebaseClient] ✅ ルーム退出");
      
      // ルームが空になったか確認
      await this.checkAndDeleteEmptyRoom(roomName);
      
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
      const roomUpdatedRef = this.db.ref(`rooms/${roomName}/updatedAt`);
      await playerRef.onDisconnect().remove();
      await roomUpdatedRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
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
      const roomUpdatedRef = this.db.ref(`rooms/${roomName}/updatedAt`);
      await playerRef.onDisconnect().cancel();
      await roomUpdatedRef.onDisconnect().cancel();
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
      const playerCount = this.getActivePlayerEntries(roomData).length;

      if (playerCount === 0) {
        console.log("[FirebaseClient] ルームが空になったため削除:", roomName);
        await roomRef.remove();
        console.log("[FirebaseClient] ✅ 空のルームを削除しました");
        
        // ゲーム状態もリセット
        this.emit('roomEmpty', { roomName });
      } else {
        await this.touchRoomLifecycle(roomName, {
          active: true,
          status: roomData?.status || "waiting"
        });
      }
    } catch (error) {
      console.error("[FirebaseClient] ルーム削除エラー:", error.message);
    }
  }

  /**
   * 自分のプレイヤー状態を書き込む（自分のパスのみ）
   * 切断中は最大3回リトライする
   */
  async writeMyState(roomName, playerKey, playerState) {
    if (!this.db) return false;
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        await this.db.ref(`rooms/${roomName}/playerState/${playerKey}`).set(playerState);
        this.touchRoomLifecycle(roomName, { active: true });
        return true;
      } catch (e) {
        if (attempt < MAX_RETRY) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        } else {
          console.error("[FirebaseClient] writeMyState エラー（リトライ上限）:", e.message);
        }
      }
    }
    return false;
  }

  /**
   * matchData を書き込む（ターン権を持つプレイヤーのみ呼ぶ）
   * 切断中は最大3回リトライする
   */
  async writeMatchData(roomName, matchData) {
    if (!this.db) return false;
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        if (matchData?.status) {
          console.log(`[PHASE] local -> ${matchData.status}`);
        }
        await this.db.ref(`rooms/${roomName}/matchData`).set(matchData);
        await this.touchRoomLifecycle(roomName, {
          active: true,
          phase: matchData?.status || null,
          status: matchData?.status || "waiting"
        });
        if (matchData?.status) {
          console.log(`[PHASE] firebase write success (${matchData.status})`);
        }
        return true;
      } catch (e) {
        if (attempt < MAX_RETRY) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        } else {
          console.error("[FirebaseClient] writeMatchData エラー（リトライ上限）:", e.message);
        }
      }
    }
    return false;
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
      await this.db.ref(`rooms/${roomName}`).update({
        phase: "ready_check",
        status: "waiting",
        active: true,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
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
   * ユーザーのデッキリストを Firebaseに保存
   */
  async saveDeckListToFirebase(deckList) {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const decksRef = this.db.ref(`accounts/${this.username}/decks`);
      const decksData = {};
      deckList.forEach(deck => {
        decksData[deck.id] = {
          name: deck.name,
          code: deck.code,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
      });
      await decksRef.set(decksData);
      console.log("[FirebaseClient] ✅ デッキリストを Firebase に保存:", deckList.length, "件");
      return true;
    } catch (error) {
      console.error("[FirebaseClient] デッキリスト保存エラー:", error.message);
      return false;
    }
  }

  /**
   * ユーザーのデッキリストを Firebase から読み込む
   */
  async loadDeckListFromFirebase() {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    try {
      const decksRef = this.db.ref(`accounts/${this.username}/decks`);
      const snapshot = await decksRef.once('value');
      
      if (!snapshot.exists()) {
        console.log("[FirebaseClient] Firebase にデッキリストが存在しません");
        return [];
      }

      const decksData = snapshot.val();
      const deckList = [];
      Object.entries(decksData).forEach(([deckId, data]) => {
        deckList.push({
          id: deckId,
          name: data.name || "無名デッキ",
          code: data.code || "empty"
        });
      });

      console.log("[FirebaseClient] ✅ Firebase からデッキリストを読み込み:", deckList.length, "件");
      return deckList;
    } catch (error) {
      console.error("[FirebaseClient] デッキリスト読み込みエラー:", error.message);
      return null;
    }
  }

  /**
   * Firebase からデッキリストを監視（リアルタイム更新）
   */
  watchDeckList(callback) {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return null;
    }

    console.log("[FirebaseClient] デッキリスト監視開始:", this.username);

    const decksRef = this.db.ref(`accounts/${this.username}/decks`);
    const listener = decksRef.on('value', (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const decksData = snapshot.val();
      const deckList = [];
      Object.entries(decksData).forEach(([deckId, data]) => {
        deckList.push({
          id: deckId,
          name: data.name || "無名デッキ",
          code: data.code || "empty"
        });
      });
      callback(deckList);
    }, (error) => {
      console.warn("[FirebaseClient] デッキリスト監視エラー:", error.message);
    });

    this.listeners.set(`deckList:${this.username}`, { ref: decksRef, listener });

    return () => {
      decksRef.off('value', listener);
      this.listeners.delete(`deckList:${this.username}`);
    };
  }

  /**
   * Firebase の特定デッキを削除
   */
  async deleteDeckFromFirebase(deckId) {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const deckRef = this.db.ref(`accounts/${this.username}/decks/${deckId}`);
      await deckRef.remove();
      console.log("[FirebaseClient] ✅ デッキを Firebase から削除:", deckId);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] デッキ削除エラー:", error.message);
      return false;
    }
  }

  /**
   * Firebase の特定デッキを更新
   */
  async updateDeckOnFirebase(deckId, deckData) {
    if (!this.db || !this.username) {
      console.error("[FirebaseClient] Firebase が初期化されていません");
      return false;
    }

    try {
      const deckRef = this.db.ref(`accounts/${this.username}/decks/${deckId}`);
      const updateData = {
        name: deckData.name,
        code: deckData.code,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      await deckRef.update(updateData);
      console.log("[FirebaseClient] ✅ デッキを Firebase で更新:", deckId);
      return true;
    } catch (error) {
      console.error("[FirebaseClient] デッキ更新エラー:", error.message);
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
    if (this.connectedRef && this.connectedListener) {
      this.connectedRef.off('value', this.connectedListener);
    }
    this.connectedRef = null;
    this.connectedListener = null;
    this.cancelReconnectFallback();
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

  normalizeChatPair(userA, userB) {
    const aRaw = String(userA || "").trim();
    const bRaw = String(userB || "").trim();
    const a = encodeURIComponent(aRaw);
    const b = encodeURIComponent(bRaw);
    return a <= b ? `${a}__${b}` : `${b}__${a}`;
  }

  encodeUserKey(username) {
    return encodeURIComponent(String(username || "").trim());
  }

  getDirectChatInboxPath(ownerName, peerName) {
    const owner = this.encodeUserKey(ownerName);
    const peer = this.encodeUserKey(peerName);
    return `friendDm/${owner}/${peer}`;
  }

  async findAccountByExactName(name) {
    if (!this.db || !name) return null;
    const query = this.db.ref("accounts").orderByKey().equalTo(String(name).trim());
    const snap = await query.once("value");
    if (!snap.exists()) return null;
    const data = snap.val() || {};
    const key = Object.keys(data)[0];
    if (!key) return null;
    return { username: key, profile: data[key] || {} };
  }

  async searchAccountsByPartialName(keyword, limit = 10) {
    if (!this.db || !keyword) return [];
    const needle = String(keyword).trim().toLowerCase();
    if (!needle) return [];
    const snap = await this.db.ref("accounts").once("value");
    if (!snap.exists()) return [];
    const all = snap.val() || {};
    const keys = Object.keys(all)
      .filter((name) => String(name).toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b, "ja"))
      .slice(0, Math.max(1, Number(limit) || 10));
    return keys.map((name) => ({ username: name, profile: all[name] || {} }));
  }

  watchFriendList(callback) {
    if (!this.db || !this.username) return null;
    const ref = this.db.ref(`friends/${this.username}`);
    const listener = ref.on("value", snap => {
      const val = snap.val() || {};
      const list = Object.keys(val).map(name => ({ username: name, ...(val[name] || {}) }));
      callback(list);
    });
    this.listeners.set(`friends:${this.username}`, { ref, listener });
    return () => {
      ref.off("value", listener);
      this.listeners.delete(`friends:${this.username}`);
    };
  }

  watchIncomingFriendRequests(callback) {
    if (!this.db || !this.username) return null;
    const ref = this.db.ref(`friendRequests/${this.username}/incoming`);
    const listener = ref.on("value", snap => {
      const val = snap.val() || {};
      callback(Object.keys(val).map(from => ({ from, ...(val[from] || {}) })));
    });
    this.listeners.set(`friendReqIn:${this.username}`, { ref, listener });
    return () => {
      ref.off("value", listener);
      this.listeners.delete(`friendReqIn:${this.username}`);
    };
  }

  watchFriendStatuses(friendNames, callback) {
    if (!this.db) return () => {};
    const refs = [];
    const unsubs = [];
    const cache = {};
    const names = Array.isArray(friendNames) ? friendNames.filter(Boolean) : [];
    names.forEach(name => {
      const ref = this.db.ref(`players/${name}/status`);
      refs.push(ref);
      const listener = ref.on("value", snap => {
        cache[name] = snap.val() || { isOnline: false };
        callback({ ...cache });
      });
      unsubs.push(() => ref.off("value", listener));
    });
    return () => unsubs.forEach(fn => fn());
  }

  async sendFriendRequest(targetName) {
    if (!this.db || !this.username || !targetName) return false;
    const from = this.username;
    const to = String(targetName).trim();
    if (!to || to === from) return false;
    const ts = firebase.database.ServerValue.TIMESTAMP;
    await this.db.ref(`friendRequests/${to}/incoming/${from}`).set({ from, ts, status: "pending" });
    await this.db.ref(`friendRequests/${from}/outgoing/${to}`).set({ to, ts, status: "pending" });
    return true;
  }

  async acceptFriendRequest(fromName) {
    if (!this.db || !this.username || !fromName) return false;
    const me = this.username;
    const from = String(fromName).trim();
    const ts = firebase.database.ServerValue.TIMESTAMP;
    const updates = {};
    updates[`friends/${me}/${from}`] = { username: from, addedAt: ts };
    updates[`friends/${from}/${me}`] = { username: me, addedAt: ts };
    updates[`friendRequests/${me}/incoming/${from}`] = null;
    updates[`friendRequests/${from}/outgoing/${me}`] = null;
    await this.db.ref().update(updates);
    return true;
  }

  async rejectFriendRequest(fromName) {
    if (!this.db || !this.username || !fromName) return false;
    const me = this.username;
    const from = String(fromName).trim();
    const updates = {};
    updates[`friendRequests/${me}/incoming/${from}`] = null;
    updates[`friendRequests/${from}/outgoing/${me}`] = null;
    await this.db.ref().update(updates);
    return true;
  }

  watchDirectChat(targetName, callback) {
    if (!this.db || !this.username || !targetName) return null;
    const normalizedTarget = String(targetName).trim();
    const inboxRootRef = this.db.ref(`friendDm/${this.encodeUserKey(this.username)}`);
    const legacyPairKey = this.normalizeChatPair(this.username, targetName);
    const legacyRef = this.db.ref(`directChats/${legacyPairKey}`).orderByKey().limitToLast(100);

    let inboxRows = [];
    let legacyRows = [];
    const emitMerged = () => {
      const map = new Map();
      [...legacyRows, ...inboxRows].forEach((row) => {
        const key = String(row.id || "");
        if (!key) return;
        map.set(key, row);
      });
      const merged = Array.from(map.values()).sort((a, b) => {
        const aTs = Number(a.ts || a.clientTs || 0);
        const bTs = Number(b.ts || b.clientTs || 0);
        return aTs - bTs;
      });
      callback(merged.slice(-100));
    };

    const inboxListener = inboxRootRef.on(
      "value",
      (snap) => {
        const rows = [];
        snap.forEach((peerSnap) => {
          peerSnap.forEach((msgSnap) => {
            const msg = msgSnap.val() || {};
            const from = String(msg.from || "").trim();
            const to = String(msg.to || "").trim();
            if (from !== normalizedTarget && to !== normalizedTarget) return;
            rows.push({ id: msgSnap.key, ...msg });
          });
        });
        rows.sort((a, b) => Number(a.ts || a.clientTs || 0) - Number(b.ts || b.clientTs || 0));
        inboxRows = rows.slice(-100);
        emitMerged();
      },
      (error) => {
        console.error("[FirebaseClient] DM監視エラー:", error?.message || error);
      }
    );

    const legacyListener = legacyRef.on(
      "value",
      (snap) => {
        const rows = [];
        snap.forEach((child) => rows.push({ id: child.key, ...(child.val() || {}) }));
        legacyRows = rows;
        emitMerged();
      },
      (error) => {
        console.error("[FirebaseClient] DM監視(legacy)エラー:", error?.message || error);
      }
    );

    const key = `directChat:${this.username}:${targetName}`;
    this.listeners.set(key, { ref: inboxRootRef, listener: inboxListener, legacyRef, legacyListener });
    return () => {
      inboxRootRef.off("value", inboxListener);
      legacyRef.off("value", legacyListener);
      this.listeners.delete(key);
    };
  }

  async sendDirectChat(targetName, text, color = "#ffffff") {
    if (!this.db || !this.username || !targetName || !text) return false;
    const from = String(this.username).trim();
    const to = String(targetName).trim();
    if (!from || !to) return false;

    const senderRef = this.db.ref(this.getDirectChatInboxPath(from, to)).push();
    const receiverRef = this.db.ref(this.getDirectChatInboxPath(to, from)).push();
    if (!senderRef.key || !receiverRef.key) return false;

    const basePayload = {
      from,
      to,
      text: String(text),
      color,
      clientTs: Date.now(),
      ts: firebase.database.ServerValue.TIMESTAMP
    };

    const legacyPairKey = this.normalizeChatPair(from, to);
    const legacyRef = this.db.ref(`directChats/${legacyPairKey}`).push();

    await Promise.all([
      senderRef.set({ id: senderRef.key, ...basePayload }),
      receiverRef.set({ id: receiverRef.key, ...basePayload }),
      legacyRef.set({ id: legacyRef.key || senderRef.key, ...basePayload })
    ]);
    return true;
  }

  async fetchDirectChat(targetName, limit = 100) {
    if (!this.db || !this.username || !targetName) return [];
    const normalizedTarget = String(targetName).trim();
    const [inboxSnap, legacySnap] = await Promise.all([
      this.db
      .ref(`friendDm/${this.encodeUserKey(this.username)}`)
      .once("value"),
      this.db
        .ref(`directChats/${this.normalizeChatPair(this.username, targetName)}`)
        .orderByKey()
        .limitToLast(limit)
        .once("value")
    ]);

    const map = new Map();
    inboxSnap.forEach((peerSnap) => {
      peerSnap.forEach((msgSnap) => {
        const msg = msgSnap.val() || {};
        const from = String(msg.from || "").trim();
        const to = String(msg.to || "").trim();
        if (from !== normalizedTarget && to !== normalizedTarget) return;
        map.set(`inbox:${String(msgSnap.key)}`, { id: msgSnap.key, ...msg });
      });
    });
    legacySnap.forEach((child) => map.set(String(child.key), { id: child.key, ...(child.val() || {}) }));
    return Array.from(map.values())
      .sort((a, b) => Number(a.ts || a.clientTs || 0) - Number(b.ts || b.clientTs || 0))
      .slice(-limit);
  }

  async sendRoomInvite(targetName, roomName) {
    if (!this.db || !this.username || !targetName || !roomName) return false;
    const to = String(targetName).trim();
    const normalizedRoom = String(roomName).trim().toUpperCase();
    if (!to || !normalizedRoom) return false;

    const inviteId = this.db.ref(`roomInvites/${to}`).push().key;
    if (!inviteId) return false;
    await this.db.ref(`roomInvites/${to}/${inviteId}`).set({
      id: inviteId,
      roomName: normalizedRoom,
      from: this.username,
      to,
      status: "pending",
      ts: firebase.database.ServerValue.TIMESTAMP
    });
    return true;
  }

  watchRoomInvites(callback) {
    if (!this.db || !this.username) return null;
    const ref = this.db.ref(`roomInvites/${this.username}`).limitToLast(50);
    const listener = ref.on("value", snap => {
      const list = [];
      snap.forEach(child => list.push({ id: child.key, ...(child.val() || {}) }));
      list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      callback(list);
    });
    this.listeners.set(`roomInvites:${this.username}`, { ref, listener });
    return () => {
      ref.off("value", listener);
      this.listeners.delete(`roomInvites:${this.username}`);
    };
  }

  async respondRoomInvite(inviteId, status) {
    if (!this.db || !this.username || !inviteId) return false;
    const safeStatus = status === "accepted" ? "accepted" : "rejected";
    await this.db.ref(`roomInvites/${this.username}/${inviteId}`).update({
      status: safeStatus,
      respondedAt: firebase.database.ServerValue.TIMESTAMP
    });
    return true;
  }
}

// グローバルインスタンスを作成
window.firebaseClient = new FirebaseClient();
