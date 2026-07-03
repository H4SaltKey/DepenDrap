import { evaluateCondition } from "./conditions.js";

/**
 * カード DSL（effects 配列）を解釈し、条件を満たす効果をスタックへ積む。
 *
 * @param {object} card カード定義（id, name, effects 等）
 * @param {import('./EffectStack.js').EffectStack} effectStack
 * @param {object} options
 * @param {string} [options.trigger='ON_PLAY'] 発火させるトリガー名
 * @param {import('./GameState.js').GameState} [options.gameState] 条件評価用
 * @returns {{ enqueued: number, skipped: number, effects: object[] }}
 */
export function enqueueCardEffects(card, effectStack, options = {}) {
  const trigger = String(options.trigger ?? "ON_PLAY");
  const gameState = options.gameState ?? null;
  const effects = Array.isArray(card?.effects) ? card.effects : [];

  let enqueued = 0;
  let skipped = 0;
  const pushed = [];

  for (const def of effects) {
    if (String(def.trigger) !== trigger) continue;

    if (gameState && !evaluateCondition(def.condition, gameState)) {
      skipped += 1;
      continue;
    }

    const stackEffect = {
      action: def.action,
      value: def.value,
      continuous: def.continuous ?? null,
      cardId: def.cardId ?? null,
      fromZone: def.fromZone ?? null,
      context: def.context ?? null,
      sourceCardId: card.id,
      sourceCardName: card.name,
      trigger: def.trigger,
      condition: def.condition ?? null
    };

    effectStack.push(stackEffect);
    pushed.push(stackEffect);
    enqueued += 1;
  }

  return { enqueued, skipped, effects: pushed };
}

/**
 * 手札から場へカードを出し、ON_PLAY 効果をスタックへ積む。
 * @returns {{ played: boolean, reason?: string, enqueue?: object }}
 */
export function playCardFromHand(cardId, gameState, effectStack) {
  const index = gameState.hand.findIndex((c) => c.id === cardId);
  if (index < 0) {
    return { played: false, reason: "hand-not-found" };
  }

  const [card] = gameState.hand.splice(index, 1);
  gameState.field.push(card);

  const enqueue = enqueueCardEffects(card, effectStack, {
    trigger: "ON_PLAY",
    gameState
  });

  return { played: true, card, enqueue };
}
