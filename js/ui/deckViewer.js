(function() {
  const PHASE_BUTTON_ID = "deckViewerPhaseBtn";
  const OVERLAY_ID = "deckViewerOverlay";
  const ALLOWED_PHASES = new Set(["ready_check", "setup_dice", "setup_evolution", "first_draw"]);

  function getMyRoleSafe() {
    return (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
  }

  function cardDataOf(id) {
    if (typeof window.getCardData === "function") return window.getCardData(id) || null;
    return null;
  }

  function closeDeckViewer() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.remove();
  }

  function openDeckViewer() {
    closeDeckViewer();
    const owner = getMyRoleSafe();
    const ids = Array.isArray(window.state?.[owner]?.deck) ? window.state[owner].deck.slice().reverse() : [];
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(8,6,15,0.86);z-index:100210;display:flex;align-items:center;justify-content:center;padding:14px;";

    const cardsHtml = ids.map((rawId, idx) => {
      const id = String(rawId || "").replace(/^TEMP:/, "");
      const row = cardDataOf(id) || {};
      const image = String(row.image || "assets/System/404.png");
      const name = String(row.name || id || "Unknown");
      return `
        <div style="border:1px solid #544826;border-radius:8px;padding:6px;background:#0f1220;">
          <img src="${image}" alt="${name}" style="width:120px;height:170px;object-fit:cover;border-radius:6px;border:1px solid #222;">
          <div style="font-size:11px;color:#f0d080;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${idx + 1}. ${name}</div>
          <div style="font-size:10px;color:#9aa5c0;">${id}</div>
        </div>
      `;
    }).join("");

    overlay.innerHTML = `
      <section style="width:min(1180px,96vw);max-height:88vh;display:flex;flex-direction:column;background:#161422;border:1px solid #6f5d31;border-radius:14px;overflow:hidden;">
        <header style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(199,179,119,0.12);border-bottom:1px solid rgba(199,179,119,0.2);">
          <div style="font-weight:700;color:#f2e6b8;">デッキ確認（${ids.length}枚）</div>
          <button id="deckViewerCloseBtn" type="button" style="padding:6px 12px;background:#a33737;color:#fff;border:1px solid #d98080;border-radius:8px;cursor:pointer;">閉じる</button>
        </header>
        <div style="padding:12px;overflow:auto;">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;">
            ${cardsHtml || '<div style="color:#9aa5c0;padding:20px;">デッキが空です。</div>'}
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDeckViewer();
    });
    overlay.querySelector("#deckViewerCloseBtn")?.addEventListener("click", closeDeckViewer);
  }

  function shouldShowPhaseDeckButton() {
    const m = window.state?.matchData || null;
    if (!m || m.winner) return false;
    return ALLOWED_PHASES.has(String(m.status || ""));
  }

  function ensurePhaseDeckButton() {
    const show = shouldShowPhaseDeckButton();
    let btn = document.getElementById(PHASE_BUTTON_ID);
    if (!show) {
      if (btn) btn.remove();
      return;
    }
    if (btn) return;
    btn = document.createElement("button");
    btn.id = PHASE_BUTTON_ID;
    btn.type = "button";
    btn.textContent = "デッキ確認";
    btn.style.cssText = "position:fixed;right:max(12px, calc(env(safe-area-inset-right, 0px) + 10px));top:max(14px, calc(env(safe-area-inset-top, 0px) + 10px));z-index:100150;padding:10px 14px;border-radius:10px;border:1px solid #8d7a4b;background:linear-gradient(180deg,#2a2436,#171421);color:#f2e6b8;font-weight:700;cursor:pointer;";
    btn.addEventListener("click", openDeckViewer);
    document.body.appendChild(btn);
  }

  window.openDeckViewer = openDeckViewer;
  window.closeDeckViewer = closeDeckViewer;
  window.injectPhaseOverlayDeckBtn = ensurePhaseDeckButton;
  window.removePhaseOverlayDeckBtn = function() {
    const btn = document.getElementById(PHASE_BUTTON_ID);
    if (btn) btn.remove();
  };

  setInterval(ensurePhaseDeckButton, 500);
})();
