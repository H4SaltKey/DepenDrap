# localStorageサイズ確認

**警告内容**: localStorage usage is near 5MB (8897.5KB)

ブラウザの開発者ツール（F12）のコンソールで以下を実行してください：

```javascript
// localStorage のアイテムサイズを確認
let items = [];
for (let key in localStorage) {
  if (localStorage.hasOwnProperty(key)) {
    const value = localStorage.getItem(key);
    const size = new Blob([value]).size;
    items.push({ key, size, sizeKB: (size / 1024).toFixed(2) });
  }
}

// サイズでソート
items.sort((a, b) => b.size - a.size);

console.table(items);
console.log(`合計: ${items.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024} MB`);
```

**予想される最大アイテム:**
- `savedFieldCards`: フィールド上のすべてのカード情報（通常ゲーム中に蓄積）
- `gameState`: ゲーム状態全体
- `deckCode` / `matchSetup`: デッキ情報

**対処方法:**
1. 不要なアイテムを削除: `localStorage.removeItem(key)`
2. ゲーム終了時にクリア: `localStorage.clear()` または特定アイテムのみクリア
