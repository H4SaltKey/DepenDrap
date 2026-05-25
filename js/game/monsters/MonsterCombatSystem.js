/**
 * MonsterCombatSystem.js
 * PvE戦闘処理・討伐報酬・Firebase同期
 * 既存のPvP処理を一切変更しない
 */

window.MonsterCombatSystem = (function() {

  // ===== PvE攻撃処理 =====
  /**
   * プレイヤーがモンスターを攻撃する
   * @param attackerKey "player1" | "player2"
   * @param slotIndex 攻撃対象スロット
   * @param rawDmg 攻撃力
   */
  function playerAttackMonster(attackerKey, slotIndex, rawDmg) {
    if (!window.MonsterManager) return;

    const result = window.MonsterManager.dealDamage(slotIndex, rawDmg, attackerKey);

    if (result.defeated) {
      _handleDefeat(slotIndex, attackerKey, result);
    }

    // Firebase同期
    _syncMonsterState();

    return result;
  }

  /**
   * モンスターがプレイヤーを攻撃する（ターン終了時）
   * @param slotIndex 攻撃するモンスターのスロット
   * @param targetKey 攻撃対象プレイヤー
   */
  function monsterAttackPlayer(slotIndex, targetKey) {
    if (!window.MonsterManager) return;

    const result = window.MonsterManager.monsterAttack(slotIndex, targetKey);
    if (result.dmg <= 0) return;

    const isAttackAll = result.actionType === "attack_all";
    const targets = isAttackAll ? ["player1", "player2"] : [targetKey];

    targets.forEach(key => {
      // addVal() 経由でダメージを適用（syncDerivedStats・checkGameResult・Firebase同期が走る）
      if (typeof window.addVal === "function") {
        window.addVal(key, "hp", -result.dmg);
      } else {
        // フォールバック（addVal未定義時のみ）
        const targetState = window.state?.[key];
        if (targetState) targetState.hp = Math.max(0, (targetState.hp || 0) - result.dmg);
        if (typeof window.update === "function") window.update(true);
      }
    });
  }

  /**
   * 討伐報酬処理
   */
  function _handleDefeat(slotIndex, killer, result) {
    const expReward = result.expReward || 1;

    // ラストヒットプレイヤーのみ経験値獲得
    const killerState = window.state?.[killer];
    if (killerState && typeof window.addGameLog === "function") {
      // 既存の addVal を使って経験値を加算
      if (typeof window.addVal === "function") {
        window.addVal(killer, "exp", expReward);
      } else if (killerState) {
        killerState.exp = (killerState.exp || 0) + expReward;
      }
      window.addGameLog(`[MONSTER] ${killer} が経験値 +${expReward} 獲得！`);
    }

    // PP+2 回復
    if (killerState && typeof window.addVal === "function") {
      window.addVal(killer, "pp", 2);
      window.addGameLog(`[MONSTER] ${killer} の PP +2 回復！`);
    }

    // 討伐後のターゲット変更許可
    if (window.BattleTargetSystem) {
      window.BattleTargetSystem.onMonsterDefeated(killer);
    }
    if (window.MonsterUI?.showTargetChangeButton) {
      window.MonsterUI.showTargetChangeButton(true);
    }

    // 成長スライム特性の処理（グローバルフラグ）
    if (window._slimeGrowthRoundsLeft > 0 && window._slimeGrowthKiller === killer) {
      window.addGameLog(`[MONSTER] 成長スライムの恩恵: 毎ターン経験値+1（残り${window._slimeGrowthRoundsLeft}ラウンド）`);
    }
  }

  /**
   * ターン終了時のモンスター行動処理
   * 各プレイヤーのターゲットに応じてモンスターが攻撃
   */
  function processTurnEndMonsterActions() {
    if (!window.MonsterManager || !window.BattleTargetSystem) return;

    ["player1", "player2"].forEach(playerKey => {
      if (!window.BattleTargetSystem.isPvE(playerKey)) return;

      const target = window.BattleTargetSystem.getTarget(playerKey);
      if (!target || target === "player") return;

      const { slotIndex } = target;
      const slot = window.MonsterManager.getSlot(slotIndex);
      if (!slot) return;

      const def = (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId);
      if (!def) return;

      // 先攻モンスターはターン開始時に攻撃（ここでは後攻のみ）
      if (def.initiative === "後攻") {
        monsterAttackPlayer(slotIndex, playerKey);
      }
    });
  }

  /**
   * ターン開始時のモンスター行動（先攻モンスター）
   */
  function processTurnStartMonsterActions() {
    if (!window.MonsterManager || !window.BattleTargetSystem) return;

    ["player1", "player2"].forEach(playerKey => {
      if (!window.BattleTargetSystem.isPvE(playerKey)) return;

      const target = window.BattleTargetSystem.getTarget(playerKey);
      if (!target || target === "player") return;

      const { slotIndex } = target;
      const slot = window.MonsterManager.getSlot(slotIndex);
      if (!slot) return;

      const def = (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId);
      if (!def) return;

      if (def.initiative === "先攻") {
        monsterAttackPlayer(slotIndex, playerKey);
      }

      // 撤退追撃処理
      const retreatAttacks = window.MonsterManager.processRetreatAttacks(playerKey);
      retreatAttacks.forEach(({ dmg }) => {
        if (typeof window.addVal === "function") {
          window.addVal(playerKey, "hp", -dmg);
        } else {
          const targetState = window.state?.[playerKey];
          if (targetState) targetState.hp = Math.max(0, (targetState.hp || 0) - dmg);
        }
      });
    });

    // ターン開始時のヒットカウントリセット
    window.MonsterManager.onTurnStart();
  }

  /**
   * ラウンド開始時処理
   */
  function onRoundStart(round) {
    if (!window.MonsterManager) return;
    window.MonsterManager.initRound(round);

    // 成長スライム恩恵のカウントダウン
    if (window._slimeGrowthRoundsLeft > 0) {
      window._slimeGrowthRoundsLeft--;
    }

    _syncMonsterState();
  }

  /**
   * Firebase にモンスター状態を同期
   */
  function _syncMonsterState() {
    const gameRoom = localStorage.getItem("gameRoom");
    if (!gameRoom || !window.firebaseClient?.db) return;
    if (!window.MonsterManager) return;

    const data = {
      monsters: window.MonsterManager.serialize(),
      targets: window.BattleTargetSystem?.serialize() || {}
    };

    window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve`).set(data).catch(e => {
      console.warn("[MonsterCombatSystem] sync failed:", e);
    });
  }

  /**
   * Firebase からモンスター状態を受信して反映
   */
  function applyRemoteState(data) {
    if (!data) return;
    if (data.monsters && window.MonsterManager) {
      window.MonsterManager.deserialize(data.monsters);
    }
    if (data.targets && window.BattleTargetSystem) {
      window.BattleTargetSystem.deserialize(data.targets);
    }
  }

  /**
   * リセット
   */
  function reset() {
    window.BattleTargetSystem?.reset();
    window._slimeGrowthRoundsLeft = 0;
    window._slimeGrowthKiller = null;
  }

  return {
    playerAttackMonster,
    monsterAttackPlayer,
    processTurnEndMonsterActions,
    processTurnStartMonsterActions,
    onRoundStart,
    applyRemoteState,
    reset
  };

})();
