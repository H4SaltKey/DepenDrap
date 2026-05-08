# 👤 アカウント管理とオンライン状態

## 実装内容

### 1. アカウント永続化

ログアウト後もアカウント情報は保持されます。

**ログアウト時の動作：**
- ✅ ユーザー名は保持される
- ✅ アカウント情報は削除されない
- ❌ ゲーム状態は削除される（matchSetup, gameState, fieldCards）
- ❌ オンライン状態はオフラインに設定される

**ログイン画面での動作：**
- ユーザー名の初期値は `ディペンド太郎` に設定
- 前回ログインしたユーザー名が入力欄に表示される
- ユーザーは名前を変更して別のアカウントでログインできる

### 2. オンライン状態管理

オンライン状態はサーバー側（Firebase）で管理されます。

**オンライン = ログイン中**
```
ログイン画面で「ENTER ARENA」をクリック
  ↓
isOnline = true
  ↓
Firebase に `players/{username}/status` を記録
```

**オフライン = ログアウト中**
```
「ログアウト」をクリック
  ↓
isOnline = false
  ↓
Firebase に `players/{username}/status` を更新
```

### 3. Firebase データ構造

```
players/
  {username}/
    status/
      isOnline: true/false
      lastSeen: timestamp
      sessionId: "abc123..."
```

---

## ファイル変更内容

### login.html

**変更 1: 初期値を変更**
```html
<!-- Before -->
<input type="text" id="username" placeholder="例: Naoki" maxlength="20">

<!-- After -->
<input type="text" id="username" placeholder="例: ディペンド太郎" 
       maxlength="20" value="ディペンド太郎">
```

**変更 2: ログイン時にオンライン状態を設定**
```javascript
// Before
localStorage.setItem("username", name);

// After
localStorage.setItem("username", name);
localStorage.setItem("isOnline", "true");
```

**変更 3: ログイン済みチェックを改善**
```javascript
// Before
if (saved) window.location.href = "index.html";

// After
if (saved && localStorage.getItem("isOnline") === "true") {
  window.location.href = "index.html";
}
```

### index.html

**変更: ログアウト時の処理**
```javascript
// Before
localStorage.removeItem("username");
localStorage.removeItem("matchSetup");

// After
// アカウント情報は保持
// ゲーム状態のみ削除
localStorage.removeItem("matchSetup");
localStorage.removeItem("gameState");
localStorage.removeItem("fieldCards");
localStorage.removeItem("gameStarted");
// オンライン状態をオフラインに
localStorage.setItem("isOnline", "false");
FirebaseSync.setOnlineStatus(false);
```

### js/firebase-sync.js

**変更 1: オンライン状態管理機能を追加**
```javascript
// オンライン状態を Firebase に記録
function setOnlineStatus(isOnline) {
  const statusRef = _db.ref(`players/${_username}/status`);
  const statusData = {
    isOnline: isOnline,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    sessionId: _mySessionId
  };
  statusRef.set(statusData);
}
```

**変更 2: 初期化時にオンライン状態を設定**
```javascript
// Firebase 初期化時
setOnlineStatus(true);
```

**変更 3: 公開 API に追加**
```javascript
window.FirebaseSync = {
  // ... 既存の API
  setOnlineStatus: setOnlineStatus
};
```

---

## 使用方法

### ログイン

1. ログイン画面を開く
2. ユーザー名が `ディペンド太郎` で入力されている
3. 名前を変更するか、そのまま「ENTER ARENA」をクリック
4. オンライン状態が `true` に設定される
5. Firebase に `players/{username}/status` が記録される

### ログアウト

1. タイトル画面で「ログアウト」をクリック
2. 確認ダイアログで「OK」をクリック
3. オンライン状態が `false` に設定される
4. Firebase に `players/{username}/status` が更新される
5. ゲーム状態は削除される
6. ユーザー名は保持される

### 別のアカウントでログイン

1. ログアウト
2. ログイン画面でユーザー名を変更
3. 「ENTER ARENA」をクリック
4. 新しいアカウントでログイン

---

## Firebase データ確認方法

### Firebase Console で確認

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. プロジェクトを選択
3. 「Realtime Database」を選択
4. 「データ」タブを確認
5. `players` → `{username}` → `status` を確認

**例：**
```json
{
  "players": {
    "ディペンド太郎": {
      "status": {
        "isOnline": true,
        "lastSeen": 1715000000000,
        "sessionId": "abc123def456"
      }
    }
  }
}
```

---

## ブラウザストレージ

### localStorage に保存される情報

| キー | 値 | 説明 |
|-----|-----|------|
| `username` | "ディペンド太郎" | ユーザー名（永続） |
| `isOnline` | "true" / "false" | オンライン状態 |
| `matchSetup` | JSON | マッチ設定（ゲーム中のみ） |
| `gameState` | JSON | ゲーム状態（ゲーム中のみ） |
| `fieldCards` | JSON | フィールドカード（ゲーム中のみ） |

### ログアウト時に削除される情報

- `matchSetup`
- `gameState`
- `fieldCards`
- `gameStarted`

### ログアウト時に保持される情報

- `username` ✅ 保持
- `deckList` ✅ 保持
- `levelStats` ✅ 保持

---

## セキュリティに関する注意

⚠️ **ローカルストレージについて**
- ローカルストレージはブラウザに保存される
- 同じブラウザを使用する他のユーザーがアカウント情報を見ることができる
- 共有パソコンの場合は注意が必要

⚠️ **Firebase セキュリティルール**
- 現在はテストモードで、誰でも読み書き可能
- 本番環境ではセキュリティルールを設定してください

**推奨セキュリティルール：**
```json
{
  "rules": {
    "players": {
      "$username": {
        ".read": true,
        ".write": "root.child('players').child($username).child('status').child('sessionId').val() === auth.uid",
        "status": {
          ".validate": "newData.hasChildren(['isOnline', 'lastSeen', 'sessionId'])"
        }
      }
    }
  }
}
```

---

## トラブルシューティング

### ログイン画面に戻ってしまう

**原因：** `isOnline` が `false` に設定されている

**解決方法：**
1. ログイン画面でユーザー名を入力
2. 「ENTER ARENA」をクリック
3. `isOnline` が `true` に設定される

### 別のアカウントでログインできない

**原因：** 前のアカウントの `isOnline` が `true` のまま

**解決方法：**
1. 前のアカウントで「ログアウト」をクリック
2. 新しいアカウント名を入力
3. 「ENTER ARENA」をクリック

### Firebase に status が記録されない

**原因：** Firebase 設定が正しくない

**解決方法：**
1. `window.FIREBASE_CONFIG` が設定されているか確認
2. Firebase Console で Realtime Database が有効か確認
3. ブラウザコンソール（F12）でエラーを確認

---

## API リファレンス

### FirebaseSync.setOnlineStatus(isOnline)

オンライン状態を設定します。

**パラメータ：**
- `isOnline` (boolean) - `true` でオンライン、`false` でオフライン

**例：**
```javascript
// オンラインに設定
FirebaseSync.setOnlineStatus(true);

// オフラインに設定
FirebaseSync.setOnlineStatus(false);
```

**内部動作：**
1. Firebase に `players/{username}/status` を記録
2. `lastSeen` をサーバー時刻に更新
3. `localStorage.isOnline` を更新

---

## 今後の拡張案

- [ ] オンラインプレイヤー一覧表示
- [ ] プレイヤーのステータス表示（オンライン/オフライン）
- [ ] 最後にオンラインだった時刻を表示
- [ ] フレンドリスト機能
- [ ] プレイヤープロフィール
- [ ] 戦績表示

---

**最終更新：** 2026-05-08  
**バージョン：** 1.0
