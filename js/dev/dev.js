// ===== 状態 =====
let devCards = [];
let pendingImages = {};
let selectedId = null;
let cardSearchQuery = "";
let cardSortMode = "idAsc";
const BLOCK_TARGET_OPTIONS = [
  { value: "self_player", label: "自身プレイヤー" },
  { value: "current_target", label: "現在のターゲット" },
  { value: "self_and_current_target", label: "自身と現在のターゲット" }
];
const DAMAGE_TYPE_OPTIONS = [
  { value: "damage", label: "通常" },
  { value: "pierce", label: "貫通" },
  { value: "fragile", label: "脆弱" },
  { value: "arcana", label: "アルカナ" }
];
const DAMAGE_ATTR_OPTIONS = [
  { value: "none", label: "なし" },
  { value: "additional", label: "追加" }
];
const TRACKER_SCOPE_OPTIONS = [
  { value: "turn", label: "このターン中" },
  { value: "game", label: "ゲーム中" }
];
const TRACKER_STAT_OPTIONS = [
  { value: "hp", label: "HP" },
  { value: "pp", label: "PP" },
  { value: "shield", label: "Shield" },
  { value: "atk", label: "ATK" },
  { value: "defstack", label: "DEFStack" }
];
const TRACKER_DIRECTION_OPTIONS = [
  { value: "inc", label: "増" },
  { value: "dec", label: "減" },
  { value: "both", label: "増減" }
];
const TRACKER_METRIC_OPTIONS = [
  { value: "amount", label: "量" },
  { value: "count", label: "回数" }
];
const TRACKER_OP_OPTIONS = [
  { value: "gte", label: "以上" },
  { value: "gt", label: "より大きい" },
  { value: "eq", label: "等しい" },
  { value: "lte", label: "以下" },
  { value: "lt", label: "より小さい" }
];
const ATTACKER_TIMINGS = ["onSummon", "onAttack", "onDirectAttack", "onTurnStart", "onTurnEnd", "onLeave", "continuous", "manual"];
const SKILL_TIMINGS = ["onSkillBeforeAttackEffect", "onSkillAfterAttackEffect", "continuous", "manual"];

function getSelectedCard() {
  if (!selectedId) return null;
  return devCards.find((c) => c.id === selectedId) || null;
}

function createEmptyEffectBlocks() {
  if (window.CardEffectBlockCompiler && typeof window.CardEffectBlockCompiler.createEmptyProgram === "function") {
    return window.CardEffectBlockCompiler.createEmptyProgram();
  }
  return { format: "dependrap.effectblocks.v1", timings: [] };
}

function ensureEffectBlocks(card) {
  if (!card) return null;
  if (!card.effectBlocks || !Array.isArray(card.effectBlocks.timings)) {
    card.effectBlocks = createEmptyEffectBlocks();
  }
  return card.effectBlocks;
}

function getTimingLabel(timingId) {
  const list = window.CardEffectBlockCatalog?.TIMINGS || [];
  const hit = list.find((t) => t.id === timingId);
  return hit ? hit.label : timingId;
}

function getKindsByCategory(categoryId) {
  return (window.CardEffectBlockCatalog?.EFFECT_BLOCKS || []).filter((b) => b.category === categoryId);
}

function createDefaultEffectByCategory(categoryId) {
  const kinds = getKindsByCategory(categoryId);
  const first = kinds[0];
  if (!first) return null;
  const base = {
    category: categoryId,
    kind: first.id,
    target: "self_player",
    value: 1,
    useCondition: false,
    condition: {
      whileOnField: false,
      thisTurn: true,
      trackerCheck: {
        owner: "self",
        scope: "turn",
        stat: "hp",
        direction: "inc",
        metric: "amount",
        op: "gte",
        value: 0
      }
    }
  };
  if (first.id === "damage") {
    base.damageType = "damage";
    base.damageAttr = "none";
  }
  if (first.id === "hp_reduce") {
    base.value = 1;
  }
  return base;
}

function renderTimingSelectOptions() {
  const select = document.getElementById("newTimingSelect");
  if (!select) return;
  const context = document.getElementById("timingContextSelect")?.value || "attacker";
  const allowed = context === "skill" ? SKILL_TIMINGS : ATTACKER_TIMINGS;
  const timings = (window.CardEffectBlockCatalog?.TIMINGS || []).filter((t) => allowed.includes(t.id));
  select.innerHTML = timings.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
}

function renderEffectBlocksEditor() {
  const card = getSelectedCard();
  const container = document.getElementById("effectBlocksContainer");
  const useBlocks = document.getElementById("useEffectBlocks");
  const summary = document.getElementById("effectBlocksSummary");
  if (!container || !useBlocks || !summary) return;

  if (!card || !useBlocks.checked) {
    container.innerHTML = "";
    summary.textContent = "テキストDSLのみ使用";
    return;
  }

  const program = ensureEffectBlocks(card);
  const timingCount = program.timings.length;
  const effectCount = program.timings.reduce((n, t) => n + (Array.isArray(t.effects) ? t.effects.length : 0), 0);
  summary.textContent = `${timingCount}タイミング / ${effectCount}効果ブロック`;
  container.innerHTML = "";

  program.timings.forEach((timing, ti) => {
    const timingEl = document.createElement("div");
    timingEl.className = "timingCard";
    timingEl.innerHTML = `
      <div class="blockRow">
        <strong>${getTimingLabel(timing.timing)}</strong>
        <select data-role="timingSelect"></select>
        <button type="button" data-role="addEffect">効果を追加</button>
        <button type="button" data-role="removeTiming" style="background:#fbe7e7;border:1px solid #e0a0a0;">このタイミングを削除</button>
      </div>
      <div data-role="effectList"></div>
    `;
    const timingSelect = timingEl.querySelector('[data-role="timingSelect"]');
    timingSelect.innerHTML = (window.CardEffectBlockCatalog?.TIMINGS || [])
      .filter((t) => ATTACKER_TIMINGS.includes(t.id) || SKILL_TIMINGS.includes(t.id) || t.id === timing.timing)
      .map((t) => `<option value="${t.id}" ${t.id === timing.timing ? "selected" : ""}>${t.label}</option>`)
      .join("");
    timingSelect.addEventListener("change", (e) => {
      timing.timing = e.target.value;
      renderEffectBlocksEditor();
    });
    timingEl.querySelector('[data-role="addEffect"]').addEventListener("click", () => {
      const added = createDefaultEffectByCategory("damage");
      if (!added) return;
      if (!Array.isArray(timing.effects)) timing.effects = [];
      timing.effects.push(added);
      renderEffectBlocksEditor();
    });
    timingEl.querySelector('[data-role="removeTiming"]').addEventListener("click", () => {
      program.timings.splice(ti, 1);
      renderEffectBlocksEditor();
    });

    const effectList = timingEl.querySelector('[data-role="effectList"]');
    (timing.effects || []).forEach((effect, ei) => {
      const effectEl = document.createElement("div");
      effectEl.className = "effectRow";
      effectEl.innerHTML = `
        <div class="blockRow">
          <span style="font-size:12px;color:#666;">カテゴリ</span>
          <select data-role="category"></select>
          <span style="font-size:12px;color:#666;">効果</span>
          <select data-role="kind"></select>
          <span style="font-size:12px;color:#666;">対象</span>
          <select data-role="target"></select>
          <span style="font-size:12px;color:#666;">値</span>
          <input data-role="value" type="number" style="width:80px;" value="${Number(effect.value ?? 1)}">
          <button type="button" data-role="removeEffect" style="background:#fbe7e7;border:1px solid #e0a0a0;">削除</button>
        </div>
        <div class="blockRow" data-role="damageExtra" style="display:none;">
          <span style="font-size:12px;color:#666;">ダメージタイプ</span>
          <select data-role="damageType"></select>
          <span style="font-size:12px;color:#666;">ダメージ属性</span>
          <select data-role="damageAttr"></select>
        </div>
        <div class="blockRow" style="border-top:1px solid #eee;padding-top:6px;">
          <label style="font-size:12px;color:#333;"><input type="checkbox" data-role="useCondition"> 条件を使う</label>
        </div>
        <div class="blockRow" data-role="conditionArea" style="border-top:1px solid #eee;padding-top:6px;">
          <label style="font-size:12px;color:#666;"><input type="checkbox" data-role="whileOnField"> これが場にある間</label>
          <label style="font-size:12px;color:#666;"><input type="checkbox" data-role="thisTurn"> このターン中</label>
        </div>
        <div class="blockRow" data-role="conditionArea" style="align-items:flex-end;">
          <span style="font-size:12px;color:#666;">記録条件</span>
          <select data-role="trackerOwner"></select>
          <select data-role="trackerScope"></select>
          <select data-role="trackerStat"></select>
          <select data-role="trackerDirection"></select>
          <select data-role="trackerMetric"></select>
          <select data-role="trackerOp"></select>
          <input data-role="trackerValue" type="number" style="width:90px;" value="0">
        </div>
      `;

      const categorySelect = effectEl.querySelector('[data-role="category"]');
      const kindSelect = effectEl.querySelector('[data-role="kind"]');
      const targetSelect = effectEl.querySelector('[data-role="target"]');
      const valueInput = effectEl.querySelector('[data-role="value"]');
      const damageExtra = effectEl.querySelector('[data-role="damageExtra"]');
      const damageTypeInput = effectEl.querySelector('[data-role="damageType"]');
      const damageAttrInput = effectEl.querySelector('[data-role="damageAttr"]');
      const useConditionInput = effectEl.querySelector('[data-role="useCondition"]');
      const whileOnFieldInput = effectEl.querySelector('[data-role="whileOnField"]');
      const thisTurnInput = effectEl.querySelector('[data-role="thisTurn"]');
      const trackerOwnerInput = effectEl.querySelector('[data-role="trackerOwner"]');
      const trackerScopeInput = effectEl.querySelector('[data-role="trackerScope"]');
      const trackerStatInput = effectEl.querySelector('[data-role="trackerStat"]');
      const trackerDirectionInput = effectEl.querySelector('[data-role="trackerDirection"]');
      const trackerMetricInput = effectEl.querySelector('[data-role="trackerMetric"]');
      const trackerOpInput = effectEl.querySelector('[data-role="trackerOp"]');
      const trackerValueInput = effectEl.querySelector('[data-role="trackerValue"]');
      const conditionAreas = effectEl.querySelectorAll('[data-role="conditionArea"]');

      if (!effect.condition || typeof effect.condition !== "object") {
        effect.condition = {};
      }
      if (!effect.condition.trackerCheck || typeof effect.condition.trackerCheck !== "object") {
        effect.condition.trackerCheck = {};
      }

      categorySelect.innerHTML = (window.CardEffectBlockCatalog?.EFFECT_CATEGORIES || [])
        .map((c) => `<option value="${c.id}" ${c.id === effect.category ? "selected" : ""}>${c.label}</option>`)
        .join("");
      targetSelect.innerHTML = BLOCK_TARGET_OPTIONS
        .map((t) => `<option value="${t.value}" ${t.value === (effect.target || "self_player") ? "selected" : ""}>${t.label}</option>`)
        .join("");
      damageTypeInput.innerHTML = DAMAGE_TYPE_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.damageType || "damage") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      damageAttrInput.innerHTML = DAMAGE_ATTR_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.damageAttr || "none") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerOwnerInput.innerHTML = `<option value="self" ${(effect.condition.trackerCheck.owner || "self") === "self" ? "selected" : ""}>自身</option><option value="target" ${(effect.condition.trackerCheck.owner || "self") === "target" ? "selected" : ""}>現在ターゲット</option>`;
      trackerScopeInput.innerHTML = TRACKER_SCOPE_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.condition.trackerCheck.scope || "turn") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerStatInput.innerHTML = TRACKER_STAT_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.condition.trackerCheck.stat || "hp") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerDirectionInput.innerHTML = TRACKER_DIRECTION_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.condition.trackerCheck.direction || "inc") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerMetricInput.innerHTML = TRACKER_METRIC_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.condition.trackerCheck.metric || "amount") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerOpInput.innerHTML = TRACKER_OP_OPTIONS
        .map((x) => `<option value="${x.value}" ${x.value === (effect.condition.trackerCheck.op || "gte") ? "selected" : ""}>${x.label}</option>`)
        .join("");
      trackerValueInput.value = String(Number(effect.condition.trackerCheck.value || 0));
      whileOnFieldInput.checked = effect.condition.whileOnField === true;
      thisTurnInput.checked = effect.condition.thisTurn !== false;
      useConditionInput.checked = effect.useCondition === true;

      function refreshKindOptions() {
        const kinds = getKindsByCategory(effect.category);
        if (kinds.length === 0) {
          kindSelect.innerHTML = "";
          return;
        }
        if (!kinds.find((k) => k.id === effect.kind)) {
          effect.kind = kinds[0].id;
        }
        kindSelect.innerHTML = kinds.map((k) => `<option value="${k.id}" ${k.id === effect.kind ? "selected" : ""}>${k.label}</option>`).join("");
      }

      function refreshDamageVisible() {
        damageExtra.style.display = effect.kind === "damage" ? "flex" : "none";
      }
      function refreshConditionVisible() {
        conditionAreas.forEach((el) => {
          el.style.opacity = effect.useCondition === true ? "1" : "0.45";
          el.style.pointerEvents = effect.useCondition === true ? "auto" : "none";
        });
      }

      refreshKindOptions();
      refreshDamageVisible();
      refreshConditionVisible();

      categorySelect.addEventListener("change", (e) => {
        effect.category = e.target.value;
        const first = createDefaultEffectByCategory(effect.category);
        if (first) {
          effect.kind = first.kind;
          if (effect.kind === "damage") {
            effect.damageType = "damage";
            effect.damageAttr = "none";
          }
          if (effect.kind === "hp_reduce") {
            effect.value = Math.max(1, Number(effect.value || 1));
          }
        }
        refreshKindOptions();
        refreshDamageVisible();
      });
      kindSelect.addEventListener("change", (e) => {
        effect.kind = e.target.value;
        refreshDamageVisible();
      });
      targetSelect.addEventListener("change", (e) => {
        effect.target = e.target.value;
      });
      valueInput.addEventListener("input", () => {
        effect.value = Number(valueInput.value) || 0;
      });
      damageTypeInput.addEventListener("change", () => {
        effect.damageType = damageTypeInput.value || "damage";
      });
      damageAttrInput.addEventListener("change", () => {
        effect.damageAttr = damageAttrInput.value || "none";
      });
      useConditionInput.addEventListener("change", () => {
        effect.useCondition = useConditionInput.checked;
        refreshConditionVisible();
      });
      whileOnFieldInput.addEventListener("change", () => {
        effect.condition.whileOnField = whileOnFieldInput.checked;
      });
      thisTurnInput.addEventListener("change", () => {
        effect.condition.thisTurn = thisTurnInput.checked;
      });
      trackerOwnerInput.addEventListener("change", () => {
        effect.condition.trackerCheck.owner = trackerOwnerInput.value || "self";
      });
      trackerScopeInput.addEventListener("change", () => {
        effect.condition.trackerCheck.scope = trackerScopeInput.value || "turn";
      });
      trackerStatInput.addEventListener("change", () => {
        effect.condition.trackerCheck.stat = trackerStatInput.value || "hp";
      });
      trackerDirectionInput.addEventListener("change", () => {
        effect.condition.trackerCheck.direction = trackerDirectionInput.value || "inc";
      });
      trackerMetricInput.addEventListener("change", () => {
        effect.condition.trackerCheck.metric = trackerMetricInput.value || "amount";
      });
      trackerOpInput.addEventListener("change", () => {
        effect.condition.trackerCheck.op = trackerOpInput.value || "gte";
      });
      trackerValueInput.addEventListener("input", () => {
        effect.condition.trackerCheck.value = Number(trackerValueInput.value) || 0;
      });
      effectEl.querySelector('[data-role="removeEffect"]').addEventListener("click", () => {
        timing.effects.splice(ei, 1);
        renderEffectBlocksEditor();
      });

      effectList.appendChild(effectEl);
    });

    container.appendChild(timingEl);
  });
}

// ===== 初期化 =====
async function initDev() {
  try {
    await loadCardData();
    await loadLevelStats();
    devCards = CARD_DB.map(c => ({
      id: c.id,
      image: c.image
        ? c.image.replace("assets/cards/", "")
        : "",
      name: c.name || "",
      attack: Number.isFinite(Number(c.attack)) ? Number(c.attack) : 0,
      effectText: String(c.effectText || ""),
      effectDsl: c.effectDsl || null,
      effectBlocks: c.effectBlocks || null,
      attribute: c.attribute || "近接",
      type: c.type || "アタッカー",
      tags: Array.isArray(c.tags) ? c.tags.join(", ") : (typeof c.tags === "string" ? c.tags : "")
    }));
  } catch(e) {
    console.error("開発者モードのカード読み込みに失敗しました", e);
    devCards = [];
  }
  renderDevCards();
  const cardsScroll = getCardsScrollContainer();
  if (cardsScroll) cardsScroll.addEventListener("scroll", updateScrollButtons);
  renderLevelStatsTable();
  renderTimingSelectOptions();
}

initDev();

const useBlocksInput = document.getElementById("useEffectBlocks");
if (useBlocksInput) {
  useBlocksInput.addEventListener("change", () => {
    const card = getSelectedCard();
    if (!card) return;
    if (useBlocksInput.checked) {
      ensureEffectBlocks(card);
    } else {
      card.effectBlocks = null;
    }
    renderEffectBlocksEditor();
  });
}

const addTimingBtn = document.getElementById("addTimingBtn");
if (addTimingBtn) {
  addTimingBtn.addEventListener("click", () => {
    const card = getSelectedCard();
    if (!card) return;
    const useBlocks = document.getElementById("useEffectBlocks");
    if (useBlocks && !useBlocks.checked) useBlocks.checked = true;
    const program = ensureEffectBlocks(card);
    const selectedTiming = document.getElementById("newTimingSelect")?.value || "onSummon";
    program.timings.push({ timing: selectedTiming, effects: [] });
    renderEffectBlocksEditor();
  });
}
const timingContextSelect = document.getElementById("timingContextSelect");
if (timingContextSelect) {
  timingContextSelect.addEventListener("change", () => {
    renderTimingSelectOptions();
  });
}

// ===== カード追加 =====
document.getElementById("addCardBtn").addEventListener("click", () => {
  const id = generateId();
  devCards.push({
    id,
    image: "",
    name: "",
    attack: 0,
    effectText: "",
    effectDsl: null,
    effectBlocks: null,
    attribute: "近接",
    type: "アタッカー",
    tags: ""
  });
  renderDevCards();
  selectCard(id);
});

function generateId() {
  // 新しいID形式に対応：cd001-001, cd001-002, ... cd002-001, ...
  let maxBlockNum = 0;
  let maxCardInBlock = {};
  
  devCards.forEach(c => {
    const match = c.id.match(/^cd(\d{3})-(\d{3})$/);
    if (match) {
      const blockNum = parseInt(match[1], 10);
      const cardNum = parseInt(match[2], 10);
      maxBlockNum = Math.max(maxBlockNum, blockNum);
      if (!maxCardInBlock[blockNum]) maxCardInBlock[blockNum] = 0;
      maxCardInBlock[blockNum] = Math.max(maxCardInBlock[blockNum], cardNum);
    }
  });
  
  // 最後のブロックの次のカード番号、またはブロックが存在しない場合は新しいブロックを作成
  const blockNum = maxBlockNum || 1;
  const cardNum = (maxCardInBlock[blockNum] || 0) + 1;
  
  if (cardNum > 999) {
    // カード数が999を超える場合は新しいブロックを作成
    return `cd${String(blockNum + 1).padStart(3, "0")}-001`;
  }
  
  return `cd${String(blockNum).padStart(3, "0")}-${String(cardNum).padStart(3, "0")}`;
}

// ===== カード選択 =====
function selectCard(id) {
  selectedId = id;
  const card = devCards.find(c => c.id === id);
  if (!card) return;

  document.getElementById("editPanel").classList.remove("hidden");
  document.getElementById("editId").value = card.id;
  document.getElementById("editName").value = card.name || "";
  document.getElementById("editAttack").value = Number(card.attack || 0);
  document.getElementById("editTags").value = card.tags || "";
  document.getElementById("editEffectText").value = card.effectText || "";
  const attrInput = document.getElementById(`editAttribute_${card.attribute || "近接"}`);
  if (attrInput) attrInput.checked = true;
  const typeInput = document.getElementById(`editCardType_${card.type || "アタッカー"}`);
  if (typeInput) typeInput.checked = true;

  const pending = pendingImages[id];
  if (pending) {
    showPreview(pending.dataUrl);
    document.getElementById("editImageName").value = pending.fileName;
  } else if (card.image) {
    showPreview(encodeURI("assets/cards/" + card.image));
    document.getElementById("editImageName").value = card.image;
  } else {
    clearPreview();
    document.getElementById("editImageName").value = "";
  }

  document.getElementById("editMessage").innerText = "";
  const useBlocks = document.getElementById("useEffectBlocks");
  if (useBlocks) {
    useBlocks.checked = !!(card.effectBlocks && Array.isArray(card.effectBlocks.timings));
  }
  const timingContextSelect = document.getElementById("timingContextSelect");
  if (timingContextSelect) {
    timingContextSelect.value = card.type === "スキル" ? "skill" : "attacker";
    renderTimingSelectOptions();
  }
  renderEffectBlocksEditor();
  renderDevCards();
}

// ===== プレビュー =====
function showPreview(src) {
  const box = document.getElementById("previewBox");
  if (!box) return;
  const card = selectedId ? (devCards.find(c => c.id === selectedId) || getCardData(selectedId)) : null;
  if (card && window.CardVisualLayout && typeof window.CardVisualLayout.buildDeckCardInnerHtml === "function") {
    const previewCard = Object.assign({}, card, { image: src });
    box.innerHTML = `<div class="deckCard cardVisualApplied" style="width:100%;height:100%;">${window.CardVisualLayout.buildDeckCardInnerHtml(previewCard, { count: 0 })}</div>`;
    const previewCardEl = box.querySelector(".cardVisualApplied");
    if (previewCardEl && typeof window.CardVisualLayout.syncScale === "function") {
      requestAnimationFrame(() => window.CardVisualLayout.syncScale(previewCardEl));
    }
    return;
  }
  document.getElementById("previewImg").src = src;
  document.getElementById("previewImg").style.display = "";
  document.getElementById("previewPlaceholder").style.display = "none";
}

function clearPreview() {
  const box = document.getElementById("previewBox");
  if (box) {
    box.innerHTML = '<span id="previewPlaceholder" style="font-size:12px;color:#aaa;">画像なし</span><img id="previewImg" style="display:none;" alt="プレビュー">';
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(tag => String(tag || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,、\s]+/).map(tag => tag.trim()).filter(Boolean);
  }
  return [];
}

function updateSelectedField(key, value) {
  if (!selectedId) return;
  const card = devCards.find(c => c.id === selectedId);
  if (!card) return;
  card[key] = value;
  renderDevCards();
}

// イベント: 編集パネルの属性 / 種類 / タグ
[...document.querySelectorAll('input[name="editAttribute"]'), ...document.querySelectorAll('input[name="editCardType"]')].forEach(input => {
  input.addEventListener('change', () => {
    updateSelectedField(input.name === 'editAttribute' ? 'attribute' : 'type', input.value);
  });
});
const editTagsInput = document.getElementById('editTags');
if (editTagsInput) {
  editTagsInput.addEventListener('input', () => {
    updateSelectedField('tags', editTagsInput.value);
  });
}
const editNameInput = document.getElementById("editName");
if (editNameInput) {
  editNameInput.addEventListener("input", () => {
    updateSelectedField("name", editNameInput.value);
  });
}
const editAttackInput = document.getElementById("editAttack");
if (editAttackInput) {
  editAttackInput.addEventListener("input", () => {
    const attack = Math.max(0, Math.floor(Number(editAttackInput.value) || 0));
    updateSelectedField("attack", attack);
  });
}
const editEffectTextInput = document.getElementById("editEffectText");
if (editEffectTextInput) {
  editEffectTextInput.addEventListener("input", () => {
    updateSelectedField("effectText", editEffectTextInput.value);
  });
}

function cardMatchesSearch(card, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const target = [
    card.id,
    card.name,
    card.tags,
    card.effectText
  ].map(v => String(v || "").toLowerCase()).join(" ");
  return target.includes(q);
}

function compareCardId(a, b) {
  return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true, sensitivity: "base" });
}

function getFilteredSortedCards() {
  const filtered = devCards.filter((card) => cardMatchesSearch(card, cardSearchQuery));
  const rows = [...filtered];
  if (cardSortMode === "nameAsc") {
    rows.sort((a, b) => {
      const byName = String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });
      return byName !== 0 ? byName : compareCardId(a, b);
    });
  } else if (cardSortMode === "attackDesc") {
    rows.sort((a, b) => {
      const diff = Number(b.attack || 0) - Number(a.attack || 0);
      return diff !== 0 ? diff : compareCardId(a, b);
    });
  } else if (cardSortMode === "attackAsc") {
    rows.sort((a, b) => {
      const diff = Number(a.attack || 0) - Number(b.attack || 0);
      return diff !== 0 ? diff : compareCardId(a, b);
    });
  } else {
    rows.sort(compareCardId);
  }
  return rows;
}

// ===== 画像選択 =====
document.getElementById("selectImageBtn").addEventListener("click", () => {
  document.getElementById("imageFileInput").click();
});

document.getElementById("imageFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!selectedId) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImages[selectedId] = {
      fileName: file.name,
      dataUrl: ev.target.result
    };
    showPreview(ev.target.result);
    document.getElementById("editImageName").value = file.name;
    document.getElementById("editMessage").innerText = "※ 完了ボタンで保存されます";
    renderDevCards();
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ===== カード一覧レンダリング =====
function renderDevCards() {
  const container = document.getElementById("cards");
  container.innerHTML = "";

  const list = getFilteredSortedCards();
  list.forEach(card => {
    const el = document.createElement("div");
    el.className = "deckCard" + (card.id === selectedId ? " selected" : "");
    el.dataset.id = card.id;

    const pending = pendingImages[card.id];
    const imagePath = pending ? pending.dataUrl : (card.image ? `assets/cards/${card.image}` : "");

    if (imagePath) {
      const img = document.createElement("img");
      img.src = pending ? imagePath : encodeURI(imagePath);
      img.alt = card.name || card.id;
      img.onerror = () => { img.src = "assets/System/404.png"; };
      el.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style = "width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;min-height:0;";
      placeholder.textContent = "画像なし";
      el.appendChild(placeholder);
    }

    if (window.CardVisualLayout && typeof window.CardVisualLayout.applyToCardElement === "function") {
      window.CardVisualLayout.applyToCardElement(el, card);
      el.classList.add("cardVisualApplied");
    } else {
      const overlay = document.createElement("div");
      overlay.className = "devCardOverlay";
      const nameDiv = document.createElement("div");
      nameDiv.className = "deckCardName";
      nameDiv.textContent = card.name || card.id;
      overlay.appendChild(nameDiv);
      el.appendChild(overlay);
    }

    el.addEventListener("click", () => selectCard(card.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openDevContextMenu(e.clientX, e.clientY, card.id);
    });
    container.appendChild(el);
  });

  updateScrollButtons();
}

const cardSearchInput = document.getElementById("cardSearchInput");
if (cardSearchInput) {
  cardSearchInput.addEventListener("input", () => {
    cardSearchQuery = cardSearchInput.value || "";
    renderDevCards();
  });
}
const cardSortSelect = document.getElementById("cardSortSelect");
if (cardSortSelect) {
  cardSortSelect.addEventListener("change", () => {
    cardSortMode = cardSortSelect.value || "idAsc";
    renderDevCards();
  });
}

function openDevContextMenu(x, y, id) {
  const menu = document.getElementById("devContextMenu");
  if (!menu) return;
  menu.innerHTML = `<div class="context-item" data-action="zoom">拡大表示</div>`;
  menu.classList.remove("hidden");
  menu.style.display = "block";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  Array.from(menu.children).forEach(item => {
    item.addEventListener("click", () => {
      showCardZoom(id);
      hideDevContextMenu();
    });
  });
}

function hideDevContextMenu() {
  const menu = document.getElementById("devContextMenu");
  if (menu) {
    menu.style.display = "none";
    menu.classList.add("hidden");
  }
}

function getCardsScrollContainer() {
  const cards = document.getElementById("cards");
  return cards ? cards.parentElement : null;
}

function showCardZoom(id) {
  const card = devCards.find(c => c.id === id) || getCardData(id);
  if (!card) return;
  const modal = document.getElementById("cardZoomModal");
  if (!modal) return;
  const cardHost = document.getElementById("cardZoomCard");
  const info = document.getElementById("cardZoomInfo");
  if (cardHost) {
    cardHost.innerHTML = "";
    const el = document.createElement("div");
    el.className = "deckCard cardVisualApplied";
    if (window.CardVisualLayout && typeof window.CardVisualLayout.buildDeckCardInnerHtml === "function") {
      el.innerHTML = window.CardVisualLayout.buildDeckCardInnerHtml(card, { count: 0 });
      if (typeof window.CardVisualLayout.syncScale === "function") {
        requestAnimationFrame(() => window.CardVisualLayout.syncScale(el));
      }
    } else {
      const src = card.image ? (card.image.startsWith("assets/") ? card.image : encodeURI("assets/cards/" + card.image)) : "assets/System/404.png";
      el.innerHTML = `<img src="${src}" alt="">`;
    }
    cardHost.appendChild(el);
  }
  const tags = Array.isArray(card.tags) ? card.tags.join(" ") : String(card.tags || "");
  info.textContent = `ID: ${card.id} │ ${card.name || "(名称未設定)"} │ ATK:${Number(card.attack || 0)} │ ${card.attribute || "近接"} / ${card.type || "アタッカー"}${tags ? ` │ ${tags}` : ""}`;
  modal.classList.remove("hidden");
}

function hideCardZoom() {
  const modal = document.getElementById("cardZoomModal");
  if (modal) modal.classList.add("hidden");
}

window.addEventListener("click", (e) => {
  const menu = document.getElementById("devContextMenu");
  if (!menu || menu.style.display !== "block") return;
  if (e.target.closest && e.target.closest("#devContextMenu")) return;
  hideDevContextMenu();
});

window.addEventListener("scroll", hideDevContextMenu);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideCardZoom();
});

function updateScrollButtons() {
  const cardsDiv = getCardsScrollContainer();
  const cardsPrev = document.getElementById("cardsPrev");
  const cardsNext = document.getElementById("cardsNext");
  if (!cardsDiv || !cardsPrev || !cardsNext) return;
  const max = cardsDiv.scrollWidth - cardsDiv.clientWidth;
  cardsPrev.disabled = cardsDiv.scrollLeft <= 0;
  cardsNext.disabled = cardsDiv.scrollLeft >= max - 1;
}

function scrollContainer(container, amount) {
  if (!container) return;
  container.scrollBy({
    left: amount,
    behavior: "smooth"
  });
}

document.getElementById("cardsPrev").addEventListener("click", () => {
  const cardsDiv = getCardsScrollContainer();
  if (cardsDiv) scrollContainer(cardsDiv, -Math.max(cardsDiv.clientWidth * 0.75, 240));
});
document.getElementById("cardsNext").addEventListener("click", () => {
  const cardsDiv = getCardsScrollContainer();
  if (cardsDiv) scrollContainer(cardsDiv, Math.max(cardsDiv.clientWidth * 0.75, 240));
});

window.addEventListener("resize", updateScrollButtons);

// ===== 完了ボタン：cards.jsonをダウンロード =====
document.getElementById("doneBtn").addEventListener("click", () => {
  for (const [id, pending] of Object.entries(pendingImages)) {
    const card = devCards.find(c => c.id === id);
    if (card) card.image = pending.fileName;
  }

  const output = devCards.map(c => {
    const effectText = String(c.effectText || "").trim();
    const fromBlocks = (window.CardEffectBlockCompiler && typeof window.CardEffectBlockCompiler.compileProgramToDsl === "function")
      ? window.CardEffectBlockCompiler.compileProgramToDsl(c.effectBlocks)
      : null;
    const fromText = (window.CardDSL && typeof window.CardDSL.compileText === "function")
      ? window.CardDSL.compileText(effectText)
      : null;
    const compiledDsl = fromBlocks || fromText;
    const entry = {
      id: c.id,
      image: c.image || "",
      name: String(c.name || "").trim(),
      attribute: c.attribute || "近接",
      type: c.type || "アタッカー",
      attack: Math.max(0, Math.floor(Number(c.attack) || 0)),
      effectText,
      effectDsl: compiledDsl,
      tags: normalizeTags(c.tags)
    };
    if (c.effectBlocks && Array.isArray(c.effectBlocks.timings)) {
      entry.effectBlocks = c.effectBlocks;
    }
    return entry;
  });

  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cards.json";
  a.click();
  URL.revokeObjectURL(url);

  document.getElementById("editMessage").innerText = "cards.json をダウンロードしました。data/ フォルダに配置してください。";
});

// ===== レベル別ステータス編集 =====
function renderLevelStatsTable(){
  const stats = LEVEL_STATS; // core.js のグローバル
  const tbody = document.getElementById("levelStatsBody");
  if(!tbody) return;
  tbody.innerHTML = "";
  for(let lv = 1; lv <= LEVEL_MAX; lv++){
    const i = lv - 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;font-weight:bold;background:#fcfcfc;">Lv${lv}</td>
      <td>
        <input type="number" value="${(stats.atk && stats.atk[i]) ?? 0}" data-stat="atk" data-lv="${i}" class="devStatInput">
      </td>
      <td>
        <input type="number" value="${(stats.def && stats.def[i]) ?? 0}" data-stat="def" data-lv="${i}" class="devStatInput">
      </td>
      <td>
        <input type="number" value="${(stats.instantDef && stats.instantDef[i]) ?? 0}" data-stat="instantDef" data-lv="${i}" class="devStatInput">
      </td>
    `;
    tbody.appendChild(tr);
  }
}

document.getElementById("saveLevelStats").addEventListener("click", () => {
  const stats = { atk: [], def: [], instantDef: [] };
  document.querySelectorAll("#levelStatsBody input").forEach(input => {
    const stat = input.dataset.stat;
    const lv   = Number(input.dataset.lv);
    stats[stat][lv] = Number(input.value) || 0;
  });
  saveLevelStats(stats);
  const msg = document.getElementById("levelStatsMsg");
  msg.textContent = "保存しました";
  setTimeout(() => { msg.textContent = ""; }, 1500);
});

document.getElementById("resetLevelStats").addEventListener("click", () => {
  saveLevelStats(getDefaultLevelStats());
  renderLevelStatsTable();
});

renderLevelStatsTable();

// ===== カード削除機能 =====
const deleteCardBtn = document.getElementById("deleteCardBtn");
if (deleteCardBtn) {
  deleteCardBtn.addEventListener("click", async () => {
    const cardId = document.getElementById("deleteCardId").value.trim();
    const msgEl = document.getElementById("deleteCardMsg");
    
    if (!cardId) {
      msgEl.style.color = "#d9534f";
      msgEl.textContent = "❌ カードIDを入力してください";
      return;
    }
    
    // カードが存在するか確認
    const cardIndex = devCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      msgEl.style.color = "#d9534f";
      msgEl.textContent = `❌ カードID "${cardId}" が見つかりません`;
      return;
    }
  
  if (!confirm(`カード "${cardId}" を削除してもよろしいですか？`)) {
    return;
  }
  
  try {
    // ローカルから削除
    devCards.splice(cardIndex, 1);
    
    // cards.json から削除
    let cardData = [];
    try {
      const response = await fetch(CARD_DATA_URL);
      cardData = await response.json();
    } catch (e) {
      console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    }
    
    const updatedCards = cardData.filter(c => c.id !== cardId);
    
    // Firebase に保存
    if (window.firebaseClient?.db) {
      try {
        await window.firebaseClient.db.ref(`cardDatabase/cards`).set(updatedCards);
        console.log(`[Dev] カード "${cardId}" をサーバーから削除しました`);
      } catch (e) {
        console.warn(`[Dev] Firebase削除エラー、localStorageに保存します:`, e);
      }
    } else {
      console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
    }
    
    // localStorage に保存
    localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));
    
    // 画面を更新
    renderDevCards();
    document.getElementById("deleteCardId").value = "";
    
    msgEl.style.color = "#27ae60";
    msgEl.textContent = `✅ カード "${cardId}" を削除しました`;
    
    // 3秒後にメッセージを消す
    setTimeout(() => {
      msgEl.textContent = "";
    }, 3000);
    
  } catch (e) {
    console.error("[Dev] カード削除エラー:", e);
    msgEl.style.color = "#d9534f";
    msgEl.textContent = `❌ エラーが発生しました: ${e.message}`;
  }
});
}

// ===== 編集パネル内のカード削除 =====
document.getElementById("deleteSelectedCardBtn").addEventListener("click", async () => {
  const cardId = document.getElementById("editId").value.trim();
  const msgEl = document.getElementById("editMessage");
  
  if (!cardId) {
    msgEl.style.color = "#d9534f";
    msgEl.textContent = "❌ カードIDが取得できません";
    return;
  }
  
  if (!confirm(`カード "${cardId}" を削除してもよろしいですか？\n\nこの操作は取り消せません。`)) {
    return;
  }
  
  try {
    // ローカルから削除
    const cardIndex = devCards.findIndex(c => c.id === cardId);
    if (cardIndex !== -1) {
      devCards.splice(cardIndex, 1);
    }
    
    // cards.json から削除
    let cardData = [];
    try {
      const response = await fetch(CARD_DATA_URL);
      cardData = await response.json();
    } catch (e) {
      console.warn("[Dev] cards.jsonの読み込みに失敗しました:", e);
    }
    
    const updatedCards = cardData.filter(c => c.id !== cardId);
    
    // Firebase に保存
    if (window.firebaseClient?.db) {
      try {
        await window.firebaseClient.db.ref(`cardDatabase/cards`).set(updatedCards);
        console.log(`[Dev] カード "${cardId}" をサーバーから削除しました`);
      } catch (e) {
        console.warn(`[Dev] Firebase削除エラー、localStorageに保存します:`, e);
      }
    } else {
      console.log(`[Dev] Firebase が利用不可のため、localStorageに保存します`);
    }
    
    // localStorage に保存
    localStorage.setItem("cardDatabase", JSON.stringify(updatedCards));
    
    // 画面を更新
    renderDevCards();
    
    // 編集パネルを閉じる
    document.getElementById("editPanel").classList.add("hidden");
    selectedId = null;
    
    msgEl.style.color = "#27ae60";
    msgEl.textContent = `✅ カード "${cardId}" を削除しました`;
    
    // 3秒後にメッセージを消す
    setTimeout(() => {
      msgEl.textContent = "";
    }, 3000);
    
  } catch (e) {
    console.error("[Dev] カード削除エラー:", e);
    msgEl.style.color = "#d9534f";
    msgEl.textContent = `❌ エラーが発生しました: ${e.message}`;
  }
});

// ===== カード一括作成プロトコル =====
document.getElementById("openCardBatchUploader").addEventListener("click", () => {
  if (typeof openCardBatchUploader === "function") {
    openCardBatchUploader();
  } else {
    console.error("[Dev] openCardBatchUploader関数が見つかりません");
    showErrorMessage("一括作成機能が利用できません。devTools.jsが正しく読み込まれているか確認してください。");
  }
});
