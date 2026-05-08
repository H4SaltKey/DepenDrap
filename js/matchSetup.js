/**
 * matchSetup.js  v2.0 — Photon Realtime 版
 * serve_secure.py への依存を完全廃止。
 * Photon Room でマッチングし、両者 READY で game.html へ遷移。
 */

let currentUser   = "";
let inRoom        = false;
let myReady       = false;
let opponentReady = false;
let startingMatch = false;

// ===== 初期化 =====

function initMatchSetup() {
  currentUser = localStorage.getItem("username") || "Player";
  document.getElementById("myPlayer").value = currentUser;

  renderDeckGallery();

  // Photon 初期化
  PhotonSync.init({
    onStateChange:    onPhotonStateChange,
    onJoinedRoom:     onJoinedRoom,
    onOpponentJoined: onOpponentJoined,
    onOpponentLeft:   onOpponentLeft,
    onRoomList:       onRoomListUpdate,
  });
}

// ===== Photon コールバック =====

function onPhotonStateChange(stateName) {
  const el = document.getElementById("photonStatus");
  const map = {
    "ConnectingToMasterserver": ["Photon 接続中...", false],
    "ConnectedToMaster":        ["Photon 接続済み ✓", true],
    "JoinedLobby":              ["ロビー待機中 ✓", true],
    "Joining":                  ["入室中...", false],
    "Joined":                   ["ルーム参加中 ✓", true],
    "Disconnected":             ["切断されました", false],
  };
  const [label, ok] = map[stateName] || [stateName, false];
  el.textContent = label;
  el.className   = ok ? "ok" : "";

  // 接続完了したらボタンを有効化
  if (stateName === "JoinedLobby" || stateName === "ConnectedToMaster") {
    document.getElementById("createRoomBtn").disabled = false;
    document.getElementById("joinRoomBtn").disabled   = false;
  } else {
    // 接続中や未接続、入室中などはボタンを無効化
    document.getElementById("createRoomBtn").disabled = true;
    document.getElementById("joinRoomBtn").disabled   = true;
  }
}

function onJoinedRoom(roomName, role) {
  inRoom = true;
  window._currentRoomName = roomName;
  showMsg(`ルーム「${roomName}」に参加しました。あなたは ${role === "player1" ? "先攻" : "後攻"} です。`);
  document.getElementById("cancelBtn").style.display = "block";
  document.getElementById("startBtn").disabled = false;
  document.getElementById("createRoomBtn").disabled = true;
  document.getElementById("joinRoomBtn").disabled   = true;

  // 自分の Ready 状態をリセット
  myReady       = false;
  opponentReady = false;
  updateReadyUI();
}

function onOpponentJoined(actor) {
  showMsg(`対戦相手「${actor.name}」が入室しました。`);
  updateOpponentUI(actor.name, false);
}

function onOpponentLeft(actor) {
  opponentReady = false;
  updateOpponentUI("WAITING", false);
  showMsg("対戦相手が退室しました。");
  // 試合開始前なら Ready をリセット
  if (!startingMatch) {
    myReady = false;
    updateReadyUI();
    document.getElementById("startBtn").textContent = "READY";
    document.getElementById("startBtn").disabled    = false;
  }
}

function onRoomListUpdate(rooms) {
  const container = document.getElementById("roomList");
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div style="color:#666;font-size:13px;padding:10px;">公開ルームがありません。作成してください。</div>';
    return;
  }
  container.innerHTML = "";
  rooms.forEach(room => {
    const item = document.createElement("div");
    item.className = "roomItem";
    // ルームリストは表示専用（クリック即参加禁止）
    // クリック時は入力欄にルーム名をセットするだけに留める
    item.innerHTML = `
      <span class="room-name">${room.name}</span>
      <span class="room-players">${room.playerCount}/${room.maxPlayers} 人</span>
      <button class="room-join-btn" onclick="document.getElementById('roomCodeInput').value='${room.name}'">選択</button>
    `;
    container.appendChild(item);
  });
}

// ===== ルーム操作 =====

function createRoom() {
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  const name = code || undefined; // 空なら自動生成
  PhotonSync.createRoom(name);
}

function joinRoom(roomName) {
  const code = roomName || document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (!code) { showMsg("ルームコードを入力してください。"); return; }
  PhotonSync.joinRoom(code);
}

function leaveRoom() {
  PhotonSync.leaveRoom();
  inRoom        = false;
  myReady       = false;
  opponentReady = false;
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("startBtn").disabled = true;
  document.getElementById("createRoomBtn").disabled = false;
  document.getElementById("joinRoomBtn").disabled   = false;
  updateReadyUI();
  showMsg("");
}

// ===== Ready 処理 =====

function markReady() {
  if (!inRoom) { showMsg("先にルームに参加してください。"); return; }

  const deck = selectedDeck();
  if (!deck) { showMsg("使用するデッキを選択してください。"); return; }

  myReady = !myReady; // トグル

  if (myReady) {
    document.getElementById("startBtn").textContent = "CANCEL READY";
    showMsg("準備完了！相手を待っています...");
  } else {
    document.getElementById("startBtn").textContent = "READY";
    showMsg("");
  }

  updateReadyUI();

  // 自分の Ready 状態を matchData として送信
  // matchData の代わりに CustomProperties を使う
  if (PhotonSync.isConnected()) {
    const props = {};
    props[`ready_${window.myRole}`] = myReady ? "1" : "0";
    // Photon Room CustomProperties に書き込む
    // 相手は onRoomPropertiesChange で受け取る（SDK が自動で通知）
    _setReadyProp(myReady);
  }

  checkBothReady();
}

function _setReadyProp(isReady) {
  if (!PhotonSync.isConnected()) return;
  const myRole = window.myRole;
  if (!myRole) return;

  const deck = selectedDeck();
  const readyPayload = {
    username: currentUser,
    _ready:    isReady,
    _deckCode: deck?.code || "empty",
    ...(typeof state !== "undefined" ? state[myRole] : {})
  };

  // photon-sync.js の引数付き sendPlayerState を呼び出す
  PhotonSync.sendPlayerState(readyPayload);
}

// PLAYER_STATE 受信時に相手の ready を検出
// photon-sync.js の EV.PLAYER_STATE ハンドラが state[role] を更新するので、
// state[opRole]._ready を監視する
function checkOpponentReady() {
  const opRole = window.myRole === "player1" ? "player2" : "player1";
  
  // core.js がロードされていない lobby 画面では window._photonPlayerData を参照
  const opData = (typeof state !== "undefined" && state[opRole]) 
               ? state[opRole] 
               : (window._photonPlayerData ? window._photonPlayerData[opRole] : null);

  if (opData) {
    const wasReady = opponentReady;
    opponentReady  = !!opData._ready;
    if (opponentReady !== wasReady) {
      updateOpponentUI(opData.username || "Opponent", opponentReady);
      checkBothReady();
    }
  }
}

function checkBothReady() {
  if (!myReady || !opponentReady || startingMatch) return;

  startingMatch = true;
  showMsg("両者準備完了！ゲームを開始します...");

  // マッチ状態を構築して localStorage に保存
  const deck    = selectedDeck();
  const myRole  = window.myRole;
  const opRole  = myRole === "player1" ? "player2" : "player1";
  const opDeck  = typeof state !== "undefined" ? (state[opRole]?._deckCode || "empty") : "empty";

  const matchState = buildMatchState(myRole, deck?.code || "empty", opRole, opDeck);

  localStorage.setItem("matchSetup", JSON.stringify({
    role:     myRole,
    self:     currentUser,
    deckCode: deck?.code || "empty",
    deckId:   deck?.id   || "",
    roomName: PhotonSync.isConnected() ? (window._currentRoomName || "") : "",
  }));
  localStorage.setItem("deckCode",   deck?.code || "empty");
  localStorage.setItem("gameState",  JSON.stringify(matchState));
  localStorage.removeItem("fieldCards");
  localStorage.removeItem("gameStarted");

  setTimeout(() => { location.href = "game.html"; }, 800);
}

function buildMatchState(role1, deckCode1, role2, deckCode2) {
  // core.js の makeCharState() を使って BASE_INITIAL_STATE と同期を保つ
  const base = () => typeof makeCharState === "function"
    ? makeCharState()
    : {
        level:1, levelMax:6, exp:0, expMax:2,
        hp:20, hpMax:20, barrier:0, barrierMax:5,
        shield:0, shieldMax:0, atk:5, atkMax:999,
        def:0, defMax:999, instantDef:0, instantDefMax:999,
        deck:[], backImage:null, timeLeft:300
      };

  const p1 = base();
  const p2 = base();

  if (role1 === "player1") {
    p1.username = currentUser;
    p1.deck     = (deckCode1 && deckCode1 !== "empty") ? tryDecode(deckCode1) : [];
    p1.backImage = selectedDeck()?.backImage || null;
    p2.username = typeof state !== "undefined" ? (state.player2?.username || "Opponent") : "Opponent";
    p2.deck     = (deckCode2 && deckCode2 !== "empty") ? tryDecode(deckCode2) : [];
  } else {
    p2.username = currentUser;
    p2.deck     = (deckCode1 && deckCode1 !== "empty") ? tryDecode(deckCode1) : [];
    p2.backImage = selectedDeck()?.backImage || null;
    p1.username = typeof state !== "undefined" ? (state.player1?.username || "Opponent") : "Opponent";
    p1.deck     = (deckCode2 && deckCode2 !== "empty") ? tryDecode(deckCode2) : [];
  }

  return {
    player1: p1, player2: p2,
    matchData: {
      round:1, turn:1, turnPlayer:"player1", status:"setup_dice",
      dice:{player1:null, player2:null},
      diceTimeLeft:30, choiceTimeLeft:15, winner:null, firstPlayer:null
    },
    logs: []
  };
}

function tryDecode(code) {
  try { return typeof decodeDeck === "function" ? decodeDeck(code) : []; }
  catch { return []; }
}

// ===== UI ヘルパー =====

function updateReadyUI() {
  const myPill = document.getElementById("myReadyStatus");
  myPill.querySelector("span").textContent = myReady ? "YOU: READY" : "YOU: UNREADY";
  myPill.classList.toggle("ready", myReady);
}

function updateOpponentUI(name, ready) {
  const oppPill = document.getElementById("opponentReadyStatus");
  oppPill.querySelector("span").textContent = ready ? `${name}: READY` : `${name}: NOT READY`;
  oppPill.classList.toggle("ready", ready);
}

function showMsg(text) {
  document.getElementById("setupMsg").textContent = text;
}

function selectedDeck() {
  const deckId = document.getElementById("deckSelect").value;
  try {
    const list = JSON.parse(localStorage.getItem("deckList")) || [];
    return list.find(d => d.id === deckId) || null;
  } catch { return null; }
}

function renderDeckGallery() {
  const gallery = document.getElementById("deckGallery");
  const select  = document.getElementById("deckSelect");
  if (!gallery || !select) return;

  let decks = [];
  try { decks = JSON.parse(localStorage.getItem("deckList")) || []; } catch {}

  gallery.innerHTML = "";
  select.innerHTML  = "";

  if (decks.length === 0) {
    gallery.innerHTML = "<div style='color:#b0a070;font-size:13px;padding:20px;text-align:center;width:100%;'>デッキがありません。デッキ構築画面で作成してください。</div>";
    return;
  }

  decks.forEach((deck, index) => {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = deck.name || deck.id;
    select.appendChild(option);

    const card = document.createElement("div");
    card.className = "deckCard";
    card.dataset.id = deck.id;
    if (index === 0) { select.value = deck.id; card.classList.add("selected"); }

    const img = document.createElement("img");
    img.src = (deck.backImage && deck.backImage.length > 5) ? deck.backImage : "assets/favicon.png";
    img.onerror = () => { img.src = "assets/favicon.png"; };

    const name = document.createElement("div");
    name.className = "deckCardName";
    name.textContent = deck.name || "名称未設定";

    card.appendChild(img);
    card.appendChild(name);
    card.addEventListener("click", () => {
      document.querySelectorAll(".deckCard").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      select.value = deck.id;
    });
    gallery.appendChild(card);
  });
}

// ===== 定期的に相手の Ready 状態をチェック（matchSetup 画面のみ） =====
let _readyCheckInterval = null;

function startReadyCheck() {
  if (_readyCheckInterval) return;
  _readyCheckInterval = setInterval(checkOpponentReady, 500);
}

function stopReadyCheck() {
  if (_readyCheckInterval) {
    clearInterval(_readyCheckInterval);
    _readyCheckInterval = null;
  }
}

// ===== イベントリスナー =====
document.getElementById("createRoomBtn").addEventListener("click", createRoom);
document.getElementById("joinRoomBtn").addEventListener("click",   () => joinRoom());
document.getElementById("startBtn").addEventListener("click",      markReady);
document.getElementById("cancelBtn").addEventListener("click",     leaveRoom);

// ページ離脱時にインターバルを停止
window.addEventListener("beforeunload", stopReadyCheck);

// ===== 起動 =====
initMatchSetup();
startReadyCheck();
