(function () {
  const state = {
    open: false,
    friends: [],
    friendStatus: {},
    selectedFriend: null,
    chatUnsub: null,
    friendListUnsub: null,
    friendReqUnsub: null,
    friendStatusUnsub: null,
    roomInviteUnsub: null,
    myName: localStorage.getItem("username") || "Player"
  };

  function el(id) { return document.getElementById(id); }

  function initFriendUI() {
    const toggle = el("friendToggleBtn");
    const addBtn = el("friendAddBtn");
    const closeAdd = el("friendAddCancelBtn");
    const searchBtn = el("friendSearchBtn");
    const sendReqBtn = el("friendRequestSendBtn");
    const dmSendBtn = el("friendDmSendBtn");
    const dmInput = el("friendDmInput");

    if (toggle) {
      toggle.addEventListener("click", () => {
        state.open = !state.open;
        el("friendPanel").classList.toggle("hidden", !state.open);
        toggle.textContent = state.open ? "フレンド ▲" : "フレンド ▼";
      });
    }
    if (addBtn) addBtn.addEventListener("click", openFriendAddModal);
    if (closeAdd) closeAdd.addEventListener("click", closeFriendAddModal);
    if (searchBtn) searchBtn.addEventListener("click", searchFriendByName);
    if (sendReqBtn) sendReqBtn.addEventListener("click", sendFriendRequestFromModal);

    if (dmSendBtn) dmSendBtn.addEventListener("click", sendDirectMessage);
    if (dmInput) {
      dmInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendDirectMessage();
      });
    }

    const searchInput = el("friendSearchInput");
    if (searchInput) {
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
    el("friendSearchResult").innerHTML = "<div class='friend-modal-empty'>フレンド名を入力してください。</div>";
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
      resultEl.innerHTML = "<div class='friend-modal-empty'>フレンド名を入力してください。</div>";
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
      renderDirectChat([]);
      return;
    }

    panel.classList.remove("hidden");
    title.textContent = name;

    if (state.chatUnsub) state.chatUnsub();
    state.chatUnsub = firebaseClient.watchDirectChat(name, (rows) => renderDirectChat(rows));
  }

  function renderDirectChat(rows) {
    const log = el("friendDmLog");
    if (!log) return;
    log.innerHTML = "";
    (rows || []).forEach((row) => {
      const line = document.createElement("div");
      line.className = `friend-dm-line ${row.from === state.myName ? "mine" : "other"}`;
      if (row.color) line.style.color = row.color;
      const time = row.ts ? new Date(row.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--";
      line.textContent = `[${time}] ${row.from}: ${row.text || ""}`;
      log.appendChild(line);
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
    try {
      await firebaseClient.sendDirectChat(state.selectedFriend, text, color);
    } catch (e) {
      console.error("direct chat send failed", e);
      if (window.showErrorMessage) showErrorMessage("メッセージ送信に失敗しました。");
    }
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
    if (state.friendListUnsub) state.friendListUnsub();
    if (state.friendReqUnsub) state.friendReqUnsub();
    if (state.friendStatusUnsub) state.friendStatusUnsub();
    if (state.roomInviteUnsub) state.roomInviteUnsub();
  }

  window.initFriendUI = initFriendUI;
  window.bindFirebaseSocialWatchers = bindFirebaseSocialWatchers;
  window.teardownSocialWatchers = teardownSocialWatchers;
})();
