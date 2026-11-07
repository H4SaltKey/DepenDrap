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
    const myRole = window._soloHotSeat
      ? (window.state?.matchData?.turnPlayer || "player1")
      : (window.getMyRole ? window.getMyRole() : "player1");
    const enemyRole = myRole === "player1" ? "player2" : "player1";
    const round = window.state?.matchData?.round;
    const myLocation = window.BattleTargetSystem?.getLocation?.(myRole, round);
    const enemyLocation = window.BattleTargetSystem?.getLocation?.(enemyRole, round);
    const slots = window.MonsterManager?.getAllSlots?.() || [];
    const monsterDisplayArea = document.getElementById("monsterDisplayArea");
    if (!monsterDisplayArea) return;
    monsterDisplayArea.replaceChildren();

    const sharedLocation = myLocation && enemyLocation && myLocation.slotIndex === enemyLocation.slotIndex;
    const targets = [];
    if (myLocation) targets.push({ owner: myRole, location: myLocation, className: sharedLocation ? "sharedMonsterTarget" : "localMonsterTarget", isLocal: true });
    if (enemyLocation && (!myLocation || enemyLocation.slotIndex !== myLocation.slotIndex)) {
      targets.push({ owner: enemyRole, location: enemyLocation, className: "opponentMonsterTarget", isLocal: false });
    }
    window._currentMonsterTarget = myLocation ? {
      slot: slots[myLocation.slotIndex] || null,
      slotIndex: myLocation.slotIndex,
      owner: myRole
    } : null;

    targets.forEach(({ owner, location, className, isLocal }) => {
      const slotIndex = Number(location.slotIndex);
      const slot = slots[slotIndex] || null;
      const defeated = !slot;
      const definition = slot ? (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId) : null;
      const panel = document.createElement("div");
      panel.className = `monsterDisplayArea monsterTargetCard ${className}`;
      panel.dataset.owner = owner;
      panel.dataset.monsterSlotIndex = String(slotIndex);
      panel.dataset.isLocalTarget = isLocal ? "true" : "false";
      panel.dataset.monsterDefeated = defeated ? "true" : "false";
      panel.title = isLocal
        ? (defeated ? "討伐済みです。次の対象を選択してください。" : "右クリックでダメージ判定")
        : "相手が対峙しているモンスター（攻撃対象外）";

      const hpPercent = defeated ? 0 : Math.round(Math.max(0, Math.min(100, (slot.currentHp / slot.maxHp) * 100)));
      const traits = (definition?.traits || []).map(t => t.label).join(" / ") || "なし";
      panel.innerHTML = `
        <div class="monsterSprite" style="${defeated ? "filter:grayscale(.85) saturate(.5);" : `background-image:url('assets/System/enemy_${slotIndex + 1}.png');`}"></div>
        <div class="monsterNamePlate">
          <div class="monsterNameHeader">
            <span class="monsterName">${defeated ? "討伐完了！" : (definition?.name || "モンスター")}</span>
            <span class="monsterHpPercent">${hpPercent}%</span>
          </div>
          <div class="monsterBattleMeta">
            <div><strong>HP</strong><br>${slot?.currentHp || 0}/${slot?.maxHp || 0}</div>
            <div><strong>防御力</strong><br>${slot?.def || 0}</div>
            <div><strong>シールド</strong><br>${slot?.shield || 0}</div>
            <div><strong>特性</strong><br>${traits}</div>
          </div>
          <div class="monsterHpBar"><div class="monsterHpFill" style="width:${hpPercent}%"></div></div>
          <div class="monsterNextAttack">${defeated ? "次の対象を選択してください。" : `次の攻撃 → ${buildMonsterNextAttackText(definition, slot)}`}</div>
        </div>`;

      if (isLocal && !defeated) {
        panel.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof window.openMonsterMenu === "function") window.openMonsterMenu(slot, slotIndex, event.clientX, event.clientY);
        });
      } else if (!isLocal) {
        panel.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
      } else if (isLocal && defeated) {
        panel.addEventListener("click", () => {
          if (window.BattleTargetSystem?.canChangeTarget(owner)) {
            window.showMonsterRetargetDialog?.({ playerKey: owner, turnStart: false });
          }
        });
      }
      monsterDisplayArea.appendChild(panel);
    });
  };

  function buildMonsterNextAttackText(definition, slot) {
    if (!definition || !definition.actions || !definition.actions.length) {
      return "未知の攻撃を行う。";
    }

    const actions = definition.actions;
    const chosen = actions.reduce((best, action) => {
      const weight = Number(action.weight || 1);
      return weight > (best.weight || 0) ? action : best;
    }, actions[0]);

    const atkValue = definition.atk || 1;
    let damage = atkValue;
    let damageType = "通常";
    let postfix = "を与える。";

    switch (chosen.type) {
      case "attack_double":
        damage = Math.max(1, Math.floor(atkValue * 1.5));
        damageType = "貫通";
        postfix = "を与える。";
        break;
      case "attack_all":
        damage = atkValue;
        damageType = "貫通";
        postfix = "を全体に与える。";
        break;
      default:
        damageType = "通常";
        break;
    }

    return `${chosen.label}:${damage}の${damageType}ダメージ${postfix}`;
  }

  console.log("[setupMonsterBattleUI] COMPLETE");
};

// UI 更新ティックを renderUI に統合
window.updateMonsterBattleUITick = function() {
  if (typeof window.updateMonsterBattleDisplay === "function") {
    window.updateMonsterBattleDisplay();
  }
};
