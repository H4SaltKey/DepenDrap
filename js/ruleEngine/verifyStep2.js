/**
 * ステップ2 自動検証 — 置換（検閲）パイプライン / トウカ効果
 */
import {
  GameState,
  EffectStack,
  ReplacementPipeline,
  registerContinuousEffect,
  playCardFromHand
} from "./index.js";
import { runStep1Verification } from "./verifyStep1.js";

/** トウカ: ドローする代わりに PP を1回復する（検閲） */
export const TOUKA_CARD = {
  id: "TOUKA",
  name: "トウカ",
  type: "UNIT",
  effects: [
    {
      trigger: "ON_PLAY",
      action: "REGISTER_CONTINUOUS",
      continuous: {
        kind: "REPLACEMENT",
        interceptAction: "DRAW_CARD",
        replaceWith: { action: "RECOVER_PP", value: 1 }
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

export function runStep2Verification() {
  const results = [];

  // ステップ1 回帰
  runStep1Verification();
  results.push("Step1 regression: OK");

  // --- 1. ReplacementPipeline 基本（ドロー → PP回復） ---
  const state = new GameState({ pp: 0, ppMax: 2, deck: makeDeck(3) });
  registerContinuousEffect(state, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    replaceWith: { action: "RECOVER_PP", value: 1 },
    sourceCardId: "TOUKA",
    sourceCardName: "トウカ"
  });

  const stack = new EffectStack();
  stack.push({ action: "DRAW_CARD", value: 1 });
  const beforeDeck = state.deck.length;
  const resolved = stack.resolveNext(state);

  assert(resolved.interception.disposition === "REPLACED", "置換が発動");
  assert(resolved.result.action === "RECOVER_PP", "ドローがPP回復に差し替え");
  assert(state.pp === 1, "PPが1回復");
  assert(state.deck.length === beforeDeck, "山札は減らない");
  assert(state.hand.length === 0, "手札は増えない");
  results.push("ReplacementPipeline (DRAW→RECOVER_PP): OK");

  // --- 2. トウカ ON_PLAY で常駐効果登録 ---
  const game = new GameState({
    pp: 0,
    ppMax: 2,
    hand: [{ ...TOUKA_CARD, effects: TOUKA_CARD.effects }],
    deck: makeDeck(5)
  });
  const gameStack = new EffectStack();
  const play = playCardFromHand("TOUKA", game, gameStack);
  assert(play.played, "トウカをプレイ");
  gameStack.resolveAll(game);
  assert(game.activeContinuousEffects.length === 1, "常駐効果が1件登録");
  assert(
    game.activeContinuousEffects[0].interceptAction === "DRAW_CARD",
    "DRAW_CARD を検閲対象に設定"
  );
  results.push("TOUKA ON_PLAY → REGISTER_CONTINUOUS: OK");

  // --- 3. トウカ常駐中のドロー検閲 ---
  gameStack.push({ action: "DRAW_CARD", value: 2 });
  const deckBefore = game.deck.length;
  const censored = gameStack.resolveNext(game);
  assert(censored.interception.disposition === "REPLACED", "トウカがドローを検閲");
  assert(censored.interception.matchedEffect.sourceCardName === "トウカ", "トウカ効果がマッチ");
  assert(game.pp === 1, "PPのみ回復（上限内）");
  assert(game.deck.length === deckBefore, "検閲によりドロー不発");
  results.push("TOUKA censor on DRAW_CARD: OK");

  // --- 4. 墓地送り → 山札戻し 置換 ---
  const graveState = new GameState({
    field: [{ id: "FIELD_CARD", name: "場のカード" }],
    deck: [],
    grave: []
  });
  registerContinuousEffect(graveState, {
    kind: "REPLACEMENT",
    interceptAction: "MOVE_TO_GRAVE",
    replaceWith: { action: "RETURN_TO_DECK" },
    sourceCardName: "退場置換テスト"
  });
  const graveStack = new EffectStack();
  graveStack.push({
    action: "MOVE_TO_GRAVE",
    cardId: "FIELD_CARD",
    fromZone: "field"
  });
  const graveRes = graveStack.resolveNext(graveState);
  assert(graveRes.interception.disposition === "REPLACED", "墓地送りが置換");
  assert(graveState.grave.length === 0, "墓地に行かない");
  assert(graveState.deck.length === 1, "山札に戻る");
  assert(graveState.deck[0].id === "FIELD_CARD", "正しいカードが山札へ");
  assert(graveState.field.length === 0, "場から除去済み");
  results.push("MOVE_TO_GRAVE → RETURN_TO_DECK: OK");

  // --- 5. 条件付き置換（PP不足時のみ検閲） ---
  const condState = new GameState({ pp: 0, ppMax: 2, deck: makeDeck(2) });
  registerContinuousEffect(condState, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    condition: { type: "PP_GTE", value: 1 },
    replaceWith: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "条件付き検閲"
  });
  const condStack = new EffectStack();
  condStack.push({ action: "DRAW_CARD", value: 1 });
  const noMatch = condStack.resolveNext(condState);
  assert(noMatch.interception.disposition === "PROCEED", "PP0では条件不一致→通常ドロー");
  assert(condState.hand.length === 1, "通常ドローが実行");

  condState.pp = 1;
  condStack.push({ action: "DRAW_CARD", value: 1 });
  const matched = condStack.resolveNext(condState);
  assert(matched.interception.disposition === "REPLACED", "PP1以上で検閲発動");
  results.push("conditional replacement: OK");

  // --- 6. キャンセル（無効化） ---
  const cancelState = new GameState({ deck: makeDeck(1) });
  registerContinuousEffect(cancelState, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    replaceWith: [],
    cancelOriginal: true,
    sourceCardName: "完全検閲"
  });
  const cancelStack = new EffectStack();
  cancelStack.push({ action: "DRAW_CARD", value: 1 });
  const cancelled = cancelStack.resolveNext(cancelState);
  assert(cancelled.interception.disposition === "CANCELLED", "ドロー完全キャンセル");
  assert(cancelled.result.cancelled === true, "cancelled フラグ");
  assert(cancelState.hand.length === 0, "手札変化なし");
  results.push("cancel replacement: OK");

  // --- 7. 優先度（高い方が先に適用） ---
  const prioState = new GameState({ pp: 0, ppMax: 2, deck: makeDeck(1) });
  registerContinuousEffect(prioState, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    priority: 1,
    replaceWith: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "低優先度"
  });
  registerContinuousEffect(prioState, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    priority: 10,
    replaceWith: [],
    cancelOriginal: true,
    sourceCardName: "高優先度"
  });
  const prioStack = new EffectStack();
  prioStack.push({ action: "DRAW_CARD", value: 1 });
  const prioRes = prioStack.resolveNext(prioState);
  assert(prioRes.interception.disposition === "CANCELLED", "高優先度が勝つ");
  assert(prioRes.interception.matchedEffect.sourceCardName === "高優先度", "優先度順");
  results.push("priority ordering: OK");

  return results;
}

if (typeof process !== "undefined" && process.argv?.[1]?.includes("verifyStep2")) {
  const results = runStep2Verification();
  console.log("Step2 verification passed:");
  results.forEach((r) => console.log("  ✓", r));
}
