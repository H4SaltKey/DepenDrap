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
    return context.owner;
  }

  const EffectExecutor = {
    executeEffect(effect, context, vars) {
      const type = String(effect?.type || "UNKNOWN");
      const targetOwner = resolveTargetOwner(effect, context);
      const amount = Number(VariableResolver.resolveValue(effect.amount ?? 1, context, vars) || 0);

      if (type === "DRAW") {
        if (targetOwner === meRole() && typeof window.drawToHand === "function") window.drawToHand(Math.max(0, amount || 1));
        return { applied: true, type };
      }
      if (type === "HEAL") {
        if (typeof window.addVal === "function") window.addVal(targetOwner, "hp", Math.max(0, amount));
        return { applied: true, type };
      }
      if (type === "DAMAGE") {
        if (typeof window.applyCalculatedDamage === "function") {
          const damageType = String(effect.damageType || "damage");
          const subType = String(effect.subType || "normal");
          window.applyCalculatedDamage(targetOwner, damageType, subType, Math.max(0, amount), false, { source: "effect_engine" });
        }
        return { applied: true, type };
      }
      if (type === "RECOVER_PP") {
        if (typeof window.addVal === "function") window.addVal(targetOwner, "pp", Math.max(0, amount));
        return { applied: true, type };
      }
      if (type === "SET_PP_MIN") {
        const s = getPlayer(targetOwner);
        if (s) {
          const max = Number(s.ppMax || 2);
          s.pp = Math.max(Number(s.pp || 0), Math.min(max, Math.max(0, amount)));
          if (typeof window.pushMyStateDebounced === "function" && targetOwner === meRole()) window.pushMyStateDebounced();
        }
        return { applied: true, type };
      }
      if (type === "ADD_SHIELD") {
        if (typeof window.addVal === "function") window.addVal(targetOwner, "shield", Math.max(0, amount));
        return { applied: true, type };
      }
      if (type === "ADD_ATK") {
        if (typeof window.addVal === "function") window.addVal(targetOwner, "atk", amount);
        return { applied: true, type };
      }
      if (type === "MOVE_SOURCE_TO_GRAVE") {
        if (context.sourceCard && typeof window.placeCardInZone === "function") window.placeCardInZone(context.sourceCard, context.owner, "grave");
        return { applied: true, type };
      }
      if (type === "MOVE_SOURCE_TO_HAND") {
        const card = context.sourceCard;
        if (card) {
          if (typeof window.clearZoneMarker === "function") window.clearZoneMarker(card);
          card.dataset.owner = context.owner;
          card.dataset.handOrder = String(typeof window.nextHandOrder === "function" ? window.nextHandOrder() : Date.now());
          const handY = Number(window.HAND_ZONE_Y_MIN || 1460) + 40;
          card.dataset.y = String(handY);
          card.style.top = `${handY}px`;
          if (typeof window.organizeHands === "function") window.organizeHands();
        }
        return { applied: true, type };
      }
      if (type === "TRIGGER_ATTACK_EFFECT") {
        if (window.FirstEightCardEffects && typeof window.FirstEightCardEffects.resolveAttackTriggerForAttacker === "function") {
          window.FirstEightCardEffects.resolveAttackTriggerForAttacker(context.owner);
        }
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

  function execute(cardDsl, context) {
    if (!cardDsl || cardDsl.format !== DSL_FORMAT) return { handled: false, effects: [] };
    const matched = TriggerSystem.getMatchedTriggers(cardDsl, context?.event?.name);
    if (matched.length === 0) return { handled: true, effects: [] };

    const resultEffects = [];
    matched.forEach((trigger) => {
      const vars = evaluateVariables(trigger.variables, context);
      if (!ConditionEvaluator.evaluateCondition(trigger.condition, context, vars)) return;
      (trigger.effects || []).forEach((effect) => {
        const r = EffectExecutor.executeEffect(effect, context, vars);
        resultEffects.push(r);
      });
    });
    return { handled: true, effects: resultEffects };
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
    triggerZoneCardEffects
  };
})();
