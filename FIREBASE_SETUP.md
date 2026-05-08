# Firebase セットアップガイド

このガイドでは、DepenDrap Online を Firebase Realtime Database で動作させるための手順を説明します。

## 概要

DepenDrap Online は GitHub Pages で完全に動作するスタティックなウェブアプリケーションです。マルチプレイヤー機能は Firebase Realtime Database を使用して実装されています。

- ✅ サーバー不要
- ✅ GitHub Pages でホスト可能
- ✅ リアルタイムマルチプレイヤー対応
- ✅ 無料で利用可能（Firebase の無料枠内）

---

## ステップ 1: Firebase プロジェクトを作成

### 1.1 Firebase Console にアクセス

[Firebase Console](https://console.firebase.google.com/) にアクセスしてください。

### 1.2 プロジェクトを作成

1. 「プロジェクトを作成」ボタンをクリック
2. プロジェクト名を入力（例：`dependrap-online`）
3. 「続行」をクリック
4. Google Analytics は不要なので、チェックボックスを外す
5. 「プロジェクトを作成」をクリック

プロジェクトの作成には数分かかります。

---

## ステップ 2: Realtime Database を有効化

### 2.1 Realtime Database を作成

1. Firebase Console で、左メニューから「Realtime Database」を選択
2. 「データベースを作成」ボタンをクリック
3. ロケーションを選択（推奨：`asia-northeast1` 日本）
4. セキュリティルールを選択：**テストモード**を選択
   - テストモードは開発用です。本番環境では後で変更してください。
5. 「有効にする」をクリック

Realtime Database が作成されます。

### 2.2 データベース URL を確認

1. Realtime Database ページで、「データ」タブを確認
2. ページ上部に表示される URL をメモ（例：`https://YOUR_PROJECT_ID-default-rtdb.asia-northeast1.firebasedatabase.app`）

---

## ステップ 3: Firebase 設定を取得

### 3.1 ウェブアプリを登録

1. Firebase Console で、左上の歯車アイコン（⚙️）をクリック
2. 「プロジェクト設定」を選択
3. 「アプリ」セクションまでスクロール
4. ウェブアイコン（`</>`）をクリック
5. アプリ名を入力（例：`DepenDrap`）
6. 「アプリを登録」をクリック

### 3.2 Firebase 設定コードをコピー

登録後、以下のような設定コードが表示されます：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "dependrap-online.firebaseapp.com",
  databaseURL: "https://dependrap-online-default-rtdb.asia-northeast1.firebasedatabase.app",
  projectId: "dependrap-online",
  storageBucket: "dependrap-online.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

この設定をコピーしてください。

---

## ステップ 4: HTML ファイルに Firebase 設定を追加

### 4.1 設定を追加

以下の 3 つのファイルを編集します：

- `index.html`
- `matchSetup.html`
- `game.html`

各ファイルの `<head>` セクション内に、以下のコードを追加してください：

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

### 4.2 値を置き換え

ステップ 3.2 でコピーした設定から、以下の値を置き換えてください：

| プレースホルダー | 置き換え元 |
|-----------------|----------|
| `YOUR_API_KEY` | `apiKey` |
| `YOUR_PROJECT_ID` | `projectId` |
| `YOUR_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `YOUR_APP_ID` | `appId` |

**例：**

```html
<script>
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyD1234567890abcdefghijklmnopqrst",
    authDomain: "dependrap-online.firebaseapp.com",
    databaseURL: "https://dependrap-online-default-rtdb.asia-northeast1.firebasedatabase.app",
    projectId: "dependrap-online",
    storageBucket: "dependrap-online.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
  };
</script>
```

---

## ステップ 5: ゲームをテスト

### 5.1 ローカルでテスト

```bash
# ローカルサーバーを起動（オプション）
python3 -m http.server 8000

# ブラウザで http://localhost:8000 にアクセス
```

または、ファイルを直接ブラウザで開く：

```bash
open index.html
```

### 5.2 テスト手順

1. **プレイヤー 1**
   - `index.html` を開く
   - プレイヤー名を入力
   - 「対戦開始」をクリック
   - ルームを作成
   - デッキを選択して「READY」をクリック

2. **プレイヤー 2**（別のブラウザまたはシークレットウィンドウ）
   - `index.html` を開く
   - 別のプレイヤー名を入力
   - 「対戦開始」をクリック
   - プレイヤー 1 が作成したルームに参加
   - デッキを選択して「READY」をクリック

3. **ゲーム開始**
   - 両者が READY になると自動的に `game.html` に遷移
   - ゲームが開始されます

---

## ステップ 6: GitHub Pages にデプロイ

### 6.1 GitHub にプッシュ

```bash
git add .
git commit -m "Add Firebase configuration"
git push origin main
```

### 6.2 GitHub Pages を有効化

1. GitHub リポジトリの「Settings」を開く
2. 左メニューから「Pages」を選択
3. 「Source」で「Deploy from a branch」を選択
4. ブランチを `main` に設定
5. 「Save」をクリック

### 6.3 アクセス

数分後、以下の URL でアクセス可能になります：

```
https://YOUR_USERNAME.github.io/DepenDrap_Online/
```

---

## セキュリティ設定（本番環境）

### ⚠️ テストモードについて

現在、Firebase Realtime Database はテストモードで設定されています。テストモードは開発用で、**本番環境では使用しないでください**。

### 本番環境用セキュリティルール

本番環境では、以下のセキュリティルールを設定してください：

1. Firebase Console で「Realtime Database」を開く
2. 「ルール」タブをクリック
3. 以下のルールをコピー＆ペースト：

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

4. 「公開」をクリック

このルールにより：
- 誰でもルーム情報を読み取り可能
- 誰でもルーム情報を書き込み可能
- プレイヤーデータは必須フィールドを含む必要がある

---

## トラブルシューティング

### Firebase が接続できない

**症状：** ブラウザコンソールに「Firebase config が設定されていません」と表示される

**解決方法：**
1. `window.FIREBASE_CONFIG` が HTML ファイルに正しく追加されているか確認
2. 設定値が正しいか確認（コピペミスがないか）
3. ブラウザキャッシュをクリア（Ctrl+Shift+Delete）

### ルームが作成できない

**症状：** 「ルームを作成」をクリックしても何も起こらない

**解決方法：**
1. ブラウザコンソール（F12）でエラーを確認
2. Firebase Console で Realtime Database が有効になっているか確認
3. ネットワーク接続を確認
4. Firebase のセキュリティルールを確認

### 相手が見えない

**症状：** ルームに参加しても相手が表示されない

**解決方法：**
1. 両者が同じルームコードで参加しているか確認
2. ブラウザコンソールで Firebase イベントを確認
3. ページをリロードして再度参加
4. Firebase Console で「データ」タブを確認し、ルームデータが作成されているか確認

### Firebase Console でデータが見えない

**症状：** Firebase Console の「データ」タブが空

**解決方法：**
1. ゲームでルームを作成したか確認
2. ブラウザコンソールでエラーを確認
3. Firebase のセキュリティルールを確認（テストモードか確認）

---

## Firebase 無料枠について

Firebase の無料枠（Spark プラン）では以下が利用可能です：

- **Realtime Database**: 1GB のストレージ、100 同時接続
- **Authentication**: 無制限
- **Hosting**: 1GB のストレージ、10GB/月の帯域幅

DepenDrap Online は軽量なため、無料枠で十分に動作します。

---

## 参考リンク

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Realtime Database ドキュメント](https://firebase.google.com/docs/database)
- [Firebase セキュリティルール](https://firebase.google.com/docs/database/security)

---

## サポート

問題が発生した場合は、以下を確認してください：

1. ブラウザコンソール（F12）でエラーメッセージを確認
2. Firebase Console でプロジェクト設定を確認
3. README.md のトラブルシューティングセクションを確認
