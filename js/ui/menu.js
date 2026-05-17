(function(){
  const settings = JSON.parse(localStorage.getItem("settings")) || {
    bgm: 0.5,
    se: 0.5,
    timeLimitEnabled: true
  };

  const html = `
    <div id="menuButton">☰</div>

    <div id="menuPanel" class="hidden">
      <div class="menuItem" id="backBtn">タイトルへ戻る</div>
      <div class="menuItem" id="surrenderBtn" style="color: #ff6b6b; display:none;">降参</div>
      <div class="menuItem" id="resetFieldBtn" style="color: #ff9999;">盤面リセット</div>
      <div class="menuItem" id="soloStartBtn" style="color: #9fe8ff; display:none;">1人で始める</div>
      <div class="menuItem" id="optBtn">オプション</div>
    </div>

    <div id="optionsModal" class="hidden">
      <div class="modalContent optionContent">
        <h3>オプション</h3>

        <label>BGM音量</label>
        <input type="range" id="bgmVolume" min="0" max="1" step="0.01">

        <label>SE音量</label>
        <input type="range" id="seVolume" min="0" max="1" step="0.01">

        <div class="optionFooter">
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
    #menuButton{
      position:fixed;
      top:15px;
      right:15px;
      width:50px;
      height:50px;
      border-radius:50%;
      background:#333;
      color:white;
      text-align:center;
      line-height:50px;
      cursor:pointer;
      z-index:10002;
    }

    #menuPanel{
      position:fixed;
      top:70px;
      right:15px;
      background:#222;
      z-index:10002;
    }

    .menuItem{
      padding:10px;
      color:white;
      cursor:pointer;
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
      z-index:10003;
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
    // Firebase 版：ローカルストレージのユーザー名を削除
    localStorage.removeItem("username");
    localStorage.removeItem("matchSetup");
    localStorage.removeItem("deckList");
    localStorage.removeItem("gameState");
    location.href = "login.html";
  }

  button.onclick = ()=>{
    panel.classList.toggle("hidden");
    // ゲーム画面以外ではリセット・降参ボタンを非表示にする
    const isGamePage = window.location.pathname.endsWith("game.html") || !!document.getElementById("field");
    const resetBtn = document.getElementById("resetFieldBtn");
    const surrenderBtn = document.getElementById("surrenderBtn");
    const soloStartBtn = document.getElementById("soloStartBtn");
    const isLocked = typeof window.isGameInteractionLocked === "function" ? window.isGameInteractionLocked() : false;
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

  document.getElementById("optBtn").onclick = ()=>{
    optionsModal.classList.remove("hidden");
    document.getElementById("bgmVolume").value = settings.bgm;
    document.getElementById("seVolume").value = settings.se;
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
    localStorage.setItem("settings", JSON.stringify(settings));
  });

  document.addEventListener("click", (e)=>{
    if(!panel.contains(e.target) && !button.contains(e.target)){
      panel.classList.add("hidden");
    }

    if(e.target.classList.contains("menuItem") || e.target.tagName === "BUTTON"){
      playSE();
    }
  });

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      panel.classList.add("hidden");
      optionsModal.classList.add("hidden");
      closeConfirm();
    }
  });
})();
