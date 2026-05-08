# 🚀 Firebase クイックスタート

**所要時間**: 5分  
**難易度**: ⭐ 簡単

---

## ✅ 確認: Firebase は正しい技術です

- ✅ Socket.io は使用していません
- ✅ Photon は使用していません
- ✅ すべてのマルチプレイヤー機能は Firebase で実装されています

---

## 🎯 必要な作業（3ステップ）

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

### ステップ 3: Firebase Config を設定（1分）

#### 3-1: Firebase Config を取得

1. Firebase Console で、プロジェクトを選択
2. 左上の歯車アイコン（⚙️）→ 「プロジェクト設定」
3. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
4. 表示されたコードをコピー

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

#### 3-2: HTML ファイルを更新

以下の 4 つのファイルを編集してください：

**1. login.html**
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

**4. game.html** - 同じ内容を設定

---

## 🧪 テスト（1分）

1. ブラウザキャッシュをクリア
   - **Windows/Linux**: Ctrl + Shift + Delete
   - **Mac**: Cmd + Shift + Delete

2. ログイン画面を開く

3. ブラウザコンソール（F12）を開く

4. 「Console」タブで以下を確認：
   ```
   [Firebase] ✅ Initialized successfully
   [Firebase] Project ID: my-project
   ```

5. CREATE ACCOUNT でアカウントを作成

6. ゲームを開始

---

## 🔍 トラブルシューティング

### エラー: "Firebase が初期化されていません"

**解決方法**:
1. HTML ファイルの `window.FIREBASE_CONFIG` が設定されているか確認
2. Firebase Config の値が正しいか確認
3. ブラウザキャッシュをクリア
4. ページをリロード

### エラー: "Invalid API key provided"

**解決方法**:
1. Firebase Console で正しい `apiKey` を確認
2. HTML ファイルの `apiKey` を更新
3. ブラウザキャッシュをクリア
4. ページをリロード

### エラー: "Permission denied"

**解決方法**:
1. Firebase Console で Realtime Database が有効になっているか確認
2. セキュリティルールが「テストモード」に設定されているか確認
3. ページをリロード

---

## 📚 詳細ドキュメント

- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - 詳細セットアップガイド
- [FIREBASE_CONNECTION_FIX.md](FIREBASE_CONNECTION_FIX.md) - トラブルシューティング
- [FIREBASE_CONFIRMED.md](FIREBASE_CONFIRMED.md) - 確認完了レポート
- [FIREBASE_IMPLEMENTATION_SUMMARY.md](FIREBASE_IMPLEMENTATION_SUMMARY.md) - 実装サマリー
- [FIREBASE_VERIFICATION.md](FIREBASE_VERIFICATION.md) - 技術検証レポート

---

## ✅ チェックリスト

- [ ] Firebase プロジェクトを作成
- [ ] Realtime Database を有効化
- [ ] Firebase Config を取得
- [ ] `login.html` を更新
- [ ] `index.html` を更新
- [ ] `matchSetup.html` を更新
- [ ] `game.html` を更新
- [ ] ブラウザキャッシュをクリア
- [ ] ログイン画面を開く
- [ ] ブラウザコンソールで確認
- [ ] CREATE ACCOUNT でテスト
- [ ] ゲームを開始

---

**所要時間**: 約 5分  
**難易度**: ⭐ 簡単  
**ステータス**: ✅ 準備完了
