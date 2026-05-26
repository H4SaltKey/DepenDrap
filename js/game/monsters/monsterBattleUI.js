/**
 * モンスター戦闘UI管理
 * - メインフィールド内に疑似フィールドを表示
 * - 敵キャラクター表示
 * - HP バー表示
 * - 戦闘情報パネル
 */

window.setupMonsterBattleUI = function() {
  const layer = document.getElementById("monsterBattleLayer");
  if (!layer) return;

  // 敵モンスター情報を取得して表示
  window.updateMonsterBattleDisplay = function() {
    const myRole = window.getMyRole ? window.getMyRole() : "player1";
    const target = window.BattleTargetSystem?.getTarget?.(myRole);
    
    if (!target || target === "player" || typeof target !== "object") {
      // モンスター戦闘ではない
      return;
    }

    // モンスター情報を表示
    const monsterData = target;
    const monsterSprite = document.getElementById("monsterSprite");
    const monsterName = document.getElementById("monsterName");
    const monsterHpFill = document.getElementById("monsterHpFill");

    if (monsterSprite && monsterData?.imageUrl) {
      monsterSprite.style.backgroundImage = `url('${monsterData.imageUrl}')`;
    }

    if (monsterName && monsterData?.name) {
      monsterName.textContent = monsterData.name || "Monster";
    }

    // HP バー更新
    if (monsterHpFill && monsterData?.hp !== undefined && monsterData?.maxHp !== undefined) {
      const hpRatio = Math.max(0, monsterData.hp / monsterData.maxHp);
      monsterHpFill.style.width = `${hpRatio * 100}%`;
    }

    // プレイヤー戦闘情報
    updatePlayerBattleInfo(myRole);

    // 敵情報（プレイヤー自身が見る敵情報）
    updateEnemyBattleInfo(myRole);
  };

  function updatePlayerBattleInfo(myRole) {
    const playerStatus = document.getElementById("playerBattleStatus");
    if (!playerStatus || !window.state) return;

    const myData = window.state[myRole];
    if (!myData) return;

    playerStatus.innerHTML = `
      <div>🛡️ <strong>HP:</strong> ${myData.hp || 0} / ${myData.hp_max || 0}</div>
      <div>🔰 <strong>防御:</strong> ${myData.shield || 0}</div>
      <div>📦 <strong>D-Stack:</strong> ${myData.defstack || 0}</div>
    `;
  }

  function updateEnemyBattleInfo(myRole) {
    const enemyStatus = document.getElementById("enemyBattleStatus");
    if (!enemyStatus || !window.state) return;

    const enemyRole = myRole === "player1" ? "player2" : "player1";
    const enemyData = window.state[enemyRole];
    if (!enemyData) return;

    enemyStatus.innerHTML = `
      <div>⚡ <strong>相手HP:</strong> ${enemyData.hp || 0} / ${enemyData.hp_max || 0}</div>
      <div>🔱 <strong>相手防御:</strong> ${enemyData.shield || 0}</div>
      <div>📦 <strong>相手D-Stack:</strong> ${enemyData.defstack || 0}</div>
    `;
  }

  console.log("[setupMonsterBattleUI] COMPLETE");
};

// UI 更新ティックを renderUI に統合
window.updateMonsterBattleUITick = function() {
  if (typeof window.updateMonsterBattleDisplay === "function") {
    window.updateMonsterBattleDisplay();
  }
};
