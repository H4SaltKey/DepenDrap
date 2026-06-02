(function() {
  const DSL_FORMAT = "dependrap.dsl.v1";
  const BLOCK_FORMAT = "dependrap.effectblocks.v1";

  const BLOCK_TO_EFFECT_TYPE = {
    add_atk: "ADD_ATK",
    damage: "DAMAGE",
    hp_reduce: "DAMAGE",
    draw_card: "DRAW",
    add_hand: "DRAW",
    add_hand_to_n: "DRAW_TO_HAND_MIN",
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
    if (["self_player", "current_target", "self_and_current_target"].includes(t)) return t;
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
    if (effect.useCondition === true && effect.condition && typeof effect.condition === "object") {
      compiled.condition = effect.condition;
    }

    if (kind === "damage") {
      compiled.amount = Math.max(0, normalizeValue(effect.value, 1));
      compiled.damageType = String(effect.damageType || "damage");
      compiled.subType = String(effect.damageAttr || effect.subType || "none");
      return compiled;
    }

    if (kind === "hp_reduce") {
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
      }
      return compiled;
    }

    if (kind === "fetch_card") {
      compiled.amount = Math.max(1, normalizeValue(effect.value, 1));
      compiled.toZone = String(effect.toZone || "hand");
      return compiled;
    }

    if (kind === "play_to_field") {
      compiled.toZone = String(effect.toZone || "attacker");
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
      triggers.push({ on, effects });
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
