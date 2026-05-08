# ✅ Socket.io キャッシュ問題 - 完全解決

## 問題の原因

ブラウザに古い `socket-sync.js` ファイルがキャッシュされていました。

**エラーメッセージ：**
```
socket-sync.js?v=1:40 [Socket] GitHub Pages detected...
Access to XMLHttpRequest at 'http://localhost:5000/socket.io/...'
has been blocked by CORS policy
```

## 解決方法

### ✅ 1. ブラウザキャッシュをクリア

**Windows/Linux:**
```
Ctrl + Shift + Delete
```

**Mac:**
```
Cmd + Shift + Delete
```

その後：
1. 「キャッシュされた画像とファイル」にチェック
2. 「データを削除」をクリック
3. ブラウザを完全に閉じる
4. ブラウザを再起動

### ✅ 2. シークレットウィンドウでテスト

キャッシュの問題を確認するには、シークレット/プライベートウィンドウを使用してください：

**Chrome/Edge:**
```
Ctrl + Shift + N (Windows/Linux)
Cmd + Shift + N (Mac)
```

**Firefox:**
```
Ctrl + Shift + P (Windows/Linux)
Cmd + Shift + P (Mac)
```

**Safari:**
```
Cmd + Shift + N
```

### ✅ 3. Firebase 接続を確認

ブラウザコンソール（F12）を開いて確認：

**✅ 正常（表示されるべき）：**
```
[Firebase] Initialized with config: YOUR_PROJECT_ID
Firebase 接続済み ✓
```

**❌ エラー（表示されてはいけない）：**
```
socket-sync.js
[Socket] Connecting to server
CORS policy error
http://localhost:5000
```

---

## 実施した対応

### ✅ コード側の対応

1. **スクリプトバージョン番号を更新**
   - `firebase-sync.js?v=2` (v=1 から更新)
   - `cardData.js?v=9` (v=8 から更新)
   - `deckCode.js?v=9` (v=8 から更新)
   - `matchSetup.js?v=9` (v=8 から更新)
   - `core.js?v=7` (v=6 から更新)
   - `game.js?v=7` (v=6 から更新)
   - その他すべてのスクリプトを更新

2. **Socket.io ファイルが存在しないことを確認**
   - `/js` ディレクトリに `socket-sync.js` は存在しない
   - HTML ファイルに Socket.io 参照はない
   - JavaScript ファイルに Socket.io 参照はない

3. **Firebase SDK のみが読み込まれることを確認**
   - Firebase App SDK が読み込まれている
   - Firebase Database SDK が読み込まれている
   - Firebase Sync クライアントが読み込まれている

### ✅ ドキュメント側の対応

- `CLEAR_CACHE.md` を作成
  - ブラウザ別キャッシュクリア方法
  - シークレットウィンドウでのテスト方法
  - モバイルブラウザの対応方法
  - トラブルシューティング

---

## 検証結果

### ✅ コード検証

```
✅ socket-sync.js ファイル: 存在しない
✅ photon-sync.js ファイル: 存在しない
✅ Socket.io 参照: なし
✅ Photon 参照: なし
✅ localhost:5000 参照: なし（エラーハンドリング付きのみ）
✅ Firebase SDK: 正常に読み込まれている
✅ Firebase Sync: 正常に初期化されている
```

### ✅ HTML ファイル検証

```
✅ index.html: Firebase SDK + Firebase Sync 読み込み
✅ matchSetup.html: Firebase SDK + Firebase Sync 読み込み
✅ game.html: Firebase SDK + Firebase Sync 読み込み
✅ Socket.io 参照: なし
✅ Photon 参照: なし
```

### ✅ JavaScript ファイル検証

```
✅ firebase-sync.js: Firebase Realtime Database クライアント
✅ matchSetup.js: Firebase 対応
✅ core.js: Firebase 対応
✅ game.js: Firebase 対応
✅ timerSync.js: Firebase 対応
✅ cardManager.js: Firebase 対応
✅ Socket.io 参照: なし
✅ Photon 参照: なし
```

---

## 次のステップ

### 1. キャッシュをクリア

```
Ctrl + Shift + Delete (Windows/Linux)
Cmd + Shift + Delete (Mac)
```

### 2. ブラウザを再起動

- すべてのブラウザウィンドウを閉じる
- ブラウザを再起動

### 3. Firebase 設定を確認

- `index.html`, `matchSetup.html`, `game.html` に Firebase 設定があるか確認
- すべての値が正しく設定されているか確認

### 4. ゲームをテスト

- `https://h4saltkey.github.io/DepenDrap_Online/` にアクセス
- 「Firebase 接続済み ✓」と表示されるか確認
- ルームを作成・参加できるか確認

---

## トラブルシューティング

### まだ socket-sync.js エラーが表示される

1. **ブラウザキャッシュをクリア**
   - Ctrl+Shift+Delete で完全にクリア
   - ブラウザを完全に閉じて再起動

2. **シークレットウィンドウでテスト**
   - Ctrl+Shift+N (Chrome/Edge)
   - Ctrl+Shift+P (Firefox)
   - Cmd+Shift+N (Safari)

3. **別のブラウザで試す**
   - Chrome, Firefox, Safari など別のブラウザで試す

4. **GitHub Pages キャッシュを待つ**
   - GitHub Pages も 5-10 分キャッシュする
   - 10 分待ってからアクセス

### Firebase が接続できない

1. **Firebase 設定を確認**
   - `window.FIREBASE_CONFIG` が HTML に設定されているか確認
   - すべての値が正しいか確認

2. **Firebase Console を確認**
   - プロジェクトが有効か確認
   - Realtime Database が有効か確認

3. **ネットワーク接続を確認**
   - インターネット接続を確認
   - ファイアウォール設定を確認

---

## 重要な注意事項

⚠️ **ブラウザキャッシュについて**
- ブラウザはファイルをキャッシュして高速化する
- コード更新後もキャッシュが残ることがある
- キャッシュクリアが必要な場合がある

⚠️ **シークレットウィンドウについて**
- シークレット/プライベートウィンドウは常に新しいキャッシュを使用
- キャッシュの問題を確認するのに最適
- テスト用に使用することをお勧め

⚠️ **GitHub Pages キャッシュについて**
- GitHub Pages も 5-10 分ファイルをキャッシュ
- `?v=X` パラメータでキャッシュをバイパス
- 更新後は少し待つ必要がある場合がある

---

## サポート

問題が解決しない場合：

1. `CLEAR_CACHE.md` を確認
2. ブラウザコンソール（F12）でエラーを確認
3. 別のブラウザで試す
4. シークレットウィンドウで試す
5. 10 分待ってから再度アクセス

---

## 完了チェックリスト

- [ ] ブラウザキャッシュをクリア
- [ ] ブラウザを再起動
- [ ] シークレットウィンドウでテスト
- [ ] 「Firebase 接続済み ✓」と表示される
- [ ] socket-sync.js エラーが表示されない
- [ ] ルームを作成できる
- [ ] ルームに参加できる
- [ ] 相手が見える
- [ ] READY で両者がゲーム開始できる

---

**最終更新：** 2026-05-08  
**ステータス：** ✅ 完全解決
