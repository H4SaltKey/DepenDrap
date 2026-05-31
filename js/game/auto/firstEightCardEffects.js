(function() {
  const TARGET_IDS = new Set([
    "cd001-001",
    "cd001-002",
    "cd001-003",
    "cd001-004",
    "cd001-005",
    "cd001-006",
    "cd001-007",
    "cd001-008"
  ]);

  function meToOp(owner) {
    return owner === "player1" ? "player2" : "player1";
  }

  function getPlayer(owner) {
    return window.state?.[owner] || null;
  }

  function addPp(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "pp", amount);
  }

  function setPpAtLeast(owner, floorValue) {
    const s = getPlayer(owner);
    if (!s) return;
    const cur = Number(s.pp || 0);
    if (cur < floorValue) {
      const max = Number(s.ppMax || 2);
      s.pp = Math.min(max, floorValue);
      if (typeof window.pushMyStateDebounced === "function") window.pushMyStateDebounced();
    }
  }

  function healHp(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "hp", amount);
  }

  function reduceHp(owner, amount) {
    if (typeof window.applyCalculatedDamage === "function") {
      window.applyCalculatedDamage(owner, "hp_reduce", "none", amount, false, { source: "first8" });
    }
  }

  function addShield(owner, amount) {
    if (typeof window.addVal === "function") window.addVal(owner, "shield", amount);
  }

  function drawToHand(amount) {
    if (typeof window.drawToHand === "function") window.drawToHand(amount);
  }

  function moveOwnerBattleCardsToGrave(owner) {
    if (typeof window.getZoneCards !== "function" || typeof window.placeCardInZone !== "function") return;
    ["attacker", "skill"].forEach((zone) => {
      const cards = window.getZoneCards(owner, zone) || [];
      cards.forEach((cardEl) => window.placeCardInZone(cardEl, owner, "grave"));
    });
    if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
  }

  function isMagicBattleState(owner) {
    if (typeof window.getZoneCards !== "function" || typeof window.getCardData !== "function") return false;
    const attacker = (window.getZoneCards(owner, "attacker") || []).slice(-1)[0];
    if (!attacker) return false;
    const data = window.getCardData(attacker.dataset.id);
    return data?.attribute === "魔法";
  }

  function resolveAttackTriggerForAttacker(owner) {
    if (typeof window.getZoneCards !== "function") return;
    const attacker = (window.getZoneCards(owner, "attacker") || []).slice(-1)[0];
    if (!attacker) return;
    const id = attacker.dataset.id;
    const self = getPlayer(owner);
    if (!self) return;

    if (id === "cd001-003") {
      healHp(owner, 1);
      addShield(owner, 1);
      return;
    }

    if (id === "cd001-005") {
      self._cd001005_usedHeal2 = !!self._cd001005_usedHeal2;
      if (!self._cd001005_usedHeal2) {
        healHp(owner, 2);
        self._cd001005_usedHeal2 = true;
      } else {
        healHp(owner, 1);
      }
      return;
    }

    if (id === "cd001-007") {
      const hp = Number(self.hp || 0);
      if (hp >= 11) reduceHp(owner, 1);
      const hpNow = Number(self.hp || 0);
      let x = 0;
      if (hpNow >= 6 && hpNow <= 10) x = 1;
      else if (hpNow >= 2 && hpNow <= 5) x = 2;
      else if (hpNow === 1) x = 3;
      if (x > 0 && typeof window.addVal === "function") window.addVal(owner, "atk", x);
      return;
    }

    if (id === "cd001-001") {
      // 直接攻撃時の分岐は未対応。攻撃時は現時点では追加処理なし。
      return;
    }
  }

  function resolveCardEffectById(context) {
    const { profile, owner, zoneType } = context;
    const id = profile?.id;
    if (!id || !TARGET_IDS.has(id)) return { handled: false };

    const self = getPlayer(owner);
    const op = meToOp(owner);

    if (id === "cd001-001" && zoneType === "attacker") {
      setPpAtLeast(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-002" && zoneType === "skill") {
      if (isMagicBattleState(owner)) {
        moveOwnerBattleCardsToGrave(owner);
        reduceHp(owner, 1);
        drawToHand(1);
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-003" && zoneType === "attacker") {
      const hp = Number(self?.hp || 0);
      const shield = Number(self?.shield || 0);
      if (hp >= 15) drawToHand(1);
      if (hp >= 20 || shield > 0) addPp(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-004" && zoneType === "skill") {
      if (isMagicBattleState(owner)) {
        resolveAttackTriggerForAttacker(owner);
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-005" && zoneType === "attacker") {
      // 継続効果は簡易実装: 登場時には処理なし
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-006" && zoneType === "skill") {
      if (isMagicBattleState(owner)) {
        moveOwnerBattleCardsToGrave(owner);
        healHp(owner, 1);
        const myHp = Number(self?.hp || 0);
        const opHp = Number(getPlayer(op)?.hp || 0);
        const diff = myHp - opHp;
        if (diff > 0) {
          let x = 1;
          if (diff >= 8) x = 4;
          else if (diff >= 6) x = 3;
          else if (diff >= 4) x = 2;
          reduceHp(op, x);
        }
      }
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-007" && zoneType === "attacker") {
      const hp = Number(self?.hp || 0);
      if (hp >= 11) addPp(owner, 1);
      return { handled: true, preventDefaultDsl: true };
    }

    if (id === "cd001-008" && zoneType === "skill") {
      if (isMagicBattleState(owner)) {
        const atk = Math.max(0, Number(profile.attack || 0));
        healHp(owner, atk);
        const m = window.state?.matchData || {};
        const key = `${owner}:${m.round || 0}:${m.turn || 0}`;
        window.runtimeState = window.runtimeState || {};
        window.runtimeState.effects = window.runtimeState.effects || {};
        window.runtimeState.effects.pendingTurnEndHeal = window.runtimeState.effects.pendingTurnEndHeal || {};
        window.runtimeState.effects.pendingTurnEndHeal[key] = atk;
      }
      return { handled: true, preventDefaultDsl: true };
    }

    return { handled: false };
  }

  function beforeTurnEndHook() {
    const m = window.state?.matchData;
    if (!m || m.status !== "playing") return;
    const owner = m.turnPlayer;
    const key = `${owner}:${m.round || 0}:${m.turn || 0}`;
    const pending = window.runtimeState?.effects?.pendingTurnEndHeal?.[key];
    if (!Number.isFinite(Number(pending)) || Number(pending) <= 0) return;
    healHp(owner, Number(pending));
    delete window.runtimeState.effects.pendingTurnEndHeal[key];
    if (typeof window.addGameLog === "function") {
      window.addGameLog(`[EFFECT] 吸血のターン終了時効果: ${owner} のHPを ${Number(pending)} 回復`);
    }
  }

  function installHooks() {
    if (!Array.isArray(window._beforeTurnEndHooks)) window._beforeTurnEndHooks = [];
    if (!window._beforeTurnEndHooks.includes(beforeTurnEndHook)) {
      window._beforeTurnEndHooks.push(beforeTurnEndHook);
    }
  }

  window.FirstEightCardEffects = {
    TARGET_IDS,
    resolveCardEffectById,
    resolveAttackTriggerForAttacker,
    installHooks
  };

  installHooks();
})();
