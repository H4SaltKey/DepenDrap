(function() {
  const ATTR_BASE_ATTACK = {
    "近接": 2,
    "遠隔": 1,
    "魔法": 3
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
    const originalEffectText = String(card.effectText || "").trim();
    return {
      cardKind: roleToKind(resolvedRole),
      resolvedRole,
      cost: getCost(resolvedRole),
      cardCostPolicy: detectCardCostPolicy(card),
      attack: getAttack(card, resolvedRole),
      effectText: originalEffectText
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
    card.effectText = profile.effectText;
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
  };

  const originalLoadCardData = window.loadCardData;
  if (typeof originalLoadCardData === "function") {
    window.loadCardData = async function() {
      await originalLoadCardData();
      enrichAllLoadedCards();
    };
  }
})();
