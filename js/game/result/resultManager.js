function triggerOverdrawDefeat() 
{
  // リザルト表示中は判定しない（2重表示防止）
  if (window._resultShowing) return;
  
  // 閉じるボタンが押された後は判定しない
  if (window._resultDismissed) return;
  
  // 盤面リセット中は判定しない
  if (window._isResetting) return;
  
  const myRole = window.myRole;
  if (!myRole) return;
  const opRole = myRole === 'player1' ? 'player2' : 'player1';
  
  console.log("[Overdraw] オーバードローによる敗北:", myRole);
  
  // 自分が敗北
  const winner = opRole;
  
  state.matchData.winner = winner;
  state.matchData.winnerSetAt = Date.now();
  
  const gameRoom = localStorage.getItem("gameRoom");
  if (gameRoom && firebaseClient?.db) {
    firebaseClient.writeMatchData(gameRoom, state.matchData);
  }
  
  // 即座にリザルトを表示
  showResultScreen(winner);
}


function showResultScreen(winner) {
  // 既に表示中の場合は何もしない（2重表示防止）
  if (window._resultShowing) {
    console.log("[Result] SKIP: already showing");
    return;
  }
  if (document.getElementById('gameResultOverlay')) {
    console.log("[Result] SKIP: overlay already exists");
    return;
  }
  
  // リザルト表示中フラグを立てる
  window._resultShowing = true;
  
  // 勝者を記憶（リザルトを閉じた後も再表示できるように）
  window._lastWinner = winner;
  
  const isWin = (window.myRole === winner);
  const isDraw = (winner === 'draw');
  const isSolo = !!window._soloHotSeat;
  if (window.BgmManager) {
    window.BgmManager.playScene(isDraw ? "game" : isWin ? "resultWin" : "resultLose");
  }
  const div = document.createElement('div');
  div.id = 'gameResultOverlay';

  let title = '勝利';
  let color = '#c7b377';
  let subText = '世界はあなたのものです。';

  if (isDraw) {
    title = '引き分け';
    color = '#aaa';
    subText = '決着はつきませんでした。';
  } else if (!isWin) {
    title = '敗北';
    color = '#e24a4a';
    subText = '力を蓄え、再挑戦しましょう。';
  }

  div.innerHTML = `
    <div class="result-backdrop" style="background: radial-gradient(circle, ${color}33 0%, rgba(0,0,0,0.95) 70%);"></div>
    <div class="result-content">
      <div class="result-banner" style="border-top: 2px solid ${color}; border-bottom: 2px solid ${color};">
        <h1 class="result-title" style="color: ${color}; text-shadow: 0 0 30px ${color}66;">${title}</h1>
      </div>
      <p class="result-subtext">${subText}</p>
      <div id="rematchStatus" style="min-height:28px;margin-bottom:10px;font-size:13px;color:#aaa;letter-spacing:1px;">${isSolo ? "ソロプレイ" : ""}</div>
      <div class="result-actions">
        <button class="result-btn" id="rematchBtn" onclick="${isSolo ? "returnToSoloSetup()" : "requestRematch()"}" style="background: ${color}; box-shadow: 0 0 20px ${color}44;">
          ${isSolo ? "ソロ設定に戻る" : "再戦を申し込む"}
        </button>
        <button class="result-btn secondary" onclick="closeResultScreen()" style="border-color:rgba(255,255,255,0.2);">
          閉じる
        </button>
        <button class="result-btn secondary" onclick="leaveGameToTitle()">
          タイトルへ戻る
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  // 相手からの再戦リクエストを監視（まだ監視していない場合のみ開始）
  if (!isSolo && !_rematchWatcher) {
    watchRematchRequest();
  }
}

window.returnToSoloSetup = function() {
  if (typeof window.stopAllWatchers === "function") window.stopAllWatchers();
  ["gameRoom", "gameStarted", "gameStartedRoom"].forEach(key => localStorage.removeItem(key));
  sessionStorage.removeItem("wasInGame");
  location.href = "soloSetup.html";
};

window.leaveGameToTitle = function() {
  if (typeof window.stopAllWatchers === "function") window.stopAllWatchers();
  ["gameRoom", "gameStarted", "gameStartedRoom"].forEach(key => localStorage.removeItem(key));
  sessionStorage.removeItem("wasInGame");
  location.href = "index.html";
};

function closeResultScreen() {
  // リスナーは解除せず、監視を継続（相手からの再戦申し込みを受け取るため）
  const overlay = document.getElementById('gameResultOverlay');
  if (overlay) overlay.remove();
  
  // リザルト表示中フラグを解除
  window._resultShowing = false;

  // 閉じた後は再度 winner 判定を行わない（executeReset / handleChooseOrder まで維持）
  window._resultDismissed = true;
}

// ===== 再戦合意システム =====

let _rematchWatcher = null;

window.requestRematch = async function() {
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  if (!gameRoom || !firebaseClient?.db || window._soloHotSeat) {
    const statusEl = document.getElementById("rematchStatus");
    if (statusEl) statusEl.textContent = "再戦の通信を開始できません。ルーム接続を確認してください。";
    return;
  }

  const btn = document.getElementById("rematchBtn");
  if (btn) { btn.disabled = true; btn.textContent = "申し込み中..."; }

  const statusEl = document.getElementById("rematchStatus");
  if (statusEl) statusEl.textContent = "相手の承諾を待っています...";

  // Firebase に再戦リクエストを書き込む
  try {
    await firebaseClient.db.ref(`rooms/${gameRoom}/rematch/${me}`).set({
      requested: true,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error("[Rematch] リクエスト送信に失敗:", error);
    if (statusEl) statusEl.textContent = "申し込みに失敗しました。通信状態を確認して再試行してください。";
    if (btn) { btn.disabled = false; btn.textContent = "再戦を申し込む"; }
  }
};

window.watchRematchRequest = function() {
  const gameRoom = localStorage.getItem("gameRoom");
  const me = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
  const op = me === "player1" ? "player2" : "player1";
  if (!gameRoom || !firebaseClient?.db) return;

  if (_rematchWatcher) { _rematchWatcher.off(); _rematchWatcher = null; }

  _rematchWatcher = firebaseClient.db.ref(`rooms/${gameRoom}/rematch`);
  _rematchWatcher.on('value', (snap) => {
    const data = snap.val() || {};
    const myReq = data[me]?.requested;
    const opReq = data[op]?.requested;

    if (myReq && opReq) {
      const statusEl = document.getElementById("rematchStatus");
      if (statusEl) statusEl.textContent = "両者が合意しました。再戦を準備しています...";
      if (me !== "player1" || window._rematchResetStarted || window._isResetting) return;
      window._rematchResetStarted = true;
      console.log("[Rematch] 両者の合意を確認。player1 が共通リセットを開始します。");
      if (typeof executeReset === "function") {
        executeReset().catch(error => {
          console.error("[Rematch] リセットに失敗:", error);
          window._rematchResetStarted = false;
          if (statusEl) statusEl.textContent = "再戦準備に失敗しました。もう一度お試しください。";
        });
      }
    } else if (opReq && !myReq) {
      const statusEl = document.getElementById("rematchStatus");
      if (statusEl) statusEl.textContent = "相手が再戦を希望しています！";
    }
  });
};
