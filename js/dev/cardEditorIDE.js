(function() {
  const runtime = () => window.CardEffectRuntimeV2;
  const appRoot = document.getElementById("appRoot");
  const goHomeBtn = document.getElementById("goHomeBtn");

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
    undoStack: [],
    redoStack: [],
    viewport: { x: 0, y: 0, scale: 1 },
    drag: null,
    selectionRect: null,
    contextMenuEl: null,
    connectFrom: "",
    replayCursor: -1,
    sim: null,
    logs: [],
    runtimeTimer: null,
    editorApi: null
  };

  const NODE_LIBRARY = [
    { type: "trigger", category: "Trigger", label: "Trigger: OnPlay", data: { event: "OnPlay" } },
    { type: "trigger", category: "Trigger", label: "Trigger: OnAttack", data: { event: "OnAttack" } },
    { type: "trigger", category: "Trigger", label: "Trigger: OnDirectAttack", data: { event: "OnDirectAttack" } },
    { type: "trigger", category: "Trigger", label: "Trigger: OnDamage", data: { event: "OnDamage" } },
    { type: "trigger", category: "Trigger", label: "Trigger: OnTurnStart", data: { event: "OnTurnStart" } },
    { type: "trigger", category: "Trigger", label: "Trigger: OnTurnEnd", data: { event: "OnTurnEnd" } },
    { type: "condition", category: "Condition", label: "Condition", data: { expression: "event.damage > 0" } },
    { type: "target", category: "Target", label: "Target", data: { target: "current_target" } },
    { type: "effect", category: "Effect", label: "Effect", data: { action: "draw", args: ["1"] } },
    { type: "modifier", category: "Modifier", label: "Modifier", data: { action: "once_per_turn", args: [] } },
    { type: "end", category: "Flow", label: "End", data: {} },
    { type: "variable", category: "Variable", label: "Variable", data: { name: "x", value: "0" } },
    { type: "history", category: "History", label: "History", data: { expression: "history.event.OnDraw.count >= 1" } },
    { type: "math", category: "Math", label: "Math", data: { expression: "add 1 2" } },
    { type: "custom", category: "Custom", label: "Custom", data: { note: "" } }
  ];

  const DSL_KEYWORDS = [
    "trigger", "if", "target", "effect", "modifier", "end",
    "OnPlay", "OnAttack", "OnDirectAttack", "OnTurnStart", "OnTurnEnd", "OnLeaveField",
    "draw", "damage", "heal", "add_pp", "add_status", "current_target", "self", "self_and_current_target"
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
      viewport: clone(state.viewport)
    });
    if (state.undoStack.length > 200) state.undoStack.splice(0, state.undoStack.length - 200);
    state.redoStack = [];
  }

  function restoreSnapshot(snapshot) {
    state.graph = clone(snapshot.graph);
    state.dslText = snapshot.dslText;
    state.selectedNodeIds = new Set(snapshot.selectedNodeIds || []);
    state.viewport = clone(snapshot.viewport || { x: 0, y: 0, scale: 1 });
    renderAll();
  }

  function undo() {
    if (!state.undoStack.length) return;
    const cur = {
      graph: clone(state.graph),
      dslText: state.dslText,
      selectedNodeIds: Array.from(state.selectedNodeIds),
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
    `;

    root.querySelector("#openCardEditorBtn")?.addEventListener("click", () => mountView("cardEditor"));
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
        <div class="leftStack">
          <section class="idePanel">
            <div class="idePanelHeader">
              <span>Card List</span>
              <div style="display:flex;gap:6px;">
                <span id="currentCardBadge" class="chip" style="align-self:center;">未選択</span>
                <button class="ideSmallBtn" id="ideAddCardBtn">追加</button>
                <button class="ideSmallBtn danger" id="ideDeleteCardBtn">削除</button>
              </div>
            </div>
            <div class="idePanelBody">
              <div class="cardListTools">
                <input id="ideSearch" placeholder="検索: name/tag/effect">
                <div class="formRow2">
                  <select id="ideTypeFilter">
                    <option value="all">種別: すべて</option>
                    <option value="アタッカー">アタッカー</option>
                    <option value="スキル">スキル</option>
                    <option value="サポート">サポート</option>
                  </select>
                  <select id="ideAttrFilter">
                    <option value="all">属性: すべて</option>
                    <option value="近接">近接</option>
                    <option value="遠隔">遠隔</option>
                    <option value="魔法">魔法</option>
                  </select>
                </div>
              </div>
              <div id="ideCardList" class="cardList"></div>
            </div>
          </section>
          <section class="idePanel">
            <div class="idePanelHeader"><span>Node Library</span><input id="nodeLibSearch" style="width:130px" placeholder="検索"></div>
            <div class="idePanelBody">
              <div id="nodeLibList" class="nodeLib"></div>
            </div>
          </section>
        </div>

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
                <div class="dslPreview" id="dslHighlight"></div>
              </div>
              <div id="dslSuggestBox" style="display:none; margin-top:6px; border:1px solid #355a88; border-radius:8px; padding:6px; background:#0d1a2f;"></div>
            </div>
          </section>
          <section class="idePanel">
            <div class="idePanelHeader">
              <span>Inspector</span>
              <button class="ideSmallBtn" id="legacyToggleBtn">旧ブロック表示</button>
            </div>
            <div class="idePanelBody">
              <div class="cardInfoForm" id="cardInfoForm"></div>
              <hr style="border-color:#243a5d; margin:10px 0;">
              <div class="inspectorForm" id="nodeInspector"></div>
              <div class="legacyBlockBox" id="legacyBlockBox" style="display:none; margin-top:10px;">
                <textarea id="legacyBlocksText" rows="8" placeholder="effectBlocks JSON"></textarea>
                <div class="simActionRow" style="margin-top:6px;">
                  <button id="legacyImportBtn" class="ideSmallBtn">Legacy JSON 読込</button>
                  <button id="legacyMigrateBtn" class="ideSmallBtn">Legacy -> Node/DSL</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="logGrid">
        <section class="idePanel">
          <div class="idePanelHeader"><span>Event Engine Viewer</span><button class="ideSmallBtn" id="emitOnPlayBtn">OnPlay発火</button></div>
          <div class="idePanelBody"><div class="logList" id="eventEngineViewer"></div></div>
        </section>
        <section class="idePanel">
          <div class="idePanelHeader"><span>Runtime Inspector</span><button class="ideSmallBtn" id="refreshRuntimeBtn">Refresh</button></div>
          <div class="idePanelBody"><div class="logList" id="runtimeInspectorView"></div></div>
        </section>
        <section class="idePanel">
          <div class="idePanelHeader"><span>Replay Debugger</span><div style="display:flex;gap:6px;"><button class="ideSmallBtn" id="replayPrevBtn">◀</button><button class="ideSmallBtn" id="replayNextBtn">▶</button></div></div>
          <div class="idePanelBody"><div class="logList" id="replayView"></div></div>
        </section>
        <section class="idePanel">
          <div class="idePanelHeader"><span>Log Viewer</span><button class="ideSmallBtn" id="clearLogBtn">Clear</button></div>
          <div class="idePanelBody"><pre id="ideLogViewer" style="margin:0; white-space:pre-wrap; font-size:11px;"></pre></div>
        </section>
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
            </div>
          </div>
        </section>
        <section class="idePanel">
          <div class="idePanelHeader"><span>Output Preview</span><button class="ideSmallBtn" id="rebuildOutputBtn">再生成</button></div>
          <div class="idePanelBody"><div class="logList" id="outputPreview"></div></div>
        </section>
      </div>
    `;

    let raf = 0;

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
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#67c7ff");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("opacity", "0.88");
        edgeLayer.appendChild(path);
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
            <span class="nodeCategory">${htmlEscape(node.type)}</span>
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
      if (node.type === "trigger") return String(d.event || "OnPlay");
      if (node.type === "condition") return String(d.expression || "");
      if (node.type === "target") return String(d.target || "self");
      if (node.type === "effect") return `${d.action || "effect"} ${(d.args || []).join(" ")}`.trim();
      if (node.type === "modifier") return `${d.action || "modifier"} ${(d.args || []).join(" ")}`.trim();
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
        btn.addEventListener("click", () => {
          const prev = selectedCard();
          if (prev) {
            saveFormToCard(prev);
            saveEditorToCard(prev);
          }
          state.selectedId = card.id;
          applyCardToEditor(card);
          renderAll();
        });
        listEl.appendChild(btn);
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
          pushUndo("add-node");
          const center = fromScreenToWorld(window.innerWidth * 0.5, window.innerHeight * 0.35);
          const id = `node-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
          const node = {
            id,
            type: item.type,
            label: item.label,
            data: clone(item.data || {}),
            x: Math.round(center.x),
            y: Math.round(center.y)
          };
          state.graph.nodes.push(node);
          state.selectedNodeIds = new Set([id]);
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
          log(`ノード追加: ${item.label}`);
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
          <input data-k="attack" type="number" value="${Number(card.attack || 0)}" placeholder="攻撃力">
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
      card.name = String(map.name || "");
      card.type = String(map.type || "アタッカー");
      card.attribute = String(map.attribute || "近接");
      card.attack = Math.max(0, Math.floor(Number(map.attack || 0)));
      card.cost = Math.max(0, Number(map.cost || 0));
      card.causalRate = Number(map.causalRate || 0);
      card.tags = String(map.tags || "").split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);
      card.image = String(map.image || "");
      card.effectText = String(map.effectText || "");
      renderCardList();
    }

    function renderInspector() {
      const wrap = root.querySelector("#nodeInspector");
      const ids = Array.from(state.selectedNodeIds);
      if (!wrap) return;
      if (!ids.length) {
        wrap.innerHTML = `<div style="color:#89a4cc;font-size:12px;">ノード未選択</div>`;
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
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        });
        return;
      }

      const node = nodeById(ids[0]);
      if (!node) return;

      const eventValue = String(node.data?.event || "OnPlay");
      const actionValue = String(node.data?.action || "draw");
      const targetValue = String(node.data?.target || "current_target");
      const expressionValue = String(node.data?.expression || "");
      const argsText = Array.isArray(node.data?.args) ? node.data.args.join(" ") : "";
      wrap.innerHTML = `
        <input data-k="label" value="${htmlEscape(node.label || "")}" placeholder="ノード名">
        <input data-k="type" value="${htmlEscape(node.type || "")}" readonly>
        <input data-k="x" type="number" value="${Number(node.x || 0)}" placeholder="x">
        <input data-k="y" type="number" value="${Number(node.y || 0)}" placeholder="y">
        <select data-k="event" ${node.type === "trigger" ? "" : "disabled"}>
          ${["OnPlay","OnAttack","OnDirectAttack","OnDraw","OnDiscard","OnLeaveField","OnReturnHand","OnDamage","OnPenetrateDamage","OnTurnStart","OnTurnEnd","OnEffectAdded","OnEffectRemoved"]
            .map((e) => `<option value="${e}" ${eventValue === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
        <input data-k="expression" value="${htmlEscape(expressionValue)}" placeholder="条件/履歴参照" ${node.type === "condition" || node.type === "history" || node.type === "math" ? "" : "disabled"}>
        <select data-k="target" ${node.type === "target" ? "" : "disabled"}>
          ${["self","current_target","self_and_current_target"].map((v) => `<option value="${v}" ${targetValue === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <select data-k="action" ${node.type === "effect" || node.type === "modifier" ? "" : "disabled"}>
          ${["draw","damage","heal","add_pp","add_status","once_per_turn","set_flag","clear_flag"].map((v) => `<option value="${v}" ${actionValue === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <input data-k="args" value="${htmlEscape(argsText)}" placeholder="引数（スペース区切り）" ${node.type === "effect" || node.type === "modifier" ? "" : "disabled"}>
        <div class="simActionRow">
          <button class="ideSmallBtn" id="dupNodeBtn">複製</button>
          <button class="ideSmallBtn danger" id="delNodeBtn">削除</button>
        </div>
      `;

      wrap.querySelectorAll("input[data-k], select[data-k]").forEach((input) => {
        input.addEventListener("input", () => {
          pushUndo("node-edit");
          node.label = wrap.querySelector('[data-k="label"]').value;
          node.x = Number(wrap.querySelector('[data-k="x"]').value || 0);
          node.y = Number(wrap.querySelector('[data-k="y"]').value || 0);
          if (node.type === "trigger") node.data.event = wrap.querySelector('[data-k="event"]').value;
          if (node.type === "condition" || node.type === "history" || node.type === "math") node.data.expression = wrap.querySelector('[data-k="expression"]').value;
          if (node.type === "target") node.data.target = wrap.querySelector('[data-k="target"]').value;
          if (node.type === "effect" || node.type === "modifier") {
            node.data.action = wrap.querySelector('[data-k="action"]').value;
            node.data.args = String(wrap.querySelector('[data-k="args"]').value || "").split(/\s+/).filter(Boolean);
          }
          syncDslFromGraph();
          renderDsl();
          requestRenderGraph();
        });
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
      runtimeView.textContent = [
        `pending: ${snap.pendingEffects.length}`,
        `stack: ${snap.effectStack.length}`,
        `persistent: ${snap.persistentEffects.length}`,
        `temporary: ${snap.temporaryEffects.length}`,
        `events: ${(snap.registeredEvents || []).map((x) => `${x.eventName}:${x.subscribers}`).join(", ") || "none"}`,
        `flags: ${(snap.activatedFlags || []).length}`,
        `inherited: ${(snap.inheritedLinks || []).length}`
      ].join("\n");

      const replayRows = runtime().replayDebugger.rows();
      if (state.replayCursor < 0 && replayRows.length) state.replayCursor = replayRows.length - 1;
      const current = replayRows[state.replayCursor] || null;
      replayView.textContent = current
        ? `cursor: ${state.replayCursor + 1}/${replayRows.length}\n${JSON.stringify(current, null, 2)}`
        : "(no replay data)";
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
        `ATK:${Number(card.attack || 0)} COST:${Number(card.cost || 0)} 因果率:${Number(card.causalRate || 0)}`,
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
      renderCardList();
      renderCardInfo();
      renderNodeLibrary();
      renderLegacyBlocks();
      renderEventPanels();
      renderOutputPreview();
    }

    function addEdge(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return;
      const exists = state.graph.edges.some((e) => e.from === fromId && e.to === toId);
      if (exists) return;
      state.graph.edges.push({ id: `edge-${Date.now()}-${Math.floor(Math.random() * 1e5)}`, from: fromId, to: toId, kind: "flow" });
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

        if (e.button === 1) {
          state.drag = { type: "pan", startX: e.clientX, startY: e.clientY, baseX: state.viewport.x, baseY: state.viewport.y };
          return;
        }

        if (!nodeEl) {
          if (e.button !== 0) return;
          if (e.shiftKey) {
            const { x, y } = fromScreenToWorld(e.clientX, e.clientY);
            if (!e.ctrlKey && !e.metaKey) state.selectedNodeIds = new Set();
            state.selectionRect = { sx: x, sy: y, ex: x, ey: y };
            requestRenderGraph();
          } else {
            state.drag = { type: "pan", startX: e.clientX, startY: e.clientY, baseX: state.viewport.x, baseY: state.viewport.y };
          }
          return;
        }

        const nodeId = nodeEl.dataset.nodeId;
        if (e.button === 2) {
          if (!state.selectedNodeIds.has(nodeId)) state.selectedNodeIds = new Set([nodeId]);
          requestRenderGraph();
          openContextMenu(e.clientX, e.clientY, nodeId);
          return;
        }

        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey) {
          if (state.selectedNodeIds.has(nodeId)) state.selectedNodeIds.delete(nodeId);
          else state.selectedNodeIds.add(nodeId);
        } else if (!state.selectedNodeIds.has(nodeId)) {
          state.selectedNodeIds = new Set([nodeId]);
        }

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
        if (nodeEl) {
          openContextMenu(e.clientX, e.clientY, nodeEl.dataset.nodeId);
        } else {
          openContextMenu(e.clientX, e.clientY, "");
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
      if (livePreview === true) renderInspector();
      requestRenderGraph();
    }

    function openContextMenu(x, y, nodeId) {
      hideContextMenu();
      const menu = document.createElement("div");
      menu.className = "contextMenu";
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;

      const actions = [];
      if (nodeId) {
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
      } else {
        NODE_LIBRARY.slice(0, 6).forEach((item) => {
          actions.push({ label: `${item.label} 追加`, run: () => {
            pushUndo("add-node-context");
            const world = fromScreenToWorld(x, y);
            const node = {
              id: `node-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
              type: item.type,
              label: item.label,
              data: clone(item.data || {}),
              x: Math.round(world.x),
              y: Math.round(world.y)
            };
            state.graph.nodes.push(node);
            state.selectedNodeIds = new Set([node.id]);
            syncDslFromGraph();
            renderDsl();
            requestRenderGraph();
          }});
        });
      }

      actions.forEach((action) => {
        const btn = document.createElement("button");
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
          hideContextMenu();
          action.run();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
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

      root.querySelector("#legacyToggleBtn")?.addEventListener("click", () => {
        const box = root.querySelector("#legacyBlockBox");
        if (!box) return;
        box.style.display = box.style.display === "none" ? "block" : "none";
      });

      root.querySelector("#legacyImportBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        const text = root.querySelector("#legacyBlocksText")?.value || "{}";
        try {
          const obj = JSON.parse(text);
          card.effectBlocks = obj;
          log("Legacy blocks を更新しました");
        } catch (e) {
          state.dslError = `Legacy JSONエラー: ${String(e?.message || e)}`;
          renderDsl();
        }
      });

      root.querySelector("#legacyMigrateBtn")?.addEventListener("click", () => {
        const card = selectedCard();
        if (!card || !runtime()) return;
        const migrated = runtime().migrateLegacyBlocks(card.effectBlocks || {});
        if (!migrated?.ok) {
          log(`Legacy移行失敗: ${migrated?.reason || "unknown"}`);
          return;
        }
        pushUndo("legacy-migrate");
        card.effectGraph = migrated.graph;
        card.effectDslText = migrated.dslText;
        applyCardToEditor(card);
        renderAll();
        log("Legacy -> Node/DSL へ移行しました");
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
        const next = generateCardId(state.cards);
        const card = {
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
        const card = selectedCard();
        const row = state.sim.run(ev, { owner: "player1", sourceCardId: card?.id || "sim", turn });
        log(`Simulator run: ${ev} -> ${row.historyRow.id}`);
        renderEventPanels();
      });
      root.querySelector("#simResetBtn")?.addEventListener("click", () => {
        state.sim = runtime().createCardSimulator({ hp: 20, pp: 2, turn: 1 });
        log("Simulator reset");
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
      state.editorApi = { undo, redo, hideContextMenu };
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
    goHomeBtn?.addEventListener("click", () => mountView("home"));
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
