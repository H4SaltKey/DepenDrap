import { GameState } from "./GameState.js";
import { EffectStack } from "./EffectStack.js";
import { ReplacementPipeline } from "./ReplacementPipeline.js";
import { TriggerSystem } from "./TriggerSystem.js";
import { eventsFromResolution } from "./eventMap.js";
import { enqueueCardEffects, playCardFromHand } from "./cardInterpreter.js";

/**
 * ルールエンジン統合ファサード
 * スタック解決・置換パイプライン・トリガー連鎖を一括で扱う。
 */
export class RuleEngine {
  constructor(initial = {}, options = {}) {
    this.gameState = new GameState(initial);
    this.effectStack = new EffectStack({
      replacementPipeline: options.replacementPipeline ?? new ReplacementPipeline()
    });
    this.triggerSystem = options.triggerSystem ?? new TriggerSystem(options.triggerOptions);
    this._chainContext = null;
    this._maxResolveSteps = Number(options.maxResolveSteps ?? 64);
  }

  push(effect) {
    this.effectStack.push(effect);
    return this;
  }

  /**
   * 効果を1件解決し、発生イベントからトリガー割り込みを行う。
   */
  resolveNext() {
    const row = this.effectStack.resolveNext(this.gameState);
    if (!row) return null;

    this._emitTriggersFromResolution(row);
    return row;
  }

  /**
   * スタックが空になるまで解決（連鎖・割り込みを含む）。
   */
  resolveAll(maxSteps = this._maxResolveSteps) {
    this._chainContext = this.triggerSystem.createChainContext();
    const log = [];
    try {
      let steps = 0;
      while (!this.effectStack.isEmpty && steps < maxSteps) {
        log.push(this.resolveNext());
        steps += 1;
      }
    } finally {
      this._chainContext = null;
    }
    return log;
  }

  /**
   * 外部から任意イベントを発火（ターン開始など将来拡張用）。
   */
  emitEvent(eventName, data = {}) {
    if (!this._chainContext) {
      this._chainContext = this.triggerSystem.createChainContext();
    }
    return this.triggerSystem.emit(
      { name: eventName, data },
      this.gameState,
      this.effectStack,
      this._chainContext
    );
  }

  playCardFromHand(cardId) {
    return playCardFromHand(cardId, this.gameState, this.effectStack);
  }

  enqueueCardEffects(card, options = {}) {
    return enqueueCardEffects(card, this.effectStack, {
      ...options,
      gameState: this.gameState
    });
  }

  _emitTriggersFromResolution(row) {
    const events = eventsFromResolution(row);
    if (events.length === 0) return;

    if (!this._chainContext) {
      this._chainContext = this.triggerSystem.createChainContext();
    }

    for (const event of events) {
      this.triggerSystem.emit(
        event,
        this.gameState,
        this.effectStack,
        this._chainContext
      );
    }
  }
}
