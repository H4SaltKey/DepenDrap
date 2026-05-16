window.DragManager = {
  activeDrags: new Set(),
  
  register: function(releaseCallback) {
    this.activeDrags.add(releaseCallback);
  },
  
  unregister: function(releaseCallback) {
    this.activeDrags.delete(releaseCallback);
  },
  
  releaseAll: function(e) {
    for (const cb of this.activeDrags) {
      try {
        cb(e);
      } catch (err) {
        console.error("Error in DragManager releaseAll:", err);
      }
    }
  }
};

window.addEventListener("pointerup", (e) => window.DragManager.releaseAll(e), { capture: true });
window.addEventListener("pointercancel", (e) => window.DragManager.releaseAll(e), { capture: true });
window.addEventListener("mouseup", (e) => window.DragManager.releaseAll(e), { capture: true });
window.addEventListener("blur", (e) => window.DragManager.releaseAll(e), { capture: true });
document.addEventListener("visibilitychange", (e) => {
  if (document.hidden) window.DragManager.releaseAll(e);
});
