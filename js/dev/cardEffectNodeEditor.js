(function() {
  function byId(id) {
    return document.getElementById(id);
  }

  function safeString(v) {
    return typeof v === "string" ? v : "";
  }

  function prettyJson(v) {
    try {
      return JSON.stringify(v, null, 2);
    } catch (_) {
      return "{}";
    }
  }

  function readJson(text) {
    try {
      return { ok: true, value: JSON.parse(String(text || "{}")) };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || "json parse error") };
    }
  }

  function getRuntime() {
    return window.CardEffectRuntimeV2 || null;
  }

  function renderPathPreview(graph) {
    const out = byId("effectPathPreview");
    if (!out) return;
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph?.edges) ? graph.edges : [];
    const byIdMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const outgoing = {};
    edges.forEach((e) => {
      if (!outgoing[e.from]) outgoing[e.from] = [];
      outgoing[e.from].push(e.to);
    });

    const starts = nodes.filter((n) => n.type === "trigger");
    if (!starts.length) {
      out.textContent = "(発動経路なし)";
      return;
    }

    const lines = starts.map((start) => {
      const parts = [String(start.label || start?.data?.event || "trigger")];
      let cur = start.id;
      const visited = new Set([cur]);
      for (let i = 0; i < 32; i += 1) {
        const nextId = (outgoing[cur] || [])[0];
        if (!nextId || visited.has(nextId)) break;
        visited.add(nextId);
        const n = byIdMap[nextId];
        if (!n) break;
        parts.push(String(n.label || n.type || "node"));
        cur = nextId;
        if (n.type === "end") break;
      }
      return parts.join(" -> ");
    });

    out.textContent = lines.join("\n");
  }

  function bindCard(card) {
    const runtime = getRuntime();
    const dslInput = byId("effectDslEditor");
    const graphInput = byId("effectGraphEditor");
    const status = byId("effectEditorStatus");
    if (!dslInput || !graphInput || !status) return;

    if (!card) {
      dslInput.value = "";
      graphInput.value = "{}";
      status.textContent = "カード未選択";
      renderPathPreview(null);
      return;
    }

    if (!runtime) {
      dslInput.value = safeString(card.effectDslText || "");
      graphInput.value = prettyJson(card.effectGraph || {});
      status.textContent = "CardEffectRuntimeV2 が未ロードです";
      renderPathPreview(card.effectGraph || null);
      return;
    }

    const migrated = card.effectGraph
      ? { ok: true, graph: card.effectGraph, dslText: safeString(card.effectDslText || "") }
      : card.effectBlocks
        ? runtime.migrateLegacyBlocks(card.effectBlocks)
        : { ok: false };

    let graph = card.effectGraph;
    let dslText = safeString(card.effectDslText || "");

    if ((!graph || !Array.isArray(graph.nodes)) && migrated?.ok) {
      graph = migrated.graph;
      if (!dslText) dslText = migrated.dslText;
      card.effectGraph = graph;
      card.effectDslText = dslText;
    }

    if ((!graph || !Array.isArray(graph.nodes)) && dslText.trim()) {
      const ast = runtime.parseDslText(dslText);
      graph = runtime.astToGraph(ast);
      card.effectGraph = graph;
    }

    if (!dslText.trim() && graph && Array.isArray(graph.nodes)) {
      const ast = runtime.graphToAst(graph);
      dslText = runtime.toDslText(ast);
      card.effectDslText = dslText;
    }

    dslInput.value = dslText;
    graphInput.value = prettyJson(graph || { format: runtime.GRAPH_FORMAT, nodes: [], edges: [] });
    status.textContent = migrated?.ok ? "旧block資産を移行済み" : "同期準備完了";
    renderPathPreview(graph || null);
  }

  function syncFromDsl() {
    const runtime = getRuntime();
    const dslInput = byId("effectDslEditor");
    const graphInput = byId("effectGraphEditor");
    const status = byId("effectEditorStatus");
    if (!runtime || !dslInput || !graphInput || !status) return;

    try {
      const ast = runtime.parseDslText(dslInput.value || "");
      const graph = runtime.astToGraph(ast);
      graphInput.value = prettyJson(graph);
      renderPathPreview(graph);
      status.textContent = "DSL -> Visual 同期済み";
      return { ok: true, ast, graph };
    } catch (error) {
      status.textContent = `DSL同期エラー: ${String(error?.message || error)}`;
      return { ok: false };
    }
  }

  function syncFromGraph() {
    const runtime = getRuntime();
    const dslInput = byId("effectDslEditor");
    const graphInput = byId("effectGraphEditor");
    const status = byId("effectEditorStatus");
    if (!runtime || !dslInput || !graphInput || !status) return;

    const parsed = readJson(graphInput.value || "{}");
    if (!parsed.ok) {
      status.textContent = `Visual同期エラー: ${parsed.error}`;
      return { ok: false };
    }

    try {
      const ast = runtime.graphToAst(parsed.value);
      const dslText = runtime.toDslText(ast);
      dslInput.value = dslText;
      renderPathPreview(parsed.value);
      status.textContent = "Visual -> DSL 同期済み";
      return { ok: true, ast, graph: parsed.value };
    } catch (error) {
      status.textContent = `Visual同期エラー: ${String(error?.message || error)}`;
      return { ok: false };
    }
  }

  function collectCardPayload(card) {
    const runtime = getRuntime();
    if (!runtime || !card) return null;

    const dslInput = byId("effectDslEditor");
    const graphInput = byId("effectGraphEditor");
    if (!dslInput || !graphInput) return null;

    const graphParsed = readJson(graphInput.value || "{}");
    if (!graphParsed.ok) return null;

    const ast = runtime.parseDslText(dslInput.value || "");
    const dslV1 = runtime.compileAstToDslV1(ast);

    return {
      effectDslText: dslInput.value || "",
      effectGraph: graphParsed.value,
      effectDsl: dslV1
    };
  }

  function install() {
    const dslBtn = byId("syncDslToVisualBtn");
    const graphBtn = byId("syncVisualToDslBtn");
    if (dslBtn) dslBtn.addEventListener("click", syncFromDsl);
    if (graphBtn) graphBtn.addEventListener("click", syncFromGraph);
  }

  install();

  window.CardEffectNodeEditor = {
    bindCard,
    syncFromDsl,
    syncFromGraph,
    collectCardPayload,
    renderPathPreview
  };
})();
