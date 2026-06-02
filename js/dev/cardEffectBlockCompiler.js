(function() {
  const DSL_FORMAT = "dependrap.dsl.v1";
  const BLOCK_FORMAT = "dependrap.effectblocks.v1";

  const BLOCK_TO_EFFECT_TYPE = {
    add_atk: "ADD_ATK",
    damage: "DAMAGE",
    hp_reduce: "DAMAGE",
    draw: "DRAW",
    move_source_to_hand: "MOVE_SOURCE_TO_HAND",
    move_source_to_grave: "MOVE_SOURCE_TO_GRAVE",
    recover_pp: "RECOVER_PP",
    set_pp_min: "SET_PP_MIN",
    heal: "HEAL",
    trigger_attack_effect: "TRIGGER_ATTACK_EFFECT"
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
    if (effect.condition && typeof effect.condition === "object") {
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

    if (["add_atk", "draw", "recover_pp", "set_pp_min", "heal"].includes(kind)) {
      compiled.amount = normalizeValue(effect.value, 1);
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
