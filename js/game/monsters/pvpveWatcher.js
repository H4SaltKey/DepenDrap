/**
 * pvpveWatcher.js
 * Firebase の pvpve ノードを監視してモンスター状態を同期する
 * 既存の roomWatcher を変更しない
 */

(function() {

  let _pvpveRef = null;
  let _pvpveListener = null;
  let _lastRoundSeen = 0;

  /**
   * pvpve ウォッチャーを開始
   * setupRoomWatcher() の後に呼ばれる想定
   */
  window.startPvpveWatcher = function() {
    const gameRoom = localStorage.getItem("gameRoom");
    if (!gameRoom || !window.firebaseClient?.db) return;

    stopPvpveWatcher();

    _pvpveRef = window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve`);
    _pvpveListener = _pvpveRef.on("value", (snap) => {
      if (!snap) return;
      const data = snap.val();
      if (!data) return;

      // MonsterCombatSystem に反映
      if (typeof window.MonsterCombatSystem?.applyRemoteState === "function") {
        window.MonsterCombatSystem.applyRemoteState(data);
      }

      // UI 更新
      if (typeof window.MonsterUI?.render === "function") {
        window.MonsterUI.render();
      }
      if (typeof window.MonsterUI?.renderTargetBadge === "function") {
        window.MonsterUI.renderTargetBadge();
      }
    });

    console.log("[pvpveWatcher] 開始:", gameRoom);
  };

  function stopPvpveWatcher() {
    if (_pvpveRef && _pvpveListener) {
      _pvpveRef.off("value", _pvpveListener);
      _pvpveRef = null;
      _pvpveListener = null;
    }
  }

  window.stopPvpveWatcher = stopPvpveWatcher;

  // ===== ラウンド変化を検知してモンスター初期化 =====
  // update() が呼ばれるたびにチェック（既存の update フックを使う）
  const _origUpdate = window.update;
  // update は game.js で定義されるため、DOMContentLoaded 後にフックする
  document.addEventListener("DOMContentLoaded", () => {
    // update() が定義されるまで待つ
    const waitForUpdate = setInterval(() => {
      if (typeof window.update !== "function") return;
      clearInterval(waitForUpdate);

      const _origUpdate = window.update;
      window.update = function(skipLogCheck) {
        _origUpdate.call(this, skipLogCheck);
        _onAfterUpdate();
      };
    }, 200);
  });

  function _onAfterUpdate() {
    const m = window.state?.matchData;
    if (!m || m.status !== "playing") return;

    const round = m.round || 1;

    // ラウンドが変わったらモンスターを初期化（先攻プレイヤーのみ実行して競合防止）
    if (round !== _lastRoundSeen) {
      _lastRoundSeen = round;
      const me = window.myRole || "player1";
      if (me === (m.firstPlayer || "player1")) {
        if (typeof window.MonsterCombatSystem?.onRoundStart === "function") {
          window.MonsterCombatSystem.onRoundStart(round);
        }
      }
      // ターゲット変更ボタンを表示
      if (typeof window.MonsterUI?.showTargetChangeButton === "function") {
        window.MonsterUI.showTargetChangeButton();
      }
    }

    // UI 更新
    if (typeof window.MonsterUI?.render === "function") {
      window.MonsterUI.render();
    }
    if (typeof window.MonsterUI?.renderTargetBadge === "function") {
      window.MonsterUI.renderTargetBadge();
    }
  }

  // ===== handleTurnEnd フック =====
  // ターン終了時にモンスター行動・ターン開始処理を追加
  document.addEventListener("DOMContentLoaded", () => {
    const waitForTurnEnd = setInterval(() => {
      if (typeof window.handleTurnEnd !== "function") return;
      clearInterval(waitForTurnEnd);

      const _origHandleTurnEnd = window.handleTurnEnd;
      window.handleTurnEnd = async function(skipHandLimitCheck) {
        const me = window.myRole || "player1";

        // ターン終了時: 後攻モンスターの攻撃
        if (typeof window.MonsterCombatSystem?.processTurnEndMonsterActions === "function") {
          window.MonsterCombatSystem.processTurnEndMonsterActions();
        }

        // ターゲットをロック
        if (typeof window.BattleTargetSystem?.lockTarget === "function") {
          window.BattleTargetSystem.lockTarget(me);
        }

        // 成長スライム恩恵（毎ターン経験値+1）
        if (window._slimeGrowthRoundsLeft > 0 && window._slimeGrowthKiller === me) {
          if (typeof window.addVal === "function") {
            window.addVal(me, "exp", 1);
          }
        }

        // 元の処理
        await _origHandleTurnEnd.call(this, skipHandLimitCheck);

        // 次ターン開始時: 先攻モンスターの攻撃 & ターゲット変更許可
        const nextPlayer = window.state?.matchData?.turnPlayer;
        if (nextPlayer) {
          if (typeof window.BattleTargetSystem?.onTurnStart === "function") {
            window.BattleTargetSystem.onTurnStart(nextPlayer);
          }
          if (typeof window.MonsterCombatSystem?.processTurnStartMonsterActions === "function") {
            window.MonsterCombatSystem.processTurnStartMonsterActions();
          }
          if (nextPlayer === me && typeof window.MonsterUI?.showTargetChangeButton === "function") {
            window.MonsterUI.showTargetChangeButton();
          }
        }
      };
    }, 300);
  });

})();
