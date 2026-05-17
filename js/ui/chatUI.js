/**
 * chatUI.js
 * チャットログの更新やイベント設定
 */

window.updateGameLogs = function(logs) {
  const chatLogs = document.getElementById("chatLogs");
  if (!chatLogs || !Array.isArray(logs)) return;

  const existingCount = chatLogs.querySelectorAll(".log-entry").length;
  if (logs.length !== existingCount) {
    chatLogs.innerHTML = "";
    const uniqueLogs = [...new Set(logs)];
    uniqueLogs.forEach(msg => {
      const div = document.createElement("div");
      div.classList.add("log-entry");

      const match = msg.match(/^(\[[^\]]+\])\s*(.*)$/);
      if (match) {
        const ts = document.createElement("span");
        ts.classList.add("log-ts");
        ts.textContent = match[1];
        div.appendChild(ts);
        
        let contentText = match[2];
        const chatMatch = contentText.match(/^\[CHAT:([^\]]+)\]\s*(.*)$/);

        if (contentText.startsWith("[システム]")) {
           div.classList.add("log-system");
        } else if (contentText.match(/^\[(EXP|HP|PP|DICE|RESULT|DEFEAT|EVOLUTION|MATCH|TURN|ZONE)\]/)) {
           div.classList.add("log-stat");
        } else if (chatMatch) {
           div.classList.add("log-chat");
           div.style.color = chatMatch[1];
           contentText = chatMatch[2];
        } else if (contentText.includes(": ")) {
           div.classList.add("log-chat");
           div.style.color = "#ffffff";
        }
        
        div.appendChild(document.createTextNode(" " + contentText));
      } else {
        div.textContent = msg;
      }
      chatLogs.appendChild(div);
    });
    chatLogs.scrollTop = chatLogs.scrollHeight;
  }
};

window.checkAndLogStateChanges = function(oldState, newState) {
  const oldLogs = oldState.logs || [];
  const newLogs = newState.logs || [];
  if (newLogs.length > 0 && newLogs.length !== oldLogs.length) {
    const latest = newLogs[newLogs.length - 1];
    if (latest.includes("[PROTOCOL:RESET]")) {
      const initiator = latest.match(/\[PROTOCOL:RESET\] (.*?) が/);
      if (initiator && initiator[1] !== (window.myUsername || state[window.myRole || "player1"]?.username || window.myRole)) {
        console.log("Remote Reset Detected. Re-initializing local deck...");
        if (typeof initDeckFromCode === "function") initDeckFromCode();
        if (typeof shuffleDeck === "function") shuffleDeck();
        if (typeof createDeckObject === "function") createDeckObject(true);
      }
    }
  }

  ["player1", "player2"].forEach(owner => {
    if (!oldState[owner] || !newState[owner]) return;
    
    const s1 = oldState[owner];
    const s2 = newState[owner];
    const name = s2.username || (owner === "player1" ? "プレイヤー1" : "プレイヤー2");

    if (s1.level < s2.level) {
      if (typeof addGameLog === "function") addGameLog(`${name} レベルアップ!!!【レベル:${s2.level}】`);
    }
  });
};

window.handleChatSend = function() {
  const input = document.getElementById("chatInput");
  const val = input.value.trim();
  if (!val) return;
  const color = localStorage.getItem("chatColor") || "#ffffff";
  if (typeof addGameLog === "function") {
    addGameLog(`[CHAT:${color}] \${window.myUsername || state[window.myRole || "player1"]?.username || window.myRole}: \${val}`);
  }
  input.value = "";
};

window.setupChatUI = function() {
  const inputRow = document.getElementById("chatInputRow");
  if (!inputRow || document.getElementById("chatColorBtn")) return;

  const pickerHTML = `
    <div class="chatColorContainer" style="position:relative; display:flex; align-items:center;">
      <button type="button" id="chatColorBtn" title="文字色変更" style="width: 32px; height: 32px; background: transparent; border: none; border-right: 1px solid rgba(199,179,119,0.2); font-size: 16px; cursor: pointer; padding:0; display:flex; align-items:center; justify-content:center;">🎨</button>
      <div id="chatColorPalette" style="display:none; position:absolute; bottom:100%; left:0; width:140px; background:rgba(10,8,20,0.95); border:1px solid #c89b3c; border-radius:4px; padding:6px; flex-wrap:wrap; gap:6px; z-index:10000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
         \${["#ffffff", "#ff9999", "#99ff99", "#9999ff", "#ffff99", "#ff99ff", "#99ffff", "#ffcc99", "#cc99ff", "#e0d0a0", "#cccccc", "#ff66b2"].map(c => `<div class="chat-color-opt" style="width:20px; height:20px; background:\${c}; border-radius:3px; cursor:pointer; border:1px solid rgba(255,255,255,0.2);" data-color="\${c}"></div>`).join("")}
      </div>
    </div>
  `;
  inputRow.insertAdjacentHTML("afterbegin", pickerHTML);
  
  const btn = document.getElementById("chatColorBtn");
  const palette = document.getElementById("chatColorPalette");
  const savedColor = localStorage.getItem("chatColor") || "#ffffff";
  const input = document.getElementById("chatInput");
  if (input) input.style.color = savedColor;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    palette.style.display = palette.style.display === "none" ? "flex" : "none";
  });

  palette.querySelectorAll(".chat-color-opt").forEach(opt => {
    opt.addEventListener("click", (e) => {
      const c = e.target.dataset.color;
      localStorage.setItem("chatColor", c);
      if (input) input.style.color = c;
      palette.style.display = "none";
    });
  });

  document.addEventListener("click", () => palette.style.display = "none");
};

// イベントバインド用の関数を追加
window.setupChatEvents = function() {
  const chat = document.getElementById("chatArea");
  if (chat && chat.dataset.expandToggle !== "1") {
    chat.dataset.expandToggle = "1";
    chat.addEventListener("click", (e) => {
      if (e.target.closest("#chatInputRow")) return;
      if (e.target.closest("#chatInput") || e.target.closest("#chatSendBtn")) return;
      chat.classList.toggle("chat-expanded");
    });
  }

  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    let typingTimeout = null;
    let lastTypingSent = 0;
    chatInput.addEventListener("input", (e) => {
      const isTyping = chatInput.value.trim().length > 0;
      const now = Date.now();
      if (isTyping && now - lastTypingSent > 2000) {
        lastTypingSent = now;
        const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          firebaseClient.db.ref(`rooms/\${gameRoom}/typing/\${myKey}`).set(true);
        }
      }
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          firebaseClient.db.ref(`rooms/\${gameRoom}/typing/\${myKey}`).set(null);
        }
        lastTypingSent = 0;
      }, 3000);
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        if (typeof handleChatSend === "function") handleChatSend();
        if (typingTimeout) clearTimeout(typingTimeout);
        const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
        const gameRoom = localStorage.getItem("gameRoom");
        if (gameRoom && firebaseClient?.db) {
          firebaseClient.db.ref(`rooms/\${gameRoom}/typing/\${myKey}`).set(null);
        }
      }
    });
  }

  const chatBtn = document.getElementById("chatSendBtn");
  if (chatBtn) {
    chatBtn.addEventListener("click", () => {
      if (typeof handleChatSend === "function") handleChatSend();
      const myKey = window.myRole || localStorage.getItem("gamePlayerKey") || "player1";
      const gameRoom = localStorage.getItem("gameRoom");
      if (gameRoom && firebaseClient?.db) {
        firebaseClient.db.ref(`rooms/\${gameRoom}/typing/\${myKey}`).set(null);
      }
    });
  }
};
