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
    { id: "onHeal", label: "回復時" },
    { id: "onShieldGain", label: "シールド獲得時" },
    { id: "onSkillUse", label: "スキル使用時" },
    { id: "continuous", label: "継続" },
    { id: "manual", label: "手動" }
  ];

  const EFFECT_CATEGORIES = [
    { id: "atk_adjust", label: "攻撃力調整系" },
    { id: "damage", label: "ダメージ系" },
    { id: "card", label: "カード系" },
    { id: "pp", label: "PP系" },
    { id: "hp", label: "HP操作系" },
    { id: "effect_grant", label: "効果付与系" }
  ];

  const EFFECT_BLOCKS = [
    { id: "add_atk", category: "atk_adjust", label: "攻撃力を増減", params: ["atkMode", "atkTarget", "value", "condition"] },
    { id: "damage", category: "damage", label: "ダメージを与える", params: ["target", "value", "damageType", "damageAttr", "condition"] },
    { id: "draw_card", category: "card", label: "カードを引く", params: ["target", "value", "condition"] },
    { id: "add_hand", category: "card", label: "手札を増やす", params: ["target", "value", "condition"] },
    { id: "add_hand_to_n", category: "card", label: "N枚まで増やす", params: ["target", "value", "condition"] },
    { id: "fetch_card", category: "card", label: "取り出して〇〇", params: ["target", "value", "toZone", "condition"] },
    { id: "return_to_hand", category: "card", label: "手札へ戻す", params: ["target", "condition"] },
    { id: "send_to_grave", category: "card", label: "墓地へ送る", params: ["target", "condition"] },
    { id: "return_to_deck", category: "card", label: "山札へ戻す", params: ["target", "condition"] },
    { id: "duplicate_to_hand", category: "card", label: "複製して手札へ加える", params: ["target", "value", "condition"] },
    { id: "play_to_field", category: "card", label: "場に出す", params: ["target", "toZone", "condition"] },
    { id: "reveal_card", category: "card", label: "公開する", params: ["target", "value", "condition"] },
    { id: "recover_pp", category: "pp", label: "PPを回復", params: ["target", "value", "condition"] },
    { id: "set_pp_min", category: "pp", label: "PPをNまで回復（不足分のみ）", params: ["target", "value", "condition"] },
    { id: "heal", category: "hp", label: "HPを回復", params: ["target", "value", "condition"] },
    { id: "hp_reduce", category: "hp", label: "HPを減らす", params: ["target", "value", "condition"] },
    { id: "set_hp", category: "hp", label: "HPをNにする", params: ["target", "value", "condition"] },
    { id: "grant_effect_bundle", category: "effect_grant", label: "付与する効果を作成", params: ["target", "effectName", "allowDuplicate", "duration", "grantedEffects", "condition"] }
  ];

  window.CardEffectBlockCatalog = {
    FORMAT,
    TIMINGS,
    EFFECT_CATEGORIES,
    EFFECT_BLOCKS
  };
})();
