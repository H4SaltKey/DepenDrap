(function() {
  const OWNERS = ["player1", "player2"];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaultStatNode() {
    return {
      incCount: 0,
      incAmount: 0,
      decCount: 0,
      decAmount: 0,
      setCount: 0,
      lastBefore: null,
      lastAfter: null,
      lastAt: 0
    };
  }

  function defaultScopeNode() {
    return {
      stats: {},
      effects: {},
      custom: {}
    };
  }

  function now() {
    return Date.now();
  }

  function currentTurnKey() {
    const m = window.state?.matchData || {};
    return `${m.round || 0}-${m.turn || 0}-${m.turnPlayer || "none"}`;
  }

  const tracker = {
    startedAt: now(),
    turnKey: currentTurnKey(),
    turnStartedAt: now(),
    players: {
      player1: { game: defaultScopeNode(), turn: defaultScopeNode() },
      player2: { game: defaultScopeNode(), turn: defaultScopeNode() }
    },
    global: {
      game: defaultScopeNode(),
      turn: defaultScopeNode()
    },
    history: {
      turns: []
    }
  };

  function ensureOwner(owner) {
    return OWNERS.includes(owner) ? owner : "player1";
  }

  function ensureStat(scopeNode, key) {
    const k = String(key || "unknown");
    if (!scopeNode.stats[k]) scopeNode.stats[k] = defaultStatNode();
    return scopeNode.stats[k];
  }

  function effectKeyOf(effectInfo) {
    const owner = String(effectInfo?.owner || "player1");
    const cardId = String(effectInfo?.cardId || "unknown");
    const trigger = String(effectInfo?.trigger || "manual");
    const effectType = String(effectInfo?.effectType || "unknown");
    return `${owner}:${cardId}:${trigger}:${effectType}`;
  }

  function bumpEffect(scopeNode, effectInfo) {
    const key = effectKeyOf(effectInfo);
    if (!scopeNode.effects[key]) {
      scopeNode.effects[key] = {
        count: 0,
        lastAt: 0,
        owner: effectInfo.owner || null,
        cardId: effectInfo.cardId || null,
        trigger: effectInfo.trigger || null,
        effectType: effectInfo.effectType || null
      };
    }
    const row = scopeNode.effects[key];
    row.count += 1;
    row.lastAt = now();
  }

  function recordDelta(owner, statKey, before, after, mode) {
    const o = ensureOwner(owner);
    const key = String(statKey || "unknown");
    const b = Number(before);
    const a = Number(after);
    if (!Number.isFinite(b) || !Number.isFinite(a)) return;

    const ownerGame = ensureStat(tracker.players[o].game, key);
    const ownerTurn = ensureStat(tracker.players[o].turn, key);
    const globalGame = ensureStat(tracker.global.game, key);
    const globalTurn = ensureStat(tracker.global.turn, key);

    const delta = a - b;
    [ownerGame, ownerTurn, globalGame, globalTurn].forEach((node) => {
      node.lastBefore = b;
      node.lastAfter = a;
      node.lastAt = now();
      if (mode === "set") node.setCount += 1;
      if (delta > 0) {
        node.incCount += 1;
        node.incAmount += delta;
      } else if (delta < 0) {
        node.decCount += 1;
        node.decAmount += Math.abs(delta);
      }
    });
  }

  function recordEffectActivation(effectInfo) {
    const owner = ensureOwner(effectInfo?.owner || "player1");
    const full = Object.assign({ owner }, effectInfo || {});
    bumpEffect(tracker.players[owner].game, full);
    bumpEffect(tracker.players[owner].turn, full);
    bumpEffect(tracker.global.game, full);
    bumpEffect(tracker.global.turn, full);
  }

  function bumpCustom(scope, owner, key, amount = 1) {
    const o = ensureOwner(owner);
    const target = scope === "game" ? tracker.players[o].game.custom : tracker.players[o].turn.custom;
    const gTarget = scope === "game" ? tracker.global.game.custom : tracker.global.turn.custom;
    const k = String(key || "custom");
    target[k] = Number(target[k] || 0) + Number(amount || 0);
    gTarget[k] = Number(gTarget[k] || 0) + Number(amount || 0);
  }

  function snapshotTurn() {
    tracker.history.turns.push({
      turnKey: tracker.turnKey,
      startedAt: tracker.turnStartedAt,
      endedAt: now(),
      players: {
        player1: deepClone(tracker.players.player1.turn),
        player2: deepClone(tracker.players.player2.turn)
      },
      global: deepClone(tracker.global.turn)
    });
    if (tracker.history.turns.length > 100) {
      tracker.history.turns = tracker.history.turns.slice(-100);
    }
  }

  function resetTurnStats() {
    OWNERS.forEach((owner) => {
      tracker.players[owner].turn = defaultScopeNode();
    });
    tracker.global.turn = defaultScopeNode();
    tracker.turnKey = currentTurnKey();
    tracker.turnStartedAt = now();
  }

  function resetAll() {
    tracker.startedAt = now();
    tracker.turnKey = currentTurnKey();
    tracker.turnStartedAt = now();
    tracker.players.player1 = { game: defaultScopeNode(), turn: defaultScopeNode() };
    tracker.players.player2 = { game: defaultScopeNode(), turn: defaultScopeNode() };
    tracker.global = { game: defaultScopeNode(), turn: defaultScopeNode() };
    tracker.history.turns = [];
  }

  function getScopeNode(scope, owner) {
    const o = ensureOwner(owner);
    if (scope === "game") return tracker.players[o].game;
    return tracker.players[o].turn;
  }

  function getStat(scope, owner, key) {
    const scopeNode = getScopeNode(scope, owner);
    return deepClone(scopeNode.stats[String(key || "unknown")] || defaultStatNode());
  }

  function getEffects(scope, owner) {
    const scopeNode = getScopeNode(scope, owner);
    return deepClone(scopeNode.effects);
  }

  function resolvePath(path, owner) {
    const o = ensureOwner(owner);
    const p = String(path || "").trim();
    // examples:
    // turn.hp.incCount
    // game.pp.decAmount
    // turn.custom.my_key
    const parts = p.split(".");
    if (parts.length < 3) return null;
    const scope = parts[0] === "game" ? "game" : "turn";
    const key = parts[1];
    const field = parts[2];
    if (key === "custom") {
      const customKey = parts.slice(2).join(".");
      const node = scope === "game" ? tracker.players[o].game.custom : tracker.players[o].turn.custom;
      return Number(node[customKey] || 0);
    }
    const stat = getStat(scope, o, key);
    if (!(field in stat)) return null;
    return stat[field];
  }

  function installPatches() {
    const w = window;

    if (typeof w.addVal === "function" && !w.addVal._statTrackerWrapped) {
      const original = w.addVal;
      const wrapped = function(owner, key, delta) {
        const before = Number(w.state?.[owner]?.[key]);
        const result = original.apply(this, arguments);
        const after = Number(w.state?.[owner]?.[key]);
        if (Number.isFinite(before) && Number.isFinite(after)) {
          recordDelta(owner, key, before, after, "add");
        }
        return result;
      };
      wrapped._statTrackerWrapped = true;
      w.addVal = wrapped;
    }

    if (typeof w.setVal === "function" && !w.setVal._statTrackerWrapped) {
      const original = w.setVal;
      const wrapped = function(owner, key, value) {
        const before = Number(w.state?.[owner]?.[key]);
        const result = original.apply(this, arguments);
        const after = Number(w.state?.[owner]?.[key]);
        if (Number.isFinite(before) && Number.isFinite(after)) {
          recordDelta(owner, key, before, after, "set");
        }
        return result;
      };
      wrapped._statTrackerWrapped = true;
      w.setVal = wrapped;
    }

    if (typeof w.applyCalculatedDamage === "function" && !w.applyCalculatedDamage._statTrackerWrapped) {
      const original = w.applyCalculatedDamage;
      const wrapped = function(targetOwner) {
        const beforeHp = Number(w.state?.[targetOwner]?.hp);
        const beforeShield = Number(w.state?.[targetOwner]?.shield);
        const beforeDef = Number(w.state?.[targetOwner]?.defstack);
        const result = original.apply(this, arguments);
        const afterHp = Number(w.state?.[targetOwner]?.hp);
        const afterShield = Number(w.state?.[targetOwner]?.shield);
        const afterDef = Number(w.state?.[targetOwner]?.defstack);
        if (Number.isFinite(beforeHp) && Number.isFinite(afterHp)) recordDelta(targetOwner, "hp", beforeHp, afterHp, "set");
        if (Number.isFinite(beforeShield) && Number.isFinite(afterShield)) recordDelta(targetOwner, "shield", beforeShield, afterShield, "set");
        if (Number.isFinite(beforeDef) && Number.isFinite(afterDef)) recordDelta(targetOwner, "defstack", beforeDef, afterDef, "set");
        return result;
      };
      wrapped._statTrackerWrapped = true;
      w.applyCalculatedDamage = wrapped;
    }

    if (typeof w.handleTurnEnd === "function" && !w.handleTurnEnd._statTrackerWrapped) {
      const original = w.handleTurnEnd;
      const wrapped = async function() {
        const prevTurn = currentTurnKey();
        const result = await original.apply(this, arguments);
        const nextTurn = currentTurnKey();
        if (prevTurn !== nextTurn) {
          snapshotTurn();
          resetTurnStats();
        }
        return result;
      };
      wrapped._statTrackerWrapped = true;
      w.handleTurnEnd = wrapped;
    }
  }

  function installResetHooks() {
    const w = window;
    if (typeof w.resetAllGameVariables === "function" && !w.resetAllGameVariables._statTrackerWrapped) {
      const original = w.resetAllGameVariables;
      const wrapped = function() {
        const result = original.apply(this, arguments);
        resetAll();
        return result;
      };
      wrapped._statTrackerWrapped = true;
      w.resetAllGameVariables = wrapped;
    }
  }

  function ensureInstalled() {
    installPatches();
    installResetHooks();
  }

  function init() {
    ensureInstalled();
    if (!Array.isArray(window._afterUpdateHooks)) window._afterUpdateHooks = [];
    if (!window._afterUpdateHooks.includes(ensureInstalled)) {
      window._afterUpdateHooks.push(ensureInstalled);
    }
  }

  window.GameStatTracker = {
    tracker,
    init,
    resetAll,
    resetTurnStats,
    snapshotTurn,
    recordDelta,
    recordEffectActivation,
    bumpCustom,
    getStat,
    getEffects,
    resolvePath,
    getAll: () => deepClone(tracker)
  };

  init();
})();
