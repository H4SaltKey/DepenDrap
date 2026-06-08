(function() {
  const DSL_FORMAT = "dependrap.dsl.v1";
  const BLOCK_FORMAT = "dependrap.effectblocks.v1";

  const BLOCK_TO_EFFECT_TYPE = {
    add_atk: "ADD_ATK",
    damage: "DAMAGE",
    hp_reduce: "DAMAGE",
    draw_card: "DRAW_CARD",
    add_hand: "ADD_HAND",
    add_hand_to_n: "ADD_HAND_TO_MIN",
    fetch_card: "FETCH_CARD",
    return_to_hand: "MOVE_SOURCE_TO_HAND",
    send_to_grave: "MOVE_SOURCE_TO_GRAVE",
    return_to_deck: "MOVE_SOURCE_TO_DECK",
    duplicate_to_hand: "DUPLICATE_SOURCE_TO_HAND",
    play_to_field: "PLAY_SOURCE_TO_FIELD",
    reveal_card: "REVEAL_CARD",
    recover_pp: "RECOVER_PP",
    set_pp_min: "SET_PP_MIN",
    recover_pp_to: "SET_PP_MIN",
    heal: "HEAL",
    grant_effect_bundle: "GRANT_EFFECT_BUNDLE"
  };

  function normalizeTarget(target) {
    const t = String(target || "self_player");
    if ([
      "self_player", "current_target", "self_and_current_target",
      "player", "target_player", "source_player",
      "card", "target_card", "source_card",
      "attacker_zone_card", "target_attacker_zone_card", "self_and_target_attacker_zone_card",
      "this_card", "grave_card", "hand_card"
    ].includes(t)) return t;
    if (["self", "opponent", "owner", "eventTarget"].includes(t)) return t;
    return "self_player";
  }

  function normalizeValue(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  function validateProgram(program) {
    if (!program || typeof program !== "object") return { valid: false, reason: "program が不正です" };
    if (program.format && program.format !== BLOCK_FORMAT) return { valid: false, reason: "format が不正です" };
    if (!Array.isArray(program.timings)) return { valid: false, reason: "timings が配列ではありません" };
    return { valid: true };
  }

  function compileBlockEffect(effect) {
    const kind = String(effect?.kind || "");
    const dslType = BLOCK_TO_EFFECT_TYPE[kind];
    if (!dslType) return null;

    const target = normalizeTarget(effect.target);
    const compiled = { type: dslType, target };
    compiled.useCondition = effect.useCondition === true;
    if (effect.useCondition === true && effect.condition && typeof effect.condition === "object") {
      compiled.condition = effect.condition;
    }

    if (kind === "damage") {
      compiled.targetType = "player";
      compiled.amount = Math.max(0, normalizeValue(effect.value, 1));
      compiled.damageType = String(effect.damageType || "damage");
      compiled.subType = String(effect.damageAttr || effect.subType || "none");
      return compiled;
    }

    if (kind === "hp_reduce") {
      compiled.targetType = "player";
      compiled.amount = Math.max(0, normalizeValue(effect.value, 1));
      compiled.damageType = "hp_reduce";
      compiled.subType = "none";
      return compiled;
    }

    if (["add_atk", "draw_card", "add_hand", "add_hand_to_n", "recover_pp", "set_pp_min", "recover_pp_to", "heal", "duplicate_to_hand", "reveal_card"].includes(kind)) {
      compiled.amount = normalizeValue(effect.value, 1);
      if (kind === "add_atk") {
        compiled.atkMode = String(effect.atkMode || "increase");
        compiled.atkTarget = String(effect.atkTarget || "this_card");
      } else if (["draw_card", "add_hand", "add_hand_to_n"].includes(kind)) {
        compiled.target = normalizeTarget(effect.target || "self_player");
        compiled.targetType = "player";
      } else if (["duplicate_to_hand", "reveal_card"].includes(kind)) {
        compiled.cardTarget = normalizeTarget(effect.cardTarget || "this_card");
        compiled.targetType = "card";
      } else if (["recover_pp", "set_pp_min", "recover_pp_to", "heal"].includes(kind)) {
        compiled.targetType = "player";
      }
      return compiled;
    }

    if (kind === "fetch_card") {
      compiled.targetType = "card";
      compiled.amount = Math.max(1, normalizeValue(effect.value, 1));
      compiled.toZone = String(effect.toZone || "hand");
      compiled.cardTarget = normalizeTarget(effect.cardTarget || "this_card");
      return compiled;
    }

    if (kind === "play_to_field") {
      compiled.targetType = "card";
      compiled.toZone = String(effect.toZone || "attacker");
      compiled.cardTarget = normalizeTarget(effect.cardTarget || "this_card");
      return compiled;
    }

    if (["return_to_hand", "send_to_grave", "return_to_deck"].includes(kind)) {
      compiled.targetType = "card";
      compiled.cardTarget = normalizeTarget(effect.cardTarget || "this_card");
      return compiled;
    }

    if (kind === "grant_effect_bundle") {
      compiled.effectName = String(effect.effectName || "付与効果");
      compiled.allowDuplicate = effect.allowDuplicate === true;
      compiled.duration = effect.duration && typeof effect.duration === "object"
        ? effect.duration
        : { mode: "turn", turns: 1, counts: 0 };
      compiled.grantedEffects = Array.isArray(effect.grantedEffects) ? effect.grantedEffects.map((g) => {
        const child = compileBlockEffect(g);
        return child || null;
      }).filter(Boolean) : [];
      return compiled;
    }

    return compiled;
  }

  function compileProgramToDsl(program) {
    const check = validateProgram(program);
    if (!check.valid) return null;

    const triggers = [];
    (program.timings || []).forEach((timingNode) => {
      const on = String(timingNode?.timing || "");
      if (!on) return;
      const effects = (timingNode.effects || [])
        .map(compileBlockEffect)
        .filter(Boolean);
      if (effects.length === 0) return;
      const trigger = { on, effects };
      trigger.useCondition = timingNode.useCondition === true;
      if (timingNode.useCondition === true && timingNode.condition && typeof timingNode.condition === "object") {
        trigger.bundleCondition = timingNode.condition;
      }
      triggers.push(trigger);
    });

    return {
      format: DSL_FORMAT,
      triggers
    };
  }

  function createEmptyProgram() {
    return {
      format: BLOCK_FORMAT,
      timings: []
    };
  }

  window.CardEffectBlockCompiler = {
    DSL_FORMAT,
    BLOCK_FORMAT,
    validateProgram,
    compileProgramToDsl,
    createEmptyProgram
  };
})();
