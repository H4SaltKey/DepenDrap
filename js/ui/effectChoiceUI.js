(function() {
  const MODAL_ID = "effectChoiceOverlay";

  function removeExistingModal() {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();
  }

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeChoices(choices) {
    if (!Array.isArray(choices)) return [];
    return choices
      .map((choice, idx) => {
        const id = String(choice?.id || `choice_${idx + 1}`);
        const label = String(choice?.label || id);
        return {
          id,
          label,
          description: String(choice?.description || ""),
          disabled: !!choice?.disabled,
          checked: !!choice?.checked,
          payload: choice?.payload
        };
      })
      .filter((choice) => !!choice.id);
  }

  function buildChoiceItem(choice, mode) {
    const type = mode === "multiple" ? "checkbox" : "radio";
    const disabled = choice.disabled ? "disabled" : "";
    const checked = choice.checked ? "checked" : "";

    return `
      <label class="effectChoiceItem ${choice.disabled ? "is-disabled" : ""}">
        <input type="${type}" name="effectChoiceInput" value="${escHtml(choice.id)}" ${disabled} ${checked}>
        <div class="effectChoiceItemBody">
          <div class="effectChoiceItemLabel">${escHtml(choice.label)}</div>
          ${choice.description ? `<div class="effectChoiceItemDesc">${escHtml(choice.description)}</div>` : ""}
        </div>
      </label>
    `;
  }

  function injectStyleOnce() {
    if (document.getElementById("effectChoiceStyle")) return;
    const style = document.createElement("style");
    style.id = "effectChoiceStyle";
    style.textContent = `
      .effectChoiceOverlay {
        position: fixed;
        inset: 0;
        z-index: 100260;
        background: rgba(5, 7, 14, 0.78);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }
      .effectChoiceModal {
        width: min(680px, 100%);
        max-height: 86vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border-radius: 14px;
        border: 1px solid rgba(207, 182, 121, 0.48);
        background: linear-gradient(180deg, rgba(18, 20, 34, 0.98), rgba(10, 12, 20, 0.98));
        box-shadow: 0 22px 46px rgba(0, 0, 0, 0.55);
        color: #f3e7c7;
        font-family: 'Outfit', sans-serif;
      }
      .effectChoiceHeader {
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .effectChoiceTitle {
        font-size: 18px;
        font-weight: 700;
        color: #f6e9c8;
      }
      .effectChoiceDesc {
        margin-top: 6px;
        font-size: 12px;
        color: #bfb494;
        line-height: 1.45;
      }
      .effectChoiceList {
        overflow: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .effectChoiceItem {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 10px;
        background: rgba(255,255,255,0.03);
        cursor: pointer;
      }
      .effectChoiceItem:hover { border-color: rgba(207, 182, 121, 0.6); }
      .effectChoiceItem.is-disabled { opacity: 0.5; cursor: not-allowed; }
      .effectChoiceItem input { margin-top: 3px; }
      .effectChoiceItemBody { min-width: 0; }
      .effectChoiceItemLabel {
        font-size: 14px;
        font-weight: 700;
        color: #f2ead2;
      }
      .effectChoiceItemDesc {
        margin-top: 4px;
        font-size: 12px;
        color: #bbb092;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .effectChoiceFooter {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding: 12px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .effectChoiceBtn {
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
        font-weight: 700;
      }
      .effectChoiceBtn.cancel {
        background: rgba(130,130,140,0.25);
        color: #e8e0cb;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .effectChoiceBtn.confirm {
        background: linear-gradient(180deg, #d1b476, #a68749);
        color: #1f1a10;
      }
      .effectChoiceHint {
        margin-right: auto;
        color: #b9ae8e;
        font-size: 12px;
        align-self: center;
      }
    `;
    document.head.appendChild(style);
  }

  function getSelection(overlay, mode) {
    const inputs = Array.from(overlay.querySelectorAll('input[name="effectChoiceInput"]'));
    const selected = inputs.filter((input) => input.checked).map((input) => input.value);
    if (mode === "single") {
      return selected.length > 0 ? [selected[0]] : [];
    }
    return selected;
  }

  function showEffectChoiceModal(options) {
    injectStyleOnce();
    removeExistingModal();

    const config = {
      title: String(options?.title || "効果を選択"),
      description: String(options?.description || "カード効果の選択肢を選んでください。"),
      mode: options?.mode === "multiple" ? "multiple" : "single",
      choices: normalizeChoices(options?.choices),
      confirmLabel: String(options?.confirmLabel || "決定"),
      cancelLabel: String(options?.cancelLabel || "キャンセル"),
      allowCancel: options?.allowCancel !== false,
      minSelect: Math.max(0, Number(options?.minSelect || (options?.mode === "multiple" ? 0 : 1))),
      maxSelect: options?.mode === "multiple" ? Number(options?.maxSelect || 999) : 1,
      closeOnBackdrop: options?.closeOnBackdrop !== false
    };

    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "effectChoiceOverlay";

    const listHtml = config.choices.map((choice) => buildChoiceItem(choice, config.mode)).join("");
    overlay.innerHTML = `
      <div class="effectChoiceModal" role="dialog" aria-modal="true" aria-label="${escHtml(config.title)}">
        <div class="effectChoiceHeader">
          <div class="effectChoiceTitle">${escHtml(config.title)}</div>
          <div class="effectChoiceDesc">${escHtml(config.description)}</div>
        </div>
        <div class="effectChoiceList">${listHtml}</div>
        <div class="effectChoiceFooter">
          <div class="effectChoiceHint" id="effectChoiceHint"></div>
          ${config.allowCancel ? `<button class="effectChoiceBtn cancel" id="effectChoiceCancelBtn">${escHtml(config.cancelLabel)}</button>` : ""}
          <button class="effectChoiceBtn confirm" id="effectChoiceConfirmBtn">${escHtml(config.confirmLabel)}</button>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      let settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        resolve(result);
      }

      function findChoiceById(id) {
        return config.choices.find((choice) => choice.id === id) || null;
      }

      function validateSelection(selectedIds) {
        if (selectedIds.length < config.minSelect) {
          return `最低 ${config.minSelect} 件選択してください`;
        }
        if (selectedIds.length > config.maxSelect) {
          return `最大 ${config.maxSelect} 件まで選択できます`;
        }
        return "";
      }

      const hint = overlay.querySelector("#effectChoiceHint");
      const confirmBtn = overlay.querySelector("#effectChoiceConfirmBtn");
      const cancelBtn = overlay.querySelector("#effectChoiceCancelBtn");

      function refreshHint() {
        const selectedIds = getSelection(overlay, config.mode);
        const err = validateSelection(selectedIds);
        if (hint) hint.textContent = err || `${selectedIds.length}件選択中`;
        if (confirmBtn) confirmBtn.disabled = !!err;
      }

      overlay.querySelectorAll('input[name="effectChoiceInput"]').forEach((input) => {
        input.addEventListener("change", () => {
          if (config.mode === "multiple") {
            const selectedIds = getSelection(overlay, config.mode);
            if (selectedIds.length > config.maxSelect) {
              input.checked = false;
            }
          }
          refreshHint();
        });
      });

      function onConfirm() {
        const selectedIds = getSelection(overlay, config.mode);
        const err = validateSelection(selectedIds);
        if (err) {
          if (hint) hint.textContent = err;
          return;
        }
        const selectedChoices = selectedIds.map(findChoiceById).filter(Boolean);
        done({
          confirmed: true,
          selectedIds,
          selectedChoices,
          selectedChoice: selectedChoices[0] || null
        });
      }

      function onCancel() {
        done({
          confirmed: false,
          selectedIds: [],
          selectedChoices: [],
          selectedChoice: null
        });
      }

      function onKeyDown(e) {
        if (e.key === "Escape" && config.allowCancel) onCancel();
        if (e.key === "Enter") onConfirm();
      }

      confirmBtn?.addEventListener("click", onConfirm);
      cancelBtn?.addEventListener("click", onCancel);

      if (config.closeOnBackdrop && config.allowCancel) {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) onCancel();
        });
      }

      document.addEventListener("keydown", onKeyDown);
      document.body.appendChild(overlay);
      refreshHint();
    });
  }

  // 下位互換: callback 形式も許可
  window.openEffectChoiceModal = function(options, onDone) {
    return showEffectChoiceModal(options).then((result) => {
      if (typeof onDone === "function") onDone(result);
      return result;
    });
  };

  window.showEffectChoiceModal = showEffectChoiceModal;
})();
