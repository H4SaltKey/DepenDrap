/**
 * Messaging System - In-game UI feedback without browser alerts
 * Replaces window.alert() with context-appropriate UI messaging
 */

// ===== TOAST NOTIFICATIONS (temporary bottom messages) =====
/**
 * Show a temporary notification at the bottom of the screen
 * @param {string} text - Message text
 * @param {string} type - 'info' (white), 'error' (red), 'success' (green), 'warning' (yellow)
 */
function showMessageToast(text, type = 'info') {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.warn("Toast element not found, falling back to console:", text);
    console.log(text);
    return;
  }

  // Set color based on type
  const colors = {
    'info': '#e0d0a0',
    'error': '#ff6b6b',
    'success': '#00ff99',
    'warning': '#ffb347'
  };

  toast.innerText = text;
  toast.style.color = colors[type] || colors['info'];
  toast.classList.remove("hidden", "fadeOut");
  
  // Auto-hide after 1.2s + 0.5s fade = 1.7s total
  setTimeout(() => toast.classList.add("fadeOut"), 1200);
  setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("fadeOut");
  }, 1700);
}

// ===== GAMEPLAY NOTIFICATIONS (center screen, blocking attention) =====
/**
 * Show an important gameplay notification (centered, large)
 * @param {string} text - Message text
 * @param {string} color - Hex color code
 */
function showGameplayMessage(text, color = "#e0d0a0") {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
    z-index: 9999; pointer-events: none; text-align: center;
    font-family: 'Outfit', sans-serif; white-space: nowrap;
  `;
  div.innerHTML = `
    <h2 style="
      font-size: 48px; font-weight: 900; color: ${color}; margin: 0;
      letter-spacing: 10px; text-transform: uppercase;
      animation: notifyIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards,
                 notifyOut 0.5s 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      text-shadow: 0 0 20px ${color}66;
    ">${text}</h2>
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
}

// ===== ERROR MESSAGES (red toast with error styling) =====
/**
 * Show an error message
 * @param {string} text - Error message text
 */
function showErrorMessage(text) {
  showMessageToast(text, 'error');
  console.error("[Game Error]", text);
}

// ===== WARNING MESSAGES (yellow toast) =====
/**
 * Show a warning message
 * @param {string} text - Warning message text
 */
function showWarningMessage(text) {
  showMessageToast(text, 'warning');
  console.warn("[Game Warning]", text);
}

// ===== SUCCESS MESSAGES (green toast) =====
/**
 * Show a success message
 * @param {string} text - Success message text
 */
function showSuccessMessage(text) {
  showMessageToast(text, 'success');
}

// ===== INFO MESSAGES (standard toast) =====
/**
 * Show an info message
 * @param {string} text - Info message text
 */
function showInfoMessage(text) {
  showMessageToast(text, 'info');
}

// ===== TOOLTIP/HOVER SYSTEM =====
/**
 * Show a tooltip on hover
 * @param {HTMLElement} element - Element to attach tooltip to
 * @param {string} text - Tooltip text
 * @param {string} position - 'top', 'bottom', 'left', 'right'
 */
function attachTooltip(element, text, position = 'top') {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerText = text;
  tooltip.style.cssText = `
    position: absolute;
    background: rgba(20,18,32,0.95);
    color: #e0d0a0;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #c7b377;
    font-size: 12px;
    white-space: nowrap;
    z-index: 10000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  `;

  element.parentElement.style.position = 'relative';
  element.parentElement.appendChild(tooltip);

  // Position tooltip
  const positionStyles = {
    'top': 'bottom: 100%; left: 50%; transform: translateX(-50%) translateY(-8px);',
    'bottom': 'top: 100%; left: 50%; transform: translateX(-50%) translateY(8px);',
    'left': 'right: 100%; top: 50%; transform: translateY(-50%) translateX(-8px);',
    'right': 'left: 100%; top: 50%; transform: translateY(-50%) translateX(8px);'
  };
  tooltip.style.cssText += positionStyles[position];

  element.addEventListener('mouseenter', () => {
    tooltip.style.opacity = '1';
  });

  element.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });
}

// ===== FALLBACK: Log to console if no UI available =====
/**
 * Fallback message function (used if DOM elements are unavailable)
 * @param {string} text - Message text
 */
function showFallbackMessage(text) {
  console.log("[Message]", text);
}

// ===== BACKWARDS COMPATIBILITY =====
// Make functions available globally for easy migration
window.showMessageToast = showMessageToast;
window.showGameplayMessage = showGameplayMessage;
window.showErrorMessage = showErrorMessage;
window.showWarningMessage = showWarningMessage;
window.showSuccessMessage = showSuccessMessage;
window.showInfoMessage = showInfoMessage;
window.attachTooltip = attachTooltip;
