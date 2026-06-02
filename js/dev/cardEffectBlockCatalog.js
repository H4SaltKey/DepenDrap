(function() {
  const FORMAT = "dependrap.effectblocks.v1";

  const TIMINGS = [
    { id: "onSummon", label: "登場時" },
    { id: "onAttack", label: "攻撃時" },
    { id: "onDirectAttack", label: "直接攻撃時" },
    { id: "onSkillBeforeAttackEffect", label: "攻撃時効果発動前(スキル)" },
    { id: "onSkillAfterAttackEffect", label: "攻撃時効果発動後(スキル)" },
    { id: "onTurnStart", label: "ターン開始時" },
    { id: "onTurnEnd", label: "ターン終了時" },
    { id: "onLeave", label: "退場時" },
    { id: "continuous", label: "継続" },
    { id: "manual", label: "手動" }
  ];

  const EFFECT_CATEGORIES = [
    { id: "atk_adjust", label: "攻撃力調整系" },
    { id: "damage", label: "ダメージ系" },
    { id: "card", label: "カード系" },
    { id: "pp", label: "PP系" },
    { id: "hp", label: "HP操作系" },
    { id: "status", label: "効果付与系" },
    { id: "card_effect", label: "カードに対する効果系" }
  ];

  const EFFECT_BLOCKS = [
    { id: "add_atk", category: "atk_adjust", label: "攻撃力を増減", params: ["target", "value", "condition"] },
    { id: "damage", category: "damage", label: "ダメージを与える", params: ["target", "value", "damageType", "damageAttr", "condition"] },
    { id: "draw", category: "card", label: "カードを引く", params: ["target", "value", "condition"] },
    { id: "move_source_to_hand", category: "card", label: "このカードを手札へ戻す", params: ["target", "condition"] },
    { id: "move_source_to_grave", category: "card", label: "このカードを墓地へ送る", params: ["target", "condition"] },
    { id: "recover_pp", category: "pp", label: "PPを回復", params: ["target", "value", "condition"] },
    { id: "set_pp_min", category: "pp", label: "PPをNまで回復（不足分のみ）", params: ["target", "value", "condition"] },
    { id: "heal", category: "hp", label: "HPを回復", params: ["target", "value", "condition"] },
    { id: "hp_reduce", category: "hp", label: "HPを減らす", params: ["target", "value", "condition"] },
    { id: "grant_status", category: "status", label: "効果を付与", params: ["target", "statusId", "duration"] },
    { id: "trigger_attack_effect", category: "card_effect", label: "攻撃時効果を強制発動", params: ["target", "condition"] }
  ];

  window.CardEffectBlockCatalog = {
    FORMAT,
    TIMINGS,
    EFFECT_CATEGORIES,
    EFFECT_BLOCKS
  };
})();
