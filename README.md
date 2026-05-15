# DepenDrap Online

Firebase Realtime Database によるオンラインカードゲーム。GitHub Pages で完全に動作します。

## クイックスタート

### 1. Firebase プロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを作成」をクリック
3. プロジェクト名を入力（例：`dependrap-online`）
4. 「続行」をクリック
5. Google Analytics は不要なので無効化
6. 「プロジェクトを作成」をクリック

### 2. Realtime Database を有効化

1. Firebase Console で、左メニューから「Realtime Database」を選択
2. 「データベースを作成」をクリック
3. ロケーションを選択（例：`asia-northeast1`）
4. セキュリティルールを選択：**テストモード**（開発用）
5. 「有効にする」をクリック

### 3. Firebase 設定を取得

1. Firebase Console で、左上の歯車アイコン → 「プロジェクト設定」
2. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
3. アプリ名を入力（例：`DepenDrap`）
4. 「アプリを登録」をクリック
5. 表示される設定コードをコピー

### 4. HTML ファイルに Firebase 設定を追加

`index.html`、`matchSetup.html`、`game.html` の `<head>` セクション内に、以下を追加：

```html
<script>
  window.FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-northeast1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
</script>
```

Firebase Console から取得した値を上記の `YOUR_*` 部分に置き換えてください。

### 5. ゲームをプレイ

1. `index.html` をブラウザで開く
2. プレイヤー名を入力
3. ルームを作成または参加
4. デッキを選択して READY
5. 相手も READY になるとゲーム開始

---

## ファイル構成

```
index.html          タイトル画面
login.html          プレイヤー名入力
matchSetup.html     ルーム作成・参加・デッキ選択
game.html           ゲーム画面
deckSelect.html     デッキ一覧
deck.html           デッキ構築

js/
  network/firebase-client.js  Firebase Realtime Database 接続・ルーム管理（メイン）
  network/messaging.js        画面通知・エラーメッセージ
  game/core.js                ゲーム状態管理
  game/game.js                ゲームUI・ロジック
  game/matchSetup.js          マッチング処理
  card/cardManager.js         カード・フィールド管理
  ui/menu.js                  メニューUI
  network/timerSync.js        タイマー同期（補助）
```

---

## 機能

### ルーム管理
- ルーム作成（自動生成またはカスタムコード）
- ルーム参加（コード入力）
- ルーム一覧表示（満員でないルームのみ）
- 自動退室（ページ離脱時）

### プレイヤーマッチング
- 2人プレイヤーの自動割り当て（player1/player2）
- Ready 状態の同期
- 両者 Ready で自動ゲーム開始

### ゲーム状態同期
- プレイヤーステータス（HP/EXP等）
- matchData（ターン/ダイス等）
- フィールドカード
- ゲームログ

---

## セキュリティ設定（本番環境）

テストモードは開発用です。本番環境では以下のセキュリティルールを設定してください：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        "players": {
          "$playerId": {
            ".validate": "newData.hasChildren(['sessionId', 'username', 'ready', 'joinedAt'])"
          }
        }
      }
    }
  }
}
```

---

## トラブルシューティング

### Firebase が接続できない

- ブラウザコンソールでエラーを確認
- `window.FIREBASE_CONFIG` が正しく設定されているか確認
- Firebase Console で Realtime Database が有効になっているか確認

### ルームが作成できない

- Firebase Console で Realtime Database のデータを確認
- ネットワーク接続を確認
- ブラウザコンソールでエラーを確認

### 相手が見えない

- 両者が同じルームに参加しているか確認
- ブラウザコンソールで Firebase イベントを確認
- ページをリロードして再度参加

---

## GitHub Pages へのデプロイ

1. このリポジトリを GitHub にプッシュ
2. リポジトリ設定で「Pages」を選択
3. ブランチを `main` に設定
4. `https://YOUR_USERNAME.github.io/DepenDrap_Online/` でアクセス可能

---

## 開発者向け情報

### Firebase Sync API

```javascript
// 初期化
FirebaseSync.init({
  onStateChange: (state) => {},      // connected/disconnected/error
  onJoinedRoom: (roomName, role) => {},
  onOpponentJoined: (actor) => {},
  onOpponentLeft: (actor) => {},
  onRoomList: (rooms) => {},
  onPlayerReady: (data) => {},
  onBothReady: (data) => {}
});

// ルーム操作
FirebaseSync.createRoom(roomName);    // ルーム作成
FirebaseSync.joinRoom(roomName);      // ルーム参加
FirebaseSync.leaveRoom();             // ルーム退出
FirebaseSync.markReady(isReady);      // Ready 状態を設定

// 状態確認
FirebaseSync.isConnected();           // Firebase 接続状態
FirebaseSync.isInRoom();              // ルーム参加状態
FirebaseSync.isHost();                // player1 か確認
```

### ローカル開発

```bash
# ローカルサーバーで実行（オプション）
python3 -m http.server 8000

# ブラウザで http://localhost:8000 にアクセス
```
