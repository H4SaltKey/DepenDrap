# DepenDrap Online

Photon Realtime + GitHub Pages によるオンラインカードゲーム。

## セットアップ手順

### 1. Photon App ID を取得

1. [Photon Dashboard](https://dashboard.photonengine.com/) にアクセス
2. 「CREATE A NEW APP」→ 「Realtime」を選択
3. App Name を入力して作成
4. 表示された **App ID** をコピー

### 2. App ID を設定

`js/photon-sync.js` の先頭を編集：

```javascript
const PHOTON_APP_ID = "ここに App ID を貼り付ける";
```

### 3. GitHub Pages で公開

1. このリポジトリを GitHub に push
2. Settings → Pages → Source: `main` ブランチ、`/ (root)` を選択
3. 数分後に `https://[username].github.io/[repo]/login.html` でアクセス可能

### 4. 遊び方

1. `login.html` でプレイヤー名を入力
2. `matchSetup.html` でルームを作成 or 参加
3. 両者が READY になると `game.html` へ自動遷移

## ファイル構成

```
index.html          タイトル画面
login.html          プレイヤー名入力（パスワード不要）
matchSetup.html     ルーム作成・参加・デッキ選択
game.html           ゲーム画面
deckSelect.html     デッキ一覧
deck.html           デッキ構築

js/
  photon-sync.js    Photon 接続・イベント管理（メイン）
  core.js           ゲーム状態管理
  game.js           ゲームUI・ロジック
  cardManager.js    カード・フィールド管理
  timerSync.js      タイマー同期（Photon.ServerTime ベース）
  matchSetup.js     マッチング処理
  menu.js           メニューUI
```

## 同期設計

| データ | 同期方法 |
|--------|---------|
| プレイヤーステータス（HP/EXP等） | RaiseEvent EV.PLAYER_STATE |
| matchData（ターン/ダイス等） | RaiseEvent EV.MATCH_DATA |
| フィールドカード | RaiseEvent EV.FIELD_CARDS |
| カード移動（高頻度） | RaiseEvent EV.CARD_MOVE |
| タイマー | RaiseEvent EV.TIMER_START（endTimestamp方式） |
| 再接続復元 | Room CustomProperties |

## 注意事項

- Photon Free プランは **20 CCU**（同時接続ユーザー数）まで無料
- `serve_secure.py` は不要（GitHub Pages では動かない）
- デッキデータは `localStorage` に保存（ブラウザ間で共有不可）
