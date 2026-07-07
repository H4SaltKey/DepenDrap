(function() {
  const TARGET_IDS = new Set([
    "cd001-001",
    "cd001-002",
    "cd001-003",
    "cd001-004",
    "cd001-005",
    "cd001-006",
    "cd001-007",
    "cd001-008"
  ]);

  function meToOp(owner) {
    return owner === "player1" ? "player2" : "player1";
  }

  function track(owner, cardId, trigger, effectType) {
    if (!window.GameStatTracker || typeof window.GameStatTracker.recordEffectActivation !== "function") return;
    window.GameStatTracker.recordEffectActivation({
      owner: owner || "player1",
      cardId: cardId || "unknown",
      trigger: trigger || "manual",
      effectType: effectType || "SCRIPTED"
    });
  }

  function getPlayer(owner) {
    return window.state?.[owner] || null;
  }

  function addPp(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "pp", amount);
  }

  function setPpAtLeast(owner, floorValue) {
    const s = getPlayer(owner);
    if (!s) return;
    const cur = Number(s.pp || 0);
    if (cur < floorValue) {
      const max = Number(s.ppMax || 2);
      s.pp = Math.min(max, floorValue);
      if (typeof window.pushMyStateDebounced === "function") window.pushMyStateDebounced();
    }
  }

  function healHp(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "hp", amount);
  }

  function reduceHp(owner, amount) {
    if (typeof window.applyCalculatedDamage === "function") {
      window.applyCalculatedDamage(owner, "hp_reduce", "none", amount, false, { source: "first8" });
    }
  }

  function addShield(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "shield", amount);
  }

  function drawToHand(amount) {
    if (typeof window.drawToHand === "function") window.drawToHand(amount);
  }

  function moveCardToOwnerHand(cardEl, owner) {
    if (!cardEl) return;
    if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(cardEl);
    const handY = Number(window.HAND_ZONE_Y_MIN || 1460) + 40;
    const handOrder = (typeof window.nextHandOrder === "function")
      ? window.nextHandOrder()
      : (Date.now() * 1000);
    cardEl.dataset.handOrder = String(handOrder);
    cardEl.dataset.owner = owner;
    cardEl.dataset.zoneType = "";
    cardEl.style.left = String(Number(cardEl.dataset.x || 1200)) + "px";
    cardEl.style.top = String(handY) + "px";
    cardEl.dataset.y = String(handY);
    if (typeof window.organizeHands === "function") window.organizeHands();
  }

  function triggerLeaveEffects(cardEl, owner) {
    if (!cardEl) return;
    const id = String(cardEl.dataset.id || "");
    const didDirectAttack = cardEl.dataset.didDirectAttack === "1";

    // cd001-001 退場時: 直接攻撃していないなら 自身HP-1 / PPを1まで回復 / 手札へ戻る
    if (id === "cd001-001" && !didDirectAttack) {
      track(owner, id, "onLeave", "SCRIPTED_LEAVE");
      reduceHp(owner, 1);
      setPpAtLeast(owner, 1);
      moveCardToOwnerHand(cardEl, owner);
      if (typeof window.addGameLog === "function") {
        window.addGameLog("[EFFECT] 黒魔術師 退場時効果を発動");
      }
      return { consumed: true };
    }

    // cd001-005 退場時: 直接攻撃していないなら 自身HPを3回復
    if (id === "cd001-005" && !didDirectAttack) {
      track(owner, id, "onLeave", "SCRIPTED_LEAVE");
      healHp(owner, 3);
      if (typeof window.addGameLog === "function") {
        window.addGameLog("[EFFECT] 創世の賢者 退場時効果を発動");
      }
    }

    return { consumed: false };
  }

  function moveOwnerBattleCardsToGrave(owner) {
    if (typeof window.getZoneCards !== "function" || typeof window.placeCardInZone !== "function") return;
    ["attacker", "skill"].forEach((zone) => {
      const cards = window.getZoneCards(owner, zone) || [];
      cards.forEach((cardEl) => {
        // 墓地送り直前に退場時判定を挟む
        const leaveResult = triggerLeaveEffects(cardEl, owner);
        if (leaveResult && leaveResult.consumed) return;
        window.placeCardInZone(cardEl, owner, "grave");
      });
    });
    if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
    if (typeof window.organizeHands === "function") window.organizeHands();
  }

  function isMagicBattleState(owner) {
    if (typeof window.getZoneCards !== "function" || typeof window.getCardData !== "function") return false;
    const attacker = (window.getZoneCards(owner, "attacker") || []).slice(-1)[0];
    if (!attacker) return false;
    const data = window.getCardData(attacker.dataset.id);
    return data?.attribute === "魔法";
  }

  function resolveAttackTriggerForAttacker(owner) {
    if (typeof window.getZoneCards !== "function") return;
    const attacker = (window.getZoneCards(owner, "attacker") || []).slice(-1)[0];
    if (!attacker) return;
    const id = attacker.dataset.id;
    const profile = window.CardCombatData?.getResolvedCardData?.(id);
    const resolvedDsl = (window.CardEffectRuntimeV2 && typeof window.CardEffectRuntimeV2.resolveCardDsl === "function")
      ? window.CardEffectRuntimeV2.resolveCardDsl(profile)
      : profile?.effectDsl;
    if (window.EffectEngine && typeof window.EffectEngine.execute === "function" && resolvedDsl?.format === window.EffectEngine.DSL_FORMAT) {
      const context = {
        game: window.state,
        sourceCard: attacker,
        sourceProfile: profile,
        owner,
        opponent: meToOp(owner),
        target: meToOp(owner),
        event: { name: "onAttack", zoneType: "attacker", targetOwner: meToOp(owner) }
      };
      if (typeof window.EffectEngine.executeGrantedEffects === "function") {
        window.EffectEngine.executeGrantedEffects(context);
      }
      window.EffectEngine.execute(resolvedDsl, context);
      return;
    }
    const self = getPlayer(owner);
    if (!self) return;

    if (id === "cd001-003") {
      track(owner, id, "onAttack", "SCRIPTED_ATTACK");
      healHp(owner, 1);
      addShield(owner, 1);
      return;
    }

    if (id === "cd001-005") {
      track(owner, id, "onAttack", "SCRIPTED_ATTACK");
      self._cd001005_usedHeal2 = !!self._cd001005_usedHeal2;
      if (!self._cd001005_usedHeal2) {
        healHp(owner, 2);
        self._cd001005_usedHeal2 = true;
      } else {
        healHp(owner, 1);
      }
      return;
    }

    if (id === "cd001-007") {
      track(owner, id, "onAttack", "SCRIPTED_ATTACK");
      const hp = Number(self.hp || 0);
      if (hp >= 11) reduceHp(owner, 1);
      const hpNow = Number(self.hp || 0);
      let x = 0;
      if (hpNow >= 6 && hpNow <= 10) x = 1;
      else if (hpNow >= 2 && hpNow <= 5) x = 2;
      else if (hpNow === 1) x = 3;
      if (x > 0 && typeof window.addVal === "function") window.addVal(owner, "atk", x);
      return;
    }

    if (id === "cd001-001") {
      // 直接攻撃時の分岐は未対応。攻撃時は現時点では追加処理なし。
      return;
    }
  }

  function resolveCardEffectById(context) {
    const { profile, owner, zoneType } = context;
    const id = profile?.id;
    if (!id || !TARGET_IDS.has(id)) return { handled: false };
    const resolvedDsl = (window.CardEffectRuntimeV2 && typeof window.CardEffectRuntimeV2.resolveCardDsl === "function")
      ? window.CardEffectRuntimeV2.resolveCardDsl(profile)
      : profile?.effectDsl;
    if (resolvedDsl?.format === "dependrap.dsl.v1" && Array.isArray(resolvedDsl?.triggers) && resolvedDsl.triggers.length > 0) {
      return { handled: false, reason: "prefer-dsl-v1" };
    }

    const self = getPlayer(owner);
    const op = meToOp(owner);

    if (id === "cd001-001" && zoneType === "attacker") {
      track(owner, id, "onSummon", "SCRIPTED_CARD");
      setPpAtLeast(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-002" && zoneType === "skill") {
      track(owner, id, "onAttack", "SCRIPTED_CARD");
      if (isMagicBattleState(owner)) {
        moveOwnerBattleCardsToGrave(owner);
        reduceHp(owner, 1);
        drawToHand(1);
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-003" && zoneType === "attacker") {
      track(owner, id, "onSummon", "SCRIPTED_CARD");
      const hp = Number(self?.hp || 0);
      const shield = Number(self?.shield || 0);
      if (hp >= 15) drawToHand(1);
      if (hp >= 20 || shield > 0) addPp(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-004" && zoneType === "skill") {
      track(owner, id, "onAttack", "SCRIPTED_CARD");
      if (isMagicBattleState(owner)) {
        resolveAttackTriggerForAttacker(owner);
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-005" && zoneType === "attacker") {
      track(owner, id, "onSummon", "SCRIPTED_CARD");
      // 継続効果は簡易実装: 登場時には処理なし
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-006" && zoneType === "skill") {
      track(owner, id, "onAttack", "SCRIPTED_CARD");
      if (isMagicBattleState(owner)) {
        moveOwnerBattleCardsToGrave(owner);
        healHp(owner, 1);
        const myHp = Number(self?.hp || 0);
        const opHp = Number(getPlayer(op)?.hp || 0);
        const diff = myHp - opHp;
        if (diff > 0) {
          let x = 1;
          if (diff >= 8) x = 4;
          else if (diff >= 6) x = 3;
          else if (diff >= 4) x = 2;
          reduceHp(op, x);
        }
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-007" && zoneType === "attacker") {
      track(owner, id, "onSummon", "SCRIPTED_CARD");
      const hp = Number(self?.hp || 0);
      if (hp >= 11) addPp(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-008" && zoneType === "skill") {
      track(owner, id, "onAttack", "SCRIPTED_CARD");
      if (isMagicBattleState(owner)) {
        const atk = Math.max(0, Number(profile.attack || 0));
        healHp(owner, atk);
        const m = window.state?.matchData || {};
        const key = `${owner}:${m.round || 0}:${m.turn || 0}`;
        window.runtimeState = window.runtimeState || {};
        window.runtimeState.effects = window.runtimeState.effects || {};
        window.runtimeState.effects.pendingTurnEndHeal = window.runtimeState.effects.pendingTurnEndHeal || {};
        window.runtimeState.effects.pendingTurnEndHeal[key] = atk;
      }
      return { handled: true, preventDefaultDsl: true };
    }

    return { handled: false };
  }

  function beforeTurnEndHook() {
    const m = window.state?.matchData;
    if (!m || m.status !== "playing") return;
    const owner = m.turnPlayer;
    const roleCards = (typeof window.getZoneCards === "function")
      ? [
        ...(window.getZoneCards(owner, "attacker") || []),
        ...(window.getZoneCards(owner, "skill") || [])
      ]
      : [];
    const hasDslCd001008 = roleCards.some((el) => {
      if (String(el?.dataset?.id || "") !== "cd001-008") return false;
      const profile = window.CardCombatData?.getResolvedCardData?.(el.dataset.id) || null;
      const dsl = (window.CardEffectRuntimeV2 && typeof window.CardEffectRuntimeV2.resolveCardDsl === "function")
        ? window.CardEffectRuntimeV2.resolveCardDsl(profile)
        : profile?.effectDsl;
      return !!(dsl?.format === "dependrap.dsl.v1" && Array.isArray(dsl?.triggers) && dsl.triggers.length > 0);
    });
    if (hasDslCd001008) return;
    const key = `${owner}:${m.round || 0}:${m.turn || 0}`;
    const pending = window.runtimeState?.effects?.pendingTurnEndHeal?.[key];
    if (!Number.isFinite(Number(pending)) || Number(pending) <= 0) return;
    track(owner, "cd001-008", "onTurnEnd", "SCRIPTED_TURN_END");
    healHp(owner, Number(pending));
    delete window.runtimeState.effects.pendingTurnEndHeal[key];
    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[EFFECT] 吸血のターン終了時効果: ${owner} のHPを ${Number(pending)} 回復`);
    }
  }

  function installHooks() {
    if (!Array.isArray(window._beforeTurnEndHooks)) window._beforeTurnEndHooks = [];
    if (!window._beforeTurnEndHooks.includes(beforeTurnEndHook)) {
      window._beforeTurnEndHooks.push(beforeTurnEndHook);
    }
  }

  window.FirstEightCardEffects = {
    TARGET_IDS,
    resolveCardEffectById,
    resolveAttackTriggerForAttacker,
    installHooks
  };

  installHooks();
})();
