(function() {
  const DSL_TEXT_FORMAT = "dependrap.dsltext.v2";
  const DSL_JSON_FORMAT = "dependrap.dsl.v2";
  const GRAPH_FORMAT = "dependrap.effectgraph.v2";
  const DSL_V1_FORMAT = "dependrap.dsl.v1";

  const EVENT_NAMES = [
    "OnPlay",
    "OnAttack",
    "OnDirectAttack",
    "OnSkillUse",
    "OnBeforeAttackEffect",
    "OnAfterAttackEffect",
    "OnDraw",
    "OnDiscard",
    "OnLeaveField",
    "OnReturnHand",
    "OnDamage",
    "OnHeal",
    "OnShieldGain",
    "OnPenetrateDamage",
    "OnTurnStart",
    "OnTurnEnd",
    "OnEffectAdded",
    "OnEffectRemoved"
  ];

  let eventSeq = 1;
  let nodeSeq = 1;
  let edgeSeq = 1;
  let instanceSeq = 1;

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function toNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeEventName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "OnPlay";
    if (raw.startsWith("On")) return raw;
    const map = {
      onSummon: "OnPlay",
      onAttack: "OnAttack",
      onDirectAttack: "OnDirectAttack",
      onSkillUse: "OnSkillUse",
      onSkillBeforeAttackEffect: "OnBeforeAttackEffect",
      onSkillAfterAttackEffect: "OnAfterAttackEffect",
      onLeave: "OnLeaveField",
      onTurnStart: "OnTurnStart",
      onTurnEnd: "OnTurnEnd",
      onDraw: "OnDraw",
      onDiscard: "OnDiscard",
      onDamage: "OnDamage",
      onHeal: "OnHeal",
      onShieldGain: "OnShieldGain"
    };
    return map[raw] || `On${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
  }

  function createId(prefix, seqRef) {
    if (prefix === "evt") return `evt-${Date.now()}-${eventSeq++}`;
    if (prefix === "node") return `node-${nodeSeq++}`;
    if (prefix === "edge") return `edge-${edgeSeq++}`;
    if (prefix === "inst") return `inst-${instanceSeq++}`;
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  function createEventBus() {
    const byName = new Map();

    function toSubscriberMeta(meta, handler) {
      if (!meta || typeof meta !== "object") {
        return {
          label: String(handler?.name || "anonymous")
        };
      }
      return {
        label: String(meta.label || handler?.name || "anonymous"),
        owner: meta.owner != null ? String(meta.owner) : "",
        sourceCardId: meta.sourceCardId != null ? String(meta.sourceCardId) : "",
        instanceId: meta.instanceId != null ? String(meta.instanceId) : ""
      };
    }

    function subscribe(eventName, handler, meta) {
      const key = normalizeEventName(eventName);
      if (!byName.has(key)) byName.set(key, new Map());
      byName.get(key).set(handler, toSubscriberMeta(meta, handler));
      return function unsubscribe() {
        const map = byName.get(key);
        if (!map) return;
        map.delete(handler);
      };
    }

    function publish(eventName, payload, context) {
      const key = normalizeEventName(eventName);
      const handlers = Array.from((byName.get(key) || new Map()).entries());
      const rows = [];
      handlers.forEach(([fn, meta]) => {
        try {
          const result = fn(payload || {}, context || {});
          rows.push({
            ok: true,
            result: result == null ? null : result,
            subscriber: deepClone(meta || {})
          });
        } catch (error) {
          rows.push({
            ok: false,
            error: String(error?.message || error || "unknown-event-error"),
            subscriber: deepClone(meta || {})
          });
        }
      });
      return {
        eventName: key,
        subscribers: handlers.length,
        rows
      };
    }

    function getSnapshot() {
      const out = [];
      Array.from(byName.keys()).sort().forEach((name) => {
        out.push({ eventName: name, subscribers: (byName.get(name) || new Map()).size });
      });
      return out;
    }

    function getDetails() {
      const out = [];
      Array.from(byName.keys()).sort().forEach((name) => {
        const rows = Array.from((byName.get(name) || new Map()).values()).map((meta) => deepClone(meta));
        out.push({
          eventName: name,
          subscribers: rows
        });
      });
      return out;
    }

    return {
      subscribe,
      publish,
      getSnapshot,
      getDetails
    };
  }

  function createHistoryStore(limit) {
    const maxRows = Math.max(200, Number(limit || 2000));
    const rows = [];
    const counters = {
      game: Object.create(null),
      turn: Object.create(null),
      last: Object.create(null)
    };

    function updateCounter(base, key, delta) {
      const prev = Number(base[key] || 0);
      base[key] = prev + Number(delta || 0);
    }

    function push(entry) {
      const row = {
        id: createId("evt"),
        at: Date.now(),
        turn: Number(entry?.turn || 0),
        owner: String(entry?.owner || "unknown"),
        eventName: normalizeEventName(entry?.eventName || entry?.name),
        sourceCardId: String(entry?.sourceCardId || ""),
        effectId: String(entry?.effectId || ""),
        payload: deepClone(entry?.payload || {}),
        applied: entry?.applied !== false
      };
      rows.push(row);
      if (rows.length > maxRows) rows.splice(0, rows.length - maxRows);

      const byEventKey = `event.${row.eventName}.count`;
      const byOwnerKey = `owner.${row.owner}.event.${row.eventName}.count`;
      const byCardKey = row.sourceCardId ? `card.${row.sourceCardId}.event.${row.eventName}.count` : "";

      updateCounter(counters.game, byEventKey, 1);
      updateCounter(counters.game, byOwnerKey, 1);
      if (byCardKey) updateCounter(counters.game, byCardKey, 1);

      updateCounter(counters.turn, byEventKey, 1);
      updateCounter(counters.turn, byOwnerKey, 1);
      if (byCardKey) updateCounter(counters.turn, byCardKey, 1);

      counters.last["last.event"] = row.eventName;
      counters.last["last.owner"] = row.owner;
      counters.last["last.sourceCardId"] = row.sourceCardId;
      counters.last["last.effectId"] = row.effectId;
      counters.last["last.payload"] = deepClone(row.payload || {});

      return row;
    }

    function resetTurn(turn) {
      counters.turn = Object.create(null);
      counters.last["last.turn"] = Number(turn || 0);
    }

    function get(path, scope) {
      const key = String(path || "");
      const area = scope === "turn" ? counters.turn : scope === "last" ? counters.last : counters.game;
      return area[key] != null ? area[key] : null;
    }

    function query(fn) {
      return rows.filter(fn || (() => true)).map((r) => deepClone(r));
    }

    function snapshot() {
      return {
        total: rows.length,
        latest: rows.length ? deepClone(rows[rows.length - 1]) : null,
        game: deepClone(counters.game),
        turn: deepClone(counters.turn),
        last: deepClone(counters.last)
      };
    }

    return {
      push,
      resetTurn,
      get,
      query,
      snapshot,
      rows
    };
  }

  function createEffectInstanceStore() {
    const instances = new Map();

    function list() {
      return Array.from(instances.values()).map((row) => deepClone(row));
    }

    function add(base) {
      const id = base?.instanceId || createId("inst");
      const row = {
        instanceId: id,
        owner: String(base?.owner || "player1"),
        sourceCardId: String(base?.sourceCardId || ""),
        inheritedFrom: String(base?.inheritedFrom || ""),
        permanent: base?.permanent === true,
        activated: base?.activated === true,
        event: normalizeEventName(base?.event || "OnPlay"),
        condition: String(base?.condition || ""),
        target: String(base?.target || "self"),
        effects: safeArray(base?.effects).map((e) => ({
          action: String(e?.action || "noop"),
          args: safeArray(e?.args).map((x) => String(x))
        })),
        modifiers: safeArray(base?.modifiers).map((m) => ({
          action: String(m?.action || "noop"),
          args: safeArray(m?.args).map((x) => String(x))
        }))
      };
      instances.set(id, row);
      return deepClone(row);
    }

    function remove(instanceId) {
      return instances.delete(String(instanceId || ""));
    }

    function get(instanceId) {
      const row = instances.get(String(instanceId || ""));
      return row ? deepClone(row) : null;
    }

    function append(instanceId, patch) {
      const key = String(instanceId || "");
      const current = instances.get(key);
      if (!current) return null;
      const next = {
        ...current,
        effects: [...current.effects, ...safeArray(patch?.effects || []).map((e) => ({
          action: String(e?.action || "noop"),
          args: safeArray(e?.args).map((x) => String(x))
        }))],
        modifiers: [...current.modifiers, ...safeArray(patch?.modifiers || []).map((m) => ({
          action: String(m?.action || "noop"),
          args: safeArray(m?.args).map((x) => String(x))
        }))]
      };
      instances.set(key, next);
      return deepClone(next);
    }

    function overwrite(instanceId, patch) {
      const key = String(instanceId || "");
      const current = instances.get(key);
      if (!current) return null;
      const next = {
        ...current,
        event: patch?.event ? normalizeEventName(patch.event) : current.event,
        condition: patch?.condition != null ? String(patch.condition) : current.condition,
        target: patch?.target != null ? String(patch.target) : current.target,
        effects: patch?.effects != null ? safeArray(patch.effects).map((e) => ({
          action: String(e?.action || "noop"),
          args: safeArray(e?.args).map((x) => String(x))
        })) : current.effects,
        modifiers: patch?.modifiers != null ? safeArray(patch.modifiers).map((m) => ({
          action: String(m?.action || "noop"),
          args: safeArray(m?.args).map((x) => String(x))
        })) : current.modifiers
      };
      instances.set(key, next);
      return deepClone(next);
    }

    function cloneOf(instanceId, owner) {
      const src = instances.get(String(instanceId || ""));
      if (!src) return null;
      return add({
        ...deepClone(src),
        instanceId: createId("inst"),
        owner: owner || src.owner,
        inheritedFrom: src.instanceId
      });
    }

    function inheritByCard(sourceCardId, targetCardId, owner) {
      const rows = list().filter((row) => row.sourceCardId === String(sourceCardId || ""));
      return rows.map((row) => add({
        ...row,
        instanceId: createId("inst"),
        owner: owner || row.owner,
        sourceCardId: String(targetCardId || row.sourceCardId),
        inheritedFrom: row.instanceId
      }));
    }

    function markActivated(instanceId) {
      const key = String(instanceId || "");
      const current = instances.get(key);
      if (!current) return null;
      const next = { ...current, activated: true };
      instances.set(key, next);
      return deepClone(next);
    }

    function byEvent(eventName) {
      const normalized = normalizeEventName(eventName);
      return list().filter((row) => row.event === normalized);
    }

    return {
      add,
      remove,
      get,
      list,
      append,
      overwrite,
      cloneOf,
      inheritByCard,
      markActivated,
      byEvent
    };
  }

  function parseTokens(text) {
    const line = String(text || "").trim();
    if (!line) return [];
    return line.split(/\s+/).filter(Boolean);
  }

  function parseDslText(dslText) {
    const src = String(dslText || "");
    const lines = src
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    const rules = [];
    let current = null;

    function flush() {
      if (!current) return;
      if (!current.trigger) current.trigger = "OnPlay";
      rules.push(current);
      current = null;
    }

    lines.forEach((line) => {
      const tokens = parseTokens(line);
      const head = String(tokens[0] || "").toLowerCase();
      if (head === "trigger") {
        flush();
        current = {
          trigger: normalizeEventName(tokens[1] || "OnPlay"),
          conditions: [],
          target: "self",
          effects: [],
          modifiers: []
        };
        return;
      }

      if (!current) {
        current = {
          trigger: "OnPlay",
          conditions: [],
          target: "self",
          effects: [],
          modifiers: []
        };
      }

      if (head === "if") {
        current.conditions.push(line.slice(2).trim());
        return;
      }
      if (head === "target") {
        current.target = tokens.slice(1).join(" ") || "self";
        return;
      }
      if (head === "effect") {
        current.effects.push({
          action: String(tokens[1] || "noop"),
          args: tokens.slice(2)
        });
        return;
      }
      if (head === "modifier") {
        current.modifiers.push({
          action: String(tokens[1] || "noop"),
          args: tokens.slice(2)
        });
        return;
      }
      if (head === "end") {
        flush();
      }
    });

    flush();

    return {
      format: DSL_TEXT_FORMAT,
      rules
    };
  }

  function toDslText(ast) {
    const rules = safeArray(ast?.rules);
    const out = [];
    rules.forEach((rule) => {
      out.push(`trigger ${normalizeEventName(rule.trigger)}`);
      safeArray(rule.conditions).forEach((cond) => {
        if (String(cond || "").trim()) out.push(`if ${String(cond).trim()}`);
      });
      if (rule.target) out.push(`target ${String(rule.target)}`);
      safeArray(rule.effects).forEach((e) => {
        out.push(["effect", String(e.action || "noop"), ...safeArray(e.args)].join(" ").trim());
      });
      safeArray(rule.modifiers).forEach((m) => {
        out.push(["modifier", String(m.action || "noop"), ...safeArray(m.args)].join(" ").trim());
      });
      out.push("end");
      out.push("");
    });
    return out.join("\n").trim();
  }

  function astToGraph(ast) {
    const rules = safeArray(ast?.rules);
    const nodes = [];
    const edges = [];

    rules.forEach((rule, idx) => {
      let prevNodeId = "";
      const chain = [];

      const triggerNode = {
        id: createId("node"),
        type: "trigger",
        label: String(rule.trigger || "OnPlay"),
        data: { event: normalizeEventName(rule.trigger) },
        x: 40,
        y: 100 + idx * 240
      };
      nodes.push(triggerNode);
      chain.push(triggerNode.id);
      prevNodeId = triggerNode.id;

      safeArray(rule.conditions).forEach((cond) => {
        const node = {
          id: createId("node"),
          type: "condition",
          label: String(cond),
          data: { expression: String(cond) },
          x: 280,
          y: 100 + idx * 240
        };
        nodes.push(node);
        chain.push(node.id);
        edges.push({ id: createId("edge"), from: prevNodeId, to: node.id, kind: "flow" });
        prevNodeId = node.id;
      });

      const targetNode = {
        id: createId("node"),
        type: "target",
        label: String(rule.target || "self"),
        data: { target: String(rule.target || "self") },
        x: 520,
        y: 100 + idx * 240
      };
      nodes.push(targetNode);
      chain.push(targetNode.id);
      edges.push({ id: createId("edge"), from: prevNodeId, to: targetNode.id, kind: "flow" });
      prevNodeId = targetNode.id;

      safeArray(rule.effects).forEach((effect, ei) => {
        const node = {
          id: createId("node"),
          type: "effect",
          label: [effect.action, ...safeArray(effect.args)].join(" ").trim(),
          data: { action: String(effect.action || "noop"), args: safeArray(effect.args) },
          x: 760 + ei * 180,
          y: 100 + idx * 240
        };
        nodes.push(node);
        chain.push(node.id);
        edges.push({ id: createId("edge"), from: prevNodeId, to: node.id, kind: "flow" });
        prevNodeId = node.id;
      });

      safeArray(rule.modifiers).forEach((modifier, mi) => {
        const node = {
          id: createId("node"),
          type: "modifier",
          label: [modifier.action, ...safeArray(modifier.args)].join(" ").trim(),
          data: { action: String(modifier.action || "noop"), args: safeArray(modifier.args) },
          x: 1100 + mi * 180,
          y: 100 + idx * 240
        };
        nodes.push(node);
        chain.push(node.id);
        edges.push({ id: createId("edge"), from: prevNodeId, to: node.id, kind: "flow" });
        prevNodeId = node.id;
      });

      const endNode = {
        id: createId("node"),
        type: "end",
        label: "end",
        data: {},
        x: 1320,
        y: 100 + idx * 240
      };
      nodes.push(endNode);
      chain.push(endNode.id);
      edges.push({ id: createId("edge"), from: prevNodeId, to: endNode.id, kind: "flow" });
    });

    return {
      format: GRAPH_FORMAT,
      nodes,
      edges
    };
  }

  function graphToAst(graph) {
    const nodes = safeArray(graph?.nodes);
    const edges = safeArray(graph?.edges);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const outgoing = {};
    edges.forEach((e) => {
      if (!outgoing[e.from]) outgoing[e.from] = [];
      outgoing[e.from].push(e.to);
    });

    const triggers = nodes.filter((n) => n.type === "trigger");
    const rules = [];

    triggers.forEach((start) => {
      const rule = {
        trigger: normalizeEventName(start?.data?.event || start?.label || "OnPlay"),
        conditions: [],
        target: "self",
        effects: [],
        modifiers: []
      };
      const visited = new Set();
      let cur = start.id;
      for (let i = 0; i < 64; i += 1) {
        if (!cur || visited.has(cur)) break;
        visited.add(cur);
        const nextId = safeArray(outgoing[cur])[0];
        if (!nextId) break;
        const next = byId[nextId];
        if (!next) break;

        if (next.type === "condition") {
          rule.conditions.push(String(next?.data?.expression || next.label || ""));
        } else if (next.type === "target") {
          rule.target = String(next?.data?.target || next.label || "self");
        } else if (next.type === "effect") {
          rule.effects.push({
            action: String(next?.data?.action || "noop"),
            args: safeArray(next?.data?.args)
          });
        } else if (next.type === "modifier") {
          rule.modifiers.push({
            action: String(next?.data?.action || "noop"),
            args: safeArray(next?.data?.args)
          });
        } else if (next.type === "end") {
          break;
        }

        cur = next.id;
      }
      rules.push(rule);
    });

    return {
      format: DSL_TEXT_FORMAT,
      rules
    };
  }

  function parseConditionText(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    if (raw.includes("直接攻撃")) {
      const negative = /(していない|してない|しない|未|not)/i.test(raw);
      return {
        directAttackEnabled: true,
        directAttackValue: !negative
      };
    }
    const opMap = [
      [">=", "gte"],
      ["<=", "lte"],
      ["==", "eq"],
      ["!=", "neq"],
      [">", "gt"],
      ["<", "lt"]
    ];
    for (let i = 0; i < opMap.length; i += 1) {
      const [token, op] = opMap[i];
      const idx = raw.indexOf(token);
      if (idx <= 0) continue;
      const left = raw.slice(0, idx).trim();
      const rightRaw = raw.slice(idx + token.length).trim();
      const rightNum = Number(rightRaw);
      const right = Number.isFinite(rightNum) ? rightNum : rightRaw;
      return {
        left: { ref: left },
        [op]: right
      };
    }
    return {
      left: { ref: raw },
      neq: 0
    };
  }

  function mapTarget(target) {
    const raw = String(target || "self").toLowerCase();
    if (["self", "self_player", "owner"].includes(raw)) return "self_player";
    if (["opponent", "enemy", "target", "current_target", "target_player"].includes(raw)) return "current_target";
    if (["both", "self_and_current_target"].includes(raw)) return "self_and_current_target";
    return "self_player";
  }

  function mapEffectAction(action, args, target) {
    const a = String(action || "noop").toLowerCase();
    const n = Math.max(0, toNumber(args?.[0], 1));
    const mappedTarget = mapTarget(target);

    if (a === "draw") {
      return { type: "DRAW_CARD", target: mappedTarget, targetType: "player", amount: n || 1 };
    }
    if (a === "damage") {
      return { type: "DAMAGE", target: mappedTarget, targetType: "player", amount: n || 1, damageType: "damage", subType: "none" };
    }
    if (a === "pierce_damage") {
      return { type: "DAMAGE", target: mappedTarget, targetType: "player", amount: n || 1, damageType: "pierce", subType: "none" };
    }
    if (a === "heal") {
      return { type: "HEAL", target: mappedTarget, targetType: "player", amount: n || 1 };
    }
    if (a === "add_pp") {
      return { type: "RECOVER_PP", target: mappedTarget, targetType: "player", amount: n || 1 };
    }
    if (a === "add_status") {
      return {
        type: "GRANT_EFFECT_BUNDLE",
        target: mappedTarget,
        targetType: "player",
        effectName: String(args?.[0] || "Status"),
        allowDuplicate: true,
        duration: { mode: "turn", turns: 1, counts: 0 },
        grantedEffects: []
      };
    }
    return {
      type: "UNKNOWN",
      target: mappedTarget,
      raw: [action, ...safeArray(args)].join(" ")
    };
  }

  function compileAstToDslV1(ast) {
    const rules = safeArray(ast?.rules);
    const triggers = rules.map((rule) => {
      const effects = safeArray(rule.effects).map((effect) => mapEffectAction(effect.action, effect.args, rule.target));
      const conditions = safeArray(rule.conditions).map(parseConditionText).filter(Boolean);
      const trigger = {
        on: mapTriggerToV1(rule.trigger),
        effects
      };
      if (conditions.length === 1) {
        trigger.useCondition = true;
        trigger.condition = conditions[0];
      } else if (conditions.length > 1) {
        trigger.useCondition = true;
        trigger.condition = { and: conditions };
      }
      return trigger;
    });
    return {
      format: DSL_V1_FORMAT,
      triggers
    };
  }

  function mapTriggerToV1(name) {
    const n = normalizeEventName(name);
    const map = {
      OnPlay: "onSummon",
      OnAttack: "onAttack",
      OnDirectAttack: "onDirectAttack",
      OnSkillUse: "onSkillUse",
      OnBeforeAttackEffect: "onSkillBeforeAttackEffect",
      OnAfterAttackEffect: "onSkillAfterAttackEffect",
      OnLeaveField: "onLeave",
      OnTurnStart: "onTurnStart",
      OnTurnEnd: "onTurnEnd",
      OnDraw: "onDraw",
      OnDiscard: "onDiscard",
      OnDamage: "onDamage",
      OnHeal: "onHeal",
      OnShieldGain: "onShieldGain",
      OnPenetrateDamage: "onDamage"
    };
    return map[n] || "manual";
  }

  function dslV1ToAst(dslV1) {
    const triggers = safeArray(dslV1?.triggers);
    const rules = triggers.map((trigger) => {
      const effects = safeArray(trigger.effects).map((e) => ({
        action: mapEffectTypeToAction(e?.type),
        args: Number.isFinite(Number(e?.amount)) ? [String(Number(e.amount))] : []
      }));
      const conditions = [];
      if (trigger?.condition && typeof trigger.condition === "object") {
        conditions.push(stringifyCondition(trigger.condition));
      }
      return {
        trigger: normalizeEventName(mapTriggerFromV1(trigger.on)),
        conditions,
        target: String(trigger?.effects?.[0]?.target || "self_player"),
        effects,
        modifiers: []
      };
    });

    return {
      format: DSL_TEXT_FORMAT,
      rules
    };
  }

  function mapTriggerFromV1(on) {
    const raw = String(on || "onSummon");
    const map = {
      onSummon: "OnPlay",
      onAttack: "OnAttack",
      onDirectAttack: "OnDirectAttack",
      onSkillUse: "OnSkillUse",
      onSkillBeforeAttackEffect: "OnBeforeAttackEffect",
      onSkillAfterAttackEffect: "OnAfterAttackEffect",
      onLeave: "OnLeaveField",
      onTurnStart: "OnTurnStart",
      onTurnEnd: "OnTurnEnd",
      onDraw: "OnDraw",
      onDiscard: "OnDiscard",
      onDamage: "OnDamage",
      onHeal: "OnHeal",
      onShieldGain: "OnShieldGain"
    };
    return map[raw] || "OnPlay";
  }

  function mapEffectTypeToAction(type) {
    const raw = String(type || "UNKNOWN");
    const map = {
      DRAW_CARD: "draw",
      DAMAGE: "damage",
      HEAL: "heal",
      RECOVER_PP: "add_pp",
      GRANT_EFFECT_BUNDLE: "add_status"
    };
    return map[raw] || raw.toLowerCase();
  }

  function stringifyCondition(cond) {
    if (!cond || typeof cond !== "object") return "";
    if (cond.directAttackEnabled === true) {
      return cond.directAttackValue === false ? "直接攻撃していない" : "直接攻撃した";
    }
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "gt")) return `${cond.left.ref || "value"} > ${cond.gt}`;
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "gte")) return `${cond.left.ref || "value"} >= ${cond.gte}`;
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "lt")) return `${cond.left.ref || "value"} < ${cond.lt}`;
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "lte")) return `${cond.left.ref || "value"} <= ${cond.lte}`;
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "eq")) return `${cond.left.ref || "value"} == ${cond.eq}`;
    if (cond.left && Object.prototype.hasOwnProperty.call(cond, "neq")) return `${cond.left.ref || "value"} != ${cond.neq}`;
    if (Array.isArray(cond.and)) return cond.and.map(stringifyCondition).filter(Boolean).join(" && ");
    return JSON.stringify(cond);
  }

  function migrateLegacyBlocks(effectBlocks) {
    if (!effectBlocks || typeof effectBlocks !== "object") {
      return {
        ok: false,
        reason: "effectBlocks not found"
      };
    }
    let dslV1 = null;
    if (window.CardEffectBlockCompiler && typeof window.CardEffectBlockCompiler.compileProgramToDsl === "function") {
      dslV1 = window.CardEffectBlockCompiler.compileProgramToDsl(effectBlocks);
    }
    if (!dslV1 || String(dslV1.format || "") !== DSL_V1_FORMAT) {
      dslV1 = { format: DSL_V1_FORMAT, triggers: [] };
    }
    const ast = dslV1ToAst(dslV1);
    const graph = astToGraph(ast);
    const dslText = toDslText(ast);
    return {
      ok: true,
      graph,
      dslText,
      dslV1
    };
  }

  function resolveCardDsl(card) {
    if (!card || typeof card !== "object") {
      return { format: DSL_V1_FORMAT, triggers: [] };
    }

    if (card.effectGraph && Array.isArray(card.effectGraph.nodes) && Array.isArray(card.effectGraph.edges)) {
      const ast = graphToAst(card.effectGraph);
      return compileAstToDslV1(ast);
    }

    if (typeof card.effectDslText === "string" && card.effectDslText.trim()) {
      const ast = parseDslText(card.effectDslText);
      return compileAstToDslV1(ast);
    }

    if (card.effectBlocks) {
      const migrated = migrateLegacyBlocks(card.effectBlocks);
      if (migrated.ok) return migrated.dslV1;
    }

    if (card.effectDsl && String(card.effectDsl.format || "") === DSL_V1_FORMAT && Array.isArray(card.effectDsl.triggers)) {
      return card.effectDsl;
    }

    return { format: DSL_V1_FORMAT, triggers: [] };
  }

  const eventBus = createEventBus();
  const historyStore = createHistoryStore(3000);
  const effectInstances = createEffectInstanceStore();

  const runtimeInspector = {
    pendingEffects: [],
    effectStack: [],
    persistentEffects: [],
    temporaryEffects: [],
    lastSnapshot: null,
    update(snapshot) {
      this.lastSnapshot = deepClone(snapshot || {});
    },
    snapshot() {
      const instances = effectInstances.list();
      const byEvent = Object.create(null);
      instances.forEach((row) => {
        const key = normalizeEventName(row?.event || "OnPlay");
        if (!byEvent[key]) byEvent[key] = [];
        byEvent[key].push({
          instanceId: String(row.instanceId || ""),
          owner: String(row.owner || ""),
          sourceCardId: String(row.sourceCardId || "")
        });
      });
      return {
        pendingEffects: deepClone(this.pendingEffects),
        effectStack: deepClone(this.effectStack),
        persistentEffects: deepClone(this.persistentEffects),
        temporaryEffects: deepClone(this.temporaryEffects),
        registeredEvents: eventBus.getSnapshot(),
        eventSubscriberDetails: eventBus.getDetails(),
        effectInstances: instances,
        effectInstancesByEvent: deepClone(byEvent),
        activatedFlags: instances.filter((x) => x.activated).map((x) => x.instanceId),
        inheritedLinks: instances.filter((x) => x.inheritedFrom).map((x) => ({
          instanceId: x.instanceId,
          inheritedFrom: x.inheritedFrom
        })),
        lastSnapshot: deepClone(this.lastSnapshot)
      };
    }
  };

  const replayDebugger = {
    cursor: -1,
    rows() {
      return historyStore.query();
    },
    seek(index) {
      const rows = this.rows();
      const max = rows.length - 1;
      const next = Math.max(-1, Math.min(max, Number(index || 0)));
      this.cursor = next;
      return this.current();
    },
    step(delta) {
      return this.seek(this.cursor + Number(delta || 0));
    },
    current() {
      const rows = this.rows();
      if (this.cursor < 0 || this.cursor >= rows.length) return null;
      return rows[this.cursor];
    }
  };

  function emitGameEvent(eventName, payload, context) {
    const normalized = normalizeEventName(eventName);
    const publishResult = eventBus.publish(normalized, payload || {}, context || {});

    const historyRow = historyStore.push({
      eventName: normalized,
      owner: String(payload?.owner || context?.owner || "unknown"),
      sourceCardId: String(payload?.sourceCardId || context?.sourceCardId || ""),
      effectId: String(payload?.effectId || ""),
      turn: Number(payload?.turn || context?.turn || window.state?.matchData?.turn || 0),
      payload: {
        ...(payload || {}),
        publishResult
      }
    });

    runtimeInspector.pendingEffects = effectInstances.byEvent(normalized);
    runtimeInspector.effectStack = safeArray(payload?.effectStack || []);
    runtimeInspector.update({ event: normalized, payload: payload || {} });

    return {
      event: normalized,
      publishResult,
      historyRow
    };
  }

  function createCardSimulator(initial) {
    const simState = {
      hand: safeArray(initial?.hand),
      grave: safeArray(initial?.grave),
      history: safeArray(initial?.history),
      hp: toNumber(initial?.hp, 20),
      pp: toNumber(initial?.pp, 2),
      grantedEffects: safeArray(initial?.grantedEffects),
      activatedFlags: safeArray(initial?.activatedFlags)
    };

    return {
      getState() {
        return deepClone(simState);
      },
      patch(partial) {
        Object.assign(simState, deepClone(partial || {}));
        return deepClone(simState);
      },
      run(eventName, payload) {
        const row = emitGameEvent(eventName, payload || {}, { owner: payload?.owner || "player1" });
        simState.history.push(row.historyRow);
        return row;
      }
    };
  }

  function createSimulationState(owner, initialState) {
    if (initialState && typeof initialState === "object") return deepClone(initialState);
    const me = String(owner || "player1");
    return {
      player1: {
        hp: 20,
        pp: 2,
        ppMax: 10,
        shield: 0,
        defstack: 0,
        defstackMax: 0,
        atk: 0,
        grantedEffects: []
      },
      player2: {
        hp: 20,
        pp: 2,
        ppMax: 10,
        shield: 0,
        defstack: 0,
        defstackMax: 0,
        atk: 0,
        grantedEffects: []
      },
      matchData: {
        status: "playing",
        turnPlayer: me,
        round: 1,
        turn: 1
      }
    };
  }

  function toEngineTrigger(eventName) {
    const normalized = normalizeEventName(eventName);
    return mapTriggerToV1(normalized);
  }

  function simulateCardExecution(cardLike, options) {
    const card = cardLike && typeof cardLike === "object" ? deepClone(cardLike) : {};
    const owner = String(options?.owner || "player1");
    const opponent = owner === "player1" ? "player2" : "player1";
    const triggerEvent = String(options?.eventName || "OnPlay");
    const triggerName = toEngineTrigger(triggerEvent);
    const sourceCardId = String(card?.id || options?.sourceCardId || "sim-card");
    const dsl = resolveCardDsl(card);
    if (!dsl || String(dsl.format || "") !== DSL_V1_FORMAT || !Array.isArray(dsl.triggers) || dsl.triggers.length === 0) {
      return {
        ok: true,
        dslUnimplemented: true,
        triggerEvent: normalizeEventName(triggerEvent),
        triggerName,
        cardId: sourceCardId,
        triggerReports: [],
        effects: [],
        debugEvents: [],
        error: null
      };
    }
    if (!window.EffectEngine || typeof window.EffectEngine.execute !== "function") {
      return {
        ok: false,
        dslUnimplemented: false,
        triggerEvent: normalizeEventName(triggerEvent),
        triggerName,
        cardId: sourceCardId,
        triggerReports: [],
        effects: [],
        debugEvents: [],
        error: { message: "EffectEngine unavailable" }
      };
    }

    const simState = createSimulationState(owner, options?.state);
    if (!simState[owner]) simState[owner] = { hp: 20, pp: 2, ppMax: 10, shield: 0, defstack: 0, defstackMax: 0, atk: 0, grantedEffects: [] };
    if (!simState[opponent]) simState[opponent] = { hp: 20, pp: 2, ppMax: 10, shield: 0, defstack: 0, defstackMax: 0, atk: 0, grantedEffects: [] };
    simState[owner].hp = toNumber(options?.hp, toNumber(simState[owner].hp, 20));
    simState[owner].pp = toNumber(options?.pp, toNumber(simState[owner].pp, 2));
    simState.matchData = simState.matchData && typeof simState.matchData === "object" ? simState.matchData : {};
    simState.matchData.turn = toNumber(options?.turn, toNumber(simState.matchData.turn, 1));
    simState.matchData.turnPlayer = owner;

    const sourceCard = {
      dataset: {
        id: sourceCardId,
        owner,
        zoneType: String(options?.zoneType || "attacker"),
        didDirectAttack: options?.didDirectAttack ? "1" : "0",
        instanceId: String(options?.instanceId || `sim-${Date.now()}`)
      },
      profile: deepClone(card),
      _debugCardData: deepClone(card)
    };

    const saved = {
      state: window.state,
      addVal: window.addVal,
      applyCalculatedDamage: window.applyCalculatedDamage,
      drawToHand: window.drawToHand,
      pushMyStateDebounced: window.pushMyStateDebounced,
      update: window.update,
      getMyRole: window.getMyRole,
      getZoneCards: window.getZoneCards,
      getDeckCount: window.getDeckCount,
      getFieldContent: window.getFieldContent,
      BattleTargetSystem: window.BattleTargetSystem
    };

    const debugEvents = [];
    let executeResult = null;
    let caught = null;
    const stateBefore = deepClone(simState);

    window.state = simState;
    window.getMyRole = () => owner;
    window.addVal = (targetOwner, key, delta) => {
      const p = simState?.[targetOwner];
      if (!p) return;
      const cur = toNumber(p[key], 0);
      p[key] = Math.max(0, cur + toNumber(delta, 0));
    };
    window.applyCalculatedDamage = (targetOwner, type, subType, amount) => {
      const p = simState?.[targetOwner];
      if (!p) return;
      if (typeof window.applyDamageByRule === "function") {
        const next = window.applyDamageByRule({
          hp: p.hp,
          shield: p.shield,
          defstack: p.defstack,
          defstackMax: p.defstackMax
        }, type, amount);
        p.hp = toNumber(next.hp, p.hp);
        p.shield = toNumber(next.shield, p.shield);
        p.defstack = toNumber(next.defstack, p.defstack);
        return;
      }
      p.hp = Math.max(0, toNumber(p.hp, 0) - Math.max(0, toNumber(amount, 0)));
    };
    window.drawToHand = () => {};
    window.pushMyStateDebounced = () => {};
    window.update = () => {};
    window.getZoneCards = () => [];
    window.getDeckCount = () => 0;
    window.getFieldContent = () => ({ querySelectorAll: () => [] });
    window.BattleTargetSystem = { getTarget() { return "player"; } };

    const context = {
      game: simState,
      sourceCard,
      sourceProfile: deepClone(card),
      owner,
      opponent,
      target: opponent,
      event: {
        name: triggerName,
        zoneType: String(options?.zoneType || "attacker"),
        didDirectAttack: options?.didDirectAttack === true,
        amount: toNumber(options?.damage, 0),
        damageType: String(options?.damageType || "damage"),
        targetOwner: String(options?.targetOwner || opponent)
      },
      debugReporter(payload) {
        debugEvents.push(deepClone(payload || {}));
      }
    };

    try {
      if (typeof window.EffectEngine.executeGrantedEffects === "function") {
        window.EffectEngine.executeGrantedEffects(context);
      }
      executeResult = window.EffectEngine.execute(dsl, context);
    } catch (error) {
      caught = {
        message: String(error?.message || error || "simulate-execute-error"),
        stack: String(error?.stack || "")
      };
    } finally {
      window.state = saved.state;
      window.addVal = saved.addVal;
      window.applyCalculatedDamage = saved.applyCalculatedDamage;
      window.drawToHand = saved.drawToHand;
      window.pushMyStateDebounced = saved.pushMyStateDebounced;
      window.update = saved.update;
      window.getMyRole = saved.getMyRole;
      window.getZoneCards = saved.getZoneCards;
      window.getDeckCount = saved.getDeckCount;
      window.getFieldContent = saved.getFieldContent;
      window.BattleTargetSystem = saved.BattleTargetSystem;
    }

    return {
      ok: !caught,
      dslUnimplemented: false,
      triggerEvent: normalizeEventName(triggerEvent),
      triggerName,
      cardId: sourceCardId,
      triggerReports: Array.isArray(executeResult?.triggerReports) ? executeResult.triggerReports : [],
      effects: Array.isArray(executeResult?.effects) ? executeResult.effects : [],
      debugEvents,
      error: caught,
      stateBefore,
      stateAfter: deepClone(simState)
    };
  }

  window.CardEffectRuntimeV2 = {
    DSL_TEXT_FORMAT,
    DSL_JSON_FORMAT,
    GRAPH_FORMAT,
    DSL_V1_FORMAT,
    EVENT_NAMES,
    eventBus,
    historyStore,
    effectInstances,
    runtimeInspector,
    replayDebugger,
    parseDslText,
    toDslText,
    astToGraph,
    graphToAst,
    compileAstToDslV1,
    dslV1ToAst,
    migrateLegacyBlocks,
    resolveCardDsl,
    emitGameEvent,
    createCardSimulator,
    simulateCardExecution
  };
})();
