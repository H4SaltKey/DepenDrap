/**
 * pvpveWatcher.js
 * Firebase の pvpve ノードを監視してモンスター状態を同期する
 * 既存の roomWatcher を変更しない
 *
 * ⚠ 旧実装: window.update / window.handleTurnEnd のモンキーパッチ
 *   → 再帰ループリスクがあるため廃止
 *   → game.js の window._afterUpdateHooks / window._afterTurnEndHooks を使用
 */

(function() {

  let _pvpveRef = null;
  let _pvpveListener = null;
  let _lastRoundSeen = 0;

  // ===== pvpve Firebase ウォッチャー =====
  window.startPvpveWatcher = function() {
    const gameRoom = localStorage.getItem("gameRoom");
    if (!gameRoom || !window.firebaseClient?.db) return;

    // _lastRoundSeen をリセット（再戦時にラウンド1のモンスター出現を保証）
    _lastRoundSeen = 0;

    stopPvpveWatcher();

    _pvpveRef = window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve`);
    _pvpveListener = _pvpveRef.on("value", (snap) => {
      if (!snap) return;
      const data = snap.val();
      if (!data) return;

      if (typeof window.MonsterCombatSystem?.applyRemoteState === "function") {
        window.MonsterCombatSystem.applyRemoteState(data);
      }
      _renderMonsterUI();
    });

    console.log("[pvpveWatcher] 開始:", gameRoom);

    // フックを登録（モンキーパッチではなく公式フックポイント経由）
    _registerHooks();
  };

  function stopPvpveWatcher() {
    if (_pvpveRef && _pvpveListener) {
      _pvpveRef.off("value", _pvpveListener);
      _pvpveRef = null;
      _pvpveListener = null;
    }
  }
  window.stopPvpveWatcher = stopPvpveWatcher;

  // ===== フック登録 =====
  function _registerHooks() {
    // update() 後フック（game.js の window._afterUpdateHooks 配列を使用）
    if (!Array.isArray(window._afterUpdateHooks)) window._afterUpdateHooks = [];
    // 重複登録防止
    if (!window._afterUpdateHooks.includes(_onAfterUpdate)) {
      window._afterUpdateHooks.push(_onAfterUpdate);
    }

    // handleTurnEnd 後フック
    if (!Array.isArray(window._afterTurnEndHooks)) window._afterTurnEndHooks = [];
    if (!window._afterTurnEndHooks.includes(_onAfterTurnEnd)) {
      window._afterTurnEndHooks.push(_onAfterTurnEnd);
    }

    // handleTurnEnd 前フック
    if (!Array.isArray(window._beforeTurnEndHooks)) window._beforeTurnEndHooks = [];
    if (!window._beforeTurnEndHooks.includes(_onBeforeTurnEnd)) {
      window._beforeTurnEndHooks.push(_onBeforeTurnEnd);
    }
  }

  // ===== update() 後処理 =====
  function _onAfterUpdate() {
    const m = window.state?.matchData;
    if (!m || m.status !== "playing") return;

    const round = m.round || 1;

    // ラウンドが変わったらモンスターを初期化（先攻プレイヤーのみ実行して競合防止）
    if (round !== _lastRoundSeen) {
      _lastRoundSeen = round;
      const me = window.myRole || "player1";
      if (me === (m.firstPlayer || "player1")) {
        window.MonsterCombatSystem?.onRoundStart(round);
      }
      window.MonsterUI?.showTargetChangeButton();
    }

    _renderMonsterUI();
  }

  // ===== ターン終了前処理 =====
  function _onBeforeTurnEnd() {
    const me = window.myRole || "player1";

    // 後攻モンスターの攻撃
    window.MonsterCombatSystem?.processTurnEndMonsterActions();

    // ターゲットをロック
    window.BattleTargetSystem?.lockTarget(me);

    // 成長スライム恩恵（毎ターン経験値+1）
    if (window._slimeGrowthRoundsLeft > 0 && window._slimeGrowthKiller === me) {
      if (typeof window.addVal === "function") {
        window.addVal(me, "exp", 1);
      }
    }
  }

  // ===== ターン終了後処理 =====
  function _onAfterTurnEnd() {
    const me = window.myRole || "player1";
    const nextPlayer = window.state?.matchData?.turnPlayer;
    if (!nextPlayer) return;

    // 次ターン開始: ターゲット変更許可
    window.BattleTargetSystem?.onTurnStart(nextPlayer);

    // 自分のターン開始時: ターゲット選択フェーズ（先攻モンスター攻撃より前）
    if (nextPlayer === me) {
      _showTurnStartTargetSelect(() => {
        // ターゲット選択完了後に先攻モンスターの攻撃を実行
        window.MonsterCombatSystem?.processTurnStartMonsterActions();
        window.MonsterUI?.showTargetChangeButton();
      });
    } else {
      // 相手のターン: 先攻モンスターの攻撃のみ実行
      window.MonsterCombatSystem?.processTurnStartMonsterActions();
    }
  }

  // ===== ターン開始時ターゲット選択 =====
  // モンスターが存在する場合のみ表示。なければ即コールバック。
  function _showTurnStartTargetSelect(onDone) {
    const slots = window.MonsterManager?.getAllSlots() || [];
    const hasMonster = slots.some(s => s !== null);

    // モンスターがいない場合はスキップ
    if (!hasMonster) {
      onDone();
      return;
    }

    const me = window.myRole || "player1";
    const existing = document.getElementById("turnStartTargetPanel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "turnStartTargetPanel";
    panel.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20001;
      background: rgba(10, 8, 20, 0.97);
      border: 1px solid rgba(199, 179, 119, 0.5);
      border-radius: 16px;
      padding: 24px;
      width: min(480px, 90vw);
      font-family: 'Outfit', sans-serif;
      box-shadow: 0 24px 64px rgba(0,0,0,0.8);
      backdrop-filter: blur(12px);
    `;

    let optionsHtml = `
      <div class="targetOption pvp" data-target="player" style="
        display:flex; align-items:center; gap:12px; padding:12px 16px;
        border:1px solid rgba(224,74,74,0.3); border-radius:10px;
        cursor:pointer; margin-bottom:8px; color:#e0d0a0; transition:background 0.15s;">
        <div style="font-size:24px;">⚔️</div>
        <div>
          <div style="font-size:14px; font-weight:600;">相手プレイヤーを攻撃</div>
          <div style="font-size:11px; color:#888; margin-top:2px;">PvP — 通常の対戦</div>
        </div>
      </div>
    `;

    slots.forEach((slot, i) => {
      if (!slot) return;
      const def = (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId);
      const hpPct = Math.round((slot.currentHp / slot.maxHp) * 100);
      optionsHtml += `
        <div class="targetOption" data-target="monster" data-slot="${i}" style="
          display:flex; align-items:center; gap:12px; padding:12px 16px;
          border:1px solid rgba(255,255,255,0.1); border-radius:10px;
          cursor:pointer; margin-bottom:8px; color:#e0d0a0; transition:background 0.15s;">
          <div style="font-size:24px;">${def?.emoji || "👾"}</div>
          <div>
            <div style="font-size:14px; font-weight:600;">${def?.name || slot.monsterId}</div>
            <div style="font-size:11px; color:#888; margin-top:2px;">HP: ${slot.currentHp}/${slot.maxHp} (${hpPct}%) | ${def?.initiative || "後攻"} | EXP+${def?.expReward || 1}</div>
          </div>
        </div>
      `;
    });

    panel.innerHTML = `
      <h3 style="margin:0 0 8px; font-size:16px; color:#f0d080; text-align:center; letter-spacing:1px;">ターン開始 — 攻撃対象を選択</h3>
      <p style="font-size:12px; color:#888; text-align:center; margin:0 0 16px;">このターンの攻撃対象を選んでください</p>
      ${optionsHtml}
    `;

    document.body.appendChild(panel);

    const close = (target) => {
      panel.remove();
      if (target === "player") {
        window.BattleTargetSystem?.setTarget(me, "player");
      } else if (typeof target === "number") {
        window.BattleTargetSystem?.setTarget(me, { slotIndex: target });
      }
      // Firebase 同期
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && window.firebaseClient?.db) {
        const data = window.BattleTargetSystem?.serialize() || {};
        window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve/targets`).set(data).catch(() => {});
      }
      _renderMonsterUI();
      onDone();
    };

    panel.querySelectorAll(".targetOption").forEach(opt => {
      opt.addEventListener("click", () => {
        if (opt.dataset.target === "player") {
          close("player");
        } else {
          close(parseInt(opt.dataset.slot, 10));
        }
      });
      opt.addEventListener("mouseenter", () => {
        opt.style.background = "rgba(199,179,119,0.1)";
      });
      opt.addEventListener("mouseleave", () => {
        opt.style.background = "";
      });
    });
  }

  // ===== UI 更新ヘルパー =====
  function _renderMonsterUI() {
    window.MonsterUI?.render();
    window.MonsterUI?.renderTargetBadge();
  }

})();
