# DepenDrap Online - デプロイメントガイド

## ローカル開発

### セットアップ

```bash
# 1. 依存関係をインストール
pip install -r requirements.txt

# 2. サーバーを起動
python3 server.py

# 3. ブラウザで http://localhost:5000 にアクセス
```

---

## 本番環境へのデプロイ

### Heroku へのデプロイ（推奨）

#### 1. Heroku CLI をインストール

**macOS:**
```bash
brew tap heroku/brew && brew install heroku
```

**Windows/Linux:**
https://devcenter.heroku.com/articles/heroku-cli

#### 2. Heroku にログイン

```bash
heroku login
```

#### 3. Heroku アプリを作成

```bash
heroku create your-app-name
```

#### 4. デプロイ

```bash
git push heroku main
```

#### 5. ログを確認

```bash
heroku logs --tail
```

#### 6. アプリにアクセス

```
https://your-app-name.herokuapp.com
```

---

### Render へのデプロイ

#### 1. Render にアクセス

https://render.com

#### 2. GitHub アカウントで接続

#### 3. New → Web Service を選択

#### 4. リポジトリを選択

#### 5. 設定

- **Name:** your-app-name
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `python3 server.py`
- **Environment:** Python 3

#### 6. デプロイ

「Create Web Service」をクリック

---

### Railway へのデプロイ

#### 1. Railway にアクセス

https://railway.app

#### 2. GitHub アカウントで接続

#### 3. 「New Project」を選択

#### 4. リポジトリを選択

#### 5. 自動デプロイ

Railway が自動的に `Procfile` を検出してデプロイします

---

## GitHub Pages との連携

GitHub Pages は **静的ホスティング** なので、Socket.io サーバーは動作しません。

### 推奨構成

```
GitHub Pages (フロントエンド)
    ↓
Heroku/Render/Railway (Socket.io サーバー)
```

socket-sync.js は自動的に以下を検出します：

- **ローカル開発:** `http://localhost:5000`
- **本番環境:** デプロイされたサーバーのURL

---

## トラブルシューティング

### ポート 5000 が既に使用されている

```bash
# 別のポートで起動
PORT=5001 python3 server.py
```

### サーバーが起動しない

```bash
# 依存関係を再インストール
pip install --upgrade pip
pip install -r requirements.txt

# サーバーを起動
python3 server.py
```

### クライアントが接続できない

1. サーバーが起動しているか確認
2. ファイアウォール設定を確認
3. ブラウザコンソールでエラーを確認

---

## 環境変数

### PORT

デフォルト: `5000`

Heroku/Render では自動的に設定されます。

```bash
PORT=8000 python3 server.py
```

---

## 本番環境での注意事項

- **CORS:** サーバーは全てのオリジンからのリクエストを受け入れます
- **ログ:** `logs/server.log` に記録されます
- **セッション:** メモリに保存されます（サーバー再起動で消失）

---

## 次のステップ

1. ローカルで開発・テスト
2. Heroku/Render にデプロイ
3. GitHub Pages から本番サーバーにアクセス
