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
    
    // MonsterUI.js から提供されたモンスター情報を使用
    const monsterTarget = window._currentMonsterTarget;
    
    if (!monsterTarget || !monsterTarget.slot) {
      // モンスター戦闘ではない
      return;
    }

    // モンスター情報を表示
    const slot = monsterTarget.slot;
    const definition = monsterTarget.definition;
    const slotIndex = monsterTarget.slotIndex;
    
    const monsterSprite = document.getElementById("monsterSprite");
    const monsterName = document.getElementById("monsterName");
    const monsterHpFill = document.getElementById("monsterHpFill");

    if (monsterSprite && slotIndex !== undefined) {
      const spriteUrl = `assets/System/enemy_${slotIndex + 1}.png`;
      monsterSprite.style.backgroundImage = `url('${spriteUrl}')`;
      monsterSprite.style.cursor = "context-menu";
      monsterSprite.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const me = (typeof window.getMyRole === "function")
          ? window.getMyRole()
          : (window.myRole || "player1");
        if (typeof window.openStatusMenu === "function") {
          window.openStatusMenu(me, e.clientX, e.clientY, { mode: "monster", slotIndex });
        } else if (typeof window.openMonsterMenu === "function") {
          window.openMonsterMenu(window._currentMonsterTarget?.slot, slotIndex, e.clientX, e.clientY);
        }
      };
    }

    if (monsterName && definition?.name) {
      monsterName.textContent = definition.name || "モンスター";
    }

    const hpPercent = Math.round(Math.max(0, Math.min(100, (slot.currentHp / slot.maxHp) * 100)));
    const monsterHpPercent = document.getElementById("monsterHpPercent");
    if (monsterHpPercent) {
      monsterHpPercent.textContent = `${hpPercent}%`;
    }

    if (monsterHpFill && slot?.currentHp !== undefined && slot?.maxHp !== undefined) {
      const hpRatio = Math.max(0, slot.currentHp / slot.maxHp);
      monsterHpFill.style.width = `${hpRatio * 100}%`;
    }

    const metaArea = document.getElementById("monsterBattleMeta");
    if (metaArea) {
      const traits = (definition?.traits || []).map(t => t.label).join(" / ") || "なし";
      metaArea.innerHTML = `
        <div><strong>HP</strong><br>${slot.currentHp}/${slot.maxHp}</div>
        <div><strong>防御力</strong><br>${slot.def || 0}</div>
        <div><strong>シールド</strong><br>${slot.shield || 0}</div>
        <div><strong>特性</strong><br>${traits}</div>
      `;
    }

    const nextAttackEl = document.getElementById("monsterNextAttack");
    if (nextAttackEl) {
      const nextAttackText = buildMonsterNextAttackText(definition, slot);
      nextAttackEl.textContent = `次の攻撃 → ${nextAttackText}`;
    }
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
