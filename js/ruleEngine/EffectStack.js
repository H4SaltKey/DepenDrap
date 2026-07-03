import { executeAction } from "./actions.js";
import { ReplacementPipeline } from "./ReplacementPipeline.js";
import { ProxyPipeline } from "./ProxyPipeline.js";

/**
 * 効果スタック — LIFO（後入れ先出し）
 * 解決前パイプライン: 置換（検閲）→ 効果の代行 → 実行
 */
export class EffectStack {
  constructor(options = {}) {
    this._items = [];
    this._replacementPipeline = options.replacementPipeline ?? new ReplacementPipeline();
    this._proxyPipeline = options.proxyPipeline ?? new ProxyPipeline();
  }

  get replacementPipeline() {
    return this._replacementPipeline;
  }

  get proxyPipeline() {
    return this._proxyPipeline;
  }

  /** @deprecated replacementPipeline を使用 */
  get pipeline() {
    return this._replacementPipeline;
  }

  get size() {
    return this._items.length;
  }

  get isEmpty() {
    return this._items.length === 0;
  }

  push(effect) {
    this._items.push({ ...effect });
    return this.size;
  }

  peek() {
    return this._items.length > 0 ? { ...this._items[this._items.length - 1] } : null;
  }

  resolveNext(gameState) {
    if (this.isEmpty) return null;
    const effect = this._items.pop();
    const interception = this._replacementPipeline.intercept(effect, gameState);

    if (interception.disposition === "CANCELLED") {
      return {
        effect,
        interception,
        delegation: null,
        result: {
          action: effect.action,
          applied: false,
          cancelled: true,
          cancelledBy: interception.matchedEffect?.sourceCardName ?? null
        }
      };
    }

    const delegationLogs = [];
    const finalIntents = [];

    for (const intent of interception.intents) {
      const delegation = this._proxyPipeline.delegate(intent, gameState);
      delegationLogs.push(delegation);
      finalIntents.push(...delegation.intents);
    }

    const results = [];
    for (const intent of finalIntents) {
      results.push(executeAction(intent, gameState));
    }

    const primaryDelegation = delegationLogs.find(
      (d) => d.disposition === "PROXIED" || d.disposition === "DELEGATED"
    ) ?? delegationLogs[0] ?? null;

    return {
      effect,
      interception,
      delegation: primaryDelegation,
      delegationLogs,
      executedIntents: finalIntents,
      result: results.length === 1 ? results[0] : results,
      results
    };
  }

  resolveAll(gameState) {
    const log = [];
    while (!this.isEmpty) {
      log.push(this.resolveNext(gameState));
    }
    return log;
  }

  clear() {
    this._items = [];
  }
}
