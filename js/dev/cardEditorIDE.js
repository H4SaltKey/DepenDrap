(function() {
  const runtime = () => window.CardEffectRuntimeV2;
  const appRoot = document.getElementById("appRoot");
  const goHomeBtn = document.getElementById("goHomeBtn");
  const closeDevModeBtn = document.getElementById("closeDevModeBtn");

  const state = {
    view: "home",
    cards: [],
    selectedId: "",
    search: "",
    typeFilter: "all",
    attrFilter: "all",
    graph: { format: "dependrap.effectgraph.v2", nodes: [], edges: [] },
    dslText: "",
    dslError: "",
    selectedNodeIds: new Set(),
    selectedEdgeIds: new Set(),
    undoStack: [],
    redoStack: [],
    viewport: { x: 0, y: 0, scale: 1 },
    drag: null,
    selectionRect: null,
    contextMenuEl: null,
    connectFrom: "",
    replayCursor: -1,
    sim: null,
    simLastResult: null,
    logs: [],
    runtimeTimer: null,
    editorApi: null,
    cardResizeHandler: null
  };

  const NODE_LIBRARY = [
    { type: "trigger", category: "トリガー", label: "トリガー：登場時", data: { event: "OnPlay" } },
    { type: "trigger", category: "トリガー", label: "トリガー：攻撃時", data: { event: "OnAttack" } },
    { type: "trigger", category: "トリガー", label: "トリガー：直接攻撃時", data: { event: "OnDirectAttack" } },
    { type: "trigger", category: "トリガー", label: "トリガー：ダメージ時", data: { event: "OnDamage" } },
    { type: "trigger", category: "トリガー", label: "トリガー：ターン開始時", data: { event: "OnTurnStart" } },
    { type: "trigger", category: "トリガー", label: "トリガー：ターン終了時", data: { event: "OnTurnEnd" } },
    { type: "condition", category: "条件", label: "条件分岐", data: { left: "event.damage", op: ">", right: "0", expression: "event.damage > 0" } },
    { type: "condition", category: "条件", label: "条件分岐：このターン中の回数", data: { left: "history.event.OnAttack.count", op: ">=", right: "1", expression: "history.event.OnAttack.count >= 1" } },
    { type: "condition", category: "条件", label: "条件分岐：発動済みフラグ", data: { left: "flag.used_on_attack", op: "==", right: "1", expression: "flag.used_on_attack == 1" } },
    { type: "target", category: "対象", label: "対象指定", data: { target: "current_target" } },
    { type: "effect", category: "効果", label: "効果実行", data: { action: "draw", args: ["1"] } },
    { type: "effect", category: "効果", label: "効果実行：トリガー再発動", data: { action: "invoke_trigger", args: ["OnAttack", "1"] } },
    { type: "effect", category: "効果", label: "効果実行：効果を付与", data: { action: "add_effect", args: ["trigger=OnTurnStart;effect=draw", "1"] } },
    { type: "effect", category: "効果", label: "効果実行：効果を追記", data: { action: "append_effect", args: ["trigger=OnAttack;effect=damage", "1"] } },
    { type: "effect", category: "効果", label: "効果実行：選択式", data: { action: "choose_one", args: ["effect=heal", "1|effect=damage", "1"] } },
    { type: "modifier", category: "修飾", label: "効果修飾", data: { action: "once_per_turn", args: [] } },
    { type: "modifier", category: "修飾", label: "効果修飾：場にいる間1回", data: { action: "once_while_on_field", args: [] } },
    { type: "modifier", category: "修飾", label: "効果修飾：重複不可", data: { action: "non_stackable", args: [] } },
    { type: "end", category: "フロー", label: "終了", data: {} },
    { type: "variable", category: "変数", label: "変数", data: { name: "x", value: "0" } },
    { type: "variable", category: "変数", label: "変数：加算", data: { name: "x", value: "x+1" } },
    { type: "history", category: "履歴", label: "履歴参照", data: { expression: "history.event.OnDraw.count >= 1" } },
    { type: "math", category: "計算", label: "数式", data: { expression: "add 1 2" } },
    { type: "custom", category: "カスタム", label: "カスタム", data: { note: "" } }
  ];

  const DSL_KEYWORDS = [
    "trigger", "if", "target", "effect", "modifier", "end",
    "OnPlay", "OnAttack", "OnDirectAttack", "OnBeforeAttackEffect", "OnAfterAttackEffect",
    "OnTurnStart", "OnTurnEnd", "OnLeaveField", "OnReturnHand", "OnPenetrateDamage", "OnSkillUsed",
    "draw", "damage", "penetrate_damage", "extra_damage", "extra_penetrate_damage", "heal", "add_pp", "set_pp",
    "add_status", "remove_status", "add_effect", "append_effect", "invoke_effect", "invoke_trigger", "choose_one",
    "repeat", "once_per_turn", "once_while_on_field", "non_stackable",
    "current_target", "self", "opponent", "field_card", "self_and_current_target"
  ];

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${String(msg)}`;
    state.logs.push(line);
    if (state.logs.length > 400) state.logs.splice(0, state.logs.length - 400);
    const box = document.getElementById("ideLogViewer");
    if (box) {
      box.textContent = state.logs.slice(-120).join("\n");
      box.scrollTop = box.scrollHeight;
    }
  }

  function htmlEscape(v) {
    return String(v || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function compactText(v, fallback = "-") {
    const s = String(v == null ? "" : v).trim();
    return s || fallback;
  }

  function summarizeOps(rows, limit = 3) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return "(none)";
    const text = list.slice(0, limit).map((row) => {
      const action = compactText(row?.action, "noop");
      const args = Array.isArray(row?.args) ? row.args.map((x) => String(x)).join(" ") : "";
      return args ? `${action} ${args}` : action;
    });
    if (list.length > limit) text.push(`...+${list.length - limit}`);
    return text.join(" | ");
  }

  function formatRuntimeInspectorSnapshot(snap) {
    const lines = [];
    lines.push(`pending: ${(snap.pendingEffects || []).length}`);
    lines.push(`stack: ${(snap.effectStack || []).length}`);
    lines.push(`persistent: ${(snap.persistentEffects || []).length}`);
    lines.push(`temporary: ${(snap.temporaryEffects || []).length}`);
    lines.push(`events: ${(snap.registeredEvents || []).map((x) => `${x.eventName}:${x.subscribers}`).join(", ") || "none"}`);
    lines.push(`flags: ${(snap.activatedFlags || []).length}`);
    lines.push(`inherited: ${(snap.inheritedLinks || []).length}`);
    lines.push("");

    const subscriberDetails = Array.isArray(snap.eventSubscriberDetails) ? snap.eventSubscriberDetails : [];
    lines.push("[Event Subscriptions]");
    if (subscriberDetails.length) {
      subscriberDetails.forEach((row) => {
        const labels = (row.subscribers || []).slice(0, 3).map((s) => compactText(s?.label || s?.instanceId || s?.sourceCardId, "?"));
        const suffix = (row.subscribers || []).length > 3 ? ` ...+${(row.subscribers || []).length - 3}` : "";
        lines.push(`${row.eventName}: ${(row.subscribers || []).length}${labels.length ? ` [${labels.join(", ")}]${suffix}` : ""}`);
      });
    } else {
      const byEvent = snap.effectInstancesByEvent && typeof snap.effectInstancesByEvent === "object" ? snap.effectInstancesByEvent : {};
      const eventNames = Object.keys(byEvent).sort();
      if (eventNames.length === 0) {
        lines.push("none");
      } else {
        eventNames.forEach((eventName) => {
          const rows = Array.isArray(byEvent[eventName]) ? byEvent[eventName] : [];
          const cards = rows.slice(0, 3).map((x) => compactText(x.sourceCardId, "?"));
          const suffix = rows.length > 3 ? ` ...+${rows.length - 3}` : "";
          lines.push(`${eventName}: ${rows.length}${cards.length ? ` [${cards.join(", ")}]${suffix}` : ""}`);
        });
      }
    }
    lines.push("");

    lines.push("[Activated Flags]");
    if (Array.isArray(snap.activatedFlags) && snap.activatedFlags.length) {
      lines.push(snap.activatedFlags.slice(0, 20).join(", "));
      if (snap.activatedFlags.length > 20) lines.push(`...+${snap.activatedFlags.length - 20}`);
    } else {
      lines.push("none");
    }
    lines.push("");

    lines.push("[Inherited Links]");
    if (Array.isArray(snap.inheritedLinks) && snap.inheritedLinks.length) {
      snap.inheritedLinks.slice(0, 20).forEach((row) => {
        lines.push(`${compactText(row.instanceId)} <= ${compactText(row.inheritedFrom)}`);
      });
      if (snap.inheritedLinks.length > 20) lines.push(`...+${snap.inheritedLinks.length - 20}`);
    } else {
      lines.push("none");
    }
    lines.push("");

    lines.push("[Effect Instances]");
    const instances = Array.isArray(snap.effectInstances) ? snap.effectInstances : [];
    if (!instances.length) {
      lines.push("none");
    } else {
      instances.slice(0, 24).forEach((row, idx) => {
        const head = `${idx + 1}. ${compactText(row.instanceId)} event=${compactText(row.event)} owner=${compactText(row.owner)} card=${compactText(row.sourceCardId)}`;
        const flags = `activated=${row.activated ? "Y" : "N"} permanent=${row.permanent ? "Y" : "N"} inheritedFrom=${compactText(row.inheritedFrom, "-")}`;
        lines.push(head);
        lines.push(`   ${flags}`);
        lines.push(`   condition: ${compactText(row.condition, "(none)")}`);
        lines.push(`   target: ${compactText(row.target, "self")}`);
        lines.push(`   effects: ${summarizeOps(row.effects)}`);
        lines.push(`   modifiers: ${summarizeOps(row.modifiers)}`);
      });
      if (instances.length > 24) lines.push(`...+${instances.length - 24}`);
    }
    lines.push("");

    if (snap.lastSnapshot) {
      lines.push("[Last Event]");
      lines.push(`event=${compactText(snap.lastSnapshot.event)}`);
      lines.push(`payload=${JSON.stringify(snap.lastSnapshot.payload || {})}`);
    }

    return lines.join("\n");
  }

  function formatSimulatorResult(row) {
    if (!row) return "(no simulation yet)";
    const lines = [];
    lines.push(`card: ${compactText(row.cardId)}`);
    lines.push(`event: ${compactText(row.eventName)} / historyId: ${compactText(row.historyRowId)}`);
    const exec = row.execution || null;
    if (!exec) {
      lines.push("execution: unavailable");
      return lines.join("\n");
    }
    if (exec.error) {
      lines.push(`exception: ${compactText(exec.error.message || exec.error)}`);
      return lines.join("\n");
    }
    if (exec.dslUnimplemented) {
      lines.push("dsl: 未実装");
      return lines.join("\n");
    }
    lines.push(`trigger: ${compactText(exec.triggerName)} (${compactText(exec.triggerEvent)})`);
    lines.push(`matchedTriggers: ${(exec.triggerReports || []).length}`);

    const triggerReports = Array.isArray(exec.triggerReports) ? exec.triggerReports : [];
    if (!triggerReports.length) {
      lines.push("trigger report: 一致なし");
    } else {
      triggerReports.forEach((t, idx) => {
        lines.push(`- trigger#${idx + 1} ${compactText(t.on)} cond=${t.triggerConditionPassed ? "pass" : "fail"} bundle=${t.bundleConditionPassed ? "pass" : "fail"}`);
        lines.push(`  triggerReason: ${compactText(t.triggerConditionReason, "none")}`);
        lines.push(`  bundleReason: ${compactText(t.bundleConditionReason, "none")}`);
        const effects = Array.isArray(t.effects) ? t.effects : [];
        if (!effects.length) {
          lines.push("  effects: none");
        } else {
          effects.forEach((e) => {
            const status = e.error ? "error" : (e.applied ? "executed" : "skipped");
            const reason = compactText(e.skippedReason || (e.error ? e.error.message : ""), "");
            lines.push(`  effect#${compactText(e.order)} ${compactText(e.type)} => ${status}${reason ? ` (${reason})` : ""}`);
          });
        }
      });
    }

    const flat = Array.isArray(exec.effects) ? exec.effects : [];
    const executed = flat.filter((e) => e && e.applied === true).length;
    const skipped = flat.filter((e) => e && e.applied !== true).length;
    lines.push(`effects summary: executed=${executed}, skipped=${skipped}, total=${flat.length}`);
    return lines.join("\n");
  }

  function isSupportCard(card) {
    return String(card?.type || "").trim() === "サポート";
  }

  function attackDisplay(card) {
    if (isSupportCard(card)) return "ー";
    const n = Math.max(0, Math.floor(Number(card?.attack || 0)));
    return String(Number.isFinite(n) ? n : 0);
  }

  function attackInputValue(card) {
    const n = Math.max(0, Math.floor(Number(card?.attack || 0)));
    return Number.isFinite(n) ? n : 0;
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function nodeById(id) {
    return (state.graph.nodes || []).find((n) => n.id === id) || null;
  }

  function edgeById(id) {
    return (state.graph.edges || []).find((e) => e.id === id) || null;
  }

  function selectedCard() {
    return state.cards.find((c) => c.id === state.selectedId) || null;
  }

  function ensureV2ForCard(card) {
    if (!card || !runtime()) return;

    if ((!card.effectGraph || !Array.isArray(card.effectGraph.nodes)) && card.effectBlocks) {
      const migrated = runtime().migrateLegacyBlocks(card.effectBlocks);
      if (migrated?.ok) {
        card.effectGraph = migrated.graph;
        if (!String(card.effectDslText || "").trim()) card.effectDslText = migrated.dslText;
        log(`旧ブロックを移行: ${card.id}`);
      }
    }

    if ((!card.effectGraph || !Array.isArray(card.effectGraph.nodes)) && String(card.effectDslText || "").trim()) {
      const ast = runtime().parseDslText(card.effectDslText);
      card.effectGraph = runtime().astToGraph(ast);
    }

    if (!String(card.effectDslText || "").trim() && card.effectGraph && Array.isArray(card.effectGraph.nodes)) {
      const ast = runtime().graphToAst(card.effectGraph);
      card.effectDslText = runtime().toDslText(ast);
    }

    if (!card.effectGraph || !Array.isArray(card.effectGraph.nodes)) {
      card.effectGraph = { format: runtime().GRAPH_FORMAT, nodes: [], edges: [] };
    }
    if (!card.effectDslText) card.effectDslText = "";
  }

  function pushUndo(reason) {
    state.undoStack.push({
      reason,
      graph: clone(state.graph),
      dslText: state.dslText,
      selectedNodeIds: Array.from(state.selectedNodeIds),
      selectedEdgeIds: Array.from(state.selectedEdgeIds),
      viewport: clone(state.viewport)
    });
    if (state.undoStack.length > 200) state.undoStack.splice(0, state.undoStack.length - 200);
    state.redoStack = [];
  }

  function restoreSnapshot(snapshot) {
    state.graph = clone(snapshot.graph);
    state.dslText = snapshot.dslText;
    state.selectedNodeIds = new Set(snapshot.selectedNodeIds || []);
    state.selectedEdgeIds = new Set(snapshot.selectedEdgeIds || []);
    state.viewport = clone(snapshot.viewport || { x: 0, y: 0, scale: 1 });
    renderAll();
  }

  function undo() {
    if (!state.undoStack.length) return;
    const cur = {
      graph: clone(state.graph),
      dslText: state.dslText,
      selectedNodeIds: Array.from(state.selectedNodeIds),
      selectedEdgeIds: Array.from(state.selectedEdgeIds),
      viewport: clone(state.viewport)
    };
    const snap = state.undoStack.pop();
    state.redoStack.push(cur);
    restoreSnapshot(snap);
    log(`Undo: ${snap.reason || "change"}`);
  }

  function redo() {
    if (!state.redoStack.length) return;
    const cur = {
      graph: clone(state.graph),
      dslText: state.dslText,
      selectedNodeIds: Array.from(state.selectedNodeIds),
      selectedEdgeIds: Array.from(state.selectedEdgeIds),
      viewport: clone(state.viewport)
    };
    const snap = state.redoStack.pop();
    state.undoStack.push(cur);
    restoreSnapshot(snap);
    log("Redo");
  }

  function syncDslFromGraph() {
    if (!runtime()) return;
    try {
      const ast = runtime().graphToAst(state.graph);
      state.dslText = runtime().toDslText(ast);
      state.dslError = "";
      const c = selectedCard();
      if (c) c.effectDslText = state.dslText;
    } catch (e) {
      state.dslError = `Graph変換エラー: ${String(e?.message || e)}`;
    }
  }

  function syncGraphFromDsl() {
    if (!runtime()) return;
    try {
      const ast = runtime().parseDslText(state.dslText || "");
      const next = runtime().astToGraph(ast);
      state.graph = next;
      state.dslError = "";
      state.selectedNodeIds = new Set();
      state.selectedEdgeIds = new Set();
      const c = selectedCard();
      if (c) c.effectGraph = clone(next);
    } catch (e) {
      state.dslError = `DSL解析エラー: ${String(e?.message || e)}`;
    }
  }

  function applyCardToEditor(card) {
    if (!card) return;
    ensureV2ForCard(card);
    state.graph = clone(card.effectGraph);
    state.dslText = String(card.effectDslText || "");
    state.selectedNodeIds = new Set();
    state.selectedEdgeIds = new Set();
    state.undoStack = [];
    state.redoStack = [];
    state.viewport = { x: 0, y: 0, scale: 1 };
  }

  function saveEditorToCard(card) {
    if (!card || !runtime()) return;
    card.effectGraph = clone(state.graph);
    card.effectDslText = String(state.dslText || "").trim();
    try {
      const ast = runtime().parseDslText(card.effectDslText);
      card.effectDsl = runtime().compileAstToDslV1(ast);
    } catch (_) {
      // DSLエラー時は既存 effectDsl を維持
    }
  }

  function filteredCards() {
    const q = state.search.trim().toLowerCase();
    return state.cards.filter((c) => {
      if (state.typeFilter !== "all" && String(c.type || "") !== state.typeFilter) return false;
      if (state.attrFilter !== "all" && String(c.attribute || "") !== state.attrFilter) return false;
      if (!q) return true;
      const src = [c.id, c.name, c.type, c.attribute, c.effectText, Array.isArray(c.tags) ? c.tags.join(" ") : c.tags]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return src.includes(q);
    }).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: "base" }));
  }

  function createNewCardRow() {
    const next = generateCardId(state.cards);
    return {
      id: next,
      image: "",
      name: "",
      attribute: "近接",
      type: "アタッカー",
      attack: 0,
      cost: 0,
      causalRate: 0,
      effectText: "",
      effectDslText: "",
      effectGraph: { format: runtime()?.GRAPH_FORMAT || "dependrap.effectgraph.v2", nodes: [], edges: [] },
      effectDsl: { format: "dependrap.dsl.v1", triggers: [] },
      effectBlocks: null,
      tags: []
    };
  }

  function buildHomeView() {
    const root = document.createElement("div");
    root.className = "devHome";
    root.innerHTML = `
      <section class="devCard">
        <h2>Developer Home</h2>
        <p>カードエディタを専用IDEとして分離しました。既存資産を壊さず Visual Node / DSL / 旧ブロックを相互変換できます。</p>
        <div class="actionRow">
          <button id="openCardEditorBtn">カードエディタを開く</button>
          <button id="openBatchBtn">カード一括作成プロトコル</button>
          <button id="openPatchBtn">パッチノート管理</button>
          <button id="openPresetBtn">ステータスプリセット管理</button>
        </div>
      </section>
      <section class="devCard">
        <h3>運用メモ</h3>
        <p>旧ブロックシステムは互換レイヤーとして保持。メイン導線はNode/DSL編集です。</p>
      </section>
      <div id="cardEditorEntryModal" style="display:none;position:fixed;inset:0;background:rgba(1,6,14,0.84);z-index:80;align-items:center;justify-content:center;padding:20px;">
        <div style="width:min(920px, 100%);max-height:88vh;overflow:auto;background:#102038;border:1px solid #355985;border-radius:12px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="font-weight:700;">カードエディタ開始</div>
            <button class="ideSmallBtn" id="closeCardEditorEntryBtn">閉じる</button>
          </div>
          <div class="actionRow" style="margin-top:10px;">
            <button id="entryCreateNewBtn">新規作成</button>
            <button id="entryEditExistingBtn">編集</button>
          </div>
          <div id="entryEditArea" style="display:none;margin-top:12px;">
            <input id="entryEditSearch" placeholder="編集するカードを検索: ID / 名前 / タグ / 効果">
            <div id="entryEditList" class="cardList" style="margin-top:8px;max-height:58vh;overflow:auto;"></div>
          </div>
        </div>
      </div>
    `;

    function renderEntryEditList(keyword) {
      const list = root.querySelector("#entryEditList");
      if (!list) return;
      const q = String(keyword || "").trim().toLowerCase();
      const rows = state.cards.filter((card) => {
        if (!q) return true;
        const text = [
          card.id, card.name, card.type, card.attribute,
          Array.isArray(card.tags) ? card.tags.join(" ") : card.tags,
          card.effectText
        ].map((x) => String(x || "").toLowerCase()).join(" ");
        return text.includes(q);
      }).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: "base" }));
      list.innerHTML = "";
      if (!rows.length) {
        list.innerHTML = `<div style="color:#9cb7dc;font-size:12px;padding:8px 2px;">一致するカードがありません</div>`;
        return;
      }
      rows.forEach((card) => {
        const btn = document.createElement("button");
        btn.className = "cardRowBtn";
        btn.innerHTML = `<div style="font-weight:700;">${htmlEscape(card.id)} - ${htmlEscape(card.name || "(no name)")}</div><div style="font-size:11px;color:#96b3dd;">${htmlEscape(card.type || "-")} / ${htmlEscape(card.attribute || "-")} / ATK:${attackDisplay(card)}</div>`;
        btn.addEventListener("click", () => {
          state.selectedId = card.id;
          const modal = root.querySelector("#cardEditorEntryModal");
          if (modal) modal.style.display = "none";
          mountView("cardEditor");
        });
        list.appendChild(btn);
      });
    }

    root.querySelector("#openCardEditorBtn")?.addEventListener("click", () => {
      const modal = root.querySelector("#cardEditorEntryModal");
      const editArea = root.querySelector("#entryEditArea");
      const search = root.querySelector("#entryEditSearch");
      if (!modal) return;
      modal.style.display = "flex";
      if (editArea) editArea.style.display = "none";
      if (search) search.value = "";
    });
    root.querySelector("#closeCardEditorEntryBtn")?.addEventListener("click", () => {
      const modal = root.querySelector("#cardEditorEntryModal");
      if (modal) modal.style.display = "none";
    });
    root.querySelector("#cardEditorEntryModal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
    });
    root.querySelector("#entryCreateNewBtn")?.addEventListener("click", () => {
      const card = createNewCardRow();
      state.cards.push(card);
      state.selectedId = card.id;
      const modal = root.querySelector("#cardEditorEntryModal");
      if (modal) modal.style.display = "none";
      mountView("cardEditor");
    });
    root.querySelector("#entryEditExistingBtn")?.addEventListener("click", () => {
      const editArea = root.querySelector("#entryEditArea");
      if (editArea) editArea.style.display = "block";
      renderEntryEditList("");
    });
    root.querySelector("#entryEditSearch")?.addEventListener("input", (e) => {
      renderEntryEditList(e.target.value || "");
    });
    root.querySelector("#openBatchBtn")?.addEventListener("click", () => {
      if (typeof window.openCardBatchUploader === "function") window.openCardBatchUploader();
      else log("openCardBatchUploader が未ロードです");
    });
    root.querySelector("#openPatchBtn")?.addEventListener("click", () => {
      if (typeof window.openPatchNotesEditor === "function") window.openPatchNotesEditor();
      else log("openPatchNotesEditor が未ロードです");
    });
    root.querySelector("#openPresetBtn")?.addEventListener("click", () => {
      if (typeof window.openPresetStorageUI === "function") window.openPresetStorageUI();
      else log("openPresetStorageUI が未ロードです");
    });

    return {
      el: root,
      mount() {},
      unmount() {}
    };
  }

  function buildCardEditorView() {
    const root = document.createElement("div");
    root.className = "cardIde";
    root.innerHTML = `
      <div class="cardIdeMain">
        <section class="idePanel cardVisualPanel">
          <div class="idePanelHeader">
            <span>Card Preview</span>
            <div style="display:flex;gap:6px;align-items:center;">
              <div class="cardMenuWrap">
                <button class="ideSmallBtn" id="openCardMenuBtn">カードメニュー</button>
                <div class="cardMenuPopup" id="cardMenuPopup" style="display:none;">
                  <button class="ideSmallBtn" id="saveCardsTopBtn">保存</button>
                  <button class="ideSmallBtn" id="openCardPickerBtn">カード選択</button>
                  <button class="ideSmallBtn" id="ideAddCardBtn">追加</button>
                  <button class="ideSmallBtn danger" id="ideDeleteCardBtn">削除</button>
                </div>
              </div>
            </div>
          </div>
          <div class="idePanelBody">
            <div class="cardVisualCanvas" id="cardVisualCanvas">
              <div id="currentCardBadge" class="cardMetaBadge">未選択</div>
              <div class="cardVisualFrame">
                <div class="cardVisualImage cardHotspot" data-card-field="image" data-hover-label="カード画像">
                  <img id="cardArtImage" alt="card art">
                </div>
                <div class="cardVisualBorder cardHotspot" data-card-field="frame" data-hover-label="カード外枠"></div>
                <div class="cardVisualType cardHotspot" data-card-field="type" data-hover-label="種別"></div>
                <div class="cardVisualAttack cardHotspot" data-card-field="attack" data-hover-label="攻撃力"></div>
                <div class="cardVisualAttr cardHotspot" data-card-field="attribute" data-hover-label="属性(アイコン)"><img id="cardAttrIcon" alt="attribute"></div>
                <div class="cardVisualName cardHotspot" data-card-field="name" data-hover-label="カード名"></div>
                <div class="cardVisualText cardHotspot" data-card-field="effectText" data-hover-label="効果テキスト"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="idePanel">
          <div class="idePanelHeader">
            <span>Visual Node Editor</span>
            <div style="display:flex;gap:6px;">
              <button class="ideSmallBtn" id="graphUndoBtn">Undo</button>
              <button class="ideSmallBtn" id="graphRedoBtn">Redo</button>
              <button class="ideSmallBtn" id="graphAutoConnectBtn">Connect</button>
              <button class="ideSmallBtn" id="graphFitBtn">Fit</button>
            </div>
          </div>
          <div class="idePanelBody tight">
            <div class="nodeCanvasWrap" id="nodeCanvasWrap">
              <div class="nodeViewport" id="nodeViewport">
                <svg class="edgeLayer" id="edgeLayer"></svg>
                <div class="nodeLayer" id="nodeLayer"></div>
              </div>
            </div>
          </div>
        </section>

        <div class="rightStack">
          <section class="idePanel">
            <div class="idePanelHeader">
              <span>DSL Editor</span>
              <button class="ideSmallBtn" id="dslCompleteBtn">補完(Ctrl+Space)</button>
            </div>
            <div class="idePanelBody">
              <div class="dslEditor">
                <textarea id="dslEditorArea" spellcheck="false"></textarea>
                <div class="dslMeta">
                  <span class="chip" id="dslLineInfo">line:1</span>
                  <span class="chip" id="dslTokenInfo">tokens:0</span>
                  <span class="dslError" id="dslError"></span>
                </div>
                <details id="dslPreviewDetails">
                  <summary style="cursor:pointer;color:#9fc0ec;font-size:12px;">DSLテキストプレビュー（クリックで展開）</summary>
                  <div class="dslPreview" id="dslHighlight"></div>
                </details>
              </div>
              <div id="dslSuggestBox" style="display:none; margin-top:6px; border:1px solid #355a88; border-radius:8px; padding:6px; background:#0d1a2f;"></div>
            </div>
          </section>
        </div>
      </div>

      <div class="logGridBottom">
        <section class="idePanel">
          <div class="idePanelHeader"><span>Card Simulator</span><button class="ideSmallBtn" id="simApplyBtn">適用</button></div>
          <div class="idePanelBody">
            <div class="simForm" id="simForm">
              <div class="formRow2">
                <input id="simHp" type="number" value="20" placeholder="HP">
                <input id="simPp" type="number" value="2" placeholder="PP">
              </div>
              <div class="formRow2">
                <input id="simTurn" type="number" value="1" placeholder="ターン">
                <select id="simEvent"><option>OnPlay</option><option>OnAttack</option><option>OnDamage</option><option>OnDraw</option><option>OnTurnEnd</option></select>
              </div>
              <div class="simActionRow">
                <button id="simRunBtn" class="cardActionBtn">イベント実行</button>
                <button id="simResetBtn" class="cardActionBtn">リセット</button>
                <button id="saveCardsBtn" class="cardActionBtn">cards.json保存</button>
              </div>
              <div class="logList" id="simResultView" style="margin-top:8px;min-height:112px;"></div>
            </div>
          </div>
        </section>
        <section class="idePanel">
          <div class="idePanelHeader">
            <span>Inspector</span>
          </div>
          <div class="idePanelBody">
            <div class="inspectorForm" id="nodeInspector"></div>
          </div>
        </section>
      </div>

      <div class="ideDrawerRail">
        <button class="drawerTab" data-drawer-target="eventEngine">Event Engine</button>
        <button class="drawerTab" data-drawer-target="runtimeInspector">Runtime Inspector</button>
        <button class="drawerTab" data-drawer-target="replayDebugger">Replay Debugger</button>
        <button class="drawerTab" data-drawer-target="logViewer">Log Viewer</button>
        <button class="drawerTab" data-drawer-target="outputPreview">Output Preview</button>
      </div>
      <div id="utilityDrawerModal" style="display:none;position:fixed;inset:0;z-index:76;background:rgba(3,9,18,0.82);align-items:center;justify-content:flex-end;padding:14px;">
        <section class="idePanel utilityDrawerPanel">
          <div class="idePanelHeader">
            <span id="utilityDrawerTitle">Viewer</span>
            <button class="ideSmallBtn" id="closeUtilityDrawerBtn">閉じる</button>
          </div>
          <div class="idePanelBody">
            <div id="drawer-eventEngine" class="drawerPane" style="display:none;">
              <div class="simActionRow" style="margin-bottom:8px;"><button class="ideSmallBtn" id="emitOnPlayBtn">OnPlay発火</button></div>
              <div class="logList" id="eventEngineViewer"></div>
            </div>
            <div id="drawer-runtimeInspector" class="drawerPane" style="display:none;">
              <div class="simActionRow" style="margin-bottom:8px;"><button class="ideSmallBtn" id="refreshRuntimeBtn">Refresh</button></div>
              <div class="logList" id="runtimeInspectorView"></div>
            </div>
            <div id="drawer-replayDebugger" class="drawerPane" style="display:none;">
              <div class="simActionRow" style="margin-bottom:8px;"><button class="ideSmallBtn" id="replayPrevBtn">◀</button><button class="ideSmallBtn" id="replayNextBtn">▶</button></div>
              <div class="logList" id="replayView"></div>
            </div>
            <div id="drawer-logViewer" class="drawerPane" style="display:none;">
              <div class="simActionRow" style="margin-bottom:8px;"><button class="ideSmallBtn" id="clearLogBtn">Clear</button></div>
              <pre id="ideLogViewer" style="margin:0; white-space:pre-wrap; font-size:11px;"></pre>
            </div>
            <div id="drawer-outputPreview" class="drawerPane" style="display:none;">
              <div class="simActionRow" style="margin-bottom:8px;"><button class="ideSmallBtn" id="rebuildOutputBtn">再生成</button></div>
              <div class="logList" id="outputPreview"></div>
            </div>
          </div>
        </section>
      </div>

      <div id="cardPickerModal" style="display:none;position:fixed;inset:0;z-index:70;background:rgba(2,7,15,0.86);align-items:center;justify-content:center;padding:20px;">
        <div style="width:min(920px, 100%);max-height:88vh;overflow:auto;background:#111f34;border:1px solid #32517d;border-radius:12px;padding:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="font-weight:700;">編集カードを選択</div>
            <button class="ideSmallBtn" id="closeCardPickerBtn">閉じる</button>
          </div>
          <div style="margin-top:10px;">
            <input id="cardPickerSearch" placeholder="検索: ID / 名前 / タグ / 効果">
          </div>
          <div id="cardPickerList" class="cardList" style="margin-top:10px;max-height:62vh;overflow:auto;"></div>
        </div>
      </div>

      <div id="nodeConfigModal" style="display:none;position:fixed;inset:0;z-index:72;background:rgba(1,8,18,0.86);align-items:center;justify-content:center;padding:20px;">
        <div style="width:min(560px, 100%);max-height:86vh;overflow:auto;background:#0f2037;border:1px solid #37608f;border-radius:12px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div id="nodeConfigTitle" style="font-weight:700;">ノード設定</div>
            <button class="ideSmallBtn" id="closeNodeConfigBtn">閉じる</button>
          </div>
          <div id="nodeConfigForm" class="inspectorForm" style="margin-top:10px;"></div>
          <div class="simActionRow" style="margin-top:12px;">
            <button class="ideSmallBtn" id="saveNodeConfigBtn">確定</button>
            <button class="ideSmallBtn danger" id="cancelNodeConfigBtn">キャンセル</button>
          </div>
        </div>
      </div>

      <div id="cardFieldModal" style="display:none;position:fixed;inset:0;z-index:74;background:rgba(2,9,20,0.86);align-items:center;justify-content:center;padding:20px;">
        <div style="width:min(520px, 100%);max-height:82vh;overflow:auto;background:#10223b;border:1px solid #3f6492;border-radius:12px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div id="cardFieldTitle" style="font-weight:700;">カード設定</div>
            <button class="ideSmallBtn" id="closeCardFieldBtn">閉じる</button>
          </div>
          <div id="cardFieldForm" class="inspectorForm" style="margin-top:10px;"></div>
          <div class="simActionRow" style="margin-top:12px;">
            <button class="ideSmallBtn" id="saveCardFieldBtn">保存</button>
            <button class="ideSmallBtn danger" id="cancelCardFieldBtn">キャンセル</button>
          </div>
        </div>
      </div>
    `;

    let raf = 0;
    let nodeConfigCtx = null;
    let cardFieldCtx = null;
    let activeDrawer = "";

    const TRIGGER_EVENT_OPTIONS = [
      { value: "OnPlay", label: "登場時" },
      { value: "OnAttack", label: "攻撃時" },
      { value: "OnDirectAttack", label: "直接攻撃時" },
      { value: "OnBeforeAttackEffect", label: "攻撃時効果の発動前" },
      { value: "OnAfterAttackEffect", label: "攻撃時効果の発動後" },
      { value: "OnDamage", label: "ダメージ時" },
      { value: "OnPenetrateDamage", label: "貫通ダメージ時" },
      { value: "OnHeal", label: "回復時" },
      { value: "OnDraw", label: "ドロー時" },
      { value: "OnDiscard", label: "手札破棄時" },
      { value: "OnSkillUsed", label: "スキル使用時" },
      { value: "OnBeforeLeaveField", label: "退場直前" },
      { value: "OnLeaveField", label: "退場時" },
      { value: "OnReturnHand", label: "手札へ戻る時" },
      { value: "OnTurnStart", label: "ターン開始時" },
      { value: "OnTurnEnd", label: "ターン終了時" },
      { value: "OnEffectAdded", label: "効果付与時" },
      { value: "OnEffectRemoved", label: "効果除去時" },
      { value: "custom", label: "カスタムイベント" }
    ];

    const TARGET_OPTIONS = [
      { value: "self", label: "自分" },
      { value: "current_target", label: "現在のターゲット" },
      { value: "opponent", label: "相手プレイヤー" },
      { value: "field_card", label: "場のカード" },
      { value: "hand_random", label: "手札ランダム1枚" },
      { value: "deck_top", label: "山札の上" },
      { value: "self_and_current_target", label: "自分と現在ターゲット" },
      { value: "custom", label: "自由指定" }
    ];

    const EFFECT_ACTION_OPTIONS = [
      { value: "draw", label: "draw" },
      { value: "damage", label: "damage" },
      { value: "penetrate_damage", label: "penetrate_damage" },
      { value: "extra_damage", label: "extra_damage" },
      { value: "extra_penetrate_damage", label: "extra_penetrate_damage" },
      { value: "heal", label: "heal" },
      { value: "add_pp", label: "add_pp" },
      { value: "set_pp", label: "set_pp" },
      { value: "add_status", label: "add_status" },
      { value: "remove_status", label: "remove_status" },
      { value: "set_flag", label: "set_flag" },
      { value: "clear_flag", label: "clear_flag" },
      { value: "move_to_grave", label: "move_to_grave" },
      { value: "return_to_hand", label: "return_to_hand" },
      { value: "return_to_deck", label: "return_to_deck" },
      { value: "add_effect", label: "add_effect" },
      { value: "remove_effect", label: "remove_effect" },
      { value: "append_effect", label: "append_effect" },
      { value: "override_effect", label: "override_effect" },
      { value: "invoke_effect", label: "invoke_effect" },
      { value: "invoke_trigger", label: "invoke_trigger" },
      { value: "set_var", label: "set_var" },
      { value: "add_var", label: "add_var" },
      { value: "copy_last_value", label: "copy_last_value" },
      { value: "choose_one", label: "choose_one" },
      { value: "repeat", label: "repeat" },
      { value: "once_while_on_field", label: "once_while_on_field" },
      { value: "non_stackable", label: "non_stackable" },
      { value: "custom", label: "custom" }
    ];

    const ACTION_LABEL_MAP = {
      draw: "ドロー",
      damage: "ダメージ",
      penetrate_damage: "貫通ダメージ",
      extra_damage: "追加ダメージ",
      extra_penetrate_damage: "追加貫通ダメージ",
      heal: "回復",
      add_pp: "PP回復",
      set_pp: "PPを指定値にする",
      add_status: "状態付与",
      remove_status: "状態削除",
      set_flag: "フラグON",
      clear_flag: "フラグOFF",
      move_to_grave: "墓地へ送る",
      return_to_hand: "手札へ戻す",
      return_to_deck: "山札へ戻す",
      add_effect: "効果を付与",
      remove_effect: "効果を削除",
      append_effect: "効果を追記",
      override_effect: "効果を上書き",
      invoke_effect: "効果を再発動",
      invoke_trigger: "トリガー再発動",
      set_var: "変数代入",
      add_var: "変数加算",
      copy_last_value: "直前値をコピー",
      choose_one: "効果を選択",
      repeat: "繰り返し",
      once_per_turn: "1ターン1回",
      once_while_on_field: "場にいる間1回",
      non_stackable: "重複不可",
      custom: "カスタム"
    };

    const TYPE_LABEL_MAP = {
      trigger: "トリガー",
      condition: "条件",
      target: "対象",
      effect: "効果",
      modifier: "修飾",
      end: "終了",
      variable: "変数",
      history: "履歴",
      math: "計算",
      custom: "カスタム"
    };

    const TRIGGER_LABEL_MAP = TRIGGER_EVENT_OPTIONS.reduce((acc, x) => {
      acc[x.value] = x.label;
      return acc;
    }, {});

    const TARGET_LABEL_MAP = TARGET_OPTIONS.reduce((acc, x) => {
      acc[x.value] = x.label;
      return acc;
    }, {});

    const CONDITION_LEFT_OPTIONS = [
      { value: "event.damage", label: "今回のダメージ" },
      { value: "event.penetrateDamage", label: "今回の貫通ダメージ" },
      { value: "history.event.OnDraw.count", label: "このターンのドロー回数" },
      { value: "history.event.OnAttack.count", label: "この試合の攻撃回数" },
      { value: "history.lastEvent", label: "直前イベント名" },
      { value: "custom", label: "自由入力" }
    ];

    function createDraftNode(item, x, y) {
      return {
        id: `node-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
        type: item.type,
        label: item.label || item.type,
        data: clone(item.data || {}),
        x: Math.round(Number(x || 0)),
        y: Math.round(Number(y || 0))
      };
    }

    function openNodeConfigModal(mode, payload) {
      const modal = root.querySelector("#nodeConfigModal");
      const title = root.querySelector("#nodeConfigTitle");
      if (!modal) return;

      if (mode === "create") {
        const item = payload.item;
        const x = Number(payload.x || 0);
        const y = Number(payload.y || 0);
        nodeConfigCtx = { mode: "create", draft: createDraftNode(item, x, y), nodeId: "" };
      } else {
        const node = nodeById(payload.nodeId);
        if (!node) return;
        nodeConfigCtx = { mode: "edit", draft: clone(node), nodeId: node.id };
      }

      if (title) title.textContent = nodeConfigCtx.mode === "create" ? "ノード追加設定" : "ノード設定変更";
      renderNodeConfigForm();
      modal.style.display = "flex";
    }

    function closeNodeConfigModal() {
      const modal = root.querySelector("#nodeConfigModal");
      if (modal) modal.style.display = "none";
      nodeConfigCtx = null;
    }

    function renderNodeConfigForm() {
      const form = root.querySelector("#nodeConfigForm");
      if (!form || !nodeConfigCtx?.draft) return;
      const d = nodeConfigCtx.draft;

      const eventValue = String(d.data?.event || "OnPlay");
      const eventPreset = TRIGGER_EVENT_OPTIONS.some((x) => x.value === eventValue) ? eventValue : "custom";
      const triggerOptionsHtml = TRIGGER_EVENT_OPTIONS.map((opt) => (
        `<option value="${opt.value}" ${eventPreset === opt.value ? "selected" : ""}>${opt.label}</option>`
      )).join("");
      const targetValue = String(d.data?.target || "current_target");
      const targetPreset = TARGET_OPTIONS.some((x) => x.value === targetValue) ? targetValue : "custom";
      const targetOptionsHtml = TARGET_OPTIONS.map((opt) => (
        `<option value="${opt.value}" ${targetPreset === opt.value ? "selected" : ""}>${opt.label}</option>`
      )).join("");
      const effectOptionsHtml = EFFECT_ACTION_OPTIONS.map((opt) => (
        `<option value="${opt.value}" ${String(d.data?.action || "draw") === opt.value ? "selected" : ""}>${ACTION_LABEL_MAP[opt.value] || opt.label}</option>`
      )).join("");

      let typeSpecific = `<div style="font-size:12px;color:#9db7dc;">このノードタイプは追加設定がありません</div>`;
      if (d.type === "trigger") {
        const useCustom = eventPreset === "custom";
        typeSpecific = `
          <select data-k="eventPreset">${triggerOptionsHtml}</select>
          <input data-k="eventCustom" value="${htmlEscape(useCustom ? eventValue : "")}" placeholder="カスタムイベント名" ${useCustom ? "" : "disabled"}>
        `;
      } else if (d.type === "target") {
        const useCustom = targetPreset === "custom";
        typeSpecific = `
          <select data-k="targetPreset">${targetOptionsHtml}</select>
          <input data-k="targetCustom" value="${htmlEscape(useCustom ? targetValue : "")}" placeholder="自由指定ターゲット" ${useCustom ? "" : "disabled"}>
        `;
      } else if (d.type === "effect" || d.type === "modifier") {
        const argsText = Array.isArray(d.data?.args) ? d.data.args.join(" ") : "";
        const help = {
          add_effect: "例: trigger=OnTurnStart;effect=draw 1",
          append_effect: "例: trigger=OnAttack;effect=damage 1;stackable=true",
          invoke_trigger: "例: OnAttack 1",
          choose_one: "例: effect=heal 1|effect=damage 1",
          repeat: "例: count=2;effect=damage 1"
        };
        typeSpecific = `
          <select data-k="action">${effectOptionsHtml}</select>
          <input data-k="args" value="${htmlEscape(argsText)}" placeholder="${help[d.data?.action] || (d.data?.action === "damage" ? "damage量などを自由入力 (例: 3 or x*2)" : "引数を自由入力（スペース区切り）")}">
        `;
      } else if (d.type === "condition") {
        const leftVal = String(d.data?.left || "event.damage");
        const leftPreset = CONDITION_LEFT_OPTIONS.some((x) => x.value === leftVal) ? leftVal : "custom";
        const condLeftOptions = CONDITION_LEFT_OPTIONS.map((opt) => (
          `<option value="${opt.value}" ${leftPreset === opt.value ? "selected" : ""}>${opt.label}</option>`
        )).join("");
        const opVal = String(d.data?.op || ">");
        const opOptions = [">", ">=", "==", "!=", "<=", "<"].map((op) => (
          `<option value="${op}" ${opVal === op ? "selected" : ""}>${op}</option>`
        )).join("");
        typeSpecific = `
          <label style="font-size:11px;color:#9ab7de;">条件左辺</label>
          <select data-k="condLeftPreset">${condLeftOptions}</select>
          <input data-k="condLeftCustom" value="${htmlEscape(leftPreset === "custom" ? leftVal : "")}" placeholder="自由入力の左辺式" ${leftPreset === "custom" ? "" : "disabled"}>
          <label style="font-size:11px;color:#9ab7de;">比較演算子</label>
          <select data-k="condOp">${opOptions}</select>
          <label style="font-size:11px;color:#9ab7de;">条件右辺</label>
          <input data-k="condRight" value="${htmlEscape(String(d.data?.right || "0"))}" placeholder="0">
        `;
      } else if (d.type === "history" || d.type === "math") {
        typeSpecific = `<input data-k="expression" value="${htmlEscape(String(d.data?.expression || ""))}" placeholder="条件式 / 履歴参照式">`;
      } else if (d.type === "variable") {
        typeSpecific = `
          <input data-k="varName" value="${htmlEscape(String(d.data?.name || ""))}" placeholder="変数名">
          <input data-k="varValue" value="${htmlEscape(String(d.data?.value || ""))}" placeholder="値">
        `;
      } else if (d.type === "custom") {
        typeSpecific = `<textarea data-k="customJson" rows="5" placeholder="JSON">${htmlEscape(JSON.stringify(d.data || {}, null, 2))}</textarea>`;
      }

      form.innerHTML = `
        <input data-k="label" value="${htmlEscape(String(d.label || ""))}" placeholder="ノード名">
        <input data-k="type" value="${htmlEscape(TYPE_LABEL_MAP[d.type] || String(d.type || ""))}" readonly>
        <div class="formRow2">
          <input data-k="x" type="number" value="${Number(d.x || 0)}" placeholder="x">
          <input data-k="y" type="number" value="${Number(d.y || 0)}" placeholder="y">
        </div>
        ${typeSpecific}
      `;

      form.querySelectorAll("[data-k]").forEach((el) => {
        el.addEventListener("input", updateDraftFromNodeConfigForm);
        el.addEventListener("change", updateDraftFromNodeConfigForm);
      });
    }

    function updateDraftFromNodeConfigForm() {
      const form = root.querySelector("#nodeConfigForm");
      const d = nodeConfigCtx?.draft;
      if (!form || !d) return;
      const val = (k) => form.querySelector(`[data-k="${k}"]`)?.value;

      d.label = String(val("label") || d.label || d.type);
      d.x = Number(val("x") || d.x || 0);
      d.y = Number(val("y") || d.y || 0);

      if (d.type === "trigger") {
        const preset = String(val("eventPreset") || "OnPlay");
        const custom = String(val("eventCustom") || "").trim();
        const customInput = form.querySelector('[data-k="eventCustom"]');
        if (customInput) customInput.disabled = preset !== "custom";
        d.data.event = preset === "custom" ? (custom || "CustomEvent") : preset;
      } else if (d.type === "target") {
        const preset = String(val("targetPreset") || "current_target");
        const custom = String(val("targetCustom") || "").trim();
        const customInput = form.querySelector('[data-k="targetCustom"]');
        if (customInput) customInput.disabled = preset !== "custom";
        d.data.target = preset === "custom" ? (custom || "custom_target") : preset;
      } else if (d.type === "effect" || d.type === "modifier") {
        d.data.action = String(val("action") || "draw");
        d.data.args = String(val("args") || "").split(/\s+/).filter(Boolean);
      } else if (d.type === "condition") {
        const preset = String(val("condLeftPreset") || "event.damage");
        const custom = String(val("condLeftCustom") || "");
        const leftInput = form.querySelector('[data-k="condLeftCustom"]');
        if (leftInput) leftInput.disabled = preset !== "custom";
        const left = preset === "custom" ? (custom || "event.damage") : preset;
        const op = String(val("condOp") || ">");
        const right = String(val("condRight") || "0");
        d.data.left = left;
        d.data.op = op;
        d.data.right = right;
        d.data.expression = `${left} ${op} ${right}`;
      } else if (d.type === "history" || d.type === "math") {
        d.data.expression = String(val("expression") || "");
      } else if (d.type === "variable") {
        d.data.name = String(val("varName") || "");
        d.data.value = String(val("varValue") || "");
      } else if (d.type === "custom") {
        try {
          d.data = JSON.parse(String(val("customJson") || "{}"));
        } catch (_) {}
      }
    }

    function commitNodeConfig() {
      if (!nodeConfigCtx?.draft) return;
      updateDraftFromNodeConfigForm();
      if (nodeConfigCtx.mode === "create") {
        pushUndo("add-node-config");
        state.graph.nodes.push(clone(nodeConfigCtx.draft));
        state.selectedNodeIds = new Set([nodeConfigCtx.draft.id]);
        state.selectedEdgeIds = new Set();
      } else {
        const target = nodeById(nodeConfigCtx.nodeId);
        if (!target) return;
        pushUndo("edit-node-config");
        target.label = nodeConfigCtx.draft.label;
        target.x = nodeConfigCtx.draft.x;
        target.y = nodeConfigCtx.draft.y;
        target.data = clone(nodeConfigCtx.draft.data || {});
        state.selectedNodeIds = new Set([target.id]);
        state.selectedEdgeIds = new Set();
      }
      syncDslFromGraph();
      renderDsl();
      requestRenderGraph();
      closeNodeConfigModal();
    }

    function patchCardValues(card, map) {
      if (!card || !map) return;
      const has = (k) => Object.prototype.hasOwnProperty.call(map, k);
      if (has("name")) card.name = String(map.name || "");
      if (has("type")) card.type = String(map.type || "アタッカー");
      if (has("attribute")) card.attribute = String(map.attribute || "近接");
      if (has("attack")) card.attack = Math.max(0, Math.floor(Number(map.attack || 0)));
      if (String(card.type || "") === "サポート") card.attack = 0;
      if (has("cost")) card.cost = Math.max(0, Number(map.cost || 0));
      if (has("causalRate")) card.causalRate = Number(map.causalRate || 0);
      if (has("tags")) {
        card.tags = String(map.tags || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
      }
      if (has("image")) card.image = String(map.image || "");
      if (has("effectText")) card.effectText = String(map.effectText || "");
    }

    function renderCardVisual() {
      const card = selectedCard();
      const badge = root.querySelector("#currentCardBadge");
      if (badge) badge.textContent = card ? `${card.id} ${card.name || ""}`.trim() : "未選択";
      const frame = root.querySelector(".cardVisualFrame");
      if (!frame || !card) return;
      const type = root.querySelector(".cardVisualType");
      const atk = root.querySelector(".cardVisualAttack");
      const attr = root.querySelector(".cardVisualAttr");
      const attrIcon = root.querySelector("#cardAttrIcon");
      const name = root.querySelector(".cardVisualName");
      const art = root.querySelector("#cardArtImage");
      const text = root.querySelector(".cardVisualText");
      const sizeBase = Math.max(220, frame.getBoundingClientRect().width || 300);
      const scale = Math.max(0.78, Math.min(1.35, sizeBase / 300));
      frame.style.setProperty("--card-scale", String(scale));
      if (type) type.textContent = String(card.type || "アタッカー");
      if (atk) atk.textContent = attackDisplay(card);
      if (attr) attr.title = String(card.attribute || "-");
      if (attrIcon) {
        const iconMap = {
          "魔法": "assets/System/cdtIcon_0.png",
          "近接": "assets/System/cdtIcon_1.png",
          "遠隔": "assets/System/cdtIcon_2.png"
        };
        attrIcon.src = iconMap[String(card.attribute || "")] || iconMap["近接"];
      }
      if (name) name.textContent = String(card.name || card.id || "No Name");
      if (text) text.textContent = String(card.effectText || "効果テキスト未設定");
      if (art) {
        const src = String(card.image || "").trim();
        art.src = src || "assets/System/404.png";
      }
      frame.dataset.frameStyle = card.type || "アタッカー";
    }

    function openCardFieldModal(field) {
      const card = selectedCard();
      const modal = root.querySelector("#cardFieldModal");
      const title = root.querySelector("#cardFieldTitle");
      const form = root.querySelector("#cardFieldForm");
      if (!card || !modal || !form) return;
      cardFieldCtx = { field };
      const labels = {
        type: "種別",
        frame: "カード外枠",
        image: "カード画像",
        attribute: "属性(アイコン)",
        name: "カード名",
        attack: "攻撃力",
        effectText: "効果テキスト"
      };
      if (title) title.textContent = `${labels[field] || field} の設定`;
      if (field === "type" || field === "frame") {
        form.innerHTML = `
          <select data-k="type">
            <option ${card.type === "アタッカー" ? "selected" : ""}>アタッカー</option>
            <option ${card.type === "スキル" ? "selected" : ""}>スキル</option>
            <option ${card.type === "サポート" ? "selected" : ""}>サポート</option>
          </select>
        `;
      } else if (field === "attribute") {
        form.innerHTML = `
          <select data-k="attribute">
            <option ${card.attribute === "近接" ? "selected" : ""}>近接</option>
            <option ${card.attribute === "遠隔" ? "selected" : ""}>遠隔</option>
            <option ${card.attribute === "魔法" ? "selected" : ""}>魔法</option>
          </select>
        `;
      } else if (field === "attack") {
        if (isSupportCard(card)) {
          form.innerHTML = `<div style="font-size:12px;color:#9db7dc;">サポートカードの攻撃力表示は「ー」です。内部値は0固定で扱います。</div>`;
        } else {
          form.innerHTML = `<input data-k="attack" type="number" value="${attackInputValue(card)}" placeholder="攻撃力">`;
        }
      } else if (field === "name") {
        form.innerHTML = `<input data-k="name" value="${htmlEscape(card.name || "")}" placeholder="カード名">`;
      } else if (field === "image") {
        form.innerHTML = `<input data-k="image" value="${htmlEscape(card.image || "")}" placeholder="カード画像URL or パス">`;
      } else if (field === "effectText") {
        form.innerHTML = `<textarea data-k="effectText" rows="5" placeholder="効果テキスト">${htmlEscape(card.effectText || "")}</textarea>`;
      } else {
        form.innerHTML = `<div style="font-size:12px;color:#9db7dc;">未対応の項目です。</div>`;
      }
      modal.style.display = "flex";
    }

    function closeCardFieldModal() {
      const modal = root.querySelector("#cardFieldModal");
      if (modal) modal.style.display = "none";
      cardFieldCtx = null;
    }

    function commitCardFieldModal() {
      const card = selectedCard();
      const form = root.querySelector("#cardFieldForm");
      if (!card || !form || !cardFieldCtx?.field) return;
      const inputs = form.querySelectorAll("[data-k]");
      const map = {};
      inputs.forEach((el) => {
        map[el.dataset.k] = el.value;
      });
      patchCardValues(card, map);
      closeCardFieldModal();
      renderAll();
    }

    function openUtilityDrawer(target) {
      const modal = root.querySelector("#utilityDrawerModal");
      const title = root.querySelector("#utilityDrawerTitle");
      if (!modal) return;
      const map = {
        eventEngine: "Event Engine Viewer",
        runtimeInspector: "Runtime Inspector",
        replayDebugger: "Replay Debugger",
        logViewer: "Log Viewer",
        outputPreview: "Output Preview"
      };
      activeDrawer = target;
      if (title) title.textContent = map[target] || "Viewer";
      root.querySelectorAll(".drawerPane").forEach((pane) => {
        pane.style.display = pane.id === `drawer-${target}` ? "block" : "none";
      });
      modal.style.display = "flex";
      renderEventPanels();
      if (target === "outputPreview") renderOutputPreview();
    }

    function closeUtilityDrawer() {
      const modal = root.querySelector("#utilityDrawerModal");
      if (modal) modal.style.display = "none";
      activeDrawer = "";
    }

    function selectCardById(cardId) {
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return;
      const prev = selectedCard();
      if (prev && prev.id !== card.id) {
        saveFormToCard(prev);
        saveEditorToCard(prev);
      }
      state.selectedId = card.id;
      applyCardToEditor(card);
      renderAll();
    }

    function requestRenderGraph() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderGraph();
      });
    }

    function setViewportTransform() {
      const vp = root.querySelector("#nodeViewport");
      if (!vp) return;
      vp.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
    }

    function fromScreenToWorld(clientX, clientY) {
      const wrap = root.querySelector("#nodeCanvasWrap");
      const rect = wrap.getBoundingClientRect();
      const x = (clientX - rect.left - state.viewport.x) / state.viewport.scale;
      const y = (clientY - rect.top - state.viewport.y) / state.viewport.scale;
      return { x, y, rect };
    }

    function nodeCenter(node) {
      return {
        x: Number(node.x || 0) + 75,
        y: Number(node.y || 0) + 18
      };
    }

    function renderGraph() {
      const nodeLayer = root.querySelector("#nodeLayer");
      const edgeLayer = root.querySelector("#edgeLayer");
      if (!nodeLayer || !edgeLayer) return;

      setViewportTransform();
      nodeLayer.innerHTML = "";
      edgeLayer.innerHTML = "";

      (state.graph.edges || []).forEach((edge) => {
        const from = nodeById(edge.from);
        const to = nodeById(edge.to);
        if (!from || !to) return;
        const a = nodeCenter(from);
        const b = nodeCenter(to);
        const dx = Math.max(60, Math.abs(b.x - a.x) * 0.4);
        const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
        const isSelected = state.selectedEdgeIds.has(edge.id);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", isSelected ? "#ffd56a" : "#67c7ff");
        path.setAttribute("stroke-width", isSelected ? "3.4" : "2");
        path.setAttribute("opacity", isSelected ? "1" : "0.88");
        path.setAttribute("class", "edgePath");
        path.dataset.edgeId = edge.id;
        edgeLayer.appendChild(path);

        const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hit.setAttribute("d", d);
        hit.setAttribute("fill", "none");
        hit.setAttribute("stroke", "rgba(0,0,0,0)");
        hit.setAttribute("stroke-width", "14");
        hit.setAttribute("class", "edgeHitTarget");
        hit.dataset.edgeId = edge.id;
        hit.style.pointerEvents = "stroke";
        edgeLayer.appendChild(hit);
      });

      (state.graph.nodes || []).forEach((node) => {
        const el = document.createElement("div");
        el.className = `graphNode ${state.selectedNodeIds.has(node.id) ? "selected" : ""}`;
        el.dataset.nodeId = node.id;
        el.style.left = `${Number(node.x || 0)}px`;
        el.style.top = `${Number(node.y || 0)}px`;
        el.innerHTML = `
          <div class="nodeHead" data-drag-handle="1">
            <span>${htmlEscape(node.label || node.type)}</span>
            <span class="nodeCategory">${htmlEscape(TYPE_LABEL_MAP[node.type] || node.type)}</span>
          </div>
          <div class="nodeBody">${htmlEscape(compactNodeData(node))}</div>
        `;
        nodeLayer.appendChild(el);
      });

      renderInspector();
      renderOutputPreview();
    }

    function compactNodeData(node) {
      if (!node || typeof node !== "object") return "";
      const d = node.data || {};
      if (node.type === "trigger") return `トリガー：${TRIGGER_LABEL_MAP[d.event] || d.event || "登場時"}`;
      if (node.type === "condition") return `条件：${String(d.expression || "")}`;
      if (node.type === "target") return `対象：${TARGET_LABEL_MAP[d.target] || d.target || "自分"}`;
      if (node.type === "effect") return `効果：${ACTION_LABEL_MAP[d.action] || d.action || "効果"} ${(d.args || []).join(" ")}`.trim();
      if (node.type === "modifier") return `修飾：${ACTION_LABEL_MAP[d.action] || d.action || "修飾"} ${(d.args || []).join(" ")}`.trim();
      return JSON.stringify(d);
    }

    function renderCardList() {
      const listEl = root.querySelector("#ideCardList");
      const badge = root.querySelector("#currentCardBadge");
      const selected = selectedCard();
      if (badge) badge.textContent = selected ? `${selected.id} ${selected.name || ""}`.trim() : "未選択";
      if (!listEl) return;
      const rows = filteredCards();
      listEl.innerHTML = "";
      rows.forEach((card) => {
        const btn = document.createElement("button");
        btn.className = `cardRowBtn ${card.id === state.selectedId ? "active" : ""}`;
        btn.innerHTML = `<div style="font-weight:700;">${htmlEscape(card.id)}</div><div>${htmlEscape(card.name || "(no name)")}</div><div style="font-size:11px;color:#96b3dd;">${htmlEscape(card.type || "-")} / ${htmlEscape(card.attribute || "-")}</div>`;
        btn.addEventListener("click", () => selectCardById(card.id));
        listEl.appendChild(btn);
      });
    }

    function renderCardPickerList(keyword) {
      const pickerList = root.querySelector("#cardPickerList");
      if (!pickerList) return;
      const q = String(keyword || "").trim().toLowerCase();
      const rows = filteredCards().filter((card) => {
        if (!q) return true;
        const text = [
          card.id,
          card.name,
          card.type,
          card.attribute,
          Array.isArray(card.tags) ? card.tags.join(" ") : card.tags,
          card.effectText
        ].map((x) => String(x || "").toLowerCase()).join(" ");
        return text.includes(q);
      });
      pickerList.innerHTML = "";
      rows.forEach((card) => {
        const btn = document.createElement("button");
        btn.className = `cardRowBtn ${card.id === state.selectedId ? "active" : ""}`;
        btn.innerHTML = `<div style="font-weight:700;">${htmlEscape(card.id)} - ${htmlEscape(card.name || "(no name)")}</div><div style="font-size:11px;color:#96b3dd;">${htmlEscape(card.type || "-")} / ${htmlEscape(card.attribute || "-")} / ATK:${attackDisplay(card)}</div>`;
        btn.addEventListener("click", () => {
          selectCardById(card.id);
          const modal = root.querySelector("#cardPickerModal");
          if (modal) modal.style.display = "none";
        });
        pickerList.appendChild(btn);
      });
    }

    function renderNodeLibrary() {
      const listEl = root.querySelector("#nodeLibList");
      const q = String(root.querySelector("#nodeLibSearch")?.value || "").trim().toLowerCase();
      if (!listEl) return;
      listEl.innerHTML = "";
      NODE_LIBRARY.filter((item) => {
        if (!q) return true;
        return `${item.category} ${item.label} ${item.type}`.toLowerCase().includes(q);
      }).forEach((item) => {
        const btn = document.createElement("button");
        btn.innerHTML = `<div style="font-size:10px;color:#8eb0dd;">${htmlEscape(item.category)}</div><div style="font-weight:700;">${htmlEscape(item.label)}</div>`;
        btn.addEventListener("click", () => {
          const center = fromScreenToWorld(window.innerWidth * 0.5, window.innerHeight * 0.35);
          openNodeConfigModal("create", { item, x: center.x, y: center.y });
        });
        listEl.appendChild(btn);
      });
    }

    function renderCardInfo() {
      const wrap = root.querySelector("#cardInfoForm");
      const card = selectedCard();
      if (!wrap) return;
      if (!card) {
        wrap.innerHTML = `<div style="color:#89a4cc;font-size:12px;">カード未選択</div>`;
        return;
      }
      wrap.innerHTML = `
        <div style="font-size:11px;color:#8ca9cf;">Card Info</div>
        <input data-k="id" value="${htmlEscape(card.id || "")}" readonly>
        <input data-k="name" value="${htmlEscape(card.name || "")}" placeholder="カード名">
        <div class="formRow2">
          <select data-k="type">
            <option ${card.type === "アタッカー" ? "selected" : ""}>アタッカー</option>
            <option ${card.type === "スキル" ? "selected" : ""}>スキル</option>
            <option ${card.type === "サポート" ? "selected" : ""}>サポート</option>
          </select>
          <select data-k="attribute">
            <option ${card.attribute === "近接" ? "selected" : ""}>近接</option>
            <option ${card.attribute === "遠隔" ? "selected" : ""}>遠隔</option>
            <option ${card.attribute === "魔法" ? "selected" : ""}>魔法</option>
          </select>
        </div>
        <div class="formRow2">
          <input data-k="attack" type="number" value="${attackInputValue(card)}" placeholder="攻撃力（サポートは内部0）">
          <input data-k="cost" type="number" value="${Number(card.cost || 0)}" placeholder="コスト">
        </div>
        <div class="formRow2">
          <input data-k="causalRate" type="number" value="${Number(card.causalRate || 0)}" placeholder="因果率">
          <input data-k="tags" value="${htmlEscape(Array.isArray(card.tags) ? card.tags.join(", ") : (card.tags || ""))}" placeholder="タグ">
        </div>
        <input data-k="image" value="${htmlEscape(card.image || "")}" placeholder="画像パス">
        <textarea data-k="effectText" rows="3" placeholder="効果一覧テキスト">${htmlEscape(card.effectText || "")}</textarea>
      `;
      wrap.querySelectorAll("input[data-k], select[data-k], textarea[data-k]").forEach((input) => {
        input.addEventListener("input", () => saveFormToCard(card));
        input.addEventListener("change", () => saveFormToCard(card));
      });
    }

    function saveFormToCard(card) {
      const wrap = root.querySelector("#cardInfoForm");
      if (!wrap || !card) return;
      const map = {};
      wrap.querySelectorAll("[data-k]").forEach((el) => {
        map[el.dataset.k] = el.value;
      });
      patchCardValues(card, map);
      card.cost = Math.max(0, Number(map.cost || card.cost || 0));
      card.causalRate = Number(map.causalRate || card.causalRate || 0);
      renderCardList();
      renderCardVisual();
    }

    function renderInspector() {
      const wrap = root.querySelector("#nodeInspector");
      const ids = Array.from(state.selectedNodeIds);
      const edgeIds = Array.from(state.selectedEdgeIds);
      if (!wrap) return;
      if (!ids.length && !edgeIds.length) {
        wrap.innerHTML = `<div style="color:#89a4cc;font-size:12px;">ノード未選択</div>`;
        return;
      }
      if (!ids.length && edgeIds.length > 1) {
        wrap.innerHTML = `<div style="font-size:12px;color:#b2caec;">${edgeIds.length} 接続線選択中</div><button class="ideSmallBtn danger" id="deleteSelectedEdgesBtn">選択接続線削除</button>`;
        wrap.querySelector("#deleteSelectedEdgesBtn")?.addEventListener("click", () => {
          pushUndo("delete-selected-edges");
          const del = new Set(edgeIds);
          state.graph.edges = state.graph.edges.filter((e) => !del.has(e.id));
          state.selectedEdgeIds = new Set();
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        });
        return;
      }
      if (!ids.length && edgeIds.length === 1) {
        const edge = edgeById(edgeIds[0]);
        if (!edge) return;
        wrap.innerHTML = `
          <div style="font-size:12px;color:#d7e6ff;">接続線: ${htmlEscape(edge.id || "-")}</div>
          <div style="font-size:12px;color:#9ec0ec;">接続元: ${htmlEscape(edge.from || "-")}</div>
          <div style="font-size:12px;color:#9ec0ec;">接続先: ${htmlEscape(edge.to || "-")}</div>
          <div style="font-size:12px;color:#89a8d3;">種別: ${htmlEscape(edge.kind || "flow")}</div>
          <div class="simActionRow">
            <button class="ideSmallBtn danger" id="delEdgeBtn">接続線を削除</button>
          </div>
        `;
        wrap.querySelector("#delEdgeBtn")?.addEventListener("click", () => {
          pushUndo("delete-edge");
          state.graph.edges = state.graph.edges.filter((e) => e.id !== edge.id);
          state.selectedEdgeIds = new Set();
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        });
        return;
      }
      if (ids.length > 1) {
        wrap.innerHTML = `<div style="font-size:12px;color:#b2caec;">${ids.length} ノード選択中</div><button class="ideSmallBtn danger" id="deleteSelectedNodesBtn">選択ノード削除</button>`;
        wrap.querySelector("#deleteSelectedNodesBtn")?.addEventListener("click", () => {
          pushUndo("delete-selected");
          const del = new Set(ids);
          state.graph.nodes = state.graph.nodes.filter((n) => !del.has(n.id));
          state.graph.edges = state.graph.edges.filter((e) => !del.has(e.from) && !del.has(e.to));
          state.selectedNodeIds = new Set();
          state.selectedEdgeIds = new Set();
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        });
        return;
      }

      const node = nodeById(ids[0]);
      if (!node) return;
      wrap.innerHTML = `
        <div style="font-size:12px;color:#d7e6ff;">ノード名: ${htmlEscape(node.label || "")}</div>
        <div style="font-size:12px;color:#9ec0ec;">種類: ${htmlEscape(TYPE_LABEL_MAP[node.type] || node.type)}</div>
        <div style="font-size:12px;color:#9ec0ec;">内容: ${htmlEscape(compactNodeData(node))}</div>
        <div style="font-size:12px;color:#89a8d3;">位置: (${Number(node.x || 0)}, ${Number(node.y || 0)})</div>
        <div class="simActionRow">
          <button class="ideSmallBtn" id="editNodeBtn">ノード設定を開く</button>
          <button class="ideSmallBtn" id="dupNodeBtn">複製</button>
          <button class="ideSmallBtn danger" id="delNodeBtn">削除</button>
        </div>
      `;

      wrap.querySelector("#editNodeBtn")?.addEventListener("click", () => {
        openNodeConfigModal("edit", { nodeId: node.id });
      });

      wrap.querySelector("#dupNodeBtn")?.addEventListener("click", () => {
        pushUndo("node-dup");
        const id = `node-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
        const dup = clone(node);
        dup.id = id;
        dup.x = Number(node.x || 0) + 60;
        dup.y = Number(node.y || 0) + 40;
        state.graph.nodes.push(dup);
        state.selectedNodeIds = new Set([id]);
        syncDslFromGraph();
        renderDsl();
        requestRenderGraph();
      });

      wrap.querySelector("#delNodeBtn")?.addEventListener("click", () => {
        pushUndo("node-delete");
        state.graph.nodes = state.graph.nodes.filter((n) => n.id !== node.id);
        state.graph.edges = state.graph.edges.filter((e) => e.from !== node.id && e.to !== node.id);
        state.selectedNodeIds = new Set();
        state.selectedEdgeIds = new Set();
        syncDslFromGraph();
        renderDsl();
        requestRenderGraph();
      });
    }

    function renderDsl() {
      const area = root.querySelector("#dslEditorArea");
      const highlight = root.querySelector("#dslHighlight");
      const err = root.querySelector("#dslError");
      const lineInfo = root.querySelector("#dslLineInfo");
      const tokenInfo = root.querySelector("#dslTokenInfo");
      if (!area || !highlight || !err || !lineInfo || !tokenInfo) return;
      if (area.value !== state.dslText) area.value = state.dslText;
      err.textContent = state.dslError || "";
      const lineCount = Math.max(1, String(state.dslText || "").split(/\r?\n/).length);
      const tokenCount = String(state.dslText || "").split(/\s+/).filter(Boolean).length;
      lineInfo.textContent = `line:${lineCount}`;
      tokenInfo.textContent = `tokens:${tokenCount}`;
      highlight.innerHTML = highlightDsl(state.dslText);
    }

    function highlightDsl(text) {
      const escaped = htmlEscape(text || "");
      return escaped
        .replace(/\b(trigger|if|target|effect|modifier|end)\b/g, '<span style="color:#67d8ff;font-weight:700;">$1</span>')
        .replace(/\b(On[A-Za-z]+)\b/g, '<span style="color:#7dffcb;">$1</span>')
        .replace(/\b(\d+)\b/g, '<span style="color:#ffcf7a;">$1</span>');
    }

    function renderLegacyBlocks() {
      const box = root.querySelector("#legacyBlocksText");
      const card = selectedCard();
      if (!box) return;
      if (!card?.effectBlocks) {
        box.value = "{}";
        return;
      }
      box.value = JSON.stringify(card.effectBlocks, null, 2);
    }

    function renderEventPanels() {
      const eventViewer = root.querySelector("#eventEngineViewer");
      const runtimeView = root.querySelector("#runtimeInspectorView");
      const replayView = root.querySelector("#replayView");
      if (!eventViewer || !runtimeView || !replayView || !runtime()) return;

      const rows = runtime().historyStore.query(() => true).slice(-18);
      eventViewer.textContent = rows.map((r) => `${r.id} | ${r.eventName} | ${r.sourceCardId || "-"}`).join("\n") || "(no events)";

      const snap = runtime().runtimeInspector.snapshot();
      runtimeView.textContent = formatRuntimeInspectorSnapshot(snap);

      const replayRows = runtime().replayDebugger.rows();
      if (state.replayCursor < 0 && replayRows.length) state.replayCursor = replayRows.length - 1;
      const current = replayRows[state.replayCursor] || null;
      replayView.textContent = current
        ? `cursor: ${state.replayCursor + 1}/${replayRows.length}\n${JSON.stringify(current, null, 2)}`
        : "(no replay data)";
    }

    function renderSimulatorResult() {
      const box = root.querySelector("#simResultView");
      if (!box) return;
      box.textContent = formatSimulatorResult(state.simLastResult);
    }

    function renderOutputPreview() {
      const out = root.querySelector("#outputPreview");
      const card = selectedCard();
      if (!out) return;
      if (!card) {
        out.textContent = "カード未選択";
        return;
      }
      const lines = String(state.dslText || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const effectLines = lines.filter((line) => line.startsWith("effect "));
      const generated = effectLines.map((line) => {
        const p = line.split(/\s+/);
        const action = p[1] || "";
        const arg = p.slice(2).join(" ");
        if (action === "draw") return `カードを${arg || 1}枚引く`;
        if (action === "damage") return `${arg || 1}ダメージを与える`;
        if (action === "heal") return `HPを${arg || 1}回復`;
        if (action === "add_pp") return `PPを${arg || 1}回復`;
        return line;
      });

      out.textContent = [
        `表示名: ${card.name || card.id}`,
        `タイプ: ${card.type || "-"} / 属性: ${card.attribute || "-"}`,
        `ATK:${attackDisplay(card)} COST:${Number(card.cost || 0)} 因果率:${Number(card.causalRate || 0)}`,
        `タグ: ${Array.isArray(card.tags) ? card.tags.join(", ") : String(card.tags || "-")}`,
        "---",
        "生成テキスト:",
        ...(generated.length ? generated : ["(効果なし)"]),
        "---",
        "原文メモ:",
        String(card.effectText || "")
      ].join("\n");
    }

    function renderAll() {
      requestRenderGraph();
      renderDsl();
      renderCardVisual();
      renderCardList();
      renderCardInfo();
      renderNodeLibrary();
      renderLegacyBlocks();
      renderEventPanels();
      renderSimulatorResult();
      renderOutputPreview();
      const modal = root.querySelector("#cardPickerModal");
      if (modal && modal.style.display === "flex") {
        const kw = root.querySelector("#cardPickerSearch")?.value || "";
        renderCardPickerList(kw);
      }
    }

    function addEdge(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return;
      const exists = state.graph.edges.some((e) => e.from === fromId && e.to === toId);
      if (exists) return;
      state.graph.edges.push({ id: `edge-${Date.now()}-${Math.floor(Math.random() * 1e5)}`, from: fromId, to: toId, kind: "flow" });
    }

    function deleteSelectedGraphElements() {
      const nodeIds = Array.from(state.selectedNodeIds || []);
      const edgeIds = Array.from(state.selectedEdgeIds || []);
      if (!nodeIds.length && !edgeIds.length) return false;
      pushUndo("delete-selection-shortcut");
      if (nodeIds.length) {
        const delNodes = new Set(nodeIds);
        state.graph.nodes = state.graph.nodes.filter((n) => !delNodes.has(n.id));
        state.graph.edges = state.graph.edges.filter((e) => !delNodes.has(e.from) && !delNodes.has(e.to));
      }
      if (edgeIds.length) {
        const delEdges = new Set(edgeIds);
        state.graph.edges = state.graph.edges.filter((e) => !delEdges.has(e.id));
      }
      state.selectedNodeIds = new Set();
      state.selectedEdgeIds = new Set();
      syncDslFromGraph();
      renderDsl();
      requestRenderGraph();
      return true;
    }

    function bindGraphInteractions() {
      const wrap = root.querySelector("#nodeCanvasWrap");
      const nodeLayer = root.querySelector("#nodeLayer");

      wrap.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        const prev = state.viewport.scale;
        const next = Math.max(0.35, Math.min(2.2, prev + delta));
        const world = fromScreenToWorld(e.clientX, e.clientY);
        state.viewport.scale = next;
        state.viewport.x = e.clientX - world.rect.left - world.x * next;
        state.viewport.y = e.clientY - world.rect.top - world.y * next;
        requestRenderGraph();
      }, { passive: false });

      wrap.addEventListener("mousedown", (e) => {
        hideContextMenu();
        const nodeEl = e.target.closest(".graphNode");
        const edgeEl = e.target.closest(".edgeHitTarget, .edgePath");

        if (e.button === 1) {
          state.drag = { type: "pan", startX: e.clientX, startY: e.clientY, baseX: state.viewport.x, baseY: state.viewport.y };
          return;
        }

        if (edgeEl) {
          const edgeId = edgeEl.dataset.edgeId;
          if (!edgeId) return;
          if (e.button === 2) {
            if (!state.selectedEdgeIds.has(edgeId)) state.selectedEdgeIds = new Set([edgeId]);
            if (!e.ctrlKey && !e.metaKey) state.selectedNodeIds = new Set();
            requestRenderGraph();
            openContextMenu(e.clientX, e.clientY, "", edgeId);
            return;
          }
          if (e.button !== 0) return;
          if (e.ctrlKey || e.metaKey) {
            if (state.selectedEdgeIds.has(edgeId)) state.selectedEdgeIds.delete(edgeId);
            else state.selectedEdgeIds.add(edgeId);
          } else {
            state.selectedEdgeIds = new Set([edgeId]);
            state.selectedNodeIds = new Set();
          }
          requestRenderGraph();
          return;
        }

        if (!nodeEl) {
          if (e.button !== 0) return;
          if (e.shiftKey) {
            const { x, y } = fromScreenToWorld(e.clientX, e.clientY);
            if (!e.ctrlKey && !e.metaKey) state.selectedNodeIds = new Set();
            if (!e.ctrlKey && !e.metaKey) state.selectedEdgeIds = new Set();
            state.selectionRect = { sx: x, sy: y, ex: x, ey: y };
            requestRenderGraph();
          } else {
            if (!e.ctrlKey && !e.metaKey) state.selectedEdgeIds = new Set();
            state.drag = { type: "pan", startX: e.clientX, startY: e.clientY, baseX: state.viewport.x, baseY: state.viewport.y };
          }
          return;
        }

        const nodeId = nodeEl.dataset.nodeId;
        if (e.button === 2) {
          if (!state.selectedNodeIds.has(nodeId)) state.selectedNodeIds = new Set([nodeId]);
          if (!e.ctrlKey && !e.metaKey) state.selectedEdgeIds = new Set();
          requestRenderGraph();
          openContextMenu(e.clientX, e.clientY, nodeId, "");
          return;
        }

        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey) {
          if (state.selectedNodeIds.has(nodeId)) state.selectedNodeIds.delete(nodeId);
          else state.selectedNodeIds.add(nodeId);
        } else if (!state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds = new Set([nodeId]);
        }
        if (!e.ctrlKey && !e.metaKey) state.selectedEdgeIds = new Set();

        const world = fromScreenToWorld(e.clientX, e.clientY);
        const targets = Array.from(state.selectedNodeIds)
          .map((id) => nodeById(id))
          .filter(Boolean)
          .map((n) => ({ id: n.id, x: Number(n.x || 0), y: Number(n.y || 0) }));
        state.drag = { type: "move-node", startX: world.x, startY: world.y, targets };
        requestRenderGraph();
      });

      window.addEventListener("mousemove", (e) => {
        if (!state.drag && !state.selectionRect) return;
        if (state.drag?.type === "pan") {
          state.viewport.x = state.drag.baseX + (e.clientX - state.drag.startX);
          state.viewport.y = state.drag.baseY + (e.clientY - state.drag.startY);
          requestRenderGraph();
          return;
        }

        if (state.drag?.type === "move-node") {
          const world = fromScreenToWorld(e.clientX, e.clientY);
          const dx = world.x - state.drag.startX;
          const dy = world.y - state.drag.startY;
          state.drag.targets.forEach((row) => {
            const n = nodeById(row.id);
            if (!n) return;
            n.x = Math.round(row.x + dx);
            n.y = Math.round(row.y + dy);
          });
          requestRenderGraph();
          return;
        }

        if (state.selectionRect) {
          const world = fromScreenToWorld(e.clientX, e.clientY);
          state.selectionRect.ex = world.x;
          state.selectionRect.ey = world.y;
          drawSelectionRect();
          applySelectionRect(true);
        }
      });

      window.addEventListener("mouseup", () => {
        if (state.drag?.type === "move-node") {
          pushUndo("move-node");
          syncDslFromGraph();
          renderDsl();
        }
        state.drag = null;
        if (state.selectionRect) {
          applySelectionRect(true);
          clearSelectionRect();
        }
      });

      wrap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const nodeEl = e.target.closest(".graphNode");
        const edgeEl = e.target.closest(".edgeHitTarget, .edgePath");
        if (nodeEl) {
          openContextMenu(e.clientX, e.clientY, nodeEl.dataset.nodeId, "");
        } else if (edgeEl?.dataset?.edgeId) {
          openContextMenu(e.clientX, e.clientY, "", edgeEl.dataset.edgeId);
        } else {
          openContextMenu(e.clientX, e.clientY, "", "");
        }
      });

      nodeLayer.addEventListener("dblclick", (e) => {
        const nodeEl = e.target.closest(".graphNode");
        if (!nodeEl) return;
        const id = nodeEl.dataset.nodeId;
        if (!state.connectFrom) {
          state.connectFrom = id;
          log(`接続開始: ${id}`);
          return;
        }
        if (state.connectFrom && state.connectFrom !== id) {
          pushUndo("add-edge");
          addEdge(state.connectFrom, id);
          state.connectFrom = "";
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
          log("ノード接続を追加");
        }
      });
    }

    function drawSelectionRect() {
      const wrap = root.querySelector("#nodeCanvasWrap");
      if (!wrap || !state.selectionRect) return;
      let rect = wrap.querySelector(".selectionRect");
      if (!rect) {
        rect = document.createElement("div");
        rect.className = "selectionRect";
        wrap.appendChild(rect);
      }
      const sx = Math.min(state.selectionRect.sx, state.selectionRect.ex);
      const sy = Math.min(state.selectionRect.sy, state.selectionRect.ey);
      const ex = Math.max(state.selectionRect.sx, state.selectionRect.ex);
      const ey = Math.max(state.selectionRect.sy, state.selectionRect.ey);
      rect.style.left = `${sx * state.viewport.scale + state.viewport.x}px`;
      rect.style.top = `${sy * state.viewport.scale + state.viewport.y}px`;
      rect.style.width = `${(ex - sx) * state.viewport.scale}px`;
      rect.style.height = `${(ey - sy) * state.viewport.scale}px`;
    }

    function clearSelectionRect() {
      const wrap = root.querySelector("#nodeCanvasWrap");
      const rect = wrap?.querySelector(".selectionRect");
      if (rect) rect.remove();
      state.selectionRect = null;
    }

    function applySelectionRect(livePreview) {
      if (!state.selectionRect) return;
      const sx = Math.min(state.selectionRect.sx, state.selectionRect.ex);
      const sy = Math.min(state.selectionRect.sy, state.selectionRect.ey);
      const ex = Math.max(state.selectionRect.sx, state.selectionRect.ex);
      const ey = Math.max(state.selectionRect.sy, state.selectionRect.ey);
      const picked = new Set();
      (state.graph.nodes || []).forEach((n) => {
        const nx = Number(n.x || 0);
        const ny = Number(n.y || 0);
        const nw = 150;
        const nh = 42;
        const hit = nx + nw >= sx && nx <= ex && ny + nh >= sy && ny <= ey;
        if (hit) picked.add(n.id);
      });
      state.selectedNodeIds = picked;
      state.selectedEdgeIds = new Set();
      if (livePreview === true) renderInspector();
      requestRenderGraph();
    }

    function openContextMenu(x, y, nodeId, edgeId) {
      hideContextMenu();
      const menu = document.createElement("div");
      menu.className = "contextMenu";
      menu.style.left = `${Math.max(8, x)}px`;
      menu.style.top = `${Math.max(8, y)}px`;

      const actions = [];
      if (nodeId) {
        actions.push({ label: "ノード設定...", run: () => {
          openNodeConfigModal("edit", { nodeId });
        }});
        actions.push({ label: "ノード複製", run: () => {
          const node = nodeById(nodeId);
          if (!node) return;
          pushUndo("dup-node-context");
          const dup = clone(node);
          dup.id = `node-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
          dup.x = Number(node.x || 0) + 60;
          dup.y = Number(node.y || 0) + 30;
          state.graph.nodes.push(dup);
          state.selectedNodeIds = new Set([dup.id]);
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        }});
        actions.push({ label: "接続開始", run: () => { state.connectFrom = nodeId; log(`接続開始: ${nodeId}`); } });
        if (state.connectFrom && state.connectFrom !== nodeId) {
          actions.push({ label: `"${state.connectFrom}" から接続`, run: () => {
            pushUndo("connect-context");
            addEdge(state.connectFrom, nodeId);
            state.connectFrom = "";
            syncDslFromGraph();
            renderDsl();
            requestRenderGraph();
          }});
        }
        actions.push({ label: "ノード削除", run: () => {
          pushUndo("delete-node-context");
          state.graph.nodes = state.graph.nodes.filter((n) => n.id !== nodeId);
          state.graph.edges = state.graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
          state.selectedNodeIds.delete(nodeId);
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        }});
      } else if (edgeId) {
        actions.push({ label: "接続線を削除", run: () => {
          pushUndo("delete-edge-context");
          state.graph.edges = state.graph.edges.filter((e) => e.id !== edgeId);
          state.selectedEdgeIds = new Set();
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        }});
        const edge = edgeById(edgeId);
        if (edge) {
          actions.push({ label: "接続線を反転", run: () => {
            pushUndo("flip-edge-context");
            const from = edge.from;
            edge.from = edge.to;
            edge.to = from;
            syncDslFromGraph();
            renderDsl();
            requestRenderGraph();
          }});
        }
      }
      if (!edgeId) {
        actions.push({ label: "---- ノードライブラリ ----", run: () => {} });
        NODE_LIBRARY.forEach((item) => {
          actions.push({ label: `[${item.category}] ${item.label} 追加`, run: () => {
            const world = fromScreenToWorld(x, y);
            openNodeConfigModal("create", { item, x: world.x, y: world.y });
          }});
        });
      }

      actions.forEach((action) => {
        const btn = document.createElement("button");
        btn.textContent = action.label;
        if (action.label.startsWith("----")) {
          btn.disabled = true;
          btn.style.opacity = "0.65";
          btn.style.cursor = "default";
        }
        btn.addEventListener("click", () => {
          if (action.label.startsWith("----")) return;
          hideContextMenu();
          action.run();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      // Keep the full menu visible in viewport; fallback is internal scroll via CSS max-height.
      const rect = menu.getBoundingClientRect();
      const margin = 8;
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      const clampedLeft = Math.min(Math.max(margin, x), maxLeft);
      const clampedTop = Math.min(Math.max(margin, y), maxTop);
      menu.style.left = `${Math.round(clampedLeft)}px`;
      menu.style.top = `${Math.round(clampedTop)}px`;
      state.contextMenuEl = menu;
    }

    function hideContextMenu() {
      if (state.contextMenuEl) {
        state.contextMenuEl.remove();
        state.contextMenuEl = null;
      }
    }

    function bindDslEditor() {
      const area = root.querySelector("#dslEditorArea");
      const suggest = root.querySelector("#dslSuggestBox");
      if (!area || !suggest) return;

      let timer = 0;
      area.addEventListener("input", () => {
        state.dslText = area.value;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          pushUndo("dsl-edit");
          syncGraphFromDsl();
          renderAll();
        }, 260);
        renderDsl();
      });

      area.addEventListener("keyup", (e) => {
        if (e.key === " ") {
          const line = area.value.slice(0, area.selectionStart).split(/\r?\n/).pop();
          if (/^(trigger|effect|target|modifier|if)\s+$/i.test(line)) {
            openDslSuggest();
          }
        }
      });

      area.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
          e.preventDefault();
          openDslSuggest();
        }
      });

      root.querySelector("#dslCompleteBtn")?.addEventListener("click", openDslSuggest);

      function openDslSuggest() {
        const q = area.value.slice(0, area.selectionStart).split(/\s+/).pop().toLowerCase();
        const picks = DSL_KEYWORDS.filter((k) => !q || k.toLowerCase().includes(q)).slice(0, 18);
        if (!picks.length) {
          suggest.style.display = "none";
          return;
        }
        suggest.innerHTML = "";
        picks.forEach((w) => {
          const btn = document.createElement("button");
          btn.className = "ideSmallBtn";
          btn.style.margin = "2px";
          btn.textContent = w;
          btn.addEventListener("click", () => {
            insertAtCursor(area, w + " ");
            state.dslText = area.value;
            syncGraphFromDsl();
            renderAll();
            suggest.style.display = "none";
          });
          suggest.appendChild(btn);
        });
        suggest.style.display = "block";
      }
    }

    function insertAtCursor(area, text) {
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const before = area.value.slice(0, start);
      const after = area.value.slice(end);
      area.value = `${before}${text}${after}`;
      const pos = start + text.length;
      area.selectionStart = pos;
      area.selectionEnd = pos;
      area.focus();
    }

    function bindToolbarActions() {
      root.querySelector("#graphUndoBtn")?.addEventListener("click", undo);
      root.querySelector("#graphRedoBtn")?.addEventListener("click", redo);
      root.querySelector("#graphAutoConnectBtn")?.addEventListener("click", () => {
        const ids = Array.from(state.selectedNodeIds);
        if (ids.length < 2) {
          log("Connectは2ノード以上選択が必要です");
          return;
        }
        pushUndo("connect-selected");
        for (let i = 0; i < ids.length - 1; i += 1) addEdge(ids[i], ids[i + 1]);
        syncDslFromGraph();
        renderDsl();
        requestRenderGraph();
      });
      root.querySelector("#graphFitBtn")?.addEventListener("click", () => {
        if (!state.graph.nodes.length) return;
        const xs = state.graph.nodes.map((n) => Number(n.x || 0));
        const ys = state.graph.nodes.map((n) => Number(n.y || 0));
        const minX = Math.min(...xs), maxX = Math.max(...xs) + 180;
        const minY = Math.min(...ys), maxY = Math.max(...ys) + 60;
        const wrap = root.querySelector("#nodeCanvasWrap");
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const scale = Math.max(0.35, Math.min(1.4, Math.min(w / Math.max(120, maxX - minX), h / Math.max(120, maxY - minY)) * 0.9));
        state.viewport.scale = scale;
        state.viewport.x = Math.round((w - (maxX - minX) * scale) / 2 - minX * scale);
        state.viewport.y = Math.round((h - (maxY - minY) * scale) / 2 - minY * scale);
        requestRenderGraph();
      });

      root.querySelectorAll(".drawerTab").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.drawerTarget;
          if (!target) return;
          openUtilityDrawer(target);
        });
      });
      root.querySelector("#closeUtilityDrawerBtn")?.addEventListener("click", closeUtilityDrawer);
      root.querySelector("#utilityDrawerModal")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeUtilityDrawer();
      });

      root.querySelector("#openCardMenuBtn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = root.querySelector("#cardMenuPopup");
        if (!menu) return;
        menu.style.display = menu.style.display === "none" ? "grid" : "none";
      });
      root.addEventListener("click", (e) => {
        const menu = root.querySelector("#cardMenuPopup");
        if (!menu) return;
        if (!e.target.closest(".cardMenuWrap")) menu.style.display = "none";
      });

      root.querySelectorAll(".cardHotspot").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const field = el.dataset.cardField;
          if (!field) return;
          openCardFieldModal(field);
        });
      });
      root.querySelector("#closeCardFieldBtn")?.addEventListener("click", closeCardFieldModal);
      root.querySelector("#cancelCardFieldBtn")?.addEventListener("click", closeCardFieldModal);
      root.querySelector("#saveCardFieldBtn")?.addEventListener("click", commitCardFieldModal);
      root.querySelector("#cardFieldModal")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeCardFieldModal();
      });

      root.querySelector("#rebuildOutputBtn")?.addEventListener("click", renderOutputPreview);

      root.querySelector("#emitOnPlayBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        if (!runtime()) return;
        runtime().emitGameEvent("OnPlay", { owner: "player1", sourceCardId: card?.id || "manual", payload: { from: "dev-editor" } }, { owner: "player1" });
        renderEventPanels();
      });

      root.querySelector("#refreshRuntimeBtn")?.addEventListener("click", renderEventPanels);
      root.querySelector("#replayPrevBtn")?.addEventListener("click", () => {
        const rows = runtime()?.replayDebugger?.rows?.() || [];
        if (!rows.length) return;
        state.replayCursor = Math.max(0, state.replayCursor - 1);
        renderEventPanels();
      });
      root.querySelector("#replayNextBtn")?.addEventListener("click", () => {
        const rows = runtime()?.replayDebugger?.rows?.() || [];
        if (!rows.length) return;
        state.replayCursor = Math.min(rows.length - 1, state.replayCursor + 1);
        renderEventPanels();
      });
      root.querySelector("#clearLogBtn")?.addEventListener("click", () => {
        state.logs = [];
        log("log cleared");
      });

      root.querySelector("#ideAddCardBtn")?.addEventListener("click", () => {
        const card = createNewCardRow();
        state.cards.push(card);
        state.selectedId = card.id;
        applyCardToEditor(card);
        renderAll();
        log(`カード追加: ${card.id}`);
      });

      root.querySelector("#ideDeleteCardBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        if (!card) return;
        if (!confirm(`カード ${card.id} を削除しますか？`)) return;
        state.cards = state.cards.filter((c) => c.id !== card.id);
        state.selectedId = state.cards[0]?.id || "";
        if (state.selectedId) applyCardToEditor(selectedCard());
        renderAll();
        log(`カード削除: ${card.id}`);
      });

      root.querySelector("#saveCardsBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        if (card) {
          saveFormToCard(card);
          saveEditorToCard(card);
        }
        downloadCardsJson();
      });
      root.querySelector("#saveCardsTopBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        if (card) {
          saveFormToCard(card);
          saveEditorToCard(card);
        }
        downloadCardsJson();
      });

      root.querySelector("#ideSearch")?.addEventListener("input", (e) => {
        state.search = e.target.value || "";
        renderCardList();
      });
      root.querySelector("#ideTypeFilter")?.addEventListener("change", (e) => {
        state.typeFilter = e.target.value || "all";
        renderCardList();
      });
      root.querySelector("#ideAttrFilter")?.addEventListener("change", (e) => {
        state.attrFilter = e.target.value || "all";
        renderCardList();
      });
      root.querySelector("#nodeLibSearch")?.addEventListener("input", renderNodeLibrary);

      root.querySelector("#openCardPickerBtn")?.addEventListener("click", () => {
        const modal = root.querySelector("#cardPickerModal");
        const input = root.querySelector("#cardPickerSearch");
        if (!modal) return;
        modal.style.display = "flex";
        if (input) input.value = "";
        renderCardPickerList("");
      });
      root.querySelector("#closeCardPickerBtn")?.addEventListener("click", () => {
        const modal = root.querySelector("#cardPickerModal");
        if (modal) modal.style.display = "none";
      });
      root.querySelector("#cardPickerModal")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
      });
      root.querySelector("#cardPickerSearch")?.addEventListener("input", (e) => {
        renderCardPickerList(e.target.value || "");
      });

      root.querySelector("#closeNodeConfigBtn")?.addEventListener("click", closeNodeConfigModal);
      root.querySelector("#cancelNodeConfigBtn")?.addEventListener("click", closeNodeConfigModal);
      root.querySelector("#saveNodeConfigBtn")?.addEventListener("click", commitNodeConfig);
      root.querySelector("#nodeConfigModal")?.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closeNodeConfigModal();
      });
    }

    function bindSimulator() {
      if (!runtime()) return;
      state.sim = runtime().createCardSimulator({ hp: 20, pp: 2, turn: 1 });

      root.querySelector("#simApplyBtn")?.addEventListener("click", () => {
        const hp = Number(root.querySelector("#simHp")?.value || 20);
        const pp = Number(root.querySelector("#simPp")?.value || 2);
        state.sim.patch({ hp, pp });
        log(`Simulator state apply: HP=${hp}, PP=${pp}`);
      });
      root.querySelector("#simRunBtn")?.addEventListener("click", () => {
        const ev = root.querySelector("#simEvent")?.value || "OnPlay";
        const turn = Number(root.querySelector("#simTurn")?.value || 1);
        const hp = Number(root.querySelector("#simHp")?.value || 20);
        const pp = Number(root.querySelector("#simPp")?.value || 2);
        const card = selectedCard();
        if (!card) {
          log("Simulator run skipped: カード未選択");
          return;
        }
        saveFormToCard(card);
        saveEditorToCard(card);
        state.sim.patch({ hp, pp });
        const row = state.sim.run(ev, {
          owner: "player1",
          sourceCardId: card?.id || "sim",
          turn,
          payload: { from: "card-simulator" }
        });
        let execution = null;
        if (typeof runtime().simulateCardExecution === "function") {
          execution = runtime().simulateCardExecution(card, {
            owner: "player1",
            sourceCardId: card.id,
            eventName: ev,
            turn,
            hp,
            pp,
            zoneType: String(card.type || "") === "スキル" ? "skill" : "attacker",
            damage: ev === "OnDamage" ? 1 : 0,
            damageType: "damage",
            targetOwner: "player1"
          });
        }
        state.simLastResult = {
          cardId: card.id,
          eventName: ev,
          historyRowId: row.historyRow?.id || "",
          execution
        };
        const effectCount = Array.isArray(execution?.effects) ? execution.effects.length : 0;
        const err = execution?.error ? ` error=${execution.error.message || execution.error}` : "";
        log(`Simulator run: ${ev} -> ${row.historyRow.id} effects=${effectCount}${err}`);
        renderEventPanels();
        renderSimulatorResult();
      });
      root.querySelector("#simResetBtn")?.addEventListener("click", () => {
        state.sim = runtime().createCardSimulator({ hp: 20, pp: 2, turn: 1 });
        state.simLastResult = null;
        log("Simulator reset");
        renderSimulatorResult();
      });
    }

    function downloadCardsJson() {
      const out = state.cards.map((c) => {
        const row = clone(c);
        if (!runtime()) return row;
        try {
          const ast = runtime().parseDslText(String(c.effectDslText || ""));
          row.effectDsl = runtime().compileAstToDslV1(ast);
        } catch (_) {
          row.effectDsl = c.effectDsl || { format: "dependrap.dsl.v1", triggers: [] };
        }
        row.tags = Array.isArray(row.tags) ? row.tags : String(row.tags || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
        return row;
      });

      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cards.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log("cards.json をダウンロードしました");
    }

    function mount() {
      if (selectedCard()) applyCardToEditor(selectedCard());
      bindGraphInteractions();
      bindDslEditor();
      bindToolbarActions();
      bindSimulator();
      const onResize = () => renderCardVisual();
      window.addEventListener("resize", onResize);
      state.cardResizeHandler = onResize;
      state.editorApi = { undo, redo, hideContextMenu, deleteSelectedGraphElements };
      renderAll();
      state.runtimeTimer = setInterval(renderEventPanels, 1200);
    }

    function unmount() {
      const card = selectedCard();
      if (card) {
        saveFormToCard(card);
        saveEditorToCard(card);
      }
      hideContextMenu();
      state.editorApi = null;
      if (state.runtimeTimer) {
        clearInterval(state.runtimeTimer);
        state.runtimeTimer = null;
      }
      if (state.cardResizeHandler) {
        window.removeEventListener("resize", state.cardResizeHandler);
        state.cardResizeHandler = null;
      }
    }

    return { el: root, mount, unmount };
  }

  function generateCardId(cards) {
    let maxBlock = 1;
    let maxCard = 0;
    cards.forEach((c) => {
      const m = String(c.id || "").match(/^cd(\d{3})-(\d{3})$/);
      if (!m) return;
      const b = Number(m[1]);
      const n = Number(m[2]);
      if (b > maxBlock) {
        maxBlock = b;
        maxCard = n;
      } else if (b === maxBlock && n > maxCard) {
        maxCard = n;
      }
    });
    maxCard += 1;
    if (maxCard > 999) {
      maxBlock += 1;
      maxCard = 1;
    }
    return `cd${String(maxBlock).padStart(3, "0")}-${String(maxCard).padStart(3, "0")}`;
  }

  function mountView(name) {
    if (!appRoot) return;
    if (state.currentView?.unmount) state.currentView.unmount();
    appRoot.innerHTML = "";

    if (name === "cardEditor") {
      const view = buildCardEditorView();
      appRoot.appendChild(view.el);
      state.currentView = view;
      state.view = "cardEditor";
      view.mount();
      return;
    }

    const home = buildHomeView();
    appRoot.appendChild(home.el);
    state.currentView = home;
    state.view = "home";
    home.mount();
  }

  async function initData() {
    if (typeof window.loadCardData === "function") {
      await window.loadCardData();
      if (typeof window.getCardIds === "function" && typeof window.getCardData === "function") {
        const ids = window.getCardIds();
        state.cards = ids.map((id) => window.getCardData(id)).filter(Boolean).map((c) => ({
          ...clone(c),
          tags: Array.isArray(c.tags) ? clone(c.tags) : String(c.tags || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean)
        }));
      } else {
        const fallback = Array.isArray(window.CARD_DB) ? window.CARD_DB : [];
        state.cards = fallback.map((c) => ({
          ...clone(c),
          tags: Array.isArray(c.tags) ? clone(c.tags) : String(c.tags || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean)
        }));
      }
    }
    if (!state.cards.length) {
      state.cards = [];
    }
    state.selectedId = state.cards[0]?.id || "";
    const first = selectedCard();
    if (first) ensureV2ForCard(first);
  }

  async function init() {
    await initData();
    mountView("home");
    goHomeBtn?.addEventListener("click", () => {
      mountView("home");
    });
    closeDevModeBtn?.addEventListener("click", () => {
      const ok = confirm("開発者モードを閉じてタイトルへ戻りますか？");
      if (!ok) return;
      location.href = "index.html";
    });
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (state.view === "cardEditor") {
          e.preventDefault();
          state.editorApi?.undo?.();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (state.view === "cardEditor") {
          e.preventDefault();
          state.editorApi?.redo?.();
        }
      }
      if (e.key === "Escape") {
        state.editorApi?.hideContextMenu?.();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.view === "cardEditor") {
        const hasSelection = (state.selectedNodeIds?.size || 0) + (state.selectedEdgeIds?.size || 0) > 0;
        if (!hasSelection) return;
        e.preventDefault();
        state.editorApi?.deleteSelectedGraphElements?.();
      }
    });
    log("CardEditor IDE initialized");
  }

  init().catch((error) => {
    console.error(error);
    if (typeof window.showErrorMessage === "function") {
      window.showErrorMessage(`CardEditor初期化失敗: ${String(error?.message || error)}`);
    }
  });
})();
