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

  windowRef.drawToHand = () => {};
  const ppBeforeDraw = windowRef.state.player1.pp;
  EffectExecutor.executeEffect(
    { type: "DRAW", target: "self_player", targetType: "player", amount: 1 },
    context,
    {}
  );
  assert(windowRef.state.player1.pp === ppBeforeDraw, "DRAW does not implicitly recover PP");
}

function runCanonicalEffectTests(EffectEngine, windowRef) {
  const sourceCard = { dataset: { id: "CANONICAL_TEST", zoneType: "attacker" } };
  const context = {
    game: windowRef.state,
    sourceCard,
    sourceProfile: { id: "CANONICAL_TEST", attack: 2 },
    owner: "player1",
    opponent: "player2",
    event: { name: "onSummon", zoneType: "attacker" }
  };
  sourceCard.dataset.attackBonus = "3";
  const program = {
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{
      trigger: "summon",
      condition: { selfHp: { lte: 5 } },
      action: { type: "heal", amount: 1 },
      duration: "instant",
      limit: "once"
    }]
  };

  windowRef.state.player1.hp = 4;
  assert(
    EffectEngine.VariableResolver.resolveValue({ ref: "thisCard.attack" }, context, {}) === 5,
    "value resolver reads current card attack including temporary bonus"
  );
  const first = EffectEngine.execute(program, context);
  assert(first.effects[0].applied === true, "canonical trigger, condition, and action execute");
  assert(windowRef.state.player1.hp === 5, "canonical HEAL action uses shared action executor");

  const second = EffectEngine.execute(program, context);
  assert(second.effects[0].skippedByLimit === true, "once limit blocks a second activation");
  assert(windowRef.state.player1.hp === 5, "limited action does not execute twice");
  const restoredCard = {
    dataset: {
      id: "CANONICAL_TEST",
      zoneType: "attacker",
      effectLimits: sourceCard.dataset.effectLimits
    }
  };
  const restored = EffectEngine.execute(program, { ...context, sourceCard: restoredCard });
  assert(restored.effects[0].skippedByLimit === true, "once limit survives card state restoration");

  EffectEngine.clearCardEffectLimits(sourceCard, "once");
  assert(!sourceCard.dataset.effectLimits, "reset once limit is removed from serialized card state");
  const afterReset = EffectEngine.execute(program, context);
  assert(afterReset.effects[0].applied === true, "once limit can be reset on deck/grave movement");
  assert(windowRef.state.player1.hp === 6, "reset once limit allows the action again");

  const perTurnCard = { dataset: { id: "PER_TURN_TEST", zoneType: "attacker" } };
  const perTurnContext = { ...context, sourceCard: perTurnCard };
  const perTurnProgram = {
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{ trigger: "summon", action: { type: "heal", amount: 1 }, limit: "oncePerTurn" }]
  };
  windowRef.state.matchData.turn = 1;
  const turnOne = EffectEngine.execute(perTurnProgram, perTurnContext);
  const turnOneAgain = EffectEngine.execute(perTurnProgram, perTurnContext);
  assert(turnOne.effects[0].applied === true, "oncePerTurn fires on first activation");
  assert(turnOneAgain.effects[0].skippedByLimit === true, "oncePerTurn blocks repeated activation in the same turn");
  windowRef.state.matchData.turn = 2;
  const turnTwo = EffectEngine.execute(perTurnProgram, perTurnContext);
  assert(turnTwo.effects[0].applied === true, "oncePerTurn becomes available on the next turn");
}

function runCanonicalZoneTriggerTests(EffectEngine, windowRef) {
  const sourceCard = { dataset: { id: "ZONE_TEST", zoneType: "attacker", owner: "player1" } };
  const profile = {
    id: "ZONE_TEST",
    effects: [
      { trigger: "attack", action: { type: "heal", amount: 2 } },
      { trigger: "cardUse", action: { type: "heal", amount: 1 } },
      { trigger: "leave", action: { type: "heal", amount: 1 } },
      { trigger: "turnStart", action: { type: "heal", amount: 1 } }
    ]
  };
  windowRef.getZoneCards = (owner, zoneType) => owner === "player1" && zoneType === "attacker" ? [sourceCard] : [];
  windowRef.PlayerActionResolver = {};
  windowRef.CardCombatData = { getResolvedCardData: () => profile };
  windowRef.state.player1.hp = 10;

  EffectEngine.triggerZoneCardEffects("player1", "attacker", "onAttack", {});
  assert(windowRef.state.player1.hp === 12, "zone event executes canonical effects");
  EffectEngine.triggerZoneCardEffects("player1", "attacker", "onCardUse", {});
  assert(windowRef.state.player1.hp === 13, "cardUse trigger runs independently from summon");
  EffectEngine.triggerZoneCardEffects("player1", "attacker", "onLeave", {});
  assert(windowRef.state.player1.hp === 14, "leave trigger executes canonical effects");
  EffectEngine.triggerZoneCardEffects("player1", "attacker", "onTurnStart", {});
  assert(windowRef.state.player1.hp === 15, "turnStart trigger executes canonical effects");
}

function runDurationTests(EffectEngine, windowRef) {
  const sourceCard = { dataset: { id: "DURATION_TEST", zoneType: "attacker" } };
  const context = {
    game: windowRef.state,
    sourceCard,
    sourceProfile: { id: "DURATION_TEST" },
    owner: "player1",
    opponent: "player2",
    event: { name: "onSummon", zoneType: "attacker" }
  };
  const program = {
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{
      trigger: "summon",
      action: {
        type: "grantEffect",
        effectName: "until-own-turn-start-test",
        grantedEffects: [{ trigger: "attack", action: { type: "heal", amount: 2 } }]
      },
      duration: "untilOwnTurnStart"
    }]
  };

  windowRef.state.player1.grantedEffects = [];
  const result = EffectEngine.execute(program, context);
  assert(result.effects[0].applied === true, "canonical grantEffect action applies");
  assert(
    windowRef.state.player1.grantedEffects[0].duration.mode === "untilOwnTurnStart",
    "canonical duration is stored on the granted effect"
  );
  assert(
    windowRef.state.player1.grantedEffects[0].duration.owner === "player1",
    "duration defaults to the effect owner's turn"
  );
  assert(EffectEngine.expireGrantedEffectsAtTurnStart("player1") === 1, "duration expires at own turn start");
  assert(windowRef.state.player1.grantedEffects.length === 0, "expired effect is removed before turn-start effects");

  const unsupported = EffectEngine.execute({
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{
      trigger: "attack",
      action: { type: "addAttack", amount: 2 },
      duration: "thisTurn"
    }]
  }, { ...context, event: { name: "onAttack", zoneType: "attacker" } });
  assert(unsupported.effects[0].skippedByUnsupportedDuration === true, "unsupported action duration is reported instead of silently becoming permanent");

  const nextAttackGrant = EffectEngine.execute({
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{
      trigger: "summon",
      action: {
        type: "grantEffect",
        effectName: "next-attack-test",
        grantedEffects: [{ trigger: "attack", action: { type: "heal", amount: 2 } }]
      },
      duration: "nextAttack"
    }]
  }, context);
  assert(nextAttackGrant.effects[0].applied === true, "nextAttack duration grant applies");
  const hpBeforeNormalAttack = windowRef.state.player1.hp;
  EffectEngine.executeGrantedEffects({
    owner: "player1",
    opponent: "player2",
    event: { name: "onAttack", attackType: "normal" }
  });
  assert(windowRef.state.player1.hp === hpBeforeNormalAttack, "nextAttack is not consumed by a non-skill attack");
  assert(windowRef.state.player1.grantedEffects.length === 1, "nextAttack remains available after a non-skill attack");
  EffectEngine.executeGrantedEffects({
    owner: "player1",
    opponent: "player2",
    event: { name: "onAttack", attackType: "skill" }
  });
  assert(windowRef.state.player1.hp === hpBeforeNormalAttack + 2, "nextAttack triggers on a skill attack");
  assert(windowRef.state.player1.grantedEffects.length === 0, "nextAttack is consumed after the skill attack");

  const thisTurnGrant = EffectEngine.execute({
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{
      trigger: "summon",
      action: {
        type: "grantEffect",
        effectName: "this-turn-test",
        grantedEffects: [{ trigger: "turnEnd", action: { type: "heal", amount: 1 } }]
      },
      duration: "thisTurn"
    }]
  }, context);
  assert(thisTurnGrant.effects[0].applied === true, "thisTurn duration grant applies");
  const hpBeforeTurnEnd = windowRef.state.player1.hp;
  EffectEngine.executeGrantedEffects({
    owner: "player1",
    opponent: "player2",
    event: { name: "onTurnEnd" }
  });
  assert(windowRef.state.player1.hp === hpBeforeTurnEnd + 1, "thisTurn remains active through own turn-end effects");
  assert(EffectEngine.expireGrantedEffectsAtTurnEnd("player1") === 1, "thisTurn expires at own turn end");

  const missingDuration = EffectEngine.execute({
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{ trigger: "summon", action: { type: "grantEffect", effectName: "missing-duration-test", grantedEffects: [] } }]
  }, context);
  assert(missingDuration.effects[0].skippedByMissingDuration === true, "grantEffect requires an explicit duration");

  const unsupportedLimit = EffectEngine.execute({
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [{ trigger: "summon", action: { type: "heal", amount: 1 }, limit: { type: "stackLimit", value: 2 } }]
  }, context);
  assert(unsupportedLimit.effects[0].skippedByUnsupportedLimit === true, "unsupported stackLimit is reported explicitly");
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

function runCatalogAmountTests() {
  const ctx = {
    window: {},
    console,
    document: { baseURI: `file://${ROOT}/` }
  };
  ctx.window = ctx.window;
  ctx.window.state = {
    matchData: { turn: 1, round: 1, turnPlayer: "player1", status: "playing" },
    player1: { hp: 20, hpMax: 20, shield: 0, pp: 1, ppMax: 2 },
    player2: { hp: 20, hpMax: 20, shield: 0, pp: 1, ppMax: 2 }
  };
  ctx.window.getMyRole = () => "player1";
  ctx.window.drawn = 0;
  ctx.window.drawToHand = (amount) => { ctx.window.drawn += Number(amount || 0); };
  ctx.window.addVal = (owner, key, delta) => {
    const player = ctx.window.state[owner];
    const max = key === "hp" ? player.hpMax : Infinity;
    player[key] = Math.min(max, Number(player[key] || 0) + Number(delta || 0));
  };
  ctx.window.applyCalculatedDamage = () => {};
  const emitted = [];
  ctx.window.CardEffectRuntimeV2 = {
    emitGameEvent(name, payload) {
      emitted.push({ name, payload });
    }
  };
  ctx.window.EffectEngine = { triggerZoneCardEffects() {} };
  vm.createContext(ctx);
  loadIIFE("js/game/statTracker.js", ctx);
  loadIIFE("js/game/auto/playerActionResolver.js", ctx);

  ctx.window.addVal("player1", "hp", 3);
  assert(ctx.window.state.player1.hp === 20, "heal at max HP does not change current HP");
  assert(
    ctx.window.GameStatTracker.resolvePath("turn.hp.incAmount", "player1") === 3,
    "heal tracker records catalog amount at max HP"
  );
  assert(
    emitted.some((row) => row.name === "OnHeal" && row.payload.amount === 3),
    "heal event records catalog amount at max HP"
  );

  ctx.window.addVal("player1", "pp", -1);
  assert(
    emitted.some((row) => row.name === "OnPPChange" && row.payload.delta === -1),
    "PP loss emits the requested catalog delta"
  );

  ctx.window.drawToHand(2);
  assert(ctx.window.drawn === 2, "draw hook preserves the underlying draw operation");
  assert(
    emitted.some((row) => row.name === "OnDraw" && row.payload.amount === 2),
    "draw event records the requested amount"
  );

  ctx.window.applyCalculatedDamage("player1", "damage", "none", 2, false, {
    sourceOwner: "player2"
  });
  assert(ctx.window.state.player1.hp === 20, "immune damage does not change current HP");
  assert(
    emitted.some((row) => row.name === "OnDamage" && row.payload.amount === 2),
    "damage event records catalog amount when no HP is lost"
  );
}

function main() {
  const ctx = createEffectEngineContext();
  runConditionTests(ctx.window.EffectEngine);
  runActionTests(ctx.window.EffectEngine, ctx.window);
  runCanonicalEffectTests(ctx.window.EffectEngine, ctx.window);
  runCanonicalZoneTriggerTests(ctx.window.EffectEngine, ctx.window);
  runDurationTests(ctx.window.EffectEngine, ctx.window);
  runResolvePriorityTests();
  runCatalogAmountTests();
  console.log("effectEngine.verify.js: all checks passed");
}

main();
