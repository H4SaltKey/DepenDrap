/**
 * matchSetup.js v5.0 — 横向きレイアウト版
 */

// ===== 状態 =====
let currentUser = "";
let currentRoom = null;
let currentPlayerKey = null;
let myReady = false;
let opponentReady = false;
let opponentName = null;
let roomUnsubscribe = null;
let roomListUnsubscribe = null;
let isStartingGame = false;

// デッキ選択
let selectedDeckId = null;       // 現在使用中のデッキID
let popupSelectedDeckId = null;  // ポップアップ内で選択中のデッキID

// ===== 初期化 =====

async function initMatchSetup() {
  currentUser = localStorage.getItem("username") || "Player";
  document.getElementById("myPlayerDisplay").textContent = currentUser;

  // 前回選択したデッキを復元
  selectedDeckId = localStorage.getItem("selectedDeckId") || null;
  if (!selectedDeckId) {
    const decks = getDeckList();
    if (decks.length > 0) selectedDeckId = decks[0].id;
  }
  renderCurrentDeck();

  // チャット送信
  document.getElementById("chatSendBtn").addEventListener("click", sendChat);
  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat();
  });

  // Firebase 初期化
  console.log("[MatchSetup] Firebase 初期化中...");
  const success = await firebaseClient.initialize(window.FIREBASE_CONFIG);

  if (success) {
    updateFirebaseStatus("Firebase 接続済み ✓", true);
    watchRoomList();
    addLog("system", "Firebase に接続しました。");
  } else {
    updateFirebaseStatus("Firebase 接続エラー", false);
    addLog("system", "Firebase への接続に失敗しました。");
  }

  firebaseClient.on("connected",    () => { updateFirebaseStatus("Firebase 接続済み ✓", true);  addLog("system", "再接続しました。"); });
  firebaseClient.on("disconnected", () => { updateFirebaseStatus("Firebase 切断", false); addLog("system", "接続が切断されました。"); });
}

// ===== デッキ関連 =====

function getDeckList() {
  try { return JSON.parse(localStorage.getItem("deckList")) || []; } catch { return []; }
}

function getDeckById(id) {
  return getDeckList().find(d => d.id === id) || null;
}

function renderCurrentDeck() {
  const deck = getDeckById(selectedDeckId);
  const thumb = document.getElementById("msDeckThumb");
  const nameEl = document.getElementById("msDeckName");
  const countEl = document.getElementById("msDeckCount");

  if (!deck) {
    thumb.src = "assets/favicon.png";
    nameEl.textContent = "デッキ未選択";
    countEl.textContent = "-- 枚";
    return;
  }

  thumb.src = (deck.backImage && deck.backImage.length > 5) ? deck.backImage : "assets/favicon.png";
  thumb.onerror = () => { thumb.src = "assets/favicon.png"; };
  nameEl.textContent = deck.name || "名称未設定";

  // デッキ枚数を計算
  try {
    const cards = decodeDeck(deck.code || "empty");
    countEl.textContent = `${cards.length} 枚`;
  } catch {
    countEl.textContent = "-- 枚";
  }
}

// ===== デッキ内容ポップアップ =====

async function openDeckView(deckId) {
  if (!deckId) return;
  const deck = getDeckById(deckId);
  if (!deck) return;

  // カードデータが未ロードなら読み込む
  if (typeof CARD_DB === "undefined" || CARD_DB.length === 0) {
    if (typeof loadCardData === "function") await loadCardData();
  }

  document.getElementById("deckViewTitle").textContent = deck.name || "デッキ内容";

  let cards = [];
  try { cards = decodeDeck(deck.code || "empty"); } catch { cards = []; }

  // 同じカードをまとめる
  const counts = {};
  cards.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

  const container = document.getElementById("deckViewCards");
  container.innerHTML = "";

  if (Object.keys(counts).length === 0) {
    container.innerHTML = '<div style="color:#666;padding:20px;">カードがありません。</div>';
  } else {
    Object.entries(counts).forEach(([id, count]) => {
      const cardInfo = (typeof getCardData === "function") ? getCardData(id) : null;
      const div = document.createElement("div");
      div.className = "deckViewCard";

      const img = document.createElement("img");
      img.src = cardInfo ? cardInfo.image : "assets/cards/cd0000.png";
      img.onerror = () => { img.src = "assets/cards/cd0000.png"; };
      img.alt = id;

      const badge = document.createElement("div");
      badge.className = "card-count";
      badge.textContent = count > 1 ? `×${count}` : "";

      div.appendChild(img);
      if (count > 1) div.appendChild(badge);
      container.appendChild(div);
    });
  }

  document.getElementById("deckViewPopup").classList.remove("hidden");
}

function closeDeckView() {
  document.getElementById("deckViewPopup").classList.add("hidden");
}

// ===== デッキ選択ポップアップ =====

function openDeckSelectPopup() {
  popupSelectedDeckId = selectedDeckId;
  renderDeckSelectList();
  document.getElementById("deckSelectPopup").classList.remove("hidden");
}

function closeDeckSelectPopup() {
  document.getElementById("deckSelectPopup").classList.add("hidden");
}

function renderDeckSelectList() {
  const container = document.getElementById("deckSelectList");
  container.innerHTML = "";
  const decks = getDeckList();

  if (decks.length === 0) {
    container.innerHTML = '<div style="color:#666;padding:20px;">デッキがありません。デッキ構築画面で作成してください。</div>';
    return;
  }

  decks.forEach(deck => {
    const div = document.createElement("div");
    div.className = "deckSelectCard" + (deck.id === popupSelectedDeckId ? " selected" : "");
    div.dataset.id = deck.id;

    const img = document.createElement("img");
    img.src = (deck.backImage && deck.backImage.length > 5) ? deck.backImage : "assets/favicon.png";
    img.onerror = () => { img.src = "assets/favicon.png"; };

    const name = document.createElement("div");
    name.className = "ds-name";
    name.textContent = deck.name || "名称未設定";

    const viewBtn = document.createElement("button");
    viewBtn.className = "ds-view-btn";
    viewBtn.textContent = "確認";
    viewBtn.addEventListener("click", e => {
      e.stopPropagation();
      openDeckView(deck.id);
    });

    div.appendChild(img);
    div.appendChild(name);
    div.appendChild(viewBtn);

    div.addEventListener("click", () => {
      popupSelectedDeckId = deck.id;
      container.querySelectorAll(".deckSelectCard").forEach(c => c.classList.remove("selected"));
      div.classList.add("selected");
    });

    container.appendChild(div);
  });
}

function confirmDeckSelect() {
  if (!popupSelectedDeckId) return;
  selectedDeckId = popupSelectedDeckId;
  localStorage.setItem("selectedDeckId", selectedDeckId);
  renderCurrentDeck();
  closeDeckSelectPopup();
  addLog("system", `デッキ「${getDeckById(selectedDeckId)?.name || selectedDeckId}」を選択しました。`);
}

function selectedDeck() {
  return getDeckById(selectedDeckId) || getDeckList()[0] || null;
}

// ===== ルーム操作 =====

async function createRoom() {
  const roomName = document.getElementById("roomNameInput").value.trim().toUpperCase() || undefined;
  const result = await firebaseClient.createRoom(roomName);
  if (!result) { addLog("system", "ルーム作成に失敗しました。"); return; }

  currentRoom = result;
  currentPlayerKey = "player1";
  addLog("system", `ルーム「${result}」を作成しました。`);
  watchRoom(result);
  updateUIForRoom();
}

async function joinRoom() {
  const roomName = document.getElementById("roomNameInput").value.trim().toUpperCase();
  if (!roomName) { addLog("system", "ルーム名を入力してください。"); return; }

  const result = await firebaseClient.joinRoom(roomName);
  if (!result) { addLog("system", `ルーム「${roomName}」が見つかりません。`); return; }

  currentRoom = result.roomName;
  currentPlayerKey = result.playerKey;
  addLog("system", `ルーム「${result.roomName}」に参加しました。`);
  watchRoom(result.roomName);
  updateUIForRoom();
}

async function leaveRoom() {
  if (!currentRoom || !currentPlayerKey) return;
  await firebaseClient.leaveRoom(currentRoom, currentPlayerKey);
  addLog("system", "ルームから退出しました。");
  resetRoom();
}

// ===== ルーム監視 =====

function watchRoom(roomName) {
  if (roomUnsubscribe) roomUnsubscribe();

  roomUnsubscribe = firebaseClient.watchRoom(roomName, (roomData) => {
    if (!roomData) {
      addLog("system", "ルームが削除されました。");
      resetRoom();
      return;
    }

    const players = roomData.players || {};
    const myData  = players[currentPlayerKey];
    if (!myData) { addLog("system", "ルームから削除されました。"); resetRoom(); return; }

    const opRole = currentPlayerKey === "player1" ? "player2" : "player1";
    const opData = players[opRole];

    // 相手の入室
    if (opData && !opData.hasJoined) {
      opponentName = opData.username;
      addLog("system", `「${opponentName}」が入室しました。`);
      updateOpponentUI(opponentName, false, true);
      firebaseClient.db.ref(`rooms/${roomName}/players/${opRole}/hasJoined`).set(true);
    }

    // 相手の退出
    if (!opData) {
      addLog("system", "対戦相手が退出しました。");
      opponentName = null;
      updateOpponentUI(null, false, false);
      myReady = false;
      updateReadyUI();
    }

    // 相手の Ready 状態
    if (opData) {
      opponentReady = !!opData.ready;
      updateOpponentUI(opData.username, opponentReady, true);
    }

    // 両者 Ready → ゲーム開始
    if (myData.ready && opData && opData.ready && !isStartingGame) {
      addLog("system", "両者が準備完了！ゲームを開始します...");
      startGame();
    }
  });
}

function watchRoomList() {
  if (roomListUnsubscribe) roomListUnsubscribe();
  roomListUnsubscribe = firebaseClient.watchRoomList(renderRoomList);
}

// ===== Ready =====

async function toggleReady() {
  if (!currentRoom || !currentPlayerKey) {
    addLog("system", "先にルームに参加してください。");
    return;
  }
  if (!selectedDeck()) {
    addLog("system", "デッキを選択してください。");
    return;
  }

  myReady = !myReady;
  const ok = await firebaseClient.setReady(currentRoom, currentPlayerKey, myReady);
  if (!ok) { myReady = !myReady; return; }

  updateReadyUI();
  addLog("system", myReady ? "準備完了にしました。" : "準備をキャンセルしました。");
}

// ===== UI 更新 =====

function updateUIForRoom() {
  document.getElementById("createRoomBtn").disabled = true;
  document.getElementById("joinRoomBtn").disabled   = true;
  document.getElementById("cancelBtn").style.display = "block";
  document.getElementById("startBtn").disabled = false;
  document.getElementById("startBtnSub").textContent = "クリックで準備完了";
  document.getElementById("roomNameInput").value = currentRoom || "";
}

function resetRoom() {
  currentRoom = null;
  currentPlayerKey = null;
  myReady = false;
  opponentReady = false;
  opponentName = null;

  document.getElementById("createRoomBtn").disabled = false;
  document.getElementById("joinRoomBtn").disabled   = false;
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").classList.remove("isReady");
  document.getElementById("startBtnSub").textContent = "ルームに参加してください";

  updateOpponentUI(null, false, false);
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
}

function updateReadyUI() {
  const btn = document.getElementById("startBtn");
  const sub = document.getElementById("startBtnSub");
  if (myReady) {
    btn.textContent = "READY";
    btn.classList.add("isReady");
    sub.textContent = "準備完了 — クリックでキャンセル";
  } else {
    btn.textContent = "READY";
    btn.classList.remove("isReady");
    sub.textContent = opponentName ? "クリックで準備完了" : "相手を待っています...";
  }
  // btn-sub を再追加（textContent で消えるため）
  btn.innerHTML = `${myReady ? "READY ✓" : "READY"}<span class="btn-sub" id="startBtnSub">${sub.textContent}</span>`;
}

function updateOpponentUI(name, isReady, isOnline) {
  const dot    = document.getElementById("opponentDot");
  const nameEl = document.getElementById("opponentName");
  const status = document.getElementById("opponentStatus");

  if (!isOnline || !name) {
    dot.className = "";
    nameEl.textContent = "待機中...";
    nameEl.className = "";
    status.textContent = "未接続";
    status.className = "";
    return;
  }

  nameEl.textContent = name;
  nameEl.className = "active";

  if (isReady) {
    dot.className = "ready";
    status.textContent = "準備完了";
    status.className = "ready";
  } else {
    dot.className = "online";
    status.textContent = "接続中";
    status.className = "";
  }
}

function renderRoomList(rooms) {
  const container = document.getElementById("roomList");
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div style="color:#555;font-size:12px;padding:8px;">公開ルームがありません。</div>';
    return;
  }
  container.innerHTML = "";
  rooms.forEach(room => {
    const item = document.createElement("div");
    item.className = "roomItem";
    item.innerHTML = `
      <span class="room-name">${room.name}</span>
      <span class="room-players">${room.playerCount}/2 人</span>
      <button class="room-join-btn" type="button">参加</button>
    `;
    item.addEventListener("click", e => {
      if (e.target.classList.contains("room-join-btn")) return;
      document.getElementById("roomNameInput").value = room.name;
    });
    item.querySelector(".room-join-btn").addEventListener("click", e => {
      e.stopPropagation();
      document.getElementById("roomNameInput").value = room.name;
      joinRoom();
    });
    container.appendChild(item);
  });
}

function updateFirebaseStatus(label, ok) {
  const el = document.getElementById("firebaseStatus");
  if (!el) return;
  el.textContent = label;
  el.className = ok ? "ok" : "";
}

// ===== チャット =====

function addLog(type, text) {
  const log = document.getElementById("chatLog");
  if (!log) return;
  const line = document.createElement("div");
  line.className = `chatLine ${type}`;
  const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  line.textContent = `[${time}] ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // Firebase チャット送信（ルーム内のみ）
  if (currentRoom && firebaseClient.db) {
    const chatRef = firebaseClient.db.ref(`rooms/${currentRoom}/chat`);
    chatRef.push({
      user: currentUser,
      text: text,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }
  addLog("mine", `${currentUser}: ${text}`);
}

// チャット受信（ルーム監視内で呼ぶ）
function watchChat(roomName) {
  if (!firebaseClient.db) return;
  const chatRef = firebaseClient.db.ref(`rooms/${roomName}/chat`);
  chatRef.limitToLast(50).on("child_added", snap => {
    const d = snap.val();
    if (!d) return;
    if (d.user === currentUser) return; // 自分の発言は addLog("mine") 済み
    addLog("other", `${d.user}: ${d.text}`);
  });
}

// ===== ゲーム開始 =====

function startGame() {
  isStartingGame = true;
  const deck = selectedDeck();

  localStorage.setItem("gameRoom",      currentRoom);
  localStorage.setItem("gamePlayerKey", currentPlayerKey);
  localStorage.setItem("gameStarted",   "true");
  if (deck) localStorage.setItem("deckCode", deck.code || "empty");

  localStorage.setItem("matchSetup", JSON.stringify({
    role:     currentPlayerKey,
    self:     currentUser,
    username: currentUser,
    deckCode: deck?.code || "empty",
    deckId:   deck?.id   || ""
  }));

  setTimeout(() => { location.href = "game.html"; }, 1000);
}

// ===== イベントリスナー =====

window.addEventListener("load", () => {
  initMatchSetup();
  document.getElementById("createRoomBtn").addEventListener("click", createRoom);
  document.getElementById("joinRoomBtn").addEventListener("click",   joinRoom);
  document.getElementById("startBtn").addEventListener("click",      toggleReady);
});

window.addEventListener("beforeunload", async () => {
  if (!isStartingGame && currentRoom && currentPlayerKey) {
    await firebaseClient.leaveRoom(currentRoom, currentPlayerKey);
  }
  if (roomUnsubscribe)     roomUnsubscribe();
  if (roomListUnsubscribe) roomListUnsubscribe();
});
