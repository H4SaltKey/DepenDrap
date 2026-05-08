# ✅ Firebase セットアップチェックリスト

このチェックリストに従って、DepenDrap Online を Firebase で動作させてください。

---

## 📋 ステップ 1: Firebase プロジェクト作成

- [ ] [Firebase Console](https://console.firebase.google.com/) にアクセス
- [ ] 「プロジェクトを作成」をクリック
- [ ] プロジェクト名を入力（例：`dependrap-online`）
- [ ] 「続行」をクリック
- [ ] Google Analytics を無効化
- [ ] 「プロジェクトを作成」をクリック
- [ ] プロジェクト作成完了を待つ（数分）

**メモ：プロジェクト ID = `_________________`**

---

## 📋 ステップ 2: Realtime Database 有効化

- [ ] Firebase Console で「Realtime Database」を選択
- [ ] 「データベースを作成」をクリック
- [ ] ロケーション：`asia-northeast1`（日本）を選択
- [ ] セキュリティルール：**テストモード**を選択
- [ ] 「有効にする」をクリック
- [ ] データベース作成完了を待つ

**メモ：Database URL = `_________________`**

---

## 📋 ステップ 3: Firebase 設定を取得

- [ ] Firebase Console で左上の歯車アイコン（⚙️）をクリック
- [ ] 「プロジェクト設定」を選択
- [ ] 「アプリ」セクションまでスクロール
- [ ] ウェブアイコン（`</>`）をクリック
- [ ] アプリ名を入力（例：`DepenDrap`）
- [ ] 「アプリを登録」をクリック
- [ ] 設定コードが表示される

**以下の値をコピーしてください：**

```
apiKey: _________________
authDomain: _________________
databaseURL: _________________
projectId: _________________
storageBucket: _________________
messagingSenderId: _________________
appId: _________________
```

---

## 📋 ステップ 4: HTML ファイルに設定を追加

### 4.1 index.html を編集

- [ ] `index.html` をテキストエディタで開く
- [ ] `<head>` セクション内の以下の部分を探す：

```html
<!-- Firebase Configuration -->
<script>
  window.FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    ...
  };
</script>
```

- [ ] `YOUR_API_KEY` をステップ 3 でコピーした `apiKey` に置き換え
- [ ] `YOUR_PROJECT_ID` をプロジェクト ID に置き換え
- [ ] その他の値も同様に置き換え
- [ ] ファイルを保存

### 4.2 matchSetup.html を編集

- [ ] `matchSetup.html` をテキストエディタで開く
- [ ] 同じ手順で Firebase 設定を追加
- [ ] ファイルを保存

### 4.3 game.html を編集

- [ ] `game.html` をテキストエディタで開く
- [ ] 同じ手順で Firebase 設定を追加
- [ ] ファイルを保存

**確認：** 3 つのファイルすべてに同じ Firebase 設定が追加されているか確認

---

## 📋 ステップ 5: ローカルでテスト

### 5.1 ローカルサーバーを起動

```bash
cd /Users/admin/GitHub/DepenDrap_Online
python3 -m http.server 8000
```

- [ ] ターミナルに「Serving HTTP on 0.0.0.0 port 8000」と表示される

### 5.2 ブラウザでアクセス

- [ ] ブラウザで `http://localhost:8000` にアクセス
- [ ] `index.html` が表示される

### 5.3 Firebase 接続確認

- [ ] ページ右上に「Firebase 接続済み ✓」と表示される
- [ ] 表示されない場合：
  - [ ] ブラウザコンソール（F12）でエラーを確認
  - [ ] Firebase 設定が正しいか確認
  - [ ] Firebase Console で Realtime Database が有効か確認

---

## 📋 ステップ 6: マルチプレイヤーテスト

### 6.1 プレイヤー 1 でテスト

- [ ] ブラウザ 1 で `http://localhost:8000` を開く
- [ ] プレイヤー名を入力（例：`Player1`）
- [ ] 「対戦開始」をクリック
- [ ] 「ルームを作成」をクリック
- [ ] ルームコードが表示される（例：`ROOM_ABC123`）
- [ ] デッキを選択
- [ ] 「READY」をクリック
- [ ] ステータスが「YOU: READY」に変わる

### 6.2 プレイヤー 2 でテスト

- [ ] ブラウザ 2（シークレットウィンドウ）で `http://localhost:8000` を開く
- [ ] 別のプレイヤー名を入力（例：`Player2`）
- [ ] 「対戦開始」をクリック
- [ ] プレイヤー 1 が作成したルームコードを入力
- [ ] 「コードで参加」をクリック
- [ ] ルームに参加できる
- [ ] 相手の名前が表示される
- [ ] デッキを選択
- [ ] 「READY」をクリック

### 6.3 ゲーム開始確認

- [ ] 両者が READY になると自動的に `game.html` に遷移
- [ ] ゲーム画面が表示される
- [ ] 両者のプレイヤー情報が表示される

---

## 📋 ステップ 7: GitHub にプッシュ

### 7.1 Git コミット

```bash
cd /Users/admin/GitHub/DepenDrap_Online
git add .
git commit -m "Add Firebase configuration and setup"
git push origin main
```

- [ ] コミットが成功
- [ ] GitHub にプッシュされた

### 7.2 GitHub Pages を有効化

- [ ] GitHub リポジトリを開く
- [ ] 「Settings」をクリック
- [ ] 左メニューから「Pages」を選択
- [ ] 「Source」で「Deploy from a branch」を選択
- [ ] ブランチを `main` に設定
- [ ] 「Save」をクリック
- [ ] 数分待つ

---

## 📋 ステップ 8: GitHub Pages でテスト

- [ ] GitHub Pages の URL を確認（例：`https://YOUR_USERNAME.github.io/DepenDrap_Online/`）
- [ ] ブラウザでアクセス
- [ ] 「Firebase 接続済み ✓」と表示される
- [ ] ローカルテストと同じ手順でマルチプレイヤーテスト
- [ ] すべて動作することを確認

---

## 🔍 トラブルシューティング

### 問題：「Firebase config が設定されていません」

**原因：** `window.FIREBASE_CONFIG` が HTML に正しく設定されていない

**解決方法：**
- [ ] HTML ファイルを開いて `window.FIREBASE_CONFIG` を確認
- [ ] すべての値が正しく設定されているか確認
- [ ] ブラウザキャッシュをクリア（Ctrl+Shift+Delete）
- [ ] ページをリロード

### 問題：ルームが作成できない

**原因：** Firebase Realtime Database に接続できていない

**解決方法：**
- [ ] ブラウザコンソール（F12）でエラーを確認
- [ ] Firebase Console で Realtime Database が有効か確認
- [ ] Firebase 設定が正しいか確認
- [ ] ネットワーク接続を確認

### 問題：相手が見えない

**原因：** 異なるルームに参加している、または同期が遅い

**解決方法：**
- [ ] 両者が同じルームコードで参加しているか確認
- [ ] ページをリロードして再度参加
- [ ] Firebase Console で「データ」タブを確認し、ルームデータが作成されているか確認

### 問題：GitHub Pages で動作しない

**原因：** Firebase 設定が GitHub Pages にプッシュされていない

**解決方法：**
- [ ] `git status` で変更が確認できるか確認
- [ ] `git push` でプッシュ
- [ ] GitHub Pages の URL をリロード（キャッシュクリア）

---

## 📚 参考資料

- [QUICKSTART.md](QUICKSTART.md) - 5分で始める
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - 詳細ガイド
- [FIREBASE_CONFIG_TEMPLATE.html](FIREBASE_CONFIG_TEMPLATE.html) - 設定ヘルパー
- [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) - 移行情報
- [README.md](README.md) - プロジェクト概要

---

## ✨ 完了！

すべてのチェックボックスにチェックが入ったら、セットアップ完了です！

🎮 **友達と遊びましょう！**

---

## 📞 サポート

問題が発生した場合：

1. ブラウザコンソール（F12）でエラーを確認
2. Firebase Console でプロジェクト設定を確認
3. このチェックリストのトラブルシューティングセクションを確認
4. [FIREBASE_SETUP.md](FIREBASE_SETUP.md) の詳細ガイドを確認

---

**最終確認日：** `_________________`  
**セットアップ完了者：** `_________________`
