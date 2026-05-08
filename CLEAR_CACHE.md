# 🔄 ブラウザキャッシュをクリアする

Socket.io から Firebase への移行後、古いキャッシュが残っていると以下のエラーが表示されます：

```
socket-sync.js?v=1:40 [Socket] GitHub Pages detected...
Access to XMLHttpRequest at 'http://localhost:5000/socket.io/...' 
has been blocked by CORS policy
```

このエラーが表示される場合は、ブラウザキャッシュをクリアしてください。

---

## 🌐 ブラウザ別キャッシュクリア方法

### Chrome / Edge / Brave

**方法 1: キーボードショートカット**
```
Windows/Linux: Ctrl + Shift + Delete
Mac: Cmd + Shift + Delete
```

**方法 2: メニューから**
1. 右上の三点メニュー（⋮）をクリック
2. 「設定」を選択
3. 左メニューから「プライバシーとセキュリティ」を選択
4. 「閲覧履歴データの削除」をクリック
5. 「キャッシュされた画像とファイル」にチェック
6. 「データを削除」をクリック

### Firefox

**方法 1: キーボードショートカット**
```
Windows/Linux: Ctrl + Shift + Delete
Mac: Cmd + Shift + Delete
```

**方法 2: メニューから**
1. 右上のメニュー（☰）をクリック
2. 「設定」を選択
3. 左メニューから「プライバシーとセキュリティ」を選択
4. 「キャッシュ」セクションで「今すぐクリア」をクリック

### Safari

1. メニューバーから「Safari」を選択
2. 「履歴を削除」をクリック
3. 「すべての履歴」を選択
4. 「履歴を削除」をクリック

---

## 🔍 キャッシュがクリアされたか確認

1. ブラウザを再起動
2. `https://h4saltkey.github.io/DepenDrap_Online/` にアクセス
3. ブラウザコンソール（F12）を開く
4. 以下のメッセージが表示されるか確認：

```
✅ [Firebase] Initialized with config: YOUR_PROJECT_ID
✅ Firebase 接続済み ✓
```

以下のエラーが表示されないことを確認：

```
❌ socket-sync.js
❌ [Socket] Connecting to server
❌ CORS policy
```

---

## 🛡️ シークレットウィンドウでテスト

キャッシュの問題を確認するには、シークレットウィンドウ（プライベートブラウジング）を使用してください：

### Chrome / Edge
```
Ctrl + Shift + N (Windows/Linux)
Cmd + Shift + N (Mac)
```

### Firefox
```
Ctrl + Shift + P (Windows/Linux)
Cmd + Shift + P (Mac)
```

### Safari
```
Cmd + Shift + N
```

シークレットウィンドウでは常に新しいキャッシュが使用されるため、キャッシュの問題を排除できます。

---

## 📱 モバイルブラウザ

### iPhone Safari
1. 設定 → Safari
2. 「履歴とウェブサイトデータを削除」をタップ

### Android Chrome
1. 右上の三点メニュー（⋮）をタップ
2. 「設定」を選択
3. 「プライバシー」を選択
4. 「閲覧履歴データの削除」をタップ
5. 「キャッシュされた画像とファイル」にチェック
6. 「データを削除」をタップ

---

## 🔧 開発者向け: キャッシュバスティング

HTML ファイルのスクリプトタグに `?v=X` パラメータを追加することで、キャッシュをバイパスできます：

```html
<!-- キャッシュされる -->
<script src="js/firebase-sync.js"></script>

<!-- キャッシュをバイパス -->
<script src="js/firebase-sync.js?v=2"></script>
```

バージョン番号を変更すると、ブラウザは新しいファイルをダウンロードします。

---

## ✅ トラブルシューティング

### まだ socket-sync.js エラーが表示される

1. ブラウザを完全に閉じる
2. キャッシュをクリア
3. ブラウザを再起動
4. シークレットウィンドウで試す
5. 別のブラウザで試す

### Firebase が接続できない

1. `window.FIREBASE_CONFIG` が正しく設定されているか確認
2. Firebase Console でプロジェクトが有効か確認
3. Realtime Database が有効か確認
4. ネットワーク接続を確認

### 「Firebase config が設定されていません」と表示される

1. HTML ファイルの `<head>` セクションに Firebase 設定があるか確認
2. すべての値が正しく設定されているか確認
3. キャッシュをクリア
4. ページをリロード

---

## 📞 サポート

問題が解決しない場合：

1. ブラウザコンソール（F12）でエラーメッセージを確認
2. 別のブラウザで試す
3. シークレットウィンドウで試す
4. デバイスを再起動

---

**最後に更新：** 2026-05-08
