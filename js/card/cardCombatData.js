(function() {
  const ATTR_BASE_ATTACK = {
    "近接": 2,
    "遠隔": 1,
    "魔法": 3
  };

  const EFFECT_LIBRARY = {
    "近接:アタッカー": {
      timing: "攻撃時",
      summary: "手札を1枚増やす。",
      actions: [{ type: "draw_to_hand", amount: 1 }]
    },
    "近接:スキル": {
      timing: "通常",
      summary: "通常ダメージ1。自分のPPを1回復。",
      actions: [
        { type: "damage", damageType: "damage", amount: 1 },
        { type: "recover_pp", amount: 1 }
      ]
    },
    "近接:サポート": {
      timing: "継続",
      summary: "ターン開始時、PPを1回復。",
      actions: [{ type: "recover_pp", amount: 1 }]
    },
    "遠隔:アタッカー": {
      timing: "直接攻撃時",
      summary: "追加ダメージ1。",
      actions: [{ type: "damage", damageType: "damage", amount: 1, subType: "additional" }]
    },
    "遠隔:スキル": {
      timing: "通常",
      summary: "貫通ダメージ2。",
      actions: [{ type: "damage", damageType: "pierce", amount: 2 }]
    },
    "遠隔:サポート": {
      timing: "登場時",
      summary: "相手に脆弱ダメージ1。",
      actions: [{ type: "damage", damageType: "fragile", amount: 1 }]
    },
    "魔法:アタッカー": {
      timing: "登場時",
      summary: "自身のHPを1回復。",
      actions: [{ type: "heal_hp", amount: 1 }]
    },
    "魔法:スキル": {
      timing: "通常",
      summary: "アルカナダメージ2。",
      actions: [{ type: "damage", damageType: "arcana", amount: 2 }]
    },
    "魔法:サポート": {
      timing: "即効",
      summary: "相手のHPを1減らす。",
      actions: [{ type: "damage", damageType: "hp_reduce", amount: 1 }]
    }
  };

  function normalizeCardRole(rawType) {
    if (rawType === "アタッカー" || rawType === "スキル" || rawType === "サポート") return rawType;
    return "アタッカー";
  }

  function roleToKind(role) {
    if (role === "スキル") return "skill";
    if (role === "サポート") return "support";
    return "attacker";
  }

  function estimateSupportRole(card) {
    if (!card || card.type !== "スキル") return card?.type || "アタッカー";
    const idNum = Number(String(card.id || "").replace(/\D+/g, ""));
    if (!Number.isFinite(idNum) || idNum <= 0) return card.type;
    return idNum % 7 === 0 ? "サポート" : "スキル";
  }

  function getCost(role) {
    if (role === "サポート") return 0;
    return 1;
  }

  function getAttack(card, role) {
    const explicitAttack = Number(card.attack);
    if (Number.isFinite(explicitAttack) && explicitAttack >= 0) {
      return Math.floor(explicitAttack);
    }
    const base = ATTR_BASE_ATTACK[card.attribute] || 1;
    if (role === "アタッカー") return base;
    if (role === "スキル") return Math.max(1, base - 1);
    return 0;
  }

  function detectCardCostPolicy(card) {
    const rawText = String(card?.effectText || "").trim();
    if (rawText.includes("ジョーカー")) return "joker";
    if (rawText.includes("オールイン")) return "all_in";
    return "normal";
  }

  function buildProfile(card) {
    const resolvedRole = normalizeCardRole(estimateSupportRole(card));
    const effectKey = `${card.attribute}:${resolvedRole}`;
    const effect = EFFECT_LIBRARY[effectKey] || EFFECT_LIBRARY["近接:アタッカー"];
    const originalEffectText = String(card.effectText || "").trim();
    return {
      cardKind: roleToKind(resolvedRole),
      resolvedRole,
      cost: getCost(resolvedRole),
      cardCostPolicy: detectCardCostPolicy(card),
      attack: getAttack(card, resolvedRole),
      effectKey,
      effectTiming: effect.timing,
      effectText: originalEffectText || effect.summary,
      effectActions: effect.actions
    };
  }

  function enrichCard(card) {
    if (!card || card._combatEnriched) return card;
    const profile = buildProfile(card);
    card.cardKind = profile.cardKind;
    card.resolvedRole = profile.resolvedRole;
    card.cost = profile.cost;
    card.cardCostPolicy = profile.cardCostPolicy;
    card.attack = profile.attack;
    card.effectKey = profile.effectKey;
    card.effectTiming = profile.effectTiming;
    card.effectText = profile.effectText;
    card.effectActions = profile.effectActions;
    card._combatEnriched = true;
    return card;
  }

  function enrichAllLoadedCards() {
    if (typeof getCardIds !== "function" || typeof getCardData !== "function") return;
    const ids = getCardIds();
    ids.forEach((id) => {
      const card = getCardData(id);
      enrichCard(card);
    });
  }

  function getResolvedCardData(id) {
    if (typeof getCardData !== "function") return null;
    const card = getCardData(id);
    return enrichCard(card);
  }

  function getCardBattleAttack(id, owner) {
    const card = getResolvedCardData(id);
    const cardAttack = Math.max(0, Number(card?.attack || 0));
    const baseAttack = Math.max(0, Number(window.state?.[owner]?.atk || 0));
    return cardAttack + baseAttack;
  }

  window.CardCombatData = {
    enrichAllLoadedCards,
    enrichCard,
    getResolvedCardData,
    getCardBattleAttack,
    EFFECT_LIBRARY
  };

  const originalLoadCardData = window.loadCardData;
  if (typeof originalLoadCardData === "function") {
    window.loadCardData = async function() {
      await originalLoadCardData();
      enrichAllLoadedCards();
    };
  }
})();
