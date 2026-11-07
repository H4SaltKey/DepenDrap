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
    _registerHooks();
    _lastRoundSeen = 0;
    const gameRoom = localStorage.getItem("gameRoom");
    if (!gameRoom || !window.firebaseClient?.db) return;

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
      if (window._soloHotSeat || me === (m.firstPlayer || "player1")) {
        window.MonsterCombatSystem?.onRoundStart(round);
      }
      window.MonsterUI?.hideTargetChangeButton();
    }

    _renderMonsterUI();
  }

  // ===== ターン終了前処理 =====
  function _onBeforeTurnEnd() {
    const me = window.state?.matchData?.turnPlayer || window.myRole || "player1";

    // 後攻モンスターの攻撃
    window.MonsterCombatSystem?.processTurnEndMonsterActions(me);

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
    window.MonsterCombatSystem?.processTurnStartMonsterActions();
    window.MonsterUI?.hideTargetChangeButton();
  };

  window.completeTurnTargetSelection = async function() {
    const m = window.state?.matchData;
    if (!m) return;
    m.targetSelectionPending = false;
    const gameRoom = localStorage.getItem("gameRoom");
    if (gameRoom && window.firebaseClient?.db) {
      const targetsData = window.BattleTargetSystem?.serialize() || {};
      await window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve/targets`).set(targetsData).catch(() => {});
      await window.firebaseClient.writeMatchData(gameRoom, { ...m }).catch(() => {});
    } else if (typeof window.update === "function") {
      window.update();
    }
  };

  window.showRoundLocationSelectDialog = function() {
    if (document.getElementById("turnStartTargetPanel")) return;
    const m = window.state?.matchData;
    const me = window._soloHotSeat ? m?.turnPlayer : (window.myRole || "player1");
    if (!m || !me || m.status !== "playing" || !m.targetSelectionPending) return;
    const slots = window.MonsterManager?.getAllSlots() || [];
    if (!slots.some(Boolean)) {
      setTimeout(() => window.showRoundLocationSelectDialog(), 250);
      return;
    }

    const panel = document.createElement("div");
    panel.id = "turnStartTargetPanel";
    panel.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20001;background:rgba(10,8,20,.98);border:2px solid rgba(199,179,119,.5);border-radius:16px;padding:24px;width:min(520px,92vw);max-height:86vh;overflow:auto;font-family:'Outfit',sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.85);color:#fff;`;

    const options = slots.map((slot, index) => {
      if (!slot) return "";
      const def = (window.MONSTER_DEFINITIONS || []).find(monster => monster.id === slot.monsterId);
      const occupants = window.BattleTargetSystem?.getOccupants(index, m.round) || [];
      const otherPresent = occupants.some(player => player !== me);
      const presence = otherPresent ? "相手が対峙中" : occupants.includes(me) ? "あなたの所在" : "空き";
      return `<button type="button" class="roundLocationOption" data-slot="${index}" style="width:100%;display:flex;align-items:center;gap:12px;padding:12px;margin:6px 0;text-align:left;background:rgba(25,20,34,.9);border:1px solid ${otherPresent ? "#f0d080" : "rgba(199,179,119,.3)"};border-radius:10px;color:#eee;cursor:pointer;"><span style="font-size:26px">${def?.emoji || "👾"}</span><span style="flex:1"><strong style="display:block;color:#f0d080">${def?.name || slot.monsterId}</strong><small>HP ${slot.currentHp}/${slot.maxHp} · ${def?.initiative || "後攻"}</small></span><span style="font-size:11px;color:${otherPresent ? "#ffcf75" : "#aaa"}">${presence}</span></button>`;
    }).join("");

    panel.innerHTML = `<h3 style="margin:0 0 8px;text-align:center;color:#f0d080">第${m.round}ラウンドの対峙先</h3><p style="margin:0 0 14px;text-align:center;color:#aaa;font-size:12px">このラウンド中の所在を選択してください。1ラウンド目は必ずモンスターを選びます。</p>${options || "<div>選択できるモンスターがいません。</div>"}`;
    document.body.appendChild(panel);
    panel.querySelectorAll(".roundLocationOption").forEach(button => button.addEventListener("click", async () => {
      const slotIndex = Number(button.dataset.slot);
      window.BattleTargetSystem?.onTurnStart(me);
      const choice = window.BattleTargetSystem?.chooseLocation(me, slotIndex, m.round);
      if (!choice?.ok) return;
      panel.remove();
      if (window.BattleTargetSystem?.canTargetPlayer(me, m.round)) {
        window.showTurnStartTargetSelectDialog?.();
        return;
      }
      await window.completeTurnTargetSelection?.();
    }));
  };

  window.showMonsterRetargetDialog = function(options = {}) {
    if (document.getElementById("turnStartTargetPanel")) return;
    const match = window.state?.matchData;
    const me = options.playerKey || (window._soloHotSeat ? match?.turnPlayer : (window.myRole || "player1"));
    const turnStart = options.turnStart === true;
    if (!match || match.status !== "playing" || !me || (turnStart && !match.targetSelectionPending)) return;
    if (turnStart) window.BattleTargetSystem?.onTurnStart(me);
    const round = Number(match.round || 1);
    const slots = window.MonsterManager?.getAllSlots() || [];
    const panel = document.createElement("div");
    panel.id = "turnStartTargetPanel";
    panel.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20001;background:rgba(10,8,20,.98);border:2px solid rgba(199,179,119,.5);border-radius:16px;padding:24px;width:min(520px,92vw);max-height:86vh;overflow:auto;font-family:'Outfit',sans-serif;box-shadow:0 24px 64px rgba(0,0,0,.85);color:#fff;`;
    const optionsHtml = slots.map((slot, index) => {
      if (!slot) return "";
      const def = (window.MONSTER_DEFINITIONS || []).find(monster => monster.id === slot.monsterId);
      const occupants = window.BattleTargetSystem?.getOccupants(index, round) || [];
      const otherPresent = occupants.some(player => player !== me);
      const playerOption = round > 1 && otherPresent
        ? `<button type="button" data-retarget-player="${index}" style="flex:1;padding:9px;background:#241417;border:1px solid #a94444;border-radius:8px;color:#ffaaaa;cursor:pointer">⚔ 同じ場所の相手を攻撃</button>`
        : "";
      return `<div style="padding:10px;margin:7px 0;background:rgba(25,20,34,.9);border:1px solid ${otherPresent ? "#f0d080" : "rgba(199,179,119,.3)"};border-radius:10px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:24px">${def?.emoji || "👾"}</span><strong style="flex:1;color:#f0d080">${def?.name || slot.monsterId}</strong><small style="color:#aaa">${otherPresent ? "相手も所在" : "空き"}</small></div><div style="display:flex;gap:8px"><button type="button" data-retarget-monster="${index}" style="flex:1;padding:9px;background:#191522;border:1px solid #8b7747;border-radius:8px;color:#f0d080;cursor:pointer">このモンスターと対峙</button>${playerOption}</div></div>`;
    }).join("");
    const currentLocation = window.BattleTargetSystem?.getLocation(me, round);
    const currentOccupants = currentLocation ? window.BattleTargetSystem.getOccupants(currentLocation.slotIndex, round) : [];
    const currentPlayerOption = round > 1 && currentOccupants.some(player => player !== me)
      ? `<button type="button" data-retarget-current-player="1" style="width:100%;padding:11px;margin:6px 0;background:#241417;border:1px solid #a94444;border-radius:9px;color:#ffaaaa;cursor:pointer">⚔ 現在の場所にいる相手を攻撃</button>`
      : "";
    panel.innerHTML = `<h3 style="margin:0 0 8px;text-align:center;color:#f0d080">対峙先の再選択</h3><p style="margin:0 0 14px;text-align:center;color:#aaa;font-size:12px">対象のモンスターが討伐されました。次の対峙先を選んでください。</p>${currentPlayerOption}${optionsHtml || "<div>選択できるモンスターがいません。</div>"}`;
    document.body.appendChild(panel);

    const persist = async () => {
      const room = localStorage.getItem("gameRoom");
      if (room && window.firebaseClient?.db) {
        const targetData = window.BattleTargetSystem?.serialize() || {};
        await window.firebaseClient.db.ref(`rooms/${room}/pvpve/targets`).set(targetData).catch(() => {});
      }
      window.MonsterUI?.render();
      window.MonsterUI?.renderTargetBadge();
      if (turnStart) await window.completeTurnTargetSelection?.();
      else if (typeof window.update === "function") window.update();
    };
    const choosePlayer = async (slotIndex) => {
      if (slotIndex !== currentLocation?.slotIndex) {
        const moved = window.BattleTargetSystem?.retargetLocation(me, slotIndex, round);
        if (!moved?.ok) return;
      }
      window.BattleTargetSystem?.onTurnStart(me);
      const result = window.BattleTargetSystem?.setTarget(me, "player");
      if (!result?.ok) return;
      panel.remove();
      await persist();
    };
    panel.querySelectorAll("[data-retarget-monster]").forEach(button => button.addEventListener("click", async () => {
      const result = window.BattleTargetSystem?.retargetLocation(me, Number(button.dataset.retargetMonster), round);
      if (!result?.ok) return;
      panel.remove();
      await persist();
    }));
    panel.querySelectorAll("[data-retarget-player]").forEach(button => button.addEventListener("click", () => choosePlayer(Number(button.dataset.retargetPlayer))));
    panel.querySelector("[data-retarget-current-player]")?.addEventListener("click", () => choosePlayer(currentLocation.slotIndex));
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
    const m = window.state?.matchData;
    const me = window._soloHotSeat ? m?.turnPlayer : (window.myRole || "player1");
    const location = window.BattleTargetSystem?.getLocation(me, m?.round);
    if (!m || m.status !== "playing" || !m.targetSelectionPending || !location || !window.BattleTargetSystem?.canTargetPlayer(me, m.round)) return;
    const slot = window.MonsterManager?.getSlot(location.slotIndex);
    const def = slot && (window.MONSTER_DEFINITIONS || []).find(monster => monster.id === slot.monsterId);
    const panel = document.createElement("div");
    panel.id = "turnStartTargetPanel";
    panel.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20001;background:rgba(10,8,20,.98);border:2px solid rgba(199,179,119,.5);border-radius:16px;padding:24px;width:min(460px,90vw);color:#fff;font-family:'Outfit',sans-serif;";
    const monsterOption = slot ? `<button type="button" data-target="monster" style="width:100%;padding:14px;margin:5px 0;background:#191522;border:1px solid #8b7747;border-radius:9px;color:#f0d080;cursor:pointer">${def?.emoji || "👾"} ${def?.name || slot.monsterId} と戦う</button>` : "";
    panel.innerHTML = `<h3 style="text-align:center;color:#f0d080;margin:0 0 10px">同じ場所にいる相手</h3><p style="text-align:center;color:#aaa;font-size:12px">相手と同じモンスターの場所にいるため、攻撃対象を選べます。</p>${monsterOption}<button type="button" data-target="player" style="width:100%;padding:14px;margin:5px 0;background:#241417;border:1px solid #a94444;border-radius:9px;color:#ffaaaa;cursor:pointer">⚔ 相手プレイヤーを攻撃</button>`;
    document.body.appendChild(panel);
    panel.querySelectorAll("[data-target]").forEach(button => button.addEventListener("click", async () => {
      window.BattleTargetSystem?.onTurnStart(me);
      const target = button.dataset.target === "player" ? "player" : { slotIndex: location.slotIndex };
      const result = window.BattleTargetSystem?.setTarget(me, target);
      if (!result?.ok) return;
      panel.remove();
      if (typeof window.centerField === "function") window.centerField();
      await window.completeTurnTargetSelection?.();
    }));
  };

  // ===== UI 更新ヘルパー =====
  function _renderMonsterUI() {
    window.MonsterUI?.render();
    window.MonsterUI?.renderTargetBadge();
  }

})();
