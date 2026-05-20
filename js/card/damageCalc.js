/**
 * damageCalc.js
 * ダメージ計算ロジック（ゲームルール）
 *
 * 責務: ダメージ計算のみ。UI・state mutation・Firebase同期は行わない。
 * contextMenu.js の applyDamageByRule から移植・統一。
 */

/**
 * ダメージ計算を行い、適用後のステータスを返す（state を直接変更しない）
 *
 * @param {{ hp: number, shield: number, defstack: number, defstackMax: number }} snapshot
 * @param {"damage"|"pierce"|"fragile"|"arcana"|"hp_reduce"|"direct_attack"} type
 * @param {number} amount
 * @returns {{ hp: number, shield: number, defstack: number, defstackMax: number }}
 */
function applyDamageByRule(snapshot, type, amount) {
  const result = {
    hp:          Number(snapshot.hp)          || 0,
    shield:      Number(snapshot.shield)      || 0,
    defstack:    Number(snapshot.defstack)    || 0,
    defstackMax: Math.max(0, Number(snapshot.defstackMax) || 0)
  };
  const hits = Math.max(0, Number(amount) || 0);
  if (hits <= 0) return result;

  // シールド → HP の順に吸収するヘルパー
  const applyToShieldAndHp = (dmg) => {
    let remain = Math.max(0, Number(dmg) || 0);
    if (result.shield > 0) {
      const absorbed = Math.min(result.shield, remain);
      result.shield -= absorbed;
      remain -= absorbed;
    }
    if (remain > 0) {
      result.hp = Math.max(0, result.hp - remain);
    }
  };

  switch (type) {
    // HP を直接減らす（防御無視）
    case "hp_reduce":
      result.hp = Math.max(0, result.hp - hits);
      break;

    // 脆弱ダメージ: 防御スタックを削る
    case "fragile":
      result.defstack = Math.max(0, result.defstack - hits);
      break;

    // 貫通ダメージ: シールド → HP（防御スタック無視）
    case "pierce":
      applyToShieldAndHp(hits);
      break;

    // アルカナダメージ: 防御スタックを削り、余剰分をシールド → HP へ
    case "arcana": {
      const brokenDef = Math.min(result.defstack, hits);
      result.defstack -= brokenDef;
      applyToShieldAndHp(hits - brokenDef);
      break;
    }

    // 通常ダメージ / 直接攻撃:
    // 防御スタックを 1 ずつ削り、0 到達時のみ 1 ダメージ通過。その後防御を最大値へループ。
    case "damage":
    case "direct_attack":
    default: {
      let passDamage = 0;
      for (let i = 0; i < hits; i++) {
        if (result.defstack > 0) {
          result.defstack -= 1;
        } else {
          passDamage += 1;
          result.defstack = result.defstackMax;
        }
      }
      applyToShieldAndHp(passDamage);
      break;
    }
  }

  return result;
}

/**
 * ダメージタイプの表示ラベルを返す
 * @param {"damage"|"pierce"|"fragile"|"arcana"|"hp_reduce"|"direct_attack"} type
 * @returns {string}
 */
function getDamageTypeLabel(type) {
  const labels = {
    damage:        "ダメージ",
    pierce:        "貫通ダメージ",
    fragile:       "脆弱ダメージ",
    arcana:        "アルカナダメージ",
    hp_reduce:     "HP減少",
    direct_attack: "直接攻撃"
  };
  return labels[type] || "ダメージ";
}

/**
 * ダメージタイプの説明文を返す
 * @param {"damage"|"pierce"|"fragile"|"arcana"|"hp_reduce"|"direct_attack"} type
 * @param {"normal"|"additional"|"none"} subType
 * @returns {string}
 */
function getDamageTypeDescription(type, subType) {
  const descs = {
    damage:        "通常のダメージ",
    pierce:        "防御力を無視",
    arcana:        "防御突破時のバースト",
    hp_reduce:     "HPを直に減らす",
    fragile:       "防御力を減少させる",
    direct_attack: "アタッカーカードによる攻撃ダメージ"
  };
  let desc = descs[type] || "ダメージ";
  if (subType === "additional") {
    desc = type === "damage"
      ? '"追加"特性を持つ、通常のダメージ'
      : `"追加"特性を持ち、${desc}する`;
  }
  return desc;
}

// グローバルに公開（contextMenu.js・MonsterCombatSystem.js から参照可能）
window.applyDamageByRule       = applyDamageByRule;
window.getDamageTypeLabel       = getDamageTypeLabel;
window.getDamageTypeDescription = getDamageTypeDescription;
