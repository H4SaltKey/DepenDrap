/**
 * DSL アクションの実行ハンドラ（ステップ1+2）
 * 新しい action 文字列はここに登録して拡張する。
 */
import { registerContinuousEffect } from "./continuousEffects.js";
const ACTION_HANDLERS = {
  DRAW_CARD(effect, gameState) {
    const count = Math.max(0, Number(effect.value ?? 1));
    const drawn = [];
    for (let i = 0; i < count; i += 1) {
      const card = gameState.deck.pop();
      if (!card) break;
      drawn.push(card);
      gameState.hand.push(card);
    }
    return {
      action: "DRAW_CARD",
      requested: count,
      drawn: drawn.length,
      cards: drawn.map((c) => c.id)
    };
  },

  RECOVER_PP(effect, gameState) {
    const amount = Math.max(0, Number(effect.value ?? 1));
    const before = gameState.pp;
    gameState.pp = Math.min(gameState.ppMax, gameState.pp + amount);
    return {
      action: "RECOVER_PP",
      requested: amount,
      recovered: gameState.pp - before,
      pp: gameState.pp
    };
  },

  REGISTER_CONTINUOUS(effect, gameState) {
    const def = effect.continuous ?? effect.value ?? {};
    const registered = registerContinuousEffect(gameState, {
      kind: def.kind || "REPLACEMENT",
      interceptAction: def.interceptAction,
      listenEvent: def.listenEvent,
      response: def.response ?? null,
      responses: def.responses ?? null,
      oncePerChain: def.oncePerChain,
      delegateSourceCardId: def.delegateSourceCardId ?? null,
      delegateSourceCardName: def.delegateSourceCardName ?? null,
      delegateMode: def.delegateMode ?? null,
      delegateEffect: def.delegateEffect ?? null,
      onlyIfOnField: def.onlyIfOnField,
      condition: def.condition ?? null,
      replaceWith: def.replaceWith ?? null,
      cancelOriginal: def.cancelOriginal,
      priority: def.priority ?? 0,
      sourceCardId: effect.sourceCardId ?? def.sourceCardId ?? null,
      sourceCardName: effect.sourceCardName ?? def.sourceCardName ?? null,
      remainingUses: def.remainingUses ?? null
    });
    return {
      action: "REGISTER_CONTINUOUS",
      registered: true,
      effectId: registered.id,
      kind: registered.kind,
      interceptAction: registered.interceptAction ?? null,
      listenEvent: registered.listenEvent ?? null,
      delegateSourceCardId: registered.delegateSourceCardId ?? null,
      activeCount: gameState.activeContinuousEffects.length
    };
  },

  MOVE_TO_GRAVE(effect, gameState) {
    const cardId = effect.cardId ?? effect.value;
    const fromZone = String(effect.fromZone || "field");
    const zone = gameState[fromZone];
    if (!Array.isArray(zone)) {
      return { action: "MOVE_TO_GRAVE", applied: false, error: "invalid-zone" };
    }
    const index = zone.findIndex((c) => c.id === cardId);
    if (index < 0) {
      return { action: "MOVE_TO_GRAVE", applied: false, error: "card-not-found" };
    }
    const [card] = zone.splice(index, 1);
    gameState.grave.push(card);
    return {
      action: "MOVE_TO_GRAVE",
      cardId: card.id,
      fromZone,
      graveSize: gameState.grave.length
    };
  },

  RETURN_TO_DECK(effect, gameState) {
    const cardId = effect.cardId ?? effect.value ?? effect.context?.cardId;
    let card = null;
    const zones = ["grave", "field", "hand"];
    for (const zoneName of zones) {
      const zone = gameState[zoneName];
      const index = zone.findIndex((c) => c.id === cardId);
      if (index >= 0) {
        [card] = zone.splice(index, 1);
        break;
      }
    }
    if (!card) {
      return { action: "RETURN_TO_DECK", applied: false, error: "card-not-found" };
    }
    gameState.deck.unshift(card);
    return {
      action: "RETURN_TO_DECK",
      cardId: card.id,
      deckSize: gameState.deck.length
    };
  }
};

export function executeAction(effect, gameState) {
  const action = String(effect?.action || "");
  const handler = ACTION_HANDLERS[action];
  if (!handler) {
    return {
      action,
      applied: false,
      error: `未登録のアクション: ${action}`
    };
  }
  const result = handler(effect, gameState);
  return { ...result, applied: true };
}

export function registerAction(actionName, handler) {
  ACTION_HANDLERS[String(actionName)] = handler;
}

export function getRegisteredActions() {
  return Object.keys(ACTION_HANDLERS);
}
