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
      window.MonsterUI?.hideTargetChangeButton();
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
    const nextPlayer = window.state?.matchData?.turnPlayer;
    if (!nextPlayer) return;

    // 次ターン開始: ターゲット変更許可
    window.BattleTargetSystem?.onTurnStart(nextPlayer);
  }

  // ターン開始時フック（ドロー直前）
  window._onTurnStartCallback = function() {
    const m = window.state?.matchData;
    if (!m || m.status !== "playing") return;
    const me = window.myRole || "player1";
    const nextPlayer = m.turnPlayer;

    if (nextPlayer === me) {
      // 先攻モンスターの攻撃を実行
      window.MonsterCombatSystem?.processTurnStartMonsterActions();
      window.MonsterUI?.hideTargetChangeButton();
    } else {
      // 相手のターン: 先攻モンスターの攻撃のみ実行
      window.MonsterCombatSystem?.processTurnStartMonsterActions();
    }
  };

  // ===== 相手のターゲット選択待ちオーバーレイ表示 =====
  window.showOpponentTargetSelectWaiting = function() {
    if (document.getElementById("opponentTargetWaitingOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "opponentTargetWaitingOverlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.75);
      z-index: 15000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(8px);
      color: #fff;
      font-family: 'Outfit', sans-serif;
      pointer-events: auto;
    `;

    overlay.innerHTML = `
      <div style="position: relative; width: 80px; height: 80px; margin-bottom: 24px;">
        <div style="position: absolute; width: 100%; height: 100%; border: 3px solid transparent; border-top-color: #f0d080; border-radius: 50%; animation: spin 1.2s linear infinite;"></div>
        <div style="position: absolute; width: 100%; height: 100%; border: 3px solid transparent; border-bottom-color: rgba(199, 179, 119, 0.3); border-radius: 50%; animation: spin 1.8s linear infinite reverse;"></div>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px;">🎯</div>
      </div>
      <div style="font-size: 18px; color: #f0d080; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">相手のターゲット選択中</div>
      <div style="font-size: 12px; color: #aaa; letter-spacing: 0.5px;">対戦相手が攻撃対象を選択するまでお待ちください…</div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(overlay);
  };

  // ===== ターン開始時ターゲット選択ダイアログの表示 =====
  window.showTurnStartTargetSelectDialog = function() {
    if (document.getElementById("turnStartTargetPanel")) return;

    const slots = window.MonsterManager?.getAllSlots() || [];
    const me = window.myRole || "player1";
    const prev = window.BattleTargetSystem?.getTarget(me) || "player";
    const prevLabel = prev === "player" ? "相手プレイヤー" : `モンスター ${Number(prev?.slotIndex) + 1}`;

    // ターゲット変更権限を確実にONにする
    window.BattleTargetSystem?.onTurnStart(me);

    const panel = document.createElement("div");
    panel.id = "turnStartTargetPanel";
    panel.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20001;
      background: rgba(10, 8, 20, 0.98);
      border: 2px solid rgba(199, 179, 119, 0.5);
      border-radius: 16px;
      padding: 24px;
      width: min(480px, 90vw);
      font-family: 'Outfit', sans-serif;
      box-shadow: 0 24px 64px rgba(0,0,0,0.85);
      backdrop-filter: blur(16px);
      color: #fff;
    `;

    let optionsHtml = `
      <div class="targetOption pvp" data-target="player" style="
        display:flex; align-items:center; gap:12px; padding:12px 16px;
        border:1px solid rgba(224,74,74,0.3); border-radius:10px;
        cursor:pointer; margin-bottom:8px; color:#e0d0a0; transition:background 0.15s, border-color 0.15s, transform 0.15s;">
        <div style="font-size:24px;">⚔️</div>
        <div>
          <div style="font-size:14px; font-weight:600; color: #f07070;">相手プレイヤーを攻撃</div>
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
          border:1px solid rgba(199, 179, 119, 0.25); border-radius:10px;
          cursor:pointer; margin-bottom:8px; color:#e0d0a0; transition:background 0.15s, border-color 0.15s, transform 0.15s;">
          <div style="font-size:24px;">${def?.emoji || "👾"}</div>
          <div>
            <div style="font-size:14px; font-weight:600; color: #c7b377;">${def?.name || slot.monsterId}</div>
            <div style="font-size:11px; color:#aaa; margin-top:2px;">HP: ${slot.currentHp}/${slot.maxHp} (${hpPct}%) | ${def?.initiative || "後攻"} | EXP+${def?.expReward || 1}</div>
          </div>
        </div>
      `;
    });

    panel.innerHTML = `
      <h3 style="margin:0 0 8px; font-size:18px; color:#f0d080; text-align:center; letter-spacing:1px; font-weight:bold;">ターン開始 — 攻撃対象を選択</h3>
      <p style="font-size:12px; color:#aaa; text-align:center; margin:0 0 20px; letter-spacing:0.5px;">このターンの攻撃対象を選んでください</p>
      <div style="display:flex; flex-direction:column; gap:4px;">
        ${optionsHtml}
      </div>
    `;

    document.body.appendChild(panel);

    const close = async (target) => {
      panel.remove();
      // 念のためターゲット変更権限を付与してからセットする
      window.BattleTargetSystem?.onTurnStart(me);
      if (target === "player") {
        window.BattleTargetSystem?.setTarget(me, "player");
      } else if (typeof target === "number") {
        window.BattleTargetSystem?.setTarget(me, { slotIndex: target });
      }
      if (typeof window.centerField === "function") {
        window.centerField();
        setTimeout(() => window.centerField(), 80);
      }
      
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && window.firebaseClient?.db) {
        const targetsData = window.BattleTargetSystem?.serialize() || {};
        await window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve/targets`).set(targetsData).catch(() => {});
        const nextMatch = { ...window.state.matchData, targetSelectionPending: false };
        await window.firebaseClient.writeMatchData(gameRoom, nextMatch).catch(() => {});
      } else {
        window.state.matchData.targetSelectionPending = false;
        if (typeof update === "function") update();
      }
    };

    panel.querySelectorAll(".targetOption").forEach(opt => {
      const isPrevPlayer = prev === "player" && opt.dataset.target === "player";
      const isPrevMonster = prev !== "player" && opt.dataset.target === "monster" && String(Number(prev?.slotIndex)) === String(opt.dataset.slot || "");
      if ((isPrevPlayer || isPrevMonster) && !opt.querySelector(".prevTargetTag")) {
        const tag = document.createElement("div");
        tag.className = "prevTargetTag";
        tag.textContent = "直前のターゲット";
        tag.style.cssText = "margin-left:auto; font-size:10px; color:#ff6b6b; font-weight:700; letter-spacing:0.2px; white-space:nowrap;";
        opt.appendChild(tag);
      }
      opt.addEventListener("click", () => {
        if (opt.dataset.target === "player") {
          close("player");
        } else {
          close(parseInt(opt.dataset.slot, 10));
        }
      });
      opt.addEventListener("mouseenter", () => {
        opt.style.background = "rgba(199,179,119,0.15)";
        opt.style.borderColor = "rgba(199,179,119,0.6)";
        opt.style.transform = "translateY(-2px)";
      });
      opt.addEventListener("mouseleave", () => {
        opt.style.background = "";
        opt.style.borderColor = opt.classList.contains("pvp") ? "rgba(224,74,74,0.3)" : "rgba(199, 179, 119, 0.25)";
        opt.style.transform = "";
      });
    });
  };

  // ===== UI 更新ヘルパー =====
  function _renderMonsterUI() {
    window.MonsterUI?.render();
    window.MonsterUI?.renderTargetBadge();
  }

})();
