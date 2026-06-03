(function() {
  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

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
      game: {
        hp: makeStat(), pp: makeStat(), shield: makeStat(), atk: makeStat(),
        custom: { use: { attacker: 0, skill: 0 } }
      },
      turn: {
        hp: makeStat(), pp: makeStat(), shield: makeStat(), atk: makeStat(),
        custom: { use: { attacker: 0, skill: 0 } }
      }
    };
  }

  function ownerName(owner, state) {
    return String(state?.[owner]?.username || owner);
  }

  function createCardObj(cardData, owner) {
    return {
      id: cardData.id,
      name: cardData.name || cardData.id,
      profile: (window.CardCombatData?.getResolvedCardData?.(cardData.id) || cardData),
      dataset: {
        id: cardData.id,
        owner,
        zoneType: "",
        didDirectAttack: "0"
      },
      style: {}
    };
  }

  function createDefaultDebugState() {
    return {
      player1: { hp: 20, pp: 2, ppMax: 2, shield: 0, atk: 0, username: "You", deck: [], grantedEffects: [] },
      player2: { hp: 20, pp: 2, ppMax: 2, shield: 0, atk: 0, username: "Enemy", deck: [], grantedEffects: [] },
      matchData: { status: "playing", turnPlayer: "player1", round: 1, turn: 1 }
    };
  }

  function openCardDebugModal() {
    if (document.getElementById("cardDebugOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "cardDebugOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:120000;background:rgba(5,7,14,0.9);display:flex;align-items:stretch;justify-content:center;padding:16px;";

    const root = document.createElement("div");
    root.style.cssText = "width:min(1420px,100%);height:100%;background:#111827;border:1px solid #334155;border-radius:12px;display:grid;grid-template-columns:280px 1fr 340px;gap:10px;padding:10px;color:#e5e7eb;font-family:ui-sans-serif,system-ui;";

    root.innerHTML = `
      <section style="display:flex;flex-direction:column;gap:8px;min-height:0;">
        <h3 style="margin:0;font-size:16px;">カードデバッグ</h3>
        <div style="display:flex;gap:6px;">
          <button id="dbgClose" style="flex:1;padding:8px;background:#374151;color:#fff;border:0;border-radius:6px;cursor:pointer;">閉じる</button>
          <button id="dbgReset" style="flex:1;padding:8px;background:#0f766e;color:#fff;border:0;border-radius:6px;cursor:pointer;">リセット</button>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="dbgDraw" style="flex:1;padding:8px;background:#1d4ed8;color:#fff;border:0;border-radius:6px;cursor:pointer;">1枚ドロー</button>
          <button id="dbgShuffle" style="flex:1;padding:8px;background:#6d28d9;color:#fff;border:0;border-radius:6px;cursor:pointer;">山札再構築</button>
        </div>
        <label style="font-size:12px;color:#cbd5e1;">ターゲット</label>
        <select id="dbgTarget" style="padding:8px;border-radius:6px;background:#0b1220;color:#fff;border:1px solid #334155;">
          <option value="player">相手プレイヤー</option>
          <option value="goblin">ゴブリン</option>
          <option value="shadowhound">シャドウハウンド</option>
        </select>
        <label style="font-size:12px;color:#cbd5e1;">カード追加</label>
        <select id="dbgCardSelect" style="padding:8px;border-radius:6px;background:#0b1220;color:#fff;border:1px solid #334155;"></select>
        <button id="dbgAddHand" style="padding:8px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;">手札に追加</button>
        <div style="font-size:12px;color:#94a3b8;">手札/場/墓地/山札を1人で検証できます。</div>
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

      <section style="display:grid;grid-template-rows:auto 1fr auto;gap:8px;min-height:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0;font-size:14px;">記録データ / フローチャット</h4>
          <button id="dbgClearLog" style="padding:6px 10px;background:#334155;color:#fff;border:0;border-radius:6px;cursor:pointer;">クリア</button>
        </div>
        <div style="display:grid;grid-template-rows:220px 1fr;gap:8px;min-height:0;">
          <div id="dbgTrackerGrid" style="overflow:auto;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;"></div>
          <div id="dbgLog" style="overflow:auto;border:1px solid #334155;border-radius:8px;padding:8px;background:#0b1220;font-size:12px;line-height:1.5;"></div>
        </div>
        <div style="display:flex;gap:6px;">
          <input id="dbgChatInput" type="text" placeholder="メモ/チャット" style="flex:1;padding:8px;background:#0b1220;color:#fff;border:1px solid #334155;border-radius:6px;">
          <button id="dbgChatSend" style="padding:8px 12px;background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;">送信</button>
        </div>
      </section>
    `;

    overlay.appendChild(root);
    document.body.appendChild(overlay);

    const debug = {
      owner: "player1",
      target: "player",
      state: createDefaultDebugState(),
      zones: { hand: [], attacker: [], skill: [], grave: [], deck: [] },
      tracker: { player1: createTrackerNode(), player2: createTrackerNode() },
      logs: []
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

    function bumpTracker(owner, stat, before, after) {
      const nodeTurn = debug.tracker[owner].turn[stat];
      const nodeGame = debug.tracker[owner].game[stat];
      if (!nodeTurn || !nodeGame) return;
      const diff = Number(after) - Number(before);
      nodeTurn.lastAfter = after;
      nodeGame.lastAfter = after;
      if (diff > 0) {
        nodeTurn.incAmount += diff;
        nodeGame.incAmount += diff;
      }
      if (diff < 0) {
        nodeTurn.decAmount += Math.abs(diff);
        nodeGame.decAmount += Math.abs(diff);
      }
    }

    function moveCard(card, toZone) {
      ["hand", "attacker", "skill", "grave", "deck"].forEach((z) => {
        const idx = debug.zones[z].indexOf(card);
        if (idx >= 0) debug.zones[z].splice(idx, 1);
      });
      if (toZone === "hand") {
        card.dataset.zoneType = "";
      } else {
        card.dataset.zoneType = toZone;
      }
      debug.zones[toZone].push(card);
    }

    function getCurrentTargetOwner() {
      return debug.target === "player" ? "player2" : "player2";
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
        getMyRole: window.getMyRole
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
        card.dataset.owner = owner;
        moveCard(card, zoneType);
      };
      window.clearZoneMarker = (card) => { card.dataset.zoneType = ""; };
      window.organizeHands = () => {};
      window.organizeBattleZones = () => {};
      window.pushMyStateDebounced = () => {};
      window.update = () => {};
      window.getZoneCards = (owner, zoneType) => debug.zones[zoneType].filter((c) => (c.dataset.owner || "") === owner);
      window.getDeckCount = () => debug.zones.deck.length;
      window.getFieldContent = () => ({ querySelectorAll: () => [] });
      window.GameStatTracker = {
        resolvePath(path, owner) {
          return getByPath(debug.tracker[owner] || {}, path);
        }
      };

      try {
        return fn();
      } finally {
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
      }
    }

    function runCardEvent(card, eventName, extra = {}) {
      if (!window.EffectEngine || typeof window.EffectEngine.execute !== "function") return;
      const dsl = card.profile?.effectDsl;
      if (!dsl) return;
      withPatchedRuntime(() => {
        const res = window.EffectEngine.execute(dsl, {
          game: debug.state,
          sourceCard: card,
          sourceProfile: card.profile,
          owner: debug.owner,
          opponent: "player2",
          target: "player2",
          event: {
            name: eventName,
            zoneType: card.dataset.zoneType || "",
            targetOwner: getCurrentTargetOwner(),
            didDirectAttack: card.dataset.didDirectAttack === "1",
            ...extra
          }
        });
        log(`[FLOW] ${card.name} -> ${eventName} effects=${(res?.effects || []).length}`);
      });
    }

    function renderCardChip(card, zone) {
      const el = document.createElement("div");
      el.style.cssText = "border:1px solid #475569;border-radius:8px;padding:6px;background:#111827;min-width:120px;";
      const controls = [];
      if (zone === "hand") {
        controls.push(`<button data-act="toAttacker">ATK</button>`);
        controls.push(`<button data-act="toSkill">SKILL</button>`);
      }
      if (zone === "attacker") {
        controls.push(`<button data-act="direct">直接攻撃</button>`);
        controls.push(`<button data-act="toGrave">墓地へ</button>`);
      }
      if (zone === "skill") {
        controls.push(`<button data-act="toGrave">墓地へ</button>`);
      }
      if (zone === "grave" || zone === "deck") {
        controls.push(`<button data-act="toHand">手札</button>`);
      }
      el.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#f8fafc;">${card.name}</div>
        <div style="font-size:11px;color:#94a3b8;">${card.id}</div>
        <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">${controls.map((x) => x.replace("<button", '<button style="padding:3px 6px;font-size:11px;background:#334155;color:#fff;border:0;border-radius:4px;cursor:pointer;"')).join("")}</div>
      `;
      el.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          if (act === "toAttacker") {
            moveCard(card, "attacker");
            withPatchedRuntime(() => {
              debug.tracker[debug.owner].turn.custom.use.attacker += 1;
              debug.tracker[debug.owner].game.custom.use.attacker += 1;
            });
            runCardEvent(card, "onSummon");
          } else if (act === "toSkill") {
            moveCard(card, "skill");
            withPatchedRuntime(() => {
              debug.tracker[debug.owner].turn.custom.use.skill += 1;
              debug.tracker[debug.owner].game.custom.use.skill += 1;
            });
            runCardEvent(card, "onAttack");
          } else if (act === "toGrave") {
            runCardEvent(card, "onLeave", { didDirectAttack: card.dataset.didDirectAttack === "1" });
            if (card.dataset.zoneType === "attacker" || card.dataset.zoneType === "skill") moveCard(card, "grave");
          } else if (act === "toHand") {
            moveCard(card, "hand");
          } else if (act === "direct") {
            card.dataset.didDirectAttack = "1";
            runCardEvent(card, "onDirectAttack", { didDirectAttack: true });
            const targetName = debug.target === "player" ? ownerName("player2", debug.state) : (debug.target === "goblin" ? "ゴブリン" : "シャドウハウンド");
            const amount = Math.max(1, Number(card.profile?.attack || 0) + Number(debug.state.player1.atk || 0));
            if (debug.target === "player") {
              const before = Number(debug.state.player2.hp || 0);
              debug.state.player2.hp = Math.max(0, before - amount);
              bumpTracker("player2", "hp", before, debug.state.player2.hp);
              log(`[DIRECT] ${card.name} -> ${targetName} ${amount}ダメージ`);
            } else {
              log(`[DIRECT] ${card.name} -> ${targetName} ${amount}ダメージ（モンスター簡易ログ）`);
            }
            runCardEvent(card, "onLeave", { didDirectAttack: true });
            if (card.dataset.zoneType === "attacker") moveCard(card, "grave");
          }
          render();
        });
      });
      return el;
    }

    function renderTrackerGrid() {
      const box = root.querySelector("#dbgTrackerGrid");
      if (!box) return;
      const keys = [
        "turn.custom.use.attacker",
        "turn.custom.use.skill",
        "game.custom.use.attacker",
        "game.custom.use.skill",
        "turn.hp.lastAfter",
        "turn.hp.incAmount",
        "turn.hp.decAmount",
        "turn.pp.lastAfter",
        "turn.shield.lastAfter",
        "turn.atk.lastAfter"
      ];
      box.innerHTML = `
        <div style="font-size:11px;color:#93c5fd;margin-bottom:6px;">効果条件で使う記録値（手動編集）</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="text-align:left;padding:4px;border-bottom:1px solid #334155;">Path</th><th style="padding:4px;border-bottom:1px solid #334155;">You</th><th style="padding:4px;border-bottom:1px solid #334155;">Enemy</th></tr></thead>
          <tbody>
            ${keys.map((k) => `
              <tr>
                <td style="padding:4px;border-bottom:1px solid #1e293b;">${k}</td>
                <td style="padding:4px;border-bottom:1px solid #1e293b;"><input data-owner="player1" data-path="${k}" type="number" value="${Number(getByPath(debug.tracker.player1, k) || 0)}" style="width:100%;padding:4px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;"></td>
                <td style="padding:4px;border-bottom:1px solid #1e293b;"><input data-owner="player2" data-path="${k}" type="number" value="${Number(getByPath(debug.tracker.player2, k) || 0)}" style="width:100%;padding:4px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;"></td>
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
        debug.zones[zone].forEach((card) => el.appendChild(renderCardChip(card, zone)));
      });
      const deckCountEl = root.querySelector("#dbgDeckCount");
      if (deckCountEl) deckCountEl.textContent = String(debug.zones.deck.length);
      root.querySelector("#dbgDirectField").textContent = `ドラッグ/操作で「${debug.target === "player" ? ownerName("player2", debug.state) : (debug.target === "goblin" ? "ゴブリン" : "シャドウハウンド")}」に直接攻撃`;

      root.querySelector("#dbgP1hp").value = String(debug.state.player1.hp);
      root.querySelector("#dbgP2hp").value = String(debug.state.player2.hp);
      root.querySelector("#dbgP1pp").value = String(debug.state.player1.pp);
      root.querySelector("#dbgP2pp").value = String(debug.state.player2.pp);
      root.querySelector("#dbgP1shield").value = String(debug.state.player1.shield);
      root.querySelector("#dbgP2shield").value = String(debug.state.player2.shield);
      root.querySelector("#dbgP1atk").value = String(debug.state.player1.atk);
      root.querySelector("#dbgP2atk").value = String(debug.state.player2.atk);

      renderTrackerGrid();
    }

    function refillDeck() {
      debug.zones.deck = (window.CARD_DB || []).map((row) => createCardObj(row, "player1"));
      for (let i = debug.zones.deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [debug.zones.deck[i], debug.zones.deck[j]] = [debug.zones.deck[j], debug.zones.deck[i]];
      }
      log(`[SYSTEM] 山札を再構築 (${debug.zones.deck.length}枚)`);
      render();
    }

    const selector = root.querySelector("#dbgCardSelect");
    selector.innerHTML = (window.CARD_DB || []).map((c) => `<option value="${c.id}">${c.id} ${c.name || ""}</option>`).join("");

    root.querySelector("#dbgClose").onclick = () => overlay.remove();
    root.querySelector("#dbgReset").onclick = () => {
      debug.state = createDefaultDebugState();
      debug.zones = { hand: [], attacker: [], skill: [], grave: [], deck: [] };
      debug.tracker = { player1: createTrackerNode(), player2: createTrackerNode() };
      debug.logs = [];
      refillDeck();
    };
    root.querySelector("#dbgTarget").onchange = (e) => { debug.target = e.target.value; render(); };
    root.querySelector("#dbgShuffle").onclick = refillDeck;
    root.querySelector("#dbgDraw").onclick = () => {
      const c = debug.zones.deck.pop();
      if (!c) return;
      moveCard(c, "hand");
      log(`[DRAW] ${c.name}`);
      render();
    };
    root.querySelector("#dbgAddHand").onclick = () => {
      const id = selector.value;
      const row = (window.CARD_DB || []).find((x) => x.id === id);
      if (!row) return;
      const card = createCardObj(row, "player1");
      moveCard(card, "hand");
      log(`[ADD] 手札に追加 ${card.name}`);
      render();
    };
    root.querySelector("#dbgApplyStats").onclick = () => {
      const p1 = debug.state.player1;
      const p2 = debug.state.player2;
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
    root.querySelector("#dbgClearLog").onclick = () => { debug.logs = []; render(); };
    root.querySelector("#dbgChatSend").onclick = () => {
      const input = root.querySelector("#dbgChatInput");
      const text = String(input.value || "").trim();
      if (!text) return;
      log(`[CHAT] ${text}`);
      input.value = "";
    };

    refillDeck();
  }

  window.openCardDebugModal = openCardDebugModal;
})();
