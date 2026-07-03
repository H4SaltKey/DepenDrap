/**
 * ステップ4 自動検証 — 効果の代行（汎用 PROXY DSL）
 */
import {
  RuleEngine,
  EffectStack,
  GameState,
  registerContinuousEffect
} from "./index.js";
import { runStep3Verification } from "./verifyStep3.js";

/** 汎用サンプル: ドローを代行者の PP 回復として実行 */
export const PROXY_DELEGATE_SAMPLE = {
  id: "PROXY_HOST",
  name: "代行ホスト",
  type: "UNIT",
  effects: [
    {
      trigger: "ON_PLAY",
      action: "REGISTER_CONTINUOUS",
      continuous: {
        kind: "PROXY",
        interceptAction: "DRAW_CARD",
        delegateSourceCardId: "PROXY_EXECUTOR",
        delegateMode: "EXECUTE_INSTEAD",
        delegateEffect: { action: "RECOVER_PP", value: 1 },
        onlyIfOnField: true
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

export function runStep4Verification() {
  const results = [];

  runStep3Verification();
  results.push("Step3 regression: OK");

  const proxyExecutor = { id: "PROXY_EXECUTOR", name: "代行者" };

  // --- 1. EXECUTE_INSTEAD: ドロー → 代行者が PP 回復を実行 ---
  const engine = new RuleEngine({
    pp: 0,
    ppMax: 2,
    field: [proxyExecutor],
    deck: makeDeck(3)
  });
  registerContinuousEffect(engine.gameState, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "EXECUTE_INSTEAD",
    delegateEffect: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "代行ルール"
  });
  engine.push({
    action: "DRAW_CARD",
    value: 1,
    sourceCardId: "CASTER",
    sourceCardName: "発動者"
  });
  const row = engine.resolveNext();
  assert(row.delegation.disposition === "DELEGATED", "代行が発動");
  assert(row.result.action === "RECOVER_PP", "ドローが PP 回復に代行");
  assert(engine.gameState.pp === 1, "PP が回復");
  assert(engine.gameState.hand.length === 0, "ドローは発生しない");
  assert(row.executedIntents[0].sourceCardId === "PROXY_EXECUTOR", "実行主体が代行者");
  assert(row.executedIntents[0]._proxiedFrom === "CASTER", "元の発動者を記録");
  results.push("EXECUTE_INSTEAD proxy: OK");

  // --- 2. REDIRECT_SOURCE: 同一アクションを代行者名義で実行 ---
  const redirect = new RuleEngine({
    field: [proxyExecutor],
    deck: makeDeck(2),
    hand: []
  });
  registerContinuousEffect(redirect.gameState, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "REDIRECT_SOURCE",
    sourceCardName: "名義代行"
  });
  redirect.push({
    action: "DRAW_CARD",
    value: 1,
    sourceCardId: "CASTER",
    sourceCardName: "発動者"
  });
  const redirRow = redirect.resolveNext();
  assert(redirRow.delegation.disposition === "PROXIED", "名義代行が発動");
  assert(redirect.gameState.hand.length === 1, "ドローは実行される");
  assert(redirRow.executedIntents[0].sourceCardId === "PROXY_EXECUTOR", "名義が代行者へ");
  results.push("REDIRECT_SOURCE proxy: OK");

  // --- 3. 代行者が場にいない場合は代行しない ---
  const noProxy = new GameState({ deck: makeDeck(1), field: [] });
  const noProxyStack = new EffectStack();
  registerContinuousEffect(noProxy, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "EXECUTE_INSTEAD",
    delegateEffect: { action: "RECOVER_PP", value: 1 }
  });
  noProxyStack.push({ action: "DRAW_CARD", value: 1 });
  const noRow = noProxyStack.resolveNext(noProxy);
  assert(noRow.delegation.disposition === "PROCEED", "代行者不在でスキップ");
  assert(noProxy.hand.length === 1, "通常ドロー");
  results.push("proxy skipped when not on field: OK");

  // --- 4. DSL 登録 ---
  const dslEngine = new RuleEngine({
    hand: [{ ...PROXY_DELEGATE_SAMPLE }],
    field: [proxyExecutor],
    pp: 0,
    ppMax: 2,
    deck: makeDeck(2)
  });
  dslEngine.playCardFromHand("PROXY_HOST");
  dslEngine.resolveAll();
  assert(
    dslEngine.gameState.activeContinuousEffects.some((e) => e.kind === "PROXY"),
    "DSL から PROXY 常駐を登録"
  );
  dslEngine.push({ action: "DRAW_CARD", value: 1, sourceCardId: "OTHER" });
  dslEngine.resolveNext();
  assert(dslEngine.gameState.pp === 1, "DSL 代行で PP 回復");
  assert(dslEngine.gameState.hand.length === 0, "DSL 代行でドロー不発");
  results.push("DSL REGISTER_CONTINUOUS PROXY: OK");

  // --- 5. 置換 → 代行 のパイプライン順序 ---
  const pipeline = new RuleEngine({ pp: 0, ppMax: 2, field: [proxyExecutor], deck: makeDeck(2) });
  registerContinuousEffect(pipeline.gameState, {
    kind: "REPLACEMENT",
    interceptAction: "DRAW_CARD",
    replaceWith: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "検閲",
    priority: 1
  });
  registerContinuousEffect(pipeline.gameState, {
    kind: "PROXY",
    interceptAction: "RECOVER_PP",
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "REDIRECT_SOURCE",
    sourceCardName: "代行",
    priority: 1
  });
  pipeline.push({ action: "DRAW_CARD", value: 1, sourceCardId: "CASTER" });
  const pipeRow = pipeline.resolveNext();
  assert(pipeRow.interception.disposition === "REPLACED", "先に置換");
  assert(pipeRow.delegation.disposition === "PROXIED", "置換後のアクションを代行");
  assert(pipeRow.executedIntents[0].sourceCardId === "PROXY_EXECUTOR", "PP回復が代行者名義");
  assert(pipeline.gameState.pp === 1, "PP 回復実行");
  results.push("pipeline order REPLACEMENT→PROXY: OK");

  // --- 6. 代行後のイベントは代行者を source にする ---
  const eventEngine = new RuleEngine({ pp: 0, ppMax: 2, field: [proxyExecutor] });
  registerContinuousEffect(eventEngine.gameState, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "EXECUTE_INSTEAD",
    delegateEffect: { action: "RECOVER_PP", value: 1 }
  });
  eventEngine.push({ action: "DRAW_CARD", value: 1, sourceCardId: "CASTER" });
  const chainLog = eventEngine.resolveAll();
  const ppEventStep = chainLog.find((r) => r.result?.action === "RECOVER_PP");
  assert(ppEventStep != null, "代行で PP 回復が実行");
  assert(ppEventStep.executedIntents[0].sourceCardId === "PROXY_EXECUTOR", "イベント source は代行者");
  results.push("delegated event source: OK");

  // --- 7. 優先度 ---
  const prio = new GameState({ pp: 0, ppMax: 2, field: [proxyExecutor], deck: makeDeck(1) });
  const prioStack = new EffectStack();
  registerContinuousEffect(prio, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    priority: 1,
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "EXECUTE_INSTEAD",
    delegateEffect: { action: "RECOVER_PP", value: 1 },
    sourceCardName: "低優先代行"
  });
  registerContinuousEffect(prio, {
    kind: "PROXY",
    interceptAction: "DRAW_CARD",
    priority: 10,
    delegateSourceCardId: "PROXY_EXECUTOR",
    delegateMode: "REDIRECT_SOURCE",
    sourceCardName: "高優先代行"
  });
  prioStack.push({ action: "DRAW_CARD", value: 1 });
  const prioRow = prioStack.resolveNext(prio);
  assert(prioRow.delegation.disposition === "PROXIED", "高優先の REDIRECT_SOURCE が適用");
  assert(prio.hand.length === 1, "高優先はドローを維持");
  results.push("proxy priority: OK");

  return results;
}

if (typeof process !== "undefined" && process.argv?.[1]?.includes("verifyStep4")) {
  const results = runStep4Verification();
  console.log("Step4 verification passed:");
  results.forEach((r) => console.log("  ✓", r));
}
