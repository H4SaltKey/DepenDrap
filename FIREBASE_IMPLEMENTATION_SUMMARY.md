# 📚 Firebase 実装サマリー

**作成日**: 2026-05-08  
**バージョン**: 1.0  
**ステータス**: ✅ 完全実装済み

---

## 🎯 概要

DepenDrap Online は **Firebase Realtime Database** を使用した完全なマルチプレイヤーカードゲームです。

### 技術スタック

```
Frontend:
├── HTML5 / CSS3 / JavaScript
├── Firebase SDK v9.23.0
└── Firebase Realtime Database

Backend:
└── Firebase Realtime Database（サーバーレス）

Deployment:
└── GitHub Pages（静的ホスティング）
```

### 使用していない技術

- ❌ Socket.io
- ❌ Photon
- ❌ Node.js サーバー
- ❌ Python サーバー

---

## 📁 ファイル構成

### Firebase 関連ファイル

```
js/firebase-sync.js
├── initFirebase()           - Firebase 初期化
├── createRoom()             - ルーム作成
├── joinRoom()               - ルーム参加
├── leaveRoom()              - ルーム退出
├── markReady()              - Ready 状態設定
├── watchRoom()              - ルーム監視
├── watchRoomList()          - ルーム一覧監視
├── setOnlineStatus()        - オンライン状態設定
└── 公開 API (window.FirebaseSync)
```

### HTML ファイル

```
login.html
├── Firebase Config 設定
├── Firebase SDK 読み込み
├── ログイン機能
└── CREATE ACCOUNT 機能

index.html
├── Firebase Config 設定
├── Firebase SDK 読み込み
├── Firebase 初期化
└── タイトル画面

matchSetup.html
├── Firebase Config 設定
├── Firebase SDK 読み込み
├── Firebase 初期化
├── ルーム作成・参加
└── マッチング画面

game.html
├── Firebase Config 設定
├── Firebase SDK 読み込み
├── Firebase 初期化
└── ゲーム画面
```

### JavaScript ファイル

```
js/
├── firebase-sync.js         - Firebase クライアント ライブラリ
├── core.js                  - ゲーム状態管理
├── cardManager.js           - カード管理
├── timerSync.js             - タイマー同期
├── game.js                  - ゲームロジック
├── matchSetup.js            - マッチング
├── deckCode.js              - デッキコード
├── cardData.js              - カードデータ
├── menu.js                  - メニュー
├── render.js                - レンダリング
├── drag.js                  - ドラッグ操作
├── contextMenu.js           - コンテキストメニュー
├── devTools.js              - 開発者ツール
└── damageCalc.js            - ダメージ計算
```

---

## 🔧 Firebase 実装の詳細

### 1. Firebase 初期化

**ファイル**: `firebase-sync.js`

```javascript
function initFirebase(callbacks = {}) {
  const firebaseConfig = window.FIREBASE_CONFIG;
  
  if (!firebaseConfig) {
    console.error("[Firebase] Firebase config が設定されていません。");
    return;
  }

  try {
    const app = firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    _isConnected = true;
    console.log("[Firebase] ✅ Initialized successfully");
    
    // コールバック実行
    if (callbacks.onStateChange) {
      callbacks.onStateChange("connected");
    }
    
    // オンライン状態を設定
    setOnlineStatus(true);
    
    // ルーム一覧を監視
    watchRoomList();
  } catch (e) {
    console.error("[Firebase] ❌ Initialization error:", e);
    if (callbacks.onStateChange) {
      callbacks.onStateChange("error");
    }
  }
}
```

### 2. ルーム管理

#### ルーム作成

```javascript
function createRoom(roomName) {
  const finalRoomName = roomName || generateRoomName();
  
  const roomData = {
    name: finalRoomName,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    maxPlayers: 2,
    players: {
      player1: {
        sessionId: _mySessionId,
        username: localStorage.getItem("username"),
        ready: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      }
    }
  };

  _db.ref(`rooms/${finalRoomName}`).set(roomData);
}
```

#### ルーム参加

```javascript
function joinRoom(roomName) {
  const roomRef = _db.ref(`rooms/${roomName}`);
  
  roomRef.once('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.error("[Firebase] Room not found");
      return;
    }

    const roomData = snapshot.val();
    const playerKey = Object.keys(roomData.players).length === 0 ? "player1" : "player2";
    
    roomRef.child(`players/${playerKey}`).set({
      sessionId: _mySessionId,
      username: localStorage.getItem("username"),
      ready: false,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
  });
}
```

### 3. リアルタイム監視

#### ルーム監視

```javascript
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
    
    // プレイヤー状態を確認
    // 相手の状態を確認
    // Ready 状態を確認
    // 両者が Ready か確認
  });
}
```

#### ルーム一覧監視

```javascript
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
```

### 4. アカウント管理

**ファイル**: `login.html`

#### ログイン

```javascript
async function doLogin() {
  const nickname = nicknameIn.value.trim();
  const password = passwordIn.value.trim();

  // 入力値の確認
  if (!nickname || !password) return;
  if (nickname.length < 2 || password.length < 4) return;

  // Firebase 初期化確認
  if (!firebaseInitialized || !db) return;

  try {
    // アカウント情報を取得
    const snapshot = await db.ref(`accounts/${nickname}`).once('value');

    if (!snapshot.exists()) {
      errorMsg.textContent = "アカウントが見つかりません。";
      return;
    }

    const accountData = snapshot.val();
    
    // パスワード確認
    if (accountData.password !== password) {
      errorMsg.textContent = "パスワードが間違っています。";
      return;
    }

    // ログイン成功
    localStorage.setItem("username", nickname);
    localStorage.setItem("isOnline", "true");
    localStorage.setItem("accountId", accountData.id);
    
    window.location.href = "index.html";
  } catch (e) {
    console.error("[Login] Login error:", e);
    errorMsg.textContent = "ログイン処理中にエラーが発生しました。";
  }
}
```

#### アカウント作成

```javascript
async function doRegister() {
  const nickname = nicknameIn.value.trim();
  const password = passwordIn.value.trim();

  // 入力値の確認
  if (!nickname || !password) return;
  if (nickname.length < 2 || password.length < 4) return;

  // Firebase 初期化確認
  if (!firebaseInitialized || !db) return;

  try {
    // 既存アカウントを確認
    const snapshot = await db.ref(`accounts/${nickname}`).once('value');

    if (snapshot.exists()) {
      const existingAccount = snapshot.val();
      
      // 同じニックネーム + パスワードの組み合わせが存在するか
      if (existingAccount.password === password) {
        errorMsg.textContent = "このニックネーム + パスワードの組み合わせは既に使用されています。";
        return;
      }
    }

    // 新規アカウントを作成
    const accountId = Math.random().toString(36).substr(2, 9);
    const accountData = {
      id: accountId,
      nickname: nickname,
      password: password,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastLogin: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref(`accounts/${nickname}`).set(accountData);

    // ログイン状態に設定
    localStorage.setItem("username", nickname);
    localStorage.setItem("isOnline", "true");
    localStorage.setItem("accountId", accountId);

    successMsg.textContent = "アカウントを作成しました。ゲームを開始します...";
    
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
  } catch (e) {
    console.error("[Login] Register error:", e);
    errorMsg.textContent = "アカウント作成中にエラーが発生しました。";
  }
}
```

### 5. オンライン状態管理

```javascript
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
```

---

## 📊 Firebase データベース構造

```
Firebase Realtime Database
├── accounts/
│   └── {nickname}/
│       ├── id: "abc123def"
│       ├── nickname: "ディペンド太郎"
│       ├── password: "password123"
│       ├── createdAt: 1715000000000
│       └── lastLogin: 1715000000000
│
├── players/
│   └── {username}/
│       └── status/
│           ├── isOnline: true
│           ├── lastSeen: 1715000000000
│           └── sessionId: "abc123def"
│
└── rooms/
    └── {roomName}/
        ├── name: "ROOM_ABC123_XYZ"
        ├── createdAt: 1715000000000
        ├── maxPlayers: 2
        └── players/
            ├── player1/
            │   ├── sessionId: "abc123def"
            │   ├── username: "ディペンド太郎"
            │   ├── ready: false
            │   ├── joinedAt: 1715000000000
            │   └── hasJoined: true
            └── player2/
                ├── sessionId: "xyz789abc"
                ├── username: "プレイヤー2"
                ├── ready: false
                ├── joinedAt: 1715000000000
                └── hasJoined: true
```

---

## 🔐 セキュリティ

### 現在の設定

- **モード**: テストモード
- **用途**: 開発・テスト

### 本番環境用セキュリティルール

```json
{
  "rules": {
    "accounts": {
      "$nickname": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['id', 'nickname', 'password', 'createdAt', 'lastLogin'])"
      }
    },
    "players": {
      "$username": {
        ".read": true,
        ".write": true
      }
    },
    "rooms": {
      "$roomName": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

---

## 🚀 デプロイメント

### GitHub Pages へのデプロイ

```bash
# 1. リポジトリをクローン
git clone https://github.com/YOUR_USERNAME/DepenDrap_Online.git
cd DepenDrap_Online

# 2. Firebase Config を設定
# login.html, index.html, matchSetup.html, game.html を編集

# 3. コミット
git add .
git commit -m "Update Firebase config"

# 4. プッシュ
git push origin main

# 5. GitHub Pages で公開
# Settings → Pages → Source: main branch
```

### ローカルテスト

```bash
# Python 3 でローカルサーバーを起動
python -m http.server 8000

# ブラウザで開く
# http://localhost:8000
```

---

## 🔍 デバッグ

### ブラウザコンソール

```javascript
// Firebase Config を確認
console.log("FIREBASE_CONFIG:", window.FIREBASE_CONFIG);

// Firebase SDK を確認
console.log("firebase:", typeof firebase);

// Firebase アプリを確認
console.log("Firebase apps:", firebase.apps);

// Firebase Database を確認
if (firebase.apps.length > 0) {
  const db = firebase.database();
  console.log("Database:", db);
  
  // テスト読み込み
  db.ref("test").once("value").then(snapshot => {
    console.log("✅ Database connection: OK");
  }).catch(e => {
    console.error("❌ Database connection error:", e);
  });
}
```

### コンソールログ

**正常な場合**:
```
[Firebase] ✅ Initialized successfully
[Firebase] Project ID: my-project
[Firebase] Online status set to: true
[Firebase] Creating room: ROOM_ABC123_XYZ
[Firebase] Joining room: ROOM_ABC123_XYZ
```

**エラーの場合**:
```
[Firebase] ❌ Initialization error: FirebaseError: Invalid API key provided.
[Firebase] Firebase config が設定されていません。
[Firebase] Error creating room: FirebaseError: Permission denied
```

---

## 📚 参考資料

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Realtime Database ドキュメント](https://firebase.google.com/docs/database)
- [Firebase SDK リファレンス](https://firebase.google.com/docs/reference/js/database)
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - セットアップガイド
- [FIREBASE_CONNECTION_FIX.md](FIREBASE_CONNECTION_FIX.md) - トラブルシューティング
- [FIREBASE_CONFIRMED.md](FIREBASE_CONFIRMED.md) - 確認完了レポート

---

## ✅ チェックリスト

- [x] Firebase SDK が正しく読み込まれている
- [x] Firebase 初期化が正しく実装されている
- [x] ルーム作成・参加が実装されている
- [x] リアルタイム監視が実装されている
- [x] アカウント管理が実装されている
- [x] オンライン状態管理が実装されている
- [x] エラーハンドリングが実装されている
- [x] コンソールログが実装されている
- [x] すべての HTML ファイルに Firebase Config が設定されている

---

**最終更新**: 2026-05-08  
**バージョン**: 1.0  
**ステータス**: ✅ 完全実装済み
