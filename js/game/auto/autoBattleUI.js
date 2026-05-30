(function() {
  function ensureRoot() {
    let root = document.getElementById("autoBattlePanel");
    if (root) return root;

    root = document.createElement("div");
    root.id = "autoBattlePanel";
    root.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:16px",
      "z-index:6200",
      "width:min(360px, calc(100vw - 32px))",
      "background:rgba(11,14,26,0.9)",
      "border:1px solid rgba(199,179,119,0.5)",
      "border-radius:12px",
      "padding:10px",
      "color:#e8dcc0",
      "font-family:'Outfit',sans-serif",
      "backdrop-filter:blur(8px)",
      "box-shadow:0 12px 28px rgba(0,0,0,0.45)"
    ].join(";");
    document.body.appendChild(root);
    return root;
  }

  function getMyStatusLine() {
    const me = (window.getMyRole ? window.getMyRole() : window.myRole) || "player1";
    const s = window.state?.[me] || {};
    return `HP:${Number(s.hp || 0)} PP:${Number(s.pp || 0)} DEF:${Number(s.defstack || 0)} SH:${Number(s.shield || 0)}`;
  }

  window.renderAutoBattleUI = function() {
    const root = ensureRoot();
    const runtime = window.AutoBattleSystem?.runtime;
    if (!runtime) return;

    const logs = Array.isArray(runtime.logs) ? runtime.logs.slice(0, 4) : [];
    const statusColor = runtime.enabled ? "#7df6bf" : "#d98888";

    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-size:12px;color:#c7b377;letter-spacing:0.4px;">AUTO BATTLE</div>
        <button id="autoBattleToggleBtn" style="
          border:none;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;
          background:${runtime.enabled ? "#2f8f62" : "#6f3c3c"};color:#f7f0de;">
          ${runtime.enabled ? "ON" : "OFF"}
        </button>
      </div>
      <div style="margin-top:6px;font-size:12px;color:${statusColor};">${runtime.enabled ? "自動進行中" : "手動操作"}</div>
      <div style="margin-top:4px;font-size:11px;color:#b9ad8d;">${getMyStatusLine()}</div>
      <div style="margin-top:8px;font-size:11px;color:#9f9783;max-height:88px;overflow:auto;line-height:1.35;">
        ${logs.length ? logs.map((line) => `<div>${line}</div>`).join("") : "<div>ログなし</div>"}
      </div>
    `;

    const toggleBtn = document.getElementById("autoBattleToggleBtn");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const next = !window.AutoBattleSystem.runtime.enabled;
        window.AutoBattleSystem.setEnabled(next);
      };
    }
  };

  window.addEventListener("load", () => {
    window.renderAutoBattleUI();
  });
})();
