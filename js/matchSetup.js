/**
 * matchSetup.js v6.0
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

let selectedDeckId = null;
let popupSelectedDeckId = null;

// ===== 初期化 =====

async function initMatchSetup() {
  currentUser = localStorage.getItem("username") || "Player";
  document.getElementById("myPlayerDisplay").textContent = currentUser;

  // デッキ復元
  selectedDeckId = localStorage.getItem("selectedDeckId") || null;
  if (!selectedDeckId) {
    const decks = getDeckList();
    if (decks.length > 0) selectedDeckId = decks[0].id;
  }
  renderCurrentDeck();

  // チャット
  document.getElementById("chatSendBtn").addEventListener("click", sendChat);
  document.getElementById("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  // Firebase
  const success = await firebaseClient.initialize(window.FIREBASE_CONFIG);
  if (success) {
    updateFirebaseStatus("Firebase 接続済み ✓", true);
    watchRoomList();
    addLog("system", "Firebase に接続しました。");
  } else {
    updateFirebaseStatus("接続エラー", false);
    addLog("system", "Firebase への接続に失敗しました。");
  }
  firebaseClient.on("connected",    () => { updateFirebaseStatus("Firebase 接続済み ✓", true);  addLog("system", "再接続しました。"); });
  firebaseClient.on("disconnected", () => { updateFirebaseStatus("切断", false); addLog("system", "接続が切断されました。"); });
}

// ===== デッキ =====

function getDeckList() {
  try { return JSON.parse(localStorage.getItem("deckList")) || []; } catch { return []; }
}
function getDeckById(id) {
  return getDeckList().find(d => d.id === id) || null;
}
function getDeckCardCount(deck) {
  if (!deck) return 0;
  try { return decodeDeck(deck.code || "empty").length; } catch { return 0; }
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
  countEl.textContent = `${getDeckCardCount(deck)} 枚`;
}

function selectedDeck() {
  return getDeckById(selectedDeckId) || getDeckList()[0] || null;
}

// ===== 現在のデッキ内容確認（左パネルのデッキをクリック） =====

async function openCurrentDeckView() {
  if (!selectedDeckId) return;
  openDeckSelectPopup();
  // ポップアップを開いた後、選択中デッキのプレビューを表示
  await new Promise(r => setTimeout(r, 50));
  await renderDeckPreview(selectedDeckId);
}

// ===== デッキ選択ポップアップ =====

function openDeckSelectPopup() {
  popupSelectedDeckId = selectedDeckId;
  renderDeckSelectList();
  document.getElementById("deckSelectPopup").classList.remove("hidden");
  // 選択中デッキのプレビューを即表示
  if (popupSelectedDeckId) renderDeckPreview(popupSelectedDeckId);
}

function closeDeckSelectPopup() {
  document.getElementById("deckSelectPopup").classList.add("hidden");
}

function renderDeckSelectList() {
  const container = document.getElementById("deckSelectList");
  container.innerHTML = "";
  const decks = getDeckList();

  if (decks.length === 0) {
    container.innerHTML = '<div style="color:#555;padding:16px;font-size:12px;">デッキがありません。<br>デッキ構築画面で作成してください。</div>';
    return;
  }

  decks.forEach(deck => {
    const item = document.createElement("div");
    item.className = "deckSelectItem" + (deck.id === popupSelectedDeckId ? " selected" : "");
    item.dataset.id = deck.id;

    const img = document.createElement("img");
    img.src = (deck.backImage && deck.backImage.length > 5) ? deck.backImage : "assets/favicon.png";
    img.onerror = () => { img.src = "assets/favicon.png"; };

    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.minWidth = "0";

    const name = document.createElement("div");
    name.className = "dsi-name";
    name.textContent = deck.name || "名称未設定";

    const count = document.createElement("div");
    count.className = "dsi-count";
    count.textContent = `${getDeckCardCount(deck)} 枚`;

    info.appendChild(name);
    info.appendChild(count);
    item.appendChild(img);
    item.appendChild(info);

    item.addEventListener("click", () => {
      popupSelectedDeckId = deck.id;
      container.querySelectorAll(".deckSelectItem").forEach(c => c.classList.remove("selected"));
      item.classList.add("selected");
      renderDeckPreview(deck.id);
    });

    container.appendChild(item);
  });
}

async function renderDeckPreview(deckId) {
  const deck = getDeckById(deckId);
  const titleEl = document.getElementById("deckPreviewTitle");
  const cardsEl = document.getElementById("deckPreviewCards");

  if (!deck) {
    titleEl.textContent = "デッキを選択してください";
    cardsEl.innerHTML = '<div id="deckPreviewEmpty">← デッキをクリックして内容を確認</div>';
    return;
  }

  titleEl.textContent = deck.name || "名称未設定";

  // カードデータ読み込み
  if (typeof CARD_DB === "undefined" || CARD_DB.length === 0) {
    if (typeof loadCardData === "function") await loadCardData();
  }

  let cards = [];
  try { cards = decodeDeck(deck.code || "empty"); } catch { cards = []; }

  // 同じカードをまとめる
  const counts = {};
  cards.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

  cardsEl.innerHTML = "";

  if (Object.keys(counts).length === 0) {
    cardsEl.innerHTML = '<div style="color:#444;font-size:12px;padding:16px;">カードがありません。</div>';
    return;
  }

  Object.entries(counts).forEach(([id, count]) => {
    const cardInfo = (typeof getCardData === "function") ? getCardData(id) : null;
    const div = document.createElement("div");
    div.className = "pvCard";

    const img = document.createElement("img");
    img.src = cardInfo ? cardInfo.image : "assets/cards/cd0000.png";
    img.onerror = () => { img.src = "assets/cards/cd0000.png"; };

    div.appendChild(img);
    if (count > 1) {
      const badge = document.createElement("div");
      badge.className = "pv-count";
      badge.textContent = `×${count}`;
      div.appendChild(badge);
    }
    cardsEl.appendChild(div);
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

  // チャット監視も開始
  watchChat(roomName);

  roomUnsubscribe = firebaseClient.watchRoom(roomName, (roomData) => {
    if (!roomData) { addLog("system", "ルームが削除されました。"); resetRoom(); return; }

    const players = roomData.players || {};
    const myData  = players[currentPlayerKey];
    if (!myData) { addLog("system", "ルームから削除されました。"); resetRoom(); return; }

    const opRole = currentPlayerKey === "player1" ? "player2" : "player1";
    const opData = players[opRole];

    if (opData && !opData.hasJoined) {
      opponentName = opData.username;
      addLog("system", `「${opponentName}」が入室しました。`);
      updateOpponentUI(opponentName, false, true, null);
      firebaseClient.db.ref(`rooms/${roomName}/players/${opRole}/hasJoined`).set(true);
    }
    if (!opData) {
      addLog("system", "対戦相手が退出しました。");
      opponentName = null;
      updateOpponentUI(null, false, false, null);
      myReady = false;
      updateReadyUI();
    }
    if (opData) {
      opponentReady = !!opData.ready;
      updateOpponentUI(opData.username, opponentReady, true, null);
    }
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
  if (!currentRoom || !currentPlayerKey) { addLog("system", "先にルームに参加してください。"); return; }
  if (!selectedDeck()) { addLog("system", "デッキを選択してください。"); return; }
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
  document.getElementById("roomNameInput").value = currentRoom || "";
  updateReadyUI();
}

function resetRoom() {
  currentRoom = null; currentPlayerKey = null;
  myReady = false; opponentReady = false; opponentName = null;
  document.getElementById("createRoomBtn").disabled = false;
  document.getElementById("joinRoomBtn").disabled   = false;
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").classList.remove("isReady");
  updateOpponentUI(null, false, false, null);
  updateReadyUI();
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
}

function updateReadyUI() {
  const btn = document.getElementById("startBtn");
  const isInRoom = !!(currentRoom && currentPlayerKey);
  if (!isInRoom) {
    btn.innerHTML = `READY<span class="btn-sub" id="startBtnSub">ルームに参加してください</span>`;
    btn.classList.remove("isReady");
    return;
  }
  if (myReady) {
    btn.innerHTML = `READY ✓<span class="btn-sub" id="startBtnSub">準備完了 — クリックでキャンセル</span>`;
    btn.classList.add("isReady");
  } else {
    const sub = opponentName ? "クリックで準備完了" : "相手を待っています...";
    btn.innerHTML = `READY<span class="btn-sub" id="startBtnSub">${sub}</span>`;
    btn.classList.remove("isReady");
  }
}

function updateOpponentUI(name, isReady, isOnline, deckName) {
  const dot    = document.getElementById("opponentDot");
  const nameEl = document.getElementById("opponentNameEl");
  const status = document.getElementById("opponentStatusEl");
  const dkName = document.getElementById("opponentDeckName");
  const dkThumb = document.getElementById("opponentDeckThumb");

  if (!isOnline || !name) {
    dot.className = "";
    nameEl.textContent = "待機中..."; nameEl.className = "";
    status.textContent = "未接続"; status.className = "";
    dkName.textContent = "デッキ未選択"; dkName.className = "";
    dkThumb.style.opacity = "0.3";
    return;
  }
  nameEl.textContent = name; nameEl.className = "active";
  dkThumb.style.opacity = "0.6";
  if (isReady) {
    dot.className = "ready";
    status.textContent = "準備完了"; status.className = "ready";
  } else {
    dot.className = "online";
    status.textContent = "接続中"; status.className = "";
  }
  if (deckName) { dkName.textContent = deckName; dkName.className = "active"; }
}

function renderRoomList(rooms) {
  const container = document.getElementById("roomList");
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div style="color:#444;font-size:11px;padding:6px;">公開ルームがありません。</div>';
    return;
  }
  container.innerHTML = "";
  rooms.forEach(room => {
    const item = document.createElement("div");
    item.className = "roomItem";
    item.innerHTML = `
      <span class="room-name">${room.name}</span>
      <span class="room-players">${room.playerCount}/2</span>
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
  if (currentRoom && firebaseClient.db) {
    firebaseClient.db.ref(`rooms/${currentRoom}/chat`).push({
      user: currentUser, text,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }
  addLog("mine", `${currentUser}: ${text}`);
}

let _chatListenerRef = null;
function watchChat(roomName) {
  if (_chatListenerRef) { _chatListenerRef.off(); _chatListenerRef = null; }
  if (!firebaseClient.db) return;
  _chatListenerRef = firebaseClient.db.ref(`rooms/${roomName}/chat`);
  _chatListenerRef.limitToLast(50).on("child_added", snap => {
    const d = snap.val();
    if (!d || d.user === currentUser) return;
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
    role: currentPlayerKey, self: currentUser, username: currentUser,
    deckCode: deck?.code || "empty", deckId: deck?.id || ""
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
  if (_chatListenerRef)    _chatListenerRef.off();
});
