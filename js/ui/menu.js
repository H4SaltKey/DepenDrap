(function(){
  const DEFAULT_SETTINGS = {
    bgm: 0.5,
    se: 0.5,
    timeLimitEnabled: true,
    ppCostModalEnabled: false,
    autoPlayEnabled: false
  };
  const settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("settings")) || {});
  localStorage.setItem("settings", JSON.stringify(settings));
  window.getGameSettings = function() {
    try {
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("settings")) || {});
    } catch {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  };
  window.getGameSetting = function(key, fallback) {
    const s = window.getGameSettings();
    if (Object.prototype.hasOwnProperty.call(s, key)) return s[key];
    return fallback;
  };

  const html = `
    <div id="menuDock">
      <div id="menuPanel" class="hidden" aria-hidden="true">
        <div class="menuItem" id="closeMenuBtn">閉じる</div>
        <div class="menuItem" id="backBtn">タイトルへ戻る</div>
        <div class="menuItem" id="deckViewerBtn">デッキ確認</div>
        <div class="menuItem" id="surrenderBtn" style="color: #ff6b6b; display:none;">降参</div>
        <div class="menuItem" id="resetFieldBtn" style="color: #ff9999;">盤面リセット</div>
        <div class="menuItem" id="soloStartBtn" style="color: #9fe8ff; display:none;">1人で始める</div>
        <div class="menuItem" id="optBtn">オプション</div>
      </div>
      <div id="menuButton" role="button" tabindex="0" aria-label="メインメニュー">☰</div>
    </div>

    <div id="optionsModal" class="hidden">
      <div class="modalContent optionContent">
        <h3>オプション</h3>

        <label>BGM音量</label>
        <input type="range" id="bgmVolume" min="0" max="1" step="0.01">

        <label>SE音量</label>
        <input type="range" id="seVolume" min="0" max="1" step="0.01">
        <label style="display:flex; align-items:center; gap:8px; margin-top:14px;">
          <input type="checkbox" id="scrollZoomDynamicEnabled">
          スクロール倍率を可変にする
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
          <input type="checkbox" id="ppCostModalEnabled">
          カード配置時のPP確認モーダル
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
          <input type="checkbox" id="autoPlayEnabled">
          オートプレイ
        </label>

        <div class="optionFooter">
          <button id="clearCacheBtn" type="button">キャッシュをクリア</button>
          <button id="deleteAccountBtn" class="dangerBtn" type="button">アカウントを削除する</button>
          <button id="closeOpt" type="button">閉じる</button>
        </div>
      </div>
    </div>

    <div id="confirmModal" class="hidden">
      <div class="modalContent confirmContent">
        <p id="confirmText">確認</p>
        <div class="confirmActions">
          <button id="confirmNo" type="button">いいえ</button>
          <button id="confirmYes" type="button">はい</button>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.innerHTML = `
    #menuDock{
      position:fixed;
      top:18%;
      right:0;
      display:flex;
      align-items:stretch;
      z-index:9999999 !important;
      pointer-events:auto;
    }

    #menuButton{
      width:12px;
      min-width:12px;
      height:132px;
      border-radius:10px 0 0 10px;
      background:linear-gradient(180deg, #3b597f 0%, #1d304b 100%);
      color:#d7ecff;
      text-align:center;
      line-height:132px;
      font-size:10px;
      cursor:pointer;
      user-select:none;
      border:1px solid rgba(129, 179, 255, 0.45);
      border-right:none;
      box-shadow:0 8px 18px rgba(0,0,0,0.45);
      transition:filter 0.2s ease, transform 0.2s ease;
    }
    #menuButton:hover{
      filter:brightness(1.1);
      transform:translateX(-1px);
    }
    #menuButton:focus{
      outline:1px solid #8dd3ff;
      outline-offset:1px;
    }

    #menuPanel{
      width:220px;
      max-width:70vw;
      background:#222;
      border:1px solid #3f5a82;
      border-right:none;
      border-radius:10px 0 0 10px;
      overflow:hidden;
      box-shadow:0 14px 24px rgba(0,0,0,0.5);
      transform:translateX(calc(100% + 2px));
      opacity:0;
      pointer-events:none;
      transition:transform 0.22s ease, opacity 0.2s ease;
      z-index:9999999 !important;
    }

    #menuPanel:not(.hidden){
      transform:translateX(0);
      opacity:1;
      pointer-events:auto;
    }

    #menuPanel.hidden{
      display:block !important;
    }

    .menuItem{
      padding:11px 12px;
      color:white;
      cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,0.08);
      font-size:14px;
    }
    .menuItem:last-child{
      border-bottom:none;
    }
    .menuItem:hover{ background:#444; }

    #optionsModal,
    #confirmModal{
      position:fixed;
      top:0;
      left:0;
      width:100%;
      height:100%;
      background:rgba(0,0,0,0.6);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:10000000 !important;
    }

    .modalContent{
      background:white;
      color:#222;
      padding:20px;
      border-radius:8px;
      min-width:280px;
      box-shadow:0 10px 30px rgba(0,0,0,0.35);
    }

    .optionContent label{
      display:block;
      margin-top:12px;
    }

    .optionContent input[type="range"]{
      width:100%;
    }

    .optionFooter{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-top:22px;
    }

    .dangerBtn{
      border:1px solid #9b2d2d;
      background:#5a1616;
      color:#fff;
      border-radius:4px;
      padding:8px 10px;
      cursor:pointer;
      font-size:12px;
    }

    .dangerBtn:hover{ background:#7a2020; }
    #clearCacheBtn{
      border:1px solid #4a5e96;
      background:#2a3761;
      color:#fff;
      border-radius:4px;
      padding:8px 10px;
      cursor:pointer;
      font-size:12px;
    }
    #clearCacheBtn:hover{ background:#33457a; }

    .confirmContent{
      max-width:min(360px, calc(100vw - 32px));
    }

    .confirmActions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:16px;
    }

    .hidden{ display:none !important; }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);

  const button = document.getElementById("menuButton");
  const panel = document.getElementById("menuPanel");
  const optionsModal = document.getElementById("optionsModal");
  const confirmModal = document.getElementById("confirmModal");
  const clickSE = new Audio("assets/se/click.mp3");
  let confirmCallback = null;

  function playSE(){
    clickSE.currentTime = 0;
    clickSE.volume = JSON.parse(localStorage.getItem("settings"))?.se || 0.5;
    clickSE.play().catch(() => {});
  }

  function openConfirm(text, onYes){
    document.getElementById("confirmText").innerText = text;
    confirmCallback = onYes;
    confirmModal.classList.remove("hidden");
  }

  function closeConfirm(){
    confirmCallback = null;
    confirmModal.classList.add("hidden");
  }

  async function deleteAccount(){
    const username = localStorage.getItem("username");
    if (username && window.firebaseClient && window.firebaseClient.db) {
      try {
        await window.firebaseClient.db.ref(`accounts/${username}`).remove();
        console.log(`[Account] Firebase account for ${username} deleted.`);
      } catch (e) {
        console.error("[Account] Failed to delete account from Firebase:", e);
      }
    }
    // Firebase 版：ローカルストレージのユーザー名を削除
    localStorage.removeItem("username");
    localStorage.removeItem("matchSetup");
    localStorage.removeItem("deckList");
    localStorage.removeItem("gameState");
    location.href = "login.html";
  }

  async function clearAppCache(){
    const keepKeys = new Set([
      "username",
      "isOnline",
      "settings",
      "deckList",
      "deckCode",
      "selectedDeckId",
      "chatColor",
      "debugMode",
      "devMode",
      "dev"
    ]);

    const removeKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (keepKeys.has(key)) continue;
      if (key.startsWith("lastUsedDeckId:")) continue;
      if (key.startsWith("deckEditorSettings:")) continue;
      removeKeys.push(key);
    }
    removeKeys.forEach((key) => localStorage.removeItem(key));

    try { sessionStorage.clear(); } catch (_) {}

    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch (e) {
        console.warn("[CacheClear] Cache API clear failed:", e);
      }
    }

    if (typeof indexedDB !== "undefined" && typeof indexedDB.deleteDatabase === "function") {
      try {
        indexedDB.deleteDatabase("DependrapDeckImages");
      } catch (e) {
        console.warn("[CacheClear] IndexedDB clear failed:", e);
      }
    }

    location.reload();
  }

  button.onclick = ()=>{
    panel.classList.toggle("hidden");
    panel.setAttribute("aria-hidden", panel.classList.contains("hidden") ? "true" : "false");
    // ゲーム画面以外ではリセット・降参ボタンを非表示にする
    const isGamePage = window.location.pathname.endsWith("game.html") || !!document.getElementById("field");
    const resetBtn = document.getElementById("resetFieldBtn");
    const surrenderBtn = document.getElementById("surrenderBtn");
    const soloStartBtn = document.getElementById("soloStartBtn");
    const deckViewerBtn = document.getElementById("deckViewerBtn");
    const isLocked = typeof window.isGameInteractionLocked === "function" ? window.isGameInteractionLocked() : false;
    if (deckViewerBtn) deckViewerBtn.style.display = isGamePage ? "block" : "none";
    if (resetBtn) resetBtn.style.display = (isGamePage && !isLocked) ? "block" : "none";
    if (surrenderBtn) {
      // playing 状態かつゲーム画面のみ表示
      const isPlaying = typeof state !== "undefined" && state?.matchData?.status === "playing" && !state?.matchData?.winner;
      surrenderBtn.style.display = (isGamePage && !isLocked && isPlaying) ? "block" : "none";
    }
    // 両プレイヤーが接続している場合は「1人で開始」を非表示にする
    if (soloStartBtn) soloStartBtn.style.display = (isGamePage && isLocked && !window._bothPlayersConnected) ? "block" : "none";
  };

  document.getElementById("backBtn").onclick = ()=>{
    openConfirm("タイトルに戻りますか？", ()=>{
      location.href = "index.html";
    });
  };

  document.getElementById("closeMenuBtn").onclick = ()=>{
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  };

  document.getElementById("surrenderBtn").onclick = ()=>{
    panel.classList.add("hidden");
    openConfirm("降参しますか？相手の勝利となります。", ()=>{
      // 降参: 相手を勝者として Firebase に書き込む
      if (typeof state !== "undefined" && typeof firebaseClient !== "undefined") {
        const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
        const op = me === "player1" ? "player2" : "player1";
        if (state.matchData) {
          state.matchData.winner = op;
          state.matchData.winnerSetAt = Date.now(); // タイムスタンプを設定
          const gameRoom = localStorage.getItem("gameRoom");
          if (gameRoom && firebaseClient?.db) {
            firebaseClient.writeMatchData(gameRoom, state.matchData);
          }
        }
      }
    });
  };
  
  document.getElementById("resetFieldBtn").onclick = ()=>{
    if(typeof window.resetField === "function") window.resetField();
    panel.classList.add("hidden");
  };

  document.getElementById("soloStartBtn").onclick = ()=>{
    if (typeof window.startSoloGame === "function") window.startSoloGame();
    panel.classList.add("hidden");
  };

  document.getElementById("deckViewerBtn").onclick = ()=>{
    if (typeof window.openDeckViewer === "function") window.openDeckViewer();
    panel.classList.add("hidden");
  };

  document.getElementById("optBtn").onclick = ()=>{
    optionsModal.classList.remove("hidden");
    document.getElementById("bgmVolume").value = settings.bgm;
    document.getElementById("seVolume").value = settings.se;
    const cb = document.getElementById("scrollZoomDynamicEnabled");
    if (cb) cb.checked = (typeof window.isScrollZoomDynamicEnabled === "function") ? window.isScrollZoomDynamicEnabled() : true;
    const ppCb = document.getElementById("ppCostModalEnabled");
    if (ppCb) ppCb.checked = !!settings.ppCostModalEnabled;
    const autoCb = document.getElementById("autoPlayEnabled");
    if (autoCb) autoCb.checked = !!settings.autoPlayEnabled;
  };

  document.getElementById("closeOpt").onclick = ()=>{
    optionsModal.classList.add("hidden");
  };

  document.getElementById("deleteAccountBtn").onclick = ()=>{
    openConfirm("アカウントを削除しますか？", ()=>{
      openConfirm("本当に削除しますか？この操作は取り消せません。", async ()=>{
        try{
          await deleteAccount();
        } catch(e){
          showErrorMessage(e.message);
        }
      });
    });
  };

  document.getElementById("clearCacheBtn").onclick = ()=>{
    openConfirm("キャッシュをクリアしますか？（アカウント情報と設定は保持されます）", async ()=>{
      try {
        await clearAppCache();
      } catch (e) {
        console.error("[CacheClear] Failed:", e);
      }
    });
  };

  document.getElementById("confirmYes").onclick = ()=>{
    const callback = confirmCallback;
    confirmModal.classList.add("hidden");
    confirmCallback = null;
    if(callback) callback();
  };

  document.getElementById("confirmNo").onclick = closeConfirm;

  confirmModal.onclick = (e)=>{
    if(e.target === confirmModal) closeConfirm();
  };

  document.addEventListener("input", (e)=>{
    if(e.target.id === "bgmVolume") settings.bgm = e.target.value;
    if(e.target.id === "seVolume") settings.se = e.target.value;
    if(e.target.id === "ppCostModalEnabled") settings.ppCostModalEnabled = !!e.target.checked;
    if(e.target.id === "autoPlayEnabled") settings.autoPlayEnabled = !!e.target.checked;
    localStorage.setItem("settings", JSON.stringify(settings));
  });
  document.addEventListener("change", (e)=>{
    if (e.target.id === "scrollZoomDynamicEnabled" && typeof window.setScrollZoomDynamicEnabled === "function") {
      window.setScrollZoomDynamicEnabled(!!e.target.checked);
    }
    if (e.target.id === "autoPlayEnabled" && window.AutoBattleSystem && typeof window.AutoBattleSystem.setEnabled === "function") {
      window.AutoBattleSystem.setEnabled(!!e.target.checked);
    }
  });

  document.addEventListener("click", (e)=>{
    if(!panel.contains(e.target) && !button.contains(e.target)){
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
    }

    if(e.target.classList.contains("menuItem") || e.target.tagName === "BUTTON"){
      playSE();
    }
  });

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
      optionsModal.classList.add("hidden");
      closeConfirm();
    }
    if ((e.key === "Enter" || e.key === " ") && e.target === button) {
      e.preventDefault();
      button.click();
    }
  });
})();
