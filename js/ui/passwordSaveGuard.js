(function () {
  const TEXTLIKE_TYPES = new Set(["text", "search", "email", "url", "tel", "number", "password"]);
  const SKIP_TYPES = new Set(["hidden", "button", "submit", "reset", "checkbox", "radio", "range", "file", "color", "date", "datetime-local", "month", "time", "week"]);

  function isLoginInput(el) {
    if (!el) return false;
    if (el.id === "nickname" || el.id === "password") return true;
    const name = String(el.getAttribute("name") || "").toLowerCase();
    return name === "username" || name === "password";
  }

  function hardenInput(el) {
    if (!(el instanceof HTMLInputElement)) return;
    const type = String(el.type || "text").toLowerCase();
    if (SKIP_TYPES.has(type)) return;
    if (!TEXTLIKE_TYPES.has(type)) return;
    if (isLoginInput(el)) return;

    if (type === "password") {
      el.setAttribute("autocomplete", "new-password");
    } else {
      el.setAttribute("autocomplete", "off");
    }
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("data-lpignore", "true");
    el.setAttribute("data-1p-ignore", "true");
  }

  function hardenRoot(root) {
    if (!root) return;
    if (root instanceof HTMLInputElement) {
      hardenInput(root);
      return;
    }
    if (!(root instanceof Element) && root !== document) return;
    const list = root.querySelectorAll ? root.querySelectorAll("input") : [];
    list.forEach(hardenInput);
  }

  function startGuard() {
    hardenRoot(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          hardenRoot(node);
        });
      });
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startGuard, { once: true });
  } else {
    startGuard();
  }
})();

