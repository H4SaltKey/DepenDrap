/**
 * renderers.js
 * Desktop/Mobile の描画分岐を担う軽量ラッパー
 */
(function initRenderers() {
  function isMobileClient() {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 900;
  }

  function renderDesktopUI() {
    if (typeof window.organizeHands === "function") window.organizeHands();
  }

  function renderMobileUI() {
    if (typeof window.organizeHands === "function") window.organizeHands();
  }

  function renderByDevice() {
    if (isMobileClient()) renderMobileUI();
    else renderDesktopUI();
  }

  window.isMobileClient = isMobileClient;
  window.desktopRenderer = { render: renderDesktopUI };
  window.mobileRenderer = { render: renderMobileUI };
  window.renderByDevice = renderByDevice;
})();
