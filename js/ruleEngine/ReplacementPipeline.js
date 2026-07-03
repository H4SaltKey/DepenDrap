import {
  getReplacementCandidates,
  consumeContinuousUse,
  matchesContinuousCondition
} from "./continuousEffects.js";

/**
 * 置換（検閲）パイプライン
 * アクション実行前に activeContinuousEffects を走査し、
 * 基本ルールを上書き・差し替え・無効化する。
 */
export class ReplacementPipeline {
  /**
   * @param {object} intent 実行予定のアクション
   * @param {import('./GameState.js').GameState} gameState
   * @returns {{
   *   disposition: 'PROCEED'|'REPLACED'|'CANCELLED',
   *   originalIntent: object,
   *   intents: object[],
   *   matchedEffect?: object,
   *   log: object[]
   * }}
   */
  intercept(intent, gameState) {
    const originalIntent = { ...intent };
    const log = [];
    const action = String(intent.action || "");

    const candidates = getReplacementCandidates(gameState, action);
    for (const effect of candidates) {
      if (!matchesContinuousCondition(effect, gameState, intent)) {
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          result: "condition-failed"
        });
        continue;
      }

      consumeContinuousUse(gameState, effect.id);

      if (effect.cancelOriginal && effect.replaceWith.length === 0) {
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          interceptAction: action,
          result: "cancelled"
        });
        return {
          disposition: "CANCELLED",
          originalIntent,
          intents: [],
          matchedEffect: effect,
          log
        };
      }

      if (effect.replaceWith.length > 0) {
        const replacements = effect.replaceWith.map((rep) => ({
          ...rep,
          cardId: rep.cardId ?? intent.cardId ?? intent.value ?? null,
          fromZone: rep.fromZone ?? intent.fromZone ?? null,
          context: { ...(intent.context || {}), ...(rep.context || {}) },
          _replacedFrom: action,
          _replacementSource: effect.sourceCardId,
          _replacementEffectId: effect.id
        }));
        log.push({
          effectId: effect.id,
          source: effect.sourceCardName,
          interceptAction: action,
          replaceWith: replacements.map((r) => r.action),
          result: "replaced"
        });
        return {
          disposition: "REPLACED",
          originalIntent,
          intents: replacements,
          matchedEffect: effect,
          log
        };
      }
    }

    return {
      disposition: "PROCEED",
      originalIntent,
      intents: [originalIntent],
      log
    };
  }
}
