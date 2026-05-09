/**
 * matchSetup.js v4.0 — Firebase Client 版
 * firebase-client.js を使用したマッチング
 */

let currentUser = "";
let currentRoom = null;
let currentPlayerKey = null;
let myReady = false;
let opponentReady = false;
let roomUnsubscribe = null;
let roomListUnsubscribe = null;

// ===== 初期化 =====

async function initMatchSetup() {
  currentUser = localStorage.getItem("username") || "Player";
  document.getElementById("myPlayer").value = currentUser;

  renderDeckGallery();

  // Firebase を初期化
  console.log("[MatchSetup] Firebase 初期化中...");
  const success = await firebaseClient.initialize(window.FIREBASE_CONFIG);

  if (success) {
    console.log("[MatchSetup] ✅ Firebase 初期化成功");
    updateFirebaseStatus("Firebase 接続済み ✓", true);
    
    // ルーム一覧を監視開始
    watchRoomList();
  } else {
    console.warn("[MatchSetup] ⚠️ Firebase 初期化失敗");
    updateFirebaseStatus("Firebase 接続エラー", false);
  }

  // 接続状態の変化を監視
  firebaseClient.on('connected', () => {
    console.log("[MatchSetup] Firebase 接続");
    updateFirebaseStatus("Firebase 接続済み ✓", true);
  });

  firebaseClient.on('disconnected', () => {
    console.log("[MatchSetup] Firebase 切断");
    updateFirebaseStatus("Firebase 切断", false);
  });
}

// ===== Firebase ステータス =====

function updateFirebaseStatus(label, isConnected) {
  const el = document.getElementById("firebaseStatus");
  if (el) {
    el.textContent = label;
    el.className = isConnected ? "ok" : "";
  }
}

// ===== ルーム操作 =====

async function createRoom() {
  const roomCode = document.getElementById("roomCodeInput").value.trim();
  const roomName = roomCode || undefined;

  console.log("[MatchSetup] ルーム作成:", roomName || "自動生成");

  const result = await firebaseClient.createRoom(roomName);
  if (!result) {
    showMsg("ルーム作成に失敗しました。");
    return;
  }

  currentRoom = result;
  currentPlayerKey = "player1";
  showMsg(`ルーム「${result}」を作成しました。`);
  
  // ルームを監視
  watchRoom(result);
  updateUIForRoom();
}

async function joinRoom() {
  const roomCode = document.getElementById("roomCodeInput").value.trim();

  if (!roomCode) {
    showMsg("ルームコードを入力してください。");
    return;
  }

  console.log("[MatchSetup] ルーム参加:", roomCode);

  const result = await firebaseClient.joinRoom(roomCode);
  if (!result) {
    showMsg("ルームが見つかりません。");
    return;
  }

  currentRoom = result.roomName;
  currentPlayerKey = result.playerKey;
  showMsg(`ルーム「${result.roomName}」に参加しました。`);
  
  // ルームを監視
  watchRoom(result.roomName);
  updateUIForRoom();
}

async function leaveRoom() {
  if (!currentRoom || !currentPlayerKey) {
    showMsg("ルームに参加していません。");
    return;
  }

  console.log("[MatchSetup] ルーム退出:", currentRoom);

  const success = await firebaseClient.leaveRoom(currentRoom, currentPlayerKey);
  if (success) {
    showMsg("ルームから退出しました。");
    resetRoom();
  } else {
    showMsg("ルーム退出に失敗しました。");
  }
}

// ===== ルーム監視 =====

function watchRoom(roomName) {
  if (roomUnsubscribe) {
    roomUnsubscribe();
  }

  roomUnsubscribe = firebaseClient.watchRoom(roomName, (roomData) => {
    if (!roomData) {
      console.log("[MatchSetup] ルームが削除されました");
      showMsg("ルームが削除されました。");
      resetRoom();
      return;
    }

    console.log("[MatchSetup] ルーム更新:", roomData);

    const players = roomData.players || {};
    const myPlayerData = players[currentPlayerKey];

    if (!myPlayerData) {
      console.log("[MatchSetup] ルームから削除されました");
      showMsg("ルームから削除されました。");
      resetRoom();
      return;
    }

    // 相手の状態を確認
    const opRole = currentPlayerKey === "player1" ? "player2" : "player1";
    const opPlayerData = players[opRole];

    // 相手が参加したか確認
    if (opPlayerData && !opPlayerData.hasJoined) {
      console.log("[MatchSetup] 相手が参加:", opPlayerData.username);
      showMsg(`対戦相手「${opPlayerData.username}」が入室しました。`);
      updateOpponentUI(opPlayerData.username, false);
      
      // hasJoined フラグを立てる
      firebaseClient.db.ref(`rooms/${roomName}/players/${opRole}/hasJoined`).set(true);
    }

    // 相手が退出したか確認
    if (!opPlayerData && opPlayerData !== undefined) {
      console.log("[MatchSetup] 相手が退出");
      showMsg("対戦相手が退出しました。");
      updateOpponentUI("WAITING", false);
      myReady = false;
      updateReadyUI();
      
      // ルームが空になったため削除
      firebaseClient.checkAndDeleteEmptyRoom(currentRoom);
    }

    // Ready 状態を確認
    if (opPlayerData && opPlayerData.ready !== undefined) {
      opponentReady = opPlayerData.ready;
      console.log("[MatchSetup] 相手の Ready 状態:", opponentReady);
      updateOpponentUI(opPlayerData.username, opponentReady);
    }

    // 両者が Ready か確認
    if (myPlayerData.ready && opPlayerData && opPlayerData.ready) {
      console.log("[MatchSetup] 両者が Ready になりました");
      showMsg("両者が Ready になりました。ゲーム開始します...");
      startGame();
    }
  });
}

function watchRoomList() {
  if (roomListUnsubscribe) {
    roomListUnsubscribe();
  }

  roomListUnsubscribe = firebaseClient.watchRoomList((rooms) => {
    console.log("[MatchSetup] ルーム一覧更新:", rooms.length, "個");
    renderRoomList(rooms);
  });
}

// ===== Ready 状態 =====

async function toggleReady() {
  if (!currentRoom || !currentPlayerKey) {
    showMsg("ルームに参加していません。");
    return;
  }

  myReady = !myReady;
  console.log("[MatchSetup] Ready 状態:", myReady);

  const success = await firebaseClient.setReady(currentRoom, currentPlayerKey, myReady);
  if (success) {
    updateReadyUI();
  } else {
    showMsg("Ready 状態の更新に失敗しました。");
    myReady = !myReady; // ロールバック
  }
}

// ===== UI 更新 =====

function updateUIForRoom() {
  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const startBtn = document.getElementById("startBtn");

  if (createBtn) createBtn.style.display = "none";
  if (joinBtn) joinBtn.style.display = "none";
  if (cancelBtn) cancelBtn.style.display = "block";
  if (startBtn) startBtn.disabled = false;
}

function resetRoom() {
  currentRoom = null;
  currentPlayerKey = null;
  myReady = false;
  opponentReady = false;

  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const startBtn = document.getElementById("startBtn");

  if (createBtn) createBtn.style.display = "block";
  if (joinBtn) joinBtn.style.display = "block";
  if (cancelBtn) cancelBtn.style.display = "none";
  if (startBtn) startBtn.disabled = true;

  updateReadyUI();
  updateOpponentUI("WAITING", false);

  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
}

function updateReadyUI() {
  const myReadyStatus = document.getElementById("myReadyStatus");
  if (myReadyStatus) {
    myReadyStatus.className = myReady ? "readyPill ready" : "readyPill";
    myReadyStatus.innerHTML = `
      <span>あなた: ${myReady ? "準備完了" : "未準備"}</span>
      <div class="readyIndicator"></div>
    `;
  }

  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    startBtn.textContent = myReady ? "キャンセル" : "準備完了";
  }
}

function updateOpponentUI(name, isReady) {
  const opReadyStatus = document.getElementById("opponentReadyStatus");
  if (opReadyStatus) {
    opReadyStatus.className = isReady ? "readyPill ready" : "readyPill";
    opReadyStatus.innerHTML = `
      <span>相手: ${isReady ? "準備完了" : "待機中"}</span>
      <div class="readyIndicator"></div>
    `;
  }
}

function renderRoomList(rooms) {
  const container = document.getElementById("roomList");
  if (!container) return;

  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div style="color:#666;font-size:13px;padding:10px;">公開ルームがありません。</div>';
    return;
  }

  container.innerHTML = "";
  rooms.forEach(room => {
    const item = document.createElement("div");
    item.className = "roomItem";
    item.style.cursor = "pointer";
    item.innerHTML = `
      <span class="room-name">${room.name}</span>
      <span class="room-players">${room.playerCount}/${2} 人</span>
      <button class="room-join-btn" type="button">接続</button>
    `;
    // 行全体クリック → コードを入力するだけ
    item.addEventListener("click", (e) => {
      // 接続ボタン自体のクリックは除外
      if (e.target.classList.contains("room-join-btn")) return;
      document.getElementById("roomCodeInput").value = room.name;
    });
    // 接続ボタンクリック → コードで参加と同じ挙動
    item.querySelector(".room-join-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      joinRoomByName(room.name);
    });
    container.appendChild(item);
  });
}

async function joinRoomByName(roomName) {
  document.getElementById("roomCodeInput").value = roomName;
  await joinRoom();
}

function renderDeckGallery() {
  const gallery = document.getElementById("deckGallery");
  if (!gallery) return;

  // cardData.js から デッキ情報を取得
  if (typeof cardData === "undefined" || !cardData.decks) {
    console.warn("[MatchSetup] cardData が見つかりません");
    return;
  }

  gallery.innerHTML = "";
  cardData.decks.forEach((deck, index) => {
    const card = document.createElement("div");
    card.className = "deckCard";
    card.onclick = () => selectDeck(index);
    
    const img = document.createElement("img");
    img.src = deck.image || "assets/deck-placeholder.png";
    img.alt = deck.name;
    
    const name = document.createElement("div");
    name.className = "deckCardName";
    name.textContent = deck.name;
    
    card.appendChild(img);
    card.appendChild(name);
    gallery.appendChild(card);
  });
}

function selectDeck(index) {
  const cards = document.querySelectorAll(".deckCard");
  cards.forEach((card, i) => {
    card.classList.toggle("selected", i === index);
  });
  localStorage.setItem("selectedDeckIndex", index);
}

// ===== ゲーム開始 =====

function startGame() {
  console.log("[MatchSetup] ゲーム開始");
  localStorage.setItem("gameRoom",      currentRoom);
  localStorage.setItem("gamePlayerKey", currentPlayerKey);
  localStorage.setItem("gameStarted",   "true");

  // core.js が window.myRole / window.myUsername を読むための matchSetup キーを書く
  localStorage.setItem("matchSetup", JSON.stringify({
    role:     currentPlayerKey,          // "player1" or "player2"
    self:     currentUser,               // 自分のユーザー名
    username: currentUser
  }));

  setTimeout(() => {
    location.href = "game.html";
  }, 1000);
}

// ===== ユーティリティ =====

function showMsg(text) {
  const msgEl = document.getElementById("setupMsg");
  if (msgEl) {
    msgEl.textContent = text;
  }
}

// ===== イベントリスナー =====

window.addEventListener("load", () => {
  initMatchSetup();

  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const startBtn = document.getElementById("startBtn");

  if (createBtn) createBtn.addEventListener("click", createRoom);
  if (joinBtn) joinBtn.addEventListener("click", joinRoom);
  if (cancelBtn) cancelBtn.addEventListener("click", leaveRoom);
  if (startBtn) startBtn.addEventListener("click", toggleReady);
});

// ページを離れるときにリスナーをクリーンアップ
window.addEventListener("beforeunload", async () => {
  console.log("[MatchSetup] ページを離れます");
  
  // ルームから退出
  if (currentRoom && currentPlayerKey) {
    console.log("[MatchSetup] ルームから自動退出:", currentRoom);
    await firebaseClient.leaveRoom(currentRoom, currentPlayerKey);
  }
  
  if (roomUnsubscribe) roomUnsubscribe();
  if (roomListUnsubscribe) roomListUnsubscribe();
});
