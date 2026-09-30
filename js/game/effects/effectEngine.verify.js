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
  ctx.window.damageCalls = [];
  ctx.window.addVal = (owner, stat, delta) => {
    const s = ctx.window.state[owner];
    if (!s) return;
    s[stat] = Math.max(0, Number(s[stat] || 0) + Number(delta || 0));
  };
  ctx.window.applyCalculatedDamage = (owner, type, subType, amount, isEvoDmg, options) => {
    ctx.window.damageCalls.push({ owner, type, subType, amount, isEvoDmg, options });
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
  assert(windowRef.damageCalls.at(-1).type === "hp_reduce", "DAMAGE delegates to shared damage rules");
  assert(windowRef.damageCalls.at(-1).isEvoDmg === false, "card damage remains eligible for evolution path rules");

  const copySource = { dataset: { id: "COPY_SOURCE", owner: "player1" }, style: {} };
  const cardCopy = { dataset: {}, style: {} };
  windowRef.duplicateCard = (card) => card === copySource ? cardCopy : null;
  windowRef.clearZoneMarker = () => {};
  windowRef.organizeHands = () => {};
  const copied = EffectExecutor.executeEffect(
    { type: "DUPLICATE_SOURCE_TO_HAND", targetType: "card", cardTarget: "this_card" },
    { ...context, sourceCard: copySource },
    {}
  );
  assert(copied.applied === true && copied.duplicated === 1, "COPY_CARD delegates to the shared card clone handler");
  assert(cardCopy.dataset.owner === "player1", "copied cards are placed into their owner's hand");

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

  const chainProgram = {
    format: EffectEngine.EFFECTS_FORMAT,
    effects: [
      { trigger: "summon", action: { type: "heal", amount: 1 } },
      {
        trigger: "summon",
        condition: { requiredExecutedOrder: [1] },
        action: { type: "heal", amount: 1 }
      }
    ]
  };
  const chainResult = EffectEngine.execute(chainProgram, context);
  assert(chainResult.effects[1].applied === true, "conditions can observe earlier actions in the same trigger chain");

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
  loadIIFE("js/game/effects/effectRuntimeV2.js", ctx);
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cards.json"), "utf8"));
  const c001 = cards.find((c) => c.id === "cd001-001");
  const c002 = cards.find((c) => c.id === "cd001-002");
  assert(c001.effects.some((effect) => effect.trigger === "leave"), "cd001-001 leave effect is in canonical data");
  assert(c001.effects.some((effect) => effect.trigger === "directAttack"), "cd001-001 direct attack effect is in canonical data");
  assert(c002.effects.every((effect) => effect.trigger === "skillAfterAttack"), "cd001-002 effects use the post-skill trigger");
  assert(c002.effects[0].condition.left.ref === "event.attackerAttribute", "cd001-002 preserves the magic attacker condition");
  const migratedRoundTrip = ctx.window.CardEffectRuntimeV2.compileAstToEffects(
    ctx.window.CardEffectRuntimeV2.parseDslText(ctx.window.CardEffectRuntimeV2.effectsToDslText(c002.effects))
  );
  assert(migratedRoundTrip[0].action.cardTarget === "attacker_zone_card", "migrated card target survives editing round trip");
  assert(migratedRoundTrip[2].action.type === "ADD_HAND", "ADD_HAND remains distinct from draw in editor round trip");
  assert(cards.every((card) => !["effectDsl", "effectDslText", "effectGraph", "effectBlocks"].some((key) => Object.hasOwn(card, key))), "legacy card effect fields are removed from cards.json");

  const runtime = ctx.window.CardEffectRuntimeV2;
  assert(runtime.resolveCardDsl === undefined, "legacy CardEffectRuntimeV2 DSL resolver is removed");
  const ast = runtime.parseDslText([
    "trigger OnPlay",
    "if self.hp <= 5",
    "target self",
    "effect heal 1 limit=once",
    "end",
    "trigger OnAttack",
    "target opponent",
    "effect damage 2 damageType=arcana duration=thisTurn limit=oncePerTurn",
    "end"
  ].join("\n"));
  const effects = runtime.compileAstToEffects(ast);
  assert(effects.length === 2, "DSL compiles to individual effects[] rows");
  assert(effects[0].trigger === "summon", "OnPlay maps to canonical summon trigger");
  assert(effects[0].condition.left.ref === "self.hp", "DSL condition is retained");
  assert(effects[0].action.type === "HEAL" && effects[0].limit === "once", "heal Action and limit compile");
  assert(effects[1].action.type === "DAMAGE", "damage compiles to shared DAMAGE Action");
  assert(effects[1].action.damageType === "arcana", "damage type is retained");
  assert(effects[1].duration === "thisTurn" && effects[1].limit === "oncePerTurn", "duration and limit compile");
  const roundTrip = runtime.compileAstToEffects(runtime.parseDslText(runtime.effectsToDslText(effects)));
  assert(roundTrip.length === 2, "canonical effects can be reopened in the DSL editor");
  assert(roundTrip[1].action.damageType === "arcana", "DSL round trip retains damage type");
  assert(roundTrip[1].duration === "thisTurn" && roundTrip[1].limit === "oncePerTurn", "DSL round trip retains duration and limit");
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

async function runCardDataLegacyStripTests() {
  const ctx = {
    window: {},
    console,
    URL,
    document: { baseURI: `file://${ROOT}/` },
    fetch: async () => ({
      ok: true,
      json: async () => [{
        id: "LEGACY_DATA_TEST",
        effectDsl: { format: "dependrap.dsl.v1", triggers: [{ on: "onSummon", effects: [] }] },
        effectDslText: "trigger OnPlay\neffect heal 1",
        effectGraph: { format: "dependrap.effectgraph.v2", nodes: [], edges: [] },
        effectBlocks: { format: "dependrap.effectblocks.v1", timings: [] },
        useEffectDslText: true,
        effects: [{ trigger: "summon", action: { type: "HEAL", amount: 1 } }]
      }]
    })
  };
  ctx.window = ctx.window;
  ctx.window.CardEffectRuntimeV2 = {
    resolveCardDsl() { throw new Error("legacy resolver must not be called"); }
  };
  vm.createContext(ctx);
  loadIIFE("js/card/cardData.js", ctx);
  await ctx.loadCardData();
  const loaded = ctx.getCardData("LEGACY_DATA_TEST");
  assert(loaded.effects.length === 1, "card loader retains canonical effects[]");
  assert(
    ["effectDsl", "effectDslText", "effectGraph", "effectBlocks", "useEffectDslText"].every((key) => !Object.hasOwn(loaded, key)),
    "card loader strips all legacy effect fields"
  );
}

function runLiveResolverIntegrationTests() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cards.json"), "utf8"));
  const summonCard = cards.find((card) => card.id === "cd001-001");
  const ctx = {
    window: {},
    console,
    document: { baseURI: `file://${ROOT}/` }
  };
  ctx.window = ctx.window;
  ctx.window.state = {
    matchData: { turn: 1, round: 1, turnPlayer: "player1", status: "playing" },
    player1: { hp: 10, pp: 2, ppMax: 2, shield: 0, atk: 0, grantedEffects: [] },
    player2: { hp: 20, pp: 2, ppMax: 2, shield: 0, atk: 0, grantedEffects: [] }
  };
  ctx.window.myRole = "player1";
  ctx.window.getMyRole = () => "player1";
  const magicAttackerData = { id: "test-magic-attacker", name: "Magic Attacker", attribute: "魔法", type: "アタッカー", attack: 1, effects: [] };
  const cardById = new Map(cards.map((card) => [card.id, card]));
  cardById.set(magicAttackerData.id, magicAttackerData);
  ctx.window.getCardData = (id) => cardById.get(id) || null;
  ctx.window.CardCombatData = { getResolvedCardData: (id) => ctx.window.getCardData(id) };
  const cardElement = {
    dataset: { id: summonCard.id, owner: "player1", zoneType: "attacker", instanceId: "live-summon-test" },
    style: {}
  };
  const zones = { attacker: [cardElement], skill: [], grave: [] };
  ctx.window.getZoneCards = (owner, zone) => owner === "player1" ? (zones[zone] || []) : [];
  ctx.window.placeCardInZone = (card, _owner, zone) => {
    Object.keys(zones).forEach((key) => {
      zones[key] = zones[key].filter((item) => item !== card);
    });
    card.dataset.zoneType = zone;
    (zones[zone] || (zones[zone] = [])).push(card);
    return card;
  };
  ctx.window.CardEffectRuntimeV2 = { emitGameEvent() {} };
  ctx.window.GameStatTracker = {
    resolvePath(path) { return path.endsWith("decCount") ? 1 : 0; },
    recordEffectActivation(row) { ctx.window.activations.push(row); },
    bumpCustom() {}
  };
  ctx.window.activations = [];
  ctx.window.addVal = (owner, key, delta) => {
    const player = ctx.window.state[owner];
    const max = key === "pp" ? player.ppMax : Infinity;
    player[key] = Math.min(max, Number(player[key] || 0) + Number(delta || 0));
  };
  ctx.window.applyCalculatedDamage = (owner, _type, _subType, amount) => {
    ctx.window.state[owner].hp = Math.max(0, ctx.window.state[owner].hp - Number(amount || 0));
  };
  ctx.window.drawn = 0;
  ctx.window.drawToHand = (amount) => { ctx.window.drawn += Number(amount || 0); };
  ctx.window.addGameLog = () => {};
  ctx.window.pushMyStateDebounced = () => {};
  ctx.window.saveAllImmediate = () => {};
  ctx.window.update = () => {};
  ctx.window.organizeHands = () => {};
  ctx.window.organizeBattleZones = () => {};
  ctx.window.clearZoneMarker = () => {};

  vm.createContext(ctx);
  loadIIFE("js/game/effects/effectEngine.js", ctx);
  loadIIFE("js/game/auto/firstEightCardEffects.js", ctx);
  loadIIFE("js/game/auto/playerActionResolver.js", ctx);
  ctx.window.PlayerActionResolver.resolveCardOnPlay(cardElement, "attacker");

  assert(ctx.window.state.player1.hp === 9, "real card effects[] executes automatically through PlayerActionResolver");
  assert(ctx.window.activations.some((row) => row.effectType === "DAMAGE"), "automatic resolver reports the migrated damage Action");

  const fieldAttacker = {
    dataset: { id: magicAttackerData.id, owner: "player1", zoneType: "attacker", instanceId: "magic-attacker-test" },
    style: {}
  };
  zones.attacker.push(fieldAttacker);
  const skillCard = {
    dataset: { id: "cd001-002", owner: "player1", zoneType: "skill", instanceId: "live-skill-test" },
    style: {}
  };
  zones.skill.push(skillCard);
  ctx.window.state.player1.hp = 20;
  ctx.window.drawn = 0;
  ctx.window.PlayerActionResolver.resolveCardOnPlay(skillCard, "skill");
  assert(fieldAttacker.dataset.zoneType === "grave", "migrated skill effect moves the field attacker to grave");
  assert(ctx.window.state.player1.hp === 19, "migrated skill effect applies its HP reduction after grave movement");
  assert(ctx.window.drawn === 1, "migrated skill effect draws after damage");

  const wanderer = cards.find((card) => card.id === "cd001-003");
  const wandererElement = {
    dataset: { id: wanderer.id, owner: "player1", zoneType: "attacker", instanceId: "wanderer-test" },
    style: {}
  };
  zones.attacker.push(wandererElement);
  ctx.window.state.player1.hp = 20;
  ctx.window.state.player1.pp = 2;
  ctx.window.state.player1.shield = 0;
  ctx.window.state.player2.hp = 20;
  ctx.window.drawn = 0;
  ctx.window.PlayerActionResolver.resolveCardOnPlay(wandererElement, "attacker");
  assert(ctx.window.drawn === 1 && ctx.window.state.player1.pp === 2, "wanderer summon draw and PP condition execute from effects[]");
  ctx.window.state.player1.hp = 10;
  ctx.window.EffectEngine.triggerZoneCardEffects("player1", "attacker", "onAttack", { attackType: "skill" });
  assert(ctx.window.state.player1.hp === 11 && ctx.window.state.player1.shield === 1, "wanderer attack heal and shield execute from effects[]");
  ctx.window.EffectEngine.triggerZoneCardEffects("player1", "attacker", "onTurnStart", { targetOwner: "player1" });
  assert(ctx.window.state.player2.hp === 17, "wanderer turn-start amount resolves from current shield count");
  assert(wandererElement.dataset.zoneType === "grave", "wanderer moves itself to grave after its turn-start effect");

  const creator = cards.find((card) => card.id === "cd001-005");
  const creatorElement = {
    dataset: { id: creator.id, owner: "player1", zoneType: "attacker", instanceId: "creator-test" },
    style: {}
  };
  zones.attacker.push(creatorElement);
  ctx.window.state.player1.hp = 5;
  ctx.window.state.player2.hp = 20;
  ctx.window.addVal("player1", "hp", 1);
  assert(ctx.window.state.player2.hp === 21, "creator healing trigger heals opponent through OnHeal event");
  ctx.window.EffectEngine.triggerZoneCardEffects("player1", "attacker", "onAttack", {});
  assert(ctx.window.state.player1.hp === 8, "creator onceWhileOnField heal executes once");
  const creatorHpAfterFirstAttack = ctx.window.state.player1.hp;
  ctx.window.EffectEngine.triggerZoneCardEffects("player1", "attacker", "onAttack", {});
  assert(ctx.window.state.player1.hp === creatorHpAfterFirstAttack, "creator onceWhileOnField limit blocks later attack heals");
}

function main() {
  const ctx = createEffectEngineContext();
  runConditionTests(ctx.window.EffectEngine);
  runActionTests(ctx.window.EffectEngine, ctx.window);
  const legacyProgram = ctx.window.EffectEngine.execute({
    format: "dependrap.dsl.v1",
    triggers: [{ on: "onSummon", effects: [{ type: "HEAL", amount: 1 }] }]
  }, { owner: "player1", opponent: "player2", event: { name: "onSummon" } });
  assert(legacyProgram.handled === false, "legacy DSL v1 is rejected by the live EffectEngine");
  runCanonicalEffectTests(ctx.window.EffectEngine, ctx.window);
  runCanonicalZoneTriggerTests(ctx.window.EffectEngine, ctx.window);
  runDurationTests(ctx.window.EffectEngine, ctx.window);
  runResolvePriorityTests();
  runCatalogAmountTests();
  runLiveResolverIntegrationTests();
  runCardDataLegacyStripTests().then(() => {
    console.log("effectEngine.verify.js: all checks passed");
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

main();
