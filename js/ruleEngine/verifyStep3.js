/**
 * ステップ3 自動検証 — トリガー（割り込み・連鎖）
 * カード固有実装は持たず、汎用 DSL パターンのみ検証する。
 */
import {
  RuleEngine,
  registerContinuousEffect,
  playCardFromHand,
  EffectStack,
  GameState
} from "./index.js";
import { runStep2Verification } from "./verifyStep2.js";

/** 汎用サンプル: ON_DRAW に反応して追加ドロー（連鎖テスト用） */
export const TRIGGER_MIRROR_SAMPLE = {
  id: "TRIGGER_MIRROR",
  name: "トリガー鏡像",
  type: "UNIT",
  effects: [
    {
      trigger: "ON_PLAY",
      action: "REGISTER_CONTINUOUS",
      continuous: {
        kind: "TRIGGER",
        listenEvent: "ON_DRAW",
        oncePerChain: true,
        response: { action: "DRAW_CARD", value: 1 }
      }
    }
  ]
};

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function makeDeck(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `DECK_${i + 1}`,
    name: `山札${i + 1}`
  }));
}

export function runStep3Verification() {
  const results = [];

  runStep2Verification();
  results.push("Step2 regression: OK");

  // --- 1. 連鎖ドロー（ON_DRAW → DRAW_CARD, oncePerChain） ---
  const engine = new RuleEngine({ deck: makeDeck(5), hand: [] });
  registerContinuousEffect(engine.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    oncePerChain: true,
    response: { action: "DRAW_CARD", value: 1 },
    sourceCardName: "連鎖トリガー"
  });
  engine.push({ action: "DRAW_CARD", value: 1 });
  const chainLog = engine.resolveAll();
  assert(chainLog.length === 2, "初回ドロー + 連鎖1件で2ステップ");
  assert(engine.gameState.hand.length === 2, "合計2枚ドロー");
  assert(engine.gameState.deck.length === 3, "山札5→3");
  results.push("trigger chain ON_DRAW→DRAW: OK");

  // --- 2. 割り込み（解決中にスタックへ割込） ---
  const interrupt = new RuleEngine({ pp: 0, ppMax: 2, deck: makeDeck(3) });
  registerContinuousEffect(interrupt.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    oncePerChain: true,
    response: { action: "DRAW_CARD", value: 1 },
    sourceCardName: "割込トリガー"
  });
  interrupt.push({ action: "RECOVER_PP", value: 1 });
  interrupt.push({ action: "DRAW_CARD", value: 1 });
  const interruptLog = interrupt.resolveAll();
  assert(interruptLog.length === 3, "DRAW + 割込DRAW + RECOVER_PP");
  assert(interruptLog[0].effect.action === "DRAW_CARD", "先に積んだ DRAW が先に解決");
  assert(interruptLog[1].effect._triggeredBy === "ON_DRAW", "割込は ON_DRAW 起因");
  assert(interruptLog[2].effect.action === "RECOVER_PP", "割込後に残り効果");
  assert(interrupt.gameState.hand.length === 2, "割込込みで2枚ドロー");
  results.push("interrupt during resolution: OK");

  // --- 3. DSL 登録（REGISTER_CONTINUOUS + kind:TRIGGER） ---
  const dslEngine = new RuleEngine({
    hand: [{ ...TRIGGER_MIRROR_SAMPLE }],
    deck: makeDeck(4)
  });
  dslEngine.playCardFromHand("TRIGGER_MIRROR");
  dslEngine.resolveAll();
  assert(
    dslEngine.gameState.activeContinuousEffects.some((e) => e.kind === "TRIGGER"),
    "DSL からトリガー常駐を登録"
  );
  dslEngine.push({ action: "DRAW_CARD", value: 1 });
  dslEngine.resolveAll();
  assert(dslEngine.gameState.hand.length === 2, "DSL トリガーで連鎖ドロー");
  results.push("DSL REGISTER_CONTINUOUS TRIGGER: OK");

  // --- 4. 条件付きトリガー ---
  const condEngine = new RuleEngine({ pp: 0, ppMax: 2, deck: makeDeck(3) });
  registerContinuousEffect(condEngine.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    condition: { type: "PP_GTE", value: 1 },
    response: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "条件トリガー"
  });
  condEngine.push({ action: "DRAW_CARD", value: 1 });
  condEngine.resolveAll();
  assert(condEngine.gameState.pp === 0, "PP不足でトリガー不発");
  condEngine.gameState.pp = 1;
  condEngine.push({ action: "DRAW_CARD", value: 1 });
  condEngine.resolveAll();
  assert(condEngine.gameState.pp === 2, "PP条件成立で PP 回復トリガー");
  results.push("conditional trigger: OK");

  // --- 5. listenEvent 指定（ON_ACTION:DRAW_CARD） ---
  const specific = new RuleEngine({ deck: makeDeck(2) });
  registerContinuousEffect(specific.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_ACTION:DRAW_CARD",
    oncePerChain: true,
    response: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "限定トリガー"
  });
  specific.gameState.pp = 0;
  specific.push({ action: "DRAW_CARD", value: 1 });
  specific.resolveAll();
  assert(specific.gameState.pp === 1, "ON_ACTION:DRAW_CARD に反応");
  results.push("listenEvent ON_ACTION:DRAW_CARD: OK");

  // --- 6. 優先度 ---
  const prio = new RuleEngine({ deck: makeDeck(2), pp: 0, ppMax: 2 });
  registerContinuousEffect(prio.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    priority: 1,
    oncePerChain: true,
    response: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "低優先"
  });
  registerContinuousEffect(prio.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    priority: 10,
    oncePerChain: true,
    response: { action: "DRAW_CARD", value: 1 },
    sourceCardName: "高優先"
  });
  prio.push({ action: "DRAW_CARD", value: 1 });
  prio.resolveAll();
  assert(prio.gameState.hand.length === 2, "高優先トリガーが追加ドロー");
  results.push("trigger priority: OK");

  // --- 7. oncePerChain による無限連鎖防止 ---
  const loop = new RuleEngine({ deck: makeDeck(10) });
  registerContinuousEffect(loop.gameState, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    oncePerChain: false,
    response: { action: "DRAW_CARD", value: 1 },
    sourceCardName: "無限連鎖"
  });
  loop.push({ action: "DRAW_CARD", value: 1 });
  const loopLog = loop.resolveAll(8);
  assert(loopLog.length === 8, "maxSteps で打ち切り");
  assert(loop.gameState.hand.length === 8, "8ステップで8枚（上限で停止）");
  results.push("chain depth limit: OK");

  // --- 8. RuleEngine なしの EffectStack ではトリガーは発火しない（後方互換） ---
  const legacy = new GameState({ deck: makeDeck(2) });
  const legacyStack = new EffectStack();
  registerContinuousEffect(legacy, {
    kind: "TRIGGER",
    listenEvent: "ON_DRAW",
    response: { action: "DRAW_CARD", value: 1 }
  });
  legacyStack.push({ action: "DRAW_CARD", value: 1 });
  legacyStack.resolveNext(legacy);
  assert(legacy.hand.length === 1, "EffectStack 単体では連鎖しない");
  results.push("EffectStack backward compatible: OK");

  return results;
}

if (typeof process !== "undefined" && process.argv?.[1]?.includes("verifyStep3")) {
  const results = runStep3Verification();
  console.log("Step3 verification passed:");
  results.forEach((r) => console.log("  ✓", r));
}
