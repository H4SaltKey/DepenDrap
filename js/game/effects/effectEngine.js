(function() {
  const DSL_FORMAT = "dependrap.dsl.v1";

  function meRole() {
    return (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
  }

  function opponentOf(owner) {
    return owner === "player1" ? "player2" : "player1";
  }

  function getPlayer(owner) {
    return window.state?.[owner] || null;
  }

  function uniqueOwners(owners) {
    return Array.from(new Set((owners || []).filter(Boolean)));
  }

  function isPlayerTargetToken(token) {
    return [
      "self",
      "owner",
      "opponent",
      "eventTarget",
      "self_player",
      "current_target",
      "self_and_current_target",
      "player",
      "target_player",
      "source_player"
    ].includes(String(token || ""));
  }

  function isCardTargetToken(token) {
    return [
      "card",
      "target_card",
      "source_card",
      "this_card",
      "attacker_zone_card",
      "target_attacker_zone_card",
      "self_and_target_attacker_zone_card",
      "grave_card",
      "hand_card",
      "target_skill_card"
    ].includes(String(token || ""));
  }

  function getRefValue(refPath, context, vars) {
    if (!refPath || typeof refPath !== "string") return null;
    if (refPath.startsWith("var.")) {
      return vars?.[refPath.slice(4)] ?? null;
    }
    if (refPath.startsWith("event.")) {
      const key = refPath.slice(6);
      return context?.event?.[key] ?? null;
    }
    const [scope, key] = refPath.split(".");
    const owner = scope === "opponent" ? context.opponent : context.owner;
    const state = getPlayer(owner);
    if (!state) return null;
    if (["hp", "pp", "shield", "atk"].includes(key)) return Number(state[key] || 0);
    return null;
  }

  const VariableResolver = {
    resolveValue(expr, context, vars) {
      if (expr == null) return null;
      if (typeof expr === "number" || typeof expr === "boolean") return expr;
      if (typeof expr === "string") {
        if (expr in (vars || {})) return vars[expr];
        return expr;
      }
      if (Array.isArray(expr)) return expr.map((v) => this.resolveValue(v, context, vars));

      if (typeof expr !== "object") return null;
      if (Object.prototype.hasOwnProperty.call(expr, "var")) return vars?.[expr.var] ?? null;
      if (Object.prototype.hasOwnProperty.call(expr, "ref")) return getRefValue(expr.ref, context, vars);
      if (Object.prototype.hasOwnProperty.call(expr, "selfHp")) return Number(getPlayer(context.owner)?.hp || 0);
      if (Object.prototype.hasOwnProperty.call(expr, "selfShield")) return Number(getPlayer(context.owner)?.shield || 0);
      if (Object.prototype.hasOwnProperty.call(expr, "oppHp")) return Number(getPlayer(context.opponent)?.hp || 0);

      if (expr.add) return (expr.add || []).reduce((a, b) => Number(a || 0) + Number(this.resolveValue(b, context, vars) || 0), 0);
      if (expr.sub) {
        const vals = (expr.sub || []).map((v) => Number(this.resolveValue(v, context, vars) || 0));
        return vals.slice(1).reduce((a, b) => a - b, vals[0] || 0);
      }
      if (expr.mul) return (expr.mul || []).reduce((a, b) => Number(a || 0) * Number(this.resolveValue(b, context, vars) || 0), 1);
      if (expr.div) {
        const vals = (expr.div || []).map((v) => Number(this.resolveValue(v, context, vars) || 0));
        return vals.slice(1).reduce((a, b) => (b === 0 ? a : a / b), vals[0] || 0);
      }
      if (expr.max) return Math.max(...(expr.max || []).map((v) => Number(this.resolveValue(v, context, vars) || 0)));
      if (expr.min) return Math.min(...(expr.min || []).map((v) => Number(this.resolveValue(v, context, vars) || 0)));
      if (expr.if) {
        const [cond, tVal, fVal] = expr.if;
        return ConditionEvaluator.evaluateCondition(cond, context, vars)
          ? this.resolveValue(tVal, context, vars)
          : this.resolveValue(fVal, context, vars);
      }
      return null;
    }
  };

  function compare(left, op, right) {
    if (op === "eq") return left === right;
    if (op === "neq") return left !== right;
    if (op === "gt") return Number(left) > Number(right);
    if (op === "gte") return Number(left) >= Number(right);
    if (op === "lt") return Number(left) < Number(right);
    if (op === "lte") return Number(left) <= Number(right);
    if (op === "in") return Array.isArray(right) && right.includes(left);
    return false;
  }

  const ConditionEvaluator = {
    evaluateCondition(condition, context, vars) {
      if (!condition) return true;
      if (typeof condition === "boolean") return condition;
      if (condition.and) return (condition.and || []).every((c) => this.evaluateCondition(c, context, vars));
      if (condition.or) return (condition.or || []).some((c) => this.evaluateCondition(c, context, vars));
      if (condition.not) return !this.evaluateCondition(condition.not, context, vars);

      if (Object.prototype.hasOwnProperty.call(condition, "left")) {
        const left = VariableResolver.resolveValue(condition.left, context, vars);
        return ["eq", "neq", "gt", "gte", "lt", "lte", "in"].some((op) => (
          Object.prototype.hasOwnProperty.call(condition, op)
            ? compare(left, op, VariableResolver.resolveValue(condition[op], context, vars))
            : false
        ));
      }

      for (const [k, rule] of Object.entries(condition)) {
        const left = k === "selfHp"
          ? Number(getPlayer(context.owner)?.hp || 0)
          : k === "selfShield"
            ? Number(getPlayer(context.owner)?.shield || 0)
            : k === "oppHp"
              ? Number(getPlayer(context.opponent)?.hp || 0)
              : VariableResolver.resolveValue({ ref: k }, context, vars);
        if (rule && typeof rule === "object") {
          const ok = ["eq", "neq", "gt", "gte", "lt", "lte", "in"].every((op) => (
            !Object.prototype.hasOwnProperty.call(rule, op)
              || compare(left, op, VariableResolver.resolveValue(rule[op], context, vars))
          ));
          if (!ok) return false;
        }
      }
      return true;
    }
  };

  function resolveTargetOwner(effect, context) {
    const t = String(effect?.target || "self");
    if (t === "opponent") return context.opponent;
    if (t === "owner" || t === "self") return context.owner;
    if (t === "eventTarget") return context.event?.targetOwner || context.opponent;
    if (t === "self_player") return context.owner;
    if (t === "source_player") return context.owner;
    if (t === "target_player") return context.event?.targetOwner || context.opponent;
    if (t === "player") return context.owner;
    if (t === "current_target") return context.event?.targetOwner || context.opponent;
    if (t === "self_and_current_target") return context.owner;
    return context.owner;
  }

  function resolveTargetOwners(effect, context) {
    const t = String(effect?.target || "self");
    if (t === "self_and_current_target") {
      const current = context.event?.targetOwner || context.opponent;
      if (!current || current === context.owner) return [context.owner];
      return [context.owner, current];
    }
    return uniqueOwners([resolveTargetOwner(effect, context)]);
  }

  function resolvePlayerTargetOwners(effect, context) {
    const target = String(effect?.target || "self");
    const targetType = String(effect?.targetType || "");
    if (targetType === "card" || isCardTargetToken(target)) {
      return { owners: [], invalidReason: `player-target-required:${target}` };
    }
    return { owners: resolveTargetOwners(effect, context), invalidReason: "" };
  }

  function getTopZoneCard(owner, zoneType) {
    if (typeof window.getZoneCards !== "function") return null;
    const cards = window.getZoneCards(owner, zoneType) || [];
    return cards.length > 0 ? cards[cards.length - 1] : null;
  }
  function getTargetInfoForOwner(owner) {
    if (window.BattleTargetSystem && typeof window.BattleTargetSystem.getTarget === "function") {
      const t = window.BattleTargetSystem.getTarget(owner);
      if (t && typeof t === "object" && typeof t.slotIndex === "number") return { type: "monster", slotIndex: t.slotIndex };
    }
    return { type: "player", owner: owner === "player1" ? "player2" : "player1" };
  }
  function getHandCardsOfOwner(owner) {
    const content = (typeof window.getFieldContent === "function") ? window.getFieldContent() : document.getElementById("fieldContent");
    if (!content) return [];
    const handYMin = Number(window.HAND_ZONE_Y_MIN || 1460);
    return Array.from(content.querySelectorAll(".card:not(.deckObject)"))
      .filter((el) => (el.dataset.owner || "") === owner && !el.dataset.zoneType && Number(el.dataset.y || 0) >= handYMin);
  }
  function resolveCardTargets(effect, context) {
    const cardToken = String(effect.cardTarget || effect.target || "this_card");
    const targetType = String(effect.targetType || "");
    if (targetType === "player" || isPlayerTargetToken(cardToken)) return [];
    const t = cardToken;
    const current = getCurrentTargetInfo(context.owner, context);
    const isMonster = current.type === "monster";
    if ((t.includes("target_") || t.includes("self_and_target")) && isMonster) return [];
    if (t === "this_card") return context.sourceCard ? [context.sourceCard] : [];
    if (t === "source_card") return context.sourceCard ? [context.sourceCard] : [];
    if (t === "target_card") return [getTopZoneCard(current.owner, "attacker")].filter(Boolean);
    if (t === "card") return context.sourceCard ? [context.sourceCard] : [];
    if (t === "attacker_zone_card") return [getTopZoneCard(context.owner, "attacker")].filter(Boolean);
    if (t === "target_attacker_zone_card") return [getTopZoneCard(current.owner, "attacker")].filter(Boolean);
    if (t === "self_and_target_attacker_zone_card") {
      const out = [getTopZoneCard(context.owner, "attacker"), getTopZoneCard(current.owner, "attacker")].filter(Boolean);
      return out;
    }
    if (t === "grave_card") return [getTopZoneCard(context.owner, "grave")].filter(Boolean);
    if (t === "hand_card") {
      const cards = getHandCardsOfOwner(context.owner);
      return cards.length > 0 ? [cards[cards.length - 1]] : [];
    }
    return [];
  }
  function isMonsterCurrentTargetForCardEffect(effect, context) {
    const target = String(effect.target || "self_player");
    if (target !== "current_target" && target !== "self_and_current_target") return false;
    return getCurrentTargetInfo(context.owner, context).type === "monster";
  }
  function moveCardToHand(card, owner) {
    if (!card) return;
    if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(card);
    card.dataset.owner = owner;
    card.dataset.handOrder = String(typeof window.nextHandOrder === "function" ? window.nextHandOrder() : Date.now());
    const handY = Number(window.HAND_ZONE_Y_MIN || 1460) + 40;
    card.dataset.y = String(handY);
    card.style.top = `${handY}px`;
    if (typeof window.organizeHands === "function") window.organizeHands();
  }

  function recoverPpByDraw(owner, amount) {
    const s = getPlayer(owner);
    if (!s) return;
    const max = Number(s.ppMax || 2);
    s.pp = Math.max(0, Math.min(max, Number(s.pp || 0) + Math.max(0, Number(amount || 0))));
    if (typeof window.pushMyStateDebounced === "function" && owner === meRole()) window.pushMyStateDebounced();
  }

  function addCardAttack(cardEl, delta) {
    if (!cardEl) return;
    const prev = Number(cardEl.dataset.attackBonus || 0);
    const next = prev + Number(delta || 0);
    cardEl.dataset.attackBonus = String(next);
    if (typeof window.update === "function") window.update(true);
  }
  function setCardAttack(cardEl, targetAttack) {
    if (!cardEl) return;
    const cardId = cardEl.dataset.id;
    const owner = cardEl.dataset.owner || null;
    const profile = window.CardCombatData?.getResolvedCardData?.(cardId, owner) || null;
    const base = Math.max(0, Number(profile?.attack || 0));
    const target = Math.max(0, Number(targetAttack || 0));
    cardEl.dataset.attackBonus = String(target - base);
    if (typeof window.update === "function") window.update(true);
  }

  function getCurrentTargetInfo(owner, context) {
    if (window.BattleTargetSystem && typeof window.BattleTargetSystem.getTarget === "function") {
      const t = window.BattleTargetSystem.getTarget(owner);
      if (t && typeof t === "object" && typeof t.slotIndex === "number") {
        return { type: "monster", slotIndex: t.slotIndex };
      }
    }
    return {
      type: "player",
      owner: context.event?.targetOwner || context.opponent
    };
  }

  function applyAddAtkByTarget(effect, context, amountSigned, isSetMode, setValue) {
    const atkTarget = String(effect.atkTarget || "");
    const targetInfo = getCurrentTargetInfo(context.owner, context);

    if (atkTarget === "attacker_zone_card") {
      const card = getTopZoneCard(context.owner, "attacker");
      if (isSetMode) setCardAttack(card, setValue);
      else addCardAttack(card, amountSigned);
      return true;
    }
    if (atkTarget === "this_card") {
      if (isSetMode) setCardAttack(context.sourceCard, setValue);
      else addCardAttack(context.sourceCard, amountSigned);
      return true;
    }
    if (atkTarget === "target_attacker_zone_card") {
      if (targetInfo.type === "monster") {
        if (window.MonsterManager && typeof window.MonsterManager.setMonsterAttack === "function" && isSetMode) {
          window.MonsterManager.setMonsterAttack(targetInfo.slotIndex, setValue);
        } else if (window.MonsterManager && typeof window.MonsterManager.addMonsterAttack === "function") {
          window.MonsterManager.addMonsterAttack(targetInfo.slotIndex, amountSigned);
        }
        return true;
      }
      const card = getTopZoneCard(targetInfo.owner, "attacker");
      if (isSetMode) setCardAttack(card, setValue);
      else addCardAttack(card, amountSigned);
      return true;
    }
    if (atkTarget === "target_skill_card") {
      if (targetInfo.type === "monster") {
        if (window.MonsterManager && typeof window.MonsterManager.setMonsterAttack === "function" && isSetMode) {
          window.MonsterManager.setMonsterAttack(targetInfo.slotIndex, setValue);
        } else if (window.MonsterManager && typeof window.MonsterManager.addMonsterAttack === "function") {
          window.MonsterManager.addMonsterAttack(targetInfo.slotIndex, amountSigned);
        }
        return true;
      }
      const card = getTopZoneCard(targetInfo.owner, "skill");
      if (isSetMode) setCardAttack(card, setValue);
      else addCardAttack(card, amountSigned);
      return true;
    }
    if (atkTarget === "self_base_atk") {
      if (isSetMode) {
        const s = getPlayer(context.owner);
        if (s) {
          s.atk = Math.max(0, Number(setValue || 0));
          if (typeof window.pushMyStateDebounced === "function" && context.owner === meRole()) window.pushMyStateDebounced();
        }
      } else if (typeof window.addVal === "function") {
        window.addVal(context.owner, "atk", amountSigned);
      }
      return true;
    }
    if (atkTarget === "target_base_atk") {
      if (targetInfo.type === "monster") {
        if (window.MonsterManager && typeof window.MonsterManager.setMonsterAttack === "function" && isSetMode) {
          window.MonsterManager.setMonsterAttack(targetInfo.slotIndex, setValue);
        } else if (window.MonsterManager && typeof window.MonsterManager.addMonsterAttack === "function") {
          window.MonsterManager.addMonsterAttack(targetInfo.slotIndex, amountSigned);
        }
        return true;
      }
      if (isSetMode) {
        const s = getPlayer(targetInfo.owner);
        if (s) {
          s.atk = Math.max(0, Number(setValue || 0));
          if (typeof window.pushMyStateDebounced === "function" && targetInfo.owner === meRole()) window.pushMyStateDebounced();
        }
      } else if (typeof window.addVal === "function") {
        window.addVal(targetInfo.owner, "atk", amountSigned);
      }
      return true;
    }
    return false;
  }

  function registerGrantedEffect(effect, context, targetOwner) {
    const s = getPlayer(targetOwner);
    if (!s) return;
    if (!Array.isArray(s.grantedEffects)) s.grantedEffects = [];
    const sourceCardId = String(context.sourceProfile?.id || context.sourceCard?.dataset?.id || "unknown");
    const effectName = String(effect.effectName || "付与効果");
    const allowDuplicate = effect.allowDuplicate === true;
    if (!allowDuplicate) {
      const exists = s.grantedEffects.some((g) => (
        String(g.sourceCardId || "") === sourceCardId
        && String(g.effectName || "") === effectName
      ));
      if (exists) return;
    }
    const row = {
      sourceCardId,
      effectName,
      allowDuplicate,
      duration: effect.duration && typeof effect.duration === "object"
        ? {
          mode: String(effect.duration.mode || "turn"),
          turns: Math.max(0, Number(effect.duration.turns || 0)),
          counts: Math.max(0, Number(effect.duration.counts || 0))
        }
        : { mode: "turn", turns: 1, counts: 0 },
      grantedEffects: Array.isArray(effect.grantedEffects) ? effect.grantedEffects : [],
      createdAt: Date.now()
    };
    s.grantedEffects.push(row);
    if (typeof window.pushMyStateDebounced === "function" && targetOwner === meRole()) window.pushMyStateDebounced();
  }

  const grantedTurnTickMemo = {
    player1: "",
    player2: ""
  };

  function normalizeDuration(duration) {
    const src = (duration && typeof duration === "object") ? duration : {};
    return {
      mode: String(src.mode || "turn"),
      turns: Math.max(0, Number(src.turns || 0)),
      counts: Math.max(0, Number(src.counts || 0))
    };
  }

  function shouldRunGrantedEffects(granted, eventName) {
    const mode = String(granted?.duration?.mode || "turn");
    if (mode === "turn") return eventName === "onTurnStart";
    return true;
  }

  function shouldConsumeTurn(granted, context) {
    const mode = String(granted?.duration?.mode || "turn");
    if (mode !== "turn" && mode !== "both") return false;
    if (String(context?.event?.name || "") !== "onTurnStart") return false;
    const owner = context?.owner;
    if (!owner) return false;
    const m = window.state?.matchData || {};
    const key = `${Number(m.round || 0)}:${Number(m.turn || 0)}:${owner}`;
    if (grantedTurnTickMemo[owner] === key) return false;
    grantedTurnTickMemo[owner] = key;
    return true;
  }

  function isGrantedExpired(granted) {
    const mode = String(granted?.duration?.mode || "turn");
    const turns = Number(granted?.duration?.turns || 0);
    const counts = Number(granted?.duration?.counts || 0);
    if (mode === "count") return counts <= 0;
    if (mode === "turn") return turns <= 0;
    if (mode === "both") return turns <= 0 || counts <= 0;
    return false;
  }

  function executeGrantedEffects(context) {
    const owner = context?.owner;
    const s = getPlayer(owner);
    if (!owner || !s || !Array.isArray(s.grantedEffects) || s.grantedEffects.length === 0) {
      return { handled: false, effects: [] };
    }

    const eventName = String(context?.event?.name || "");
    const resultEffects = [];
    const nextGranted = [];
    let changed = false;

    s.grantedEffects.forEach((row) => {
      const granted = {
        ...row,
        duration: normalizeDuration(row?.duration)
      };
      if (isGrantedExpired(granted)) {
        changed = true;
        return;
      }

      let didApply = false;
      if (shouldRunGrantedEffects(granted, eventName)) {
        const effects = Array.isArray(granted.grantedEffects) ? granted.grantedEffects : [];
        effects.forEach((effect, idx) => {
          const localContext = {
            ...context,
            event: {
              ...(context.event || {}),
              __chain: { executedOrders: [] },
              __effectOrder: idx + 1
            }
          };
          const r = EffectExecutor.executeEffect(effect, localContext, {});
          resultEffects.push(r);
          if (r?.applied) didApply = true;
        });
      }

      if ((granted.duration.mode === "count" || granted.duration.mode === "both") && didApply) {
        granted.duration.counts = Math.max(0, Number(granted.duration.counts || 0) - 1);
        changed = true;
      }
      if (shouldConsumeTurn(granted, context)) {
        granted.duration.turns = Math.max(0, Number(granted.duration.turns || 0) - 1);
        changed = true;
      }

      if (!isGrantedExpired(granted)) {
        nextGranted.push(granted);
      } else {
        changed = true;
      }
    });

    if (changed) {
      s.grantedEffects = nextGranted;
      if (typeof window.pushMyStateDebounced === "function" && owner === meRole()) window.pushMyStateDebounced();
    }

    return { handled: true, effects: resultEffects };
  }

  function isCardOnField(cardEl) {
    const zone = String(cardEl?.dataset?.zoneType || "");
    return zone === "attacker" || zone === "skill";
  }

  function compareByOp(left, op, right) {
    if (op === "eq") return left === right;
    if (op === "neq") return left !== right;
    if (op === "gt") return Number(left) > Number(right);
    if (op === "gte") return Number(left) >= Number(right);
    if (op === "lt") return Number(left) < Number(right);
    if (op === "lte") return Number(left) <= Number(right);
    return false;
  }

  function getTrackerValueForCondition(check, context, forceTurnScope) {
    if (!window.GameStatTracker || typeof window.GameStatTracker.resolvePath !== "function") return 0;
    if (!check || typeof check !== "object") return 0;
    const scope = forceTurnScope ? "turn" : "game";
    const stat = String(check.stat || "hp");
    const mode = String(check.mode || "current_gte");
    const ownerType = String(check.owner || "self_player");
    const owner = (ownerType === "target" || ownerType === "target_player")
      ? (context.event?.targetOwner || context.opponent)
      : context.owner;
    const sourceCard = context.sourceCard || null;
    const sourceOwner = sourceCard?.dataset?.owner || context.owner;
    const attackerCard = getTopZoneCard(context.owner, "attacker");
    const skillCard = (context.sourceProfile?.cardKind === "skill" || sourceCard?.dataset?.zoneType === "skill")
      ? sourceCard
      : getTopZoneCard(context.owner, "skill");
    const targetInfo = getCurrentTargetInfo(context.owner, context);
    const targetCard = targetInfo.type === "player" ? getTopZoneCard(targetInfo.owner, "attacker") : null;
    function readCardStat(card, key) {
      if (!card) return 0;
      if (key === "atk") {
        const profile = window.CardCombatData?.getResolvedCardData?.(card.dataset.id, card.dataset.owner || sourceOwner) || null;
        const base = Number(profile?.attack || 0);
        const bonus = Number(card.dataset.attackBonus || 0);
        return Math.max(0, base + bonus);
      }
      if (key === "hp") return Math.max(0, Number(card.dataset.hp || 0));
      if (key === "shield") return Math.max(0, Number(card.dataset.shield || 0));
      return 0;
    }
    if (ownerType === "player" || ownerType === "self_player" || ownerType === "self" || ownerType === "source_player") {
      // 明示的にプレイヤー追跡値を使う
    } else if (ownerType === "card" || ownerType === "source_card") {
      return readCardStat(sourceCard, stat);
    } else if (ownerType === "target_card") {
      return readCardStat(targetCard, stat);
    }
    if (ownerType === "attacker_card") return readCardStat(attackerCard, stat);
    if (ownerType === "used_skill_card") return readCardStat(skillCard, stat);
    if (ownerType === "this_card") return readCardStat(sourceCard, stat);
    if (["hand", "deck", "grave"].includes(stat)) {
      if (typeof window.getZoneCards === "function") {
        if (stat === "grave") return Number((window.getZoneCards(owner, "grave") || []).length);
      }
      if (stat === "hand") {
        const content = (typeof window.getFieldContent === "function") ? window.getFieldContent() : document.getElementById("fieldContent");
        if (!content) return 0;
        const handYMin = Number(window.HAND_ZONE_Y_MIN || 1460);
        return Number(Array.from(content.querySelectorAll(".card:not(.deckObject)"))
          .filter((el) => (el.dataset.owner || "") === owner && !el.dataset.zoneType && Number(el.dataset.y || 0) >= handYMin).length);
      }
      if (stat === "deck") {
        if (typeof window.getDeckCount === "function") return Number(window.getDeckCount(owner) || 0);
        return 0;
      }
    }
    if (stat === "skill_use" || stat === "attacker_use") {
      const key = stat === "skill_use" ? "use.skill" : "use.attacker";
      return Number(window.GameStatTracker.resolvePath(`${scope}.custom.${key}`, owner) || 0);
    }
    const basePath = `${scope}.${stat}.`;
    const read = (field) => Number(window.GameStatTracker.resolvePath(basePath + field, owner) || 0);
    if (mode === "inc_n") return read("incAmount");
    if (mode === "dec_n") return read("decAmount");
    if (mode === "both_n") return read("incAmount") + read("decAmount");
    return read("lastAfter");
  }

  function evaluateRuntimeConditionDetailed(cond, context) {
    if (!cond || typeof cond !== "object") return { ok: true, reason: "no-condition" };
    if (Object.prototype.hasOwnProperty.call(cond, "whileOnField") && cond.whileOnField === true) {
      if (!isCardOnField(context.sourceCard)) return { ok: false, reason: "whileOnField=false" };
    }
    const thisTurnOnly = Object.prototype.hasOwnProperty.call(cond, "thisTurn") && cond.thisTurn === true;
    if (cond.directAttackEnabled === true) {
      const expected = cond.directAttackValue === true;
      if (Boolean(context.event?.didDirectAttack) !== expected) return { ok: false, reason: "directAttackValue-mismatch" };
    } else {
      const directAttackMode = String(cond.directAttack || "any");
      if (directAttackMode === "did" && context.event?.didDirectAttack !== true) return { ok: false, reason: "directAttack-required" };
      if (directAttackMode === "not" && context.event?.didDirectAttack !== false) return { ok: false, reason: "directAttack-forbidden" };
    }
    if (cond.byAttackerEffect === true) {
      const isAttacker = (context.sourceProfile?.cardKind === "attacker")
        || (context.sourceCard?.dataset?.zoneType === "attacker");
      if (!isAttacker) return { ok: false, reason: "attacker-effect-required" };
      const t = String(cond.attackerTriggerT || "onAttack");
      if (String(context.event?.name || "") !== t) return { ok: false, reason: "attacker-trigger-mismatch" };
    }
    if (cond.bySkillEffect === true) {
      const isSkill = (context.sourceProfile?.cardKind === "skill")
        || (context.sourceCard?.dataset?.zoneType === "skill");
      if (!isSkill) return { ok: false, reason: "skill-effect-required" };
    }
    if (cond.inSameChain === true) {
      const chain = context.event?.__chain;
      if (!chain || !Array.isArray(chain.executedOrders) || chain.executedOrders.length === 0) return { ok: false, reason: "chain-required" };
    }
    if (Array.isArray(cond.requiredExecutedOrder) && cond.requiredExecutedOrder.length > 0) {
      const chain = context.event?.__chain;
      const done = new Set((chain && Array.isArray(chain.executedOrders)) ? chain.executedOrders : []);
      const mode = String(cond.requiredExecutedOrderMode || "any");
      if (mode === "all") {
        const allMatched = cond.requiredExecutedOrder.every((n) => done.has(Number(n)));
        if (!allMatched) return { ok: false, reason: "requiredExecutedOrder-all-mismatch" };
      } else {
        const anyMatched = cond.requiredExecutedOrder.some((n) => done.has(Number(n)));
        if (!anyMatched) return { ok: false, reason: "requiredExecutedOrder-any-mismatch" };
      }
    }
    if (cond.trackerCheck && typeof cond.trackerCheck === "object") {
      const left = getTrackerValueForCondition(cond.trackerCheck, context, thisTurnOnly);
      const mode = String(cond.trackerCheck.mode || "current_gte");
      const right = Number(cond.trackerCheck.value || 0);
      if (mode === "current_eq" && !compareByOp(left, "eq", right)) return { ok: false, reason: `trackerCheck-fail:${left}!=${right}` };
      if (mode === "current_gte" && !compareByOp(left, "gte", right)) return { ok: false, reason: `trackerCheck-fail:${left}<${right}` };
      if (mode === "current_lte" && !compareByOp(left, "lte", right)) return { ok: false, reason: `trackerCheck-fail:${left}>${right}` };
      if (mode === "inc_n" && !compareByOp(left, "gte", right)) return { ok: false, reason: `trackerCheck-inc-fail:${left}<${right}` };
      if (mode === "dec_n" && !compareByOp(left, "gte", right)) return { ok: false, reason: `trackerCheck-dec-fail:${left}<${right}` };
      if (mode === "both_n" && !compareByOp(left, "gte", right)) return { ok: false, reason: `trackerCheck-both-fail:${left}<${right}` };
    }
    return { ok: true, reason: "passed" };
  }

  function evaluateRuntimeCondition(cond, context) {
    return evaluateRuntimeConditionDetailed(cond, context).ok;
  }

  function evaluateEffectCondition(effect, context) {
    if (effect?.useCondition !== true) return { ok: true, reason: "useCondition=false" };
    return evaluateRuntimeConditionDetailed(effect?.condition, context);
  }

  const EffectExecutor = {
    executeEffect(effect, context, vars) {
      const type = String(effect?.type || "UNKNOWN");
      const amount = Number(VariableResolver.resolveValue(effect.amount ?? 1, context, vars) || 0);
      const condResult = evaluateEffectCondition(effect, context);
      if (!condResult.ok) {
        return { applied: false, type, skippedByCondition: true, skippedReason: condResult.reason };
      }
      const playerTarget = resolvePlayerTargetOwners(effect, context);
      const targetOwners = playerTarget.owners;

      if (type === "DRAW" || type === "ADD_HAND") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        if (isMonsterCurrentTargetForCardEffect(effect, context)) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "monster-target-not-player" };
        targetOwners.forEach((targetOwner) => {
          if (targetOwner === meRole() && typeof window.drawToHand === "function") window.drawToHand(Math.max(0, amount || 1));
        });
        return { applied: true, type };
      }
      if (type === "DRAW_CARD") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        if (isMonsterCurrentTargetForCardEffect(effect, context)) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "monster-target-not-player" };
        targetOwners.forEach((targetOwner) => {
          if (targetOwner === meRole() && typeof window.drawToHand === "function") {
            const n = Math.max(0, amount || 1);
            window.drawToHand(n);
            recoverPpByDraw(targetOwner, n);
          }
        });
        return { applied: true, type };
      }
      if (type === "ADD_HAND_TO_MIN") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        if (isMonsterCurrentTargetForCardEffect(effect, context)) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "monster-target-not-player" };
        targetOwners.forEach((targetOwner) => {
          if (targetOwner !== meRole()) return;
          if (typeof window.drawToHand !== "function") return;
          const current = Number(getHandCardsOfOwner(targetOwner)?.length || 0);
          const need = Math.max(0, Math.max(0, amount || 0) - current);
          if (need > 0) window.drawToHand(need);
        });
        return { applied: true, type };
      }
      if (type === "HEAL") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          if (typeof window.addVal === "function") window.addVal(targetOwner, "hp", Math.max(0, amount));
        });
        return { applied: true, type };
      }
      if (type === "DAMAGE") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          if (typeof window.applyCalculatedDamage === "function") {
            const damageType = String(effect.damageType || "damage");
            const subType = String(effect.subType || "none");
            window.applyCalculatedDamage(targetOwner, damageType, subType, Math.max(0, amount), false, { source: "effect_engine" });
          }
        });
        return { applied: true, type };
      }
      if (type === "RECOVER_PP") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          if (typeof window.addVal === "function") window.addVal(targetOwner, "pp", Math.max(0, amount));
        });
        return { applied: true, type };
      }
      if (type === "SET_PP_MIN") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          const s = getPlayer(targetOwner);
          if (s) {
            const max = Number(s.ppMax || 2);
            s.pp = Math.max(Number(s.pp || 0), Math.min(max, Math.max(0, amount)));
            if (typeof window.pushMyStateDebounced === "function" && targetOwner === meRole()) window.pushMyStateDebounced();
          }
        });
        return { applied: true, type };
      }
      if (type === "ADD_SHIELD") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          if (typeof window.addVal === "function") window.addVal(targetOwner, "shield", Math.max(0, amount));
        });
        return { applied: true, type };
      }
      if (type === "ADD_ATK") {
        const mode = String(effect.atkMode || "increase");
        const sign = mode === "decrease" ? -1 : 1;
        const isSetMode = mode === "set";
        const setValue = Math.max(0, amount);
        const amountSigned = sign * Math.max(0, amount);
        const handledByTargetMode = applyAddAtkByTarget(effect, context, amountSigned, isSetMode, setValue);
        if (!handledByTargetMode) {
          targetOwners.forEach((targetOwner) => {
            if (isSetMode) {
              const s = getPlayer(targetOwner);
              if (s) {
                s.atk = Math.max(0, Number(setValue || 0));
                if (typeof window.pushMyStateDebounced === "function" && targetOwner === meRole()) window.pushMyStateDebounced();
              }
            } else if (typeof window.addVal === "function") {
              window.addVal(targetOwner, "atk", amountSigned);
            }
          });
        }
        return { applied: true, type };
      }
      if (type === "MOVE_SOURCE_TO_GRAVE") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        cards.forEach((card) => {
          const owner = card.dataset.owner || context.owner;
          if (typeof window.placeCardInZone === "function") window.placeCardInZone(card, owner, "grave");
        });
        return { applied: true, type, flowBreak: true };
      }
      if (type === "MOVE_SOURCE_TO_HAND") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        cards.forEach((card) => moveCardToHand(card, card.dataset.owner || context.owner));
        return { applied: true, type, flowBreak: true };
      }
      if (type === "MOVE_SOURCE_TO_DECK") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        cards.forEach((card) => {
          const owner = card.dataset.owner || context.owner;
          if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(card);
          card.dataset.zoneType = "";
          card.dataset.owner = owner;
          card.dataset.y = String(Number(window.HAND_ZONE_Y_MIN || 1460) + 20);
          if (typeof window.organizeHands === "function") window.organizeHands();
        });
        return { applied: true, type, flowBreak: true };
      }
      if (type === "DUPLICATE_SOURCE_TO_HAND") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        cards.forEach((card) => {
          if (typeof window.duplicateCard === "function") {
            const dup = window.duplicateCard(card);
            moveCardToHand(dup, card.dataset.owner || context.owner);
          }
        });
        return { applied: true, type };
      }
      if (type === "REVEAL_CARD") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        if (typeof window.addGameLog === "function") {
          cards.forEach((card) => window.addGameLog(`[REVEAL] ${card.dataset.id || "unknown"}`));
        }
        return { applied: true, type };
      }
      if (type === "FETCH_CARD" || type === "PLAY_SOURCE_TO_FIELD") {
        const cards = resolveCardTargets(effect, context);
        if (cards.length === 0) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: "card-target-not-found" };
        const toZone = String(effect.toZone || (type === "PLAY_SOURCE_TO_FIELD" ? "attacker" : "hand"));
        cards.forEach((card) => {
          const owner = card.dataset.owner || context.owner;
          if (toZone === "hand") moveCardToHand(card, owner);
          else if (typeof window.placeCardInZone === "function") window.placeCardInZone(card, owner, toZone);
        });
        return { applied: true, type };
      }
      if (type === "TRIGGER_ATTACK_EFFECT") {
        if (window.FirstEightCardEffects && typeof window.FirstEightCardEffects.resolveAttackTriggerForAttacker === "function") {
          window.FirstEightCardEffects.resolveAttackTriggerForAttacker(context.owner);
        }
        return { applied: true, type };
      }
      if (type === "GRANT_EFFECT_BUNDLE") {
        if (playerTarget.invalidReason) return { applied: false, type, skippedByInvalidTarget: true, skippedReason: playerTarget.invalidReason };
        targetOwners.forEach((targetOwner) => {
          registerGrantedEffect(effect, context, targetOwner);
        });
        return { applied: true, type };
      }
      return { applied: false, type };
    }
  };

  const TriggerSystem = {
    getMatchedTriggers(dsl, eventName) {
      if (!dsl || dsl.format !== DSL_FORMAT || !Array.isArray(dsl.triggers)) return [];
      return dsl.triggers.filter((t) => String(t?.on || "") === String(eventName || ""));
    }
  };

  function evaluateVariables(variables, context) {
    const out = {};
    if (!variables || typeof variables !== "object") return out;
    Object.entries(variables).forEach(([name, expr]) => {
      out[name] = VariableResolver.resolveValue(expr, context, out);
    });
    return out;
  }

  function shouldBreakBySourceZone(context, originZoneType) {
    if (!context?.sourceCard) return false;
    if (originZoneType !== "attacker" && originZoneType !== "skill") return false;
    const currentZone = context.sourceCard.dataset.zoneType || "";
    return currentZone !== originZoneType;
  }

  function notifyDebug(context, payload) {
    const reporter = context?.debugReporter;
    if (typeof reporter === "function") {
      try {
        reporter(payload);
      } catch (_) {}
    }
  }

  function execute(cardDsl, context) {
    if (!cardDsl || cardDsl.format !== DSL_FORMAT) return { handled: false, effects: [], triggerReports: [] };
    const matched = TriggerSystem.getMatchedTriggers(cardDsl, context?.event?.name);
    if (matched.length === 0) return { handled: true, effects: [], triggerReports: [] };

    const resultEffects = [];
    const triggerReports = [];
    const originZoneType = String(context?.event?.zoneType || context?.sourceCard?.dataset?.zoneType || "");
    for (const trigger of matched) {
      const triggerReport = {
        on: String(trigger?.on || ""),
        triggerConditionPassed: true,
        bundleConditionPassed: true,
        triggerConditionReason: "",
        bundleConditionReason: "",
        effects: []
      };
      const vars = evaluateVariables(trigger.variables, context);
      if (trigger.useCondition === true) {
        const triggerConditionOk = ConditionEvaluator.evaluateCondition(trigger.condition, context, vars);
        triggerReport.triggerConditionPassed = triggerConditionOk;
        if (!triggerConditionOk) {
          triggerReport.triggerConditionReason = "trigger-condition-failed";
          triggerReports.push(triggerReport);
          notifyDebug(context, { type: "trigger", report: triggerReport });
          continue;
        }
      }
      if (trigger.useCondition === true) {
        const bundleCondition = evaluateRuntimeConditionDetailed(trigger.bundleCondition, context);
        triggerReport.bundleConditionPassed = bundleCondition.ok;
        triggerReport.bundleConditionReason = bundleCondition.reason;
        if (!bundleCondition.ok) {
          triggerReports.push(triggerReport);
          notifyDebug(context, { type: "trigger", report: triggerReport });
          continue;
        }
      }
      const chain = { executedOrders: [] };
      const effects = trigger.effects || [];
      for (let idx = 0; idx < effects.length; idx += 1) {
        const effect = effects[idx];
        const order = idx + 1;
        const localContext = {
          ...context,
          event: {
            ...(context.event || {}),
            __chain: chain,
            __effectOrder: order
          }
        };
        let r = null;
        try {
          r = EffectExecutor.executeEffect(effect, localContext, vars);
        } catch (error) {
          r = {
            applied: false,
            type: String(effect?.type || "UNKNOWN"),
            error: {
              message: String(error?.message || error || "unknown-error"),
              stack: String(error?.stack || "")
            }
          };
        }
        if (r && r.applied) chain.executedOrders.push(order);
        resultEffects.push(r);
        triggerReport.effects.push({
          order,
          type: String(effect?.type || "UNKNOWN"),
          applied: r?.applied === true,
          skippedByCondition: r?.skippedByCondition === true,
          skippedByInvalidTarget: r?.skippedByInvalidTarget === true,
          skippedReason: String(r?.skippedReason || ""),
          error: r?.error || null
        });
        notifyDebug(context, {
          type: "effect",
          trigger: String(trigger?.on || ""),
          order,
          result: triggerReport.effects[triggerReport.effects.length - 1]
        });
        if (r?.flowBreak || shouldBreakBySourceZone(localContext, originZoneType)) {
          triggerReports.push(triggerReport);
          notifyDebug(context, { type: "trigger", report: triggerReport });
          return { handled: true, effects: resultEffects, flowBreak: true, triggerReports };
        }
      }
      triggerReports.push(triggerReport);
      notifyDebug(context, { type: "trigger", report: triggerReport });
    }
    return { handled: true, effects: resultEffects, triggerReports };
  }

  function triggerZoneCardEffects(owner, zoneType, eventName, extraEvent) {
    if (typeof window.getZoneCards !== "function" || !window.PlayerActionResolver) return;
    const cards = window.getZoneCards(owner, zoneType) || [];
    cards.forEach((cardEl) => {
      const profile = window.CardCombatData?.getResolvedCardData?.(cardEl.dataset.id);
      if (!profile?.effectDsl) return;
      const context = {
        game: window.state,
        sourceCard: cardEl,
        sourceProfile: profile,
        owner,
        opponent: opponentOf(owner),
        event: { name: eventName, zoneType, ...(extraEvent || {}) }
      };
      execute(profile.effectDsl, context);
    });
  }

  window.EffectEngine = {
    DSL_FORMAT,
    TriggerSystem,
    ConditionEvaluator,
    EffectExecutor,
    VariableResolver,
    execute,
    triggerZoneCardEffects,
    executeGrantedEffects
  };
})();
