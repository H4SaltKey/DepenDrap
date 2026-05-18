/**
 * watcherRegistry.js
 * ウォッチャーの二重登録を防止するためのレジストリ
 */

window._activeWatchers = {};

window.registerWatcher = function(name, unsubscribeFn) {
  if (window._activeWatchers[name]) {
    console.log(`[WatcherRegistry] 旧ウォッチャー解除: ${name}`);
    try {
      window._activeWatchers[name]();
    } catch (e) {
      console.warn(`[WatcherRegistry] 解除エラー ${name}:`, e);
    }
    delete window._activeWatchers[name];
  }
  
  if (typeof unsubscribeFn === "function") {
    window._activeWatchers[name] = unsubscribeFn;
    console.log(`[WatcherRegistry] ウォッチャー登録: ${name}`);
  }
};

window.unregisterWatcher = function(name) {
  if (window._activeWatchers[name]) {
    try {
      window._activeWatchers[name]();
    } catch (e) {
      console.warn(`[WatcherRegistry] 解除エラー ${name}:`, e);
    }
    delete window._activeWatchers[name];
    console.log(`[WatcherRegistry] ウォッチャー解除完了: ${name}`);
  }
};

window.clearAllWatchers = function() {
  console.log(`[WatcherRegistry] 全ウォッチャー解除開始`);
  Object.keys(window._activeWatchers).forEach(name => {
    window.unregisterWatcher(name);
  });
};
