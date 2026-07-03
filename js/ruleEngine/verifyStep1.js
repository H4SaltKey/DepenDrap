/**
 * ステップ1 自動検証（ブラウザ / Node 両対応）
 */
import {
  GameState,
  EffectStack,
  enqueueCardEffects,
  playCardFromHand
} from "./index.js";

const BASIC_SAMPLE = {
  id: "BASIC_SAMPLE",
  name: "基本サンプル",
  type: "MAGIC",
  effects: [
    {
      trigger: "ON_PLAY",
      action: "DRAW_CARD",
      value: 1
    }
  ]
};

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function makeDeck(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `DECK_${i + 1}`,
    name: `デッキカード${i + 1}`
  }));
}

export function runStep1Verification() {
  const results = [];

  // --- 1. GameState 初期化 ---
  const state = new GameState({
    hp: 20,
    pp: 1,
    ppMax: 2,
    hand: [{ id: "BASIC_SAMPLE", name: "基本サンプル", type: "MAGIC", effects: BASIC_SAMPLE.effects }],
    deck: makeDeck(5)
  });
  assert(state.hp === 20, "hp 初期値");
  assert(state.hand.length === 1, "hand 初期枚数");
  assert(Array.isArray(state.activeContinuousEffects), "activeContinuousEffects は配列");
  results.push("GameState: OK");

  // --- 2. EffectStack push / resolveNext ---
  const stack = new EffectStack();
  stack.push({ action: "DRAW_CARD", value: 2 });
  assert(stack.size === 1, "push 後 size");
  const beforeHand = state.hand.length;
  const beforeDeck = state.deck.length;
  const resolved = stack.resolveNext(state);
  assert(resolved.result.applied === true, "DRAW_CARD 適用");
  assert(resolved.result.drawn === 2, "2枚ドロー");
  assert(state.hand.length === beforeHand + 2, "手札増加");
  assert(state.deck.length === beforeDeck - 2, "デッキ減少");
  assert(stack.isEmpty, "解決後スタック空");
  results.push("EffectStack.resolveNext: OK");

  // --- 3. resolveAll ループ（LIFO: 後入れ先出し） ---
  const lifoStack = new EffectStack();
  const lifoState = new GameState({ deck: makeDeck(2) });
  lifoStack.push({ action: "DRAW_CARD", value: 1, label: "first" });
  lifoStack.push({ action: "DRAW_CARD", value: 1, label: "second" });
  const log = lifoStack.resolveAll(lifoState);
  assert(log.length === 2, "resolveAll 2件");
  assert(log[0].effect.label === "second", "LIFO: 2番目に積んだ効果が先に解決");
  assert(log[1].effect.label === "first", "LIFO: 1番目に積んだ効果が後に解決");
  results.push("EffectStack.resolveAll (LIFO): OK");

  // --- 4. DSL → スタック ---
  const stack2 = new EffectStack();
  const fresh = new GameState({
    hand: [{ ...BASIC_SAMPLE }],
    deck: makeDeck(3)
  });
  const enq = enqueueCardEffects(BASIC_SAMPLE, stack2, {
    trigger: "ON_PLAY",
    gameState: fresh
  });
  assert(enq.enqueued === 1, "DSL 1件エンキュー");
  stack2.resolveAll(fresh);
  assert(fresh.hand.length === 2, "ON_PLAY ドロー後手札2");
  results.push("enqueueCardEffects (DSL): OK");

  // --- 5. playCardFromHand 統合 ---
  const stack3 = new EffectStack();
  const game = new GameState({
    hand: [{ ...BASIC_SAMPLE }],
    deck: makeDeck(4)
  });
  const play = playCardFromHand("BASIC_SAMPLE", game, stack3);
  assert(play.played === true, "プレイ成功");
  assert(game.field.length === 1, "場に1枚");
  assert(game.hand.length === 0, "手札から除去");
  assert(stack3.size === 1, "ON_PLAY 効果がスタックへ");
  stack3.resolveAll(game);
  assert(game.hand.length === 1, "ドロー後手札1");
  results.push("playCardFromHand: OK");

  // --- 6. 条件スキップ ---
  const conditionalCard = {
    id: "COND_TEST",
    name: "条件付き",
    effects: [
      {
        trigger: "ON_PLAY",
        condition: { type: "HP_LTE", value: 5 },
        action: "DRAW_CARD",
        value: 1
      }
    ]
  };
  const stack4 = new EffectStack();
  const hpHigh = new GameState({ hp: 20, deck: makeDeck(1) });
  enqueueCardEffects(conditionalCard, stack4, { trigger: "ON_PLAY", gameState: hpHigh });
  assert(stack4.isEmpty, "HP_LTE 5 を満たさずスキップ");
  const hpLow = new GameState({ hp: 3, deck: makeDeck(1) });
  enqueueCardEffects(conditionalCard, stack4, { trigger: "ON_PLAY", gameState: hpLow });
  assert(stack4.size === 1, "HP_LTE 5 を満たしてエンキュー");
  results.push("condition skip: OK");

  return results;
}

if (typeof process !== "undefined" && process.argv?.[1]?.includes("verifyStep1")) {
  const results = runStep1Verification();
  console.log("Step1 verification passed:");
  results.forEach((r) => console.log("  ✓", r));
}
