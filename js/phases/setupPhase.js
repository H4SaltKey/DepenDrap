/**
 * setupPhase.js
 * 進化の道選択フェーズなどのセットアップ処理
 */

window.updateEvolutionPhaseUI = function() {
  const m = state.matchData;
  let overlay = document.getElementById("evolutionPhaseOverlay");

  if (m.status !== "setup_evolution") {
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => { if (overlay) overlay.style.display = "none"; }, 500);
    }
    return;
  }

  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";
  
  const myPath = state[me]?.evolutionPath;
  const opPath = state[op]?.evolutionPath;

  // 両方とも選択済みなら playing に移行
  if (myPath && opPath) {
    if (m.turnPlayer === me && !window._evoPhaseTransitioning) {
      window._evoPhaseTransitioning = true;
      setTimeout(async () => {
        m.status = "setup_first_draw";
        m.firstDrawDone = false;
        m.firstDrawP1Ready = false;
        m.firstDrawP2Ready = false;
        window._firstDrawPhaseStarted = false;
        window._firstDrawAdvanceSent = false;
        addGameLog(`[MATCH] 進化選択が完了しました。ファーストドローフェーズに移行します。`);
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          await firebaseClient.writeMatchData(gameRoom, m);
        }
        window._evoPhaseTransitioning = false;
        update();
      }, 1500);
    }
    if (overlay) overlay.innerHTML = `<h2 style="color:#fff; text-shadow: 0 0 10px #fff;">両プレイヤーが道を選択しました<br>ファーストドローフェーズへ移行します...</h2>`;
    return;
  }

  // オーバーレイを作成
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "evolutionPhaseOverlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.98); z-index: 10000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(15px); flex-direction: column; color: #e0d0a0;
      transition: opacity 0.5s ease; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  // 自分が選択済みの場合は待機画面
  if (myPath) {
    overlay.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#c7b377; font-size:24px;">相手の選択を待っています...</h2>
        <div style="margin-top:20px; color:#aaa; font-size:14px;">あなたは「\${myPath}」を選択しました</div>
      </div>
    `;
    return;
  }

  // UI描画
  if (!overlay.dataset.rendered) {
    overlay.dataset.rendered = "true";
    overlay.innerHTML = `
      <div style="max-width:900px; width:90%; display:flex; flex-direction:column; gap:20px; animation: fadeIn 0.3s ease;">
        <h2 style="text-align:center; color:#c7b377; font-size:26px; margin-bottom:5px; font-weight:900; letter-spacing:2px;">進化の道を選択</h2>
        <p style="text-align:center; color:#aaa; font-size:13px; margin-bottom:15px;">レベルが[3/5/6]に達した時に強化される、永続的な能力を選択してください。</p>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <!-- 忍耐の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('忍耐の道')">
            <div class="evo-path-title">忍耐の道</div>
            <div class="evo-path-desc">手札の枚数上限が2枚増加し、最大レベル時は2ではなく3枚になる。<br>また、ラウンド開始時、手札をx枚増やす。<br>さらに、自身のターン終了時、枚数上限によって手札を捨てると、捨てた枚数ごとに経験値を最大2まで獲得する。<br><span class="evo-path-val">x=[0/1/3/4]</span></div>
          </button>

          <!-- 継続の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('継続の道')">
            <div class="evo-path-title">継続の道</div>
            <div class="evo-path-desc">ターン毎にy回まで、1以上のダメージを与える度(※)、1のダメージを与える。<br>さらに追加で、それぞれ3回目の発動に限り、1の貫通ダメージを与える。<br><span style="font-size:11px; color:#aaa;">※：この効果によるものは含まない</span><br><span class="evo-path-val">y=[1/3/4/6]</span></div>
          </button>

          <!-- 奇撃の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('奇撃の道')">
            <div class="evo-path-title">奇撃の道</div>
            <div class="evo-path-desc">一撃で6以上のダメージを与える時、そのダメージ判定の直前にzの脆弱ダメージを与える。<br><span class="evo-path-val">z=[1/3/4/6]</span></div>
          </button>

          <!-- 背水の道 -->
          <button class="evo-path-btn" onclick="selectEvolutionPath('背水の道')">
            <div class="evo-path-title">背水の道</div>
            <div class="evo-path-desc">手札が2枚以下の状態なら、[直接攻撃/”直接攻撃時“効果]のダメージを+1する。<br>また、自身のPPが2以上なら、与ダメージを追加で+tして、1の経験値を獲得する。<br><span style="font-size:11px; color:#aaa;">ただし、この効果による経験値は、ターン毎に1回まで獲得可能。</span><br><span class="evo-path-val">t=[1/2/3/4]</span></div>
          </button>
        </div>
      </div>
      <style>
        .evo-path-btn { background:rgba(20,20,30,0.8); border:1px solid #5a4b27; border-radius:8px; padding:20px; text-align:left; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 12px rgba(0,0,0,0.5); }
        .evo-path-btn:hover { background:rgba(40,40,50,0.9); border-color:#c7b377; transform:translateY(-2px); box-shadow:0 8px 24px rgba(199,179,119,0.25); }
        .evo-path-title { font-size:18px; font-weight:900; color:#f0d080; margin-bottom:8px; letter-spacing:1px; }
      </style>
    `;
  }
};

window.selectEvolutionPath = async function(pathName) {
  if (window.isGameInteractionLocked()) return;
  const me = window.myRole || "player1";
  state[me].evolutionPath = pathName;
  addGameLog(`[EVOLUTION] \${window.myUsername || state[me]?.username || me} が「\${pathName}」を選択しました。`);
  
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync());
  }
  
  // UI更新で相手の選択待ち画面へ
  const overlay = document.getElementById("evolutionPhaseOverlay");
  if (overlay) delete overlay.dataset.rendered; // 強制再描画
  
  update();
};
