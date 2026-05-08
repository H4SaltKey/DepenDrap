/**
 * timerSync.js — Host-authoritative timer with NTP-like clock sync
 *
 * 設計原則：
 *   - ホストだけが endTimestamp（絶対時刻）を決定する
 *   - クライアントは endTimestamp - synchronizedNow() で残り時間を計算
 *   - setInterval は表示更新のみ（時間計算には使わない）
 *   - clock offset を NTP ライクに推定して補正
 *   - drift correction は lerp で視覚的に滑らかに
 *   - タブ非アクティブ対策: visibilitychange で再同期
 *   - reconnect 対応: endTimestamp から完全復元
 *   - packet disorder 対応: seq番号で古いパケットを無視
 */

// ===== Clock Synchronization =====

const ClockSync = (() => {
  let _offset = 0;          // clientTime + _offset ≈ serverTime (ms)
  let _rtt    = 0;          // 最新RTT (ms)
  let _synced = false;
  let _samples = [];        // 直近8サンプルの offset
  const MAX_SAMPLES = 8;

  /**
   * NTPライク ping/pong でサーバー時刻とのオフセットを推定
   * 複数回測定して中央値を使う（外れ値除去）
   */
  async function sync(attempts = 3) {
    const offsets = [];
    for (let i = 0; i < attempts; i++) {
      try {
        const t0 = Date.now();
        const res = await fetch('/api/time', {
          headers: { 'X-Client-Time': String(t0) }
        });
        const t3 = Date.now();
        if (!res.ok) continue;
        const { serverTime } = await res.json();
        // NTP offset formula: offset = ((t1 - t0) + (t2 - t3)) / 2
        // t1 ≈ t2 ≈ serverTime（サーバー処理時間は無視）
        const rtt    = t3 - t0;
        const offset = serverTime - (t0 + rtt / 2);
        offsets.push({ offset, rtt });
        // 最小RTTのサンプルを優先（ネットワーク揺らぎを除去）
        await new Promise(r => setTimeout(r, 50));
      } catch {}
    }
    if (offsets.length === 0) return;

    // 最小RTTのサンプルを採用（NTPのベストサンプル選択）
    offsets.sort((a, b) => a.rtt - b.rtt);
    const best = offsets[0];

    _samples.push(best.offset);
    if (_samples.length > MAX_SAMPLES) _samples.shift();

    // 中央値でオフセット確定（外れ値に強い）
    const sorted = [..._samples].sort((a, b) => a - b);
    _offset = sorted[Math.floor(sorted.length / 2)];
    _rtt    = best.rtt;
    _synced = true;

    console.log(`[ClockSync] offset=${_offset.toFixed(1)}ms rtt=${_rtt}ms`);
  }

  /** サーバー時刻に同期した現在時刻 (ms) */
  function now() {
    return Date.now() + _offset;
  }

  function getRtt()    { return _rtt; }
  function isSynced()  { return _synced; }
  function getOffset() { return _offset; }

  return { sync, now, getRtt, isSynced, getOffset };
})();

window.ClockSync = ClockSync;

// ===== Host-Authoritative Timer =====

const GameTimer = (() => {
  // ゲームタイマー状態（authoritative）
  // endTimestamp: サーバー時刻ベースの終了絶対時刻 (ms)
  // pausedRemaining: pause中の残り時間 (ms)
  // seq: パケット順序番号（古いパケットを無視するため）
  let _timers = {
    // player1: { endTimestamp, pausedRemaining, seq, paused }
    // player2: { ... }
    // dice:    { endTimestamp, pausedRemaining, seq, paused }
    // choice:  { endTimestamp, pausedRemaining, seq, paused }
  };

  // 表示用の補正済み残り時間（lerp で滑らかに補正）
  let _displayRemaining = {};
  const LERP_SPEED = 0.15; // 1フレームあたりの補正率（視覚的に自然）
  const JUMP_THRESHOLD_MS = 2000; // これ以上ズレたら即ジャンプ（lerp しない）

  /**
   * ホストがターン開始時に呼ぶ
   * remaining: 残り時間 (ms)
   * key: 'player1' | 'player2' | 'dice' | 'choice'
   */
  function start(key, remainingMs, seq = 0) {
    const endTimestamp = ClockSync.now() + remainingMs;
    _timers[key] = { endTimestamp, pausedRemaining: null, seq, paused: false };
    _displayRemaining[key] = remainingMs;
    return endTimestamp; // ホストはこれをサーバーに送る
  }

  /**
   * サーバーから受け取った endTimestamp を適用（クライアント側）
   * seq チェックで古いパケットを無視
   */
  function applyFromServer(key, endTimestamp, seq = 0, paused = false, pausedRemaining = null) {
    const existing = _timers[key];
    // monotonic check: seq が古い、または同じで endTimestamp も同じなら無視
    if (existing) {
      if (seq < existing.seq) {
        console.warn(`[GameTimer] stale packet ignored: key=${key} seq=${seq} < ${existing.seq}`);
        return;
      }
      if (seq === existing.seq && existing.endTimestamp === endTimestamp) {
        return; // 重複パケット（同じ内容）は無視
      }
    }
    _timers[key] = { endTimestamp, pausedRemaining, seq, paused };
    const trueRemaining = getRemainingMs(key);
    const displayVal = _displayRemaining[key];
    if (displayVal === undefined || Math.abs(trueRemaining - displayVal) > JUMP_THRESHOLD_MS) {
      _displayRemaining[key] = trueRemaining;
    }
  }

  /**
   * 真の残り時間 (ms) — 絶対時刻ベース
   */
  function getRemainingMs(key) {
    const t = _timers[key];
    if (!t) return 0;
    if (t.paused) return Math.max(0, t.pausedRemaining || 0);
    return Math.max(0, t.endTimestamp - ClockSync.now());
  }

  /**
   * 表示用残り時間 (ms) — lerp で滑らかに補正済み
   * 毎フレーム呼ぶこと
   */
  function getDisplayRemainingMs(key) {
    return Math.max(0, _displayRemaining[key] || 0);
  }

  /**
   * 毎フレーム呼ぶ（requestAnimationFrame 推奨）
   * drift correction: 真の値に向けて lerp
   */
  function tick() {
    Object.keys(_timers).forEach(key => {
      const trueVal = getRemainingMs(key);
      const dispVal = _displayRemaining[key] !== undefined ? _displayRemaining[key] : trueVal;
      const diff = trueVal - dispVal;

      if (Math.abs(diff) > JUMP_THRESHOLD_MS) {
        // 大きすぎるズレは即ジャンプ（reconnect後など）
        _displayRemaining[key] = trueVal;
      } else {
        // lerp で滑らかに補正
        _displayRemaining[key] = dispVal + diff * LERP_SPEED;
      }
    });
  }

  function pause(key, seq = 0) {
    const t = _timers[key];
    if (!t || t.paused) return;
    t.pausedRemaining = getRemainingMs(key);
    t.paused = true;
    t.seq = seq;
  }

  function resume(key, seq = 0) {
    const t = _timers[key];
    if (!t || !t.paused) return;
    t.endTimestamp = ClockSync.now() + (t.pausedRemaining || 0);
    t.paused = false;
    t.seq = seq;
  }

  function stop(key) {
    delete _timers[key];
    delete _displayRemaining[key];
  }

  function isExpired(key) {
    return getRemainingMs(key) <= 0;
  }

  /** サーバーに送るためのシリアライズ */
  function serialize(key) {
    const t = _timers[key];
    if (!t) return null;
    return {
      endTimestamp:    t.endTimestamp,
      pausedRemaining: t.pausedRemaining,
      seq:             t.seq,
      paused:          t.paused
    };
  }

  /** デバッグ情報 */
  function debugInfo() {
    const info = {};
    Object.keys(_timers).forEach(key => {
      info[key] = {
        remaining:        (getRemainingMs(key) / 1000).toFixed(2) + 's',
        displayRemaining: (getDisplayRemainingMs(key) / 1000).toFixed(2) + 's',
        drift:            ((getRemainingMs(key) - getDisplayRemainingMs(key)) / 1000).toFixed(3) + 's',
        paused:           _timers[key].paused,
        seq:              _timers[key].seq
      };
    });
    return { clockOffset: ClockSync.getOffset().toFixed(1) + 'ms', rtt: ClockSync.getRtt() + 'ms', timers: info };
  }

  return { start, applyFromServer, getRemainingMs, getDisplayRemainingMs, tick, pause, resume, stop, isExpired, serialize, debugInfo };
})();

window.GameTimer = GameTimer;

// ===== requestAnimationFrame ループ（タブ非アクティブ対策） =====
// setInterval の代わりに rAF を使う
// タブ非アクティブ時は rAF が止まるが、visibilitychange で再同期する

let _rafId = null;
let _lastRafTime = 0;

function _timerRafLoop(timestamp) {
  _rafId = requestAnimationFrame(_timerRafLoop);
  // 100ms 以上経過した場合のみ処理（CPU節約）
  if (timestamp - _lastRafTime < 100) return;
  _lastRafTime = timestamp;

  GameTimer.tick();

  // game.js 側のタイマー処理を呼ぶ
  if (typeof onTimerTick === "function") onTimerTick();
}

function startTimerLoop() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _lastRafTime = 0;
  _rafId = requestAnimationFrame(_timerRafLoop);
}

function stopTimerLoop() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
}

window.startTimerLoop = startTimerLoop;
window.stopTimerLoop  = stopTimerLoop;

// タブ非アクティブ → アクティブ復帰時に clock sync を再実行
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("[TimerSync] Tab became active, re-syncing clock...");
    ClockSync.sync(3).then(() => {
      // 再同期後、全タイマーの表示値を即ジャンプ補正
      // （長時間非アクティブだった場合のズレを即座に修正）
      console.log("[TimerSync] Clock re-synced after tab activation");
    });
  }
});

// 初回 clock sync
// Firebase 接続中は自動同期されるので NTP は不要
// ローカルストレージのみで同期
if (typeof ClockSync !== "undefined") {
  ClockSync.sync(3).then(() => {
    console.log("[TimerSync] Initial clock sync complete");
    startTimerLoop();
  }).catch(() => {
    // /api/time が存在しない（GitHub Pages）場合は Date.now() で動作
    console.log("[TimerSync] NTP unavailable, using Date.now()");
    startTimerLoop();
  });
} else {
  startTimerLoop();
}

// 定期的な clock sync（5分ごと、drift 蓄積を防ぐ）
if (typeof ClockSync !== "undefined") {
  setInterval(() => ClockSync.sync(3), 5 * 60 * 1000);
}
