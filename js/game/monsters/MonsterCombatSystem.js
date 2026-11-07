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
   * @param dmgType "damage" | "pierce" | "fragile" | "arcana" | "hp_reduce" | "direct_attack"（デフォルト: "damage"）
   */
  function playerAttackMonster(attackerKey, slotIndex, rawDmg, dmgType = "damage", isEvolutionDamage = false) {
    if (!window.MonsterManager) return;

    const attacker = window.state?.[attackerKey];
    let kikiExperience = 0;
    if (!isEvolutionDamage && rawDmg >= 6 && attacker && (attacker.evolutionPath === "奇撃の道" || attacker.evolutionPath === "瞬発の道")) {
      const z = window.getEvolutionPathParam("奇撃の道", attacker.level);
      window.MonsterManager.dealDamage(slotIndex, z, attackerKey, "fragile");
      kikiExperience = 2 + z;
    }

    const result = window.MonsterManager.dealDamage(slotIndex, rawDmg, attackerKey, dmgType);
    if (kikiExperience > 0) {
      if (typeof window.addVal === "function") window.addVal(attackerKey, "exp", kikiExperience);
      if (typeof window.addGameLog === "function") window.addGameLog(`[EVOLUTION] ${attacker.username || attackerKey} の「奇撃の道」効果！経験値${kikiExperience}を獲得しました。`);
    }

    if (!isEvolutionDamage && rawDmg >= 1 && attacker?.evolutionPath === "継続の道") {
      const limit = window.getEvolutionPathParam("継続の道", attacker.level);
      if ((attacker.evoContinuousDmgCount || 0) < limit) {
        attacker.evoContinuousDmgCount = (attacker.evoContinuousDmgCount || 0) + 1;
        const isThird = attacker.evoContinuousDmgCount === 3;
        if (typeof window.addGameLog === "function") window.addGameLog(`[EVOLUTION] ${attacker.username || attackerKey} の「継続の道」効果発動（${attacker.evoContinuousDmgCount}回目）！`);
        window.MonsterManager.dealDamage(slotIndex, 1, attackerKey, "damage");
        if (window.MonsterManager.getSlot(slotIndex)) window.recordContinuousEvolutionDamage?.(attackerKey);
        if (isThird && window.MonsterManager.getSlot(slotIndex)) {
          window.MonsterManager.dealDamage(slotIndex, 1, attackerKey, "pierce");
          if (window.MonsterManager.getSlot(slotIndex)) window.recordContinuousEvolutionDamage?.(attackerKey);
        }
      }
    }

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
  function monsterAttackPlayer(slotIndex, targetKey, targetPlayers = null) {
    if (!window.MonsterManager) return;

    const result = window.MonsterManager.monsterAttack(slotIndex, targetKey);
    if (result.dmg <= 0) return;

    const targets = Array.isArray(targetPlayers) ? targetPlayers : [targetKey];

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

    // 成長スライム特性の処理（グローバルフラグ）
    if (window._slimeGrowthRoundsLeft > 0 && window._slimeGrowthKiller === killer) {
      window.addGameLog(`[MONSTER] 成長スライムの恩恵: 毎ターン経験値+1（残り${window._slimeGrowthRoundsLeft}ラウンド）`);
    }

    const match = window.state?.matchData;
    const location = window.BattleTargetSystem?.getLocation(killer, match?.round);
    if (match?.status === "playing" && match.turnPlayer === killer && location?.slotIndex === slotIndex) {
      window.BattleTargetSystem?.onTurnStart(killer);
      setTimeout(() => window.showMonsterRetargetDialog?.({ playerKey: killer, turnStart: false }), 0);
    }
  }

  /**
   * ターン終了時のモンスター行動処理
   * 各プレイヤーのターゲットに応じてモンスターが攻撃
   */
  function processMonsterActionsForTurn(initiative, activePlayer) {
    if (!window.MonsterManager || !window.BattleTargetSystem || !activePlayer) return;
    const round = Number(window.state?.matchData?.round || 1);

    window.MonsterManager.getAllSlots().forEach((slot, slotIndex) => {
      if (!slot) return;
      const occupants = window.BattleTargetSystem.getOccupants(slotIndex, round);
      if (!occupants.includes(activePlayer)) return;
      const def = (window.MONSTER_DEFINITIONS || []).find(monster => monster.id === slot.monsterId);
      if (!def || def.initiative !== initiative) return;

      const excited = occupants.length > 1;
      const laterPlayer = occupants[occupants.length - 1];
      const targets = excited ? occupants : [activePlayer];
      targets.forEach(targetPlayer => {
        const hitCount = excited && targetPlayer === laterPlayer ? 2 : 1;
        for (let hit = 0; hit < hitCount; hit++) {
          monsterAttackPlayer(slotIndex, targetPlayer, [targetPlayer]);
        }
      });
    });
  }

  function processTurnEndMonsterActions(activePlayer) {
    const player = activePlayer || window.state?.matchData?.turnPlayer;
    processMonsterActionsForTurn("後攻", player);
  }

  /**
   * ターン開始時のモンスター行動（先攻モンスター）
   */
  function processTurnStartMonsterActions() {
    if (!window.MonsterManager || !window.BattleTargetSystem) return;
    const playerKey = window.state?.matchData?.turnPlayer;
    processMonsterActionsForTurn("先攻", playerKey);
    const retreatAttacks = window.MonsterManager.processRetreatAttacks(playerKey);
    retreatAttacks.forEach(({ dmg }) => {
      if (typeof window.addVal === "function") window.addVal(playerKey, "hp", -dmg);
      else if (window.state?.[playerKey]) window.state[playerKey].hp = Math.max(0, (window.state[playerKey].hp || 0) - dmg);
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
