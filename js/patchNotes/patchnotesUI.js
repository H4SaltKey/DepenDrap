/**
 * patchnotesUI.js
 * UI制御専用 (パッチノートページ用)
 */

import { PatchNotesRenderer } from './patchnotesRenderer.js';

document.addEventListener("DOMContentLoaded", () => {
  const containerId = "patchNotesContent";
  console.log(`[PatchNotesUI] Initializing render for #${containerId}`);
  PatchNotesRenderer.render(containerId);
});
