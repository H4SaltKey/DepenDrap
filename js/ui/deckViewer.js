/**
 * deckViewer.js
 * オーバーレイUIから削除
 * 
 * 旧機能：ゲーム中にデッキ内容を確認するオーバーレイUI
 * 新方針：デッキ表示をフィールド直接配置に変更
 * 
 * このファイルは後方互換性のために残されています。
 * 関数は空実装されており、呼び出しがあってもエラーは発生しません。
 */

(function() {

/**
 * デッキ確認オーバーレイを開く（廃止）
 * フィールド直接配置に移行
 */
window.openDeckViewer = function() {
  console.log("[deckViewer] オーバーレイ機能は廃止されました。デッキ表示はフィールド直接配置に変更されています。");
  // 機能なし
};

/**
 * フェーズオーバーレイに「デッキを確認」ボタンを追加する（廃止）
 */
window.injectPhaseOverlayDeckBtn = function() {
  // 機能なし
};

/**
 * フェーズオーバーレイの「デッキを確認」ボタンを削除する（廃止）
 */
window.removePhaseOverlayDeckBtn = function() {
  // 機能なし
};

/**
 * デッキ確認オーバーレイを閉じる（廃止）
 */
window.closeDeckViewer = function() {
  // 機能なし
};

})();
