import {
  getProxyCandidates,
  consumeContinuousUse,
  matchesContinuousCondition,
  isCardOnField,
  findCardById
} from "./continuousEffects.js";

/**
 * 効果の代行パイプライン
 * アクション実行前に、別のカード（代行者）へ効果の実行主体を委譲する。
 */
export class ProxyPipeline {
  /**
   * @param {object} intent
   * @param {import('./GameState.js').GameState} gameState
   */
  delegate(intent, gameState) {
    const originalIntent = { ...intent };
    const action = String(intent.action || "");
    const log = [];
    const candidates = getProxyCandidates(gameState, action);

    for (const effect of candidates) {
      if (effect.onlyIfOnField !== false && !isCardOnField(gameState, effect.delegateSourceCardId)) {
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          result: "proxy-not-on-field",
          delegateSourceCardId: effect.delegateSourceCardId
        });
        continue;
      }

      if (!matchesContinuousCondition(effect, gameState, intent)) {
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          result: "condition-failed"
        });
        continue;
      }

      consumeContinuousUse(gameState, effect.id);
      const delegateMode = String(effect.delegateMode || "REDIRECT_SOURCE");
      const proxyCard = findCardById(gameState, effect.delegateSourceCardId);
      const proxyName = proxyCard?.name ?? effect.delegateSourceCardName ?? effect.delegateSourceCardId;

      if (delegateMode === "EXECUTE_INSTEAD" && effect.delegateEffect) {
        const delegated = {
          ...effect.delegateEffect,
          sourceCardId: effect.delegateSourceCardId,
          sourceCardName: proxyName,
          _proxiedFrom: intent.sourceCardId ?? null,
          _proxiedFromName: intent.sourceCardName ?? null,
          _originalAction: action,
          _proxyEffectId: effect.id,
          _delegateMode: delegateMode,
          context: {
            ...(intent.context || {}),
            originalIntent
          }
        };
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          interceptAction: action,
          delegateMode,
          delegateAction: delegated.action,
          result: "execute-instead"
        });
        return {
          disposition: "DELEGATED",
          originalIntent,
          intents: [delegated],
          matchedEffect: effect,
          log
        };
      }

      const proxied = {
        ...intent,
        sourceCardId: effect.delegateSourceCardId,
        sourceCardName: proxyName,
        _proxiedFrom: intent.sourceCardId ?? null,
        _proxiedFromName: intent.sourceCardName ?? null,
        _proxyEffectId: effect.id,
        _delegateMode: delegateMode,
        context: {
          ...(intent.context || {}),
          proxiedBy: effect.delegateSourceCardId,
          originalIntent
        }
      };
      log.push({
        effectId: effect.id,
        source: effect.sourceCardName,
        interceptAction: action,
        delegateMode,
        delegateSourceCardId: effect.delegateSourceCardId,
        result: "redirect-source"
      });
      return {
        disposition: "PROXIED",
        originalIntent,
        intents: [proxied],
        matchedEffect: effect,
        log
      };
    }

    return {
      disposition: "PROCEED",
      originalIntent,
      intents: [originalIntent],
      log
    };
  }
}
