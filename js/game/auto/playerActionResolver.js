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
    "JOKER",
    "ALL_IN",
    "UNKNOWN"
  ]);

  const runtime = {
    enabled: true,
    lastResolvedInstanceKey: ""
  };

  function logFlow(message) {
    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[FLOW] ${message}`);
    } else {
      console.log(`[FLOW] ${message}`);
    }
  }

  function trackEffectActivation(owner, cardId, trigger, effectType) {
    if (!window.GameStatTracker || typeof window.GameStatTracker.recordEffectActivation !== "function") return;
    window.GameStatTracker.recordEffectActivation({
      owner: owner || "player1",
      cardId: cardId || "unknown",
      trigger: trigger || "manual",
      effectType: effectType || "UNKNOWN"
    });
  }

  function bumpFlowCounter(scope, owner, key, amount) {
    if (!window.GameStatTracker || typeof window.GameStatTracker.bumpCustom !== "function") return;
    window.GameStatTracker.bumpCustom(scope, owner || "player1", key, Number(amount || 1));
  }

  function getMyRoleSafe() {
    return (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
  }

  function normalizeTrigger(trigger) {
    const t = String(trigger || "manual");
    if (t === "onSummon" || t === "onAttack" || t === "onDirectAttack" || t === "onSkillBeforeAttackEffect" || t === "onSkillAfterAttackEffect") return t;
    if (t === "manual" || t === "instant" || t === "continuous") return "onSummon";
    return "onSummon";
  }

  function getCardByElement(cardEl) {
    const cardId = cardEl?.dataset?.id;
    if (!cardId || typeof window.getCardData !== "function") return null;
    return window.getCardData(cardId);
  }

  function spendCardCost(owner, card) {
    if (card && card._ppCostHandledByModal) return true;
    const costPolicy = String(card?.cardCostPolicy || "normal");
    const player = window.state?.[owner];
    if (!player) return false;
    const currentPp = Number(player.pp || 0);
    if (costPolicy === "joker") {
      logFlow(`COST_RULE joker: PP無視・消費なし (current=${currentPp})`);
      return true;
    }
    if (costPolicy === "all_in") {
      player.pp = 0;
      if (typeof window.pushMyStateDebounced === "function" && owner === getMyRoleSafe()) {
        window.pushMyStateDebounced();
      }
      logFlow(`COST_RULE all_in: PP無視・全消費 (${currentPp} -> 0)`);
      return true;
    }
    const cost = Math.max(0, Number(card?.cost || 0));
    if (cost <= 0) return true;
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

  function resolveWithEffectEngine(profile, cardEl, owner, zoneType, triggerName) {
    if (!window.EffectEngine || typeof window.EffectEngine.execute !== "function") return null;
    const dsl = profile?.effectDsl;
    if (!dsl || dsl.format !== window.EffectEngine.DSL_FORMAT) return null;
    const context = {
      game: window.state,
      sourceCard: cardEl,
      sourceProfile: profile,
      owner,
      opponent: owner === "player1" ? "player2" : "player1",
      target: owner === "player1" ? "player2" : "player1",
      event: { name: triggerName, zoneType }
    };
    return window.EffectEngine.execute(dsl, context);
  }

  function runEngineForTrigger(profile, cardEl, owner, zoneType, triggerName) {
    const r = resolveWithEffectEngine(profile, cardEl, owner, zoneType, triggerName);
    if (!r || !r.handled) return;
    const cardId = profile.id || cardEl.dataset.id || "unknown";
    let count = 0;
    (r.effects || []).forEach((item) => {
      count += 1;
      trackEffectActivation(owner, cardId, triggerName, String(item?.type || "UNKNOWN"));
    });
    if (count === 0) trackEffectActivation(owner, cardId, triggerName, "NONE");
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
    if (cardEl.dataset.ppCostHandled === "1") {
      profile._ppCostHandledByModal = true;
      delete cardEl.dataset.ppCostHandled;
      delete cardEl.dataset.ppCostValue;
    }
    const cardName = profile.name || profile.id || "カード";
    const cardId = profile.id || cardEl.dataset.id || "unknown";
    const flowId = `${cardEl.dataset.instanceId || "noinst"}:${zoneType}`;
    const triggerName = normalizeTrigger("onSummon");

    logFlow(`START ${flowId} ${cardName} owner=${owner} zone=${zoneType}`);
    bumpFlowCounter("turn", owner, "flow.start.count", 1);
    bumpFlowCounter("game", owner, "flow.start.count", 1);
    if (profile.cardKind === "skill") {
      bumpFlowCounter("turn", owner, "use.skill", 1);
      bumpFlowCounter("game", owner, "use.skill", 1);
    } else if (profile.cardKind === "attacker" || profile.cardKind === "support") {
      bumpFlowCounter("turn", owner, "use.attacker", 1);
      bumpFlowCounter("game", owner, "use.attacker", 1);
    }

    if (!spendCardCost(owner, profile)) {
      logFlow(`EFFECT_CHECK ${flowId} skipped: PP不足`);
      trackEffectActivation(owner, cardId, triggerName, "SKIPPED_NO_PP");
      if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(cardEl);
      if (typeof window.organizeHands === "function") window.organizeHands();
      if (typeof window.saveAllImmediate === "function") window.saveAllImmediate();
      if (typeof window.update === "function") window.update(true);
      logFlow(`END ${flowId} result=cancelled`);
      bumpFlowCounter("turn", owner, "flow.end.cancelled", 1);
      bumpFlowCounter("game", owner, "flow.end.cancelled", 1);
      return;
    }

    if (typeof window.addGameLog === "function") {
      const policy = String(profile.cardCostPolicy || "normal");
      const policyLabel = policy === "joker" ? "ジョーカー" : (policy === "all_in" ? "オールイン" : "通常");
      window.addGameLog(`[ACTION] ${cardName} を使用 (PP:${profile.cost || 0}, CostRule:${policyLabel})`);
    }

    let preventDefaultDsl = false;
    if (window.FirstEightCardEffects && typeof window.FirstEightCardEffects.resolveCardEffectById === "function") {
      const scriptResult = window.FirstEightCardEffects.resolveCardEffectById({
        cardEl,
        owner,
        zoneType,
        profile
      });
      if (scriptResult && scriptResult.preventDefaultDsl) preventDefaultDsl = true;
    }

    if (!preventDefaultDsl && profile.cardKind !== "skill") {
      const dsl = profile.effectDsl;
      let resolvedEffects = 0;
      let knownEffects = 0;
      const engineResult = resolveWithEffectEngine(profile, cardEl, owner, zoneType, triggerName);
      if (engineResult && engineResult.handled) {
        (engineResult.effects || []).forEach((item) => {
          const effectType = String(item?.type || "UNKNOWN");
          resolvedEffects += 1;
          if (item?.applied) knownEffects += 1;
          trackEffectActivation(owner, cardId, triggerName, effectType);
        });
        if (resolvedEffects > 0) {
          logFlow(`EFFECT_CHECK ${flowId} trigger=${triggerName} effects=${resolvedEffects} engine=1`);
        } else {
          logFlow(`EFFECT_CHECK ${flowId} trigger=${triggerName} effects=0 (engine-no-match)`);
          trackEffectActivation(owner, cardId, triggerName, "NONE");
        }
      } else if (dsl && Array.isArray(dsl.triggers)) {
        const matched = dsl.triggers.filter((t) => normalizeTrigger(t.on) === triggerName);
        matched.forEach((t) => {
          (t.effects || []).forEach((effect) => {
            resolvedEffects += 1;
            const effectType = String(effect?.type || "UNKNOWN");
            if (KNOWN_EFFECT_TYPES.has(effectType)) knownEffects += 1;
            trackEffectActivation(owner, cardId, triggerName, effectType);
            applyKnownEffect(effect, owner);
          });
        });
        if (resolvedEffects > 0) {
          logFlow(`EFFECT_CHECK ${flowId} trigger=${triggerName} effects=${resolvedEffects} known=${knownEffects} unknown=${Math.max(0, resolvedEffects - knownEffects)}`);
        } else {
          logFlow(`EFFECT_CHECK ${flowId} trigger=${triggerName} effects=0 (定義なし)`);
          trackEffectActivation(owner, cardId, triggerName, "NONE");
        }
      } else {
        logFlow(`EFFECT_CHECK ${flowId} dsl=none`);
        trackEffectActivation(owner, cardId, triggerName, "NONE_DSL");
      }
    } else if (preventDefaultDsl) {
      logFlow(`EFFECT_CHECK ${flowId} scripted=first8`);
      trackEffectActivation(owner, cardId, triggerName, "SCRIPTED_FIRST8");
    }

    if (profile.cardKind === "skill") {
      runEngineForTrigger(profile, cardEl, owner, zoneType, "onSkillBeforeAttackEffect");
    }
    if (profile.cardKind === "skill" && window.FirstEightCardEffects && typeof window.FirstEightCardEffects.resolveAttackTriggerForAttacker === "function") {
      window.FirstEightCardEffects.resolveAttackTriggerForAttacker(owner);
    }
    if (profile.cardKind === "skill") {
      runEngineForTrigger(profile, cardEl, owner, zoneType, "onSkillAfterAttackEffect");
    }

    runtime.lastResolvedInstanceKey = instanceKey;

    if (typeof window.saveAllImmediate === "function") window.saveAllImmediate();
    if (typeof window.update === "function") window.update(true);
    logFlow(`END ${flowId} result=done`);
    bumpFlowCounter("turn", owner, "flow.end.done", 1);
    bumpFlowCounter("game", owner, "flow.end.done", 1);
  }

  function resolveCardOnLeave(cardEl) {
    if (!runtime.enabled || !cardEl) return;
    const owner = cardEl.dataset.owner || getMyRoleSafe();
    const me = getMyRoleSafe();
    if (owner !== me) return;
    const card = getCardByElement(cardEl);
    if (!card) return;
    const profile = (window.CardCombatData && typeof window.CardCombatData.getResolvedCardData === "function")
      ? window.CardCombatData.getResolvedCardData(card.id)
      : card;
    const triggerName = "onLeave";
    const dsl = profile?.effectDsl;
    const engine = window.EffectEngine;
    const engineResult = (engine && typeof engine.execute === "function" && dsl && dsl.format === engine.DSL_FORMAT)
      ? engine.execute(dsl, {
        game: window.state,
        sourceCard: cardEl,
        sourceProfile: profile,
        owner,
        opponent: owner === "player1" ? "player2" : "player1",
        target: owner === "player1" ? "player2" : "player1",
        event: {
          name: triggerName,
          zoneType: "grave",
          didDirectAttack: cardEl.dataset.didDirectAttack === "1"
        }
      })
      : null;
    if (!engineResult || !engineResult.handled) return;
    (engineResult.effects || []).forEach((item) => {
      trackEffectActivation(owner, profile.id || cardEl.dataset.id || "unknown", triggerName, String(item?.type || "UNKNOWN"));
    });
  }

  function installPlaceCardHook() {
    if (typeof window.placeCardInZone !== "function") return;
    if (window.placeCardInZone._playerActionResolverWrapped) return;

    const original = window.placeCardInZone;
    const wrapped = function(cardEl, owner, zoneType) {
      const prevZoneType = cardEl?.dataset?.zoneType || "";
      const prevDidDirectAttack = cardEl?.dataset?.didDirectAttack || "0";
      const result = original.apply(this, arguments);
      try {
        resolveCardOnPlay(cardEl, zoneType);
        if (zoneType === "grave" && prevZoneType === "attacker") {
          if (cardEl) cardEl.dataset.didDirectAttack = prevDidDirectAttack;
          resolveCardOnLeave(cardEl);
        }
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
