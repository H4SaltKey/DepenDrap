/**
 * matchSetup.js v3.0 — Firebase 版
 * Firebase Realtime Database を使用したマッチング
 */

let currentUser   = "";
let appState      = "disconnected"; // disconnected, connecting, lobby, inRoom, ready
let myReady       = false;
let opponentReady = false;
let startingMatch = false;
let currentRoomRef = null;
let roomUnsubscribe = null;

// ===== 初期化 =====

function initMatchSetup() {
  currentUser = localStorage.getItem("username") || "Player";
  document.getElementById("myPlayer").value = currentUser;

  renderDeckGallery();

  // Firebase 初期化
  FirebaseSync.init({
    onStateChange:    onFirebaseStateChange,
    onJoinedRoom:     onJoinedRoom,
    onOpponentJoined: onOpponentJoined,
    onOpponentLeft:   onOpponentLeft,
    onRoomList:       onRoomListUpdate,
    onPlayerReady:    onPlayerReadyStatus,
    onBothReady:      onBothReady,
  });
}

// ===== Firebase コールバック =====

function onFirebaseStateChange(stateName) {
  const el = document.getElementById("photonStatus");
  const map = {
    "connected":      ["Firebase 接続済み ✓", true, "lobby"],
    "disconnected":   ["Firebase 切断", false, "disconnected"],
    "error":          ["接続エラー", false, "disconnected"],
  };
  const [label, ok, mappedState] = map[stateName] || [stateName, false, "disconnected"];
  el.textContent = label;
  el.className   = ok ? "ok" : "";

  if (mappedState && appState !== "ready") {
    if (appState !== mappedState) {
      setAppState(mappedState);
    }
  }
}

function onJoinedRoom(roomName, role) {
  window._currentRoomName = roomName;
  showMsg(`ルーム「${roomName}」に参加しました。あなたは ${role === "player1" ? "先攻" : "後攻"} です。`);
  
  // 自分の Ready 状態をリセット
  myReady       = false;
  opponentReady = false;
  updateReadyUI();
  setAppState("inRoom");
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
    item.innerHTML = `
      <span class="room-name">${room.name}</span>
      <span class="room-players">${room.playerCount}/${room.maxPlayers} 人</span>
      <button class="room-join-btn" onclick="document.getElementById('roomCodeInput').value='${room.name}'">選択</button>
    `;
    container.appendChild(item);
  });
}

function onPlayerReadyStatus(data) {
  if (data.role !== window.myRole) {
    opponentReady = data.ready;
    updateOpponentUI(opponentReady ? "OPPONENT: READY" : "OPPONENT: NOT READY", opponentReady);
    checkBothReady();
  }
}

function onBothReady(data) {
  checkBothReady();
}

// ===== アプリケーション状態管理 =====

function setAppState(newState) {
  if (startingMatch) return; // 試合開始直前は状態をロック
  console.log(`[App] State changed: ${appState} -> ${newState}`);
  appState = newState;

  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn   = document.getElementById("joinRoomBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const startBtn  = document.getElementById("startBtn");

  switch (appState) {
    case "disconnected":
    case "connecting":
      createBtn.disabled = true;
      joinBtn.disabled   = true;
      cancelBtn.style.display = "none";
      startBtn.disabled  = true;
      break;

    case "lobby":
      createBtn.disabled = false;
      joinBtn.disabled   = false;
      cancelBtn.style.display = "none";
      startBtn.disabled  = true;
      break;

    case "inRoom":
      createBtn.disabled = true;
      joinBtn.disabled   = true;
      cancelBtn.style.display = "block";
      startBtn.disabled  = false;
      startBtn.textContent = "READY";
      break;

    case "ready":
      createBtn.disabled = true;
      joinBtn.disabled   = true;
      cancelBtn.style.display = "block";
      startBtn.disabled  = false;
      startBtn.textContent = "CANCEL READY";
      break;
  }
}

// ===== ルーム操作 =====

function createRoom() {
  if (appState !== "lobby") {
    showMsg("ロビーに接続してください。");
    return;
  }
  const code = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (code && !/^[A-Z0-9_]+$/.test(code)) {
    showMsg("ルームコードは英数字とアンダースコアのみ使用可能です。");
    return;
  }
  const name = code || undefined; // 空なら自動生成
  console.log("[MatchSetup] Creating room with name:", name || "auto-generated");
  setAppState("connecting"); // 連打防止
  FirebaseSync.createRoom(name);
}

function joinRoom(roomName) {
  if (appState !== "lobby") return;
  const code = roomName || document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (!code) { showMsg("ルームコードを入力してください。"); return; }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    showMsg("ルームコードは英数字とアンダースコアのみ使用可能です。");
    return;
  }
  setAppState("connecting"); // 連打防止
  FirebaseSync.joinRoom(code);
}

function leaveRoom() {
  FirebaseSync.leaveRoom();
  myReady       = false;
  opponentReady = false;
  updateReadyUI();
  showMsg("");
  setAppState("lobby");
}

// ===== Ready 処理 =====

function markReady() {
  if (appState !== "inRoom" && appState !== "ready") { 
    showMsg("先にルームに参加してください。"); 
    return; 
  }

  const deck = selectedDeck();
  if (!deck) { showMsg("使用するデッキを選択してください。"); return; }

  myReady = !myReady; // トグル

  if (myReady) {
    setAppState("ready");
    showMsg("準備完了！相手を待っています...");
  } else {
    setAppState("inRoom");
    showMsg("");
  }

  updateReadyUI();
  FirebaseSync.markReady(myReady);
  checkBothReady();
}

function checkBothReady() {
  if (!myReady || !opponentReady || startingMatch) return;

  startingMatch = true;
  showMsg("両者準備完了！ゲームを開始します...");

  // マッチ状態を構築して localStorage に保存
  const deck    = selectedDeck();
  const myRole  = window.myRole;
  const opRole  = myRole === "player1" ? "player2" : "player1";

  const matchState = buildMatchState(myRole, deck?.code || "empty", opRole, "empty");

  localStorage.setItem("matchSetup", JSON.stringify({
    role:     myRole,
    self:     currentUser,
    deckCode: deck?.code || "empty",
    deckId:   deck?.id   || "",
    roomName: window._currentRoomName || "",
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
    p2.username = "Opponent";
    p2.deck     = (deckCode2 && deckCode2 !== "empty") ? tryDecode(deckCode2) : [];
  } else {
    p2.username = currentUser;
    p2.deck     = (deckCode1 && deckCode1 !== "empty") ? tryDecode(deckCode1) : [];
    p2.backImage = selectedDeck()?.backImage || null;
    p1.username = "Opponent";
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

// ===== イベントリスナー =====
document.getElementById("createRoomBtn").addEventListener("click", createRoom);
document.getElementById("joinRoomBtn").addEventListener("click",   () => joinRoom());
document.getElementById("startBtn").addEventListener("click",      markReady);
document.getElementById("cancelBtn").addEventListener("click",     leaveRoom);

// ページ離脱時
window.addEventListener("beforeunload", () => {
  if (FirebaseSync.isInRoom()) {
    FirebaseSync.leaveRoom();
  }
});

// ===== 起動 =====
initMatchSetup();
