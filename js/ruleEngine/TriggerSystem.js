import {
  getTriggerCandidates,
  consumeContinuousUse,
  matchesContinuousCondition
} from "./continuousEffects.js";

/**
 * トリガー（割り込み・連鎖）システム
 * ゲームイベントを受け取り、常駐トリガーに応じて効果スタックへ割り込み積みする。
 */
export class TriggerSystem {
  constructor(options = {}) {
    this.maxEventsPerStep = Number(options.maxEventsPerStep ?? 32);
  }

  createChainContext() {
    return {
      id: `chain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      firedTriggerIds: new Set(),
      eventCount: 0,
      log: []
    };
  }

  /**
   * @param {{ name: string, data?: object }} event
   * @param {import('./GameState.js').GameState} gameState
   * @param {import('./EffectStack.js').EffectStack} effectStack
   * @param {object} chainContext
   */
  emit(event, gameState, effectStack, chainContext = null) {
    const eventName = String(event?.name || "");
    const eventData = event?.data ?? {};
    const ctx = chainContext ?? this.createChainContext();
    const log = [];

    if (ctx.eventCount >= this.maxEventsPerStep) {
      log.push({ event: eventName, result: "max-events-reached" });
      return { enqueued: 0, log, chainContext: ctx };
    }
    ctx.eventCount += 1;

    const candidates = getTriggerCandidates(gameState, eventName);
    let enqueued = 0;

    for (const trigger of candidates) {
      if (trigger.oncePerChain && ctx.firedTriggerIds.has(trigger.id)) {
        log.push({ triggerId: trigger.id, source: trigger.sourceCardName, result: "skipped-once-per-chain" });
        continue;
      }

      if (!matchesContinuousCondition(trigger, gameState, null, eventData)) {
        log.push({ triggerId: trigger.id, source: trigger.sourceCardName, result: "condition-failed" });
        continue;
      }

      const responses = trigger.responses ?? (trigger.response ? [trigger.response] : []);
      if (responses.length === 0) {
        log.push({ triggerId: trigger.id, source: trigger.sourceCardName, result: "no-response" });
        continue;
      }

      consumeContinuousUse(gameState, trigger.id);
      ctx.firedTriggerIds.add(trigger.id);

      // LIFO スタックで定義順に解決されるよう逆順で push
      for (let i = responses.length - 1; i >= 0; i -= 1) {
        const response = responses[i];
        effectStack.push({
          ...response,
          _triggeredBy: eventName,
          _triggerId: trigger.id,
          _triggerSourceCardId: trigger.sourceCardId,
          _triggerSourceCardName: trigger.sourceCardName,
          sourceCardId: trigger.sourceCardId,
          sourceCardName: trigger.sourceCardName,
          context: { ...(response.context || {}), event: eventData }
        });
        enqueued += 1;
      }

      log.push({
        triggerId: trigger.id,
        source: trigger.sourceCardName,
        listenEvent: trigger.listenEvent,
        event: eventName,
        responses: responses.map((r) => r.action),
        result: "enqueued"
      });
    }

    ctx.log.push(...log);
    return { enqueued, log, chainContext: ctx };
  }
}
