(function () {
  const BASE_WIDTH = 1920;
  const BASE_HEIGHT = 1080;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function applyResponsiveScale() {
    const vw = window.innerWidth || document.documentElement.clientWidth || BASE_WIDTH;
    const vh = window.innerHeight || document.documentElement.clientHeight || BASE_HEIGHT;
    const fit = Math.min(vw / BASE_WIDTH, vh / BASE_HEIGHT);
    const isPortrait = vh > vw;

    let uiScale = clamp(fit, 0.56, 1.0);
    let hudScale = clamp(fit * 1.02, 0.56, 1.0);
    let windowScale = clamp(fit * 1.05, 0.62, 1.0);
    let imageScale = clamp(fit * 1.08, 0.60, 1.0);
    let titleScale = clamp(fit * 1.15, 0.54, 1.0);

    if (isPortrait) {
      uiScale = clamp(uiScale * 0.92, 0.54, 1.0);
      hudScale = clamp(hudScale * 0.90, 0.54, 1.0);
      windowScale = clamp(windowScale * 0.94, 0.58, 1.0);
      imageScale = clamp(imageScale * 0.86, 0.50, 1.0);
      titleScale = clamp(titleScale * 0.78, 0.42, 1.0);
    }

    const root = document.documentElement;
    root.style.setProperty("--ui-scale", uiScale.toFixed(4));
    root.style.setProperty("--hud-scale", hudScale.toFixed(4));
    root.style.setProperty("--window-scale", windowScale.toFixed(4));
    root.style.setProperty("--image-scale", imageScale.toFixed(4));
    root.style.setProperty("--title-scale", titleScale.toFixed(4));
    root.style.setProperty("--deck-scale", clamp(uiScale * (isPortrait ? 0.88 : 0.96), 0.62, 1.0).toFixed(4));
    root.classList.toggle("is-mobile-viewport", isPortrait || vw < 980);
  }

  window.applyResponsiveScale = applyResponsiveScale;
  window.addEventListener("resize", applyResponsiveScale, { passive: true });
  window.addEventListener("orientationchange", applyResponsiveScale, { passive: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyResponsiveScale, { once: true });
  } else {
    applyResponsiveScale();
  }
})();
