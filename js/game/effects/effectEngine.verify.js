/**
 * EffectEngine 処理単位の自己検証（Node から実行可能）
 *
 * Usage: node js/game/effects/effectEngine.verify.js
 */
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../../..");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function loadIIFE(relativePath, ctx) {
  const filePath = path.join(ROOT, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), ctx);
}

function createEffectEngineContext() {
  const ctx = {
    window: {},
    console,
    document: { baseURI: `file://${ROOT}/` }
  };
  ctx.window = ctx.window;
  ctx.window.state = {
    matchData: { turn: 1, round: 1, turnPlayer: "player1", status: "playing" },
    player1: { hp: 10, pp: 0, shield: 0, atk: 0, ppMax: 2, grantedEffects: [] },
    player2: { hp: 10, pp: 2, shield: 0, atk: 0, ppMax: 2, grantedEffects: [] }
  };
  ctx.window.getMyRole = () => "player1";
  ctx.window.myRole = "player1";
  ctx.window.addVal = (owner, stat, delta) => {
    const s = ctx.window.state[owner];
    if (!s) return;
    s[stat] = Math.max(0, Number(s[stat] || 0) + Number(delta || 0));
  };
  ctx.window.applyCalculatedDamage = (owner, type, _subType, amount) => {
    const s = ctx.window.state[owner];
    if (!s) return;
    const hits = Math.max(0, Number(amount || 0));
    if (type === "hp_reduce") s.hp = Math.max(0, Number(s.hp || 0) - hits);
    else s.hp = Math.max(0, Number(s.hp || 0) - hits);
  };
  vm.createContext(ctx);
  loadIIFE("js/game/effects/effectEngine.js", ctx);
  return ctx;
}

function runConditionTests(EffectEngine) {
  const { ConditionEvaluator, VariableResolver } = EffectEngine;
  const context = {
    owner: "player1",
    opponent: "player2",
    event: { name: "onSummon" }
  };
  const vars = {};

  assert(
    ConditionEvaluator.evaluateCondition({ selfHp: { gte: 5 } }, context, vars) === true,
    "selfHp gte should pass"
  );
  assert(
    ConditionEvaluator.evaluateCondition({ selfHp: { lte: 3 } }, context, vars) === false,
    "selfHp lte should fail"
  );
  assert(
    VariableResolver.resolveValue({ add: [{ ref: "self.hp" }, 2] }, context, vars) === 12,
    "variable add ref self.hp"
  );
  assert(
    ConditionEvaluator.evaluateCondition(
      { and: [{ selfHp: { gte: 5 } }, { left: { ref: "self.pp" }, lte: 1 }] },
      context,
      vars
    ) === true,
    "and condition"
  );
}

function runActionTests(EffectEngine, windowRef) {
  const { EffectExecutor } = EffectEngine;
  windowRef.state.player1.hp = 10;
  windowRef.state.player2.hp = 10;
  const context = {
    owner: "player1",
    opponent: "player2",
    event: { name: "onSummon" }
  };
  const heal = EffectExecutor.executeEffect(
    { type: "HEAL", target: "self_player", targetType: "player", amount: 2 },
    context,
    {}
  );
  assert(heal.applied === true, "HEAL applied");
  assert(windowRef.state.player1.hp === 12, "HEAL increased hp");

  const dmg = EffectExecutor.executeEffect(
    { type: "DAMAGE", target: "current_target", targetType: "player", amount: 3, damageType: "hp_reduce" },
    { ...context, event: { ...context.event, targetOwner: "player2" } },
    {}
  );
  assert(dmg.applied === true, "DAMAGE applied");
  assert(windowRef.state.player2.hp === 7, "DAMAGE reduced opponent hp");
}

function runResolvePriorityTests() {
  const ctx = { window: {}, console, document: { baseURI: `file://${ROOT}/` } };
  ctx.window = ctx.window;
  vm.createContext(ctx);
  loadIIFE("js/dev/cardEffectBlockCompiler.js", ctx);
  loadIIFE("js/game/effects/effectRuntimeV2.js", ctx);
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cards.json"), "utf8"));
  const c001 = cards.find((c) => c.id === "cd001-001");
  const c003 = cards.find((c) => c.id === "cd001-003");
  const r1 = ctx.window.CardEffectRuntimeV2.resolveCardDsl(c001);
  const r3 = ctx.window.CardEffectRuntimeV2.resolveCardDsl(c003);
  assert(r1.triggers.some((t) => t.on === "onLeave"), "cd001-001 should use effectBlocks (onLeave present)");
  assert(r3.triggers.length === 0, "cd001-003 should not use auto effectDslText");
}

function main() {
  const ctx = createEffectEngineContext();
  runConditionTests(ctx.window.EffectEngine);
  runActionTests(ctx.window.EffectEngine, ctx.window);
  runResolvePriorityTests();
  console.log("effectEngine.verify.js: all checks passed");
}

main();
