(function() {
  const BASE_W = 320;
  const scaleObservers = new WeakMap();

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeType(card) {
    const t = String(card?.cardKind || card?.resolvedRole || card?.type || "");
    if (t === "skill" || t.includes("スキル")) return "skill";
    if (t === "support" || t.includes("サポート")) return "support";
    return "attacker";
  }

  function normalizeAttribute(card) {
    const a = String(card?.attribute || "近接");
    if (a.includes("遠隔")) return { key: "ranged", label: "遠隔", short: "R" };
    if (a.includes("魔法")) return { key: "magic", label: "魔法", short: "M" };
    return { key: "melee", label: "近接", short: "N" };
  }

  function buildLayoutHtml(card, options) {
    const type = normalizeType(card);
    const attr = normalizeAttribute(card);
    const name = escapeHtml(card?.name || card?.id || "カード");
    const effectText = escapeHtml(String(card?.effectText || "").trim());
    const attack = Number(card?.attack || 0);
    const showCount = Number(options?.count || 0) > 0;

    const attackHtml = type === "support"
      ? '<div class="cvAttack cvAttackNone" aria-label="攻撃力無効"><span></span></div>'
      : `<div class="cvAttack ${type === "skill" ? "cvAttackCircle" : "cvAttackFlat"}">${Number.isFinite(attack) ? attack : 0}</div>`;

    const attrHtml = (type === "attacker" || type === "support")
      ? `<div class="cvAttribute cvAttr-${attr.key}" title="${escapeHtml(attr.label)}">${attr.short}</div>`
      : "";

    const countHtml = showCount ? `<div class="deckCardCount">×${Number(options.count)}</div>` : "";

    return `
      <div class="cardVisualOverlay cvType-${type}">
        <div class="cvHeader">
          ${attackHtml}
          <div class="cvName">${name}</div>
        </div>
        <div class="cvSubMeta">${attrHtml}</div>
        <div class="cvEffectText">${effectText || "（効果テキスト未設定）"}</div>
        ${countHtml}
      </div>
    `;
  }

  function applyToCardElement(el, card, options = {}) {
    if (!el || !card) return;
    el.classList.add("cardVisualApplied");
    attachScaleSync(el);
    const old = el.querySelector(".cardVisualOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.className = "cardVisualOverlayHost card-front-overlay";
    overlay.innerHTML = buildLayoutHtml(card, options);
    el.appendChild(overlay);
  }

  function syncScale(el) {
    const w = Number(el.clientWidth || 0);
    if (!Number.isFinite(w) || w <= 0) return;
    const scale = w / BASE_W;
    el.style.setProperty("--cv-scale", String(scale));
  }

  function attachScaleSync(el) {
    syncScale(el);
    if (scaleObservers.has(el)) return;

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => syncScale(el));
      ro.observe(el);
      scaleObservers.set(el, ro);
      return;
    }

    // ResizeObserver 非対応環境フォールバック
    const onResize = () => syncScale(el);
    window.addEventListener("resize", onResize, { passive: true });
    scaleObservers.set(el, { disconnect: () => window.removeEventListener("resize", onResize) });
  }

  function buildDeckCardInnerHtml(card, options = {}) {
    const imageSrc = card?.image ? encodeURI(card.image) : "assets/System/404.png";
    const layout = buildLayoutHtml(card, options);
    return `<img src="${imageSrc}" alt="">${layout}`;
  }

  window.CardVisualLayout = {
    normalizeType,
    normalizeAttribute,
    syncScale,
    applyToCardElement,
    buildDeckCardInnerHtml
  };
})();
