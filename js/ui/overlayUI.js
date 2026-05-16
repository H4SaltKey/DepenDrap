function openEvolutionPathModal(owner) {
  const html = getEvolutionPathHTML(owner);
  if (!html) return;
  const overlay = document.createElement("div");
  overlay.className = "evoDetailOverlay";
  overlay.innerHTML = `
    <div class="evoDetailModal" role="dialog" aria-modal="true">
      <button type="button" class="evoDetailClose" aria-label="閉じる">✕</button>
      ${html}
    </div>
  `;
  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    close();
  };
  const close = () => {
    document.removeEventListener("keydown", onEsc);
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("evoDetailClose")) close();
  });
  document.addEventListener("keydown", onEsc);
  document.body.appendChild(overlay);
}

function getEvolutionPathHTML(owner) {
  const s = state[owner];
  if (!s || !s.evolutionPath) return "";
  const lv = s.level || 1;
  let idx = 0;
  if (lv >= 6) idx = 3;
  else if (lv >= 5) idx = 2;
  else if (lv >= 3) idx = 1;

  let desc = "";
  let tableHTML = "";

  const colorAction = "#ff9999"; // 行動につながる部分
  const colorLevel = "#66ccff"; // レベルで変動する変数

  if (s.evolutionPath === '忍耐の道') {
    const xArr = [0, 1, 3, 4];
    const x = xArr[idx];
    desc = `手札の枚数上限が<span style="color:${colorAction}">2枚増加</span>し、最大レベル時(Lv6)は2ではなく<span style="color:${colorAction}">3枚</span>になる。<br>また、ラウンド開始時、手札を <span style="color:${colorLevel}; font-size:16px; font-weight:bold;">${x}</span> <span style="color:${colorAction}">枚増やす</span>。<br>さらに、自身のターン終了時、枚数上限によって手札を捨てると、捨てた枚数ごとに<span style="color:${colorAction}">経験値を最大2まで獲得</span>する。`;
    tableHTML = `x = [0, 1, 3, 4]`;
  } else if (s.evolutionPath === '継続の道') {
    const yArr = [1, 3, 4, 6];
    const y = yArr[idx];
    desc = `ターン毎に <span style="color:${colorLevel}; font-size:18px; font-weight:bold;">${y}</span> 回まで、1以上のダメージを与える度(※)、<span style="color:${colorAction}">1のダメージ</span>を与える。<br>さらに追加で、それぞれ3回目の発動に限り、<span style="color:${colorAction}">1の貫通ダメージ</span>を与える。<br><span style="font-size:12px; color:#aaa;">※：この効果によるものは含まない</span>`;
    tableHTML = `y = [1, 3, 4, 6]`;
  } else if (s.evolutionPath === '奇撃の道' || s.evolutionPath === '瞬発の道') {
    const zArr = [1, 3, 4, 6];
    const z = zArr[idx];
    desc = `一撃で6以上のダメージを与える時、そのダメージ判定の直前に <span style="color:${colorLevel}; font-size:18px; font-weight:bold;">${z}</span> の<span style="color:${colorAction}">脆弱ダメージ</span>を与える。`;
    tableHTML = `z = [1, 3, 4, 6]`;
  } else if (s.evolutionPath === '背水の道') {
    const tArr = [1, 2, 3, 4];
    const t = tArr[idx];
    desc = `手札が2枚以下の状態なら、[直接攻撃/”直接攻撃時“効果]の<span style="color:${colorAction}">ダメージを +1</span> する。<br>また、自身のPPが2以上なら、<span style="color:${colorAction}">与ダメージを追加で</span> <span style="color:${colorLevel}; font-size:18px; font-weight:bold;">+${t}</span> して、<span style="color:${colorAction}">1の経験値を獲得</span>する。<br><span style="font-size:12px; color:#aaa;">ただし、この効果による経験値は、ターン毎に1回まで獲得可能。</span>`;
    tableHTML = `t = [1, 2, 3, 4]`;
  }
  
  return `
    <div style="font-size:18px; font-weight:bold; color:#f0d080; margin-bottom:10px; border-bottom:1px solid #5a4b27; padding-bottom:6px; text-align:center;">
      【${s.evolutionPath}】
    </div>
    <div style="font-size:15px; color:#f2f2f2; line-height:1.85; text-align:left; letter-spacing:0.2px;">
      ${desc}
    </div>
    <div style="margin-top:12px; text-align:right; font-size:13px; color:#b8b8b8; font-family:monospace;">
      ${tableHTML}
    </div>
  `;
}

function showHandOverflowDiscardModal(owner, needCount) {
  if (handOverflowDiscardOpen) return;
  const content = (typeof getFieldContent === "function") ? getFieldContent() : document.getElementById("field");
  if (!content) return;
  const handCards = Array.from(content.querySelectorAll(".card:not(.deckObject)"))
    .filter((c) => c.dataset.owner === owner && Number(c.dataset.y) >= (window.HAND_ZONE_Y_MIN || 1460));
  if (handCards.length < needCount) return;

  handOverflowDiscardOpen = true;
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:100120;display:flex;align-items:center;justify-content:center;";
  const panel = document.createElement("div");
  panel.style.cssText = "width:min(96vw,1180px);max-height:88vh;overflow:hidden;background:#161422;border:1px solid #6f5d31;border-radius:14px;padding:14px;color:#f2e6c8;display:flex;flex-direction:column;gap:10px;";
  const title = document.createElement("div");
  title.style.cssText = "font-size:20px;font-weight:800;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;overflow-x:auto;padding:8px 2px 12px;";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
  const btn = document.createElement("button");
  btn.textContent = "捨てる";
  btn.style.cssText = "padding:8px 16px;font-weight:700;background:#a33737;color:#fff;border:1px solid #d98080;border-radius:8px;cursor:pointer;";
  btn.disabled = true;

  const selected = new Set();
  const refresh = () => {
    title.textContent = `手札を${needCount}枚捨てる（あと${needCount - selected.size}枚）`;
    btn.disabled = selected.size !== needCount;
  };
  refresh();

  handCards.forEach((c) => {
    const w = document.createElement("div");
    w.style.cssText = "position:relative;flex:0 0 auto;width:140px;cursor:pointer;";
    const img = document.createElement("img");
    const src = c.querySelector("img")?.src || "";
    img.src = src;
    img.style.cssText = "width:140px;height:198px;object-fit:contain;border:1px solid #544826;border-radius:8px;background:#111;";
    const mark = document.createElement("div");
    mark.textContent = "✕";
    mark.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:rgba(255,80,80,0.82);font-size:92px;font-weight:900;pointer-events:none;";
    w.addEventListener("click", () => {
      if (selected.has(c)) selected.delete(c);
      else if (selected.size < needCount) selected.add(c);
      mark.style.display = selected.has(c) ? "flex" : "none";
      refresh();
    });
    w.appendChild(img);
    w.appendChild(mark);
    row.appendChild(w);
  });

  btn.addEventListener("click", async () => {
    if (selected.size !== needCount) return;
    selected.forEach((c) => {
      if (typeof placeCardInZone === "function") placeCardInZone(c, owner, "grave");
    });
    if (typeof window.organizeBattleZones === "function") window.organizeBattleZones();
    if (typeof saveFieldCards === "function") saveFieldCards();
    if (typeof window.organizeHands === "function") window.organizeHands();
    if (typeof addGameLog === "function") {
      addGameLog(`[システム] ${state[owner]?.username || owner} が手札を${needCount}枚捨てました`);
    }
    // 忍耐の道: 捨てた枚数ぶんEXP（ターン毎最大2）
    const s = state[owner];
    if (s?.evolutionPath === "忍耐の道" && needCount > 0) {
      const gain = Math.min(2, needCount);
      if (gain > 0 && typeof addVal === "function") addVal(owner, "exp", gain);
    }
    overlay.remove();
    handOverflowDiscardOpen = false;
    await handleTurnEnd(true);
  });

  actions.appendChild(btn);
  panel.appendChild(title);
  panel.appendChild(row);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

