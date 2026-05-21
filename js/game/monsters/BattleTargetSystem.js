/**
 * BattleTargetSystem.js
 * 各プレイヤーの攻撃対象（PvP / PvE）を管理する
 * ターン開始時のみ変更可能
 */

window.BattleTargetSystem = (function() {

  // target: "player" | { slotIndex: number }
  const _targets = {
    player1: "player",
    player2: "player"
  };

  // ターン開始時に変更可能フラグ
  const _canChange = {
    player1: false,
    player2: false
  };

  // 討伐直後フラグ（討伐後のみ即時変更可能）
  const _justDefeated = {
    player1: false,
    player2: false
  };

  // ===== ターン開始時処理 =====
  function onTurnStart(playerKey) {
    _canChange[playerKey] = true;
    _justDefeated[playerKey] = false;
  }

  // ターン開始後、最初のアクション後にロック
  function lockTarget(playerKey) {
    if (!_justDefeated[playerKey]) {
      _canChange[playerKey] = false;
    }
  }

  // ===== ターゲット変更 =====
  /**
   * @param playerKey "player1" | "player2"
   * @param target "player" | { slotIndex: number }
   * @returns { ok: bool, reason: string }
   */
  function setTarget(playerKey, target) {
    if (!_canChange[playerKey] && !_justDefeated[playerKey]) {
      console.warn(`[BattleTargetSystem] setTarget failed: ターン開始時のみ変更できます`);
      return { ok: false, reason: "ターン開始時のみ変更できます" };
    }

    // モンスターターゲットの場合、スロットが存在するか確認
    if (target !== "player" && typeof target === "object") {
      const slot = window.MonsterManager?.getSlot(target.slotIndex);
      if (!slot) {
        return { ok: false, reason: "そのモンスターは存在しません" };
      }
    }

    _targets[playerKey] = target;
    // Expose a helper for external callers
    // (Will be used by applyTargetSelectionResult)
    window.BattleTargetSystem.applySelectionResult = async function(owner, tgt) {
      const res = window.BattleTargetSystem.setTarget(owner, tgt);
      if (!res.ok) {
        console.warn(`[BattleTargetSystem] applySelectionResult failed: ${res.reason}`);
        return res;
      }
      // Serialize and write to Firebase if needed (handled by caller)
      return { ok: true };
    };
    _canChange[playerKey] = false;
    _justDefeated[playerKey] = false;

    const label = target === "player" ? "相手プレイヤー" : `モンスター(スロット${target.slotIndex + 1})`;
    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[TARGET] ${playerKey} の攻撃対象: ${label}`);
    }

    return { ok: true };
  }

  // 討伐後の即時変更許可
  function onMonsterDefeated(playerKey) {
    _justDefeated[playerKey] = true;
    _canChange[playerKey] = true;
  }

  // ===== ゲッター =====
  function getTarget(playerKey) {
    return _targets[playerKey] || "player";
  }

  function isPvE(playerKey) {
    const t = _targets[playerKey];
    return t !== "player" && typeof t === "object" && typeof t.slotIndex === "number";
  }

  function isPvP(playerKey) {
    return _targets[playerKey] === "player";
  }

  function canChangeTarget(playerKey) {
    return !!_canChange[playerKey];
  }

  // ===== Firebase同期 =====
  function serialize() {
    return {
      targets: { ..._targets },
      canChange: { ..._canChange }
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.targets) {
      Object.assign(_targets, data.targets);
    }
    if (data.canChange) {
      Object.assign(_canChange, data.canChange);
    }
  }

  // ===== リセット =====
  function reset() {
    _targets.player1 = "player";
    _targets.player2 = "player";
    _canChange.player1 = false;
    _canChange.player2 = false;
    _justDefeated.player1 = false;
    _justDefeated.player2 = false;
  }

  return {
    onTurnStart,
    lockTarget,
    setTarget,
    onMonsterDefeated,
    getTarget,
    isPvE,
    isPvP,
    canChangeTarget,
    serialize,
    deserialize,
    reset
  };

})();
