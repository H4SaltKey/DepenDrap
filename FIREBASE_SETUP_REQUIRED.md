# ⚠️ Firebase 設定が必要です

**重要**: ゲームを動作させるには、Firebase Config を設定する必要があります。

---

## 🔴 現在の状態

Firebase SDK は正常に読み込まれていますが、**Firebase Config が設定されていません**。

```
❌ window.FIREBASE_CONFIG が設定されていない
❌ Firebase アプリが初期化されていない
❌ ゲームが動作しない
```

---

## ✅ 解決方法（3ステップ）

### ステップ 1: Firebase プロジェクトを作成（2分）

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. 「プロジェクトを作成」をクリック
3. プロジェクト名を入力（例: `dependrap-online`）
4. 「続行」をクリック
5. Google Analytics は無効化
6. 「プロジェクトを作成」をクリック

### ステップ 2: Realtime Database を有効化（2分）

1. Firebase Console で、作成したプロジェクトを選択
2. 左メニューから「Realtime Database」を選択
3. 「データベースを作成」をクリック
4. ロケーション: **`asia-northeast1`**（日本）
5. セキュリティルール: **テストモード**
6. 「有効にする」をクリック

### ステップ 3: Firebase Config を取得して設定（3分）

#### 3-1: Firebase Config を取得

1. Firebase Console で、プロジェクトを選択
2. 左上の歯車アイコン（⚙️）をクリック
3. 「プロジェクト設定」を選択
4. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
5. 表示されたコードをコピー

**コピーされるコード例**:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "my-project.firebaseapp.com",
  databaseURL: "https://my-project-default-rtdb.asia-northeast1.firebasedatabase.app",
  projectId: "my-project",
  storageBucket: "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

#### 3-2: HTML ファイルを編集

以下の 4 つのファイルを編集してください：

**1. login.html**

ファイルを開いて、以下の部分を探します：

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

`YOUR_API_KEY` などを、Firebase Console からコピーした値に置き換えます：

```html
<script>
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyD...",
    authDomain: "my-project.firebaseapp.com",
    databaseURL: "https://my-project-default-rtdb.asia-northeast1.firebasedatabase.app",
    projectId: "my-project",
    storageBucket: "my-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
  };
</script>
```

**2. index.html** - 同じ内容を設定

**3. matchSetup.html** - 同じ内容を設定

**4. game.html** - 同じ内定を設定

---

## 🧪 テスト方法

### テスト 1: Firebase SDK が読み込まれているか確認

1. ブラウザで `firebase-test.html` を開く
2. テスト結果を確認

**正常な場合**:
```
✅ Firebase SDK 読み込み - PASS
✅ Firebase Database - PASS
```

**エラーの場合**:
```
❌ Firebase SDK 読み込み - FAIL
❌ Firebase Database - FAIL
```

### テスト 2: ブラウザコンソールで確認

1. ログイン画面を開く
2. F12 キーを押してコンソールを開く
3. 「Console」タブを確認
4. 以下を実行：

```javascript
console.log("firebase:", typeof firebase);
console.log("FIREBASE_CONFIG:", window.FIREBASE_CONFIG);
```

**正常な出力**:
```
firebase: object
FIREBASE_CONFIG: {apiKey: "...", authDomain: "...", ...}
```

**エラーの出力**:
```
firebase: undefined
FIREBASE_CONFIG: undefined
```

### テスト 3: ログイン画面でテスト

1. ブラウザキャッシュをクリア
   - Windows/Linux: `Ctrl + Shift + Delete`
   - Mac: `Cmd + Shift + Delete`

2. ログイン画面を開く

3. ブラウザコンソール（F12）で確認

**正常な場合**:
```
[Login] Firebase initialized successfully
[Login] Project ID: my-project
```

**エラーの場合**:
```
[Login] Firebase error: ReferenceError: firebase is not defined
```

---

## 📋 チェックリスト

### Firebase プロジェクト作成

- [ ] Firebase Console にアクセスした
- [ ] プロジェクトを作成した
- [ ] プロジェクト名を入力した
- [ ] Google Analytics を無効化した
- [ ] 「プロジェクトを作成」をクリックした

### Realtime Database 有効化

- [ ] Firebase Console でプロジェクトを選択した
- [ ] 「Realtime Database」を選択した
- [ ] 「データベースを作成」をクリックした
- [ ] ロケーション: `asia-northeast1` を選択した
- [ ] セキュリティルール: テストモード を選択した
- [ ] 「有効にする」をクリックした

### Firebase Config 設定

- [ ] Firebase Console でプロジェクト設定を開いた
- [ ] ウェブアイコン（`</>`）をクリックした
- [ ] Firebase Config をコピーした
- [ ] `login.html` を編集した
- [ ] `index.html` を編集した
- [ ] `matchSetup.html` を編集した
- [ ] `game.html` を編集した
- [ ] ブラウザキャッシュをクリアした
- [ ] ログイン画面を開いた
- [ ] ブラウザコンソールで確認した

---

## 🐛 トラブルシューティング

### エラー: "firebase is not defined"

**原因**: Firebase SDK が読み込まれていない

**解決方法**:
1. ブラウザキャッシュをクリア
2. ブラウザを再起動
3. ページをリロード
4. `firebase-test.html` でテスト

### エラー: "FIREBASE_CONFIG is not set"

**原因**: `window.FIREBASE_CONFIG` が設定されていない

**解決方法**:
1. HTML ファイルの `<head>` セクションに `window.FIREBASE_CONFIG` が設定されているか確認
2. Firebase Config の値が正しいか確認
3. ブラウザキャッシュをクリア
4. ページをリロード

### エラー: "Invalid API key provided"

**原因**: Firebase Config の `apiKey` が間違っている

**解決方法**:
1. Firebase Console で正しい `apiKey` を確認
2. HTML ファイルの `apiKey` を更新
3. ブラウザキャッシュをクリア
4. ページをリロード

### エラー: "Permission denied"

**原因**: Realtime Database が有効になっていない、またはセキュリティルールが設定されている

**解決方法**:
1. Firebase Console で Realtime Database が有効になっているか確認
2. セキュリティルールが「テストモード」に設定されているか確認
3. ページをリロード

---

## 📚 参考資料

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Realtime Database ドキュメント](https://firebase.google.com/docs/database)
- [FIREBASE_QUICK_START.md](FIREBASE_QUICK_START.md) - クイックスタート
- [firebase-test.html](firebase-test.html) - Firebase SDK テスト

---

## 🎯 次のステップ

1. Firebase プロジェクトを作成
2. Realtime Database を有効化
3. Firebase Config を取得
4. HTML ファイルを編集（4ファイル）
5. ブラウザキャッシュをクリア
6. `firebase-test.html` でテスト
7. ログイン画面でテスト
8. ゲームを開始

---

**重要**: Firebase Config を設定しないと、ゲームは動作しません。

必ず上記の手順に従って、Firebase Config を設定してください。
