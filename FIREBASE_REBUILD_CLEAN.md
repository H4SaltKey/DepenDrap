# Firebase コード完全再構築 - クリーンビルド

## 概要
既存コードの問題を排除し、ゼロから Firebase Realtime Database クライアントを再構築しました。

## 新規ファイル

### `js/firebase-client.js` (v3.0)
シンプルで堅牢な Firebase クライアント。既存の `firebase-sync.js` を完全に置き換えます。

**主な特徴:**
- クラスベースの設計
- 明確なエラーハンドリング
- イベントベースの通知
- リスナー管理の自動化
- 接続状態の監視

**主要メソッド:**
```javascript
// 初期化
await firebaseClient.initialize(config)

// ルーム操作
await firebaseClient.createRoom(roomName)
await firebaseClient.joinRoom(roomName)
await firebaseClient.leaveRoom(roomName, playerKey)
await firebaseClient.setReady(roomName, playerKey, isReady)

// 監視
firebaseClient.watchRoom(roomName, callback)
firebaseClient.watchRoomList(callback)
firebaseClient.watchGameState(roomName, callback)

// ステータス
firebaseClient.setOnlineStatus(isOnline)
firebaseClient.getStatus()

// イベント
firebaseClient.on(event, callback)
firebaseClient.emit(event, data)
```

## 更新ファイル

### `login.html`
- `firebase-client.js` を使用
- シンプルな初期化フロー
- ローカルストレージフォールバック対応
- エラーメッセージを日本語化

### `index.html`
- `firebase-client.js` を使用
- 接続状態をリアルタイム表示
- イベントリスナーで状態変化を監視

### `matchSetup.html`
- `firebase-client.js` を使用
- `matchSetup.js` は後で更新予定

### `game.html`
- `firebase-client.js` を使用

## 削除ファイル（推奨）

以下のファイルは使用されなくなったため、削除を推奨します：
- `js/firebase-sync.js` (古いバージョン)

## 初期化フロー

```
1. HTML ページ読み込み
   ↓
2. Firebase SDK 読み込み
   ↓
3. firebase-client.js 読み込み
   ↓
4. firebaseClient.initialize(config)
   ├─ Firebase SDK 確認
   ├─ initializeApp()
   ├─ setupConnectionMonitoring()
   └─ 接続状態を監視開始
   ↓
5. 接続状態が変わる
   ├─ 'connected' イベント発火
   └─ 'disconnected' イベント発火
```

## エラーハンドリング

### Firebase が初期化できない場合
```javascript
const success = await firebaseClient.initialize(config);
if (!success) {
  console.error("Firebase 初期化失敗");
  // ローカルストレージのみで動作
}
```

### ルーム操作エラー
```javascript
const roomName = await firebaseClient.createRoom("MyRoom");
if (!roomName) {
  console.error("ルーム作成失敗");
}
```

## ログ出力例

### 正常系
```
[FirebaseClient] 初期化中...
[FirebaseClient] ✅ 初期化成功
[FirebaseClient] Project: dependrap-c30b4
[FirebaseClient] Database: https://dependrap-c30b4-default-rtdb.asia-northeast1.firebasedatabase.app
[FirebaseClient] ✅ サーバーに接続
[FirebaseClient] ルーム作成: ROOM_ABC123_XYZ
[FirebaseClient] ✅ ルーム作成成功: ROOM_ABC123_XYZ
```

### エラー系
```
[FirebaseClient] Config が必要です
[FirebaseClient] Firebase SDK が読み込まれていません
[FirebaseClient] Firebase に接続していません
[FirebaseClient] ルームが見つかりません
```

## テスト方法

### 1. ブラウザキャッシュをクリア
```
Cmd+Shift+R (Mac) または Ctrl+Shift+F5 (Windows)
```

### 2. DevTools コンソールを開く
```
F12 → Console タブ
```

### 3. ログを確認
```
[FirebaseClient] ✅ 初期化成功 が表示されるか確認
```

### 4. 接続状態を確認
```
[FirebaseClient] ✅ サーバーに接続 が表示されるか確認
```

### 5. ルーム操作をテスト
```
- ルーム作成
- ルーム参加
- Ready 状態設定
```

## 既存コードとの互換性

### 古い `FirebaseSync` API
```javascript
// 古い方法（使用不可）
FirebaseSync.init(callbacks)
FirebaseSync.createRoom(roomName)
```

### 新しい `firebaseClient` API
```javascript
// 新しい方法（推奨）
await firebaseClient.initialize(config)
await firebaseClient.createRoom(roomName)
```

## matchSetup.js の更新予定

`matchSetup.js` は以下のように更新する必要があります：

```javascript
// 古い方法
FirebaseSync.init({
  onStateChange: callback,
  onJoinedRoom: callback,
  // ...
});

// 新しい方法
await firebaseClient.initialize(window.FIREBASE_CONFIG);

firebaseClient.on('connected', () => {
  // 接続時の処理
});

firebaseClient.on('disconnected', () => {
  // 切断時の処理
});

const roomName = await firebaseClient.createRoom("MyRoom");
const unsubscribe = firebaseClient.watchRoom(roomName, (roomData) => {
  // ルーム更新時の処理
});
```

## トラブルシューティング

### 「Firebase SDK が読み込まれていません」
- Firebase SDK の CDN URL を確認
- ブラウザキャッシュをクリア
- 別のブラウザで試す

### 「Firebase に接続していません」
- インターネット接続を確認
- VPN を切ってみる
- ファイアウォール設定を確認

### 「net::ERR_NAME_NOT_RESOLVED」
- DNS 解決失敗
- VPN/ファイアウォールがブロック
- 別のネットワークで試す

## 次のステップ

1. ブラウザキャッシュをクリア
2. `login.html` でログイン
3. DevTools コンソールでログを確認
4. `index.html` で接続状態を確認
5. `matchSetup.html` でマッチング機能をテスト

## 変更履歴

### v3.0 (現在)
- クラスベースの設計に変更
- イベントベースの通知システム
- リスナー管理の自動化
- 接続状態の監視を強化
- エラーハンドリングを改善

### v2.0 (前バージョン)
- 接続状態監視を強化
- ハートビート機能を追加
- エラーハンドリングを改善

### v1.0 (初期バージョン)
- 基本的な Firebase 統合
- ルーム管理機能
- プレイヤー状態同期
