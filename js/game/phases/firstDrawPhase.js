
function updateFirstDrawPhaseUI() {
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
          <div class="firstDrawPickPreviewCaption">直近にタップしたカード</div>
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
  if (candidates.length < pickN) {
    messageEl.textContent = `山札から${pickN}枚が配置されるまでお待ちください…`;
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

    const clone = card.cloneNode(true);
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
      if (previewHost) {
        previewHost.innerHTML = "";
        const snap = useCandidates[index];
        if (snap) {
          const pv = snap.cloneNode(true);
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

    // Mark unchosen cards for later removal when both players are ready
    unchosen.forEach((card) => {
      card.dataset.firstDrawUnchosenMarked = "true";
      card.style.opacity = "0.5";
    });

    // Don't remove unchosen cards yet - keep them visible until both players finish selection
    // They will be cleaned up when phase transitions to "playing"
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
      const lbl = card.querySelector(".cardVisibilityLabel");
      if (lbl) lbl.textContent = "自分のみ";
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

  overlay.dataset.cardsBound = "1";
}