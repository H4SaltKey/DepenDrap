(function() {
  let debugInstanceSeq = 1;

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

  function getByPath(obj, path) {
    return String(path || "").split(".").reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : 0), obj);
  }

  function setByPath(obj, path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (parts.length === 0) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const k = parts[i];
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function createTrackerNode() {
    const makeStat = () => ({ lastAfter: 0, incAmount: 0, decAmount: 0 });
    return {
      game: { hp: makeStat(), pp: makeStat(), shield: makeStat(), atk: makeStat(), custom: { use: { attacker: 0, skill: 0 } } },
      turn: { hp: makeStat(), pp: makeStat(), shield: makeStat(), atk: makeStat(), custom: { use: { attacker: 0, skill: 0 } } }
    };
  }

  function ownerName(owner, state) {
    return String(state?.[owner]?.username || owner);
  }

  function createCardObj(cardData, owner) {
    const resolved = window.CardCombatData?.getResolvedCardData?.(cardData.id) || cardData;
    const dsl = resolveCardDslForDebug(resolved);
    return {
      id: cardData.id,
      name: cardData.name || cardData.id,
      // インスタンス単位で調整できるよう浅いコピーを持つ
      profile: { ...resolved, effectDsl: dsl },
      _debugCardData: { ...resolved, effectDsl: dsl },
      dataset: { id: cardData.id, owner, zoneType: "", didDirectAttack: "0", instanceId: `dbg-${Date.now()}-${debugInstanceSeq++}` },
      style: {}
    };
  }

  function createEmptyDsl() {
    return { format: "dependrap.dsl.v1", triggers: [] };
  }

  function resolveCardDslForDebug(cardLike) {
    if (
      window.CardEffectRuntimeV2
      && typeof window.CardEffectRuntimeV2.resolveCardDsl === "function"
    ) {
      const resolved = window.CardEffectRuntimeV2.resolveCardDsl(cardLike || {});
      if (resolved && resolved.format === "dependrap.dsl.v1" && Array.isArray(resolved.triggers)) {
        return resolved;
      }
    }
    if (
      cardLike?.effectBlocks
      && Array.isArray(cardLike.effectBlocks.timings)
      && window.CardEffectBlockCompiler
      && typeof window.CardEffectBlockCompiler.compileProgramToDsl === "function"
    ) {
      const compiled = window.CardEffectBlockCompiler.compileProgramToDsl(cardLike.effectBlocks);
      if (compiled && compiled.format === "dependrap.dsl.v1" && Array.isArray(compiled.triggers)) {
        return compiled;
      }
      return createEmptyDsl();
    }
    if (
      cardLike?.effectDsl
      && typeof cardLike.effectDsl === "object"
      && String(cardLike.effectDsl.format || "") === "dependrap.dsl.v1"
      && Array.isArray(cardLike.effectDsl.triggers)
    ) {
      return cardLike.effectDsl;
    }
    return createEmptyDsl();
  }

  function createDefaultDebugState() {
    return {
      player1: { hp: 20, pp: 2, ppMax: 2, shield: 0, atk: 0, username: "You", deck: [], grantedEffects: [] },
      player2: { hp: 20, pp: 2, ppMax: 2, shield: 0, atk: 0, username: "Enemy", deck: [], grantedEffects: [] },
      matchData: { status: "playing", turnPlayer: "player1", round: 1, turn: 1 }
    };
  }

  function getDeckSelectionState() {
    if (!window.__cardDebugDeckSelection) window.__cardDebugDeckSelection = {};
    return window.__cardDebugDeckSelection;
  }

  function getCardSourceList() {
    if (typeof window.getCardIds === "function" && typeof window.getCardData === "function") {
      const ids = window.getCardIds();
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.map((id) => window.getCardData(id)).filter(Boolean);
      }
    }
    if (Array.isArray(window.CARD_DB) && window.CARD_DB.length > 0) return window.CARD_DB;
    if (Array.isArray(window.devCards) && window.devCards.length > 0) {
      return window.devCards.map((c) => ({
        id: c.id,
        name: c.name || "",
        effectText: c.effectText || "",
        image: c.image || "",
        attribute: c.attribute || "近接",
        type: c.type || "アタッカー",
        attack: Number(c.attack || 0),
        effectDsl: c.effectDsl || null,
        tags: Array.isArray(c.tags) ? c.tags : String(c.tags || "").split(",").map((x) => x.trim()).filter(Boolean)
      }));
    }
    return [];
  }

  function installLauncherButton() {
    // フローティング起動ボタンは廃止（dev画面内導線のみ使用）
  }

  function uninstallFloatingLauncherButton() {
    const btn = document.getElementById("cardDebugLaunchBtn");
    if (btn) btn.remove();
  }

  function installInlineLauncherButton() {
    const devEnabled = (window.devMode === true) || (localStorage.getItem("dev") === "true");
    if (!devEnabled) return;
    if (document.getElementById("cardDebugLaunchInlineBtn")) return;
    const layout = document.querySelector(".devLayout");
    if (!layout) return;
    const panel = document.createElement("section");
    panel.id = "cardDebugLaunchInlinePanel";
    panel.style.cssText = "background:white;border:1px solid #aaa;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;";
    panel.innerHTML = `
      <div style="font-size:14px;color:#334155;font-weight:600;">カード効果の単体検証はカードデバッグから開始</div>
      <button id="cardDebugLaunchInlineBtn" type="button" style="padding:10px 14px;border:1px solid #1d4ed8;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">カードデバッグを起動</button>
    `;
    const firstSection = layout.querySelector("section");
    if (firstSection && firstSection.parentNode === layout) {
      layout.insertBefore(panel, firstSection);
    } else {
      layout.appendChild(panel);
    }
    const btn = panel.querySelector("#cardDebugLaunchInlineBtn");
    if (btn) btn.addEventListener("click", () => openCardDebugModal());
  }

  function openCardDebugModal() {
    if (document.getElementById("cardDebugOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "cardDebugOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:120000;background:rgba(5,7,14,0.9);display:flex;align-items:stretch;justify-content:center;padding:16px;";

    const root = document.createElement("div");
    root.style.cssText = "width:min(1420px,100%);height:100%;background:#111827;border:1px solid #334155;border-radius:12px;display:flex;flex-direction:column;gap:10px;padding:10px;color:#e5e7eb;font-family:ui-sans-serif,system-ui;";

    overlay.appendChild(root);
    document.body.appendChild(overlay);

    let detachEsc = null;
    const closeModal = () => {
      if (detachEsc) detachEsc();
      overlay.remove();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeModal();
    };
    document.addEventListener("keydown", onEsc);
    detachEsc = () => document.removeEventListener("keydown", onEsc);

    const debug = {
      owner: "player1",
      target: "player",
      state: createDefaultDebugState(),
      zones: { hand: [], attacker: [], skill: [], grave: [], deck: [] },
      tracker: { player1: createTrackerNode(), player2: createTrackerNode() },
      logs: [],
      lastExecution: null,
      errors: [],
      runtime: {
        timelineQueue: [],
        eventQueue: [],
        triggerQueue: [],
        effectQueue: [],
        chainQueue: [],
        context: null
      }
    };

    function log(msg) {
      const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
      debug.logs.push(line);
      const box = root.querySelector("#dbgLog");
      if (box) {
        box.innerHTML = debug.logs.map((x) => `<div>${x}</div>`).join("");
        box.scrollTop = box.scrollHeight;
      }
    }

    function pushQueue(queueName, row) {
      const q = debug.runtime[queueName];
      if (!Array.isArray(q)) return;
      q.push(row);
      if (q.length > 60) q.splice(0, q.length - 60);
    }

    function pushDebugPayload(payload) {
      if (!payload || typeof payload !== "object") return;
      pushQueue("timelineQueue", payload);
      if (payload.type === "trigger" || payload.type === "trigger_search") {
        pushQueue("triggerQueue", payload);
        pushQueue("eventQueue", payload);
      } else if (payload.type === "effect" || payload.type === "effect_result") {
        pushQueue("effectQueue", payload);
      } else if (payload.type === "chain") {
        pushQueue("chainQueue", payload);
      } else if (payload.type === "event_fire") {
        pushQueue("eventQueue", payload);
      } else if (payload.type === "condition" || payload.type === "target") {
        pushQueue("eventQueue", payload);
      }
    }

    function bumpTracker(owner, stat, before, after) {
      const nodeTurn = debug.tracker[owner]?.turn?.[stat];
      const nodeGame = debug.tracker[owner]?.game?.[stat];
      if (!nodeTurn || !nodeGame) return;
      const diff = Number(after) - Number(before);
      nodeTurn.lastAfter = after;
      nodeGame.lastAfter = after;
      if (diff > 0) { nodeTurn.incAmount += diff; nodeGame.incAmount += diff; }
      if (diff < 0) { nodeTurn.decAmount += Math.abs(diff); nodeGame.decAmount += Math.abs(diff); }
    }

    function moveCard(card, toZone) {
      ["hand", "attacker", "skill", "grave", "deck"].forEach((z) => {
        const idx = debug.zones[z].indexOf(card);
        if (idx >= 0) debug.zones[z].splice(idx, 1);
      });
      card.dataset.zoneType = (toZone === "hand" || toZone === "deck") ? "" : toZone;
      debug.zones[toZone].push(card);
    }

    function withPatchedRuntime(fn) {
      const saved = {
        state: window.state,
        addVal: window.addVal,
        applyCalculatedDamage: window.applyCalculatedDamage,
        drawToHand: window.drawToHand,
        placeCardInZone: window.placeCardInZone,
        clearZoneMarker: window.clearZoneMarker,
        organizeHands: window.organizeHands,
        organizeBattleZones: window.organizeBattleZones,
        pushMyStateDebounced: window.pushMyStateDebounced,
        update: window.update,
        getZoneCards: window.getZoneCards,
        getDeckCount: window.getDeckCount,
        getFieldContent: window.getFieldContent,
        GameStatTracker: window.GameStatTracker,
        addGameLog: window.addGameLog,
        getMyRole: window.getMyRole,
        BattleTargetSystem: window.BattleTargetSystem
      };

      window.state = debug.state;
      window.getMyRole = () => debug.owner;
      window.addGameLog = (m) => log(String(m));
      window.addVal = (owner, key, delta) => {
        const p = debug.state[owner];
        if (!p) return;
        const before = Number(p[key] || 0);
        const after = Math.max(0, before + Number(delta || 0));
        p[key] = after;
        if (["hp", "pp", "shield", "atk"].includes(key)) bumpTracker(owner, key, before, after);
      };
      window.applyCalculatedDamage = (targetOwner, type, subType, amount) => {
        const p = debug.state[targetOwner];
        if (!p) return;
        const before = Number(p.hp || 0);
        p.hp = Math.max(0, before - Number(amount || 0));
        bumpTracker(targetOwner, "hp", before, p.hp);
        log(`[DAMAGE] ${ownerName(targetOwner, debug.state)} ${type}/${subType} -${amount}`);
      };
      window.drawToHand = (amount) => {
        for (let i = 0; i < Number(amount || 1); i += 1) {
          const c = debug.zones.deck.pop();
          if (!c) break;
          moveCard(c, "hand");
        }
      };
      window.placeCardInZone = (card, owner, zoneType) => {
        if (!card) return;
        const prevZoneType = String(card.dataset.zoneType || "");
        const isFromBattleField = (prevZoneType === "attacker" || prevZoneType === "skill");
        const isToBattleField = (zoneType === "attacker" || zoneType === "skill");
        const isLeavingBattleField = isFromBattleField && !isToBattleField;
        card.dataset.owner = owner || card.dataset.owner || debug.owner;

        if (isLeavingBattleField && window.PlayerActionResolver?.resolveCardOnLeave) {
          window.PlayerActionResolver.resolveCardOnLeave(card, { zoneType: prevZoneType, force: true });
          // onLeave 中に移動先が変わった場合はその結果を優先
          const changed = String(card.dataset.zoneType || "") !== prevZoneType;
          if (changed) return;
        }

        moveCard(card, zoneType);

        if (!isFromBattleField && isToBattleField && window.PlayerActionResolver?.resolveCardOnPlay) {
          window.PlayerActionResolver.resolveCardOnPlay(card, zoneType);
        }
      };
      window.clearZoneMarker = (card) => { card.dataset.zoneType = ""; };
      window.organizeHands = () => {};
      window.organizeBattleZones = () => {};
      window.pushMyStateDebounced = () => {};
      window.update = () => {};
      window.getZoneCards = (owner, zoneType) => debug.zones[zoneType].filter((c) => (c.dataset.owner || "") === owner);
      window.getDeckCount = () => debug.zones.deck.length;
      window.getFieldContent = () => ({ querySelectorAll: () => [] });
      window.GameStatTracker = { resolvePath(path, owner) { return getByPath(debug.tracker[owner] || {}, path); } };
      window.BattleTargetSystem = { getTarget() { return debug.target === "player" ? "player" : { slotIndex: 0 }; } };

      try { return fn(); }
      finally {
        window.state = saved.state;
        window.addVal = saved.addVal;
        window.applyCalculatedDamage = saved.applyCalculatedDamage;
        window.drawToHand = saved.drawToHand;
        window.placeCardInZone = saved.placeCardInZone;
        window.clearZoneMarker = saved.clearZoneMarker;
        window.organizeHands = saved.organizeHands;
        window.organizeBattleZones = saved.organizeBattleZones;
        window.pushMyStateDebounced = saved.pushMyStateDebounced;
        window.update = saved.update;
        window.getZoneCards = saved.getZoneCards;
        window.getDeckCount = saved.getDeckCount;
        window.getFieldContent = saved.getFieldContent;
        window.GameStatTracker = saved.GameStatTracker;
        window.addGameLog = saved.addGameLog;
        window.getMyRole = saved.getMyRole;
        window.BattleTargetSystem = saved.BattleTargetSystem;
      }
    }

    function runCardEvent(card, eventName, extra = {}) {
      if (!window.EffectEngine || typeof window.EffectEngine.execute !== "function") return;
      const dsl = resolveCardDslForDebug(card.profile || {});
      card.profile.effectDsl = dsl;
      if (!dsl || !Array.isArray(dsl.triggers) || dsl.triggers.length === 0) {
        const row = {
          cardId: card.id,
          cardName: card.name,
          trigger: eventName,
          dslUnimplemented: true,
          triggerReports: [],
          effects: [],
          error: null
        };
        debug.lastExecution = row;
        log(`[DSL] ${card.name} はDSL未実装（効果なしとして扱い）`);
        return;
      }
      withPatchedRuntime(() => {
        const context = {
          game: debug.state,
          sourceCard: card,
          sourceProfile: card.profile,
          owner: debug.owner,
          opponent: "player2",
          target: "player2",
          event: {
            name: eventName,
            zoneType: card.dataset.zoneType || "",
            targetOwner: "player2",
            didDirectAttack: card.dataset.didDirectAttack === "1",
            ...extra
          }
        };
        debug.runtime.context = deepClone({
          cardId: card.id,
          trigger: eventName,
          owner: context.owner,
          opponent: context.opponent,
          event: context.event
        });
        const debugEvents = [];
        context.debugReporter = (payload) => {
          debugEvents.push(payload);
          pushDebugPayload(payload);
        };
        let res = null;
        let caught = null;
        if (typeof window.EffectEngine.executeGrantedEffects === "function") {
          window.EffectEngine.executeGrantedEffects(context);
        }
        try {
          res = window.EffectEngine.execute(dsl, context);
        } catch (error) {
          caught = error;
        }
        const row = {
          cardId: card.id,
          cardName: card.name,
          trigger: eventName,
          dslUnimplemented: false,
          triggerReports: Array.isArray(res?.triggerReports) ? res.triggerReports : [],
          effects: Array.isArray(res?.effects) ? res.effects : [],
          debugEvents,
          error: caught ? {
            message: String(caught?.message || caught || "unknown-error"),
            stack: String(caught?.stack || "")
          } : null
        };
        debug.lastExecution = row;
        if (row.error) {
          debug.errors.push(row);
          const errLine = `[ERROR] card=${row.cardId} trigger=${eventName} ${row.error.message}`;
          console.error(errLine, caught);
          log(errLine);
          throw caught;
        }
        log(`[FLOW] ${card.name} -> ${eventName} effects=${(row.effects || []).length}`);
      });
    }

    function attachEngineDebugHook(card) {
      if (!card) return;
      card._debugReporter = (payload) => {
        // 逐次イベントは execute の戻り値にも入るため、ここでは保持のみ
        if (!Array.isArray(card._debugEvents)) card._debugEvents = [];
        card._debugEvents.push(payload);
        pushDebugPayload(payload);
      };
      card._debugOnEngineResult = (payload) => {
        const row = {
          cardId: payload?.cardId || card.id,
          cardName: payload?.cardName || card.name,
          trigger: payload?.trigger || "unknown",
          dslUnimplemented: false,
          triggerReports: Array.isArray(payload?.result?.triggerReports) ? payload.result.triggerReports : [],
          effects: Array.isArray(payload?.result?.effects) ? payload.result.effects : [],
          debugEvents: Array.isArray(card._debugEvents) ? card._debugEvents : [],
          error: null
        };
        card._debugEvents = [];
        if ((row.triggerReports || []).length === 0 && (!row.effects || row.effects.length === 0)) {
          const dsl = resolveCardDslForDebug(card.profile || {});
          if (!dsl || !Array.isArray(dsl.triggers) || dsl.triggers.length === 0) {
            row.dslUnimplemented = true;
            log(`[DSL] ${card.name} はDSL未実装（効果なしとして扱い）`);
          }
        }
        debug.lastExecution = row;
      };
    }

    function applyZoneAfterLeaveResolution(card, fromZone) {
      const now = String(card.dataset.zoneType || "");
      if (now === "grave") {
        moveCard(card, "grave");
        return true;
      }
      if (now === "attacker" || now === "skill") {
        return false;
      }
      // attacker/skill 以外へ離れた場合は手札へ戻った扱いにする
      if (fromZone === "attacker" || fromZone === "skill") {
        moveCard(card, "hand");
        return true;
      }
      return false;
    }

    function recordRuntimeError(card, trigger, effect, error) {
      const row = {
        cardId: card?.id || "unknown",
        cardName: card?.name || "unknown",
        trigger: trigger || "unknown",
        dslUnimplemented: false,
        triggerReports: [],
        effects: [],
        debugEvents: [],
        error: {
          message: String(error?.message || error || "unknown-error"),
          stack: String(error?.stack || ""),
          effectType: String(effect || "unknown")
        }
      };
      debug.lastExecution = row;
      debug.errors.push(row);
      console.error(`[CARD_DEBUG_ERROR] card=${row.cardId} trigger=${row.trigger} effect=${row.error.effectType}`, error);
      log(`[ERROR] card=${row.cardId} trigger=${row.trigger} effect=${row.error.effectType} ${row.error.message}`);
    }

    function runSkillEffectFallback(card) {
      runCardEvent(card, "onSkillBeforeAttackEffect");
      runCardEvent(card, "onSkillAfterAttackEffect");
    }

    function applyDebugCostBeforePlay(card, zoneType) {
      const profile = card.profile || {};
      const policy = String(profile.cardCostPolicy || "normal");
      const isSkillUse = zoneType === "skill";
      const isCardSkillLike = String(profile.cardKind || "attacker") === "skill" || isSkillUse;
      const defaultCost = isCardSkillLike ? 1 : (String(profile.cardKind || "attacker") === "support" ? 0 : 1);
      const cost = Math.max(0, Number(profile.cost ?? defaultCost));
      const before = Number(debug.state.player1.pp || 0);
      if (card.dataset.ppCostHandled === "1") return;
      if (policy === "normal" && cost > 0) {
        const after = Math.max(0, before - cost);
        if (after !== before) {
          debug.state.player1.pp = after;
          bumpTracker("player1", "pp", before, after);
          log(`[PP] デバッグ前払い: -${cost} (${before} -> ${after})`);
        }
      }
      card.dataset.ppCostHandled = "1";
      card.dataset.ppCostValue = String(cost);
    }

    function runPlayWithResolverFallback(card, zoneType) {
      const beforePp = Number(debug.state?.player1?.pp || 0);
      const prevExec = debug.lastExecution;
      applyDebugCostBeforePlay(card, zoneType);
      withPatchedRuntime(() => {
        if (window.PlayerActionResolver?.resolveCardOnPlay) {
          window.PlayerActionResolver.resolveCardOnPlay(card, zoneType);
        } else if (zoneType === "skill") {
          runSkillEffectFallback(card);
        } else {
          runCardEvent(card, "onSummon");
        }
      });

      const afterPp = Number(debug.state?.player1?.pp || 0);
      const hasEngineReport = debug.lastExecution !== prevExec
        && debug.lastExecution
        && debug.lastExecution.cardId === card.id;
      if (hasEngineReport) return;

      // resolver側が不発だった場合のデバッグフォールバック
      const profile = card.profile || {};
      const cost = Math.max(0, Number(profile.cost || (String(profile.cardKind || "attacker") === "support" ? 0 : 1)));
      const policy = String(profile.cardCostPolicy || "normal");
      if (afterPp === beforePp && policy === "normal" && cost > 0) {
        debug.state.player1.pp = Math.max(0, beforePp - cost);
        log(`[PP] resolver fallback: -${cost} (${beforePp} -> ${debug.state.player1.pp})`);
      }
      if (zoneType === "skill") {
        runSkillEffectFallback(card);
      } else {
        runCardEvent(card, "onSummon");
      }
      log(`[FLOW] resolver fallback executed for ${card.name} zone=${zoneType}`);
    }

    function summarizeDsl(card) {
      const dsl = resolveCardDslForDebug(card?.profile || card || {});
      const triggers = Array.isArray(dsl?.triggers) ? dsl.triggers : [];
      if (triggers.length === 0) return "DSL未実装";
      return triggers.map((t) => `${String(t.on || "?")}(${Array.isArray(t.effects) ? t.effects.length : 0})`).join(" / ");
    }

    function esc(v) {
      return String(v == null ? "" : v)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
    }

    function renderExecutionSummary() {
      const execEl = root.querySelector("#dbgExecPanel");
      const errEl = root.querySelector("#dbgErrorPanel");
      const qEventEl = root.querySelector("#dbgEventQueuePanel");
      const qEffectEl = root.querySelector("#dbgEffectQueuePanel");
      const qChainEl = root.querySelector("#dbgChainQueuePanel");
      const qCtxEl = root.querySelector("#dbgContextPanel");
      if (!execEl || !errEl) return;
      const engineQueues = (window.EffectEngine && typeof window.EffectEngine.getRuntimeQueues === "function")
        ? window.EffectEngine.getRuntimeQueues()
        : null;
      const timelineRows = Array.isArray(engineQueues?.timelineQueue) && engineQueues.timelineQueue.length > 0
        ? engineQueues.timelineQueue
        : debug.runtime.timelineQueue;
      const triggerRows = Array.isArray(engineQueues?.triggerQueue) && engineQueues.triggerQueue.length > 0
        ? engineQueues.triggerQueue
        : debug.runtime.triggerQueue;
      const effectRows = Array.isArray(engineQueues?.effectQueue) && engineQueues.effectQueue.length > 0
        ? engineQueues.effectQueue
        : debug.runtime.effectQueue;
      const chainRows = Array.isArray(engineQueues?.chainQueue) && engineQueues.chainQueue.length > 0
        ? engineQueues.chainQueue
        : debug.runtime.chainQueue;
      const row = debug.lastExecution;
      if (!row) {
        execEl.innerHTML = `<div style="font-size:12px;color:#94a3b8;">まだ効果実行はありません。</div>`;
      } else if (row.dslUnimplemented) {
        execEl.innerHTML = `<div style="font-size:12px;color:#fcd34d;">このカードはDSL未実装（効果なし）</div>`;
      } else {
        const triggerRows = (row.triggerReports || []).map((t) => {
          const effects = (t.effects || []).map((e) => {
            const status = e.error ? "失敗" : (e.applied ? "実行" : "スキップ");
            const reason = e.error ? `error:${e.error.message}` : (e.skippedReason || "");
            return `<div style="font-size:11px;color:#cbd5e1;">#${e.order} ${esc(e.type)} → ${status} ${reason ? `(${esc(reason)})` : ""}</div>`;
          }).join("");
          return `
            <div style="padding:6px;border:1px solid #334155;border-radius:6px;background:#0f172a;">
              <div style="font-size:12px;color:#e2e8f0;">発火タイミング: ${esc(t.on)}</div>
              <div style="font-size:11px;color:${t.triggerConditionPassed ? "#86efac" : "#fca5a5"};">条件判定: ${t.triggerConditionPassed ? "成功" : "失敗"} ${t.triggerConditionReason ? `(${esc(t.triggerConditionReason)})` : ""}</div>
              <div style="font-size:11px;color:${t.bundleConditionPassed ? "#86efac" : "#fca5a5"};">条件失敗理由: ${esc(t.bundleConditionReason || "なし")}</div>
              <div style="margin-top:4px;">${effects || '<div style="font-size:11px;color:#94a3b8;">効果なし</div>'}</div>
            </div>
          `;
        }).join("");
        const fallbackEffects = (row.effects || []).map((e, idx) => {
          const status = e.error ? "失敗" : (e.applied ? "実行" : "スキップ");
          return `<div style="font-size:11px;color:#cbd5e1;">#${idx + 1} ${esc(e.type || "UNKNOWN")} → ${status}</div>`;
        }).join("");
        execEl.innerHTML = `
          <div style="font-size:12px;color:#93c5fd;">カード: ${esc(row.cardId)} / トリガー: ${esc(row.trigger)}</div>
          <div style="margin-top:6px;display:grid;gap:6px;">${triggerRows || fallbackEffects || '<div style="font-size:11px;color:#94a3b8;">一致トリガーなし</div>'}</div>
        `;
      }

      const errors = debug.errors.slice(-5).reverse();
      if (errors.length === 0) {
        errEl.innerHTML = `<div style="font-size:11px;color:#94a3b8;">実行エラーなし</div>`;
      } else {
        errEl.innerHTML = errors.map((e) => `
          <div style="padding:6px;border:1px solid #7f1d1d;border-radius:6px;background:#450a0a;">
            <div style="font-size:11px;color:#fecaca;">card=${esc(e.cardId)} trigger=${esc(e.trigger)} effect=${esc(e.error?.effectType || "unknown")}</div>
            <div style="font-size:11px;color:#fca5a5;">${esc(e.error?.message || "error")}</div>
          </div>
        `).join("");
      }

      if (qEventEl) {
        const rows = (triggerRows.length > 0 ? triggerRows : timelineRows).slice(-16).reverse();
        qEventEl.innerHTML = rows.length > 0
          ? [`<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">trigger:${triggerRows.length} / timeline:${timelineRows.length}</div>`, ...rows.map((r) => {
            if (r?.kind === "trigger") {
              const reason = esc(r?.result?.skippedReason || r?.result || r?.bundleConditionReason || "");
              const state = esc(r?.stage || "trigger");
              return `<div style="font-size:11px;color:#93c5fd;">${state}: ${esc(r?.trigger || r?.eventName || "?")} ${reason ? `(${reason})` : ""}</div>`;
            }
            if (r?.kind === "effect") {
              const applied = r?.result?.applied === true ? "実行" : "スキップ";
              const reason = esc(r?.result?.skippedReason || "");
              return `<div style="font-size:11px;color:#5eead4;">effect ${esc(r?.trigger || "?")} #${esc(r?.order || "?")} ${applied}${reason ? ` (${reason})` : ""}</div>`;
            }
            if (r?.kind === "chain") return `<div style="font-size:11px;color:#fda4af;">chain=${esc(JSON.stringify(r?.executedOrders || []))}</div>`;
            if (r?.type === "event_fire") return `<div style="font-size:11px;color:#fde68a;">event発火: ${esc(r?.eventName || "?")}</div>`;
            if (r?.type === "trigger_search") return `<div style="font-size:11px;color:#93c5fd;">trigger検索: ${esc(r?.eventName || "?")} -> ${esc(r?.matchedCount || 0)}件 (source:${esc(r?.dslSource || r?.searchedFrom || "")})</div>`;
            if (r?.type === "condition") return `<div style="font-size:11px;color:${r?.result ? "#86efac" : "#fca5a5"};">条件判定 ${esc(r?.effectType || "?")} -> ${r?.result ? "true" : "false"} (${esc(r?.reason || "")})</div>`;
            if (r?.type === "target") {
              const owners = Array.isArray(r?.resolvedOwners) ? r.resolvedOwners.join(",") : "";
              const cards = Array.isArray(r?.resolvedCards) ? r.resolvedCards.join(",") : "";
              return `<div style="font-size:11px;color:#c4b5fd;">target解決 ${esc(r?.effectType || "?")} owners=[${esc(owners)}] cards=[${esc(cards)}]</div>`;
            }
            if (r?.type === "effect_result") {
              const changed = Array.isArray(r?.changed) && r.changed.length > 0 ? ` changed=${esc(JSON.stringify(r.changed))}` : "";
              return `<div style="font-size:11px;color:#5eead4;">効果実行 ${esc(r?.trigger || "?")} #${esc(r?.order || "?")} ${esc(r?.result?.type || "?")} ${r?.result?.applied ? "実行" : "不発"}${changed}</div>`;
            }
            if (r?.type === "trigger") return `<div style="font-size:11px;color:#93c5fd;">trigger=${esc(r?.report?.on || "?")} bundle=${esc(r?.report?.bundleConditionReason || "passed")}</div>`;
            if (r?.type === "effect") return `<div style="font-size:11px;color:#5eead4;">effect=${esc(r?.result?.type || "?")} applied=${esc(String(r?.result?.applied === true))}</div>`;
            if (r?.type === "chain") return `<div style="font-size:11px;color:#fda4af;">chain=${esc(JSON.stringify(r?.executedOrders || []))}</div>`;
            return `<div style="font-size:11px;color:#cbd5e1;">${esc(JSON.stringify(r))}</div>`;
          })].join("")
          : '<div style="font-size:11px;color:#94a3b8;">イベントキューは空</div>';
      }
      if (qEffectEl) {
        const rows = effectRows.slice(-12).reverse();
        qEffectEl.innerHTML = rows.length > 0
          ? rows.map((r) => `<div style="font-size:11px;color:#cbd5e1;">${esc(r?.trigger || r?.eventName || "?")} #${esc(r?.order || "?")} ${esc(r?.result?.type || r?.type || "?")} ${r?.result?.applied ? "実行" : "待機/スキップ"} ${esc(r?.result?.skippedReason || "")}</div>`).join("")
          : '<div style="font-size:11px;color:#94a3b8;">効果キューは空</div>';
      }
      if (qCtxEl) {
        qCtxEl.textContent = JSON.stringify(debug.runtime.context || {}, null, 2);
      }
      if (qChainEl) {
        const rows = chainRows.slice(-12).reverse();
        qChainEl.innerHTML = rows.length > 0
          ? rows.map((r) => `<div style="font-size:11px;color:#fda4af;">trigger=${esc(r?.trigger || "?")} order=${esc(r?.order || "?")} executed=${esc(JSON.stringify(r?.executedOrders || []))}</div>`).join("")
          : '<div style="font-size:11px;color:#94a3b8;">チェインキューは空</div>';
      }
    }

    function renderTrackerGrid() {
      const box = root.querySelector("#dbgTrackerGrid");
      if (!box) return;
      const metrics = [
        { path: "turn.custom.use.attacker", label: "このターンのアタッカー使用回数" },
        { path: "turn.custom.use.skill", label: "このターンのスキル使用回数" },
        { path: "game.custom.use.attacker", label: "この試合のアタッカー使用回数" },
        { path: "game.custom.use.skill", label: "この試合のスキル使用回数" },
        { path: "turn.hp.lastAfter", label: "このターンのHP現在値" },
        { path: "turn.hp.incAmount", label: "このターンのHP増加量" },
        { path: "turn.hp.decAmount", label: "このターンのHP減少量" },
        { path: "turn.pp.lastAfter", label: "このターンのPP現在値" },
        { path: "turn.shield.lastAfter", label: "このターンのシールド現在値" },
        { path: "turn.atk.lastAfter", label: "このターンの攻撃力現在値" }
      ];
      box.innerHTML = `
        <div style="font-size:11px;color:#93c5fd;margin-bottom:6px;">効果条件で使う記録値（何を指すか明記 / 手動編集）</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="text-align:left;padding:4px;border-bottom:1px solid #334155;">項目</th><th style="padding:4px;border-bottom:1px solid #334155;">You</th><th style="padding:4px;border-bottom:1px solid #334155;">Enemy</th></tr></thead>
          <tbody>
            ${metrics.map((m) => `
              <tr>
                <td style="padding:4px;border-bottom:1px solid #1e293b;">
                  <div>${m.label}</div>
                  <div style="font-size:10px;color:#64748b;">${m.path}</div>
                </td>
                <td style="padding:4px;border-bottom:1px solid #1e293b;"><input data-owner="player1" data-path="${m.path}" type="number" value="${Number(getByPath(debug.tracker.player1, m.path) || 0)}" style="width:100%;padding:4px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;"></td>
                <td style="padding:4px;border-bottom:1px solid #1e293b;"><input data-owner="player2" data-path="${m.path}" type="number" value="${Number(getByPath(debug.tracker.player2, m.path) || 0)}" style="width:100%;padding:4px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;"></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      box.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("change", () => {
          setByPath(debug.tracker[inp.dataset.owner], inp.dataset.path, Number(inp.value || 0));
          log(`[TRACKER] ${inp.dataset.owner}.${inp.dataset.path}=${Number(inp.value || 0)}`);
        });
      });
    }

    function renderCardChip(card, zone, render) {
      const el = document.createElement("div");
      el.style.cssText = "border:1px solid #475569;border-radius:8px;padding:6px;background:#111827;min-width:120px;";
      const controls = [];
      const kind = String(card.profile?.cardKind || "attacker");
      if (zone === "hand") {
        if (kind === "attacker" || kind === "support") controls.push(["toAttacker", "ATK"]);
        if (kind === "skill" || kind === "support" || kind === "attacker") controls.push(["toSkill", "SKILL"]);
      }
      if (zone === "attacker") { controls.push(["direct", "直接攻撃"], ["toGrave", "墓地へ"]); }
      if (zone === "skill") { controls.push(["toGrave", "墓地へ"]); }
      if (zone === "grave" || zone === "deck") { controls.push(["toHand", "手札"]); }
      el.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#f8fafc;">${card.name}</div>
        <div style="font-size:11px;color:#94a3b8;">${card.id}</div>
        <div style="font-size:10px;color:#93c5fd;line-height:1.35;margin-top:2px;">DSL: ${esc(summarizeDsl(card))}</div>
        <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">${controls.map(([act, label]) => `<button data-act="${act}" style="padding:3px 6px;font-size:11px;background:#334155;color:#fff;border:0;border-radius:4px;cursor:pointer;">${label}</button>`).join("")}</div>
      `;
      el.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          try {
            if (act === "toAttacker") {
              delete card.dataset.debugCardKind;
              delete card.dataset.debugCostOverride;
              moveCard(card, "attacker");
              debug.tracker.player1.turn.custom.use.attacker += 1;
              debug.tracker.player1.game.custom.use.attacker += 1;
              runPlayWithResolverFallback(card, "attacker");
            } else if (act === "toSkill") {
              const attackerCount = debug.zones.attacker.filter((c) => String(c.profile?.cardKind || "attacker") === "attacker").length;
              const activatorExists = debug.zones.attacker.some((c) => {
                const k = String(c.profile?.cardKind || "attacker");
                return k === "attacker" || k === "support";
              });
              if ((kind === "attacker" && attackerCount < 1) || ((kind === "skill" || kind === "support") && !activatorExists)) {
                log("[RULE] スキル使用条件を満たしていません");
                render();
                return;
              }
              moveCard(card, "skill");
              debug.tracker.player1.turn.custom.use.skill += 1;
              debug.tracker.player1.game.custom.use.skill += 1;
              // カード種別に依存せず、スキルとして処理する
              card.dataset.debugCardKind = "skill";
              if (kind === "support") card.dataset.debugCostOverride = "1";
              runPlayWithResolverFallback(card, "skill");
              delete card.dataset.debugCardKind;
              delete card.dataset.debugCostOverride;

              // ゲーム同様、スキル使用後は退場時効果を処理して墓地へ送る
              const fromZone = "skill";
              withPatchedRuntime(() => {
                if (window.PlayerActionResolver?.resolveCardOnLeave) {
                  window.PlayerActionResolver.resolveCardOnLeave(card, { zoneType: fromZone });
                } else {
                  runCardEvent(card, "onLeave", { didDirectAttack: card.dataset.didDirectAttack === "1" });
                }
              });
              if (!applyZoneAfterLeaveResolution(card, fromZone)) {
                moveCard(card, "grave");
              }
            } else if (act === "toGrave") {
              const fromZone = String(card.dataset.zoneType || "");
              withPatchedRuntime(() => {
                if (window.PlayerActionResolver?.resolveCardOnLeave) {
                  window.PlayerActionResolver.resolveCardOnLeave(card, { zoneType: fromZone });
                } else {
                  runCardEvent(card, "onLeave", { didDirectAttack: card.dataset.didDirectAttack === "1" });
                }
              });
              if (!applyZoneAfterLeaveResolution(card, fromZone)) {
                moveCard(card, "grave");
              }
            } else if (act === "toHand") {
              moveCard(card, "hand");
            } else if (act === "direct") {
              card.dataset.didDirectAttack = "1";
              withPatchedRuntime(() => {
                if (window.PlayerActionResolver?.resolveDirectAttack) {
                  window.PlayerActionResolver.resolveDirectAttack(card, "player1", { type: debug.target === "player" ? "player" : "monster" });
                } else {
                  runCardEvent(card, "onDirectAttack", { didDirectAttack: true });
                }
              });
              const amount = Math.max(1, Number(card.profile?.attack || 0) + Number(debug.state.player1.atk || 0));
              if (debug.target === "player") {
                const before = Number(debug.state.player2.hp || 0);
                debug.state.player2.hp = Math.max(0, before - amount);
                bumpTracker("player2", "hp", before, debug.state.player2.hp);
                log(`[DIRECT] ${card.name} -> ${ownerName("player2", debug.state)} ${amount}ダメージ`);
              } else {
                const tname = debug.target === "goblin" ? "ゴブリン" : "シャドウハウンド";
                log(`[DIRECT] ${card.name} -> ${tname} ${amount}ダメージ（簡易）`);
              }
              const fromZone = "attacker";
              withPatchedRuntime(() => {
                if (window.PlayerActionResolver?.resolveCardOnLeave) {
                  window.PlayerActionResolver.resolveCardOnLeave(card, { zoneType: fromZone });
                } else {
                  runCardEvent(card, "onLeave", { didDirectAttack: true });
                }
              });
              if (!applyZoneAfterLeaveResolution(card, fromZone)) {
                moveCard(card, "grave");
              }
            }
          } catch (error) {
            recordRuntimeError(card, act, "button_action", error);
          }
          render();
        });
      });
      return el;
    }

    function renderDebuggerMain() {
      root.innerHTML = `
        <div style="display:grid;grid-template-columns:320px 1fr 340px;gap:10px;min-height:0;height:100%;position:relative;">
          <button id="dbgCloseTop" style="position:absolute;top:2px;right:2px;padding:6px 10px;background:#7f1d1d;color:#fff;border:0;border-radius:6px;cursor:pointer;z-index:2;">閉じる</button>
          <section style="display:grid;grid-template-rows:auto auto auto auto auto auto 1fr;gap:8px;min-height:0;">
            <h3 style="margin:0;font-size:16px;">カードデバッグ</h3>
            <div style="display:flex;gap:6px;"><button id="dbgClose" style="flex:1;padding:8px;background:#374151;color:#fff;border:0;border-radius:6px;cursor:pointer;">閉じる</button><button id="dbgReset" style="flex:1;padding:8px;background:#0f766e;color:#fff;border:0;border-radius:6px;cursor:pointer;">デッキ再選択</button></div>
            <div style="display:flex;gap:6px;"><button id="dbgDraw" style="flex:1;padding:8px;background:#1d4ed8;color:#fff;border:0;border-radius:6px;cursor:pointer;">1枚ドロー</button><button id="dbgShuffle" style="flex:1;padding:8px;background:#6d28d9;color:#fff;border:0;border-radius:6px;cursor:pointer;">山札シャッフル</button></div>
            <label style="font-size:12px;color:#cbd5e1;">ターゲット</label>
            <select id="dbgTarget" style="padding:8px;border-radius:6px;background:#0b1220;color:#fff;border:1px solid #334155;"><option value="player">相手プレイヤー</option><option value="goblin">ゴブリン</option><option value="shadowhound">シャドウハウンド</option></select>
            <label style="font-size:12px;color:#cbd5e1;">カード追加</label>
            <select id="dbgCardSelect" style="padding:8px;border-radius:6px;background:#0b1220;color:#fff;border:1px solid #334155;"></select>
            <button id="dbgAddHand" style="padding:8px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;">手札に追加</button>
            <div style="font-size:12px;color:#94a3b8;">デバッグ専用ローカル実行です。</div>
            <div id="dbgTrackerGrid" style="overflow:auto;min-height:0;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;"></div>
          </section>
          <section style="display:grid;grid-template-rows:auto 1fr auto auto;gap:8px;min-height:0;">
            <div id="dbgDirectField" style="height:56px;border:1px dashed #ef4444;background:rgba(239,68,68,0.14);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fecaca;">直接攻撃フィールド</div>
            <div style="display:grid;grid-template-rows:auto auto auto auto auto;gap:8px;min-height:0;overflow:auto;">
              <div><div style="font-size:12px;color:#93c5fd;">アタッカー場</div><div id="dbgZoneAttacker" style="min-height:64px;border:1px solid #334155;border-radius:8px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;"></div></div>
              <div><div style="font-size:12px;color:#fbbf24;">スキル場</div><div id="dbgZoneSkill" style="min-height:64px;border:1px solid #334155;border-radius:8px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;"></div></div>
              <div><div style="font-size:12px;color:#86efac;">手札</div><div id="dbgZoneHand" style="min-height:92px;border:1px solid #334155;border-radius:8px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;"></div></div>
              <div><div style="font-size:12px;color:#c4b5fd;">墓地</div><div id="dbgZoneGrave" style="min-height:84px;border:1px solid #334155;border-radius:8px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;overflow:auto;"></div></div>
              <div><div style="font-size:12px;color:#fda4af;">山札（枚数）: <span id="dbgDeckCount">0</span></div></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <label style="font-size:12px;">You HP<input id="dbgP1hp" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">Enemy HP<input id="dbgP2hp" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">You PP<input id="dbgP1pp" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">Enemy PP<input id="dbgP2pp" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">You Shield<input id="dbgP1shield" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">Enemy Shield<input id="dbgP2shield" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">You ATK<input id="dbgP1atk" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
              <label style="font-size:12px;">Enemy ATK<input id="dbgP2atk" type="number" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"></label>
            </div>
            <button id="dbgApplyStats" style="padding:8px;background:#0ea5e9;color:#082f49;border:0;border-radius:6px;font-weight:700;cursor:pointer;">ステータス適用</button>
          </section>
          <section style="display:grid;grid-template-rows:auto auto auto 1fr auto;gap:8px;min-height:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;"><h4 style="margin:0;font-size:14px;">記録データ / フローチャット</h4><button id="dbgClearLog" style="padding:6px 10px;background:#334155;color:#fff;border:0;border-radius:6px;cursor:pointer;">クリア</button></div>
            <div style="display:grid;grid-template-rows:auto auto;gap:8px;">
              <div id="dbgExecPanel" style="overflow:auto;max-height:200px;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;"></div>
              <div id="dbgErrorPanel" style="overflow:auto;max-height:120px;border:1px solid #7f1d1d;border-radius:8px;padding:8px;background:#1f1116;"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr;gap:6px;">
              <div id="dbgEventQueuePanel" style="overflow:auto;max-height:84px;border:1px solid #1e3a8a;border-radius:8px;padding:6px;background:#0f172a;"></div>
              <div id="dbgEffectQueuePanel" style="overflow:auto;max-height:96px;border:1px solid #0f766e;border-radius:8px;padding:6px;background:#0b1f1e;"></div>
              <div id="dbgChainQueuePanel" style="overflow:auto;max-height:84px;border:1px solid #7c2d12;border-radius:8px;padding:6px;background:#1c1917;"></div>
              <pre id="dbgContextPanel" style="overflow:auto;max-height:120px;border:1px solid #334155;border-radius:8px;padding:6px;background:#111827;font-size:10px;line-height:1.35;color:#cbd5e1;white-space:pre-wrap;"></pre>
            </div>
            <div style="min-height:0;"><div id="dbgLog" style="height:100%;overflow:auto;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;font-size:12px;line-height:1.5;"></div></div>
            <div style="display:flex;gap:6px;"><input id="dbgChatInput" type="text" placeholder="メモ/チャット" style="flex:1;padding:8px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;"><button id="dbgChatSend" style="padding:8px 12px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;">送信</button></div>
          </section>
        </div>
      `;

      const selector = root.querySelector("#dbgCardSelect");
      const cardSource = getCardSourceList();
      selector.innerHTML = cardSource.map((c) => `<option value="${c.id}">${c.id} ${c.name || ""}</option>`).join("");

      function render() {
        const zoneEls = {
          attacker: root.querySelector("#dbgZoneAttacker"),
          skill: root.querySelector("#dbgZoneSkill"),
          hand: root.querySelector("#dbgZoneHand"),
          grave: root.querySelector("#dbgZoneGrave")
        };
        Object.entries(zoneEls).forEach(([zone, el]) => {
          if (!el) return;
          el.innerHTML = "";
          debug.zones[zone].forEach((card) => el.appendChild(renderCardChip(card, zone, render)));
        });
        root.querySelector("#dbgDeckCount").textContent = String(debug.zones.deck.length);
        const targetLabel = debug.target === "player" ? ownerName("player2", debug.state) : (debug.target === "goblin" ? "ゴブリン" : "シャドウハウンド");
        root.querySelector("#dbgDirectField").textContent = `ドラッグ/操作で「${targetLabel}」に直接攻撃`;

        root.querySelector("#dbgP1hp").value = String(debug.state.player1.hp);
        root.querySelector("#dbgP2hp").value = String(debug.state.player2.hp);
        root.querySelector("#dbgP1pp").value = String(debug.state.player1.pp);
        root.querySelector("#dbgP2pp").value = String(debug.state.player2.pp);
        root.querySelector("#dbgP1shield").value = String(debug.state.player1.shield);
        root.querySelector("#dbgP2shield").value = String(debug.state.player2.shield);
        root.querySelector("#dbgP1atk").value = String(debug.state.player1.atk);
        root.querySelector("#dbgP2atk").value = String(debug.state.player2.atk);

        renderTrackerGrid();
        renderExecutionSummary();
      }

      root.querySelector("#dbgClose").onclick = () => closeModal();
      root.querySelector("#dbgCloseTop").onclick = () => closeModal();
      root.querySelector("#dbgReset").onclick = () => renderDeckBuilder();
      root.querySelector("#dbgTarget").onchange = (e) => { debug.target = e.target.value; render(); };
      root.querySelector("#dbgShuffle").onclick = () => {
        for (let i = debug.zones.deck.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [debug.zones.deck[i], debug.zones.deck[j]] = [debug.zones.deck[j], debug.zones.deck[i]];
        }
        log("[SYSTEM] 山札をシャッフル");
        render();
      };
      root.querySelector("#dbgDraw").onclick = () => {
        const c = debug.zones.deck.pop();
        if (!c) return;
        moveCard(c, "hand");
        log(`[DRAW] ${c.name}`);
        render();
      };
      root.querySelector("#dbgAddHand").onclick = () => {
        const id = selector.value;
        const row = cardSource.find((x) => x.id === id);
        if (!row) return;
        const card = createCardObj(row, "player1");
        attachEngineDebugHook(card);
        moveCard(card, "hand");
        log(`[ADD] 手札に追加 ${card.name}`);
        render();
      };
      root.querySelector("#dbgApplyStats").onclick = () => {
        const p1 = debug.state.player1; const p2 = debug.state.player2;
        p1.hp = Number(root.querySelector("#dbgP1hp").value || 0);
        p2.hp = Number(root.querySelector("#dbgP2hp").value || 0);
        p1.pp = Number(root.querySelector("#dbgP1pp").value || 0);
        p2.pp = Number(root.querySelector("#dbgP2pp").value || 0);
        p1.shield = Number(root.querySelector("#dbgP1shield").value || 0);
        p2.shield = Number(root.querySelector("#dbgP2shield").value || 0);
        p1.atk = Number(root.querySelector("#dbgP1atk").value || 0);
        p2.atk = Number(root.querySelector("#dbgP2atk").value || 0);
        log("[STATE] ステータスを反映");
        render();
      };
      root.querySelector("#dbgClearLog").onclick = () => {
        debug.logs = [];
        debug.errors = [];
        debug.lastExecution = null;
        debug.runtime.timelineQueue = [];
        debug.runtime.eventQueue = [];
        debug.runtime.triggerQueue = [];
        debug.runtime.effectQueue = [];
        debug.runtime.chainQueue = [];
        debug.runtime.context = null;
        if (window.EffectEngine && typeof window.EffectEngine.clearRuntimeQueues === "function") {
          window.EffectEngine.clearRuntimeQueues();
        }
        render();
      };
      root.querySelector("#dbgChatSend").onclick = () => {
        const input = root.querySelector("#dbgChatInput");
        const text = String(input.value || "").trim();
        if (!text) return;
        log(`[CHAT] ${text}`);
        input.value = "";
      };

      render();
    }

    function renderDeckBuilder() {
      const selection = getDeckSelectionState();
      let query = "";
      const cardSource = getCardSourceList();

      function buildRows() {
        const list = cardSource.filter((c) => {
          if (!query) return true;
          const q = query.toLowerCase();
          return String(c.id || "").toLowerCase().includes(q)
            || String(c.name || "").toLowerCase().includes(q)
            || String(c.effectText || "").toLowerCase().includes(q);
        });
        return list.map((c) => {
          const count = Math.min(3, Math.max(0, Number(selection[c.id] || 0)));
          selection[c.id] = count;
          return `
            <div style="display:grid;grid-template-columns:130px 1fr 180px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #1f2937;">
              <div style="font-size:11px;color:#93c5fd;">${c.id}</div>
              <div>
                <div style="font-size:12px;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name || "(名前なし)"}</div>
                <div style="font-size:10px;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(summarizeDsl({ profile: c }))}</div>
              </div>
              <div style="display:grid;grid-template-columns:30px 1fr 30px 44px;gap:4px;align-items:center;">
                <button type="button" data-card-minus="${c.id}" style="height:30px;border:1px solid #334155;border-radius:6px;background:#1f2937;color:#fff;cursor:pointer;">-</button>
                <input data-card-id="${c.id}" type="number" min="0" step="1" value="${count}" style="width:100%;padding:6px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;text-align:center;">
                <button type="button" data-card-plus="${c.id}" style="height:30px;border:1px solid #334155;border-radius:6px;background:#1f2937;color:#fff;cursor:pointer;">+</button>
                <button type="button" data-card-max3="${c.id}" style="height:30px;border:1px solid #0ea5e9;border-radius:6px;background:#082f49;color:#bae6fd;cursor:pointer;">3枚</button>
              </div>
            </div>
          `;
        }).join("");
      }

      const hasCards = cardSource.length > 0;
      root.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <h3 style="margin:0;font-size:18px;">カードデバッグ起動設定</h3>
          <button id="dbgSetupClose" style="padding:8px 12px;background:#374151;color:#fff;border:0;border-radius:6px;cursor:pointer;">閉じる</button>
        </div>
        <div style="font-size:12px;color:#94a3b8;">カード一覧からデッキに加えるカードと枚数を選んで「開始」を押してください。</div>
        <div style="display:flex;gap:8px;">
          <input id="dbgSetupSearch" type="text" placeholder="検索: id / 名前 / 効果テキスト" style="flex:1;padding:8px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;">
          <button id="dbgSetupClear" style="padding:8px 12px;background:#334155;color:#fff;border:0;border-radius:6px;cursor:pointer;">枚数クリア</button>
        </div>
        <div id="dbgSetupList" style="flex:1;min-height:0;overflow:auto;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;">${hasCards ? buildRows() : '<div style="padding:14px;color:#fca5a5;font-size:12px;">カードデータが未ロードです。開発画面のカード一覧を表示後に再度開いてください。</div>'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-size:12px;color:#93c5fd;">合計枚数: <span id="dbgSetupTotal">0</span></div>
          <button id="dbgSetupStart" ${hasCards ? "" : "disabled"} style="padding:10px 18px;background:${hasCards ? "#2563eb" : "#334155"};color:#fff;border:0;border-radius:8px;font-weight:700;cursor:${hasCards ? "pointer" : "not-allowed"};">このデッキで開始</button>
        </div>
      `;

      function syncTotal() {
        const total = Object.values(selection).reduce((a, b) => a + Math.min(3, Math.max(0, Number(b || 0))), 0);
        const el = root.querySelector("#dbgSetupTotal");
        if (el) el.textContent = String(total);
      }

      function bindInputs() {
        root.querySelectorAll("input[data-card-id]").forEach((inp) => {
          inp.addEventListener("input", () => {
            const id = inp.dataset.cardId;
            const v = Math.min(3, Math.max(0, Number(inp.value || 0)));
            selection[id] = v;
            inp.value = String(v);
            syncTotal();
          });
        });
        root.querySelectorAll("button[data-card-minus]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.cardMinus;
            const next = Math.max(0, Number(selection[id] || 0) - 1);
            selection[id] = next;
            const input = root.querySelector(`input[data-card-id="${id}"]`);
            if (input) input.value = String(next);
            syncTotal();
          });
        });
        root.querySelectorAll("button[data-card-plus]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.cardPlus;
            const next = Math.min(3, Math.max(0, Number(selection[id] || 0) + 1));
            selection[id] = next;
            const input = root.querySelector(`input[data-card-id="${id}"]`);
            if (input) input.value = String(next);
            syncTotal();
          });
        });
        root.querySelectorAll("button[data-card-max3]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.cardMax3;
            const cur = Math.max(0, Number(selection[id] || 0));
            const next = cur >= 3 ? cur : 3;
            selection[id] = next;
            const input = root.querySelector(`input[data-card-id="${id}"]`);
            if (input) input.value = String(next);
            syncTotal();
          });
        });
      }

      bindInputs();
      syncTotal();

      root.querySelector("#dbgSetupClose").onclick = () => closeModal();
      root.querySelector("#dbgSetupSearch").addEventListener("input", (e) => {
        query = String(e.target.value || "").trim();
        root.querySelector("#dbgSetupList").innerHTML = buildRows();
        bindInputs();
      });
      root.querySelector("#dbgSetupClear").onclick = () => {
        Object.keys(selection).forEach((k) => { selection[k] = 0; });
        root.querySelector("#dbgSetupList").innerHTML = buildRows();
        bindInputs();
        syncTotal();
      };

      root.querySelector("#dbgSetupStart").onclick = () => {
        const deckRows = [];
        cardSource.forEach((row) => {
          const count = Math.min(3, Math.max(0, Number(selection[row.id] || 0)));
          for (let i = 0; i < count; i += 1) deckRows.push(row);
        });
        if (deckRows.length === 0) {
          alert("デッキ枚数が0です。カードを1枚以上選択してください。");
          return;
        }

        debug.state = createDefaultDebugState();
        debug.zones = { hand: [], attacker: [], skill: [], grave: [], deck: [] };
        debug.tracker = { player1: createTrackerNode(), player2: createTrackerNode() };
        debug.logs = [];
        debug.lastExecution = null;
        debug.errors = [];
        debug.runtime = {
          timelineQueue: [],
          eventQueue: [],
          triggerQueue: [],
          effectQueue: [],
          chainQueue: [],
          context: null
        };

        debug.zones.deck = deckRows.map((row) => {
          const card = createCardObj(row, "player1");
          attachEngineDebugHook(card);
          return card;
        });
        for (let i = debug.zones.deck.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [debug.zones.deck[i], debug.zones.deck[j]] = [debug.zones.deck[j], debug.zones.deck[i]];
        }

        log(`[SYSTEM] デッキ構築完了 (${debug.zones.deck.length}枚)`);
        renderDebuggerMain();
      };
    }

    const tryOpen = async () => {
      let cards = getCardSourceList();
      if (cards.length === 0 && typeof window.loadCardData === "function") {
        try {
          await window.loadCardData();
        } catch (_) {}
        cards = getCardSourceList();
      }
      renderDeckBuilder();
    };
    tryOpen();
  }

  window.openCardDebugModal = openCardDebugModal;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      uninstallFloatingLauncherButton();
      installLauncherButton();
      installInlineLauncherButton();
    });
  } else {
    uninstallFloatingLauncherButton();
    installLauncherButton();
    installInlineLauncherButton();
  }
  if (Array.isArray(window._afterUpdateHooks) && !window._afterUpdateHooks.includes(installInlineLauncherButton)) {
    window._afterUpdateHooks.push(installInlineLauncherButton);
  }
})();
