/**
 * DSL 条件の評価（ステップ1 — 最小セット）
 * condition 省略時は常に true。
 */
const CONDITION_HANDLERS = {
  HP_GTE(state, value) {
    return Number(state.hp) >= Number(value);
  },
  HP_LTE(state, value) {
    return Number(state.hp) <= Number(value);
  },
  PP_GTE(state, value) {
    return Number(state.pp) >= Number(value);
  },
  HAND_SIZE_GTE(state, value) {
    return state.hand.length >= Number(value);
  },
  HAND_SIZE_LTE(state, value) {
    return state.hand.length <= Number(value);
  },
  DECK_NOT_EMPTY(state) {
    return state.deck.length > 0;
  }
};

export function evaluateCondition(condition, gameState) {
  if (condition == null) return true;
  if (typeof condition === "boolean") return condition;

  const type = String(condition.type || condition.op || "");
  const handler = CONDITION_HANDLERS[type];
  if (!handler) {
    console.warn(`[RuleEngine] 未登録の条件: ${type} — スキップ扱い (false)`);
    return false;
  }
  return handler(gameState, condition.value);
}

export function registerCondition(type, handler) {
  CONDITION_HANDLERS[String(type)] = handler;
}
