
function updateFirstDrawPhaseUI() {
  if (typeof window.traceFlow === "function") window.traceFlow("updateFirstDrawPhaseUI", "start", state?.matchData?.status);
  const m = state.matchData;
  if (m.status !== "setup_first_draw") {
    window._firstDrawPhaseStarted = false;
    window._firstDrawAdvanceSent = false;
    const overlayGone = document.getElementById("firstDrawPhaseOverlay");
    if (overlayGone) {
      delete overlayGone.dataset.shellBuilt;
      delete overlayGone.dataset.cardsBound;
      delete overlayGone.dataset.localFirstDrawLocked;
      overlayGone.remove();
    }
    return;
  }

  tryAdvanceFirstDrawToPlayingIfBothReady();
  if (state.matchData.status !== "setup_first_draw") {
    const ovEarly = document.getElementById("firstDrawPhaseOverlay");
    if (ovEarly) {
      delete ovEarly.dataset.shellBuilt;
      delete ovEarly.dataset.cardsBound;
      delete ovEarly.dataset.localFirstDrawLocked;
      ovEarly.remove();
    }
    return;
  }

  let overlay = document.getElementById("firstDrawPhaseOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "firstDrawPhaseOverlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(8, 6, 15, 0.96); z-index: 10000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(18px); flex-direction: column; color: #fff;
      transition: opacity 0.3s ease; font-family: 'Outfit', sans-serif; padding: 20px;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  if (overlay.dataset.shellBuilt !== "2") {
    overlay.innerHTML = `
    <div style="width:100%;max-width:min(100%,1100px);background:rgba(12,12,22,0.98);border:2px solid rgba(199,179,119,0.32);border-radius:16px;padding:22px;box-sizing:border-box;">
      <h2 style="font-size:26px;color:#f0d080;margin-bottom:12px;text-align:center;letter-spacing:1px;">ファーストドローフェーズ</h2>
      <p id="firstDrawPhaseSub" style="color:#ccc;font-size:14px;line-height:1.6;margin-bottom:10px;text-align:center;">
        カードをタップして選択／解除できます（丸にチェックが付きます）。<strong style="color:#f0d080;">ちょうど3枚</strong>のときだけ確定できます。残りは山札へ戻ります。
      </p>
      <p id="firstDrawPhaseProgress" style="color:#889;font-size:12px;line-height:1.5;margin-bottom:12px;text-align:center;"></p>
      <div id="firstDrawPhaseMessage" style="color:#aaa;font-size:14px;text-align:center;margin-bottom:18px;"></div>
      <div id="firstDrawPhaseMainRow" class="firstDrawPhaseMainRow">
        <div id="firstDrawPhaseLeftCol" class="firstDrawPhaseLeftCol">
          <div id="firstDrawPhaseCards" class="firstDrawPickRow"></div>
          <div style="text-align:center;">
            <button id="firstDrawPhaseConfirm" type="button" style="background:#c89b3c;color:#1a172c;border:none;border-radius:8px;padding:12px 24px;font-size:15px;cursor:pointer;max-width:100%;" disabled>準備中…</button>
          </div>
        </div>
        <div id="firstDrawPickPreviewCol" class="firstDrawPickPreviewCol">
          <div class="firstDrawPickPreviewCaption">プレビュー</div>
          <div id="firstDrawLastPickPreview" class="firstDrawLastPickPreview"></div>
        </div>
      </div>
    </div>
  `;
    overlay.dataset.shellBuilt = "2";
    delete overlay.dataset.cardsBound;
    delete overlay.dataset.localFirstDrawLocked;
  }

  startFirstDrawPhase();

  const me = window.myRole || "player1";
  const pickN = getFirstDrawRevealCount(me, m);
  const p1r = !!m.firstDrawP1Ready;
  const p2r = !!m.firstDrawP2Ready;
  const myReady = me === "player1" ? p1r : p2r;

  const messageEl = overlay.querySelector("#firstDrawPhaseMessage");
  const progressEl = overlay.querySelector("#firstDrawPhaseProgress");
  const cardArea = overlay.querySelector("#firstDrawPhaseCards");
  const confirmBtn = overlay.querySelector("#firstDrawPhaseConfirm");
  if (!messageEl || !cardArea || !confirmBtn) return;

  if (progressEl) {
    progressEl.textContent =
      "進捗: プレイヤー1 " + (p1r ? "完了" : "未完了") + "　／　プレイヤー2 " + (p2r ? "完了" : "未完了") + "（先後に関係なく同時に選択。双方完了まで待機）";
  }

  if (myReady && !(p1r && p2r)) {
    messageEl.textContent = "選択を確定しました。相手の完了を待っています…";
    confirmBtn.style.display = "none";
  } else if (!myReady) {
    messageEl.textContent = `${pickN}枚すべてタップで選択できます。チェックが付いた枚数がちょうど3枚のときだけ「確定」が押せます。`;
    confirmBtn.style.display = "inline-flex";
  } else {
    messageEl.textContent = "双方の準備が完了しました。";
    confirmBtn.style.display = "none";
  }

  if (overlay.dataset.cardsBound === "1" || myReady) return;

  const field = getFieldContent();
  if (!field) return;
  const candidates = Array.from(field.querySelectorAll(`.card:not(.deckObject)[data-owner="${me}"][data-visibility="self"]`));
  console.log(`[FirstDraw] candidates=${candidates.length}, pickN=${pickN}, cardsBound=${overlay.dataset.cardsBound}`);
  if (candidates.length < pickN) {
    messageEl.textContent = `山札から${pickN}枚が配置されるまでお待ちください…（現在${candidates.length}枚）`;
    return;
  }

  const useCandidates = candidates.slice(0, pickN);

  const selected = [];
  const syncPickUi = () => {
    confirmBtn.disabled = selected.length !== 3;
    confirmBtn.textContent =
      selected.length === 3
        ? "この3枚で確定"
        : selected.length < 3
          ? `確定するにはあと ${3 - selected.length} 枚選んでください（現在 ${selected.length}/3）`
          : `確定するには ${selected.length - 3} 枚の選択を外してください（現在 ${selected.length}/3）`;
  };

  const previewHost = overlay.querySelector("#firstDrawLastPickPreview");

  useCandidates.forEach((card, index) => {
    const outer = document.createElement("div");
    outer.className = "firstDrawCardOuter";
    outer.dataset.firstDrawIndex = String(index);

    const clone = typeof createCard === "function" ? createCard(card.dataset.id) : card.cloneNode(true);
    clone.classList.add("firstDrawCardClone");

    const ring = document.createElement("div");
    ring.className = "firstDrawCheckRing";
    ring.setAttribute("aria-hidden", "true");
    ring.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5"/></svg>';

    outer.appendChild(clone);
    outer.appendChild(ring);

    outer.addEventListener("click", () => {
      if (overlay.dataset.localFirstDrawLocked === "1") return;
      const pos = selected.indexOf(index);
      if (pos >= 0) {
        selected.splice(pos, 1);
        outer.classList.remove("firstDrawCardOuter--picked");
      } else {
        selected.push(index);
        outer.classList.add("firstDrawCardOuter--picked");
      }
      syncPickUi();
    });

    outer.addEventListener("pointerenter", () => {
      if (previewHost) {
        previewHost.innerHTML = "";
        const snap = useCandidates[index];
        if (snap) {
          const pv = typeof createCard === "function" ? createCard(snap.dataset.id) : snap.cloneNode(true);
          pv.classList.add("firstDrawCardClone", "firstDrawLastPickClone");
          const pvLbl = pv.querySelector(".cardVisibilityLabel");
          if (pvLbl) pvLbl.remove();
          previewHost.appendChild(pv);
        }
      }
    });

    cardArea.appendChild(outer);
  });
  syncPickUi();

  // カードを cardArea に追加し終えた時点で cardsBound をセットする。
  // これ以降 update() → updateFirstDrawPhaseUI() が再呼び出しされても
  // 冒頭の `if (overlay.dataset.cardsBound === "1" || myReady) return;` で早期リターンし、
  // カードが二重・無限追加されるループを防ぐ。
  overlay.dataset.cardsBound = "1";

  confirmBtn.onclick = async () => {
    if (selected.length !== 3 || overlay.dataset.localFirstDrawLocked === "1") return;
    overlay.dataset.localFirstDrawLocked = "1";
    confirmBtn.disabled = true;

    const chosen = selected.map((i) => useCandidates[i]).filter(Boolean);
    const unchosen = useCandidates.filter((_, i) => !selected.includes(i));

    const previewCol = overlay.querySelector("#firstDrawPickPreviewCol");
    if (previewCol) previewCol.style.visibility = "hidden";

    const playExit = (el) => {
      if (!el) return Promise.resolve();
      if (typeof el.animate === "function") {
        return el
          .animate(
            [
              { opacity: 1, transform: "scale(1) translateY(0)" },
              { opacity: 0, transform: "scale(0.78) translateY(14px)" },
            ],
            { duration: 400, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
          )
          .finished.catch(() => {});
      }
      return new Promise((r) => setTimeout(r, 400));
    };

    cardArea.querySelectorAll(".firstDrawCardOuter").forEach((outer) => {
      const idx = Number(outer.dataset.firstDrawIndex);
      if (selected.includes(idx)) outer.classList.add("firstDrawCardOuter--kept");
    });

    const overlayExitPromises = [];
    cardArea.querySelectorAll(".firstDrawCardOuter").forEach((outer) => {
      const idx = Number(outer.dataset.firstDrawIndex);
      if (selected.includes(idx)) return;
      overlayExitPromises.push(
        playExit(outer).then(() => {
          outer.remove();
        })
      );
    });

    // 未選択カードを山札のランダムな位置に戻す
    unchosen.forEach((card) => {
      const rawId = card.dataset.id;
      if (rawId) {
        const isTemp = card.dataset.isTemp === "true";
        const storeId = isTemp ? `TEMP:${rawId}` : rawId;
        insertCardIntoDeckAtRandom(me, storeId);
        card.dataset.firstDrawReturned = "1";
      }
      card.remove();
    });

    await Promise.all([...overlayExitPromises]);

    cardArea.classList.add("firstDrawPickRow--finalThree");

    const deckObj = field.querySelector(`.deckObject[data-owner="${me}"]`);
    const deckX = deckObj ? Number(deckObj.dataset.x) : 0;
    const deckY = deckObj ? Number(deckObj.dataset.y) : 0;
    const handSlotY =
      typeof FIELD_H !== "undefined" && typeof CARD_H !== "undefined"
        ? FIELD_H - CARD_H - 20
        : 1527;

    chosen.forEach((card, idx) => {
      card.classList.remove("firstDrawHideVisLabel");
      card.dataset.visibility = "self";
      card.classList.remove("visibilityNone");
      card.classList.add("visibilitySelf");
      if (typeof updateVisibilityIcon === "function") {
        updateVisibilityIcon(card, "self");
      }
      if (typeof applyCardFace === "function") applyCardFace(card, "self");
      const nextOrder = typeof window.nextHandOrder === "function" ? window.nextHandOrder() : Date.now() + idx;
      card.dataset.handOrder = String(nextOrder);
      card.dataset.y = String(handSlotY);
      card.dataset.x = String(40 + idx * 100);
      card.style.left = deckX + "px";
      card.style.top = deckY + "px";
    });

    if (typeof window.organizeHands === "function") window.organizeHands();

    if (typeof saveAllImmediate === "function") {
      saveAllImmediate();
    } else {
      if (typeof saveImmediate === "function") saveImmediate();
      if (typeof saveFieldCards === "function") saveFieldCards();
    }
    if (typeof updateDeckObject === "function") updateDeckObject();
    if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();

    if (typeof addGameLog === "function") {
      const playerName = window.myUsername || me;
      addGameLog(`${playerName} が 手札を3枚選び、残り${pickN - 3}枚を山札のランダムな位置に戻しました`);
    }

    await new Promise((r) => setTimeout(r, 520));
    // 待機中は選択済み3枚の表示を維持する（相手完了まで消さない）

    const gameRoom = localStorage.getItem("gameRoom");
    const readyKey = me === "player1" ? "firstDrawP1Ready" : "firstDrawP2Ready";
    if (gameRoom && firebaseClient?.db) {
      try {
        await firebaseClient.db.ref(`rooms/${gameRoom}/matchData`).update({ [readyKey]: true });
      } catch (e) {
        console.warn("[FirstDraw] ready フラグ送信エラー:", e);
      }
    }
    state.matchData[readyKey] = true;

    overlay.dataset.cardsBound = "1";
    if (gameRoom && firebaseClient?.db) {
      await firebaseClient.writeMyState(gameRoom, me, _getMyStateForSync()).catch(() => {});
    }
    update();
  };

  // cardsBound は confirmBtn.onclick 内でのみセットする（ここでは設定しない）
  // ここで設定すると、カードが配置される前にバインドがスキップされてしまう
}

/** 先攻は5枚、後攻は6枚をファーストドローで提示 */
function getFirstDrawRevealCount(me, m) {
  const fp = m && m.firstPlayer != null ? m.firstPlayer : "player1";
  return me === fp ? 5 : 6;
}

/** 山札のランダムな位置に1枚挿入（インデックス 0..deck.length のいずれか） */
function insertCardIntoDeckAtRandom(owner, storeId) {
  const d = state[owner]?.deck;
  if (!d || storeId == null || storeId === "") return;
  const idx = Math.floor(Math.random() * (d.length + 1));
  d.splice(idx, 0, storeId);
}

function startFirstDrawPhase() {
  const m = state.matchData;
  if (m.status !== "setup_first_draw" || window._firstDrawPhaseStarted) return;
  const me = window.myRole || "player1";
  const myReady = me === "player1" ? !!m.firstDrawP1Ready : !!m.firstDrawP2Ready;
  if (myReady) {
    window._firstDrawPhaseStarted = true;
    return;
  }
  window._firstDrawPhaseStarted = true;

  const deckLen = state[me]?.deck?.length ?? 0;
  console.log(`[FirstDraw] startFirstDrawPhase: me=${me}, deckLen=${deckLen}, takeOut=${typeof window.takeOut}`);

  // デッキが空またはundefinedの場合はデッキコードから再初期化
  if (deckLen <= 0) {
    console.warn("[FirstDraw] デッキが空です。initDeckFromCode() で再初期化します。");

    if (typeof initDeckFromCode === "function") {
      initDeckFromCode();
      if (typeof shuffleDeck === "function") shuffleDeck();
    }

    const deckLenAfter = state[me]?.deck?.length ?? 0;
    console.log(`[FirstDraw] 再初期化後 deckLen=${deckLenAfter}`);
    if (deckLenAfter <= 0) {
      console.error("[FirstDraw] デッキの再初期化に失敗しました。");
      // 再試行: 最大3回まで 500ms 間隔でリトライ
      window._firstDrawRetryCount = (window._firstDrawRetryCount || 0) + 1;
      if (window._firstDrawRetryCount <= 3) {
        window._firstDrawPhaseStarted = false;
        setTimeout(() => {
          if (state.matchData?.status === "setup_first_draw") {
            startFirstDrawPhase();
          }
        }, 500);
      } else {
        console.error("[FirstDraw] リトライ上限(3回)に達しました。デッキコードを確認してください。");
        window._firstDrawRetryCount = 0;
      }
      return;
    }
    // 成功したらリトライカウントをリセット
    window._firstDrawRetryCount = 0;
  }

  if (typeof window.takeOut !== "function") {
    console.error("[FirstDraw] window.takeOut が未定義です。contextMenu.js を game ページで読み込んでください。");
    return;
  }

  const n = getFirstDrawRevealCount(me, m);
  console.log(`[FirstDraw] takeOut(${n}) を呼び出します。デッキ枚数: ${state[me]?.deck?.length}`);
  window.takeOut(n, { visibility: "self", hideSelfVisibilityLabel: true });
  // takeOut() 末尾で update(true) が呼ばれるため、ここでの重複呼び出しは不要。
  // （以前は resetLastStateJson + update(true) を呼んでいたが、
  //   takeOut → update(true) → updateFirstDrawPhaseUI のループを助長していたため削除）
}

/**
 * ファーストドロー: 双方が確定したら playing へ（各クライアントから idempotent に遷移可）
 */
function tryAdvanceFirstDrawToPlayingIfBothReady() {
  if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "check", "setup_first_draw -> playing");
  const m = state.matchData;
  if (!m || m.status !== "setup_first_draw") {
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "return", "not setup_first_draw");
    return;
  }
  if (!m.firstDrawP1Ready || !m.firstDrawP2Ready) {
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "return", "both ready not satisfied");
    return;
  }
  if (window.__playingStarted) {
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "return", "playing already started");
    return;
  }
  if (window._firstDrawAdvanceSent) {
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "return", "already sent");
    return;
  }
  window.__playingStarted = true;
  window._firstDrawAdvanceSent = true;
  if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "start", "setup_first_draw -> playing");
  
  // Clean up unchosen cards marked in first draw phase
  const field = getFieldContent();
  if (field) {
    const unchosenCards = Array.from(field.querySelectorAll('[data-firstDrawUnchosenMarked="true"]'));
    unchosenCards.forEach((card) => {
      if (card.dataset.firstDrawReturned !== "1") {
        const rawId = card.dataset.id;
        if (rawId) {
          const isTemp = card.dataset.isTemp === "true";
          const storeId = isTemp ? `TEMP:${rawId}` : rawId;
          insertCardIntoDeckAtRandom(card.dataset.owner, storeId);
        }
      }
      card.remove();
    });
  }
  if (typeof pushMyStateDebounced === "function") pushMyStateDebounced();

  const gameRoom = localStorage.getItem("gameRoom");
  const next = { ...m, status: "playing", firstDrawDone: true };
  state.matchData = next;
  if (gameRoom && firebaseClient?.db) {
    firebaseClient.writeMatchData(gameRoom, next).catch((e) => {
      if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "failure", e?.message || e);
      console.warn("[FirstDraw] playing への遷移エラー:", e);
      window._firstDrawAdvanceSent = false;
    });
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "success", "writeMatchData");
  } else {
    if (typeof window.traceFlow === "function") window.traceFlow("phaseTransition", "failure", "gameRoom/firebase missing");
    window._firstDrawAdvanceSent = false;
  }
}
