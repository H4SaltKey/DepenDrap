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
    const currentTarget = window.BattleTargetSystem?.getTarget?.(myRole);
    const targetSlotIndex = currentTarget && currentTarget !== "player" && typeof currentTarget === "object"
      ? currentTarget.slotIndex
      : undefined;
    const slot = typeof targetSlotIndex === "number" ? window.MonsterManager?.getSlot(targetSlotIndex) : null;
    const defeated = typeof targetSlotIndex === "number" && !slot;

    if (currentTarget !== "player" && typeof currentTarget === "object") {
      // continue if target is a monster slot or a defeated target
    } else {
      return;
    }

    const definition = slot ? (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId) : null;
    const slotIndex = targetSlotIndex;
    
    const monsterSprite = document.getElementById("monsterSprite");
    const monsterDisplayArea = document.getElementById("monsterDisplayArea");
    const monsterName = document.getElementById("monsterName");
    const monsterHpFill = document.getElementById("monsterHpFill");

    const bindMonsterContextMenu = (el) => {
      if (!el || el.dataset.monsterContextBound) return;
      el.dataset.monsterContextBound = "1";
      el.dataset.monsterSlotIndex = String(slotIndex);
      el.style.cursor = "context-menu";
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slotIndexValue = Number(slotIndex);
        const slotValue = window._currentMonsterTarget?.slot || window.MonsterManager?.getSlot(slotIndexValue);
        if (typeof window.openMonsterMenu === "function" && !defeated) {
          window.openMonsterMenu(slotValue, slotIndexValue, e.clientX, e.clientY);
        }
      });
    };

    if (monsterSprite && slotIndex !== undefined) {
      if (defeated) {
        monsterSprite.style.backgroundImage = "";
        monsterSprite.style.filter = "grayscale(0.8) saturate(0.6)";
        monsterSprite.style.cursor = "default";
        monsterSprite.title = "現在のターゲットは討伐済みです。ここをクリックして次の対象を選択してください。";
      } else {
        const spriteUrl = `assets/System/enemy_${slotIndex + 1}.png`;
        monsterSprite.style.backgroundImage = `url('${spriteUrl}')`;
        monsterSprite.style.filter = "";
        monsterSprite.title = "右クリックでダメージ判定";
        bindMonsterContextMenu(monsterSprite);
      }
    }
    if (monsterDisplayArea) {
      if (defeated) {
        monsterDisplayArea.title = "現在のターゲットは討伐済みです。ここをクリックして次の対象を選択してください。";
        monsterDisplayArea.style.cursor = "pointer";
        monsterDisplayArea.onclick = () => {
          if (typeof window.MonsterUI?._showTargetSelectPanel === "function") {
            window.MonsterUI._showTargetSelectPanel();
          }
        };
      } else {
        monsterDisplayArea.title = "右クリックでダメージ判定";
        monsterDisplayArea.style.cursor = "context-menu";
        monsterDisplayArea.onclick = null;
        bindMonsterContextMenu(monsterDisplayArea);
      }
    }

    if (monsterName) {
      monsterName.textContent = defeated ? "討伐完了！" : (definition?.name || "モンスター");
    }

    const hpPercent = defeated ? 0 : Math.round(Math.max(0, Math.min(100, (slot.currentHp / slot.maxHp) * 100)));
    const monsterHpPercent = document.getElementById("monsterHpPercent");
    if (monsterHpPercent) {
      monsterHpPercent.textContent = `${hpPercent}%`;
    }

    if (monsterHpFill) {
      if (defeated) {
        monsterHpFill.style.width = "0%";
      } else if (slot?.currentHp !== undefined && slot?.maxHp !== undefined) {
        const hpRatio = Math.max(0, slot.currentHp / slot.maxHp);
        monsterHpFill.style.width = `${hpRatio * 100}%`;
      }
    }

    const metaArea = document.getElementById("monsterBattleMeta");
    if (metaArea) {
      if (defeated) {
        const aliveMonsters = slots.filter((s, idx) => s && idx !== targetSlotIndex);
        metaArea.innerHTML = `
          <div style="grid-column: 1 / -1; color: #f7c3a1; font-weight: 700; text-align: center;">
            現在の対象は討伐済みです。次のターゲットを選択してください。
          </div>`;
        if (aliveMonsters.length > 0) {
          const existingBtn = document.getElementById("monsterTargetSelectBtn");
          if (!existingBtn && monsterDisplayArea) {
            const button = document.createElement("button");
            button.id = "monsterTargetSelectBtn";
            button.textContent = "次の対象を選択";
            button.style.cssText = `
              width: 100%;
              margin-top: 10px;
              padding: 10px 14px;
              border-radius: 10px;
              border: 1px solid rgba(240, 208, 128, 0.45);
              background: rgba(15, 12, 22, 0.95);
              color: #f0d080;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              transition: background 0.2s, transform 0.2s;
            `;
            button.addEventListener("mouseenter", () => {
              button.style.background = "rgba(240, 208, 128, 0.08)";
            });
            button.addEventListener("mouseleave", () => {
              button.style.background = "rgba(15, 12, 22, 0.95)";
            });
            button.addEventListener("click", () => {
              if (typeof window.MonsterUI?._showTargetSelectPanel === "function") {
                window.MonsterUI._showTargetSelectPanel();
              }
            });
            monsterDisplayArea.appendChild(button);
          }
        } else {
          const existingBtn = document.getElementById("monsterTargetSelectBtn");
          if (existingBtn) existingBtn.remove();
        }
      } else {
        const existingBtn = document.getElementById("monsterTargetSelectBtn");
        if (existingBtn) existingBtn.remove();
        const traits = (definition?.traits || []).map(t => t.label).join(" / ") || "なし";
        metaArea.innerHTML = `
          <div><strong>HP</strong><br>${slot.currentHp}/${slot.maxHp}</div>
          <div><strong>防御力</strong><br>${slot.def || 0}</div>
          <div><strong>シールド</strong><br>${slot.shield || 0}</div>
          <div><strong>特性</strong><br>${traits}</div>
        `;
      }
    }

    const nextAttackEl = document.getElementById("monsterNextAttack");
    if (nextAttackEl) {
      nextAttackEl.textContent = defeated
        ? "新しいターゲットを選択して攻撃を続行できます。"
        : `次の攻撃 → ${buildMonsterNextAttackText(definition, slot)}`;
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
