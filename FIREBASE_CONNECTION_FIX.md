# 🔧 Firebase 接続エラー解決ガイド

## 問題の原因

「Firebase が初期化されていません」というエラーが表示される場合、以下の原因が考えられます。

### ❌ 原因 1: `window.FIREBASE_CONFIG` が設定されていない

**症状:**
```
Firebase が初期化されていません。ページをリロードしてください。
```

**ブラウザコンソール:**
```
[Login] FIREBASE_CONFIG is not set in window
[Login] Please add window.FIREBASE_CONFIG to <head> section
```

**解決方法:**
`login.html`, `index.html`, `matchSetup.html`, `game.html` の `<head>` セクションに以下を追加してください。

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

### ❌ 原因 2: Firebase SDK が読み込まれていない

**症状:**
```
firebase is not defined
```

**ブラウザコンソール:**
```
Uncaught ReferenceError: firebase is not defined
```

**解決方法:**
HTML ファイルに以下の行があるか確認してください。

```html
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js"></script>
```

### ❌ 原因 3: Firebase 設定値が間違っている

**症状:**
```
Invalid API key provided.
```

**ブラウザコンソール:**
```
[Firebase] ❌ Initialization error: FirebaseError: Invalid API key provided.
```

**解決方法:**
1. [Firebase Console](https://console.firebase.google.com/) を開く
2. プロジェクトを選択
3. 左上の歯車アイコン（⚙️）→ 「プロジェクト設定」
4. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
5. 表示されたコードから正しい値をコピー
6. HTML ファイルの `window.FIREBASE_CONFIG` を更新

### ❌ 原因 4: Firebase プロジェクトが作成されていない

**症状:**
```
Cannot read property 'ref' of null
```

**ブラウザコンソール:**
```
[Login] Firebase not initialized. Check FIREBASE_CONFIG.
```

**解決方法:**
1. [Firebase Console](https://console.firebase.google.com/) を開く
2. 「プロジェクトを作成」をクリック
3. プロジェクト名を入力
4. 「続行」をクリック
5. Google Analytics は不要なので無効化
6. 「プロジェクトを作成」をクリック

### ❌ 原因 5: Realtime Database が有効になっていない

**症状:**
```
Permission denied
```

**ブラウザコンソール:**
```
[Firebase] ❌ Initialization error: FirebaseError: Permission denied
```

**解決方法:**
1. Firebase Console を開く
2. 「Realtime Database」を選択
3. 「データベースを作成」をクリック
4. ロケーション：`asia-northeast1`（日本）
5. セキュリティルール：**テストモード**
6. 「有効にする」をクリック

---

## ✅ 解決手順

### ステップ 1: Firebase 設定を確認

ブラウザコンソール（F12）で以下を実行：

```javascript
console.log("FIREBASE_CONFIG:", window.FIREBASE_CONFIG);
```

**正常な出力:**
```
FIREBASE_CONFIG: {
  apiKey: "AIzaSyD...",
  authDomain: "project.firebaseapp.com",
  databaseURL: "https://project-default-rtdb.asia-northeast1.firebasedatabase.app",
  projectId: "project-id",
  storageBucket: "project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

**エラー出力:**
```
FIREBASE_CONFIG: undefined
```

### ステップ 2: Firebase SDK が読み込まれているか確認

ブラウザコンソールで以下を実行：

```javascript
console.log("firebase:", typeof firebase);
```

**正常な出力:**
```
firebase: object
```

**エラー出力:**
```
firebase: undefined
```

### ステップ 3: Firebase 初期化状態を確認

ブラウザコンソールで以下を実行：

```javascript
console.log("Firebase apps:", firebase.apps);
```

**正常な出力:**
```
Firebase apps: [App]
```

**エラー出力:**
```
Firebase apps: []
```

### ステップ 4: ブラウザキャッシュをクリア

```
Windows/Linux: Ctrl + Shift + Delete
Mac: Cmd + Shift + Delete
```

1. 「キャッシュされた画像とファイル」にチェック
2. 「データを削除」をクリック
3. ブラウザを再起動

### ステップ 5: ページをリロード

```
F5 または Ctrl + R
```

---

## 📋 チェックリスト

- [ ] `window.FIREBASE_CONFIG` が `<head>` セクションに設定されている
- [ ] Firebase SDK CDN が読み込まれている
- [ ] Firebase プロジェクトが作成されている
- [ ] Realtime Database が有効になっている
- [ ] Firebase 設定値が正しい
- [ ] ブラウザキャッシュがクリアされている
- [ ] ページがリロードされている
- [ ] ブラウザコンソールにエラーがない

---

## 🔍 デバッグ方法

### ブラウザコンソールでエラーを確認

1. ログイン画面を開く
2. F12 キーを押してコンソールを開く
3. 「Console」タブを確認
4. エラーメッセージを記録

### Firebase 接続テスト

ブラウザコンソールで以下を実行：

```javascript
// Firebase 設定を確認
console.log("1. FIREBASE_CONFIG:", window.FIREBASE_CONFIG);

// Firebase SDK を確認
console.log("2. firebase:", typeof firebase);

// Firebase アプリを確認
console.log("3. Firebase apps:", firebase.apps);

// Firebase Database を確認
if (firebase.apps.length > 0) {
  const db = firebase.database();
  console.log("4. Database:", db);
  
  // テスト読み込み
  db.ref("test").once("value").then(snapshot => {
    console.log("5. Database connection: OK");
  }).catch(e => {
    console.error("5. Database connection error:", e);
  });
}
```

---

## 🆘 それでも解決しない場合

### 1. 別のブラウザで試す

- Chrome
- Firefox
- Safari
- Edge

### 2. シークレットウィンドウで試す

```
Chrome/Edge: Ctrl + Shift + N
Firefox: Ctrl + Shift + P
Safari: Cmd + Shift + N
```

### 3. Firebase Console で確認

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. プロジェクトを選択
3. 「Realtime Database」を選択
4. 「データ」タブを確認
5. データが表示されるか確認

### 4. ネットワーク接続を確認

- インターネット接続を確認
- ファイアウォール設定を確認
- VPN を使用している場合は無効化

### 5. ブラウザ拡張機能を無効化

- 広告ブロッカー
- VPN 拡張機能
- セキュリティ拡張機能

---

## 📚 参考資料

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Realtime Database ドキュメント](https://firebase.google.com/docs/database)
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - 詳細セットアップガイド
- [QUICKSTART.md](QUICKSTART.md) - 5分で始める

---

## 🔐 Firebase 接続の仕組み

### 正常な流れ

```
1. HTML ファイルが読み込まれる
   ↓
2. <head> セクションで window.FIREBASE_CONFIG が設定される
   ↓
3. Firebase SDK CDN が読み込まれる
   ↓
4. JavaScript コードが実行される
   ↓
5. firebase.initializeApp(firebaseConfig) が実行される
   ↓
6. Firebase アプリが初期化される
   ↓
7. firebase.database() で Database インスタンスを取得
   ↓
8. db.ref() で参照を作成
   ↓
9. db.ref().once('value') でデータを読み込み
   ↓
10. ✅ Firebase 接続成功
```

### エラーが発生する流れ

```
1. HTML ファイルが読み込まれる
   ↓
2. window.FIREBASE_CONFIG が設定されていない ❌
   ↓
3. firebase.initializeApp() が実行されない
   ↓
4. Firebase アプリが初期化されない
   ↓
5. db が null のままになる
   ↓
6. db.ref() を実行しようとする
   ↓
7. ❌ エラー: Cannot read property 'ref' of null
```

---

## 💡 よくある質問

### Q: 「Firebase に接続できません」と表示されます

**A:** 以下を確認してください：
1. `window.FIREBASE_CONFIG` が設定されているか
2. Firebase SDK が読み込まれているか
3. Firebase プロジェクトが作成されているか
4. Realtime Database が有効になっているか

### Q: ブラウザコンソールに何も表示されません

**A:** 以下を確認してください：
1. F12 キーを押してコンソールを開いているか
2. 「Console」タブを選択しているか
3. ページをリロードしているか

### Q: Firebase 設定値をどこから取得しますか

**A:** Firebase Console から取得します：
1. [Firebase Console](https://console.firebase.google.com/) を開く
2. プロジェクトを選択
3. 左上の歯車アイコン（⚙️）→ 「プロジェクト設定」
4. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
5. 表示されたコードから値をコピー

### Q: 複数の HTML ファイルに設定を追加する必要がありますか

**A:** はい、以下のファイルすべてに追加してください：
- `login.html`
- `index.html`
- `matchSetup.html`
- `game.html`

---

**最終更新：** 2026-05-08  
**バージョン：** 1.0
