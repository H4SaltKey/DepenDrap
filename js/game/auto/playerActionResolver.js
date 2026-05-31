(function() {
  const KNOWN_EFFECT_TYPES = new Set([
    "DRAW",
    "DAMAGE",
    "HEAL",
    "DESTROY",
    "DISCARD",
    "SEARCH",
    "SUMMON",
    "BUFF",
    "DEBUFF",
    "UNKNOWN"
  ]);

  const runtime = {
    enabled: true,
    lastResolvedInstanceKey: ""
  };

  function getMyRoleSafe() {
    return (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
  }

  function normalizeTrigger(trigger) {
    const t = String(trigger || "manual");
    if (t === "onSummon" || t === "onAttack" || t === "onDirectAttack") return t;
    if (t === "manual" || t === "instant" || t === "continuous") return "onSummon";
    return "onSummon";
  }

  function getCardByElement(cardEl) {
    const cardId = cardEl?.dataset?.id;
    if (!cardId || typeof window.getCardData !== "function") return null;
    return window.getCardData(cardId);
  }

  function spendCardCost(owner, card) {
    const cost = Math.max(0, Number(card?.cost || 0));
    if (cost <= 0) return true;
    const player = window.state?.[owner];
    if (!player) return false;
    const currentPp = Number(player.pp || 0);
    if (currentPp < cost) {
      if (typeof window.showWarningMessage === "function") {
        window.showWarningMessage(`PPが不足しています (必要:${cost})`);
      }
      return false;
    }
    player.pp = currentPp - cost;
    if (typeof window.pushMyStateDebounced === "function" && owner === getMyRoleSafe()) {
      window.pushMyStateDebounced();
    }
    return true;
  }

  function applyKnownEffect(effect, owner) {
    const op = owner === "player1" ? "player2" : "player1";
    const amount = Math.max(0, Number(effect?.amount || 1));
    const type = String(effect?.type || "UNKNOWN");

    if (!KNOWN_EFFECT_TYPES.has(type)) return;

    if (type === "DRAW") {
      if (typeof window.drawToHand === "function") window.drawToHand(amount || 1);
      return;
    }
    if (type === "HEAL") {
      if (typeof window.addVal === "function") window.addVal(owner, "hp", amount || 1);
      return;
    }
    if (type === "DAMAGE") {
      if (typeof window.applyCalculatedDamage === "function") {
        window.applyCalculatedDamage(op, "damage", "normal", amount || 1, false, { source: "player_action" });
      }
      return;
    }
    if (type === "BUFF") {
      if (typeof window.addVal === "function") window.addVal(owner, "atk", amount || 1);
      return;
    }
    if (type === "DEBUFF") {
      if (typeof window.addVal === "function") window.addVal(op, "atk", -(amount || 1));
      return;
    }
  }

  function resolveCardOnPlay(cardEl, zoneType) {
    if (!runtime.enabled) return;
    if (!cardEl || !zoneType) return;

    const owner = cardEl.dataset.owner || getMyRoleSafe();
    const me = getMyRoleSafe();
    if (owner !== me) return;
    if (zoneType !== "attacker" && zoneType !== "skill") return;

    const instanceKey = `${cardEl.dataset.instanceId || "noinst"}:${zoneType}`;
    if (runtime.lastResolvedInstanceKey === instanceKey) return;

    const card = getCardByElement(cardEl);
    if (!card) return;

    // cards.json を単一情報源として参照
    const profile = (window.CardCombatData && typeof window.CardCombatData.getResolvedCardData === "function")
      ? window.CardCombatData.getResolvedCardData(card.id)
      : card;

    if (!spendCardCost(owner, profile)) {
      if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(cardEl);
      if (typeof window.organizeHands === "function") window.organizeHands();
      if (typeof window.saveAllImmediate === "function") window.saveAllImmediate();
      if (typeof window.update === "function") window.update(true);
      return;
    }

    const dsl = profile.effectDsl;
    if (dsl && Array.isArray(dsl.triggers)) {
      const triggerName = normalizeTrigger(profile.cardKind === "skill" ? "onAttack" : "onSummon");
      dsl.triggers
        .filter((t) => normalizeTrigger(t.on) === triggerName)
        .forEach((t) => {
          (t.effects || []).forEach((effect) => applyKnownEffect(effect, owner));
        });
    }

    if (typeof window.addGameLog === "function") {
      const cardName = profile.name || profile.id || "カード";
      window.addGameLog(`[ACTION] ${cardName} を使用 (PP:${profile.cost || 0})`);
    }

    runtime.lastResolvedInstanceKey = instanceKey;

    if (typeof window.saveAllImmediate === "function") window.saveAllImmediate();
    if (typeof window.update === "function") window.update(true);
  }

  function installPlaceCardHook() {
    if (typeof window.placeCardInZone !== "function") return;
    if (window.placeCardInZone._playerActionResolverWrapped) return;

    const original = window.placeCardInZone;
    const wrapped = function(cardEl, owner, zoneType) {
      const result = original.apply(this, arguments);
      try {
        resolveCardOnPlay(cardEl, zoneType);
      } catch (e) {
        console.warn("[PlayerActionResolver] resolve error:", e);
      }
      return result;
    };
    wrapped._playerActionResolverWrapped = true;
    window.placeCardInZone = wrapped;
  }

  function init() {
    installPlaceCardHook();
    if (Array.isArray(window._afterUpdateHooks) && !window._afterUpdateHooks.includes(installPlaceCardHook)) {
      window._afterUpdateHooks.push(installPlaceCardHook);
    }
  }

  window.PlayerActionResolver = {
    runtime,
    init,
    resolveCardOnPlay
  };

  init();
})();
