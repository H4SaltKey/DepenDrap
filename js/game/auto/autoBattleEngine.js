(function() {
  const AUTO_ACTION_INTERVAL_MS = 650;
  const DIRECT_ATTACK_SUBTYPE = "none";

  const runtime = {
    enabled: false,
    busy: false,
    lastActionAt: 0,
    lastDirectAttackKey: "",
    lastSkillUseKey: "",
    logs: []
  };

  function now() {
    return Date.now();
  }

  function getMe() {
    return (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
  }

  function getOp() {
    const me = getMe();
    return me === "player1" ? "player2" : "player1";
  }

  function getPlayableHandCards(owner) {
    const content = (typeof getFieldContent === "function") ? getFieldContent() : document.getElementById("fieldContent");
    if (!content) return [];
    const handYMin = Number(window.HAND_ZONE_Y_MIN || 1460);
    return Array.from(content.querySelectorAll(".card:not(.deckObject)"))
      .filter((el) => {
        if ((el.dataset.owner || "") !== owner) return false;
        if (el.dataset.zoneType) return false;
        return Number(el.dataset.y || 0) >= handYMin;
      });
  }

  function getZoneTopCard(owner, zoneType) {
    if (typeof window.getZoneCards !== "function") return null;
    const cards = window.getZoneCards(owner, zoneType);
    if (!Array.isArray(cards) || cards.length === 0) return null;
    return cards[cards.length - 1] || null;
  }

  function ensureCardProfile(cardEl) {
    const id = cardEl?.dataset?.id;
    if (!id || !window.CardCombatData?.getResolvedCardData) return null;
    return window.CardCombatData.getResolvedCardData(id);
  }

  function canPayCardCost(owner, profile) {
    const s = window.state?.[owner];
    if (!s) return false;
    const policy = String(profile?.cardCostPolicy || "normal");
    if (policy === "joker" || policy === "all_in") return true;
    const cost = Math.max(0, Number(profile?.cost || 0));
    return Number(s.pp || 0) >= cost;
  }

  function safeUpdate() {
    if (typeof window.saveAllImmediate === "function") window.saveAllImmediate();
    if (typeof window.update === "function") window.update(true);
  }

  function log(message) {
    runtime.logs.unshift(`[AUTO] ${message}`);
    runtime.logs = runtime.logs.slice(0, 20);
    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[AUTO] ${message}`);
    }
    if (typeof window.renderAutoBattleUI === "function") {
      window.renderAutoBattleUI();
    }
  }

  function playUnitIfPossible(me) {
    const attackerOnField = getZoneTopCard(me, "attacker");
    if (attackerOnField) return false;

    const hand = getPlayableHandCards(me);
    const candidate = hand
      .map((el) => ({ el, profile: ensureCardProfile(el) }))
      .find((row) => row.profile && (row.profile.cardKind === "attacker" || row.profile.cardKind === "support"));
    if (!candidate) return false;

    const cost = Number(candidate.profile.cost || 0);
    if (!canPayCardCost(me, candidate.profile)) return false;

    if (typeof window.placeCardInZone === "function") {
      window.placeCardInZone(candidate.el, me, "attacker");
      if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
      safeUpdate();
      log(`場に ${candidate.el.dataset.id} を配置（cost:${cost}）`);
      return true;
    }
    return false;
  }

  function playSkillIfPossible(me) {
    const attackerOnField = getZoneTopCard(me, "attacker");
    if (!attackerOnField) return false;

    const m = window.state?.matchData || {};
    const turnKey = `${m.round || 0}-${m.turn || 0}-${me}`;
    if (runtime.lastSkillUseKey === turnKey) return false;

    const hand = getPlayableHandCards(me);
    const skill = hand
      .map((el) => ({ el, profile: ensureCardProfile(el) }))
      .find((row) => row.profile && row.profile.cardKind === "skill");
    if (!skill) return false;

    const cost = Number(skill.profile.cost || 0);
    if (!canPayCardCost(me, skill.profile)) return false;

    if (typeof window.placeCardInZone === "function") {
      window.placeCardInZone(skill.el, me, "skill");
      if (typeof window.placeCardInZone === "function") {
        window.placeCardInZone(skill.el, me, "grave");
      }
      if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
      safeUpdate();
      runtime.lastSkillUseKey = turnKey;
      log(`スキル ${skill.el.dataset.id} を使用（cost:${cost}）`);
      return true;
    }

    return false;
  }

  function directAttackIfPossible(me) {
    const attacker = getZoneTopCard(me, "attacker");
    if (!attacker) return false;

    const m = window.state?.matchData || {};
    const attackKey = `${m.round || 0}-${m.turn || 0}-${me}`;
    if (runtime.lastDirectAttackKey === attackKey) return false;

    const profile = ensureCardProfile(attacker);
    const myAtkBase = Number(window.state?.[me]?.atk || 0);
    const cardAtkBase = Math.max(0, Number(profile?.attack || 0));
    const cardAtkBonus = Number(attacker.dataset.attackBonus || 0);
    const cardAtk = Math.max(0, cardAtkBase + cardAtkBonus);
    const amount = Math.max(1, myAtkBase + cardAtk);
    if (typeof window.applyCalculatedDamage !== "function") return false;

    window.applyCalculatedDamage(getOp(), "direct_attack", DIRECT_ATTACK_SUBTYPE, amount, false, { source: "auto" });
    attacker.dataset.didDirectAttack = "1";
    if (window.EffectEngine && typeof window.EffectEngine.execute === "function" && profile?.effectDsl) {
      const context = {
        game: window.state,
        sourceCard: attacker,
        sourceProfile: profile,
        owner: me,
        opponent: getOp(),
        target: getOp(),
        event: { name: "onDirectAttack", zoneType: "attacker", targetOwner: getOp() }
      };
      if (typeof window.EffectEngine.executeGrantedEffects === "function") {
        window.EffectEngine.executeGrantedEffects(context);
      }
      window.EffectEngine.execute(profile.effectDsl, context);
    }
    runtime.lastDirectAttackKey = attackKey;
    log(`直接攻撃 ${amount} ダメージ (基礎${myAtkBase} + カード${cardAtkBase}${cardAtkBonus ? (cardAtkBonus > 0 ? `+${cardAtkBonus}` : `${cardAtkBonus}`) : ""})`);
    return true;
  }

  async function endTurn(me) {
    if (typeof window.handleTurnEnd !== "function") return;
    log("ターン終了");
    await window.handleTurnEnd(false);
  }

  async function thinkAndAct() {
    if (!runtime.enabled || runtime.busy) return;
    const m = window.state?.matchData;
    const me = getMe();
    if (!m || m.status !== "playing" || m.turnPlayer !== me || m.winner) return;
    if (window.isGameInteractionLocked && window.isGameInteractionLocked()) return;

    if ((now() - runtime.lastActionAt) < AUTO_ACTION_INTERVAL_MS) return;

    runtime.busy = true;
    try {
      if (playSkillIfPossible(me)) return;
      if (playUnitIfPossible(me)) return;
      if (directAttackIfPossible(me)) return;
      await endTurn(me);
    } finally {
      runtime.lastActionAt = now();
      runtime.busy = false;
      if (typeof window.renderAutoBattleUI === "function") window.renderAutoBattleUI();
    }
  }

  function installHooks() {
    if (!Array.isArray(window._afterUpdateHooks)) window._afterUpdateHooks = [];
    if (!window._afterUpdateHooks.includes(thinkAndAct)) {
      window._afterUpdateHooks.push(thinkAndAct);
    }
  }

  function setEnabled(enabled) {
    runtime.enabled = !!enabled;
    log(runtime.enabled ? "自動進行 ON" : "自動進行 OFF");
    if (typeof window.renderAutoBattleUI === "function") window.renderAutoBattleUI();
  }

  window.AutoBattleSystem = {
    runtime,
    setEnabled,
    installHooks,
    thinkAndAct
  };

  installHooks();
})();
