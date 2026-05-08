# 🚀 Firebase クイックスタート

DepenDrap Online を Firebase で動かすための最短手順です。

## 5分で始める

### ステップ 1: Firebase プロジェクトを作成（2分）

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. 「プロジェクトを作成」をクリック
3. プロジェクト名を入力（例：`dependrap`）
4. 「続行」→ Google Analytics は不要 → 「プロジェクトを作成」

### ステップ 2: Realtime Database を有効化（1分）

1. 左メニューから「Realtime Database」を選択
2. 「データベースを作成」をクリック
3. ロケーション：`asia-northeast1`（日本）
4. セキュリティルール：**テストモード**
5. 「有効にする」をクリック

### ステップ 3: Firebase 設定を取得（1分）

1. 左上の歯車アイコン（⚙️）→ 「プロジェクト設定」
2. 「アプリ」セクションで、ウェブアイコン（`</>`）をクリック
3. アプリ名を入力（例：`DepenDrap`）
4. 「アプリを登録」をクリック
5. 表示されたコードをコピー

### ステップ 4: HTML ファイルに設定を追加（1分）

以下の 3 つのファイルを編集：
- `index.html`
- `matchSetup.html`
- `game.html`

各ファイルの `<head>` セクション内に、以下を追加：

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

**Firebase Console から取得した値を置き換えてください。**

---

## テスト

### ローカルでテスト

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` にアクセス

### 確認項目

1. ✅ タイトル画面で「Firebase 接続済み ✓」と表示される
2. ✅ ルームを作成できる
3. ✅ ルームに参加できる
4. ✅ 別のブラウザで相手が見える
5. ✅ READY で両者がゲーム開始できる

---

## GitHub Pages にデプロイ

```bash
git add .
git commit -m "Add Firebase configuration"
git push origin main
```

リポジトリ設定で GitHub Pages を有効化：
- Settings → Pages
- Branch: `main`
- Save

数分後、`https://YOUR_USERNAME.github.io/DepenDrap_Online/` でアクセス可能

---

## トラブルシューティング

### 「Firebase config が設定されていません」と表示される

→ `window.FIREBASE_CONFIG` が HTML に正しく追加されているか確認

### ルームが作成できない

→ ブラウザコンソール（F12）でエラーを確認

### 相手が見えない

→ 両者が同じルームコードで参加しているか確認

---

## 詳細ガイド

- 詳しい手順：[FIREBASE_SETUP.md](FIREBASE_SETUP.md)
- 設定ヘルパー：[FIREBASE_CONFIG_TEMPLATE.html](FIREBASE_CONFIG_TEMPLATE.html)
- 移行情報：[MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)

---

## よくある質問

**Q: サーバーは必要ですか？**  
A: いいえ。Firebase と GitHub Pages だけで動作します。

**Q: 無料ですか？**  
A: はい。Firebase の無料枠で十分です。

**Q: 何人まで遊べますか？**  
A: 2人対戦です。複数の試合は同時に進行できます。

**Q: セキュリティは大丈夫ですか？**  
A: テストモードは開発用です。本番環境では Firebase のセキュリティルールを設定してください。

---

## 次のステップ

1. ✅ Firebase 設定を追加
2. ✅ ローカルでテスト
3. ✅ GitHub Pages にデプロイ
4. ⏭️ 友達と遊ぶ！

---

**Happy gaming! 🎮**
