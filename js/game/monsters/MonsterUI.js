/**
 * MonsterUI.js
 * モンスター表示UI・ターゲット選択UI
 * 既存UIを一切変更しない（独立したオーバーレイとして追加）
 */

window.MonsterUI = (function() {

  // ===== スタイル注入 =====
  function _injectStyle() {
    if (document.getElementById("monsterUIStyle")) return;
    const s = document.createElement("style");
    s.id = "monsterUIStyle";
    s.textContent = `
      /* ── モンスターパネル（画面下部中央） ── */
      #monsterPanel { display: none !important; }

      .monsterSlot {
        width: 90px;
        background: rgba(10, 8, 20, 0.88);
        border: 1px solid rgba(199, 179, 119, 0.25);
        border-radius: 10px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        box-sizing: border-box;
        backdrop-filter: blur(6px);
      }

      .monsterSlot:hover {
        border-color: rgba(199, 179, 119, 0.7);
        transform: translateY(-2px);
      }

      /* 現在ターゲット中のモンスター */
      .monsterSlot.targeted {
        border-color: #f0d080;
        box-shadow: 0 0 12px rgba(240, 208, 128, 0.5);
        background: rgba(20, 16, 35, 0.95);
      }

      /* 討伐済みスロット */
      .monsterSlot.defeated {
        opacity: 0.35;
        cursor: default;
        pointer-events: none;
      }

      .monsterSlotEmoji {
        font-size: 28px;
        line-height: 1;
      }

      .monsterSlotName {
        font-size: 9px;
        color: #c7b377;
        text-align: center;
        font-weight: 600;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      .monsterHpBar {
        width: 100%;
        height: 5px;
        background: rgba(255,255,255,0.1);
        border-radius: 999px;
        overflow: hidden;
      }

      .monsterHpFill {
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #e24a4a, #f07070);
        transition: width 0.3s ease;
      }

      .monsterHpText {
        font-size: 9px;
        color: #aaa;
        text-align: center;
      }

      .monsterInitBadge {
        font-size: 8px;
        padding: 1px 5px;
        border-radius: 4px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }

      .monsterInitBadge.first {
        background: rgba(224, 74, 74, 0.3);
        color: #f07070;
        border: 1px solid rgba(224, 74, 74, 0.4);
      }

      .monsterInitBadge.last {
        background: rgba(47, 128, 237, 0.3);
        color: #74b9ff;
        border: 1px solid rgba(47, 128, 237, 0.4);
      }

      .monsterTraitBadge {
        font-size: 8px;
        color: #c89b3c;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }

      /* ラストヒット圏内インジケータ */
      .monsterLastHitIndicator {
        font-size: 8px;
        color: #00ffcc;
        font-weight: 700;
        animation: pulse 1s infinite;
      }

      /* ── ターゲット選択UI ── */
      #targetSelectPanel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 20000;
        background: rgba(10, 8, 20, 0.97);
        border: 1px solid rgba(199, 179, 119, 0.5);
        border-radius: 16px;
        padding: 24px;
        width: min(480px, 90vw);
        font-family: 'Outfit', sans-serif;
        box-shadow: 0 24px 64px rgba(0,0,0,0.8);
        backdrop-filter: blur(12px);
      }

      #targetSelectPanel h3 {
        margin: 0 0 16px;
        font-size: 16px;
        color: #f0d080;
        text-align: center;
        letter-spacing: 1px;
      }

      .targetOption {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        cursor: pointer;
        margin-bottom: 8px;
        transition: background 0.15s, border-color 0.15s;
        color: #e0d0a0;
      }

      .targetOption:hover {
        background: rgba(199, 179, 119, 0.1);
        border-color: rgba(199, 179, 119, 0.4);
      }

      .targetOption.pvp {
        border-color: rgba(224, 74, 74, 0.3);
      }

      .targetOption.pvp:hover {
        background: rgba(224, 74, 74, 0.1);
        border-color: rgba(224, 74, 74, 0.6);
      }

      .targetOptionEmoji { font-size: 24px; }
      .targetOptionLabel { font-size: 14px; font-weight: 600; }
      .targetOptionSub { font-size: 11px; color: #888; margin-top: 2px; }

      #targetSelectCancel {
        width: 100%;
        margin-top: 8px;
        padding: 8px;
        background: none;
        border: 1px solid rgba(255,255,255,0.15);
        color: #888;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.15s;
      }

      #targetSelectCancel:hover {
        background: rgba(255,255,255,0.05);
      }

      /* ── PvE中の危険表示 ── */
      .pveDangerBadge {
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 4500;
        background: rgba(224, 74, 74, 0.2);
        border: 1px solid rgba(224, 74, 74, 0.5);
        color: #f07070;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 14px;
        border-radius: 999px;
        letter-spacing: 1px;
        pointer-events: none;
        animation: pulse 2s infinite;
      }
    `;
    document.head.appendChild(s);
  }

  // ===== モンスターパネル描画 =====
  function render() {
    _injectStyle();

    // playing フェーズ以外は非表示
    const status = window.state?.matchData?.status;
    if (status !== "playing") {
      const panel = document.getElementById("monsterPanel");
      if (panel) panel.style.display = "none";
      return;
    }

    let panel = document.getElementById("monsterPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "monsterPanel";
      document.body.appendChild(panel);
    }
    panel.innerHTML = "";

    const me = window.myRole || "player1";
    const myTarget = window.BattleTargetSystem?.getTarget(me);
    const canChange = window.BattleTargetSystem?.canChangeTarget(me);

    const slots = window.MonsterManager?.getAllSlots() || [];

    slots.forEach((slot, i) => {
      const el = document.createElement("div");
      el.className = "monsterSlot";

      if (!slot) {
        // 討伐済み
        el.classList.add("defeated");
        el.innerHTML = `
          <div class="monsterSlotEmoji">💀</div>
          <div class="monsterSlotName">討伐済み</div>
        `;
        panel.appendChild(el);
        return;
      }

      const def = (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId);
      const hpPct = Math.max(0, Math.min(100, (slot.currentHp / slot.maxHp) * 100));
      const isTargeted = myTarget !== "player" && myTarget?.slotIndex === i;
      const isLastHit = slot.currentHp <= (def?.atk || 1) * 2; // ラストヒット圏内判定

      if (isTargeted) el.classList.add("targeted");

      const initClass = def?.initiative === "先攻" ? "first" : "last";
      const initLabel = def?.initiative || "後攻";
      const traitNames = (def?.traits || []).map(t => t.label).join(" / ");

      el.innerHTML = `
        <div class="monsterSlotEmoji">${def?.emoji || "👾"}</div>
        <div class="monsterSlotName">${def?.name || slot.monsterId}</div>
        <div class="monsterHpBar">
          <div class="monsterHpFill" style="width:${hpPct}%"></div>
        </div>
        <div class="monsterHpText">${slot.currentHp}/${slot.maxHp}</div>
        <div class="monsterInitBadge ${initClass}">${initLabel}</div>
        ${traitNames ? `<div class="monsterTraitBadge">${traitNames}</div>` : ""}
        ${isLastHit ? `<div class="monsterLastHitIndicator">⚡ラストヒット圏</div>` : ""}
      `;

      // クリックでターゲット選択
      el.addEventListener("click", () => {
        if (canChange) {
          window.BattleTargetSystem?.setTarget(me, { slotIndex: i });
          render();
          _syncTargetToFirebase();
        } else {
          _showTargetSelectPanel();
        }
      });

      // 右クリックでダメージ選択メニュー
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openMonsterMenu === "function") {
          window.openMonsterMenu(slot, i, e.clientX, e.clientY);
        }
      });

      panel.appendChild(el);
    });

    // PvE中の危険表示
    _updateDangerBadge(me);
    _renderMonsterBattlefield(slots);
  }

  function _renderMonsterBattlefield(slots) {
    // メインフィールド内のモンスター戦闘レイヤーに情報を送信
    // 右側の独立フィールドは削除
    const myKey = window.myRole || "player1";
    const target = window.BattleTargetSystem?.getTarget?.(myKey) || "player";
    const targetSlot = (target && target !== "player") ? slots[target.slotIndex] : null;
    
    // monsterBattleUI.js の updateMonsterBattleDisplay に情報を提供
    if (targetSlot && target !== "player") {
      window._currentMonsterTarget = {
        slot: targetSlot,
        slotIndex: target.slotIndex,
        definition: (window.MONSTER_DEFINITIONS || []).find(m => m.id === targetSlot.monsterId)
      };
    } else {
      window._currentMonsterTarget = null;
    }
    
    // UI更新をトリガー
    if (typeof window.updateMonsterBattleDisplay === "function") {
      window.updateMonsterBattleDisplay();
    }
  }

  // ===== PvE中危険表示 =====
  function _updateDangerBadge(me) {
    let existing = document.getElementById("pveDangerBadge");
    const op = me === "player1" ? "player2" : "player1";
    const opIsPvP = window.BattleTargetSystem?.isPvP(op);
    const meIsPvE = window.BattleTargetSystem?.isPvE(me);

    if (meIsPvE && opIsPvP) {
      if (!existing) {
        existing = document.createElement("div");
        existing.id = "pveDangerBadge";
        existing.className = "pveDangerBadge";
        existing.textContent = "⚠ PvE中 — 相手から攻撃される可能性があります";
        document.body.appendChild(existing);
      }
      const targetBadge = document.getElementById("currentTargetBadge");
      if (targetBadge) {
        const r = targetBadge.getBoundingClientRect();
        existing.style.left = "50%";
        existing.style.transform = "translateX(-50%)";
        existing.style.top = `${Math.round(r.bottom + 6)}px`;
      }
    } else {
      if (existing) existing.remove();
    }
  }

  // ===== ターゲット選択パネル =====
  function _showTargetSelectPanel() {
    if (document.getElementById("targetSelectPanel")) return;

    const me = window.myRole || "player1";
    const slots = window.MonsterManager?.getAllSlots() || [];

    const panel = document.createElement("div");
    panel.id = "targetSelectPanel";

    const prev = window.BattleTargetSystem?.getTarget(me) || "player";
    const prevLabel = prev === "player"
      ? "相手プレイヤー"
      : `モンスター ${Number(prev?.slotIndex) + 1}`;
    let optionsHtml = `
      <div class="targetOption pvp" data-target="player">
        <div class="targetOptionEmoji">⚔️</div>
        <div>
          <div class="targetOptionLabel">相手プレイヤーを攻撃</div>
          <div class="targetOptionSub">PvP — 通常の対戦</div>
        </div>
      </div>
    `;

    slots.forEach((slot, i) => {
      if (!slot) return;
      const def = (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId);
      const hpPct = Math.round((slot.currentHp / slot.maxHp) * 100);
      optionsHtml += `
        <div class="targetOption" data-target="monster" data-slot="${i}">
          <div class="targetOptionEmoji">${def?.emoji || "👾"}</div>
          <div>
            <div class="targetOptionLabel">${def?.name || slot.monsterId}</div>
            <div class="targetOptionSub">HP: ${slot.currentHp}/${slot.maxHp} (${hpPct}%) | ${def?.initiative || "後攻"} | EXP+${def?.expReward || 1}</div>
          </div>
        </div>
      `;
    });

    panel.innerHTML = `
      <h3>攻撃対象を選択</h3>
      <p style="font-size:12px;color:#888;text-align:center;margin:0 0 12px;">ターン開始時のみ変更できます</p>
      <p style="font-size:12px;color:#b9ad83;text-align:center;margin:0 0 12px;">直前のターゲット: ${prevLabel}</p>
      ${optionsHtml}
      <button id="targetSelectCancel">キャンセル</button>
    `;

    document.body.appendChild(panel);

    // イベント
    panel.querySelectorAll(".targetOption").forEach(opt => {
      opt.addEventListener("click", () => {
        const targetType = opt.dataset.target;
        if (targetType === "player") {
          window.BattleTargetSystem?.setTarget(me, "player");
        } else {
          const slotIndex = parseInt(opt.dataset.slot, 10);
          window.BattleTargetSystem?.setTarget(me, { slotIndex });
        }
        if (typeof window.centerField === "function") {
          window.centerField();
          setTimeout(() => window.centerField(), 80);
        }
        panel.remove();
        // monsterPanel を非表示に戻す
        const mp = document.getElementById("monsterPanel");
        if (mp) mp.style.display = "none";
        render();
        _syncTargetToFirebase();
      });
    });

    document.getElementById("targetSelectCancel").addEventListener("click", () => {
      panel.remove();
      // monsterPanel を非表示に戻す
      const mp = document.getElementById("monsterPanel");
      if (mp) mp.style.display = "none";
    });
  }

  // ===== Firebase同期 =====
  function _syncTargetToFirebase() {
    const gameRoom = localStorage.getItem("gameRoom");
    if (!gameRoom || !window.firebaseClient?.db) return;
    const data = window.BattleTargetSystem?.serialize() || {};
    window.firebaseClient.db.ref(`rooms/${gameRoom}/pvpve/targets`).set(data).catch(() => {});
  }

  // ===== ターゲット変更ボタン（ターン開始時に表示） =====
  function showTargetChangeButton(forceByDefeat = false) {
    if (document.getElementById("targetChangeBtn")) return;

    const me = window.myRole || "player1";
    const canByTurn = !!window.BattleTargetSystem?.canChangeTarget(me);
    const canByDefeat = !!window.BattleTargetSystem?.canImmediateRetarget?.(me);
    if (!forceByDefeat && !canByDefeat) return;
    if (!canByTurn && !canByDefeat) return;

    const btn = document.createElement("button");
    btn.id = "targetChangeBtn";
    btn.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 4100;
      background: rgba(14, 12, 28, 0.9);
      border: 1px solid rgba(199, 179, 119, 0.5);
      color: #f0d080;
      border-radius: 8px;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.5px;
      backdrop-filter: blur(8px);
      font-family: 'Outfit', sans-serif;
    `;
    btn.textContent = "🎯 攻撃対象を変更";
    btn.addEventListener("click", () => {
      _showTargetSelectPanel();
      btn.remove();
    });
    document.body.appendChild(btn);
  }

  function hideTargetChangeButton() {
    const btn = document.getElementById("targetChangeBtn");
    if (btn) btn.remove();
  }

  // ===== 現在のターゲット表示バッジ =====
  function renderTargetBadge() {
    const me = window.myRole || "player1";
    const target = window.BattleTargetSystem?.getTarget(me);
    const status = window.state?.matchData?.status;

    let badge = document.getElementById("currentTargetBadge");

    if (status !== "playing") {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("div");
      badge.id = "currentTargetBadge";
      badge.style.cssText = `
        position: fixed;
        top: 58px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 5040;
        font-size: 11px;
        color: #a09070;
        pointer-events: none;
        font-family: 'Outfit', sans-serif;
        white-space: nowrap;
        background: rgba(10,8,20,0.7);
        padding: 3px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
      `;
      document.body.appendChild(badge);
    }

    if (!target || target === "player") {
      badge.textContent = "🎯 対象: 相手プレイヤー";
    } else {
      const slot = window.MonsterManager?.getSlot(target.slotIndex);
      const def = slot ? (window.MONSTER_DEFINITIONS || []).find(m => m.id === slot.monsterId) : null;
      badge.textContent = `🎯 対象: ${def?.emoji || "👾"} ${def?.name || "モンスター"}`;
    }
  }

  // ===== 公開API =====
  return {
    render,
    renderTargetBadge,
    showTargetChangeButton,
    hideTargetChangeButton,
    _showTargetSelectPanel  // ターゲットボタンから呼べるよう公開
  };

})();
