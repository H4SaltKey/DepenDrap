function updateDicePhaseUI() {
  const m = state.matchData;
  let overlay = document.getElementById("dicePhaseOverlay");

  if (!gameReady) {
    if (overlay) overlay.remove();
    return;
  }

  if (m.status !== "setup_dice") {
    if (overlay) {
      overlay.remove();
    }
    return;
  }

  // オーバーレイを作成（初回のみ）
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "dicePhaseOverlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.95); z-index: 10000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(15px); flex-direction: column; color: #fff;
      transition: opacity 0.5s ease; font-family: 'Outfit', sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const p1Dice = state.player1.diceValue;
  const p2Dice = state.player2.diceValue;
  const bothRolled = (p1Dice >= 0 && p2Dice >= 0);

  // ===== フェーズ判定 =====
  // phase: "rolling" | "result"
  const phase = bothRolled ? "result" : "rolling";
  const prevPhase = overlay.dataset.phase || "";

  // ===== フェーズ: 結果表示（両プレイヤーが振り終えた） =====
  if (phase === "result") {
    // フェーズが変わった時 or 選択状態が変わった時（勝者が選択後に敗者側も更新）は再描画
    const chooserKey = p1Dice < p2Dice ? "player1" : (p2Dice < p1Dice ? "player2" : "");
    const renderKey = `result_${p1Dice}_${p2Dice}_${playerKey}`;
    if (overlay.dataset.renderKey === renderKey) return; // 同じ内容なら何もしない
    overlay.dataset.phase = "result";
    overlay.dataset.renderKey = renderKey;

    let resultTitle, resultMsg, p1Color, p2Color;

    if (p1Dice === p2Dice) {
      // 引き分け
      resultTitle = `<h2 class="dice-title" style="color:#ff4444;">引き分け</h2>`;
      resultMsg = `
        <p class="dice-subtitle" style="color:#fff;margin-top:40px;">同じ値です。もう一度振ります...</p>
        <button class="dice-roll-btn" onclick="handleResetDice()" style="background:#444;color:#fff;margin-top:30px;">振り直し</button>`;
      p1Color = "#fff"; p2Color = "#fff";

    } else if (p1Dice < p2Dice) {
      // プレイヤー1が勝利 → 選択権あり
      const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
      const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
      const winnerIsMe = (playerKey === "player1");
      const winColor = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      p1Color = winnerIsMe ? "#4fc3f7" : "#e24a4a"; p2Color = "#fff";
      resultTitle = `<h2 class="dice-title" style="color:${winColor};animation:titleGlow 1s ease-in-out infinite;">${p1Label}の勝利！</h2>`;
      if (playerKey === "player1") {
        resultMsg = `
          <p class="dice-subtitle" style="color:#fff;margin-top:30px;">先攻・後攻を選択してください</p>
          <div class="dice-choice-group">
            <button class="dice-choice-btn primary" onclick="handleChooseOrder(true)">先攻</button>
            <button class="dice-choice-btn secondary" onclick="handleChooseOrder(false)">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-wait-msg" style="color:#fff;margin-top:40px;">相手が手番（先攻・後攻）を選択しています...</p>`;
      }

    } else {
      // プレイヤー2が勝利 → 選択権あり
      const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
      const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
      const winnerIsMe = (playerKey === "player2");
      const winColor = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      p1Color = "#fff"; p2Color = winnerIsMe ? "#4fc3f7" : "#e24a4a";
      resultTitle = `<h2 class="dice-title" style="color:${winColor};animation:titleGlow 1s ease-in-out infinite;">${p2Label}の勝利！</h2>`;
      if (playerKey === "player2") {
        resultMsg = `
          <p class="dice-subtitle" style="color:#fff;margin-top:30px;">先攻・後攻を選択してください</p>
          <div class="dice-choice-group">
            <button class="dice-choice-btn primary" onclick="handleChooseOrder(true)">先攻</button>
            <button class="dice-choice-btn secondary" onclick="handleChooseOrder(false)">後攻</button>
          </div>`;
      } else {
        resultMsg = `<p class="dice-wait-msg" style="color:#fff;margin-top:40px;">相手が手番（先攻・後攻）を選択しています...</p>`;
      }
    }

    const p1Label = (playerKey === "player1") ? "あなた" : "あいて";
    const p2Label = (playerKey === "player2") ? "あなた" : "あいて";
    overlay.innerHTML = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        ${resultTitle}
        <div style="display:flex;justify-content:center;gap:100px;align-items:center;margin:50px 0;">
          <div style="text-align:center;">
            <div style="font-size:16px;color:#fff;letter-spacing:2px;margin-bottom:20px;font-weight:900;">${p1Label}</div>
            <div class="dice-value-large" style="color:${p1Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;">${p1Dice}</div>
          </div>
          <div style="font-size:32px;color:#444;font-weight:900;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:16px;color:#fff;letter-spacing:2px;margin-bottom:20px;font-weight:900;">${p2Label}</div>
            <div class="dice-value-large" style="color:${p2Color};animation:diceResultPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both;">${p2Dice}</div>
          </div>
        </div>
        ${resultMsg}
      </div>
    `;
    return;
  }

  // ===== フェーズ: ローリング（まだ振っていない or 片方だけ） =====
  // レイアウトが存在しない場合、またはプレイヤー名が変わった場合に再構築
  const p1Name = state.player1.username || "プレイヤー1";
  const p2Name = state.player2.username || "プレイヤー2";
  const nameKey = `${p1Name}|${p2Name}`;

  if (phase !== prevPhase || !overlay.querySelector("#dice-val-player1") || overlay.dataset.nameKey !== nameKey) {
    overlay.dataset.phase = "rolling";
    overlay.dataset.renderKey = "";
    overlay.dataset.nameKey = nameKey;
    overlay.innerHTML = `
      <div class="dice-container" style="max-width:900px;width:90%;">
        <h2 class="dice-title" style="margin-bottom:60px;">ダイスロール</h2>
        <div style="display:flex;justify-content:center;gap:100px;align-items:flex-start;">
          <div style="text-align:center;">
            <div style="font-size:18px;color:#fff;letter-spacing:2px;margin-bottom:8px;font-weight:900;">${myRole === "player1" ? "あなた" : "あいて"}</div>
            <div style="font-size:14px;color:#c7b377;letter-spacing:1px;margin-bottom:22px;font-weight:700;">${p1Name}</div>
            <div id="dice-val-player1" class="dice-value-large" style="color:#fff;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player1" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;display:none;">ダイスを振る</button>
          </div>
          <div style="font-size:32px;color:#444;font-weight:900;margin-top:90px;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:18px;color:#fff;letter-spacing:2px;margin-bottom:8px;font-weight:900;">${myRole === "player2" ? "あなた" : "あいて"}</div>
            <div style="font-size:14px;color:#c7b377;letter-spacing:1px;margin-bottom:22px;font-weight:700;">${p2Name}</div>
            <div id="dice-val-player2" class="dice-value-large" style="color:#fff;min-height:160px;display:flex;align-items:center;justify-content:center;">?</div>
            <button id="dice-btn-player2" class="dice-roll-btn" onclick="handleDiceRoll()" style="margin-top:40px;display:none;">ダイスを振る</button>
          </div>
        </div>
        <div id="dice-roll-center" style="text-align:center;margin-top:40px;">
          <button id="dice-btn-center" class="dice-roll-btn" onclick="handleDiceRoll()" style="display:none;">ダイスを振る</button>
        </div>
        <div id="dice-status-msg" style="margin-top:30px;font-size:13px;color:#fff;letter-spacing:2px;min-height:20px;text-align:center;"></div>
      </div>
    `;
  }

  // 各プレイヤーの欄を個別に更新（DOM再構築なし）
  const p1El = document.getElementById("dice-val-player1");
  const p2El = document.getElementById("dice-val-player2");
  const p1Btn = document.getElementById("dice-btn-player1");
  const p2Btn = document.getElementById("dice-btn-player2");
  const statusMsg = document.getElementById("dice-status-msg");

  if (p1El && p1Dice >= 0 && p1El.textContent !== String(p1Dice)) {
    p1El.style.animation = "none";
    p1El.textContent = p1Dice;
    void p1El.offsetWidth;
    p1El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }
  if (p2El && p2Dice >= 0 && p2El.textContent !== String(p2Dice)) {
    p2El.style.animation = "none";
    p2El.textContent = p2Dice;
    void p2El.offsetWidth;
    p2El.style.animation = "diceResultPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards";
  }

  // 自分のボタンだけ表示、相手のボタンは非表示
  // diceValue が確実に -1 の場合のみボタンを表示（undefined/null は非表示）
  const myDice = playerKey === "player1" ? p1Dice : p2Dice;
  if (p1Btn) p1Btn.style.display = "none";
  if (p2Btn) p2Btn.style.display = "none";
  // 中央ボタン
  const centerBtn = document.getElementById("dice-btn-center");
  if (centerBtn) centerBtn.style.display = (myDice === -1) ? "inline-block" : "none";

  // ステータスメッセージ
  if (statusMsg) {
    if (p1Dice >= 0 && p2Dice < 0) {
      statusMsg.innerHTML = `<span style="color:#00ffcc;animation:pulse 2s infinite;display:inline-block;">プレイヤー2がダイスを振るのを待っています...</span>`;
    } else if (p2Dice >= 0 && p1Dice < 0) {
      statusMsg.innerHTML = `<span style="color:#e24a4a;animation:pulse 2s infinite;display:inline-block;">プレイヤー1がダイスを振るのを待っています...</span>`;
    } else {
      statusMsg.innerHTML = "";
    }
  }
}

// ===== ダイスフェーズ =====
// 設計原則（新）:
//   - 自分のデータは rooms/{room}/playerState/{myKey} にのみ書く
//   - 相手のデータは絶対に書かない
//   - matchData は rooms/{room}/matchData に書く（ターン権保持者のみ）
//   - diceValue は rooms/{room}/playerDice/{myKey} に書く（ダイスフェーズ専用）
//   - 読み取りは各パスの watcher が担当

async function handleDiceRoll() {
  if (window.isGameInteractionLocked()) {
    console.warn("[handleDiceRoll] 接続待ち中のため操作不可");
    return;
  }
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");

  console.log("[handleDiceRoll] 開始 playerKey:", playerKey,
    "diceValue:", state[playerKey]?.diceValue,
    "gameRoom:", localStorage.getItem("gameRoom"),
    "firebase connected:", firebaseClient?.isConnected);

  if (!state[playerKey]) {
    console.warn("[handleDiceRoll] state[playerKey] が存在しません:", playerKey);
    return;
  }
  if (state[playerKey].diceValue !== -1) {
    console.log("[handleDiceRoll] 既に振っています:", state[playerKey].diceValue);
    return;
  }

  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom) {
    console.warn("[handleDiceRoll] gameRoom が null です。localStorage:", {
      gameRoom: localStorage.getItem("gameRoom"),
      gamePlayerKey: localStorage.getItem("gamePlayerKey"),
      gameStarted: localStorage.getItem("gameStarted")
    });
    return;
  }
  if (!firebaseClient?.db) {
    console.warn("[handleDiceRoll] firebaseClient.db が null です。isConnected:", firebaseClient?.isConnected);
    return;
  }

  // ボタンを非表示にする（押した直後）
  const btn1 = document.getElementById("dice-btn-player1");
  const btn2 = document.getElementById("dice-btn-player2");
  const btnCenter = document.getElementById("dice-btn-center");
  if (btn1) btn1.style.display = "none";
  if (btn2) btn2.style.display = "none";
  if (btnCenter) btnCenter.style.display = "none";

  showDiceRollingAnimation();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const roll = Math.floor(Math.random() * 100) + 1;
  console.log("[handleDiceRoll] ロール結果:", roll);
  addGameLog(`[DICE] ${window.myUsername || state[playerKey]?.username || playerKey} がダイスを振りました: ${roll}`);

  // ローカルに即反映
  state[playerKey].diceValue = roll;
  update();

  // Firebase: playerDice パスにのみ書く（相手のパスは触らない）
  await firebaseClient.setPlayerDice(gameRoom, playerKey, roll);
  
  // 初回ゲーム時のデッキ枚数同期漏れを防ぐため、ダイスロール直後に自分の状態を同期する
  await firebaseClient.writeMyState(gameRoom, playerKey, _getMyStateForSync());
}

function showDiceRollingAnimation() {
  const playerKey = localStorage.getItem("gamePlayerKey") || (window.myRole || "player1");
  const diceEl = document.getElementById(`dice-val-${playerKey}`);
  if (!diceEl) return;
  diceEl.style.animation = "diceRolling 0.15s ease-in-out infinite";
  diceEl.textContent = "?";
}

async function handleResetDice() {
  const gameRoom = localStorage.getItem("gameRoom");
  if (!gameRoom || !firebaseClient) return;

  // ローカルでリセット
  state.player1.diceValue = -1;
  state.player1.ready = false;
  state.player2.diceValue = -1;
  state.player2.ready = false;
  update();

  // Firebaseでリセット
  await firebaseClient.resetPlayerDice(gameRoom);

  // UI更新
  updateDicePhaseUI();
}

async function handleChooseOrder(goFirst) {
  const me = window.myRole || "player1";
  const op = me === "player1" ? "player2" : "player1";

  state.matchData.turnPlayer  = goFirst ? me : op;
  state.matchData.firstPlayer = state.matchData.turnPlayer;
  state.matchData.status      = "setup_evolution";
  state.matchData.round       = 1;
  state.matchData.turn        = 1;
  state.matchData.winner      = null;   // 前回の winner を必ずクリア
  state.matchData.winnerSetAt = null;   // タイムスタンプもクリア

  // ゲーム開始時刻を記録（古い winner を無視するため）
  // 3秒の猶予を持たせて、Firebase から古い winner が流れてきても無視できるようにする
  // window._gameStartedAt = Date.now() + 3000; // 削除
  window._resultDismissed = false;  // 新しいゲーム開始時は判定を有効化

  const firstPlayerName = state.matchData.turnPlayer === "player1"
    ? (state.player1.username || "P1")
    : (state.player2.username || "P2");

  addGameLog(`[MATCH] 先攻: ${firstPlayerName}。進化の道を選択してください...`);

  state.player1.evolutionPath = null;
  state.player1.evoContinuousDmgCount = 0;
  state.player1.evoBackwaterExpGained = false;

  state.player2.evolutionPath = null;
  state.player2.evoContinuousDmgCount = 0;
  state.player2.evoBackwaterExpGained = false;

  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    await firebaseClient.writeMatchData(gameRoom, state.matchData);
    await firebaseClient.writeMyState(gameRoom, "player1", state.player1);
    await firebaseClient.writeMyState(gameRoom, "player2", state.player2);
  }

  update();
}