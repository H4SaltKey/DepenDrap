# DepenDrap Online

Socket.io によるオンラインカードゲーム。

## クイックスタート

### ローカル開発（推奨）

```bash
# 1. 依存関係をインストール
pip install -r requirements.txt

# 2. サーバーを起動
python3 server.py

# 3. ブラウザで http://localhost:5000 にアクセス
```

### 本番環境へのデプロイ

詳細は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。

- **Heroku** - 推奨（無料）
- **Render** - 無料
- **Railway** - 無料

---

## セットアップ手順

### 1. 依存関係をインストール

```bash
pip install -r requirements.txt
```

### 2. サーバーを起動

```bash
python3 server.py
```

または

```bash
./start_server.sh
```

サーバーは `http://localhost:5000` で起動します。

### 3. ブラウザでアクセス

`http://localhost:5000` にアクセスして、`login.html` からゲームを開始します。

### 4. 遊び方

1. `login.html` でプレイヤー名を入力
2. `matchSetup.html` でルームを作成 or 参加
3. 両者が READY になると `game.html` へ自動遷移
4. ゲームをプレイ

---

## ファイル構成

```
server.py           Socket.io サーバー（Python/Flask）
requirements.txt    Python 依存関係
start_server.sh     サーバー起動スクリプト
Procfile            Heroku デプロイ設定
DEPLOYMENT.md       デプロイメントガイド

index.html          タイトル画面
login.html          プレイヤー名入力
matchSetup.html     ルーム作成・参加・デッキ選択
game.html           ゲーム画面
deckSelect.html     デッキ一覧
deck.html           デッキ構築

js/
  socket-sync.js    Socket.io 接続・イベント管理（メイン）
  core.js           ゲーム状態管理
  game.js           ゲームUI・ロジック
  cardManager.js    カード・フィールド管理
  timerSync.js      タイマー同期
  matchSetup.js     マッチング処理
  menu.js           メニューUI
```

---

## 同期設計

| データ | 同期方法 |
|--------|---------|
| プレイヤーステータス（HP/EXP等） | Socket.io emit: send_game_state |
| matchData（ターン/ダイス等） | Socket.io emit: send_game_state |
| フィールドカード | Socket.io emit: send_game_state |
| カード移動（高頻度） | Socket.io emit: send_action |
| タイマー | Socket.io emit: send_action |
| ルーム管理 | Socket.io emit: create_room / join_room |

---

## サーバー機能

- **ルーム管理** - ルーム作成・参加・削除
- **プレイヤーマッチング** - 2人プレイヤーの自動割り当て
- **ゲーム状態同期** - リアルタイムデータ送受信
- **接続管理** - 自動再接続・切断検出

---

## 注意事項

- デッキデータは `localStorage` に保存（ブラウザ間で共有不可）
- サーバーはローカルマシンで実行（LAN内での共有可能）
- 複数のサーバーインスタンスを起動する場合は、ポート番号を変更してください
- GitHub Pages では Socket.io サーバーが動作しません。本番環境へのデプロイが必要です

---

## トラブルシューティング

### サーバーが起動しない

```bash
pip install --upgrade pip
pip install -r requirements.txt
python3 server.py
```

### ポート 5000 が既に使用されている

`server.py` の最後の行を編集：

```python
socketio.run(app, host='0.0.0.0', port=5001, debug=False)  # ポート番号を変更
```

### クライアントが接続できない

- ファイアウォール設定を確認
- サーバーが起動しているか確認
- ブラウザコンソールでエラーを確認

---

## デプロイメント

詳細は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。
