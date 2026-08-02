(function () {
  const state = {
    open: false,
    friends: [],
    friendStatus: {},
    selectedFriend: null,
    chatUnsub: null,
    chatPollTimer: null,
    lastChatFingerprint: "",
    friendListUnsub: null,
    friendReqUnsub: null,
    friendStatusUnsub: null,
    roomInviteUnsub: null,
    myName: localStorage.getItem("username") || "Player",
    searchTimer: null,
    dmDebug: {
      selectedFriend: "",
      watchCount: 0,
      pollCount: 0,
      lastRows: 0,
      renderCount: 0,
      sendTry: 0,
      sendOk: 0,
      sendNg: 0,
      lastError: "",
      lastUpdate: ""
    },
    dmSeenIds: new Set(),
    dmEventRows: []
  };

  function el(id) { return document.getElementById(id); }

  function initFriendUI() {
    const toggle = el("friendToggleBtn");
    const addBtn = el("friendAddBtn");
    const closeAdd = el("friendAddCancelBtn");
    const sendReqBtn = el("friendRequestSendBtn");
    const dmSendBtn = el("friendDmSendBtn");
    const dmInput = el("friendDmInput");
    const dmCloseBtn = el("friendDmCloseBtn");
    const dmColorBtn = el("friendDmColorBtn");
    const dmColorPalette = el("friendDmColorPalette");

    if (toggle) {
      toggle.addEventListener("click", () => {
        state.open = !state.open;
        el("friendPanel").classList.toggle("hidden", !state.open);
        toggle.textContent = state.open ? "フレンド ▲" : "フレンド ▼";
      });
    }
    if (addBtn) addBtn.addEventListener("click", openFriendAddModal);
    if (closeAdd) closeAdd.addEventListener("click", closeFriendAddModal);
    if (sendReqBtn) sendReqBtn.addEventListener("click", sendFriendRequestFromModal);

    if (dmSendBtn) dmSendBtn.addEventListener("click", sendDirectMessage);
    if (dmCloseBtn) dmCloseBtn.addEventListener("click", closeDirectMessagePanel);

    const savedColor = localStorage.getItem("chatColor") || "#ffffff";
    if (dmInput) dmInput.style.color = savedColor;

    if (dmColorBtn && dmColorPalette) {
      dmColorBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dmColorPalette.style.display = dmColorPalette.style.display === "grid" ? "none" : "grid";
      });

      dmColorPalette.querySelectorAll(".friend-dm-color-opt").forEach((opt) => {
        opt.addEventListener("click", (e) => {
          const color = e.currentTarget?.dataset?.color || "#ffffff";
          localStorage.setItem("chatColor", color);
          if (dmInput) dmInput.style.color = color;
          dmColorPalette.style.display = "none";
        });
      });

      document.addEventListener("click", () => {
        dmColorPalette.style.display = "none";
      });
      dmColorPalette.addEventListener("click", (e) => e.stopPropagation());
    }
    if (dmInput) {
      dmInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendDirectMessage();
      });
    }

    const searchInput = el("friendSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        if (state.searchTimer) clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => {
          searchFriendByName();
        }, 140);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const target = el("friendRequestSendBtn")?.dataset?.target || "";
        if (target) {
          sendFriendRequestFromModal();
        } else {
          searchFriendByName();
        }
      });
    }

    const modal = el("friendAddModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeFriendAddModal();
      });
    }

    renderFriends();
    renderIncomingRequests([]);
    renderDirectChat([]);
    renderInviteModal(null);
  }

  function openFriendAddModal() {
    const modal = el("friendAddModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    el("friendSearchInput").value = "";
    el("friendSearchResult").innerHTML = "<div class='friend-modal-empty'>フレンド名を入力すると候補が表示されます。</div>";
    el("friendRequestSendBtn").disabled = true;
    el("friendRequestSendBtn").dataset.target = "";
  }

  function closeFriendAddModal() {
    const modal = el("friendAddModal");
    if (!modal) return;
    modal.classList.add("hidden");
  }

  async function searchFriendByName() {
    const name = (el("friendSearchInput").value || "").trim();
    const resultEl = el("friendSearchResult");
    const sendBtn = el("friendRequestSendBtn");
    sendBtn.disabled = true;
    sendBtn.dataset.target = "";

    if (!name) {
      resultEl.innerHTML = "<div class='friend-modal-empty'>フレンド名を入力すると候補が表示されます。</div>";
      return;
    }
    if (!window.firebaseClient?.db) {
      resultEl.innerHTML = "<div class='friend-modal-empty'>Firebase未接続です。</div>";
      return;
    }

    const foundList = await firebaseClient.searchAccountsByPartialName(name, 10);
    const rows = foundList.filter((row) => row.username !== state.myName);
    if (!rows.length) {
      resultEl.innerHTML = "<div class='friend-modal-empty'>一致するプレイヤーが見つかりません。</div>";
      return;
    }
    resultEl.innerHTML = "";
    rows.forEach((found) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "friend-search-player";
      row.textContent = found.username;
      row.addEventListener("click", () => {
        resultEl.querySelectorAll(".friend-search-player").forEach((n) => n.classList.remove("selected"));
        row.classList.add("selected");
        sendBtn.disabled = false;
        sendBtn.dataset.target = found.username;
      });
      resultEl.appendChild(row);
    });
  }

  async function sendFriendRequestFromModal() {
    const target = el("friendRequestSendBtn").dataset.target || "";
    if (!target) return;
    try {
      await firebaseClient.sendFriendRequest(target);
      if (window.showSuccessMessage) showSuccessMessage(`「${target}」へフレンド申請を送信しました。`);
      closeFriendAddModal();
    } catch (e) {
      console.error("friend request failed", e);
      if (window.showErrorMessage) showErrorMessage("フレンド申請の送信に失敗しました。");
    }
  }

  function bindFirebaseSocialWatchers() {
    if (!window.firebaseClient?.db) return;

    if (state.friendListUnsub) state.friendListUnsub();
    state.friendListUnsub = firebaseClient.watchFriendList((list) => {
      state.friends = list.map((f) => ({ username: f.username }));
      renderFriends();
      watchFriendStatusEntries();
      if (state.selectedFriend && !state.friends.find((f) => f.username === state.selectedFriend)) {
        selectFriend(null);
      }
    });

    if (state.friendReqUnsub) state.friendReqUnsub();
    state.friendReqUnsub = firebaseClient.watchIncomingFriendRequests((list) => {
      renderIncomingRequests(list);
    });

    if (state.roomInviteUnsub) state.roomInviteUnsub();
    state.roomInviteUnsub = firebaseClient.watchRoomInvites((list) => {
      const newestPending = (list || []).filter((inv) => inv.status === "pending").sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] || null;
      renderInviteModal(newestPending);
    });
  }

  function watchFriendStatusEntries() {
    if (state.friendStatusUnsub) state.friendStatusUnsub();
    const names = state.friends.map((f) => f.username);
    state.friendStatusUnsub = firebaseClient.watchFriendStatuses(names, (map) => {
      state.friendStatus = map || {};
      renderFriends();
    });
  }

  function renderFriends() {
    const listEl = el("friendList");
    if (!listEl) return;
    if (!state.friends.length) {
      listEl.innerHTML = "<div class='friend-empty'>フレンドがいません。</div>";
      return;
    }

    listEl.innerHTML = "";
    state.friends.forEach((friend) => {
      const name = friend.username;
      const status = state.friendStatus[name] || {};
      const isOnline = !!status.isOnline;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "friend-row" + (state.selectedFriend === name ? " selected" : "");
      row.innerHTML = `
        <img class="friend-icon" src="assets/System/favicon.png" alt="${name}">
        <span class="friend-name">${name}</span>
        <span class="friend-status ${isOnline ? "online" : "offline"}">${isOnline ? "オンライン" : "オフライン"}</span>
      `;
      row.addEventListener("click", () => selectFriend(name));
      listEl.appendChild(row);
    });
  }

  function selectFriend(name) {
    state.selectedFriend = name;
    renderFriends();
    const panel = el("friendDmSection");
    const title = el("friendDmTargetName");

    if (!name) {
      panel.classList.add("hidden");
      if (state.chatUnsub) state.chatUnsub();
      state.chatUnsub = null;
      stopDirectChatPolling();
      state.dmSeenIds = new Set();
      state.dmEventRows = [];
      renderDmEventLog();
      renderDirectChat([]);
      return;
    }

    panel.classList.remove("hidden");
    title.textContent = name;
    state.dmDebug.selectedFriend = name;
    state.dmDebug.watchCount = 0;
    state.dmDebug.pollCount = 0;
    state.dmDebug.lastRows = 0;
    state.dmDebug.renderCount = 0;
    state.dmDebug.lastError = "";
    state.dmDebug.lastUpdate = new Date().toLocaleTimeString("ja-JP");
    state.dmSeenIds = new Set();
    state.dmEventRows = [];
    appendDmEventLog(`相手「${name}」とのDMを開きました。`);
    renderDmDebug();

    if (state.chatUnsub) state.chatUnsub();
    state.chatUnsub = firebaseClient.watchDirectChat(name, (rows) => {
      state.dmDebug.watchCount += 1;
      state.dmDebug.lastRows = Array.isArray(rows) ? rows.length : 0;
      state.dmDebug.lastUpdate = new Date().toLocaleTimeString("ja-JP");
      renderDirectChat(rows);
      renderDmDebug();
    });
    startDirectChatPolling(name);
    const input = el("friendDmInput");
    if (input) setTimeout(() => input.focus(), 0);
  }

  function startDirectChatPolling(targetName) {
    stopDirectChatPolling();
    const run = async () => {
      if (!state.selectedFriend || state.selectedFriend !== targetName) return;
      try {
        const rows = await firebaseClient.fetchDirectChat(targetName, 100);
        state.dmDebug.pollCount += 1;
        const fingerprint = rows.map((r) => r.id).join("|");
        if (fingerprint !== state.lastChatFingerprint) {
          state.dmDebug.lastRows = rows.length;
          state.dmDebug.lastUpdate = new Date().toLocaleTimeString("ja-JP");
          renderDirectChat(rows);
          renderDmDebug();
        }
      } catch (e) {
        console.warn("direct chat polling failed", e);
        state.dmDebug.lastError = String(e?.message || e);
        renderDmDebug();
      }
    };
    run();
    state.chatPollTimer = setInterval(run, 1500);
  }

  function stopDirectChatPolling() {
    if (state.chatPollTimer) {
      clearInterval(state.chatPollTimer);
      state.chatPollTimer = null;
    }
  }

  function renderDirectChat(rows) {
    const log = el("friendDmLog");
    if (!log) return;
    log.innerHTML = "";
    const list = Array.isArray(rows) ? rows : [];
    state.dmDebug.renderCount += 1;
    state.lastChatFingerprint = list.map((r) => r.id).join("|");
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "friend-dm-empty";
      empty.textContent = "メッセージはまだありません。";
      log.appendChild(empty);
      return;
    }
    list.forEach((row) => {
      const rowId = String(row.id || "");
      const firstSeen = rowId && !state.dmSeenIds.has(rowId);
      if (rowId) state.dmSeenIds.add(rowId);

      const line = document.createElement("div");
      line.className = `friend-dm-line ${row.from === state.myName ? "mine" : "other"}`;
      const color = typeof row.color === "string" ? row.color.trim().toLowerCase() : "";
      const isUnsafeDark = color === "#000" || color === "#000000" || color === "black";
      if (color && !isUnsafeDark) line.style.color = color;
      const ts = typeof row.ts === "number" ? row.ts : null;
      const time = ts ? new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--";
      line.textContent = `[${time}] ${row.from}: ${row.text || ""}`;
      log.appendChild(line);

      if (firstSeen && row.from !== state.myName) {
        appendDmEventLog(`受信: ${row.from}: ${row.text || ""}`);
      }
    });
    log.scrollTop = log.scrollHeight;
  }

  async function sendDirectMessage() {
    if (!state.selectedFriend) return;
    const input = el("friendDmInput");
    const text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    const color = localStorage.getItem("chatColor") || "#ffffff";
    state.dmDebug.sendTry += 1;
    renderDmDebug();
    try {
      const ok = await firebaseClient.sendDirectChat(state.selectedFriend, text, color);
      if (!ok && window.showErrorMessage) {
        showErrorMessage("メッセージ送信に失敗しました。");
        state.dmDebug.sendNg += 1;
        state.dmDebug.lastError = "sendDirectChat returned false";
        renderDmDebug();
        return;
      }
      state.dmDebug.sendOk += 1;
      appendDmEventLog(`送信: ${state.myName}: ${text}`);
      const rows = await firebaseClient.fetchDirectChat(state.selectedFriend, 100);
      state.dmDebug.lastRows = rows.length;
      state.dmDebug.lastUpdate = new Date().toLocaleTimeString("ja-JP");
      renderDirectChat(rows);
      renderDmDebug();
    } catch (e) {
      console.error("direct chat send failed", e);
      if (window.showErrorMessage) showErrorMessage("メッセージ送信に失敗しました。");
      state.dmDebug.sendNg += 1;
      state.dmDebug.lastError = String(e?.message || e);
      appendDmEventLog(`送信失敗: ${String(e?.message || e)}`);
      renderDmDebug();
    }
  }

  function renderDmDebug() {
    const box = el("friendDmDebug");
    if (!box) return;
    const d = state.dmDebug;
    box.textContent = [
      `[DM DEBUG] target=${d.selectedFriend || "-"}`,
      `watch=${d.watchCount} poll=${d.pollCount} render=${d.renderCount}`,
      `rows=${d.lastRows} sendTry=${d.sendTry} ok=${d.sendOk} ng=${d.sendNg}`,
      `lastUpdate=${d.lastUpdate || "-"}`,
      `lastError=${d.lastError || "-"}`
    ].join("\n");
  }

  function appendDmEventLog(text) {
    const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    state.dmEventRows.push(`[${time}] ${text}`);
    if (state.dmEventRows.length > 24) state.dmEventRows.shift();
    renderDmEventLog();
  }

  function renderDmEventLog() {
    const box = el("friendDmEventLog");
    if (!box) return;
    if (!state.dmEventRows.length) {
      box.textContent = "受信ログはここに表示されます。";
      return;
    }
    box.textContent = state.dmEventRows.join("\n");
    box.scrollTop = box.scrollHeight;
  }

  function closeDirectMessagePanel() {
    selectFriend(null);
  }

  function renderIncomingRequests(list) {
    const wrap = el("friendIncomingRequests");
    if (!wrap) return;
    if (!list || list.length === 0) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = "";
    list.sort((a, b) => (b.ts || 0) - (a.ts || 0)).forEach((req) => {
      const row = document.createElement("div");
      row.className = "friend-req-row";
      row.innerHTML = `
        <span class="friend-req-text">${req.from} からフレンド申請</span>
        <button type="button" class="friend-mini-btn" data-act="accept">承諾</button>
        <button type="button" class="friend-mini-btn danger" data-act="reject">拒否</button>
      `;
      row.querySelector('[data-act="accept"]').addEventListener("click", async () => {
        await firebaseClient.acceptFriendRequest(req.from);
        try {
          const snap = await firebaseClient.db.ref(`roomInvites/${state.myName}`).once("value");
          if (snap.exists()) {
            const invites = [];
            snap.forEach((child) => invites.push({ id: child.key, ...(child.val() || {}) }));
            const pendingFromSameUser = invites
              .filter((inv) => inv.from === req.from && inv.status === "pending")
              .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
            if (pendingFromSameUser?.roomName) {
              await firebaseClient.respondRoomInvite(pendingFromSameUser.id, "accepted");
              localStorage.setItem("pendingInviteRoom", pendingFromSameUser.roomName || "");
              location.href = "matchSetup.html";
            }
          }
        } catch (e) {
          console.warn("check invite after friend accept failed", e);
        }
      });
      row.querySelector('[data-act="reject"]').addEventListener("click", async () => {
        await firebaseClient.rejectFriendRequest(req.from);
      });
      wrap.appendChild(row);
    });
  }

  function renderInviteModal(invite) {
    const modal = el("roomInviteModal");
    if (!modal) return;
    if (!invite) {
      modal.classList.add("hidden");
      return;
    }
    el("roomInviteText").textContent = `${invite.from} からルーム「${invite.roomName}」への招待が届いています。`;
    modal.classList.remove("hidden");
    el("roomInviteAcceptBtn").onclick = async () => {
      await firebaseClient.respondRoomInvite(invite.id, "accepted");
      localStorage.setItem("pendingInviteRoom", invite.roomName || "");
      location.href = "matchSetup.html";
    };
    el("roomInviteRejectBtn").onclick = async () => {
      await firebaseClient.respondRoomInvite(invite.id, "rejected");
      modal.classList.add("hidden");
    };
  }

  function teardownSocialWatchers() {
    if (state.chatUnsub) state.chatUnsub();
    stopDirectChatPolling();
    if (state.friendListUnsub) state.friendListUnsub();
    if (state.friendReqUnsub) state.friendReqUnsub();
    if (state.friendStatusUnsub) state.friendStatusUnsub();
    if (state.roomInviteUnsub) state.roomInviteUnsub();
  }

  window.initFriendUI = initFriendUI;
  window.bindFirebaseSocialWatchers = bindFirebaseSocialWatchers;
  window.teardownSocialWatchers = teardownSocialWatchers;
})();
